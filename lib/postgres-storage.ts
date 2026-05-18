import { Pool, type PoolClient, type PoolConfig } from "pg";

const DATABASE_URL = process.env.DATABASE_URL?.trim() ?? "";
const hasDatabaseUrl = DATABASE_URL.length > 0;

let pool: Pool | null = null;
let schemaInitializationPromise: Promise<void> | null = null;
const schemaInitializationLockKey = 24_051_806;
let lastCleanupAt = Date.now();
let cleanupPromise: Promise<void> | null = null;
const cleanupIntervalMs = 5 * 60 * 1000;

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
    CREATE SEQUENCE IF NOT EXISTS delivery_job_sequence;

    CREATE TABLE IF NOT EXISTS purchase_order_queue (
      line_registry_key TEXT PRIMARY KEY,
      purchase_order_number TEXT NOT NULL,
      purchase_order_item_number TEXT NOT NULL,
      first_imported_at TIMESTAMPTZ NOT NULL,
      last_imported_at TIMESTAMPTZ NOT NULL,
      import_file_name TEXT NOT NULL DEFAULT '',
      import_sheet_name TEXT NOT NULL DEFAULT '',
      import_row_number INTEGER NOT NULL DEFAULT 0,
      document_status TEXT NOT NULL DEFAULT '',
      vendor_name TEXT NOT NULL DEFAULT '',
      web_order_number TEXT NOT NULL DEFAULT '',
      business_unit_name TEXT NOT NULL DEFAULT '',
      material_code TEXT NOT NULL DEFAULT '',
      material_name TEXT NOT NULL DEFAULT '',
      ordered_quantity_text TEXT NOT NULL DEFAULT '',
      received_quantity_text TEXT NOT NULL DEFAULT '',
      total_amount_text TEXT NOT NULL DEFAULT '',
      import_count INTEGER NOT NULL DEFAULT 1,
      record_state TEXT NOT NULL DEFAULT 'active',
      assigned_delivery_job_id TEXT,
      assigned_to_job_at TIMESTAMPTZ,
      archived_at TIMESTAMPTZ,
      completed_at TIMESTAMPTZ,
      cleanup_after_at TIMESTAMPTZ
    );

    CREATE TABLE IF NOT EXISTS delivery_jobs (
      delivery_job_id TEXT PRIMARY KEY,
      job_room_name TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL,
      job_status TEXT NOT NULL,
      driver_name TEXT NOT NULL DEFAULT '',
      vehicle_plate TEXT NOT NULL DEFAULT '',
      origin_location_name TEXT NOT NULL DEFAULT '',
      origin_check_in_coordinates TEXT NOT NULL DEFAULT '',
      origin_checked_in_at TIMESTAMPTZ,
      origin_locked_at TIMESTAMPTZ,
      allow_origin_recheck_after_locked BOOLEAN NOT NULL DEFAULT FALSE,
      allow_destination_before_fully_loaded BOOLEAN NOT NULL DEFAULT FALSE,
      job_note TEXT NOT NULL DEFAULT '',
      selected_line_registry_keys TEXT[] NOT NULL DEFAULT '{}',
      job_items_json JSONB NOT NULL DEFAULT '[]'::jsonb,
      delivery_destinations_json JSONB NOT NULL DEFAULT '[]'::jsonb,
      job_alerts_json JSONB NOT NULL DEFAULT '[]'::jsonb,
      scan_events_json JSONB NOT NULL DEFAULT '[]'::jsonb,
      completed_at TIMESTAMPTZ,
      cleanup_after_at TIMESTAMPTZ
    );

    CREATE TABLE IF NOT EXISTS delivery_job_history (
      delivery_job_id TEXT PRIMARY KEY,
      job_room_name TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL,
      job_status TEXT NOT NULL,
      driver_name TEXT NOT NULL DEFAULT '',
      vehicle_plate TEXT NOT NULL DEFAULT '',
      origin_location_name TEXT NOT NULL DEFAULT '',
      origin_check_in_coordinates TEXT NOT NULL DEFAULT '',
      origin_checked_in_at TIMESTAMPTZ,
      origin_locked_at TIMESTAMPTZ,
      allow_origin_recheck_after_locked BOOLEAN NOT NULL DEFAULT FALSE,
      allow_destination_before_fully_loaded BOOLEAN NOT NULL DEFAULT FALSE,
      job_note TEXT NOT NULL DEFAULT '',
      selected_line_registry_keys TEXT[] NOT NULL DEFAULT '{}',
      job_items_json JSONB NOT NULL DEFAULT '[]'::jsonb,
      delivery_destinations_json JSONB NOT NULL DEFAULT '[]'::jsonb,
      job_alerts_json JSONB NOT NULL DEFAULT '[]'::jsonb,
      scan_events_json JSONB NOT NULL DEFAULT '[]'::jsonb,
      completed_at TIMESTAMPTZ,
      archived_at TIMESTAMPTZ NOT NULL,
      delete_after_at TIMESTAMPTZ NOT NULL
    );

    CREATE TABLE IF NOT EXISTS purchase_order_history (
      archived_from_delivery_job_id TEXT NOT NULL,
      line_registry_key TEXT NOT NULL,
      purchase_order_number TEXT NOT NULL,
      purchase_order_item_number TEXT NOT NULL,
      first_imported_at TIMESTAMPTZ NOT NULL,
      last_imported_at TIMESTAMPTZ NOT NULL,
      import_file_name TEXT NOT NULL DEFAULT '',
      import_sheet_name TEXT NOT NULL DEFAULT '',
      import_row_number INTEGER NOT NULL DEFAULT 0,
      document_status TEXT NOT NULL DEFAULT '',
      vendor_name TEXT NOT NULL DEFAULT '',
      web_order_number TEXT NOT NULL DEFAULT '',
      business_unit_name TEXT NOT NULL DEFAULT '',
      material_code TEXT NOT NULL DEFAULT '',
      material_name TEXT NOT NULL DEFAULT '',
      ordered_quantity_text TEXT NOT NULL DEFAULT '',
      received_quantity_text TEXT NOT NULL DEFAULT '',
      total_amount_text TEXT NOT NULL DEFAULT '',
      import_count INTEGER NOT NULL DEFAULT 1,
      record_state TEXT NOT NULL DEFAULT 'completed',
      assigned_delivery_job_id TEXT,
      assigned_to_job_at TIMESTAMPTZ,
      archived_at TIMESTAMPTZ NOT NULL,
      completed_at TIMESTAMPTZ,
      delete_after_at TIMESTAMPTZ NOT NULL,
      PRIMARY KEY (archived_from_delivery_job_id, line_registry_key)
    );

    ALTER TABLE delivery_jobs
      ADD COLUMN IF NOT EXISTS job_room_name TEXT NOT NULL DEFAULT '';

    ALTER TABLE delivery_job_history
      ADD COLUMN IF NOT EXISTS job_room_name TEXT NOT NULL DEFAULT '';

    ALTER TABLE delivery_jobs
      ADD COLUMN IF NOT EXISTS allow_destination_before_fully_loaded BOOLEAN NOT NULL DEFAULT FALSE;

    ALTER TABLE delivery_job_history
      ADD COLUMN IF NOT EXISTS allow_destination_before_fully_loaded BOOLEAN NOT NULL DEFAULT FALSE;

    ALTER TABLE delivery_jobs
      ADD COLUMN IF NOT EXISTS origin_locked_at TIMESTAMPTZ;

    ALTER TABLE delivery_job_history
      ADD COLUMN IF NOT EXISTS origin_locked_at TIMESTAMPTZ;

    ALTER TABLE delivery_jobs
      ADD COLUMN IF NOT EXISTS allow_origin_recheck_after_locked BOOLEAN NOT NULL DEFAULT FALSE;

    ALTER TABLE delivery_job_history
      ADD COLUMN IF NOT EXISTS allow_origin_recheck_after_locked BOOLEAN NOT NULL DEFAULT FALSE;

    CREATE INDEX IF NOT EXISTS purchase_order_queue_active_idx
      ON purchase_order_queue (record_state, assigned_delivery_job_id, first_imported_at DESC);
    CREATE INDEX IF NOT EXISTS purchase_order_queue_lookup_idx
      ON purchase_order_queue (purchase_order_number, purchase_order_item_number);
    CREATE INDEX IF NOT EXISTS purchase_order_queue_material_idx
      ON purchase_order_queue (material_code);
    CREATE INDEX IF NOT EXISTS purchase_order_queue_cleanup_idx
      ON purchase_order_queue (cleanup_after_at);

    CREATE INDEX IF NOT EXISTS delivery_jobs_status_created_idx
      ON delivery_jobs (job_status, created_at DESC);
    CREATE INDEX IF NOT EXISTS delivery_jobs_cleanup_idx
      ON delivery_jobs (cleanup_after_at);
    CREATE INDEX IF NOT EXISTS delivery_job_history_archived_idx
      ON delivery_job_history (archived_at DESC);
    CREATE INDEX IF NOT EXISTS delivery_job_history_delete_idx
      ON delivery_job_history (delete_after_at);
    CREATE INDEX IF NOT EXISTS purchase_order_history_job_idx
      ON purchase_order_history (archived_from_delivery_job_id, archived_at DESC);
    CREATE INDEX IF NOT EXISTS purchase_order_history_delete_idx
      ON purchase_order_history (delete_after_at);
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
        await client.query("SELECT pg_advisory_lock($1)", [schemaInitializationLockKey]);
        await createSchema(client);
      } finally {
        await client.query("SELECT pg_advisory_unlock($1)", [schemaInitializationLockKey]).catch(() => {});
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

  const now = Date.now();
  if (cleanupPromise) {
    return cleanupPromise;
  }

  if (now - lastCleanupAt < cleanupIntervalMs) {
    return;
  }

  cleanupPromise = withPostgresTransaction(async (client) => {
    await client.query(`
      DELETE FROM purchase_order_history
      WHERE delete_after_at <= NOW()
    `);

    await client.query(`
      DELETE FROM delivery_job_history
      WHERE delete_after_at <= NOW()
    `);

    await client.query(`
      DELETE FROM delivery_jobs
      WHERE cleanup_after_at IS NOT NULL
        AND cleanup_after_at <= NOW()
    `);

    await client.query(`
      DELETE FROM purchase_order_queue
      WHERE cleanup_after_at IS NOT NULL
        AND cleanup_after_at <= NOW()
    `);
  })
    .then(() => {
      lastCleanupAt = Date.now();
    })
    .finally(() => {
      cleanupPromise = null;
    });

  await cleanupPromise;
}
