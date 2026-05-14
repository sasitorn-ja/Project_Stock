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
        ON CONFLICT (line_registry_key) DO NOTHING
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
  return store.records.length;
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

  return store.records.filter((record) => uniqueKeys.has(record.registryKey));
}

export async function getPORecordsByKeys(registryKeys: string[]) {
  if (hasSharedDatabase()) {
    return getPORecordsByKeysFromDatabase(registryKeys);
  }

  const store = await readStore();
  const uniqueKeys = new Set(registryKeys);

  return sortPORecords(store.records.filter((record) => uniqueKeys.has(record.registryKey)));
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
  const existingKeys = new Set(store.records.map((record) => record.registryKey));
  const newRecords: PORegistryRecord[] = [];
  const importedAt = new Date().toISOString();

  records.forEach((record) => {
    if (existingKeys.has(record.registryKey)) {
      return;
    }

    newRecords.push(createStoredPORegistryRecord(record, importedAt));
    existingKeys.add(record.registryKey);
  });

  if (!newRecords.length) {
    return 0;
  }

  await writeStore({
    records: [...store.records, ...newRecords],
  });

  return newRecords.length;
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
