import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  buildJobDestinations,
  buildJobId,
  buildJobItems,
  formatTime,
  getJobItemLabel,
  summarizeJob,
  type JobAlertRecord,
  type JobRecord,
  type ScanMode,
} from "@/lib/jobs";
import { getPORecordsByKeys, markPORecordsAssigned, markPORecordsCompleted } from "@/lib/po-registry-store";

type JobStore = {
  jobs: JobRecord[];
};

const dataDirectoryPath = path.join(process.cwd(), "data");
const dataFilePath = path.join(dataDirectoryPath, "jobs.json");

async function ensureStoreFile() {
  await mkdir(dataDirectoryPath, { recursive: true });

  try {
    await readFile(dataFilePath, "utf8");
  } catch {
    await writeStore({ jobs: [] });
  }
}

async function readStore() {
  await ensureStoreFile();

  const fileContents = await readFile(dataFilePath, "utf8");

  try {
    const parsed = JSON.parse(fileContents) as Partial<JobStore>;

    return {
      jobs: Array.isArray(parsed.jobs) ? parsed.jobs : [],
    };
  } catch {
    return { jobs: [] };
  }
}

async function writeStore(store: JobStore) {
  await mkdir(dataDirectoryPath, { recursive: true });

  const temporaryFilePath = `${dataFilePath}.tmp`;
  const contents = JSON.stringify(store, null, 2);

  await writeFile(temporaryFilePath, contents, "utf8");
  await rename(temporaryFilePath, dataFilePath);
}

function updateJobStatus(job: JobRecord) {
  const requiredTotal = job.items.reduce((sum, item) => sum + item.orderQty, 0);
  const deliveredTotal = job.items.reduce((sum, item) => sum + item.deliveredQty, 0);
  const loadedTotal = job.items.reduce((sum, item) => sum + item.loadedQty, 0);

  if (requiredTotal > 0 && deliveredTotal >= requiredTotal) {
    job.status = "completed";
    return;
  }

  if (loadedTotal > 0) {
    job.status = "in_transit";
    return;
  }

  job.status = "ready";
}

function buildAlert(type: string, message: string, severity: JobAlertRecord["severity"]): JobAlertRecord {
  const createdAt = new Date().toISOString();

  return {
    id: `ALT-${Date.now()}`,
    type,
    message,
    severity,
    time: formatTime(createdAt),
    createdAt,
  };
}

export async function listJobs() {
  const store = await readStore();
  return store.jobs
    .map((job) => summarizeJob(job))
    .sort((first, second) => second.createdAt.localeCompare(first.createdAt));
}

export async function getJob(jobId: string) {
  const store = await readStore();
  const job = store.jobs.find((currentJob) => currentJob.id === jobId);

  return job ? summarizeJob(job) : null;
}

export async function createJob(input: {
  driver: string;
  vehicle: string;
  origin: string;
  note?: string;
  registryKeys: string[];
}) {
  const store = await readStore();
  const records = await getPORecordsByKeys(input.registryKeys);
  const availableRecords = records.filter((record) => !record.assignedJobId && record.lifecycle === "active");

  if (!availableRecords.length) {
    throw new Error("ไม่พบรายการ PO ที่พร้อมสร้าง Job");
  }

  const now = new Date().toISOString();
  const baseId = buildJobId(new Date());
  const duplicateCount = store.jobs.filter((job) => job.id.startsWith(baseId)).length;
  const jobId = duplicateCount ? `${baseId}-${duplicateCount + 1}` : baseId;
  const items = buildJobItems(availableRecords);
  const destinations = buildJobDestinations(items);

  const job: JobRecord = {
    id: jobId,
    createdAt: now,
    updatedAt: now,
    status: "ready",
    driver: input.driver.trim(),
    vehicle: input.vehicle.trim(),
    origin: input.origin.trim(),
    originGps: "",
    note: input.note?.trim() ?? "",
    poRegistryKeys: items.map((item) => item.registryKey),
    items,
    destinations,
    alerts: [],
    scanLogs: [],
  };

  await markPORecordsAssigned(job.poRegistryKeys, job.id);
  await writeStore({
    jobs: [...store.jobs, job],
  });

  return summarizeJob(job);
}

export async function checkInJobOrigin(input: {
  jobId: string;
  latitude: number;
  longitude: number;
  accuracy?: number;
}) {
  const store = await readStore();
  const job = store.jobs.find((currentJob) => currentJob.id === input.jobId);

  if (!job) {
    throw new Error("ไม่พบ Job ที่เลือก");
  }

  const checkedInAt = new Date().toISOString();
  const accuracyText = typeof input.accuracy === "number" ? ` / accuracy ${Math.round(input.accuracy)} m` : "";

  job.originGps = `${input.latitude.toFixed(6)},${input.longitude.toFixed(6)}${accuracyText}`;
  job.originCheckedInAt = checkedInAt;
  job.updatedAt = checkedInAt;

  await writeStore(store);

  return summarizeJob(job);
}

export async function registerJobScan(input: {
  jobId: string;
  code: string;
  mode: ScanMode;
  destinationId?: string;
}) {
  const store = await readStore();
  const job = store.jobs.find((currentJob) => currentJob.id === input.jobId);

  if (!job) {
    throw new Error("ไม่พบ Job ที่เลือก");
  }

  const code = input.code.trim();
  if (!code) {
    throw new Error("กรุณากรอกรหัสที่จะสแกน");
  }

  const normalizedCode = code.toLowerCase();
  const matchingItems = job.items.filter(
    (item) =>
      item.registryKey.toLowerCase() === normalizedCode ||
      item.materialCode.toLowerCase() === normalizedCode ||
      item.poSapNo.toLowerCase() === normalizedCode,
  );

  if (!matchingItems.length) {
    const alert = buildAlert("ไม่พบรายการ", `รหัส ${code} ไม่อยู่ใน Job ${job.id}`, "กลาง");
    job.alerts.unshift(alert);
    job.scanLogs.unshift({
      id: `SCAN-${Date.now()}`,
      code,
      mode: input.mode,
      result: "alert",
      message: alert.message,
      createdAt: alert.createdAt,
    });
    job.updatedAt = alert.createdAt;
    await writeStore(store);
    return { job: summarizeJob(job), result: "alert" as const, message: alert.message };
  }

  const item = input.mode === "deliver" && input.destinationId
    ? matchingItems.find((currentItem) => currentItem.destinationId === input.destinationId) ?? matchingItems[0]
    : matchingItems[0];

  if (input.mode === "deliver" && input.destinationId && item.destinationId !== input.destinationId) {
    const alert = buildAlert(
      "ผิดปลายทาง",
      `${getJobItemLabel(item)} ถูกสแกนที่ปลายทางไม่ตรงกับแผน`,
      "สูง",
    );
    job.alerts.unshift(alert);
    job.scanLogs.unshift({
      id: `SCAN-${Date.now()}`,
      code,
      mode: input.mode,
      registryKey: item.registryKey,
      destinationId: input.destinationId,
      result: "alert",
      message: alert.message,
      createdAt: alert.createdAt,
    });
    job.updatedAt = alert.createdAt;
    await writeStore(store);
    return { job: summarizeJob(job), result: "alert" as const, message: alert.message };
  }

  if (input.mode === "load") {
    if (item.loadedQty >= item.orderQty) {
      const alert = buildAlert("สแกนซ้ำ", `${getJobItemLabel(item)} โหลดครบตามแผนแล้ว`, "กลาง");
      job.alerts.unshift(alert);
      job.scanLogs.unshift({
        id: `SCAN-${Date.now()}`,
        code,
        mode: input.mode,
        registryKey: item.registryKey,
        result: "alert",
        message: alert.message,
        createdAt: alert.createdAt,
      });
      job.updatedAt = alert.createdAt;
      await writeStore(store);
      return { job: summarizeJob(job), result: "alert" as const, message: alert.message };
    }

    item.loadedQty += 1;
  } else {
    if (item.loadedQty <= item.deliveredQty) {
      const alert = buildAlert("ยังไม่โหลดขึ้นรถ", `${getJobItemLabel(item)} ยังไม่มีจำนวนที่พร้อมส่ง`, "สูง");
      job.alerts.unshift(alert);
      job.scanLogs.unshift({
        id: `SCAN-${Date.now()}`,
        code,
        mode: input.mode,
        registryKey: item.registryKey,
        destinationId: item.destinationId,
        result: "alert",
        message: alert.message,
        createdAt: alert.createdAt,
      });
      job.updatedAt = alert.createdAt;
      await writeStore(store);
      return { job: summarizeJob(job), result: "alert" as const, message: alert.message };
    }

    if (item.deliveredQty >= item.orderQty) {
      const alert = buildAlert("ส่งซ้ำ", `${getJobItemLabel(item)} ส่งครบตามแผนแล้ว`, "กลาง");
      job.alerts.unshift(alert);
      job.scanLogs.unshift({
        id: `SCAN-${Date.now()}`,
        code,
        mode: input.mode,
        registryKey: item.registryKey,
        destinationId: item.destinationId,
        result: "alert",
        message: alert.message,
        createdAt: alert.createdAt,
      });
      job.updatedAt = alert.createdAt;
      await writeStore(store);
      return { job: summarizeJob(job), result: "alert" as const, message: alert.message };
    }

    item.deliveredQty += 1;
  }

  const createdAt = new Date().toISOString();
  job.scanLogs.unshift({
    id: `SCAN-${Date.now()}`,
    code,
    mode: input.mode,
    registryKey: item.registryKey,
    destinationId: item.destinationId,
    result: "ok",
    message:
      input.mode === "load"
        ? `${getJobItemLabel(item)} บันทึกขึ้นรถแล้ว`
        : `${getJobItemLabel(item)} บันทึกส่งปลายทางแล้ว`,
    createdAt,
  });
  job.updatedAt = createdAt;
  updateJobStatus(job);

  if (job.status === "completed") {
    await markPORecordsCompleted(job.poRegistryKeys);
  }

  await writeStore(store);

  return {
    job: summarizeJob(job),
    result: "ok" as const,
    message:
      input.mode === "load"
        ? `${getJobItemLabel(item)} ขึ้นรถแล้ว ${item.loadedQty}/${item.orderQty}`
        : `${getJobItemLabel(item)} ส่งแล้ว ${item.deliveredQty}/${item.orderQty}`,
  };
}
