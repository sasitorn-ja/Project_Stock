import { type PORegistryRecord } from "@/lib/po-registry";

export type JobStatus = "ready" | "loading" | "in_transit" | "completed";
export type ScanMode = "load" | "deliver";
export type AlertSeverity = "ผ่าน" | "สำเร็จ" | "สูง" | "กลาง";

export type JobItemRecord = {
  registryKey: string;
  poSapNo: string;
  poSapItem: string;
  vendor: string;
  poWebNo: string;
  plantCode?: string;
  unitName: string;
  materialCode: string;
  materialName: string;
  sourceOrderQty?: string;
  sourceTotalAmount?: string;
  orderQty: number;
  loadedQty: number;
  deliveredQty: number;
  destinationId: string;
  destinationName: string;
};

export type JobDestinationRecord = {
  id: string;
  name: string;
  address: string;
  gps: string;
  radiusMeters: number;
  deliveryGps: string;
  deliveryCheckedInAt?: string;
};

export type JobDestinationOverrideInput = {
  id: string;
  name?: string;
  address?: string;
  radiusMeters?: number;
};

export type JobAlertRecord = {
  id: string;
  type: string;
  message: string;
  severity: AlertSeverity;
  time: string;
  createdAt: string;
};

export type JobScanLogRecord = {
  id: string;
  code: string;
  mode: ScanMode;
  registryKey?: string;
  destinationId?: string;
  result: "ok" | "alert";
  message: string;
  createdAt: string;
};

export type JobRecord = {
  id: string;
  roomName: string;
  createdAt: string;
  updatedAt: string;
  status: JobStatus;
  driver: string;
  vehicle: string;
  origin: string;
  originGps: string;
  originCheckedInAt?: string;
  originLockedAt?: string;
  allowOriginRecheckAfterLocked?: boolean;
  allowDestinationBeforeFullyLoaded?: boolean;
  note: string;
  poRegistryKeys: string[];
  items: JobItemRecord[];
  destinations: JobDestinationRecord[];
  alerts: JobAlertRecord[];
  scanLogs: JobScanLogRecord[];
  completedAt?: string;
  purgeAfterAt?: string;
};

export type JobArchiveRecord = JobRecord & {
  archivedAt: string;
  deleteAfterAt: string;
};

export function slugifyDestination(value: string) {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9ก-๙]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return normalized || "unknown-destination";
}

const plantCodeDestinationNames: Record<string, string> = {
  "13": "(13xx) ตะวันออก, ตะวันตก",
  "19": "(19xx) เหนือ",
  "15": "(15xx) ใต้",
  "14": "(14xx) อีสาน",
  "31": "(31xx) CPAC บางซ่อน",
};

export function getDestinationNameFromPlantCode(plantCode: string | null | undefined, fallbackName: string) {
  const normalizedFallbackName = fallbackName.trim() || "ไม่ระบุปลายทาง";
  const plantCodePrefix = /^(\d{2})/.exec(String(plantCode ?? "").trim())?.[1];

  if (!plantCodePrefix) {
    return normalizedFallbackName;
  }

  return plantCodeDestinationNames[plantCodePrefix] ?? `(${plantCodePrefix}xx) ${normalizedFallbackName}`;
}

export function getDestinationNameForPORecord(record: Pick<PORegistryRecord, "plantCode" | "unitName">) {
  return getDestinationNameFromPlantCode(record.plantCode, record.unitName);
}

export function parseQty(value: string) {
  const normalized = value.replace(/,/g, "").trim();
  const parsed = Number(normalized);

  return Number.isFinite(parsed) ? parsed : 0;
}

export function normalizeScanQty(value: unknown, minimum = 1) {
  const parsed = typeof value === "number" ? value : Number(String(value ?? "").replace(/,/g, "").trim());
  const safeMinimum = Math.max(0, Math.ceil(minimum));

  return Number.isFinite(parsed) && parsed >= 0 ? Math.max(safeMinimum, Math.ceil(parsed)) : safeMinimum;
}

export function buildJobItems(records: PORegistryRecord[], scanQuantities: Record<string, number> = {}) {
  return records.map((record) => {
    const destinationName = getDestinationNameForPORecord(record);
    const destinationId = slugifyDestination(destinationName);

    return {
      registryKey: record.registryKey,
      poSapNo: record.poSapNo,
      poSapItem: record.poSapItem,
      vendor: record.vendor,
      poWebNo: record.poWebNo,
      plantCode: record.plantCode,
      unitName: record.unitName,
      materialCode: record.materialCode,
      materialName: record.materialName,
      sourceOrderQty: record.orderQty,
      sourceTotalAmount: record.totalAmount,
      orderQty: normalizeScanQty(scanQuantities[record.registryKey] ?? 1, 0),
      loadedQty: 0,
      deliveredQty: 0,
      destinationId,
      destinationName,
    };
  });
}

export function buildJobDestinations(items: JobItemRecord[]) {
  const destinationMap = new Map<string, JobDestinationRecord>();

  items.forEach((item) => {
    if (!destinationMap.has(item.destinationId)) {
      destinationMap.set(item.destinationId, {
        id: item.destinationId,
        name: item.destinationName,
        address: item.destinationName,
        gps: "-",
        radiusMeters: 150,
        deliveryGps: "",
      });
    }
  });

  return Array.from(destinationMap.values());
}

export function applyDestinationOverrides(
  items: JobItemRecord[],
  destinations: JobDestinationRecord[],
  overrides: JobDestinationOverrideInput[] = [],
) {
  const overridesById = new Map(
    overrides
      .filter((override) => override.id.trim())
      .map((override) => [override.id.trim(), override]),
  );

  const nextDestinations = destinations.map((destination) => {
    const override = overridesById.get(destination.id);

    if (!override) {
      return destination;
    }

    const name = override.name?.trim() || destination.name;
    const address = override.address?.trim() || name;
    const radiusMeters =
      typeof override.radiusMeters === "number" && Number.isFinite(override.radiusMeters) && override.radiusMeters > 0
        ? override.radiusMeters
        : destination.radiusMeters;

    return {
      ...destination,
      name,
      address,
      radiusMeters,
    };
  });

  const destinationNames = new Map(nextDestinations.map((destination) => [destination.id, destination.name]));
  const nextItems = items.map((item) => ({
    ...item,
    destinationName: destinationNames.get(item.destinationId) || item.destinationName,
  }));

  return {
    items: nextItems,
    destinations: nextDestinations,
  };
}

export function normalizeJobDestination(destination: Partial<JobDestinationRecord>): JobDestinationRecord {
  return {
    id: String(destination.id ?? ""),
    name: String(destination.name ?? ""),
    address: String(destination.address ?? ""),
    gps: String(destination.gps ?? "-"),
    radiusMeters: Number(destination.radiusMeters ?? 150),
    deliveryGps: String(destination.deliveryGps ?? ""),
    deliveryCheckedInAt: destination.deliveryCheckedInAt ? String(destination.deliveryCheckedInAt) : undefined,
  };
}

export function buildJobId(now = new Date()) {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  const hours = String(now.getHours()).padStart(2, "0");
  const minutes = String(now.getMinutes()).padStart(2, "0");
  const seconds = String(now.getSeconds()).padStart(2, "0");

  return `JOB-${year}${month}${day}-${hours}${minutes}${seconds}`;
}

export function formatTime(value: string) {
  return new Intl.DateTimeFormat("th-TH", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export function getJobItemLabel(item: Pick<JobItemRecord, "poSapNo" | "poSapItem" | "materialName" | "registryKey">) {
  const poLabel = item.poSapNo ? `PO ${item.poSapNo}${item.poSapItem ? ` / Item ${item.poSapItem}` : ""}` : "";

  return poLabel || item.materialName || item.registryKey;
}

function parseSortableNumber(value: string) {
  const normalizedValue = value.replace(/,/g, "").trim();

  if (!normalizedValue || !/^-?\d+(\.\d+)?$/.test(normalizedValue)) {
    return null;
  }

  return Number(normalizedValue);
}

export function sortJobItems(items: JobItemRecord[]) {
  return [...items].sort((firstItem, secondItem) => {
    if (firstItem.poSapNo !== secondItem.poSapNo) {
      return firstItem.poSapNo.localeCompare(secondItem.poSapNo, "th", {
        numeric: true,
        sensitivity: "base",
      });
    }

    const firstItemNumber = parseSortableNumber(firstItem.poSapItem);
    const secondItemNumber = parseSortableNumber(secondItem.poSapItem);

    if (firstItemNumber !== null && secondItemNumber !== null && firstItemNumber !== secondItemNumber) {
      return firstItemNumber - secondItemNumber;
    }

    return firstItem.poSapItem.localeCompare(secondItem.poSapItem, "th", {
      numeric: true,
      sensitivity: "base",
    });
  });
}

export function summarizeJob(job: JobRecord) {
  const requiredTotal = job.items.reduce((sum, item) => sum + item.orderQty, 0);
  const loadedTotal = job.items.reduce((sum, item) => sum + item.loadedQty, 0);
  const deliveredTotal = job.items.reduce((sum, item) => sum + item.deliveredQty, 0);
  const isFullyLoaded = requiredTotal > 0 && loadedTotal >= requiredTotal;
  const isOriginLocked = Boolean(job.originLockedAt);
  const route = `${job.origin} -> ${job.destinations.length} ปลายทาง`;

  const destinations = job.destinations.map((destination) => {
    const items = sortJobItems(job.items.filter((item) => item.destinationId === destination.id));
    const required = items.reduce((sum, item) => sum + item.orderQty, 0);
    const loaded = items.reduce((sum, item) => sum + item.loadedQty, 0);
    const delivered = items.reduce((sum, item) => sum + item.deliveredQty, 0);
    let status = "รอโหลด";

    if (delivered >= required && required > 0) {
      status = "ส่งครบ";
    } else if (loaded >= required && required > 0) {
      status = "โหลดครบ";
    } else if (loaded > 0) {
      status = "กำลังโหลด";
    }

    return {
      ...destination,
      status,
      required,
      loaded,
      delivered,
      items,
    };
  });

  const poStatusMap = new Map<string, { required: number; delivered: number }>();
  job.items.forEach((item) => {
    const current = poStatusMap.get(item.poSapNo) ?? { required: 0, delivered: 0 };
    current.required += item.orderQty;
    current.delivered += item.deliveredQty;
    poStatusMap.set(item.poSapNo, current);
  });

  const poStatuses = Array.from(poStatusMap.entries()).map(([po, totals]) => {
    if (totals.delivered >= totals.required && totals.required > 0) {
      return { po, status: "ส่งครบ", variant: "success" as const };
    }

    if (totals.delivered > 0) {
      return { po, status: "ส่งบางส่วน", variant: "warning" as const };
    }

    return { po, status: "รอส่ง", variant: "secondary" as const };
  });

  return {
    ...job,
    route,
    requiredTotal,
    loadedTotal,
    deliveredTotal,
    isFullyLoaded,
    isOriginLocked,
    canOpenDestinationMode: isFullyLoaded || Boolean(job.allowDestinationBeforeFullyLoaded),
    destinations,
    poStatuses,
  };
}

export type JobSummaryRecord = ReturnType<typeof summarizeJob>;

export function summarizeJobArchive(job: JobArchiveRecord) {
  const summary = summarizeJob(job);

  return {
    ...summary,
    archivedAt: job.archivedAt,
    deleteAfterAt: job.deleteAfterAt,
  };
}

export type JobArchiveSummaryRecord = ReturnType<typeof summarizeJobArchive>;
