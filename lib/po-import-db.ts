import {
  createPORegistryKey,
  type NewPORegistryRecord,
  type PORegistryRecord,
} from "@/lib/po-registry";

const legacyStorageKey = "project-stock.imported-po-sap-nos";

async function readResponse<T>(response: Response) {
  if (!response.ok) {
    const data = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(data?.error || `Request failed with status ${response.status}`);
  }

  return (await response.json()) as T;
}

export { createPORegistryKey, type NewPORegistryRecord, type PORegistryRecord };

export async function getPORegistryCount() {
  const data = await readResponse<{ count: number }>(
    await fetch("/api/po-registry/count", {
      cache: "no-store",
    }),
  );

  return data.count;
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
  const searchParams = new URLSearchParams({
    page: String(page),
    pageSize: String(pageSize),
    query,
  });

  return readResponse<{
    records: PORegistryRecord[];
    totalCount: number;
  }>(
    await fetch(`/api/po-registry?${searchParams.toString()}`, {
      cache: "no-store",
    }),
  );
}

export async function getExistingPORecords(registryKeys: string[]) {
  const data = await readResponse<{ records: PORegistryRecord[] }>(
    await fetch("/api/po-registry/existing", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ registryKeys }),
    }),
  );

  return new Map(data.records.map((record) => [record.registryKey, record]));
}

export async function getPORecordsByPoSapNos(poSapNos: string[]) {
  const data = await readResponse<{ records: PORegistryRecord[] }>(
    await fetch("/api/po-registry/by-po", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ poSapNos }),
    }),
  );

  return data.records;
}

export async function saveNewPORecords(records: NewPORegistryRecord[]) {
  const data = await readResponse<{ savedCount: number }>(
    await fetch("/api/po-registry", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ records }),
    }),
  );

  return data.savedCount;
}

export async function clearPORegistry() {
  await readResponse<{ cleared: true; deletedCount: number | null }>(
    await fetch("/api/po-registry", {
      method: "DELETE",
    }),
  );
}

export async function deletePORecords(registryKeys: string[]) {
  const data = await readResponse<{ deletedCount: number }>(
    await fetch("/api/po-registry", {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ registryKeys }),
    }),
  );

  return data.deletedCount;
}

export async function migrateLegacyPORegistry() {
  window.localStorage.removeItem(legacyStorageKey);
  return 0;
}
