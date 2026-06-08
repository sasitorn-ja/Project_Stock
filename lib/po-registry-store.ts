import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  recordMatchesQuery,
  sortPORecords,
  type NewPORegistryRecord,
  type PORegistryArchiveRecord,
  type PORegistryRecord,
} from "@/lib/po-registry";
import {
  cleanupExpiredSharedData,
  hasMySQLDatabase,
  hasSharedDatabase,
  triggerExpiredSharedDataCleanup,
  type MySQLClient,
  type MySQLResult,
  type MySQLRows,
  withMySQLClient,
  withMySQLTransaction,
  withPostgresClient,
  withPostgresTransaction,
} from "@/lib/postgres-storage";
import {
  createStoredPORegistryRecord,
  mapDatabaseJobArchive,
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
const existingPORecordsCacheTtlMs = 30_000;
const existingPORecordsCache = new Map<
  string,
  {
    expiresAt: number;
    promise: Promise<PORegistryRecord[]>;
  }
>();
const searchableColumns = [
  "purchase_order_number",
  "purchase_order_item_number",
  "document_status",
  "vendor_name",
  "web_order_number",
  "plant_code",
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

function buildNumericTextExpression(column: string) {
  const normalizedColumn = `regexp_replace(${column}, '[^0-9.-]', '', 'g')`;

  return `
    CASE
      WHEN ${normalizedColumn} ~ '^-?[0-9]+(\\.[0-9]+)?$'
      THEN ${normalizedColumn}::numeric
      ELSE NULL
    END
  `;
}

function getPoSapNosFromRegistryKeys(registryKeys: string[]) {
  return Array.from(
    new Set(
      registryKeys
        .map((registryKey) => registryKey.split("::")[0]?.trim() ?? "")
        .filter(Boolean),
    ),
  );
}

function buildCompletedPOExclusion(tableAlias: string) {
  return `
    AND NOT EXISTS (
      SELECT 1
      FROM purchase_order_history history
      WHERE history.purchase_order_number = ${tableAlias}.purchase_order_number
    )
    AND NOT EXISTS (
      SELECT 1
      FROM delivery_job_history job_history
      WHERE job_history.job_items_json @> jsonb_build_array(
        jsonb_build_object('poSapNo', ${tableAlias}.purchase_order_number)
      )
    )
  `;
}

function getExistingPORecordsCacheKey(registryKeys: string[]) {
  return JSON.stringify(
    Array.from(new Set(registryKeys.map((registryKey) => registryKey.trim()).filter(Boolean))).sort(),
  );
}

function buildPlaceholders(values: unknown[]) {
  return values.length ? values.map(() => "?").join(", ") : "NULL";
}

async function queryMySQLRows<T extends Record<string, unknown> = Record<string, unknown>>(
  client: MySQLClient,
  sql: string,
  params: unknown[] = [],
) {
  const [rows] = await client.query(sql, params);
  return rows as MySQLRows & T[];
}

async function queryMySQLResult(client: MySQLClient, sql: string, params: unknown[] = []) {
  const [result] = await client.query(sql, params);
  return result as MySQLResult;
}

function toMySQLDate(value: string | null | undefined) {
  return value ? new Date(value) : null;
}

async function getCompletedPoNosFromMySQL(client: MySQLClient) {
  const historyRows = await queryMySQLRows<{ purchase_order_number: string }>(
    client,
    "SELECT DISTINCT purchase_order_number FROM purchase_order_history",
  );
  const jobRows = await queryMySQLRows<{ job_items_json: unknown }>(
    client,
    "SELECT job_items_json FROM delivery_job_history",
  );
  const completedPoNos = new Set(historyRows.map((row) => String(row.purchase_order_number)));

  for (const row of jobRows) {
    const items = typeof row.job_items_json === "string" ? JSON.parse(row.job_items_json) : row.job_items_json;
    if (!Array.isArray(items)) {
      continue;
    }

    for (const item of items) {
      const poSapNo = typeof item?.poSapNo === "string" ? item.poSapNo : "";
      if (poSapNo) {
        completedPoNos.add(poSapNo);
      }
    }
  }

  return completedPoNos;
}

function poRecordIsVisible(record: PORegistryRecord, completedPoNos: Set<string>) {
  return !record.assignedJobId && record.lifecycle === "active" && !completedPoNos.has(record.poSapNo);
}

export function invalidatePORecordsPageCache() {
  existingPORecordsCache.clear();
}

async function getCachedExistingPORecordsFromDatabase(registryKeys: string[]) {
  const normalizedRegistryKeys = Array.from(
    new Set(registryKeys.map((registryKey) => registryKey.trim()).filter(Boolean)),
  );
  const cacheKey = getExistingPORecordsCacheKey(normalizedRegistryKeys);
  const now = Date.now();
  const cachedResult = existingPORecordsCache.get(cacheKey);

  if (cachedResult && cachedResult.expiresAt > now) {
    return cachedResult.promise;
  }

  const promise = getExistingPORecordsFromDatabase(normalizedRegistryKeys).catch((error) => {
    existingPORecordsCache.delete(cacheKey);
    throw error;
  });

  existingPORecordsCache.set(cacheKey, {
    expiresAt: now + existingPORecordsCacheTtlMs,
    promise,
  });

  return promise;
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

async function readArchiveStore() {
  if (!(await ensureArchiveStoreFile())) {
    return { records: [] };
  }

  const fileContents = await readFile(archiveDataFilePath, "utf8");

  try {
    const parsed = JSON.parse(fileContents) as Partial<PORegistryArchiveStore>;
    const records = Array.isArray(parsed.records) ? parsed.records : [];

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
  triggerExpiredSharedDataCleanup();

  return withPostgresClient(async (client) => {
    const result = await client.query<{ count: string }>(`
      SELECT COUNT(*)::text AS count
      FROM purchase_order_queue
      WHERE assigned_delivery_job_id IS NULL
        AND record_state = 'active'
        ${buildCompletedPOExclusion("purchase_order_queue")}
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
  triggerExpiredSharedDataCleanup();

  return withPostgresClient(async (client) => {
    const safePage = Math.max(1, page);
    const skipCount = (safePage - 1) * pageSize;
    const search = buildSearchFilter(query);
    const baseWhere = `
      assigned_delivery_job_id IS NULL
      AND record_state = 'active'
      ${buildCompletedPOExclusion("purchase_order_queue")}
      ${search.clause}
    `;

    const rowsResult = await client.query(
      `
        WITH filtered_records AS (
          SELECT *
          FROM purchase_order_queue
          WHERE ${baseWhere}
        ),
        filtered_counts AS (
          SELECT
            COUNT(*)::text AS total_count,
            COUNT(DISTINCT purchase_order_number)::text AS total_po_count
          FROM filtered_records
        )
        SELECT
          filtered_records.*,
          filtered_counts.total_count,
          filtered_counts.total_po_count
        FROM filtered_records
        CROSS JOIN filtered_counts
        ORDER BY
          MAX(first_imported_at) OVER (PARTITION BY purchase_order_number) DESC,
          MIN(import_row_number) OVER (PARTITION BY purchase_order_number) ASC,
          purchase_order_number ASC,
          ${buildNumericTextExpression("purchase_order_item_number")} ASC NULLS LAST,
          purchase_order_item_number ASC,
          import_row_number ASC
        LIMIT $${search.params.length + 1}
        OFFSET $${search.params.length + 2}
      `,
      [...search.params, pageSize, skipCount],
    );

    return {
      records: rowsResult.rows.map(mapDatabasePORecord),
      totalCount: Number(rowsResult.rows[0]?.total_count ?? "0"),
      totalPoCount: Number(rowsResult.rows[0]?.total_po_count ?? "0"),
    };
  });
}

async function getExistingPORecordsFromDatabase(registryKeys: string[]) {
  triggerExpiredSharedDataCleanup();

  if (!registryKeys.length) {
    return [];
  }

  const poSapNos = getPoSapNosFromRegistryKeys(registryKeys);

  return withPostgresClient(async (client) => {
    const result = await client.query(
      `
        WITH matched_history_jobs AS (
          SELECT DISTINCT job_history.*
          FROM unnest($2::text[]) AS requested_po(po_sap_no)
          JOIN delivery_job_history job_history
            ON job_history.job_items_json @> jsonb_build_array(
              jsonb_build_object('poSapNo', requested_po.po_sap_no)
            )
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
          cleanup_after_at
        FROM purchase_order_queue
        WHERE (line_registry_key = ANY($1::text[]) OR purchase_order_number = ANY($2::text[]))
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
          delete_after_at AS cleanup_after_at
        FROM purchase_order_history
        WHERE line_registry_key = ANY($1::text[])
          OR purchase_order_number = ANY($2::text[])
        UNION ALL
        SELECT
          item.value->>'registryKey' AS line_registry_key,
          item.value->>'poSapNo' AS purchase_order_number,
          item.value->>'poSapItem' AS purchase_order_item_number,
          job_history.created_at AS first_imported_at,
          job_history.updated_at AS last_imported_at,
          '' AS import_file_name,
          '' AS import_sheet_name,
          0 AS import_row_number,
          '' AS document_status,
          COALESCE(item.value->>'vendor', '') AS vendor_name,
          COALESCE(item.value->>'poWebNo', '') AS web_order_number,
          COALESCE(item.value->>'plantCode', '') AS plant_code,
          COALESCE(item.value->>'unitName', '') AS business_unit_name,
          COALESCE(item.value->>'materialCode', '') AS material_code,
          COALESCE(item.value->>'materialName', '') AS material_name,
          COALESCE(item.value->>'sourceOrderQty', '') AS ordered_quantity_text,
          '' AS received_quantity_text,
          COALESCE(item.value->>'sourceTotalAmount', '') AS total_amount_text,
          1 AS import_count,
          'completed' AS record_state,
          job_history.delivery_job_id AS assigned_delivery_job_id,
          NULL::timestamptz AS assigned_to_job_at,
          job_history.archived_at,
          job_history.completed_at,
          job_history.delete_after_at AS cleanup_after_at
        FROM matched_history_jobs job_history
        CROSS JOIN LATERAL jsonb_array_elements(job_history.job_items_json) AS item(value)
        WHERE item.value->>'poSapNo' = ANY($2::text[])
      `,
      [registryKeys, poSapNos],
    );

    return result.rows.map(mapDatabasePORecord);
  });
}

async function getPORecordsByKeysFromDatabase(registryKeys: string[]) {
  triggerExpiredSharedDataCleanup();

  if (!registryKeys.length) {
    return [];
  }

  return withPostgresClient(async (client) => {
    const result = await client.query(
      `
        SELECT *
        FROM purchase_order_queue
        WHERE line_registry_key = ANY($1::text[])
          ${buildCompletedPOExclusion("purchase_order_queue")}
        ORDER BY first_imported_at DESC
      `,
      [registryKeys],
    );

    return result.rows.map(mapDatabasePORecord);
  });
}

async function getPORecordsByPoSapNosFromDatabase(poSapNos: string[]) {
  triggerExpiredSharedDataCleanup();

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
          ${buildCompletedPOExclusion("purchase_order_queue")}
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
  invalidatePORecordsPageCache();
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
          cleanup_after_at
        FROM incoming
        WHERE NOT EXISTS (
          SELECT 1
          FROM purchase_order_queue existing_record
          WHERE existing_record.purchase_order_number = incoming.purchase_order_number
        )
          AND NOT EXISTS (
            SELECT 1
            FROM purchase_order_history history
            WHERE history.purchase_order_number = incoming.purchase_order_number
          )
          AND NOT EXISTS (
            SELECT 1
            FROM delivery_job_history job_history
            WHERE job_history.job_items_json @> jsonb_build_array(
              jsonb_build_object('poSapNo', incoming.purchase_order_number)
            )
          )
        ON CONFLICT (line_registry_key) DO NOTHING
        RETURNING line_registry_key
      `,
      [JSON.stringify(payload)],
    );

    return result.rowCount ?? 0;
  });
}

async function getPORegistryCountFromMySQL() {
  triggerExpiredSharedDataCleanup();

  return withMySQLClient(async (client) => {
    const completedPoNos = await getCompletedPoNosFromMySQL(client);
    const rows = await queryMySQLRows(client, `
      SELECT *
      FROM purchase_order_queue
      WHERE assigned_delivery_job_id IS NULL
        AND record_state = 'active'
    `);

    return rows.map(mapDatabasePORecord).filter((record) => poRecordIsVisible(record, completedPoNos)).length;
  });
}

async function getPORecordsPageFromMySQL({
  page,
  pageSize,
  query = "",
}: {
  page: number;
  pageSize: number;
  query?: string;
}) {
  triggerExpiredSharedDataCleanup();

  return withMySQLClient(async (client) => {
    const completedPoNos = await getCompletedPoNosFromMySQL(client);
    const rows = await queryMySQLRows(client, `
      SELECT *
      FROM purchase_order_queue
      WHERE assigned_delivery_job_id IS NULL
        AND record_state = 'active'
    `);
    const records = sortPORecords(
      rows
        .map(mapDatabasePORecord)
        .filter((record) => poRecordIsVisible(record, completedPoNos) && recordMatchesQuery(record, query)),
    );
    const safePage = Math.max(1, page);
    const skipCount = (safePage - 1) * pageSize;

    return {
      records: records.slice(skipCount, skipCount + pageSize),
      totalCount: records.length,
      totalPoCount: new Set(records.map((record) => record.poSapNo)).size,
    };
  });
}

async function getExistingPORecordsFromMySQL(registryKeys: string[]) {
  triggerExpiredSharedDataCleanup();

  if (!registryKeys.length) {
    return [];
  }

  const poSapNos = getPoSapNosFromRegistryKeys(registryKeys);

  return withMySQLClient(async (client) => {
    const keyPlaceholders = buildPlaceholders(registryKeys);
    const poPlaceholders = buildPlaceholders(poSapNos);
    const [queueRows, historyRows, jobRows] = await Promise.all([
      queryMySQLRows(client, `
        SELECT *
        FROM purchase_order_queue
        WHERE line_registry_key IN (${keyPlaceholders})
          OR purchase_order_number IN (${poPlaceholders})
      `, [...registryKeys, ...poSapNos]),
      queryMySQLRows(client, `
        SELECT *, delete_after_at AS cleanup_after_at
        FROM purchase_order_history
        WHERE line_registry_key IN (${keyPlaceholders})
          OR purchase_order_number IN (${poPlaceholders})
      `, [...registryKeys, ...poSapNos]),
      queryMySQLRows(client, "SELECT * FROM delivery_job_history"),
    ]);
    const wantedKeys = new Set(registryKeys);
    const wantedPoNos = new Set(poSapNos);
    const records = [
      ...queueRows.map(mapDatabasePORecord).filter((record) => {
        if (!wantedKeys.has(record.registryKey) && !wantedPoNos.has(record.poSapNo)) {
          return false;
        }

        return (
          (!record.assignedJobId && record.lifecycle === "active") ||
          record.lifecycle === "completed"
        );
      }),
      ...historyRows.map(mapDatabasePORecord),
    ];

    for (const row of jobRows) {
      const job = mapDatabaseJobArchive(row);
      for (const item of job.items) {
        if (!wantedPoNos.has(item.poSapNo) && !wantedKeys.has(item.registryKey)) {
          continue;
        }

        records.push({
          registryKey: item.registryKey,
          poSapNo: item.poSapNo,
          poSapItem: item.poSapItem,
          firstImportedAt: job.createdAt,
          latestImportedAt: job.updatedAt,
          sourceFileName: "",
          sourceSheetName: "",
          rowNumber: 0,
          status: "",
          vendor: item.vendor ?? "",
          poWebNo: item.poWebNo ?? "",
          plantCode: item.plantCode ?? "",
          unitName: item.unitName ?? "",
          materialCode: item.materialCode ?? "",
          materialName: item.materialName ?? "",
          orderQty: item.sourceOrderQty ?? "",
          receivedQty: "",
          totalAmount: item.sourceTotalAmount ?? "",
          importCount: 1,
          lifecycle: "completed",
          assignedJobId: job.id,
          archivedAt: job.archivedAt,
          completedAt: job.completedAt,
          purgeAfterAt: job.deleteAfterAt,
        });
      }
    }

    return records;
  });
}

async function getPORecordsByKeysFromMySQL(registryKeys: string[]) {
  triggerExpiredSharedDataCleanup();

  if (!registryKeys.length) {
    return [];
  }

  return withMySQLClient(async (client) => {
    const completedPoNos = await getCompletedPoNosFromMySQL(client);
    const rows = await queryMySQLRows(
      client,
      `SELECT * FROM purchase_order_queue WHERE line_registry_key IN (${buildPlaceholders(registryKeys)})`,
      registryKeys,
    );

    return sortPORecords(rows.map(mapDatabasePORecord).filter((record) => !completedPoNos.has(record.poSapNo)));
  });
}

async function getPORecordsByPoSapNosFromMySQL(poSapNos: string[]) {
  triggerExpiredSharedDataCleanup();

  const normalizedPoSapNos = Array.from(new Set(poSapNos.map((poSapNo) => poSapNo.trim()).filter(Boolean)));

  if (!normalizedPoSapNos.length) {
    return [];
  }

  return withMySQLClient(async (client) => {
    const completedPoNos = await getCompletedPoNosFromMySQL(client);
    const rows = await queryMySQLRows(
      client,
      `
        SELECT *
        FROM purchase_order_queue
        WHERE purchase_order_number IN (${buildPlaceholders(normalizedPoSapNos)})
          AND assigned_delivery_job_id IS NULL
          AND record_state = 'active'
        ORDER BY purchase_order_number ASC, purchase_order_item_number ASC, first_imported_at DESC
      `,
      normalizedPoSapNos,
    );

    return sortPORecords(rows.map(mapDatabasePORecord).filter((record) => !completedPoNos.has(record.poSapNo)));
  });
}

async function saveNewPORecordsToMySQL(records: NewPORegistryRecord[]) {
  if (!records.length) {
    return 0;
  }

  assertWritableStorage();
  invalidatePORecordsPageCache();
  await cleanupExpiredSharedData();

  const importedAt = new Date().toISOString();
  const payload = records
    .map((record) => createStoredPORegistryRecord(record, importedAt))
    .map(serializePORegistryRecordForDatabase);

  return withMySQLTransaction(async (client) => {
    const [queueRows, historyRows, jobRows] = await Promise.all([
      queryMySQLRows<{ purchase_order_number: string }>(client, "SELECT purchase_order_number FROM purchase_order_queue"),
      queryMySQLRows<{ purchase_order_number: string }>(client, "SELECT purchase_order_number FROM purchase_order_history"),
      queryMySQLRows<{ job_items_json: unknown }>(client, "SELECT job_items_json FROM delivery_job_history"),
    ]);
    const existingPoNos = new Set([
      ...queueRows.map((row) => String(row.purchase_order_number)),
      ...historyRows.map((row) => String(row.purchase_order_number)),
    ]);

    for (const row of jobRows) {
      const items = typeof row.job_items_json === "string" ? JSON.parse(row.job_items_json) : row.job_items_json;
      if (!Array.isArray(items)) {
        continue;
      }

      for (const item of items) {
        if (typeof item?.poSapNo === "string") {
          existingPoNos.add(item.poSapNo);
        }
      }
    }

    const newRows = payload.filter((record) => !existingPoNos.has(record.purchase_order_number));

    if (!newRows.length) {
      return 0;
    }

    let savedCount = 0;
    for (const record of newRows) {
      const result = await queryMySQLResult(
        client,
        `
          INSERT IGNORE INTO purchase_order_queue (
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
            cleanup_after_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        [
          record.line_registry_key,
          record.purchase_order_number,
          record.purchase_order_item_number,
          toMySQLDate(record.first_imported_at),
          toMySQLDate(record.last_imported_at),
          record.import_file_name,
          record.import_sheet_name,
          record.import_row_number,
          record.document_status,
          record.vendor_name,
          record.web_order_number,
          record.plant_code,
          record.business_unit_name,
          record.material_code,
          record.material_name,
          record.ordered_quantity_text,
          record.received_quantity_text,
          record.total_amount_text,
          record.import_count,
          record.record_state,
          record.assigned_delivery_job_id,
          toMySQLDate(record.assigned_to_job_at),
          toMySQLDate(record.archived_at),
          toMySQLDate(record.completed_at),
          toMySQLDate(record.cleanup_after_at),
        ],
      );
      savedCount += result.affectedRows;
    }

    return savedCount;
  });
}

async function clearPORegistryInDatabase() {
  assertWritableStorage();
  invalidatePORecordsPageCache();

  await withPostgresTransaction(async (client) => {
    await client.query(`
      DELETE FROM purchase_order_queue
      WHERE assigned_delivery_job_id IS NULL
      AND record_state = 'active'
    `);
  });
}

async function clearPORegistryInMySQL() {
  assertWritableStorage();
  invalidatePORecordsPageCache();

  await withMySQLTransaction(async (client) => {
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
  invalidatePORecordsPageCache();

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

async function deletePORecordsInMySQL(registryKeys: string[]) {
  if (!registryKeys.length) {
    return 0;
  }

  assertWritableStorage();
  invalidatePORecordsPageCache();

  return withMySQLTransaction(async (client) => {
    const result = await queryMySQLResult(
      client,
      `
        DELETE FROM purchase_order_queue
        WHERE line_registry_key IN (${buildPlaceholders(registryKeys)})
          AND assigned_delivery_job_id IS NULL
          AND record_state = 'active'
      `,
      registryKeys,
    );

    return result.affectedRows;
  });
}

async function markPORecordsAssignedInDatabase(registryKeys: string[], jobId: string) {
  if (!registryKeys.length) {
    return;
  }

  assertWritableStorage();
  invalidatePORecordsPageCache();

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

async function markPORecordsAssignedInMySQL(registryKeys: string[], jobId: string) {
  if (!registryKeys.length) {
    return;
  }

  assertWritableStorage();
  invalidatePORecordsPageCache();

  await withMySQLTransaction(async (client) => {
    await client.query(
      `
        UPDATE purchase_order_queue
        SET
          record_state = 'assigned',
          assigned_delivery_job_id = ?,
          assigned_to_job_at = UTC_TIMESTAMP(3)
        WHERE line_registry_key IN (${buildPlaceholders(registryKeys)})
      `,
      [jobId, ...registryKeys],
    );
  });
}

async function releasePORecordsFromJobInDatabase(registryKeys: string[], jobId: string) {
  if (!registryKeys.length || !jobId.trim()) {
    return;
  }

  assertWritableStorage();
  invalidatePORecordsPageCache();

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

async function releasePORecordsFromJobInMySQL(registryKeys: string[], jobId: string) {
  if (!registryKeys.length || !jobId.trim()) {
    return;
  }

  assertWritableStorage();
  invalidatePORecordsPageCache();

  await withMySQLTransaction(async (client) => {
    await client.query(
      `
        UPDATE purchase_order_queue
        SET
          record_state = 'active',
          assigned_delivery_job_id = NULL,
          assigned_to_job_at = NULL
        WHERE line_registry_key IN (${buildPlaceholders(registryKeys)})
          AND assigned_delivery_job_id = ?
          AND record_state = 'assigned'
      `,
      [...registryKeys, jobId],
    );
  });
}

async function markPORecordsCompletedInDatabase(registryKeys: string[]) {
  if (!registryKeys.length) {
    return;
  }

  assertWritableStorage();
  invalidatePORecordsPageCache();

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

async function markPORecordsCompletedInMySQL(registryKeys: string[]) {
  if (!registryKeys.length) {
    return;
  }

  assertWritableStorage();
  invalidatePORecordsPageCache();

  await withMySQLTransaction(async (client) => {
    await client.query(
      `
        UPDATE purchase_order_queue
        SET
          record_state = 'completed',
          archived_at = UTC_TIMESTAMP(3),
          completed_at = UTC_TIMESTAMP(3),
          cleanup_after_at = DATE_ADD(UTC_TIMESTAMP(3), INTERVAL 100 DAY)
        WHERE line_registry_key IN (${buildPlaceholders(registryKeys)})
      `,
      registryKeys,
    );
  });
}

export async function getPORegistryCount() {
  if (hasMySQLDatabase()) {
    return getPORegistryCountFromMySQL();
  }

  if (hasSharedDatabase()) {
    return getPORegistryCountFromDatabase();
  }

  const store = await readStore();
  const archiveStore = await readArchiveStore();
  const completedPoNos = new Set(archiveStore.records.map((record) => record.poSapNo));

  return store.records.filter(
    (record) => !record.assignedJobId && record.lifecycle === "active" && !completedPoNos.has(record.poSapNo),
  ).length;
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
  if (hasMySQLDatabase()) {
    return getPORecordsPageFromMySQL({ page, pageSize, query });
  }

  if (hasSharedDatabase()) {
    return getPORecordsPageFromDatabase({ page, pageSize, query });
  }

  const store = await readStore();
  const archiveStore = await readArchiveStore();
  const completedPoNos = new Set(archiveStore.records.map((record) => record.poSapNo));
  const matchedRecords = sortPORecords(store.records).filter(
    (record) =>
      !record.assignedJobId &&
      record.lifecycle === "active" &&
      !completedPoNos.has(record.poSapNo) &&
      recordMatchesQuery(record, query),
  );
  const safePage = Math.max(1, page);
  const skipCount = (safePage - 1) * pageSize;

  return {
    records: matchedRecords.slice(skipCount, skipCount + pageSize),
    totalCount: matchedRecords.length,
    totalPoCount: new Set(matchedRecords.map((record) => record.poSapNo)).size,
  };
}

export async function getExistingPORecords(registryKeys: string[]) {
  if (hasMySQLDatabase()) {
    return getExistingPORecordsFromMySQL(registryKeys);
  }

  if (hasSharedDatabase()) {
    return getCachedExistingPORecordsFromDatabase(registryKeys);
  }

  const store = await readStore();
  const archiveStore = await readArchiveStore();
  const uniqueKeys = new Set(registryKeys);
  const poSapNos = new Set(getPoSapNosFromRegistryKeys(registryKeys));

  return [
    ...store.records.filter(
    (record) =>
      (uniqueKeys.has(record.registryKey) || poSapNos.has(record.poSapNo)) &&
      ((!record.assignedJobId && record.lifecycle === "active") || record.lifecycle === "completed"),
    ),
    ...archiveStore.records.filter((record) => uniqueKeys.has(record.registryKey) || poSapNos.has(record.poSapNo)),
  ];
}

export async function getPORecordsByKeys(registryKeys: string[]) {
  if (hasMySQLDatabase()) {
    return getPORecordsByKeysFromMySQL(registryKeys);
  }

  if (hasSharedDatabase()) {
    return getPORecordsByKeysFromDatabase(registryKeys);
  }

  const store = await readStore();
  const archiveStore = await readArchiveStore();
  const uniqueKeys = new Set(registryKeys);
  const completedPoNos = new Set(archiveStore.records.map((record) => record.poSapNo));

  return sortPORecords(
    store.records.filter((record) => uniqueKeys.has(record.registryKey) && !completedPoNos.has(record.poSapNo)),
  );
}

export async function getPORecordsByPoSapNos(poSapNos: string[]) {
  if (hasMySQLDatabase()) {
    return getPORecordsByPoSapNosFromMySQL(poSapNos);
  }

  if (hasSharedDatabase()) {
    return getPORecordsByPoSapNosFromDatabase(poSapNos);
  }

  const normalizedPoSapNos = new Set(poSapNos.map((poSapNo) => poSapNo.trim()).filter(Boolean));

  if (!normalizedPoSapNos.size) {
    return [];
  }

  const store = await readStore();
  const archiveStore = await readArchiveStore();
  const completedPoNos = new Set(archiveStore.records.map((record) => record.poSapNo));

  return sortPORecords(
    store.records.filter(
      (record) =>
        normalizedPoSapNos.has(record.poSapNo) &&
        !record.assignedJobId &&
        record.lifecycle === "active" &&
        !completedPoNos.has(record.poSapNo),
    ),
  );
}

export async function saveNewPORecords(records: NewPORegistryRecord[]) {
  if (hasMySQLDatabase()) {
    return saveNewPORecordsToMySQL(records);
  }

  if (hasSharedDatabase()) {
    return saveNewPORecordsToDatabase(records);
  }

  if (!records.length) {
    return 0;
  }

  assertWritableStorage();
  invalidatePORecordsPageCache();

  const store = await readStore();
  const archiveStore = await readArchiveStore();
  const importedAt = new Date().toISOString();
  const existingPoNos = new Set([
    ...store.records.map((record) => record.poSapNo),
    ...archiveStore.records.map((record) => record.poSapNo),
  ]);

  const newRecords = records
    .filter((record) => !existingPoNos.has(record.poSapNo))
    .map((record) => createStoredPORegistryRecord(record, importedAt));

  if (!newRecords.length) {
    return 0;
  }

  await writeStore({
    records: [...store.records, ...newRecords],
  });

  return newRecords.length;
}

export async function clearPORegistry() {
  if (hasMySQLDatabase()) {
    return clearPORegistryInMySQL();
  }

  if (hasSharedDatabase()) {
    return clearPORegistryInDatabase();
  }

  assertWritableStorage();
  invalidatePORecordsPageCache();
  const store = await readStore();

  await writeStore({
    records: store.records.filter((record) => record.assignedJobId || record.lifecycle !== "active"),
  });
}

export async function deletePORecords(registryKeys: string[]) {
  if (hasMySQLDatabase()) {
    return deletePORecordsInMySQL(registryKeys);
  }

  if (hasSharedDatabase()) {
    return deletePORecordsInDatabase(registryKeys);
  }

  if (!registryKeys.length) {
    return 0;
  }

  assertWritableStorage();
  invalidatePORecordsPageCache();
  const store = await readStore();
  const uniqueKeys = new Set(registryKeys);
  const records = store.records.filter(
    (record) => !uniqueKeys.has(record.registryKey) || record.assignedJobId || record.lifecycle !== "active",
  );

  await writeStore({ records });

  return store.records.length - records.length;
}

export async function markPORecordsAssigned(registryKeys: string[], jobId: string) {
  if (hasMySQLDatabase()) {
    return markPORecordsAssignedInMySQL(registryKeys, jobId);
  }

  if (hasSharedDatabase()) {
    return markPORecordsAssignedInDatabase(registryKeys, jobId);
  }

  assertWritableStorage();
  invalidatePORecordsPageCache();
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
  if (hasMySQLDatabase()) {
    return releasePORecordsFromJobInMySQL(registryKeys, jobId);
  }

  if (hasSharedDatabase()) {
    return releasePORecordsFromJobInDatabase(registryKeys, jobId);
  }

  if (!registryKeys.length || !jobId.trim()) {
    return;
  }

  assertWritableStorage();
  invalidatePORecordsPageCache();
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
  if (hasMySQLDatabase()) {
    return markPORecordsCompletedInMySQL(registryKeys);
  }

  if (hasSharedDatabase()) {
    return markPORecordsCompletedInDatabase(registryKeys);
  }

  assertWritableStorage();
  invalidatePORecordsPageCache();
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
  invalidatePORecordsPageCache();
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
