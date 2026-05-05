import { Pool, type PoolClient, type PoolConfig } from "pg";

const DATABASE_URL = process.env.DATABASE_URL?.trim() ?? "";
const hasDatabaseUrl = DATABASE_URL.length > 0;

let pool: Pool | null = null;
let schemaInitializationPromise: Promise<void> | null = null;

function shouldUseSsl(connectionString: string) {
  if (!connectionString) {
    return false;
  }

  if (process.env.PGSSLMODE === "disable") {
    return false;
  }

  return !/(localhost|127\.0\.0\.1)/i.test(connectionString);
}

function getPoolConfig(): PoolConfig {
  return {
    connectionString: DATABASE_URL,
    max: 10,
    ssl: shouldUseSsl(DATABASE_URL) ? { rejectUnauthorized: false } : undefined,
  };
}

function getPool() {
  if (!hasDatabaseUrl) {
    throw new Error("DATABASE_URL ยังไม่ได้ตั้งค่า");
  }

  if (!pool) {
    pool = new Pool(getPoolConfig());
  }

  return pool;
}

async function createSchema(client: PoolClient) {
  await client.query(`
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
  `);
}

export function hasSharedDatabase() {
  return hasDatabaseUrl;
}

export async function ensurePostgresSchema() {
  if (!hasSharedDatabase()) {
    return;
  }

  if (!schemaInitializationPromise) {
    schemaInitializationPromise = (async () => {
      const client = await getPool().connect();

      try {
        await createSchema(client);
      } finally {
        client.release();
      }
    })().catch((error) => {
      schemaInitializationPromise = null;
      throw error;
    });
  }

  await schemaInitializationPromise;
}

export async function withPostgresClient<T>(callback: (client: PoolClient) => Promise<T>) {
  await ensurePostgresSchema();
  const client = await getPool().connect();

  try {
    return await callback(client);
  } finally {
    client.release();
  }
}

export async function withPostgresTransaction<T>(callback: (client: PoolClient) => Promise<T>) {
  return withPostgresClient(async (client) => {
    await client.query("BEGIN");

    try {
      const result = await callback(client);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  });
}

export async function cleanupExpiredSharedData() {
  if (!hasSharedDatabase()) {
    return;
  }

  await withPostgresTransaction(async (client) => {
    await client.query(`
      DELETE FROM po_registry_archives
      WHERE delete_after_at <= NOW()
    `);

    await client.query(`
      DELETE FROM job_archives
      WHERE delete_after_at <= NOW()
    `);

    await client.query(`
      DELETE FROM jobs
      WHERE purge_after_at IS NOT NULL
        AND purge_after_at <= NOW()
    `);

    await client.query(`
      DELETE FROM po_registry
      WHERE purge_after_at IS NOT NULL
        AND purge_after_at <= NOW()
    `);
  });
}
