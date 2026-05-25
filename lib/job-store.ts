import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  applyDestinationOverrides,
  buildJobDestinations,
  buildJobId,
  buildJobItems,
  formatTime,
  getJobItemLabel,
  normalizeJobDestination,
  normalizeScanQty,
  summarizeJob,
  summarizeJobArchive,
  type JobAlertRecord,
  type JobArchiveRecord,
  type JobDestinationOverrideInput,
  type JobRecord,
  type ScanMode,
} from "@/lib/jobs";
import {
  cleanupExpiredSharedData,
  hasSharedDatabase,
  triggerExpiredSharedDataCleanup,
  withPostgresClient,
  withPostgresTransaction,
} from "@/lib/postgres-storage";
import {
  archivePORecordsForCompletedJob,
  getPORecordsByKeys,
  invalidatePORecordsPageCache,
  markPORecordsAssigned,
  releasePORecordsFromJob,
} from "@/lib/po-registry-store";
import { formatGpsText } from "@/lib/reverse-geocode";
import {
  mapDatabaseJob,
  mapDatabaseJobArchive,
  mapDatabasePORecord,
  serializeJobArchiveRecordForDatabase,
  serializeJobRecordForDatabase,
  serializePORegistryArchiveRecordForDatabase,
} from "@/lib/shared-storage-payloads";
import { assertWritableStorage, canUseLocalFileStorage } from "@/lib/storage-config";

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
  if (!canUseLocalFileStorage()) {
    return false;
  }

  await mkdir(dataDirectoryPath, { recursive: true });

  try {
    await readFile(dataFilePath, "utf8");
  } catch {
    await writeStore({ jobs: [] });
  }

  return true;
}

async function ensureArchiveStoreFile() {
  if (!canUseLocalFileStorage()) {
    return false;
  }

  await mkdir(dataDirectoryPath, { recursive: true });

  try {
    await readFile(archiveDataFilePath, "utf8");
  } catch {
    await writeArchiveStore({ jobs: [] });
  }

  return true;
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
    allowOriginRecheckAfterLocked: Boolean(job.allowOriginRecheckAfterLocked),
    allowDestinationBeforeFullyLoaded: Boolean(job.allowDestinationBeforeFullyLoaded),
    destinations: Array.isArray(job.destinations) ? job.destinations.map(normalizeJobDestination) : [],
  };
}

async function readStore() {
  if (!(await ensureStoreFile())) {
    return { jobs: [] };
  }

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
  if (!(await ensureArchiveStoreFile())) {
    return { jobs: [] };
  }

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

function isJobFullyLoaded(job: JobRecord) {
  const requiredTotal = job.items.reduce((sum, item) => sum + item.orderQty, 0);
  const loadedTotal = job.items.reduce((sum, item) => sum + item.loadedQty, 0);

  return requiredTotal > 0 && loadedTotal >= requiredTotal;
}

function isOriginLocked(job: JobRecord) {
  return Boolean(job.originLockedAt);
}

function lockOriginIfFullyLoaded(job: JobRecord, lockedAt = new Date().toISOString()) {
  if (isJobFullyLoaded(job) && !job.originLockedAt) {
    job.originLockedAt = lockedAt;
    job.allowOriginRecheckAfterLocked = false;
  }
}

function getCompletedRegistryKeysForArchive(job: JobRecord) {
  return Array.from(new Set(job.poRegistryKeys));
}

function getSkippedRegistryKeysForRelease(job: JobRecord) {
  const completedKeys = new Set(getCompletedRegistryKeysForArchive(job));
  return job.poRegistryKeys.filter((registryKey) => !completedKeys.has(registryKey));
}

function assertDestinationModeUnlocked(job: JobRecord) {
  if (!isJobFullyLoaded(job) && !job.allowDestinationBeforeFullyLoaded) {
    throw new Error("ต้องสแกนสินค้าขึ้นรถให้ครบก่อน จึงจะเปิดโหมดปลายทางได้ หากมีเหตุจำเป็นให้ Admin เปิดปลายทางกรณีพิเศษ");
  }
}

function applyDestinationAssignments(
  items: JobRecord["items"],
  assignments: Record<string, string> = {},
  overrides: JobDestinationOverrideInput[] = [],
) {
  const overridesById = new Map(
    overrides
      .filter((override) => override.id.trim())
      .map((override) => [override.id.trim(), override]),
  );

  return items.map((item) => {
    const assignedDestinationId = assignments[item.registryKey]?.trim();
    const override = assignedDestinationId ? overridesById.get(assignedDestinationId) : undefined;

    if (!assignedDestinationId || !override) {
      return item;
    }

    const destinationName = override.name?.trim() || override.address?.trim() || item.destinationName;

    return {
      ...item,
      destinationId: assignedDestinationId,
      destinationName,
    };
  });
}

function mergeJobDestinations(
  existingDestinations: JobRecord["destinations"],
  items: JobRecord["items"],
  overrides: JobDestinationOverrideInput[] = [],
) {
  const existingById = new Map(existingDestinations.map((destination) => [destination.id, destination]));
  const rebuilt = buildJobDestinations(items).map((destination) => ({
    ...destination,
    ...existingById.get(destination.id),
    name: existingById.get(destination.id)?.name || destination.name,
    address: existingById.get(destination.id)?.address || destination.address,
  }));

  return applyDestinationOverrides(items, rebuilt, overrides);
}

function addPORecordsToJobRecord(
  job: JobRecord,
  records: Awaited<ReturnType<typeof getPORecordsByKeys>>,
  input: {
    itemScanQuantities?: Record<string, number>;
    destinationAssignments?: Record<string, string>;
    destinationOverrides?: JobDestinationOverrideInput[];
  } = {},
) {
  const existingKeys = new Set(job.items.map((item) => item.registryKey));
  const nextRecords = records.filter((record) => !existingKeys.has(record.registryKey));

  if (!nextRecords.length) {
    throw new Error("ไม่มี PO ใหม่ที่เพิ่มเข้า Job นี้ได้");
  }

  const nextItems = applyDestinationAssignments(
    buildJobItems(nextRecords, input.itemScanQuantities),
    input.destinationAssignments,
    input.destinationOverrides,
  );
  const mergedItems = [...job.items, ...nextItems];
  const { items, destinations } = mergeJobDestinations(job.destinations, mergedItems, input.destinationOverrides);
  const now = new Date().toISOString();

  job.items = items;
  job.destinations = destinations;
  job.poRegistryKeys = items.map((item) => item.registryKey);
  job.updatedAt = now;
  updateJobStatus(job);
  prependAlert(
    job,
    "Admin เพิ่ม PO",
    `เพิ่มสินค้าเข้า Job ระหว่างปฏิบัติงาน ${nextItems.length.toLocaleString("th-TH")} รายการ`,
    "ผ่าน",
  );

  return nextItems;
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

function prependAlert(job: JobRecord, type: string, message: string, severity: JobAlertRecord["severity"]) {
  const alert = buildAlert(type, message, severity);
  job.alerts.unshift(alert);

  return alert;
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
    locationText?: string;
  },
) {
  if (isOriginLocked(job) && !job.allowOriginRecheckAfterLocked) {
    throw new Error("ต้นทางถูกปิดหลังสแกนขึ้นรถครบแล้ว หากต้องแก้ไขให้ Admin เปิดต้นทางกรณีพิเศษก่อน");
  }

  const checkedInAt = new Date().toISOString();

  job.originGps = formatGpsText(input);
  job.originCheckedInAt = checkedInAt;
  prependAlert(job, "เช็กอินต้นทาง", `คนขับเช็กอินต้นทาง ${job.origin || "-"}\n${job.originGps}`, "ผ่าน");
  if (job.allowOriginRecheckAfterLocked) {
    job.allowOriginRecheckAfterLocked = false;
  }
  if (isJobFullyLoaded(job)) {
    job.originLockedAt = checkedInAt;
  }
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
    locationText?: string;
  },
) {
  const destination = job.destinations.find((currentDestination) => currentDestination.id === input.destinationId);

  if (!destination) {
    throw new Error("ไม่พบปลายทางที่เลือกใน Job นี้");
  }

  assertDestinationModeUnlocked(job);

  job.destinations
    .filter((currentDestination) => currentDestination.id !== destination.id)
    .forEach((currentDestination) => {
      applyUnusedDestinationCheckInClear(job, {
        destinationId: currentDestination.id,
        nextDestinationId: destination.id,
      });
    });

  const checkedInAt = new Date().toISOString();

  destination.deliveryGps = formatGpsText(input);
  destination.deliveryCheckedInAt = checkedInAt;
  prependAlert(job, "เช็กอินปลายทาง", `คนขับเช็กอินปลายทาง ${destination.name || destination.address || "-"}\n${destination.deliveryGps}`, "ผ่าน");
  job.updatedAt = checkedInAt;

  return job;
}

function hasSuccessfulDeliveryScanAfterCheckIn(job: JobRecord, destination: JobRecord["destinations"][number]) {
  if (!destination.deliveryCheckedInAt) {
    return false;
  }

  const checkedInAt = new Date(destination.deliveryCheckedInAt).getTime();
  if (!Number.isFinite(checkedInAt)) {
    return false;
  }

  return job.scanLogs.some((log) => {
    if (log.mode !== "deliver" || log.result !== "ok" || log.destinationId !== destination.id) {
      return false;
    }

    const scannedAt = new Date(log.createdAt).getTime();
    return Number.isFinite(scannedAt) && scannedAt >= checkedInAt;
  });
}

function applyUnusedDestinationCheckInClear(
  job: JobRecord,
  input: {
    destinationId: string;
    nextDestinationId?: string;
  },
) {
  const destination = job.destinations.find((currentDestination) => currentDestination.id === input.destinationId);

  if (!destination) {
    throw new Error("ไม่พบปลายทางที่ต้องการล้างเช็กอินใน Job นี้");
  }

  if (!destination.deliveryCheckedInAt || !destination.deliveryGps.trim()) {
    return { job, cleared: false, message: "" };
  }

  if (hasSuccessfulDeliveryScanAfterCheckIn(job, destination)) {
    return { job, cleared: false, message: "" };
  }

  const nextDestination = input.nextDestinationId
    ? job.destinations.find((currentDestination) => currentDestination.id === input.nextDestinationId)
    : undefined;
  const now = new Date().toISOString();
  const message = nextDestination
    ? `ล้างเช็กอินปลายทาง ${destination.name || destination.address || "-"} เพราะเปลี่ยนไป ${nextDestination.name || nextDestination.address || "-"} ก่อนสแกนส่งสำเร็จ`
    : `ล้างเช็กอินปลายทาง ${destination.name || destination.address || "-"} เพราะยังไม่มีการสแกนส่งสำเร็จ`;

  destination.deliveryGps = "";
  destination.deliveryCheckedInAt = undefined;
  prependAlert(job, "ล้างเช็กอินปลายทาง", message, "กลาง");
  job.updatedAt = now;

  return { job, cleared: true, message };
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
    "ให้หยุดสแกนรายการนี้ แล้วเลือกปลายทางให้ถูกต้องก่อนสแกนต่อ",
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
}) {
  const details = [
    `ไม่พบ PO SAP No. ${input.code} ในรายการของ Job นี้`,
    `รายการนี้อยู่ใน Job ${input.otherJobId}`,
    `ปลายทาง: ${input.destinationName}`,
    `PO: ${input.poSapNo} / Item: ${input.poSapItem}`,
    `Material: ${input.materialCode || "-"}`,
    `Registry: ${input.registryKey}`,
    "พบเลข PO นี้ในอีกงานหนึ่ง กรุณาตรวจสอบ Item ให้ตรงก่อนสแกนต่อ",
  ];

  return details.join("\n");
}

function formatUnknownJobMessage(code: string, jobId: string) {
  return [
    `ไม่พบ PO SAP No. ${code} ในรายการที่เพิ่มไว้สำหรับ Job นี้`,
    `กรุณาตรวจสอบว่าอยู่ใน Job ${jobId} หรือยังไม่ได้เพิ่มเข้าระบบ`,
  ].join("\n");
}

function buildScanCodeCandidates(code: string) {
  const candidates = new Set<string>();
  const trimmedCode = code.trim();

  if (!trimmedCode) {
    return candidates;
  }

  function addCandidate(value: string) {
    const normalizedValue = value.trim().toLowerCase();

    if (normalizedValue) {
      candidates.add(normalizedValue);
    }
  }

  addCandidate(trimmedCode);

  try {
    const parsedUrl = new URL(trimmedCode);
    parsedUrl.searchParams.forEach((value) => addCandidate(value));
    parsedUrl.pathname
      .split("/")
      .map((part) => decodeURIComponent(part))
      .forEach(addCandidate);
  } catch {
    // Scanned QR/Barcode values are usually plain text, so non-URL values are expected.
  }

  const tokenMatches = trimmedCode.match(/[A-Za-z0-9ก-๙][A-Za-z0-9ก-๙:_-]*/g) ?? [];
  tokenMatches.forEach((token) => {
    addCandidate(token);

    if (token.includes(":") && !token.includes("::")) {
      token.split(":").forEach(addCandidate);
    }
  });

  return candidates;
}

function itemMatchesScanCode(item: JobRecord["items"][number], scanCodeCandidates: Set<string>) {
  return Boolean(item.poSapNo) && scanCodeCandidates.has(item.poSapNo.toLowerCase());
}

function findMatchingItemInJobs(jobs: JobRecord[], currentJobId: string, code: string) {
  const scanCodeCandidates = buildScanCodeCandidates(code);

  const candidates = jobs
    .filter((job) => job.id !== currentJobId)
    .flatMap((job) =>
      job.items.flatMap((item) => {
        if (!item.poSapNo || !scanCodeCandidates.has(item.poSapNo.toLowerCase())) {
          return [];
        }

        const destination = job.destinations.find((currentDestination) => currentDestination.id === item.destinationId);

        return [
          {
            job,
            item,
            destinationName: destination?.name || item.destinationName || "-",
          },
        ];
      }),
    )
    .sort((first, second) => second.job.createdAt.localeCompare(first.job.createdAt));

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
    assertDestinationModeUnlocked(job);
    assertDestinationCheckInCompleted(job, input.destinationId);
  }

  const normalizedCode = code.toLowerCase();
  const scanCodeCandidates = buildScanCodeCandidates(normalizedCode);
  const matchingItems = job.items.filter((item) => itemMatchesScanCode(item, scanCodeCandidates));

  if (!matchingItems.length) {
    const otherJobMatch = findMatchingItemInJobs(input.otherActiveJobs ?? [], job.id, code);
    const alert = prependAlert(
      job,
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
          })
        : formatUnknownJobMessage(code, job.id),
      "กลาง",
    );
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

  const destinationItems =
    input.mode === "deliver" && input.destinationId
      ? matchingItems.filter((currentItem) => currentItem.destinationId === input.destinationId)
      : [];
  const scannableItems = destinationItems.length ? destinationItems : matchingItems;
  const item =
    input.mode === "load"
      ? scannableItems.find((currentItem) => currentItem.loadedQty < currentItem.orderQty) ?? scannableItems[0]
      : scannableItems.find((currentItem) => currentItem.loadedQty > currentItem.deliveredQty && currentItem.deliveredQty < currentItem.orderQty) ??
        scannableItems.find((currentItem) => currentItem.deliveredQty >= currentItem.orderQty) ??
        scannableItems[0];

  if (input.mode === "deliver" && input.destinationId && item.destinationId !== input.destinationId) {
    const selectedDestination = job.destinations.find((currentDestination) => currentDestination.id === input.destinationId);
    const plannedDestination = job.destinations.find((currentDestination) => currentDestination.id === item.destinationId);
    const alert = prependAlert(
      job,
      "ผิดปลายทาง",
      formatWrongDestinationMessage(item, selectedDestination?.name || input.destinationId, plannedDestination?.name || item.destinationName),
      "สูง",
    );
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
      const alert = prependAlert(job, "สแกนซ้ำ", `${getJobItemLabel(item)} โหลดครบตามแผนแล้ว`, "กลาง");
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
    if (item.deliveredQty >= item.orderQty) {
      const alert = prependAlert(job, "ส่งซ้ำ", `${getJobItemLabel(item)} ส่งครบตามแผนแล้ว`, "กลาง");
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

    if (item.loadedQty <= item.deliveredQty) {
      const alert = prependAlert(job, "ยังไม่โหลดขึ้นรถ", `${getJobItemLabel(item)} ยังไม่มีจำนวนที่พร้อมส่ง`, "สูง");
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
  if (input.mode === "load") {
    lockOriginIfFullyLoaded(job, createdAt);
  }
  const scanSuccessMessage =
    input.mode === "load"
      ? `${getJobItemLabel(item)} ขึ้นรถแล้ว ${item.loadedQty}/${item.orderQty}`
      : `${getJobItemLabel(item)} ส่งแล้ว ${item.deliveredQty}/${item.orderQty}`;
  prependAlert(
    job,
    input.mode === "load" ? "สแกนขึ้นรถสำเร็จ" : "สแกนส่งสำเร็จ",
    scanSuccessMessage,
    "ผ่าน",
  );
  appendScanLog(job, {
    code,
    mode: input.mode,
    result: "ok",
    message: scanSuccessMessage,
    registryKey: item.registryKey,
    destinationId: item.destinationId,
    createdAt,
  });
  job.updatedAt = createdAt;
  updateJobStatus(job);

  const destination = job.destinations.find((currentDestination) => currentDestination.id === item.destinationId);
  const progressItems = job.items.filter((currentItem) => currentItem.destinationId === item.destinationId);
  const isDestinationFullyLoaded =
    input.mode === "load" &&
    progressItems.length > 0 &&
    progressItems.every((currentItem) => currentItem.loadedQty >= currentItem.orderQty);
  const isDestinationFullyDelivered =
    input.mode === "deliver" &&
    progressItems.length > 0 &&
    progressItems.every((currentItem) => currentItem.deliveredQty >= currentItem.orderQty);

  if (isDestinationFullyLoaded) {
    prependAlert(
      job,
      "โหลดปลายทางครบ",
      `${destination?.name || item.destinationName} สแกนขึ้นรถครบทุกกล่องแล้ว`,
      "ผ่าน",
    );
  }

  if (input.mode === "load" && isJobFullyLoaded(job)) {
    prependAlert(
      job,
      "โหลดครบทั้งงาน",
      "สินค้าขึ้นรถครบแล้ว ระบบปิดต้นทางให้อัตโนมัติ ห้ามเช็กอินต้นทางซ้ำ",
      "ผ่าน",
    );
  }

  if (isDestinationFullyDelivered) {
    prependAlert(
      job,
      "ส่งปลายทางครบ",
      `${destination?.name || item.destinationName} สแกนลงของครบทุกกล่องแล้ว`,
      "ผ่าน",
    );
  }

  if (job.status === "completed" && !job.completedAt) {
    job.completedAt = createdAt;
    job.purgeAfterAt = new Date(new Date(createdAt).getTime() + retentionWindowMs).toISOString();
    prependAlert(job, "ปิดงานสำเร็จ", "ส่งครบทุกปลายทางแล้ว ระบบปิดงานและย้ายเข้าประวัติงาน", "ผ่าน");
  }

  const destinationName = destination?.name || item.destinationName;
  const destinationCompletionMessage =
    input.mode === "load" && isDestinationFullyLoaded
      ? `\n${destinationName} โหลดปลายทางนี้ครบแล้ว`
      : input.mode === "deliver" && isDestinationFullyDelivered
        ? `\n${destinationName} ส่งปลายทางนี้ครบแล้ว`
        : "";

  return {
    job,
    result: "ok" as const,
    message:
      input.mode === "load"
        ? `${getJobItemLabel(item)} ขึ้นรถแล้ว ${item.loadedQty}/${item.orderQty}${destinationCompletionMessage}${isJobFullyLoaded(job) ? "\nโหลดครบแล้ว ระบบปิดต้นทางให้แล้ว ห้ามเช็กอินต้นทางซ้ำ" : ""}`
        : `${getJobItemLabel(item)} ส่งแล้ว ${item.deliveredQty}/${item.orderQty}${destinationCompletionMessage}`,
  };
}

async function listJobsFromDatabase() {
  triggerExpiredSharedDataCleanup();

  return withPostgresClient(async (client) => {
    const result = await client.query(`
      SELECT *
      FROM delivery_jobs
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
  triggerExpiredSharedDataCleanup();

  return withPostgresClient(async (client) => {
    const result = await client.query(`
      SELECT *
      FROM delivery_job_history
      ORDER BY archived_at DESC
    `);

    return result.rows
      .map((row) => mapDatabaseJobArchive(row))
      .filter((job) => jobMatchesHistoryFilters(job, filters))
      .map((job) => summarizeJobArchive(job));
  });
}

async function getJobFromDatabase(jobId: string) {
  triggerExpiredSharedDataCleanup();

  return withPostgresClient(async (client) => {
    const result = await client.query(
      `
        SELECT *
        FROM delivery_jobs
        WHERE delivery_job_id = $1
          AND completed_at IS NULL
      `,
      [jobId],
    );

    const row = result.rows[0];
    return row ? summarizeJob(mapDatabaseJob(row)) : null;
  });
}

async function getJobArchiveFromDatabase(jobId: string) {
  triggerExpiredSharedDataCleanup();

  return withPostgresClient(async (client) => {
    const result = await client.query(
      `
        SELECT *
        FROM delivery_job_history
        WHERE delivery_job_id = $1
      `,
      [jobId],
    );

    const row = result.rows[0];
    return row ? summarizeJobArchive(mapDatabaseJobArchive(row)) : null;
  });
}

async function deleteJobFromDatabase(jobId: string) {
  assertWritableStorage();

  return withPostgresTransaction(async (client) => {
    const result = await client.query(
      `
        SELECT *
        FROM delivery_jobs
        WHERE delivery_job_id = $1
          AND completed_at IS NULL
        FOR UPDATE
      `,
      [jobId],
    );
    const row = result.rows[0];

    if (!row) {
      return false;
    }

    const job = mapDatabaseJob(row);

    await client.query(
      `
        UPDATE purchase_order_queue
        SET
          record_state = 'active',
          assigned_delivery_job_id = NULL,
          assigned_to_job_at = NULL
        WHERE line_registry_key = ANY($1::text[])
          AND assigned_delivery_job_id = $2
          AND record_state = 'assigned'
      `,
      [job.poRegistryKeys, job.id],
    );

    await client.query(
      `
        DELETE FROM delivery_jobs
        WHERE delivery_job_id = $1
      `,
      [job.id],
    );

    return true;
  });
}

async function createJobInDatabase(input: {
  roomName?: string;
  driver: string;
  vehicle: string;
  origin: string;
  note?: string;
  registryKeys: string[];
  itemScanQuantities?: Record<string, number>;
  destinationAssignments?: Record<string, string>;
  destinationOverrides?: JobDestinationOverrideInput[];
}) {
  if (!input.registryKeys.length) {
    throw new Error("กรุณากลับไปเลือก PO ที่ต้องการสร้าง Job ก่อน");
  }

  assertWritableStorage();
  await cleanupExpiredSharedData();
  invalidatePORecordsPageCache();

  return withPostgresTransaction(async (client) => {
    const nowDate = new Date();
    const now = nowDate.toISOString();
    const sequenceResult = await client.query<{ value: string }>(`
      SELECT LPAD(nextval('delivery_job_sequence')::text, 6, '0') AS value
    `);
    const sequence = sequenceResult.rows[0]?.value ?? "000001";
    const jobId = `${buildJobId(nowDate)}-${sequence}`;
    const recordsResult = await client.query(
      `
        UPDATE purchase_order_queue
        SET
          record_state = 'assigned',
          assigned_delivery_job_id = $2,
          assigned_to_job_at = $3::timestamptz
        WHERE line_registry_key = ANY($1::text[])
          AND assigned_delivery_job_id IS NULL
          AND record_state = 'active'
        RETURNING *
      `,
      [input.registryKeys, jobId, now],
    );
    const availableRecords = recordsResult.rows.map(mapDatabasePORecord);

    if (!availableRecords.length) {
      throw new Error("รายการ PO ที่เลือกถูกใช้สร้าง Job แล้ว หรือไม่พร้อมสร้างงาน กรุณากลับไปเลือก PO ใหม่");
    }

    const baseItems = applyDestinationAssignments(
      buildJobItems(availableRecords, input.itemScanQuantities),
      input.destinationAssignments,
      input.destinationOverrides,
    );
    const baseDestinations = buildJobDestinations(baseItems);
    const { items, destinations } = applyDestinationOverrides(
      baseItems,
      baseDestinations,
      input.destinationOverrides,
    );

    const job: JobRecord = {
      id: jobId,
      roomName: input.roomName?.trim() || `ห้อง ${jobId}`,
      createdAt: now,
      updatedAt: now,
      status: "ready",
      driver: input.driver.trim(),
      vehicle: input.vehicle.trim(),
      origin: input.origin.trim(),
      originGps: "",
      allowOriginRecheckAfterLocked: false,
      allowDestinationBeforeFullyLoaded: false,
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
        INSERT INTO delivery_jobs (
          delivery_job_id,
          job_room_name,
          created_at,
          updated_at,
          job_status,
          driver_name,
          vehicle_plate,
          origin_location_name,
          origin_check_in_coordinates,
          allow_destination_before_fully_loaded,
          origin_locked_at,
          allow_origin_recheck_after_locked,
          job_note,
          selected_line_registry_keys,
          job_items_json,
          delivery_destinations_json,
          job_alerts_json,
          scan_events_json
        )
        VALUES (
          $1,
          $2,
          $3::timestamptz,
          $4::timestamptz,
          $5,
          $6,
          $7,
          $8,
          $9,
          $10,
          $11,
          $12,
          $13,
          $14::text[],
          $15::jsonb,
          $16::jsonb,
          $17::jsonb,
          $18::jsonb
        )
      `,
      [
        payload.delivery_job_id,
        payload.job_room_name,
        payload.created_at,
        payload.updated_at,
        payload.job_status,
        payload.driver_name,
        payload.vehicle_plate,
        payload.origin_location_name,
        payload.origin_check_in_coordinates,
        payload.allow_destination_before_fully_loaded,
        payload.origin_locked_at,
        payload.allow_origin_recheck_after_locked,
        payload.job_note,
        payload.selected_line_registry_keys,
        JSON.stringify(payload.job_items_json),
        JSON.stringify(payload.delivery_destinations_json),
        JSON.stringify(payload.job_alerts_json),
        JSON.stringify(payload.scan_events_json),
      ],
    );

    return summarizeJob(job);
  });
}

async function addPORecordsToJobInDatabase(input: {
  jobId: string;
  registryKeys: string[];
  itemScanQuantities?: Record<string, number>;
  destinationAssignments?: Record<string, string>;
  destinationOverrides?: JobDestinationOverrideInput[];
}) {
  if (!input.registryKeys.length) {
    throw new Error("กรุณาเลือก PO ที่ต้องการเพิ่มเข้า Job");
  }

  assertWritableStorage();
  invalidatePORecordsPageCache();

  return withPostgresTransaction(async (client) => {
    const jobResult = await client.query(
      `
        SELECT *
        FROM delivery_jobs
        WHERE delivery_job_id = $1
          AND completed_at IS NULL
        FOR UPDATE
      `,
      [input.jobId],
    );
    const row = jobResult.rows[0];

    if (!row) {
      throw new Error("ไม่พบ Job ที่ยังเปิดอยู่");
    }

    const recordsResult = await client.query(
      `
        UPDATE purchase_order_queue
        SET
          record_state = 'assigned',
          assigned_delivery_job_id = $2,
          assigned_to_job_at = NOW()
        WHERE line_registry_key = ANY($1::text[])
          AND assigned_delivery_job_id IS NULL
          AND record_state = 'active'
        RETURNING *
      `,
      [input.registryKeys, input.jobId],
    );
    const records = recordsResult.rows.map(mapDatabasePORecord);

    if (!records.length) {
      throw new Error("ไม่พบ PO ที่ยังว่างสำหรับเพิ่มเข้า Job");
    }

    const job = mapDatabaseJob(row);
    addPORecordsToJobRecord(job, records, input);
    const payload = serializeJobRecordForDatabase(job);

    await client.query(
      `
        UPDATE delivery_jobs
        SET
          updated_at = $2::timestamptz,
          job_status = $3,
          selected_line_registry_keys = $4::text[],
          job_items_json = $5::jsonb,
          delivery_destinations_json = $6::jsonb,
          job_alerts_json = $7::jsonb
        WHERE delivery_job_id = $1
      `,
      [
        payload.delivery_job_id,
        payload.updated_at,
        payload.job_status,
        payload.selected_line_registry_keys,
        JSON.stringify(payload.job_items_json),
        JSON.stringify(payload.delivery_destinations_json),
        JSON.stringify(payload.job_alerts_json),
      ],
    );

    return summarizeJob(job);
  });
}

async function updateJobDestinationOverrideInDatabase(input: {
  jobId: string;
  allowDestinationBeforeFullyLoaded: boolean;
}) {
  assertWritableStorage();

  return withPostgresTransaction(async (client) => {
    const result = await client.query(
      `
        SELECT *
        FROM delivery_jobs
        WHERE delivery_job_id = $1
          AND completed_at IS NULL
        FOR UPDATE
      `,
      [input.jobId],
    );
    const row = result.rows[0];

    if (!row) {
      throw new Error("ไม่พบ Job ที่เลือก");
    }

    const job = mapDatabaseJob(row);
    job.allowDestinationBeforeFullyLoaded = input.allowDestinationBeforeFullyLoaded;
    job.updatedAt = new Date().toISOString();

    await client.query(
      `
        UPDATE delivery_jobs
        SET
          allow_destination_before_fully_loaded = $2,
          updated_at = $3::timestamptz
        WHERE delivery_job_id = $1
      `,
      [job.id, Boolean(job.allowDestinationBeforeFullyLoaded), job.updatedAt],
    );

    return summarizeJob(job);
  });
}

async function updateJobOriginOverrideInDatabase(input: {
  jobId: string;
  allowOriginRecheckAfterLocked: boolean;
}) {
  assertWritableStorage();

  return withPostgresTransaction(async (client) => {
    const result = await client.query(
      `
        SELECT *
        FROM delivery_jobs
        WHERE delivery_job_id = $1
          AND completed_at IS NULL
        FOR UPDATE
      `,
      [input.jobId],
    );
    const row = result.rows[0];

    if (!row) {
      throw new Error("ไม่พบ Job ที่เลือก");
    }

    const job = mapDatabaseJob(row);
    job.allowOriginRecheckAfterLocked = input.allowOriginRecheckAfterLocked;
    job.updatedAt = new Date().toISOString();

    await client.query(
      `
        UPDATE delivery_jobs
        SET
          allow_origin_recheck_after_locked = $2,
          updated_at = $3::timestamptz
        WHERE delivery_job_id = $1
      `,
      [job.id, Boolean(job.allowOriginRecheckAfterLocked), job.updatedAt],
    );

    return summarizeJob(job);
  });
}

async function checkInJobOriginInDatabase(input: {
  jobId: string;
  latitude: number;
  longitude: number;
  accuracy?: number;
  locationText?: string;
}) {
  assertWritableStorage();

  return withPostgresTransaction(async (client) => {
    const result = await client.query(
      `
        SELECT *
        FROM delivery_jobs
        WHERE delivery_job_id = $1
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
        UPDATE delivery_jobs
        SET
          origin_check_in_coordinates = $2,
          origin_checked_in_at = $3::timestamptz,
          origin_locked_at = $4::timestamptz,
          allow_origin_recheck_after_locked = $5,
          updated_at = $6::timestamptz,
          job_alerts_json = $7::jsonb
        WHERE delivery_job_id = $1
      `,
      [
        job.id,
        job.originGps,
        job.originCheckedInAt ?? null,
        job.originLockedAt ?? null,
        Boolean(job.allowOriginRecheckAfterLocked),
        job.updatedAt,
        JSON.stringify(job.alerts),
      ],
    );

    return summarizeJob(job);
  });
}

async function updateJobItemScanQuantityInDatabase(input: {
  jobId: string;
  registryKey: string;
  scanQty: number;
}) {
  assertWritableStorage();

  return withPostgresTransaction(async (client) => {
    const result = await client.query(
      `
        SELECT *
        FROM delivery_jobs
        WHERE delivery_job_id = $1
          AND completed_at IS NULL
        FOR UPDATE
      `,
      [input.jobId],
    );
    const row = result.rows[0];

    if (!row) {
      throw new Error("ไม่พบ Job ที่เลือก");
    }

    const job = mapDatabaseJob(row);
    const item = job.items.find((currentItem) => currentItem.registryKey === input.registryKey);

    if (!item) {
      throw new Error("ไม่พบรายการที่ต้องการแก้ใน Job นี้");
    }

    item.orderQty = normalizeScanQty(input.scanQty, Math.max(item.loadedQty, item.deliveredQty, 0));
    job.updatedAt = new Date().toISOString();
    updateJobStatus(job);

    await client.query(
      `
        UPDATE delivery_jobs
        SET
          updated_at = $2::timestamptz,
          job_status = $3,
          job_items_json = $4::jsonb
        WHERE delivery_job_id = $1
      `,
      [job.id, job.updatedAt, job.status, JSON.stringify(job.items)],
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
  locationText?: string;
}) {
  assertWritableStorage();

  return withPostgresTransaction(async (client) => {
    const result = await client.query(
      `
        SELECT *
        FROM delivery_jobs
        WHERE delivery_job_id = $1
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
        UPDATE delivery_jobs
        SET
          delivery_destinations_json = $2::jsonb,
          updated_at = $3::timestamptz,
          job_alerts_json = $4::jsonb
        WHERE delivery_job_id = $1
      `,
      [job.id, JSON.stringify(job.destinations), job.updatedAt, JSON.stringify(job.alerts)],
    );

    return summarizeJob(job);
  });
}

async function clearUnusedDestinationCheckInInDatabase(input: {
  jobId: string;
  destinationId: string;
  nextDestinationId?: string;
}) {
  assertWritableStorage();

  return withPostgresTransaction(async (client) => {
    const result = await client.query(
      `
        SELECT *
        FROM delivery_jobs
        WHERE delivery_job_id = $1
        FOR UPDATE
      `,
      [input.jobId],
    );
    const row = result.rows[0];

    if (!row) {
      throw new Error("ไม่พบ Job ที่เลือก");
    }

    const response = applyUnusedDestinationCheckInClear(mapDatabaseJob(row), input);

    if (response.cleared) {
      await client.query(
        `
          UPDATE delivery_jobs
          SET
            delivery_destinations_json = $2::jsonb,
            updated_at = $3::timestamptz,
            job_alerts_json = $4::jsonb
          WHERE delivery_job_id = $1
        `,
        [response.job.id, JSON.stringify(response.job.destinations), response.job.updatedAt, JSON.stringify(response.job.alerts)],
      );
    }

    return {
      job: summarizeJob(response.job),
      cleared: response.cleared,
      message: response.message,
    };
  });
}

async function registerJobScanInDatabase(input: {
  jobId: string;
  code: string;
  mode: ScanMode;
  destinationId?: string;
}) {
  assertWritableStorage();

  const scanResult = await withPostgresTransaction(async (client) => {
    const result = await client.query(
      `
        SELECT *
        FROM delivery_jobs
        WHERE delivery_job_id = $1
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
        FROM delivery_jobs
        WHERE completed_at IS NULL
      `,
    );
    const allJobs = allJobsResult.rows.map((jobRow) => mapDatabaseJob(jobRow));

    const response = applyJobScan(job, {
      ...input,
      otherActiveJobs: allJobs,
    });

    if (response.job.status === "completed" && response.job.completedAt) {
      const completedRegistryKeys = getCompletedRegistryKeysForArchive(response.job);
      const skippedRegistryKeys = getSkippedRegistryKeysForRelease(response.job);
      const poRecordsResult = await client.query(
        `
          SELECT *
          FROM purchase_order_queue
          WHERE line_registry_key = ANY($1::text[])
          FOR UPDATE
        `,
        [response.job.poRegistryKeys],
      );
      const archiveJob = buildJobArchiveRecord(response.job);
      const archivePayload = serializeJobArchiveRecordForDatabase(archiveJob);
      const completedKeySet = new Set(completedRegistryKeys);
      const archivePORecords = poRecordsResult.rows
        .map(mapDatabasePORecord)
        .filter((record) => completedKeySet.has(record.registryKey))
        .map((record) => ({
          ...record,
          lifecycle: "completed" as const,
          archivedFromJobId: response.job.id,
          archivedAt: archiveJob.archivedAt,
          completedAt: response.job.completedAt,
          deleteAfterAt: archiveJob.deleteAfterAt,
        }));

      await client.query(
        `
          INSERT INTO delivery_job_history (
            delivery_job_id,
            job_room_name,
            created_at,
            updated_at,
            job_status,
            driver_name,
            vehicle_plate,
            origin_location_name,
            origin_check_in_coordinates,
            origin_checked_in_at,
            origin_locked_at,
            allow_origin_recheck_after_locked,
            allow_destination_before_fully_loaded,
            job_note,
            selected_line_registry_keys,
            job_items_json,
            delivery_destinations_json,
            job_alerts_json,
            scan_events_json,
            completed_at,
            archived_at,
            delete_after_at
          )
          VALUES (
            $1,
            $2,
            $3::timestamptz,
            $4::timestamptz,
            $5,
            $6,
            $7,
            $8,
            $9,
            $10::timestamptz,
            $11,
            $12,
            $13,
            $14,
            $15::text[],
            $16::jsonb,
            $17::jsonb,
            $18::jsonb,
            $19::jsonb,
            $20::timestamptz,
            $21::timestamptz,
            $22::timestamptz
          )
          ON CONFLICT (delivery_job_id) DO UPDATE
          SET
            created_at = EXCLUDED.created_at,
            job_room_name = EXCLUDED.job_room_name,
            updated_at = EXCLUDED.updated_at,
            job_status = EXCLUDED.job_status,
            driver_name = EXCLUDED.driver_name,
            vehicle_plate = EXCLUDED.vehicle_plate,
            origin_location_name = EXCLUDED.origin_location_name,
            origin_check_in_coordinates = EXCLUDED.origin_check_in_coordinates,
            origin_checked_in_at = EXCLUDED.origin_checked_in_at,
            origin_locked_at = EXCLUDED.origin_locked_at,
            allow_origin_recheck_after_locked = EXCLUDED.allow_origin_recheck_after_locked,
            allow_destination_before_fully_loaded = EXCLUDED.allow_destination_before_fully_loaded,
            job_note = EXCLUDED.job_note,
            selected_line_registry_keys = EXCLUDED.selected_line_registry_keys,
            job_items_json = EXCLUDED.job_items_json,
            delivery_destinations_json = EXCLUDED.delivery_destinations_json,
            job_alerts_json = EXCLUDED.job_alerts_json,
            scan_events_json = EXCLUDED.scan_events_json,
            completed_at = EXCLUDED.completed_at,
            archived_at = EXCLUDED.archived_at,
            delete_after_at = EXCLUDED.delete_after_at
        `,
        [
          archivePayload.delivery_job_id,
          archivePayload.job_room_name,
          archivePayload.created_at,
          archivePayload.updated_at,
          archivePayload.job_status,
          archivePayload.driver_name,
          archivePayload.vehicle_plate,
          archivePayload.origin_location_name,
          archivePayload.origin_check_in_coordinates,
          archivePayload.origin_checked_in_at,
          archivePayload.origin_locked_at,
          archivePayload.allow_origin_recheck_after_locked,
          archivePayload.allow_destination_before_fully_loaded,
          archivePayload.job_note,
          archivePayload.selected_line_registry_keys,
          JSON.stringify(archivePayload.job_items_json),
          JSON.stringify(archivePayload.delivery_destinations_json),
          JSON.stringify(archivePayload.job_alerts_json),
          JSON.stringify(archivePayload.scan_events_json),
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
                archived_from_delivery_job_id TEXT,
                line_registry_key TEXT,
                purchase_order_number TEXT,
                purchase_order_item_number TEXT,
                first_imported_at TIMESTAMPTZ,
                last_imported_at TIMESTAMPTZ,
                import_file_name TEXT,
                import_sheet_name TEXT,
                import_row_number INTEGER,
                document_status TEXT,
                vendor_name TEXT,
                web_order_number TEXT,
                plant_code TEXT,
                business_unit_name TEXT,
                material_code TEXT,
                material_name TEXT,
                ordered_quantity_text TEXT,
                received_quantity_text TEXT,
                total_amount_text TEXT,
                import_count INTEGER,
                record_state TEXT,
                assigned_delivery_job_id TEXT,
                assigned_to_job_at TIMESTAMPTZ,
                archived_at TIMESTAMPTZ,
                completed_at TIMESTAMPTZ,
                delete_after_at TIMESTAMPTZ
              )
            )
            INSERT INTO purchase_order_history (
              archived_from_delivery_job_id,
              line_registry_key,
              purchase_order_number,
              purchase_order_item_number,
              first_imported_at,
              last_imported_at,
              import_file_name,
              import_sheet_name,
              import_row_number,
              document_status,
              vendor_name,
              web_order_number,
              plant_code,
              business_unit_name,
              material_code,
              material_name,
              ordered_quantity_text,
              received_quantity_text,
              total_amount_text,
              import_count,
              record_state,
              assigned_delivery_job_id,
              assigned_to_job_at,
              archived_at,
              completed_at,
              delete_after_at
            )
            SELECT
              archived_from_delivery_job_id,
              line_registry_key,
              purchase_order_number,
              purchase_order_item_number,
              first_imported_at,
              last_imported_at,
              import_file_name,
              import_sheet_name,
              import_row_number,
              document_status,
              vendor_name,
              web_order_number,
              COALESCE(plant_code, '') AS plant_code,
              business_unit_name,
              material_code,
              material_name,
              ordered_quantity_text,
              received_quantity_text,
              total_amount_text,
              import_count,
              record_state,
              assigned_delivery_job_id,
              assigned_to_job_at,
              archived_at,
              completed_at,
              delete_after_at
            FROM incoming
            ON CONFLICT (archived_from_delivery_job_id, line_registry_key) DO UPDATE
            SET
              purchase_order_number = EXCLUDED.purchase_order_number,
              purchase_order_item_number = EXCLUDED.purchase_order_item_number,
              first_imported_at = EXCLUDED.first_imported_at,
              last_imported_at = EXCLUDED.last_imported_at,
              import_file_name = EXCLUDED.import_file_name,
              import_sheet_name = EXCLUDED.import_sheet_name,
              import_row_number = EXCLUDED.import_row_number,
              document_status = EXCLUDED.document_status,
              vendor_name = EXCLUDED.vendor_name,
              web_order_number = EXCLUDED.web_order_number,
              plant_code = EXCLUDED.plant_code,
              business_unit_name = EXCLUDED.business_unit_name,
              material_code = EXCLUDED.material_code,
              material_name = EXCLUDED.material_name,
              ordered_quantity_text = EXCLUDED.ordered_quantity_text,
              received_quantity_text = EXCLUDED.received_quantity_text,
              total_amount_text = EXCLUDED.total_amount_text,
              import_count = EXCLUDED.import_count,
              record_state = EXCLUDED.record_state,
              assigned_delivery_job_id = EXCLUDED.assigned_delivery_job_id,
              assigned_to_job_at = EXCLUDED.assigned_to_job_at,
              archived_at = EXCLUDED.archived_at,
              completed_at = EXCLUDED.completed_at,
              delete_after_at = EXCLUDED.delete_after_at
          `,
          [JSON.stringify(archivePORecords.map(serializePORegistryArchiveRecordForDatabase))],
        );
      }

      await client.query(
        `
          DELETE FROM delivery_jobs
          WHERE delivery_job_id = $1
        `,
        [response.job.id],
      );

      if (completedRegistryKeys.length) {
        await client.query(
          `
            DELETE FROM purchase_order_queue
            WHERE line_registry_key = ANY($1::text[])
          `,
          [completedRegistryKeys],
        );
      }

      if (skippedRegistryKeys.length) {
        await client.query(
          `
            UPDATE purchase_order_queue
            SET
              record_state = 'active',
              assigned_delivery_job_id = NULL,
              assigned_to_job_at = NULL,
              archived_at = NULL,
              completed_at = NULL,
              cleanup_after_at = NULL
            WHERE line_registry_key = ANY($1::text[])
              AND assigned_delivery_job_id = $2
          `,
          [skippedRegistryKeys, response.job.id],
        );
      }
    } else {
      const payload = serializeJobRecordForDatabase(response.job);

      await client.query(
        `
          UPDATE delivery_jobs
          SET
            updated_at = $2::timestamptz,
            job_status = $3,
            job_items_json = $4::jsonb,
            delivery_destinations_json = $5::jsonb,
            job_alerts_json = $6::jsonb,
            scan_events_json = $7::jsonb,
            allow_destination_before_fully_loaded = $8,
            origin_locked_at = $9::timestamptz,
            allow_origin_recheck_after_locked = $10,
            completed_at = $11::timestamptz,
            cleanup_after_at = $12::timestamptz
          WHERE delivery_job_id = $1
        `,
        [
          payload.delivery_job_id,
          payload.updated_at,
          payload.job_status,
          JSON.stringify(payload.job_items_json),
          JSON.stringify(payload.delivery_destinations_json),
          JSON.stringify(payload.job_alerts_json),
          JSON.stringify(payload.scan_events_json),
          payload.allow_destination_before_fully_loaded,
          payload.origin_locked_at,
          payload.allow_origin_recheck_after_locked,
          payload.completed_at,
          payload.cleanup_after_at,
        ],
      );
    }

    return {
      job: summarizeJob(response.job),
      result: response.result,
      message: response.message,
    };
  });

  if (scanResult.job.status === "completed") {
    invalidatePORecordsPageCache();
  }

  return scanResult;
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

export async function deleteJob(jobId: string) {
  if (hasSharedDatabase()) {
    return deleteJobFromDatabase(jobId);
  }

  assertWritableStorage();
  const store = await readStore();
  const job = store.jobs.find((currentJob) => currentJob.id === jobId && currentJob.status !== "completed");

  if (!job) {
    return false;
  }

  await releasePORecordsFromJob(job.poRegistryKeys, job.id);

  await writeStore({
    jobs: store.jobs.filter((currentJob) => currentJob.id !== job.id),
  });

  return true;
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
  roomName?: string;
  driver: string;
  vehicle: string;
  origin: string;
  note?: string;
  registryKeys: string[];
  itemScanQuantities?: Record<string, number>;
  destinationAssignments?: Record<string, string>;
  destinationOverrides?: JobDestinationOverrideInput[];
}) {
  if (hasSharedDatabase()) {
    return createJobInDatabase(input);
  }

  assertWritableStorage();
  const store = await readStore();
  const records = await getPORecordsByKeys(input.registryKeys);
  const availableRecords = records.filter((record) => !record.assignedJobId && record.lifecycle === "active");

  if (!availableRecords.length) {
    throw new Error("รายการ PO ที่เลือกถูกใช้สร้าง Job แล้ว หรือไม่พร้อมสร้างงาน กรุณากลับไปเลือก PO ใหม่");
  }

  const now = new Date().toISOString();
  const baseId = buildJobId(new Date());
  const duplicateCount = store.jobs.filter((job) => job.id.startsWith(baseId)).length;
  const jobId = duplicateCount ? `${baseId}-${duplicateCount + 1}` : baseId;
  const baseItems = applyDestinationAssignments(
    buildJobItems(availableRecords, input.itemScanQuantities),
    input.destinationAssignments,
    input.destinationOverrides,
  );
  const baseDestinations = buildJobDestinations(baseItems);
  const { items, destinations } = applyDestinationOverrides(
    baseItems,
    baseDestinations,
    input.destinationOverrides,
  );

  const job: JobRecord = {
    id: jobId,
    roomName: input.roomName?.trim() || `ห้อง ${jobId}`,
    createdAt: now,
    updatedAt: now,
    status: "ready",
    driver: input.driver.trim(),
    vehicle: input.vehicle.trim(),
    origin: input.origin.trim(),
    originGps: "",
    allowOriginRecheckAfterLocked: false,
    allowDestinationBeforeFullyLoaded: false,
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

export async function addPORecordsToJob(input: {
  jobId: string;
  registryKeys: string[];
  itemScanQuantities?: Record<string, number>;
  destinationAssignments?: Record<string, string>;
  destinationOverrides?: JobDestinationOverrideInput[];
}) {
  if (hasSharedDatabase()) {
    return addPORecordsToJobInDatabase(input);
  }

  if (!input.registryKeys.length) {
    throw new Error("กรุณาเลือก PO ที่ต้องการเพิ่มเข้า Job");
  }

  assertWritableStorage();
  const store = await readStore();
  const job = store.jobs.find((currentJob) => currentJob.id === input.jobId && currentJob.status !== "completed");

  if (!job) {
    throw new Error("ไม่พบ Job ที่ยังเปิดอยู่");
  }

  const records = await getPORecordsByKeys(input.registryKeys);
  const availableRecords = records.filter((record) => !record.assignedJobId && record.lifecycle === "active");

  if (!availableRecords.length) {
    throw new Error("ไม่พบ PO ที่ยังว่างสำหรับเพิ่มเข้า Job");
  }

  const addedItems = addPORecordsToJobRecord(job, availableRecords, input);
  await markPORecordsAssigned(addedItems.map((item) => item.registryKey), job.id);
  await writeStore(store);

  return summarizeJob(job);
}

export async function updateJobDestinationOverride(input: {
  jobId: string;
  allowDestinationBeforeFullyLoaded: boolean;
}) {
  if (hasSharedDatabase()) {
    return updateJobDestinationOverrideInDatabase(input);
  }

  assertWritableStorage();
  const store = await readStore();
  const job = store.jobs.find((currentJob) => currentJob.id === input.jobId && currentJob.status !== "completed");

  if (!job) {
    throw new Error("ไม่พบ Job ที่เลือก");
  }

  job.allowDestinationBeforeFullyLoaded = input.allowDestinationBeforeFullyLoaded;
  job.updatedAt = new Date().toISOString();

  await writeStore({ jobs: store.jobs });

  return summarizeJob(job);
}

export async function updateJobOriginOverride(input: {
  jobId: string;
  allowOriginRecheckAfterLocked: boolean;
}) {
  if (hasSharedDatabase()) {
    return updateJobOriginOverrideInDatabase(input);
  }

  assertWritableStorage();
  const store = await readStore();
  const job = store.jobs.find((currentJob) => currentJob.id === input.jobId && currentJob.status !== "completed");

  if (!job) {
    throw new Error("ไม่พบ Job ที่เลือก");
  }

  job.allowOriginRecheckAfterLocked = input.allowOriginRecheckAfterLocked;
  job.updatedAt = new Date().toISOString();

  await writeStore({ jobs: store.jobs });

  return summarizeJob(job);
}

export async function updateJobItemScanQuantity(input: {
  jobId: string;
  registryKey: string;
  scanQty: number;
}) {
  if (hasSharedDatabase()) {
    return updateJobItemScanQuantityInDatabase(input);
  }

  assertWritableStorage();
  const store = await readStore();
  const job = store.jobs.find((currentJob) => currentJob.id === input.jobId && currentJob.status !== "completed");

  if (!job) {
    throw new Error("ไม่พบ Job ที่เลือก");
  }

  const item = job.items.find((currentItem) => currentItem.registryKey === input.registryKey);

  if (!item) {
    throw new Error("ไม่พบรายการที่ต้องการแก้ใน Job นี้");
  }

  item.orderQty = normalizeScanQty(input.scanQty, Math.max(item.loadedQty, item.deliveredQty, 0));
  job.updatedAt = new Date().toISOString();
  updateJobStatus(job);

  await writeStore({ jobs: store.jobs });

  return summarizeJob(job);
}

export async function checkInJobOrigin(input: {
  jobId: string;
  latitude: number;
  longitude: number;
  accuracy?: number;
  locationText?: string;
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
  locationText?: string;
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

export async function clearUnusedDestinationCheckIn(input: {
  jobId: string;
  destinationId: string;
  nextDestinationId?: string;
}) {
  if (hasSharedDatabase()) {
    return clearUnusedDestinationCheckInInDatabase(input);
  }

  assertWritableStorage();
  const store = await readStore();
  const job = store.jobs.find((currentJob) => currentJob.id === input.jobId);

  if (!job) {
    throw new Error("ไม่พบ Job ที่เลือก");
  }

  const response = applyUnusedDestinationCheckInClear(job, input);
  if (response.cleared) {
    await writeStore(store);
  }

  return {
    job: summarizeJob(response.job),
    cleared: response.cleared,
    message: response.message,
  };
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
    const completedRegistryKeys = getCompletedRegistryKeysForArchive(response.job);
    const skippedRegistryKeys = getSkippedRegistryKeysForRelease(response.job);

    await archivePORecordsForCompletedJob({
      registryKeys: completedRegistryKeys,
      jobId: response.job.id,
      archivedAt: archiveJob.archivedAt,
      completedAt: response.job.completedAt ?? archiveJob.archivedAt,
      deleteAfterAt: archiveJob.deleteAfterAt,
    });
    await releasePORecordsFromJob(skippedRegistryKeys, response.job.id);
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
