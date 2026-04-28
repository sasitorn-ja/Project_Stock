import { type PORegistryRecord } from "@/lib/po-registry";

export type JobStatus = "ready" | "loading" | "in_transit" | "completed";
export type ScanMode = "load" | "deliver";
export type AlertSeverity = "สูง" | "กลาง";

export type JobItemRecord = {
  registryKey: string;
  poSapNo: string;
  poSapItem: string;
  vendor: string;
  poWebNo: string;
  unitName: string;
  materialCode: string;
  materialName: string;
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
  createdAt: string;
  updatedAt: string;
  status: JobStatus;
  driver: string;
  vehicle: string;
  origin: string;
  originGps: string;
  originCheckedInAt?: string;
  note: string;
  poRegistryKeys: string[];
  items: JobItemRecord[];
  destinations: JobDestinationRecord[];
  alerts: JobAlertRecord[];
  scanLogs: JobScanLogRecord[];
};

export function slugifyDestination(value: string) {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9ก-๙]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return normalized || "unknown-destination";
}

export function parseQty(value: string) {
  const normalized = value.replace(/,/g, "").trim();
  const parsed = Number(normalized);

  return Number.isFinite(parsed) ? parsed : 0;
}

export function buildJobItems(records: PORegistryRecord[]) {
  return records.map((record) => {
    const destinationName = record.unitName.trim() || "ไม่ระบุปลายทาง";
    const destinationId = slugifyDestination(destinationName);

    return {
      registryKey: record.registryKey,
      poSapNo: record.poSapNo,
      poSapItem: record.poSapItem,
      vendor: record.vendor,
      poWebNo: record.poWebNo,
      unitName: record.unitName,
      materialCode: record.materialCode,
      materialName: record.materialName,
      orderQty: parseQty(record.orderQty),
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
      });
    }
  });

  return Array.from(destinationMap.values());
}

export function buildJobId(now = new Date()) {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  const hours = String(now.getHours()).padStart(2, "0");
  const minutes = String(now.getMinutes()).padStart(2, "0");

  return `JOB-${year}${month}${day}-${hours}${minutes}`;
}

export function formatTime(value: string) {
  return new Intl.DateTimeFormat("th-TH", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export function getJobItemLabel(item: Pick<JobItemRecord, "materialCode" | "materialName" | "registryKey">) {
  return item.materialCode || item.materialName || item.registryKey;
}

export function summarizeJob(job: JobRecord) {
  const requiredTotal = job.items.reduce((sum, item) => sum + item.orderQty, 0);
  const loadedTotal = job.items.reduce((sum, item) => sum + item.loadedQty, 0);
  const deliveredTotal = job.items.reduce((sum, item) => sum + item.deliveredQty, 0);
  const route = `${job.origin} -> ${job.destinations.length} ปลายทาง`;

  const destinations = job.destinations.map((destination) => {
    const items = job.items.filter((item) => item.destinationId === destination.id);
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
    destinations,
    poStatuses,
  };
}
