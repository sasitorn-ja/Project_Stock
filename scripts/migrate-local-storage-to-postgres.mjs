import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Pool } from "pg";

const retentionWindowMs = 100 * 24 * 60 * 60 * 1000;
const schemaSql = `
  CREATE SEQUENCE IF NOT EXISTS job_sequence;

  CREATE TABLE IF NOT EXISTS po_registry (
    registry_key TEXT PRIMARY KEY,
    po_sap_no TEXT NOT NULL,
    po_sap_item TEXT NOT NULL,
    first_imported_at TIMESTAMPTZ NOT NULL,
    latest_imported_at TIMESTAMPTZ NOT NULL,
    source_file_name TEXT NOT NULL DEFAULT '',
    source_sheet_name TEXT NOT NULL DEFAULT '',
    row_number INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT '',
    vendor TEXT NOT NULL DEFAULT '',
    po_web_no TEXT NOT NULL DEFAULT '',
    unit_name TEXT NOT NULL DEFAULT '',
    material_code TEXT NOT NULL DEFAULT '',
    material_name TEXT NOT NULL DEFAULT '',
    order_qty TEXT NOT NULL DEFAULT '',
    received_qty TEXT NOT NULL DEFAULT '',
    total_amount TEXT NOT NULL DEFAULT '',
    import_count INTEGER NOT NULL DEFAULT 1,
    lifecycle TEXT NOT NULL DEFAULT 'active',
    assigned_job_id TEXT,
    assigned_at TIMESTAMPTZ,
    archived_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    purge_after_at TIMESTAMPTZ
  );

  CREATE TABLE IF NOT EXISTS jobs (
    id TEXT PRIMARY KEY,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL,
    status TEXT NOT NULL,
    driver TEXT NOT NULL DEFAULT '',
    vehicle TEXT NOT NULL DEFAULT '',
    origin TEXT NOT NULL DEFAULT '',
    origin_gps TEXT NOT NULL DEFAULT '',
    origin_checked_in_at TIMESTAMPTZ,
    note TEXT NOT NULL DEFAULT '',
    po_registry_keys TEXT[] NOT NULL DEFAULT '{}',
    items JSONB NOT NULL DEFAULT '[]'::jsonb,
    destinations JSONB NOT NULL DEFAULT '[]'::jsonb,
    alerts JSONB NOT NULL DEFAULT '[]'::jsonb,
    scan_logs JSONB NOT NULL DEFAULT '[]'::jsonb,
    completed_at TIMESTAMPTZ,
    purge_after_at TIMESTAMPTZ
  );

  CREATE TABLE IF NOT EXISTS job_archives (
    job_id TEXT PRIMARY KEY,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL,
    status TEXT NOT NULL,
    driver TEXT NOT NULL DEFAULT '',
    vehicle TEXT NOT NULL DEFAULT '',
    origin TEXT NOT NULL DEFAULT '',
    origin_gps TEXT NOT NULL DEFAULT '',
    origin_checked_in_at TIMESTAMPTZ,
    note TEXT NOT NULL DEFAULT '',
    po_registry_keys TEXT[] NOT NULL DEFAULT '{}',
    items JSONB NOT NULL DEFAULT '[]'::jsonb,
    destinations JSONB NOT NULL DEFAULT '[]'::jsonb,
    alerts JSONB NOT NULL DEFAULT '[]'::jsonb,
    scan_logs JSONB NOT NULL DEFAULT '[]'::jsonb,
    completed_at TIMESTAMPTZ,
    archived_at TIMESTAMPTZ NOT NULL,
    delete_after_at TIMESTAMPTZ NOT NULL
  );

  CREATE TABLE IF NOT EXISTS po_registry_archives (
    archived_from_job_id TEXT NOT NULL,
    registry_key TEXT NOT NULL,
    po_sap_no TEXT NOT NULL,
    po_sap_item TEXT NOT NULL,
    first_imported_at TIMESTAMPTZ NOT NULL,
    latest_imported_at TIMESTAMPTZ NOT NULL,
    source_file_name TEXT NOT NULL DEFAULT '',
    source_sheet_name TEXT NOT NULL DEFAULT '',
    row_number INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT '',
    vendor TEXT NOT NULL DEFAULT '',
    po_web_no TEXT NOT NULL DEFAULT '',
    unit_name TEXT NOT NULL DEFAULT '',
    material_code TEXT NOT NULL DEFAULT '',
    material_name TEXT NOT NULL DEFAULT '',
    order_qty TEXT NOT NULL DEFAULT '',
    received_qty TEXT NOT NULL DEFAULT '',
    total_amount TEXT NOT NULL DEFAULT '',
    import_count INTEGER NOT NULL DEFAULT 1,
    lifecycle TEXT NOT NULL DEFAULT 'completed',
    assigned_job_id TEXT,
    assigned_at TIMESTAMPTZ,
    archived_at TIMESTAMPTZ NOT NULL,
    completed_at TIMESTAMPTZ,
    delete_after_at TIMESTAMPTZ NOT NULL,
    PRIMARY KEY (archived_from_job_id, registry_key)
  );

  CREATE INDEX IF NOT EXISTS po_registry_active_idx
    ON po_registry (lifecycle, assigned_job_id, first_imported_at DESC);
  CREATE INDEX IF NOT EXISTS po_registry_lookup_idx
    ON po_registry (po_sap_no, po_sap_item);
  CREATE INDEX IF NOT EXISTS po_registry_material_idx
    ON po_registry (material_code);
  CREATE INDEX IF NOT EXISTS po_registry_purge_idx
    ON po_registry (purge_after_at);

  CREATE INDEX IF NOT EXISTS jobs_status_created_idx
    ON jobs (status, created_at DESC);
  CREATE INDEX IF NOT EXISTS jobs_purge_idx
    ON jobs (purge_after_at);
  CREATE INDEX IF NOT EXISTS job_archives_archived_idx
    ON job_archives (archived_at DESC);
  CREATE INDEX IF NOT EXISTS job_archives_delete_idx
    ON job_archives (delete_after_at);
  CREATE INDEX IF NOT EXISTS po_registry_archives_job_idx
    ON po_registry_archives (archived_from_job_id, archived_at DESC);
  CREATE INDEX IF NOT EXISTS po_registry_archives_delete_idx
    ON po_registry_archives (delete_after_at);
`;

function shouldUseSsl(connectionString) {
  if (!connectionString) {
    return false;
  }

  if (process.env.PGSSLMODE === "disable") {
    return false;
  }

  return !/(localhost|127\.0\.0\.1)/i.test(connectionString);
}

function isObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function expectString(record, key, context) {
  if (typeof record[key] !== "string") {
    throw new Error(`${context}: expected "${key}" to be a string`);
  }
}

function expectOptionalString(record, key, context) {
  if (record[key] !== undefined && typeof record[key] !== "string") {
    throw new Error(`${context}: expected "${key}" to be a string when present`);
  }
}

function expectNumber(record, key, context) {
  if (typeof record[key] !== "number" || Number.isNaN(record[key])) {
    throw new Error(`${context}: expected "${key}" to be a number`);
  }
}

function expectArray(record, key, context) {
  if (!Array.isArray(record[key])) {
    throw new Error(`${context}: expected "${key}" to be an array`);
  }
}

function isExpiredJob(job) {
  if (typeof job.purgeAfterAt !== "string" || !job.purgeAfterAt) {
    return false;
  }

  return new Date(job.purgeAfterAt).getTime() <= Date.now();
}

function validatePORecord(record, index) {
  const context = `po_registry.records[${index}]`;
  if (!isObject(record)) {
    throw new Error(`${context}: expected an object`);
  }

  [
    "registryKey",
    "poSapNo",
    "poSapItem",
    "firstImportedAt",
    "latestImportedAt",
    "sourceFileName",
    "sourceSheetName",
    "status",
    "vendor",
    "poWebNo",
    "unitName",
    "materialCode",
    "materialName",
    "orderQty",
    "receivedQty",
    "totalAmount",
    "lifecycle",
  ].forEach((key) => expectString(record, key, context));
  ["assignedJobId", "assignedAt", "archivedAt", "completedAt", "purgeAfterAt"].forEach((key) =>
    expectOptionalString(record, key, context),
  );
  expectNumber(record, "rowNumber", context);
  expectNumber(record, "importCount", context);
}

function validateJobRecord(record, index) {
  const context = `jobs.jobs[${index}]`;
  if (!isObject(record)) {
    throw new Error(`${context}: expected an object`);
  }

  ["id", "createdAt", "updatedAt", "status", "driver", "vehicle", "origin", "originGps", "note"].forEach((key) =>
    expectString(record, key, context),
  );
  ["originCheckedInAt", "completedAt", "purgeAfterAt"].forEach((key) => expectOptionalString(record, key, context));
  ["poRegistryKeys", "items", "destinations", "alerts", "scanLogs"].forEach((key) => expectArray(record, key, context));
}

async function readJsonFileIfExists(filePath) {
  try {
    return await readFile(filePath, "utf8");
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      return null;
    }

    throw error;
  }
}

async function loadPOStore(filePath) {
  const raw = await readJsonFileIfExists(filePath);
  if (raw === null) {
    return { records: [] };
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new Error(`Unable to parse ${path.basename(filePath)}: ${error instanceof Error ? error.message : String(error)}`);
  }

  if (!isObject(parsed) || !Array.isArray(parsed.records)) {
    throw new Error(`${path.basename(filePath)} must contain an object with a "records" array`);
  }

  parsed.records.forEach(validatePORecord);
  return { records: parsed.records };
}

async function loadJobStore(filePath) {
  const raw = await readJsonFileIfExists(filePath);
  if (raw === null) {
    return { jobs: [], skippedExpiredCount: 0 };
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new Error(`Unable to parse ${path.basename(filePath)}: ${error instanceof Error ? error.message : String(error)}`);
  }

  if (!isObject(parsed) || !Array.isArray(parsed.jobs)) {
    throw new Error(`${path.basename(filePath)} must contain an object with a "jobs" array`);
  }

  parsed.jobs.forEach(validateJobRecord);
  const jobs = parsed.jobs.filter((job) => !isExpiredJob(job));

  return {
    jobs,
    skippedExpiredCount: parsed.jobs.length - jobs.length,
  };
}

function serializePORecord(record) {
  return {
    registry_key: record.registryKey,
    po_sap_no: record.poSapNo,
    po_sap_item: record.poSapItem,
    first_imported_at: record.firstImportedAt,
    latest_imported_at: record.latestImportedAt,
    source_file_name: record.sourceFileName,
    source_sheet_name: record.sourceSheetName,
    row_number: record.rowNumber,
    status: record.status,
    vendor: record.vendor,
    po_web_no: record.poWebNo,
    unit_name: record.unitName,
    material_code: record.materialCode,
    material_name: record.materialName,
    order_qty: record.orderQty,
    received_qty: record.receivedQty,
    total_amount: record.totalAmount,
    import_count: record.importCount,
    lifecycle: record.lifecycle,
    assigned_job_id: record.assignedJobId ?? null,
    assigned_at: record.assignedAt ?? null,
    archived_at: record.archivedAt ?? null,
    completed_at: record.completedAt ?? null,
    purge_after_at: record.purgeAfterAt ?? null,
  };
}

function serializeJobRecord(job) {
  return {
    id: job.id,
    created_at: job.createdAt,
    updated_at: job.updatedAt,
    status: job.status,
    driver: job.driver,
    vehicle: job.vehicle,
    origin: job.origin,
    origin_gps: job.originGps,
    origin_checked_in_at: job.originCheckedInAt ?? null,
    note: job.note,
    po_registry_keys: job.poRegistryKeys,
    items: job.items,
    destinations: job.destinations,
    alerts: job.alerts,
    scan_logs: job.scanLogs,
    completed_at: job.completedAt ?? null,
    purge_after_at:
      job.purgeAfterAt ??
      (job.completedAt ? new Date(new Date(job.completedAt).getTime() + retentionWindowMs).toISOString() : null),
  };
}

async function main() {
  const apply = process.argv.includes("--apply");
  const databaseUrl = process.env.DATABASE_URL?.trim() ?? "";

  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required to migrate local storage into Postgres");
  }

  const currentFilePath = fileURLToPath(import.meta.url);
  const projectRoot = path.resolve(path.dirname(currentFilePath), "..");
  const poStorePath = path.join(projectRoot, "data", "po-registry.json");
  const jobStorePath = path.join(projectRoot, "data", "jobs.json");

  const [poStore, jobStore] = await Promise.all([loadPOStore(poStorePath), loadJobStore(jobStorePath)]);
  const poPayload = poStore.records.map(serializePORecord);
  const jobPayload = jobStore.jobs.map(serializeJobRecord);

  console.log(`Mode: ${apply ? "apply" : "dry-run"}`);
  console.log(`PO records ready to upsert: ${poPayload.length}`);
  console.log(`Jobs ready to upsert: ${jobPayload.length}`);
  if (jobStore.skippedExpiredCount > 0) {
    console.log(`Expired jobs skipped: ${jobStore.skippedExpiredCount}`);
  }

  if (!apply) {
    console.log("Dry-run complete. Re-run with --apply to write to Postgres.");
    return;
  }

  const pool = new Pool({
    connectionString: databaseUrl,
    max: 1,
    ssl: shouldUseSsl(databaseUrl) ? { rejectUnauthorized: false } : undefined,
  });

  try {
    const client = await pool.connect();

    try {
      await client.query("BEGIN");
      await client.query(schemaSql);

      if (poPayload.length > 0) {
        await client.query(
          `
            WITH incoming AS (
              SELECT *
              FROM json_to_recordset($1::json) AS data(
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
                purge_after_at TIMESTAMPTZ
              )
            )
            INSERT INTO po_registry (
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
              purge_after_at
            )
            SELECT
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
              purge_after_at
            FROM incoming
            ON CONFLICT (registry_key) DO UPDATE
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
              purge_after_at = EXCLUDED.purge_after_at
          `,
          [JSON.stringify(poPayload)],
        );
      }

      if (jobPayload.length > 0) {
        await client.query(
          `
            WITH incoming AS (
              SELECT *
              FROM json_to_recordset($1::json) AS data(
                id TEXT,
                created_at TIMESTAMPTZ,
                updated_at TIMESTAMPTZ,
                status TEXT,
                driver TEXT,
                vehicle TEXT,
                origin TEXT,
                origin_gps TEXT,
                origin_checked_in_at TIMESTAMPTZ,
                note TEXT,
                po_registry_keys TEXT[],
                items JSONB,
                destinations JSONB,
                alerts JSONB,
                scan_logs JSONB,
                completed_at TIMESTAMPTZ,
                purge_after_at TIMESTAMPTZ
              )
            )
            INSERT INTO jobs (
              id,
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
              purge_after_at
            )
            SELECT
              id,
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
              purge_after_at
            FROM incoming
            ON CONFLICT (id) DO UPDATE
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
              purge_after_at = EXCLUDED.purge_after_at
          `,
          [JSON.stringify(jobPayload)],
        );
      }

      await client.query("COMMIT");
      console.log("Migration complete.");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
