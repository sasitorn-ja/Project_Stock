import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  recordMatchesQuery,
  sortPORecords,
  type NewPORegistryRecord,
  type PORegistryArchiveRecord,
  type PORegistryRecord,
} from "@/lib/po-registry";
import { cleanupExpiredSharedData, hasSharedDatabase, withPostgresClient, withPostgresTransaction } from "@/lib/postgres-storage";
import {
  createStoredPORegistryRecord,
  mapDatabasePORecord,
  serializePORegistryRecordForDatabase,
} from "@/lib/shared-storage-payloads";
import { assertWritableStorage, canUseLocalFileStorage } from "@/lib/storage-config";

type PORegistryStore = {
  records: PORegistryRecord[];
};

type PORegistryArchiveStore = {
  records: PORegistryArchiveRecord[];
};

const dataDirectoryPath = path.join(process.cwd(), "data");
const dataFilePath = path.join(dataDirectoryPath, "po-registry.json");
const archiveDataFilePath = path.join(dataDirectoryPath, "po-registry-archives.json");
const searchableColumns = [
  "purchase_order_number",
  "purchase_order_item_number",
  "document_status",
  "vendor_name",
  "web_order_number",
  "business_unit_name",
  "material_code",
  "material_name",
] as const;

function buildSearchFilter(query: string, startIndex = 1) {
  const normalizedQuery = query.trim();

  if (!normalizedQuery) {
    return { clause: "", params: [] as string[] };
  }

  const searchValue = `%${normalizedQuery}%`;
  const comparisons = searchableColumns.map((column, index) => `${column} ILIKE $${startIndex + index}`);

  return {
    clause: ` AND (${comparisons.join(" OR ")})`,
    params: searchableColumns.map(() => searchValue),
  };
}

async function ensureStoreFile() {
  if (!canUseLocalFileStorage()) {
    return false;
  }

  await mkdir(dataDirectoryPath, { recursive: true });

  try {
    await readFile(dataFilePath, "utf8");
  } catch {
    await writeStore({ records: [] });
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
    await writeArchiveStore({ records: [] });
  }

  return true;
}

async function readStore() {
  if (!(await ensureStoreFile())) {
    return { records: [] };
  }

  const fileContents = await readFile(dataFilePath, "utf8");

  try {
    const parsed = JSON.parse(fileContents) as Partial<PORegistryStore>;

    return {
      records: Array.isArray(parsed.records) ? parsed.records : [],
    };
  } catch {
    return { records: [] };
  }
}

function isExpiredArchiveRecord(record: PORegistryArchiveRecord) {
  return new Date(record.deleteAfterAt).getTime() <= Date.now();
}

async function readArchiveStore() {
  if (!(await ensureArchiveStoreFile())) {
    return { records: [] };
  }

  const fileContents = await readFile(archiveDataFilePath, "utf8");

  try {
    const parsed = JSON.parse(fileContents) as Partial<PORegistryArchiveStore>;
    const storedRecords = Array.isArray(parsed.records) ? parsed.records : [];
    const records = storedRecords.filter((record) => !isExpiredArchiveRecord(record));

    if (records.length !== storedRecords.length) {
      await writeArchiveStore({ records });
    }

    return { records };
  } catch {
    return { records: [] };
  }
}

async function writeStore(store: PORegistryStore) {
  await mkdir(dataDirectoryPath, { recursive: true });

  const temporaryFilePath = `${dataFilePath}.tmp`;
  const contents = JSON.stringify(store, null, 2);

  await writeFile(temporaryFilePath, contents, "utf8");
  await rename(temporaryFilePath, dataFilePath);
}

async function writeArchiveStore(store: PORegistryArchiveStore) {
  await mkdir(dataDirectoryPath, { recursive: true });

  const temporaryFilePath = `${archiveDataFilePath}.tmp`;
  const contents = JSON.stringify(store, null, 2);

  await writeFile(temporaryFilePath, contents, "utf8");
  await rename(temporaryFilePath, archiveDataFilePath);
}

function buildPORegistryArchiveRecords(
  records: PORegistryRecord[],
  input: {
    jobId: string;
    archivedAt: string;
    completedAt: string;
    deleteAfterAt: string;
  },
): PORegistryArchiveRecord[] {
  return records.map((record) => ({
    ...record,
    lifecycle: "completed",
    archivedFromJobId: input.jobId,
    archivedAt: input.archivedAt,
    completedAt: input.completedAt,
    deleteAfterAt: input.deleteAfterAt,
    purgeAfterAt: undefined,
  }));
}

async function getPORegistryCountFromDatabase() {
  await cleanupExpiredSharedData();

  return withPostgresClient(async (client) => {
    const result = await client.query<{ count: string }>(`
      SELECT COUNT(*)::text AS count
      FROM purchase_order_queue
      WHERE assigned_delivery_job_id IS NULL
        AND record_state = 'active'
    `);

    return Number(result.rows[0]?.count ?? "0");
  });
}

async function getPORecordsPageFromDatabase({
  page,
  pageSize,
  query = "",
}: {
  page: number;
  pageSize: number;
  query?: string;
}) {
  await cleanupExpiredSharedData();

  return withPostgresClient(async (client) => {
    const safePage = Math.max(1, page);
    const skipCount = (safePage - 1) * pageSize;
    const search = buildSearchFilter(query);
    const baseWhere = `
      assigned_delivery_job_id IS NULL
      AND record_state = 'active'
      ${search.clause}
    `;

    const countResult = await client.query<{ count: string }>(
      `
        SELECT COUNT(*)::text AS count
        FROM purchase_order_queue
        WHERE ${baseWhere}
      `,
      search.params,
    );

    const rowsResult = await client.query(
      `
        SELECT *
        FROM purchase_order_queue
        WHERE ${baseWhere}
        ORDER BY first_imported_at DESC
        LIMIT $${search.params.length + 1}
        OFFSET $${search.params.length + 2}
      `,
      [...search.params, pageSize, skipCount],
    );

    return {
      records: rowsResult.rows.map(mapDatabasePORecord),
      totalCount: Number(countResult.rows[0]?.count ?? "0"),
    };
  });
}

async function getExistingPORecordsFromDatabase(registryKeys: string[]) {
  await cleanupExpiredSharedData();

  if (!registryKeys.length) {
    return [];
  }

  return withPostgresClient(async (client) => {
    const result = await client.query(
      `
        SELECT *
        FROM purchase_order_queue
        WHERE line_registry_key = ANY($1::text[])
          AND (
            (assigned_delivery_job_id IS NULL AND record_state = 'active')
            OR record_state = 'completed'
            OR EXISTS (
              SELECT 1
              FROM delivery_jobs job,
                jsonb_array_elements(job.job_items_json) AS item(value)
              WHERE job.delivery_job_id = purchase_order_queue.assigned_delivery_job_id
                AND item.value->>'registryKey' = purchase_order_queue.line_registry_key
                AND COALESCE((item.value->>'deliveredQty')::numeric, 0) > 0
            )
          )
        UNION ALL
        SELECT
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
          delete_after_at AS cleanup_after_at
        FROM purchase_order_history
        WHERE line_registry_key = ANY($1::text[])
      `,
      [registryKeys],
    );

    return result.rows.map(mapDatabasePORecord);
  });
}

async function getPORecordsByKeysFromDatabase(registryKeys: string[]) {
  await cleanupExpiredSharedData();

  if (!registryKeys.length) {
    return [];
  }

  return withPostgresClient(async (client) => {
    const result = await client.query(
      `
        SELECT *
        FROM purchase_order_queue
        WHERE line_registry_key = ANY($1::text[])
        ORDER BY first_imported_at DESC
      `,
      [registryKeys],
    );

    return result.rows.map(mapDatabasePORecord);
  });
}

async function getPORecordsByPoSapNosFromDatabase(poSapNos: string[]) {
  await cleanupExpiredSharedData();

  const normalizedPoSapNos = Array.from(new Set(poSapNos.map((poSapNo) => poSapNo.trim()).filter(Boolean)));

  if (!normalizedPoSapNos.length) {
    return [];
  }

  return withPostgresClient(async (client) => {
    const result = await client.query(
      `
        SELECT *
        FROM purchase_order_queue
        WHERE purchase_order_number = ANY($1::text[])
          AND assigned_delivery_job_id IS NULL
          AND record_state = 'active'
        ORDER BY purchase_order_number ASC, purchase_order_item_number ASC, first_imported_at DESC
      `,
      [normalizedPoSapNos],
    );

    return result.rows.map(mapDatabasePORecord);
  });
}

async function saveNewPORecordsToDatabase(records: NewPORegistryRecord[]) {
  if (!records.length) {
    return 0;
  }

  assertWritableStorage();
  await cleanupExpiredSharedData();

  const importedAt = new Date().toISOString();
  const payload = records
    .map((record) => createStoredPORegistryRecord(record, importedAt))
    .map(serializePORegistryRecordForDatabase);

  return withPostgresTransaction(async (client) => {
    const result = await client.query(
      `
        WITH incoming AS (
          SELECT *
          FROM json_to_recordset($1::json) AS data(
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
            cleanup_after_at TIMESTAMPTZ
          )
        )
        INSERT INTO purchase_order_queue (
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
          cleanup_after_at
        )
        SELECT
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
          cleanup_after_at
        FROM incoming
        ON CONFLICT (line_registry_key) DO UPDATE
        SET
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
          import_count = purchase_order_queue.import_count + 1,
          record_state = 'active',
          assigned_delivery_job_id = NULL,
          assigned_to_job_at = NULL,
          archived_at = NULL,
          completed_at = NULL,
          cleanup_after_at = NULL
        WHERE purchase_order_queue.record_state <> 'completed'
          AND purchase_order_queue.assigned_delivery_job_id IS NOT NULL
          AND NOT EXISTS (
            SELECT 1
            FROM delivery_jobs job,
              jsonb_array_elements(job.job_items_json) AS item(value)
            WHERE job.delivery_job_id = purchase_order_queue.assigned_delivery_job_id
              AND item.value->>'registryKey' = purchase_order_queue.line_registry_key
              AND COALESCE((item.value->>'deliveredQty')::numeric, 0) > 0
          )
        RETURNING line_registry_key
      `,
      [JSON.stringify(payload)],
    );

    return result.rowCount ?? 0;
  });
}

async function clearPORegistryInDatabase() {
  assertWritableStorage();

  await withPostgresTransaction(async (client) => {
    await client.query(`
      DELETE FROM purchase_order_queue
      WHERE assigned_delivery_job_id IS NULL
      AND record_state = 'active'
    `);
  });
}

async function deletePORecordsInDatabase(registryKeys: string[]) {
  if (!registryKeys.length) {
    return 0;
  }

  assertWritableStorage();

  return withPostgresTransaction(async (client) => {
    const result = await client.query(
      `
        DELETE FROM purchase_order_queue
        WHERE line_registry_key = ANY($1::text[])
        AND assigned_delivery_job_id IS NULL
        AND record_state = 'active'
      `,
      [registryKeys],
    );

    return result.rowCount ?? 0;
  });
}

async function markPORecordsAssignedInDatabase(registryKeys: string[], jobId: string) {
  if (!registryKeys.length) {
    return;
  }

  assertWritableStorage();

  await withPostgresTransaction(async (client) => {
    await client.query(
      `
        UPDATE purchase_order_queue
        SET
          record_state = 'assigned',
          assigned_delivery_job_id = $2,
          assigned_to_job_at = NOW()
        WHERE line_registry_key = ANY($1::text[])
      `,
      [registryKeys, jobId],
    );
  });
}

async function releasePORecordsFromJobInDatabase(registryKeys: string[], jobId: string) {
  if (!registryKeys.length || !jobId.trim()) {
    return;
  }

  assertWritableStorage();

  await withPostgresTransaction(async (client) => {
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
      [registryKeys, jobId],
    );
  });
}

async function markPORecordsCompletedInDatabase(registryKeys: string[]) {
  if (!registryKeys.length) {
    return;
  }

  assertWritableStorage();

  await withPostgresTransaction(async (client) => {
    await client.query(
      `
        UPDATE purchase_order_queue
        SET
          record_state = 'completed',
          archived_at = NOW(),
          completed_at = NOW(),
          cleanup_after_at = NOW() + INTERVAL '100 days'
        WHERE line_registry_key = ANY($1::text[])
      `,
      [registryKeys],
    );
  });
}

export async function getPORegistryCount() {
  if (hasSharedDatabase()) {
    return getPORegistryCountFromDatabase();
  }

  const store = await readStore();
  return store.records.filter((record) => !record.assignedJobId && record.lifecycle === "active").length;
}

export async function getPORecordsPage({
  page,
  pageSize,
  query = "",
}: {
  page: number;
  pageSize: number;
  query?: string;
}) {
  if (hasSharedDatabase()) {
    return getPORecordsPageFromDatabase({ page, pageSize, query });
  }

  const store = await readStore();
  const matchedRecords = sortPORecords(store.records).filter(
    (record) => !record.assignedJobId && record.lifecycle === "active" && recordMatchesQuery(record, query),
  );
  const safePage = Math.max(1, page);
  const skipCount = (safePage - 1) * pageSize;

  return {
    records: matchedRecords.slice(skipCount, skipCount + pageSize),
    totalCount: matchedRecords.length,
  };
}

export async function getExistingPORecords(registryKeys: string[]) {
  if (hasSharedDatabase()) {
    return getExistingPORecordsFromDatabase(registryKeys);
  }

  const store = await readStore();
  const uniqueKeys = new Set(registryKeys);

  return store.records.filter(
    (record) =>
      uniqueKeys.has(record.registryKey) &&
      ((!record.assignedJobId && record.lifecycle === "active") || record.lifecycle === "completed"),
  );
}

export async function getPORecordsByKeys(registryKeys: string[]) {
  if (hasSharedDatabase()) {
    return getPORecordsByKeysFromDatabase(registryKeys);
  }

  const store = await readStore();
  const uniqueKeys = new Set(registryKeys);

  return sortPORecords(store.records.filter((record) => uniqueKeys.has(record.registryKey)));
}

export async function getPORecordsByPoSapNos(poSapNos: string[]) {
  if (hasSharedDatabase()) {
    return getPORecordsByPoSapNosFromDatabase(poSapNos);
  }

  const normalizedPoSapNos = new Set(poSapNos.map((poSapNo) => poSapNo.trim()).filter(Boolean));

  if (!normalizedPoSapNos.size) {
    return [];
  }

  const store = await readStore();

  return sortPORecords(
    store.records.filter(
      (record) => normalizedPoSapNos.has(record.poSapNo) && !record.assignedJobId && record.lifecycle === "active",
    ),
  );
}

export async function saveNewPORecords(records: NewPORegistryRecord[]) {
  if (hasSharedDatabase()) {
    return saveNewPORecordsToDatabase(records);
  }

  if (!records.length) {
    return 0;
  }

  assertWritableStorage();

  const store = await readStore();
  const importedAt = new Date().toISOString();
  const incomingRecords = new Map(records.map((record) => [record.registryKey, record]));
  const existingRecords = new Map(store.records.map((record) => [record.registryKey, record]));
  let changedCount = 0;

  const restoredRecords = store.records.map((record) => {
    const incomingRecord = incomingRecords.get(record.registryKey);

    if (!incomingRecord || !record.assignedJobId || record.lifecycle === "completed") {
      return record;
    }

    changedCount += 1;

    return {
      ...record,
      ...incomingRecord,
      latestImportedAt: importedAt,
      importCount: record.importCount + 1,
      lifecycle: "active" as const,
      assignedJobId: undefined,
      assignedAt: undefined,
      archivedAt: undefined,
      completedAt: undefined,
      purgeAfterAt: undefined,
    };
  });

  const newRecords = records
    .filter((record) => {
      const existingRecord = existingRecords.get(record.registryKey);

      if (!existingRecord) {
        return true;
      }

      return false;
    })
    .map((record) => createStoredPORegistryRecord(record, importedAt));

  changedCount += newRecords.length;

  if (!changedCount) {
    return 0;
  }

  await writeStore({
    records: [...restoredRecords, ...newRecords],
  });

  return changedCount;
}

export async function clearPORegistry() {
  if (hasSharedDatabase()) {
    return clearPORegistryInDatabase();
  }

  assertWritableStorage();
  const store = await readStore();

  await writeStore({
    records: store.records.filter((record) => record.assignedJobId || record.lifecycle !== "active"),
  });
}

export async function deletePORecords(registryKeys: string[]) {
  if (hasSharedDatabase()) {
    return deletePORecordsInDatabase(registryKeys);
  }

  if (!registryKeys.length) {
    return 0;
  }

  assertWritableStorage();
  const store = await readStore();
  const uniqueKeys = new Set(registryKeys);
  const records = store.records.filter(
    (record) => !uniqueKeys.has(record.registryKey) || record.assignedJobId || record.lifecycle !== "active",
  );

  await writeStore({ records });

  return store.records.length - records.length;
}

export async function markPORecordsAssigned(registryKeys: string[], jobId: string) {
  if (hasSharedDatabase()) {
    return markPORecordsAssignedInDatabase(registryKeys, jobId);
  }

  assertWritableStorage();
  const store = await readStore();
  const uniqueKeys = new Set(registryKeys);
  const assignedAt = new Date().toISOString();

  const records = store.records.map((record) =>
    uniqueKeys.has(record.registryKey)
      ? {
          ...record,
          lifecycle: "assigned" as const,
          assignedJobId: jobId,
          assignedAt,
        }
      : record,
  );

  await writeStore({ records });
}

export async function releasePORecordsFromJob(registryKeys: string[], jobId: string) {
  if (hasSharedDatabase()) {
    return releasePORecordsFromJobInDatabase(registryKeys, jobId);
  }

  if (!registryKeys.length || !jobId.trim()) {
    return;
  }

  assertWritableStorage();
  const store = await readStore();
  const uniqueKeys = new Set(registryKeys);

  const records = store.records.map((record) =>
    uniqueKeys.has(record.registryKey) && record.assignedJobId === jobId && record.lifecycle === "assigned"
      ? {
          ...record,
          lifecycle: "active" as const,
          assignedJobId: undefined,
          assignedAt: undefined,
        }
      : record,
  );

  await writeStore({ records });
}

export async function markPORecordsCompleted(registryKeys: string[]) {
  if (hasSharedDatabase()) {
    return markPORecordsCompletedInDatabase(registryKeys);
  }

  assertWritableStorage();
  const store = await readStore();
  const uniqueKeys = new Set(registryKeys);
  const completedAt = new Date().toISOString();
  const purgeAfterAt = new Date(Date.now() + 100 * 24 * 60 * 60 * 1000).toISOString();

  const records = store.records.map((record) =>
    uniqueKeys.has(record.registryKey)
      ? {
          ...record,
          lifecycle: "completed" as const,
          archivedAt: completedAt,
          completedAt,
          purgeAfterAt,
        }
      : record,
  );

  await writeStore({ records });
}

export async function archivePORecordsForCompletedJob(input: {
  registryKeys: string[];
  jobId: string;
  archivedAt: string;
  completedAt: string;
  deleteAfterAt: string;
}) {
  if (!input.registryKeys.length) {
    return;
  }

  assertWritableStorage();
  const store = await readStore();
  const archiveStore = await readArchiveStore();
  const uniqueKeys = new Set(input.registryKeys);
  const matchingRecords = store.records.filter((record) => uniqueKeys.has(record.registryKey));
  const remainingRecords = store.records.filter((record) => !uniqueKeys.has(record.registryKey));
  const archiveRecords = buildPORegistryArchiveRecords(matchingRecords, input);

  await writeArchiveStore({
    records: [
      ...archiveStore.records.filter(
        (record) => !(record.archivedFromJobId === input.jobId && uniqueKeys.has(record.registryKey)),
      ),
      ...archiveRecords,
    ],
  });
  await writeStore({ records: remainingRecords });
}
