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
  plantCode: string;
  unitName: string;
  materialCode: string;
  materialName: string;
  orderQty: string;
  receivedQty: string;
  totalAmount: string;
  importCount: number;
  lifecycle: "active" | "assigned" | "completed";
  assignedJobId?: string;
  assignedAt?: string;
  archivedAt?: string;
  completedAt?: string;
  purgeAfterAt?: string;
};

export type PORegistryArchiveRecord = PORegistryRecord & {
  archivedFromJobId: string;
  archivedAt: string;
  deleteAfterAt: string;
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
  "plantCode",
  "unitName",
  "materialCode",
  "materialName",
] as const;

export function createPORegistryKey(poSapNo: string, poSapItem: string) {
  return `${poSapNo.trim()}::${poSapItem.trim()}`;
}

function parseSortableNumber(value: string) {
  const normalizedValue = value.replace(/,/g, "").trim();

  if (!normalizedValue || !/^-?\d+(\.\d+)?$/.test(normalizedValue)) {
    return null;
  }

  return Number(normalizedValue);
}

export function sortPORecords(records: PORegistryRecord[]) {
  const groupMetadata = new Map<string, { latestImportedAt: string; firstRowNumber: number }>();

  records.forEach((record, index) => {
    const currentMetadata = groupMetadata.get(record.poSapNo);
    const rowNumber = record.rowNumber || index;

    if (!currentMetadata) {
      groupMetadata.set(record.poSapNo, {
        latestImportedAt: record.firstImportedAt,
        firstRowNumber: rowNumber,
      });
      return;
    }

    currentMetadata.latestImportedAt =
      record.firstImportedAt > currentMetadata.latestImportedAt ? record.firstImportedAt : currentMetadata.latestImportedAt;
    currentMetadata.firstRowNumber = Math.min(currentMetadata.firstRowNumber, rowNumber);
  });

  return [...records].sort((firstRecord, secondRecord) => {
    const firstMetadata = groupMetadata.get(firstRecord.poSapNo);
    const secondMetadata = groupMetadata.get(secondRecord.poSapNo);
    const groupImportedComparison = (secondMetadata?.latestImportedAt ?? "").localeCompare(
      firstMetadata?.latestImportedAt ?? "",
    );

    if (groupImportedComparison !== 0) {
      return groupImportedComparison;
    }

    if ((firstMetadata?.firstRowNumber ?? 0) !== (secondMetadata?.firstRowNumber ?? 0)) {
      return (firstMetadata?.firstRowNumber ?? 0) - (secondMetadata?.firstRowNumber ?? 0);
    }

    if (firstRecord.poSapNo !== secondRecord.poSapNo) {
      return firstRecord.poSapNo.localeCompare(secondRecord.poSapNo, "th", {
        numeric: true,
        sensitivity: "base",
      });
    }

    const firstItemNumber = parseSortableNumber(firstRecord.poSapItem);
    const secondItemNumber = parseSortableNumber(secondRecord.poSapItem);

    if (firstItemNumber !== null && secondItemNumber !== null && firstItemNumber !== secondItemNumber) {
      return firstItemNumber - secondItemNumber;
    }

    return firstRecord.poSapItem.localeCompare(secondRecord.poSapItem, "th", {
      numeric: true,
      sensitivity: "base",
    });
  });
}

export function recordMatchesQuery(record: PORegistryRecord, query: string) {
  const normalizedQuery = query.trim().toLowerCase();

  if (!normalizedQuery) {
    return true;
  }

  return searchableFields.some((field) => String(record[field] ?? "").toLowerCase().includes(normalizedQuery));
}
