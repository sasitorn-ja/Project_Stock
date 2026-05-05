import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  buildJobDestinations,
  buildJobId,
  buildJobItems,
  formatTime,
  getJobItemLabel,
  normalizeJobDestination,
  summarizeJob,
  summarizeJobArchive,
  type JobAlertRecord,
  type JobArchiveRecord,
  type JobRecord,
  type ScanMode,
} from "@/lib/jobs";
import { cleanupExpiredSharedData, hasSharedDatabase, withPostgresClient, withPostgresTransaction } from "@/lib/postgres-storage";
import { archivePORecordsForCompletedJob, getPORecordsByKeys, markPORecordsAssigned } from "@/lib/po-registry-store";
import {
  mapDatabaseJob,
  mapDatabaseJobArchive,
  mapDatabasePORecord,
  serializeJobArchiveRecordForDatabase,
  serializeJobRecordForDatabase,
  serializePORegistryArchiveRecordForDatabase,
} from "@/lib/shared-storage-payloads";
import { assertWritableStorage } from "@/lib/storage-config";

type JobStore = {
  jobs: JobRecord[];
};

type JobArchiveStore = {
  jobs: JobArchiveRecord[];
};

const dataDirectoryPath = path.join(process.cwd(), "data");
const dataFilePath = path.join(dataDirectoryPath, "jobs.json");
const archiveDataFilePath = path.join(dataDirectoryPath, "job-archives.json");
const retentionWindowMs = 100 * 24 * 60 * 60 * 1000;

async function ensureStoreFile() {
  await mkdir(dataDirectoryPath, { recursive: true });

  try {
    await readFile(dataFilePath, "utf8");
  } catch {
    await writeStore({ jobs: [] });
  }
}

async function ensureArchiveStoreFile() {
  await mkdir(dataDirectoryPath, { recursive: true });

  try {
    await readFile(archiveDataFilePath, "utf8");
  } catch {
    await writeArchiveStore({ jobs: [] });
  }
}

function isExpiredJob(job: JobRecord) {
  if (!job.purgeAfterAt) {
    return false;
  }

  return new Date(job.purgeAfterAt).getTime() <= Date.now();
}

function isExpiredJobArchive(job: JobArchiveRecord) {
  return new Date(job.deleteAfterAt).getTime() <= Date.now();
}

function normalizeStoredJob<T extends JobRecord | JobArchiveRecord>(job: T): T {
  return {
    ...job,
    destinations: Array.isArray(job.destinations) ? job.destinations.map(normalizeJobDestination) : [],
  };
}

async function readStore() {
  await ensureStoreFile();

  const fileContents = await readFile(dataFilePath, "utf8");

  try {
    const parsed = JSON.parse(fileContents) as Partial<JobStore>;
    const storedJobs = Array.isArray(parsed.jobs) ? parsed.jobs.map((job) => normalizeStoredJob(job as JobRecord)) : [];
    const jobs = storedJobs.filter((job) => !isExpiredJob(job));

    if (jobs.length !== storedJobs.length) {
      await writeStore({ jobs });
    }

    return { jobs };
  } catch {
    return { jobs: [] };
  }
}

async function readArchiveStore() {
  await ensureArchiveStoreFile();

  const fileContents = await readFile(archiveDataFilePath, "utf8");

  try {
    const parsed = JSON.parse(fileContents) as Partial<JobArchiveStore>;
    const storedJobs = Array.isArray(parsed.jobs)
      ? parsed.jobs.map((job) => normalizeStoredJob(job as JobArchiveRecord))
      : [];
    const jobs = storedJobs.filter((job) => !isExpiredJobArchive(job));

    if (jobs.length !== storedJobs.length) {
      await writeArchiveStore({ jobs });
    }

    return { jobs };
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

async function writeArchiveStore(store: JobArchiveStore) {
  await mkdir(dataDirectoryPath, { recursive: true });

  const temporaryFilePath = `${archiveDataFilePath}.tmp`;
  const contents = JSON.stringify(store, null, 2);

  await writeFile(temporaryFilePath, contents, "utf8");
  await rename(temporaryFilePath, archiveDataFilePath);
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
    id: `ALT-${randomUUID()}`,
    type,
    message,
    severity,
    time: formatTime(createdAt),
    createdAt,
  };
}

function appendScanLog(
  job: JobRecord,
  input: {
    code: string;
    mode: ScanMode;
    result: "ok" | "alert";
    message: string;
    registryKey?: string;
    destinationId?: string;
    createdAt: string;
  },
) {
  job.scanLogs.unshift({
    id: `SCAN-${randomUUID()}`,
    code: input.code,
    mode: input.mode,
    registryKey: input.registryKey,
    destinationId: input.destinationId,
    result: input.result,
    message: input.message,
    createdAt: input.createdAt,
  });
}

function applyOriginCheckIn(
  job: JobRecord,
  input: {
    latitude: number;
    longitude: number;
    accuracy?: number;
  },
) {
  const checkedInAt = new Date().toISOString();
  const accuracyText = typeof input.accuracy === "number" ? ` / accuracy ${Math.round(input.accuracy)} m` : "";

  job.originGps = `${input.latitude.toFixed(6)},${input.longitude.toFixed(6)}${accuracyText}`;
  job.originCheckedInAt = checkedInAt;
  job.updatedAt = checkedInAt;

  return job;
}

function assertOriginCheckInCompleted(job: JobRecord) {
  if (!job.originCheckedInAt || !job.originGps.trim()) {
    throw new Error("กรุณาเช็กอิน GPS จากอุปกรณ์ก่อนเริ่มสแกน");
  }
}

function applyDestinationCheckIn(
  job: JobRecord,
  input: {
    destinationId: string;
    latitude: number;
    longitude: number;
    accuracy?: number;
  },
) {
  const destination = job.destinations.find((currentDestination) => currentDestination.id === input.destinationId);

  if (!destination) {
    throw new Error("ไม่พบปลายทางที่เลือกใน Job นี้");
  }

  const checkedInAt = new Date().toISOString();
  const accuracyText = typeof input.accuracy === "number" ? ` / accuracy ${Math.round(input.accuracy)} m` : "";

  destination.deliveryGps = `${input.latitude.toFixed(6)},${input.longitude.toFixed(6)}${accuracyText}`;
  destination.deliveryCheckedInAt = checkedInAt;
  job.updatedAt = checkedInAt;

  return job;
}

function assertDestinationCheckInCompleted(job: JobRecord, destinationId?: string) {
  if (!destinationId?.trim()) {
    throw new Error("กรุณาเลือกปลายทางก่อนบันทึกการส่ง");
  }

  const destination = job.destinations.find((currentDestination) => currentDestination.id === destinationId);

  if (!destination) {
    throw new Error("ไม่พบปลายทางที่เลือกใน Job นี้");
  }

  if (!destination.deliveryCheckedInAt || !destination.deliveryGps.trim()) {
    throw new Error(`กรุณาเช็กอิน GPS ที่ปลายทาง ${destination.name} ก่อนสแกนส่งของ`);
  }

  return destination;
}

function formatWrongDestinationMessage(
  item: JobRecord["items"][number],
  currentDestinationName: string,
  plannedDestinationName: string,
) {
  return [
    `รายการ ${getJobItemLabel(item)} ไม่ใช่ของปลายทางที่เลือกตอนนี้`,
    `ต้องส่งที่: ${plannedDestinationName}`,
    `คุณกำลังอยู่ที่: ${currentDestinationName}`,
  ].join("\n");
}

function formatWrongJobMessage(input: {
  code: string;
  currentJobId: string;
  otherJobId: string;
  destinationName: string;
  poSapNo: string;
  poSapItem: string;
  materialCode: string;
  registryKey: string;
  matchedBy: "registryKey" | "materialCode" | "poSapNo";
}) {
  const details = [
    `รหัส ${input.code} ไม่อยู่ใน Job ${input.currentJobId}`,
    `รายการนี้อยู่ใน Job ${input.otherJobId}`,
    `ปลายทาง: ${input.destinationName}`,
    `PO: ${input.poSapNo} / Item: ${input.poSapItem}`,
    `Material: ${input.materialCode || "-"}`,
    `Registry: ${input.registryKey}`,
  ];

  if (input.matchedBy === "poSapNo") {
    details.push("พบเลข PO นี้ในอีกงานหนึ่ง กรุณาตรวจสอบ item ให้ตรงก่อนส่ง");
  }

  return details.join("\n");
}

function formatUnknownJobMessage(code: string, jobId: string) {
  return [
    `รหัส ${code} ไม่อยู่ใน Job ${jobId} และไม่พบในงานจัดส่งที่กำลังเปิดอยู่`,
    "กรุณาตรวจสอบว่าเป็นของงานอื่นหรือยังไม่ได้สร้างงาน",
  ].join("\n");
}

function findMatchingItemInJobs(jobs: JobRecord[], currentJobId: string, code: string) {
  const normalizedCode = code.trim().toLowerCase();
  const matchFields = [
    { field: "registryKey" as const, score: 3 },
    { field: "materialCode" as const, score: 2 },
    { field: "poSapNo" as const, score: 1 },
  ];

  const candidates = jobs
    .filter((job) => job.id !== currentJobId)
    .flatMap((job) =>
      job.items.flatMap((item) => {
        const match = matchFields.find(({ field }) => item[field].toLowerCase() === normalizedCode);

        if (!match) {
          return [];
        }

        const destination = job.destinations.find((currentDestination) => currentDestination.id === item.destinationId);

        return [
          {
            job,
            item,
            destinationName: destination?.name || item.destinationName || "-",
            matchedBy: match.field,
            score: match.score,
          },
        ];
      }),
    )
    .sort((first, second) => second.score - first.score || second.job.createdAt.localeCompare(first.job.createdAt));

  return candidates[0];
}

function buildJobArchiveRecord(job: JobRecord): JobArchiveRecord {
  const archivedAt = job.completedAt ?? job.updatedAt;
  const deleteAfterAt =
    job.purgeAfterAt ?? new Date(new Date(archivedAt).getTime() + retentionWindowMs).toISOString();

  return {
    ...job,
    archivedAt,
    deleteAfterAt,
  };
}

function jobMatchesHistoryFilters(
  job: Pick<JobArchiveRecord, "id" | "driver" | "vehicle" | "origin" | "completedAt" | "archivedAt" | "items">,
  filters: { query?: string; dateFrom?: string; dateTo?: string },
) {
  const normalizedQuery = filters.query?.trim().toLowerCase() ?? "";

  if (normalizedQuery) {
    const textPool = [
      job.id,
      job.driver,
      job.vehicle,
      job.origin,
      ...(job.items.flatMap((item) => [item.poSapNo, item.materialCode, item.materialName, item.registryKey])),
    ]
      .join(" ")
      .toLowerCase();

    if (!textPool.includes(normalizedQuery)) {
      return false;
    }
  }

  const eventDate = new Date(job.completedAt ?? job.archivedAt);

  if (filters.dateFrom) {
    const dateFrom = new Date(`${filters.dateFrom}T00:00:00`);
    if (eventDate < dateFrom) {
      return false;
    }
  }

  if (filters.dateTo) {
    const dateTo = new Date(`${filters.dateTo}T23:59:59.999`);
    if (eventDate > dateTo) {
      return false;
    }
  }

  return true;
}

function applyJobScan(
  job: JobRecord,
  input: {
    code: string;
    mode: ScanMode;
    destinationId?: string;
    otherActiveJobs?: JobRecord[];
  },
) {
  const code = input.code.trim();
  if (!code) {
    throw new Error("กรุณากรอกรหัสที่จะสแกน");
  }

  if (input.mode === "deliver") {
    assertDestinationCheckInCompleted(job, input.destinationId);
  }

  const normalizedCode = code.toLowerCase();
  const matchingItems = job.items.filter(
    (item) =>
      item.registryKey.toLowerCase() === normalizedCode ||
      item.materialCode.toLowerCase() === normalizedCode ||
      item.poSapNo.toLowerCase() === normalizedCode,
  );

  if (!matchingItems.length) {
    const otherJobMatch = findMatchingItemInJobs(input.otherActiveJobs ?? [], job.id, code);
    const alert = buildAlert(
      "ไม่พบรายการ",
      otherJobMatch
        ? formatWrongJobMessage({
            code,
            currentJobId: job.id,
            otherJobId: otherJobMatch.job.id,
            destinationName: otherJobMatch.destinationName,
            poSapNo: otherJobMatch.item.poSapNo,
            poSapItem: otherJobMatch.item.poSapItem,
            materialCode: otherJobMatch.item.materialCode,
            registryKey: otherJobMatch.item.registryKey,
            matchedBy: otherJobMatch.matchedBy,
          })
        : formatUnknownJobMessage(code, job.id),
      "กลาง",
    );
    job.alerts.unshift(alert);
    appendScanLog(job, {
      code,
      mode: input.mode,
      result: "alert",
      message: alert.message,
      createdAt: alert.createdAt,
    });
    job.updatedAt = alert.createdAt;
    return { job, result: "alert" as const, message: alert.message };
  }

  const item =
    input.mode === "deliver" && input.destinationId
      ? matchingItems.find((currentItem) => currentItem.destinationId === input.destinationId) ?? matchingItems[0]
      : matchingItems[0];

  if (input.mode === "deliver" && input.destinationId && item.destinationId !== input.destinationId) {
    const selectedDestination = job.destinations.find((currentDestination) => currentDestination.id === input.destinationId);
    const plannedDestination = job.destinations.find((currentDestination) => currentDestination.id === item.destinationId);
    const alert = buildAlert(
      "ผิดปลายทาง",
      formatWrongDestinationMessage(item, selectedDestination?.name || input.destinationId, plannedDestination?.name || item.destinationName),
      "สูง",
    );
    job.alerts.unshift(alert);
    appendScanLog(job, {
      code,
      mode: input.mode,
      result: "alert",
      message: alert.message,
      registryKey: item.registryKey,
      destinationId: input.destinationId,
      createdAt: alert.createdAt,
    });
    job.updatedAt = alert.createdAt;
    return { job, result: "alert" as const, message: alert.message };
  }

  if (input.mode === "load") {
    if (item.loadedQty >= item.orderQty) {
      const alert = buildAlert("สแกนซ้ำ", `${getJobItemLabel(item)} โหลดครบตามแผนแล้ว`, "กลาง");
      job.alerts.unshift(alert);
      appendScanLog(job, {
        code,
        mode: input.mode,
        result: "alert",
        message: alert.message,
        registryKey: item.registryKey,
        createdAt: alert.createdAt,
      });
      job.updatedAt = alert.createdAt;
      return { job, result: "alert" as const, message: alert.message };
    }

    item.loadedQty += 1;
  } else {
    if (item.loadedQty <= item.deliveredQty) {
      const alert = buildAlert("ยังไม่โหลดขึ้นรถ", `${getJobItemLabel(item)} ยังไม่มีจำนวนที่พร้อมส่ง`, "สูง");
      job.alerts.unshift(alert);
      appendScanLog(job, {
        code,
        mode: input.mode,
        result: "alert",
        message: alert.message,
        registryKey: item.registryKey,
        destinationId: item.destinationId,
        createdAt: alert.createdAt,
      });
      job.updatedAt = alert.createdAt;
      return { job, result: "alert" as const, message: alert.message };
    }

    if (item.deliveredQty >= item.orderQty) {
      const alert = buildAlert("ส่งซ้ำ", `${getJobItemLabel(item)} ส่งครบตามแผนแล้ว`, "กลาง");
      job.alerts.unshift(alert);
      appendScanLog(job, {
        code,
        mode: input.mode,
        result: "alert",
        message: alert.message,
        registryKey: item.registryKey,
        destinationId: item.destinationId,
        createdAt: alert.createdAt,
      });
      job.updatedAt = alert.createdAt;
      return { job, result: "alert" as const, message: alert.message };
    }

    item.deliveredQty += 1;
  }

  const createdAt = new Date().toISOString();
  appendScanLog(job, {
    code,
    mode: input.mode,
    result: "ok",
    message:
      input.mode === "load"
        ? `${getJobItemLabel(item)} บันทึกขึ้นรถแล้ว`
        : `${getJobItemLabel(item)} บันทึกส่งปลายทางแล้ว`,
    registryKey: item.registryKey,
    destinationId: item.destinationId,
    createdAt,
  });
  job.updatedAt = createdAt;
  updateJobStatus(job);

  if (job.status === "completed" && !job.completedAt) {
    job.completedAt = createdAt;
    job.purgeAfterAt = new Date(new Date(createdAt).getTime() + retentionWindowMs).toISOString();
  }

  return {
    job,
    result: "ok" as const,
    message:
      input.mode === "load"
        ? `${getJobItemLabel(item)} ขึ้นรถแล้ว ${item.loadedQty}/${item.orderQty}`
        : `${getJobItemLabel(item)} ส่งแล้ว ${item.deliveredQty}/${item.orderQty}`,
  };
}

async function listJobsFromDatabase() {
  await cleanupExpiredSharedData();

  return withPostgresClient(async (client) => {
    const result = await client.query(`
      SELECT *
      FROM jobs
      WHERE completed_at IS NULL
      ORDER BY created_at DESC
    `);

    return result.rows
      .map((row) => summarizeJob(mapDatabaseJob(row)))
      .sort((first, second) => second.createdAt.localeCompare(first.createdAt));
  });
}

async function listJobArchivesFromDatabase(filters: {
  query?: string;
  dateFrom?: string;
  dateTo?: string;
}) {
  await cleanupExpiredSharedData();

  return withPostgresClient(async (client) => {
    const result = await client.query(`
      SELECT *
      FROM job_archives
      ORDER BY archived_at DESC
    `);

    return result.rows
      .map((row) => mapDatabaseJobArchive(row))
      .filter((job) => jobMatchesHistoryFilters(job, filters))
      .map((job) => summarizeJobArchive(job));
  });
}

async function getJobFromDatabase(jobId: string) {
  await cleanupExpiredSharedData();

  return withPostgresClient(async (client) => {
    const result = await client.query(
      `
        SELECT *
        FROM jobs
        WHERE id = $1
          AND completed_at IS NULL
      `,
      [jobId],
    );

    const row = result.rows[0];
    return row ? summarizeJob(mapDatabaseJob(row)) : null;
  });
}

async function getJobArchiveFromDatabase(jobId: string) {
  await cleanupExpiredSharedData();

  return withPostgresClient(async (client) => {
    const result = await client.query(
      `
        SELECT *
        FROM job_archives
        WHERE job_id = $1
      `,
      [jobId],
    );

    const row = result.rows[0];
    return row ? summarizeJobArchive(mapDatabaseJobArchive(row)) : null;
  });
}

async function createJobInDatabase(input: {
  driver: string;
  vehicle: string;
  origin: string;
  note?: string;
  registryKeys: string[];
}) {
  assertWritableStorage();
  await cleanupExpiredSharedData();

  return withPostgresTransaction(async (client) => {
    const recordsResult = await client.query(
      `
        SELECT *
        FROM po_registry
        WHERE registry_key = ANY($1::text[])
        FOR UPDATE
      `,
      [input.registryKeys],
    );
    const records = recordsResult.rows.map(mapDatabasePORecord);
    const availableRecords = records.filter((record) => !record.assignedJobId && record.lifecycle === "active");

    if (!availableRecords.length) {
      throw new Error("ไม่พบรายการ PO ที่พร้อมสร้าง Job");
    }

    const nowDate = new Date();
    const now = nowDate.toISOString();
    const sequenceResult = await client.query<{ value: string }>(`
      SELECT LPAD(nextval('job_sequence')::text, 6, '0') AS value
    `);
    const sequence = sequenceResult.rows[0]?.value ?? "000001";
    const jobId = `${buildJobId(nowDate)}-${sequence}`;
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
    const payload = serializeJobRecordForDatabase(job);

    await client.query(
      `
        UPDATE po_registry
        SET
          lifecycle = 'assigned',
          assigned_job_id = $2,
          assigned_at = $3::timestamptz
        WHERE registry_key = ANY($1::text[])
      `,
      [job.poRegistryKeys, job.id, now],
    );

    await client.query(
      `
        INSERT INTO jobs (
          id,
          created_at,
          updated_at,
          status,
          driver,
          vehicle,
          origin,
          origin_gps,
          note,
          po_registry_keys,
          items,
          destinations,
          alerts,
          scan_logs
        )
        VALUES (
          $1,
          $2::timestamptz,
          $3::timestamptz,
          $4,
          $5,
          $6,
          $7,
          $8,
          $9,
          $10::text[],
          $11::jsonb,
          $12::jsonb,
          $13::jsonb,
          $14::jsonb
        )
      `,
      [
        payload.id,
        payload.created_at,
        payload.updated_at,
        payload.status,
        payload.driver,
        payload.vehicle,
        payload.origin,
        payload.origin_gps,
        payload.note,
        payload.po_registry_keys,
        JSON.stringify(payload.items),
        JSON.stringify(payload.destinations),
        JSON.stringify(payload.alerts),
        JSON.stringify(payload.scan_logs),
      ],
    );

    return summarizeJob(job);
  });
}

async function checkInJobOriginInDatabase(input: {
  jobId: string;
  latitude: number;
  longitude: number;
  accuracy?: number;
}) {
  assertWritableStorage();

  return withPostgresTransaction(async (client) => {
    const result = await client.query(
      `
        SELECT *
        FROM jobs
        WHERE id = $1
        FOR UPDATE
      `,
      [input.jobId],
    );
    const row = result.rows[0];

    if (!row) {
      throw new Error("ไม่พบ Job ที่เลือก");
    }

    const job = applyOriginCheckIn(mapDatabaseJob(row), input);

    await client.query(
      `
        UPDATE jobs
        SET
          origin_gps = $2,
          origin_checked_in_at = $3::timestamptz,
          updated_at = $4::timestamptz
        WHERE id = $1
      `,
      [job.id, job.originGps, job.originCheckedInAt ?? null, job.updatedAt],
    );

    return summarizeJob(job);
  });
}

async function checkInJobDestinationInDatabase(input: {
  jobId: string;
  destinationId: string;
  latitude: number;
  longitude: number;
  accuracy?: number;
}) {
  assertWritableStorage();

  return withPostgresTransaction(async (client) => {
    const result = await client.query(
      `
        SELECT *
        FROM jobs
        WHERE id = $1
        FOR UPDATE
      `,
      [input.jobId],
    );
    const row = result.rows[0];

    if (!row) {
      throw new Error("ไม่พบ Job ที่เลือก");
    }

    const job = applyDestinationCheckIn(mapDatabaseJob(row), input);

    await client.query(
      `
        UPDATE jobs
        SET
          destinations = $2::jsonb,
          updated_at = $3::timestamptz
        WHERE id = $1
      `,
      [job.id, JSON.stringify(job.destinations), job.updatedAt],
    );

    return summarizeJob(job);
  });
}

async function registerJobScanInDatabase(input: {
  jobId: string;
  code: string;
  mode: ScanMode;
  destinationId?: string;
}) {
  assertWritableStorage();

  return withPostgresTransaction(async (client) => {
    const result = await client.query(
      `
        SELECT *
        FROM jobs
        WHERE id = $1
        FOR UPDATE
      `,
      [input.jobId],
    );
    const row = result.rows[0];

    if (!row) {
      throw new Error("ไม่พบ Job ที่เลือก");
    }

    const job = mapDatabaseJob(row);
    assertOriginCheckInCompleted(job);
    const allJobsResult = await client.query(
      `
        SELECT *
        FROM jobs
        WHERE completed_at IS NULL
      `,
    );
    const allJobs = allJobsResult.rows.map((jobRow) => mapDatabaseJob(jobRow));

    const response = applyJobScan(job, {
      ...input,
      otherActiveJobs: allJobs,
    });

    if (response.job.status === "completed" && response.job.completedAt) {
      const poRecordsResult = await client.query(
        `
          SELECT *
          FROM po_registry
          WHERE registry_key = ANY($1::text[])
          FOR UPDATE
        `,
        [response.job.poRegistryKeys],
      );
      const archiveJob = buildJobArchiveRecord(response.job);
      const archivePayload = serializeJobArchiveRecordForDatabase(archiveJob);
      const archivePORecords = poRecordsResult.rows.map(mapDatabasePORecord).map((record) => ({
        ...record,
        lifecycle: "completed" as const,
        archivedFromJobId: response.job.id,
        archivedAt: archiveJob.archivedAt,
        completedAt: response.job.completedAt,
        deleteAfterAt: archiveJob.deleteAfterAt,
      }));

      await client.query(
        `
          INSERT INTO job_archives (
            job_id,
            created_at,
            updated_at,
            status,
            driver,
            vehicle,
            origin,
            origin_gps,
            origin_checked_in_at,
            note,
            po_registry_keys,
            items,
            destinations,
            alerts,
            scan_logs,
            completed_at,
            archived_at,
            delete_after_at
          )
          VALUES (
            $1,
            $2::timestamptz,
            $3::timestamptz,
            $4,
            $5,
            $6,
            $7,
            $8,
            $9::timestamptz,
            $10,
            $11::text[],
            $12::jsonb,
            $13::jsonb,
            $14::jsonb,
            $15::jsonb,
            $16::timestamptz,
            $17::timestamptz,
            $18::timestamptz
          )
          ON CONFLICT (job_id) DO UPDATE
          SET
            created_at = EXCLUDED.created_at,
            updated_at = EXCLUDED.updated_at,
            status = EXCLUDED.status,
            driver = EXCLUDED.driver,
            vehicle = EXCLUDED.vehicle,
            origin = EXCLUDED.origin,
            origin_gps = EXCLUDED.origin_gps,
            origin_checked_in_at = EXCLUDED.origin_checked_in_at,
            note = EXCLUDED.note,
            po_registry_keys = EXCLUDED.po_registry_keys,
            items = EXCLUDED.items,
            destinations = EXCLUDED.destinations,
            alerts = EXCLUDED.alerts,
            scan_logs = EXCLUDED.scan_logs,
            completed_at = EXCLUDED.completed_at,
            archived_at = EXCLUDED.archived_at,
            delete_after_at = EXCLUDED.delete_after_at
        `,
        [
          archivePayload.job_id,
          archivePayload.created_at,
          archivePayload.updated_at,
          archivePayload.status,
          archivePayload.driver,
          archivePayload.vehicle,
          archivePayload.origin,
          archivePayload.origin_gps,
          archivePayload.origin_checked_in_at,
          archivePayload.note,
          archivePayload.po_registry_keys,
          JSON.stringify(archivePayload.items),
          JSON.stringify(archivePayload.destinations),
          JSON.stringify(archivePayload.alerts),
          JSON.stringify(archivePayload.scan_logs),
          archivePayload.completed_at,
          archivePayload.archived_at,
          archivePayload.delete_after_at,
        ],
      );

      if (archivePORecords.length) {
        await client.query(
          `
            WITH incoming AS (
              SELECT *
              FROM json_to_recordset($1::json) AS data(
                archived_from_job_id TEXT,
                registry_key TEXT,
                po_sap_no TEXT,
                po_sap_item TEXT,
                first_imported_at TIMESTAMPTZ,
                latest_imported_at TIMESTAMPTZ,
                source_file_name TEXT,
                source_sheet_name TEXT,
                row_number INTEGER,
                status TEXT,
                vendor TEXT,
                po_web_no TEXT,
                unit_name TEXT,
                material_code TEXT,
                material_name TEXT,
                order_qty TEXT,
                received_qty TEXT,
                total_amount TEXT,
                import_count INTEGER,
                lifecycle TEXT,
                assigned_job_id TEXT,
                assigned_at TIMESTAMPTZ,
                archived_at TIMESTAMPTZ,
                completed_at TIMESTAMPTZ,
                delete_after_at TIMESTAMPTZ
              )
            )
            INSERT INTO po_registry_archives (
              archived_from_job_id,
              registry_key,
              po_sap_no,
              po_sap_item,
              first_imported_at,
              latest_imported_at,
              source_file_name,
              source_sheet_name,
              row_number,
              status,
              vendor,
              po_web_no,
              unit_name,
              material_code,
              material_name,
              order_qty,
              received_qty,
              total_amount,
              import_count,
              lifecycle,
              assigned_job_id,
              assigned_at,
              archived_at,
              completed_at,
              delete_after_at
            )
            SELECT
              archived_from_job_id,
              registry_key,
              po_sap_no,
              po_sap_item,
              first_imported_at,
              latest_imported_at,
              source_file_name,
              source_sheet_name,
              row_number,
              status,
              vendor,
              po_web_no,
              unit_name,
              material_code,
              material_name,
              order_qty,
              received_qty,
              total_amount,
              import_count,
              lifecycle,
              assigned_job_id,
              assigned_at,
              archived_at,
              completed_at,
              delete_after_at
            FROM incoming
            ON CONFLICT (archived_from_job_id, registry_key) DO UPDATE
            SET
              po_sap_no = EXCLUDED.po_sap_no,
              po_sap_item = EXCLUDED.po_sap_item,
              first_imported_at = EXCLUDED.first_imported_at,
              latest_imported_at = EXCLUDED.latest_imported_at,
              source_file_name = EXCLUDED.source_file_name,
              source_sheet_name = EXCLUDED.source_sheet_name,
              row_number = EXCLUDED.row_number,
              status = EXCLUDED.status,
              vendor = EXCLUDED.vendor,
              po_web_no = EXCLUDED.po_web_no,
              unit_name = EXCLUDED.unit_name,
              material_code = EXCLUDED.material_code,
              material_name = EXCLUDED.material_name,
              order_qty = EXCLUDED.order_qty,
              received_qty = EXCLUDED.received_qty,
              total_amount = EXCLUDED.total_amount,
              import_count = EXCLUDED.import_count,
              lifecycle = EXCLUDED.lifecycle,
              assigned_job_id = EXCLUDED.assigned_job_id,
              assigned_at = EXCLUDED.assigned_at,
              archived_at = EXCLUDED.archived_at,
              completed_at = EXCLUDED.completed_at,
              delete_after_at = EXCLUDED.delete_after_at
          `,
          [JSON.stringify(archivePORecords.map(serializePORegistryArchiveRecordForDatabase))],
        );
      }

      await client.query(
        `
          DELETE FROM jobs
          WHERE id = $1
        `,
        [response.job.id],
      );

      await client.query(
        `
          DELETE FROM po_registry
          WHERE registry_key = ANY($1::text[])
        `,
        [response.job.poRegistryKeys],
      );
    } else {
      const payload = serializeJobRecordForDatabase(response.job);

      await client.query(
        `
          UPDATE jobs
          SET
            updated_at = $2::timestamptz,
            status = $3,
            items = $4::jsonb,
            destinations = $5::jsonb,
            alerts = $6::jsonb,
            scan_logs = $7::jsonb,
            completed_at = $8::timestamptz,
            purge_after_at = $9::timestamptz
          WHERE id = $1
        `,
        [
          payload.id,
          payload.updated_at,
          payload.status,
          JSON.stringify(payload.items),
          JSON.stringify(payload.destinations),
          JSON.stringify(payload.alerts),
          JSON.stringify(payload.scan_logs),
          payload.completed_at,
          payload.purge_after_at,
        ],
      );
    }

    return {
      job: summarizeJob(response.job),
      result: response.result,
      message: response.message,
    };
  });
}

export async function listJobs() {
  if (hasSharedDatabase()) {
    return listJobsFromDatabase();
  }

  const store = await readStore();
  return store.jobs
    .filter((job) => job.status !== "completed")
    .map((job) => summarizeJob(job))
    .sort((first, second) => second.createdAt.localeCompare(first.createdAt));
}

export async function getJob(jobId: string) {
  if (hasSharedDatabase()) {
    return getJobFromDatabase(jobId);
  }

  const store = await readStore();
  const job = store.jobs.find((currentJob) => currentJob.id === jobId && currentJob.status !== "completed");

  return job ? summarizeJob(job) : null;
}

export async function listJobArchives(filters: {
  query?: string;
  dateFrom?: string;
  dateTo?: string;
} = {}) {
  if (hasSharedDatabase()) {
    return listJobArchivesFromDatabase(filters);
  }

  const archiveStore = await readArchiveStore();

  return archiveStore.jobs
    .filter((job) => jobMatchesHistoryFilters(job, filters))
    .map((job) => summarizeJobArchive(job))
    .sort((first, second) => second.archivedAt.localeCompare(first.archivedAt));
}

export async function getJobArchive(jobId: string) {
  if (hasSharedDatabase()) {
    return getJobArchiveFromDatabase(jobId);
  }

  const archiveStore = await readArchiveStore();
  const job = archiveStore.jobs.find((currentJob) => currentJob.id === jobId);

  return job ? summarizeJobArchive(job) : null;
}

export async function createJob(input: {
  driver: string;
  vehicle: string;
  origin: string;
  note?: string;
  registryKeys: string[];
}) {
  if (hasSharedDatabase()) {
    return createJobInDatabase(input);
  }

  assertWritableStorage();
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
  if (hasSharedDatabase()) {
    return checkInJobOriginInDatabase(input);
  }

  assertWritableStorage();
  const store = await readStore();
  const job = store.jobs.find((currentJob) => currentJob.id === input.jobId);

  if (!job) {
    throw new Error("ไม่พบ Job ที่เลือก");
  }

  applyOriginCheckIn(job, input);
  await writeStore(store);

  return summarizeJob(job);
}

export async function checkInJobDestination(input: {
  jobId: string;
  destinationId: string;
  latitude: number;
  longitude: number;
  accuracy?: number;
}) {
  if (hasSharedDatabase()) {
    return checkInJobDestinationInDatabase(input);
  }

  assertWritableStorage();
  const store = await readStore();
  const job = store.jobs.find((currentJob) => currentJob.id === input.jobId);

  if (!job) {
    throw new Error("ไม่พบ Job ที่เลือก");
  }

  applyDestinationCheckIn(job, input);
  await writeStore(store);

  return summarizeJob(job);
}

export async function registerJobScan(input: {
  jobId: string;
  code: string;
  mode: ScanMode;
  destinationId?: string;
}) {
  if (hasSharedDatabase()) {
    return registerJobScanInDatabase(input);
  }

  assertWritableStorage();
  const store = await readStore();
  const job = store.jobs.find((currentJob) => currentJob.id === input.jobId);

  if (!job) {
    throw new Error("ไม่พบ Job ที่เลือก");
  }

  assertOriginCheckInCompleted(job);
  const response = applyJobScan(job, {
    ...input,
    otherActiveJobs: store.jobs,
  });

  if (response.job.status === "completed") {
    const archiveJob = buildJobArchiveRecord(response.job);
    const archiveStore = await readArchiveStore();

    await archivePORecordsForCompletedJob({
      registryKeys: response.job.poRegistryKeys,
      jobId: response.job.id,
      archivedAt: archiveJob.archivedAt,
      completedAt: response.job.completedAt ?? archiveJob.archivedAt,
      deleteAfterAt: archiveJob.deleteAfterAt,
    });
    await writeArchiveStore({
      jobs: [...archiveStore.jobs.filter((currentJob) => currentJob.id !== response.job.id), archiveJob],
    });
    await writeStore({
      jobs: store.jobs.filter((currentJob) => currentJob.id !== response.job.id),
    });
  } else {
    await writeStore(store);
  }

  return {
    job: summarizeJob(response.job),
    result: response.result,
    message: response.message,
  };
}
