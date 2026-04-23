export type PORegistryRecord = {
  registryKey: string;
  poSapNo: string;
  poSapItem: string;
  firstImportedAt: string;
  latestImportedAt: string;
  sourceFileName: string;
  sourceSheetName: string;
  rowNumber: number;
  status: string;
  vendor: string;
  poWebNo: string;
  unitName: string;
  materialCode: string;
  materialName: string;
  orderQty: string;
  receivedQty: string;
  totalAmount: string;
  importCount: number;
  lifecycle: "active" | "archived";
  archivedAt?: string;
};

export type NewPORegistryRecord = Omit<
  PORegistryRecord,
  "firstImportedAt" | "latestImportedAt" | "importCount" | "lifecycle"
>;

const databaseName = "project-stock-po-line-registry";
const databaseVersion = 1;
const poStoreName = "poSapItemRegistry";
const legacyStorageKey = "project-stock.imported-po-sap-nos";
const searchableFields = [
  "poSapNo",
  "poSapItem",
  "status",
  "vendor",
  "poWebNo",
  "unitName",
  "materialCode",
  "materialName",
] as const;

function openDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = window.indexedDB.open(databaseName, databaseVersion);

    request.onupgradeneeded = () => {
      const database = request.result;

      if (!database.objectStoreNames.contains(poStoreName)) {
        const store = database.createObjectStore(poStoreName, { keyPath: "registryKey" });
        store.createIndex("poSapNo", "poSapNo");
        store.createIndex("firstImportedAt", "firstImportedAt");
        store.createIndex("lifecycle", "lifecycle");
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function requestToPromise<T>(request: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function transactionToPromise(transaction: IDBTransaction) {
  return new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}

export function createPORegistryKey(poSapNo: string, poSapItem: string) {
  return `${poSapNo.trim()}::${poSapItem.trim()}`;
}

export async function getPORegistryCount() {
  const database = await openDatabase();

  try {
    const transaction = database.transaction(poStoreName, "readonly");
    const store = transaction.objectStore(poStoreName);

    return await requestToPromise(store.count());
  } finally {
    database.close();
  }
}

export async function getAllPORecords() {
  const database = await openDatabase();

  try {
    const transaction = database.transaction(poStoreName, "readonly");
    const store = transaction.objectStore(poStoreName);
    const records = await requestToPromise<PORegistryRecord[]>(store.getAll());

    return records.sort((firstRecord, secondRecord) =>
      secondRecord.firstImportedAt.localeCompare(firstRecord.firstImportedAt),
    );
  } finally {
    database.close();
  }
}

function recordMatchesQuery(record: PORegistryRecord, query: string) {
  const normalizedQuery = query.trim().toLowerCase();

  if (!normalizedQuery) {
    return true;
  }

  return searchableFields.some((field) => record[field].toLowerCase().includes(normalizedQuery));
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
  const database = await openDatabase();
  const normalizedQuery = query.trim().toLowerCase();
  const records: PORegistryRecord[] = [];
  const skipCount = Math.max(0, (page - 1) * pageSize);
  let matchedCount = 0;

  try {
    const transaction = database.transaction(poStoreName, "readonly");
    const store = transaction.objectStore(poStoreName);
    const index = store.index("firstImportedAt");

    await new Promise<void>((resolve, reject) => {
      const request = index.openCursor(null, "prev");

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const cursor = request.result;

        if (!cursor) {
          resolve();
          return;
        }

        const record = cursor.value as PORegistryRecord;

        if (!normalizedQuery || recordMatchesQuery(record, normalizedQuery)) {
          if (matchedCount >= skipCount && records.length < pageSize) {
            records.push(record);
          }

          matchedCount += 1;
        }

        cursor.continue();
      };
    });

    return {
      records,
      totalCount: matchedCount,
    };
  } finally {
    database.close();
  }
}

export async function getExistingPORecords(registryKeys: string[]) {
  const database = await openDatabase();
  const uniqueKeys = Array.from(new Set(registryKeys));
  const existingRecords = new Map<string, PORegistryRecord>();

  try {
    const transaction = database.transaction(poStoreName, "readonly");
    const store = transaction.objectStore(poStoreName);

    await Promise.all(
      uniqueKeys.map(async (registryKey) => {
        const record = await requestToPromise<PORegistryRecord | undefined>(store.get(registryKey));

        if (record) {
          existingRecords.set(record.registryKey, record);
        }
      }),
    );

    return existingRecords;
  } finally {
    database.close();
  }
}

export async function saveNewPORecords(records: NewPORegistryRecord[]) {
  if (!records.length) {
    return 0;
  }

  const database = await openDatabase();
  const importedAt = new Date().toISOString();

  try {
    const transaction = database.transaction(poStoreName, "readwrite");
    const store = transaction.objectStore(poStoreName);
    const transactionDone = transactionToPromise(transaction);

    records.forEach((record) => {
      const registryRecord: PORegistryRecord = {
        ...record,
        firstImportedAt: importedAt,
        latestImportedAt: importedAt,
        importCount: 1,
        lifecycle: "active",
      };

      store.put(registryRecord);
    });

    await transactionDone;

    return records.length;
  } finally {
    database.close();
  }
}

export async function clearPORegistry() {
  const database = await openDatabase();

  try {
    const transaction = database.transaction(poStoreName, "readwrite");
    const store = transaction.objectStore(poStoreName);

    await requestToPromise(store.clear());
    window.localStorage.removeItem(legacyStorageKey);
  } finally {
    database.close();
  }
}

export async function migrateLegacyPORegistry() {
  window.localStorage.removeItem(legacyStorageKey);
  return 0;
}
