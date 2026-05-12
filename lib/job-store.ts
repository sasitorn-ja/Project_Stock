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
  await cleanupExpiredSharedData();

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
  await cleanupExpiredSharedData();

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
  await cleanupExpiredSharedData();

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
        FROM purchase_order_queue
        WHERE line_registry_key = ANY($1::text[])
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
      SELECT LPAD(nextval('delivery_job_sequence')::text, 6, '0') AS value
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
        UPDATE purchase_order_queue
        SET
          record_state = 'assigned',
          assigned_delivery_job_id = $2,
          assigned_to_job_at = $3::timestamptz
        WHERE line_registry_key = ANY($1::text[])
      `,
      [job.poRegistryKeys, job.id, now],
    );

    await client.query(
      `
        INSERT INTO delivery_jobs (
          delivery_job_id,
          created_at,
          updated_at,
          job_status,
          driver_name,
          vehicle_plate,
          origin_location_name,
          origin_check_in_coordinates,
          job_note,
          selected_line_registry_keys,
          job_items_json,
          delivery_destinations_json,
          job_alerts_json,
          scan_events_json
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
        payload.delivery_job_id,
        payload.created_at,
        payload.updated_at,
        payload.job_status,
        payload.driver_name,
        payload.vehicle_plate,
        payload.origin_location_name,
        payload.origin_check_in_coordinates,
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
          updated_at = $4::timestamptz
        WHERE delivery_job_id = $1
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
          updated_at = $3::timestamptz
        WHERE delivery_job_id = $1
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
          INSERT INTO delivery_job_history (
            delivery_job_id,
            created_at,
            updated_at,
            job_status,
            driver_name,
            vehicle_plate,
            origin_location_name,
            origin_check_in_coordinates,
            origin_checked_in_at,
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
          ON CONFLICT (delivery_job_id) DO UPDATE
          SET
            created_at = EXCLUDED.created_at,
            updated_at = EXCLUDED.updated_at,
            job_status = EXCLUDED.job_status,
            driver_name = EXCLUDED.driver_name,
            vehicle_plate = EXCLUDED.vehicle_plate,
            origin_location_name = EXCLUDED.origin_location_name,
            origin_check_in_coordinates = EXCLUDED.origin_check_in_coordinates,
            origin_checked_in_at = EXCLUDED.origin_checked_in_at,
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
          archivePayload.created_at,
          archivePayload.updated_at,
          archivePayload.job_status,
          archivePayload.driver_name,
          archivePayload.vehicle_plate,
          archivePayload.origin_location_name,
          archivePayload.origin_check_in_coordinates,
          archivePayload.origin_checked_in_at,
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

      await client.query(
        `
          DELETE FROM purchase_order_queue
          WHERE line_registry_key = ANY($1::text[])
        `,
        [response.job.poRegistryKeys],
      );
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
            completed_at = $8::timestamptz,
            cleanup_after_at = $9::timestamptz
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
