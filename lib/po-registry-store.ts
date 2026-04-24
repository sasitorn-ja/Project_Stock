import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  recordMatchesQuery,
  sortPORecords,
  type NewPORegistryRecord,
  type PORegistryRecord,
} from "@/lib/po-registry";

type PORegistryStore = {
  records: PORegistryRecord[];
};

const dataDirectoryPath = path.join(process.cwd(), "data");
const dataFilePath = path.join(dataDirectoryPath, "po-registry.json");

async function ensureStoreFile() {
  await mkdir(dataDirectoryPath, { recursive: true });

  try {
    await readFile(dataFilePath, "utf8");
  } catch {
    await writeStore({ records: [] });
  }
}

async function readStore() {
  await ensureStoreFile();

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

async function writeStore(store: PORegistryStore) {
  await mkdir(dataDirectoryPath, { recursive: true });

  const temporaryFilePath = `${dataFilePath}.tmp`;
  const contents = JSON.stringify(store, null, 2);

  await writeFile(temporaryFilePath, contents, "utf8");
  await rename(temporaryFilePath, dataFilePath);
}

export async function getPORegistryCount() {
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
  const store = await readStore();
  const matchedRecords = sortPORecords(store.records).filter((record) => recordMatchesQuery(record, query));
  const safePage = Math.max(1, page);
  const skipCount = (safePage - 1) * pageSize;

  return {
    records: matchedRecords.slice(skipCount, skipCount + pageSize),
    totalCount: matchedRecords.length,
  };
}

export async function getExistingPORecords(registryKeys: string[]) {
  const store = await readStore();
  const uniqueKeys = new Set(registryKeys);

  return store.records.filter((record) => uniqueKeys.has(record.registryKey));
}

export async function saveNewPORecords(records: NewPORegistryRecord[]) {
  if (!records.length) {
    return 0;
  }

  const store = await readStore();
  const importedAt = new Date().toISOString();
  const existingKeys = new Set(store.records.map((record) => record.registryKey));
  const newRecords: PORegistryRecord[] = [];

  records.forEach((record) => {
    if (existingKeys.has(record.registryKey)) {
      return;
    }

    newRecords.push({
      ...record,
      firstImportedAt: importedAt,
      latestImportedAt: importedAt,
      importCount: 1,
      lifecycle: "active",
    });
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
  await writeStore({ records: [] });
}
