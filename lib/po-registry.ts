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
  assignedJobId?: string;
  assignedAt?: string;
  archivedAt?: string;
};

export type NewPORegistryRecord = Omit<
  PORegistryRecord,
  "firstImportedAt" | "latestImportedAt" | "importCount" | "lifecycle"
>;

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

export function createPORegistryKey(poSapNo: string, poSapItem: string) {
  return `${poSapNo.trim()}::${poSapItem.trim()}`;
}

export function sortPORecords(records: PORegistryRecord[]) {
  return [...records].sort((firstRecord, secondRecord) =>
    secondRecord.firstImportedAt.localeCompare(firstRecord.firstImportedAt),
  );
}

export function recordMatchesQuery(record: PORegistryRecord, query: string) {
  const normalizedQuery = query.trim().toLowerCase();

  if (!normalizedQuery) {
    return true;
  }

  return searchableFields.some((field) => record[field].toLowerCase().includes(normalizedQuery));
}
