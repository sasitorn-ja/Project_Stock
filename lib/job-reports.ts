import { getJobStatusLabel } from "@/lib/job-labels";
import { listJobArchives, listJobs } from "@/lib/job-store";
import type { JobArchiveSummaryRecord, JobSummaryRecord } from "@/lib/jobs";

export type JobReportStatusFilter = "all" | "active" | "archived";

export type JobReportFilters = {
  query?: string;
  dateFrom?: string;
  dateTo?: string;
  status?: JobReportStatusFilter;
  jobIds?: string[];
};

export type JobReportRecord =
  | (JobSummaryRecord & {
      reportKind: "active";
      reportEventDate: string;
    })
  | (JobArchiveSummaryRecord & {
      reportKind: "archived";
      reportEventDate: string;
    });

export type JobReportExcelRow = Record<string, string | number>;

const bangkokTimeZone = "Asia/Bangkok";

export const jobReportExcelHeaders = [
  "ประเภทงาน",
  "รหัส Job",
  "ห้องงาน",
  "สถานะ",
  "วันที่สร้าง",
  "วันที่อัปเดต",
  "วันที่ปิดงาน",
  "วันที่เก็บเข้าประวัติ",
  "คนขับ",
  "รถ",
  "ต้นทาง",
  "GPS ต้นทาง",
  "เวลาเช็กอินต้นทาง",
  "หมายเหตุ",
  "จำนวนต้องสแกนรวม",
  "ขึ้นรถรวม",
  "ส่งของรวม",
  "จำนวน PO",
  "จำนวนปลายทาง",
  "จำนวน alerts",
  "จำนวน scan logs",
  "ลบอัตโนมัติ",
  "registry key",
  "PO SAP",
  "PO item",
  "PO web",
  "vendor",
  "unit",
  "material code",
  "material name",
  "จำนวนในไฟล์",
  "มูลค่าจากไฟล์",
  "จำนวนต้องสแกน",
  "ขึ้นรถแล้ว",
  "ส่งแล้ว",
  "สถานะรายการ",
  "destination id",
  "destination name",
  "destination address",
  "GPS ปลายทาง",
  "รัศมี",
  "GPS ส่งของจริง",
  "เวลาเช็กอินปลายทาง",
  "สถานะปลายทาง",
  "จำนวนสแกนขึ้นรถ",
  "จำนวนสแกนส่ง",
  "จำนวน scan alert",
  "เวลาสแกนล่าสุด",
  "ข้อความสแกนล่าสุด",
  "PO ทั้งงาน",
] as const;

function normalizeStatusFilter(value: string | undefined): JobReportStatusFilter {
  return value === "active" || value === "archived" ? value : "all";
}

function parseDateBoundary(value: string | undefined, endOfDay = false) {
  if (!value?.trim()) {
    return null;
  }

  const date = new Date(`${value.trim()}T${endOfDay ? "23:59:59.999" : "00:00:00"}`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function getArchivedAt(job: JobReportRecord) {
  return job.reportKind === "archived" ? job.archivedAt : "";
}

function getDeleteAfterAt(job: JobReportRecord) {
  return job.reportKind === "archived" ? job.deleteAfterAt : "";
}

function getReportEventDate(job: JobSummaryRecord | JobArchiveSummaryRecord, reportKind: JobReportRecord["reportKind"]) {
  return reportKind === "archived"
    ? (job.completedAt || (job as JobArchiveSummaryRecord).archivedAt)
    : job.createdAt;
}

function jobMatchesQuery(job: JobReportRecord, query: string) {
  const normalizedQuery = query.trim().toLowerCase();

  if (!normalizedQuery) {
    return true;
  }

  const textPool = [
    job.id,
    job.roomName,
    job.driver,
    job.vehicle,
    job.origin,
    job.note,
    ...job.items.flatMap((item) => [
      item.registryKey,
      item.poSapNo,
      item.poSapItem,
      item.poWebNo,
      item.vendor,
      item.unitName,
      item.materialCode,
      item.materialName,
      item.destinationName,
    ]),
    ...job.destinations.flatMap((destination) => [destination.id, destination.name, destination.address, destination.gps]),
  ]
    .join(" ")
    .toLowerCase();

  return textPool.includes(normalizedQuery);
}

function jobMatchesDateRange(job: JobReportRecord, dateFrom?: string, dateTo?: string) {
  const eventDate = new Date(job.reportEventDate);

  if (Number.isNaN(eventDate.getTime())) {
    return false;
  }

  const from = parseDateBoundary(dateFrom);
  const to = parseDateBoundary(dateTo, true);

  if (from && eventDate < from) {
    return false;
  }

  if (to && eventDate > to) {
    return false;
  }

  return true;
}

function uniqueText(values: string[]) {
  return Array.from(new Set(values.filter(Boolean))).join(", ");
}

function formatDateTime(value?: string) {
  if (!value) {
    return "";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return new Intl.DateTimeFormat("th-TH", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: bangkokTimeZone,
  }).format(date);
}

function formatItemStatus(item: JobReportRecord["items"][number]) {
  if (item.orderQty > 0 && item.deliveredQty >= item.orderQty) {
    return "ส่งครบ";
  }

  if (item.loadedQty > 0 || item.deliveredQty > 0) {
    return "กำลังดำเนินการ";
  }

  return "รอดำเนินการ";
}

function getItemScanSummary(job: JobReportRecord, registryKey: string) {
  const matchingLogs = job.scanLogs.filter((log) => log.registryKey === registryKey);
  const loadCount = matchingLogs.filter((log) => log.mode === "load" && log.result === "ok").length;
  const deliverCount = matchingLogs.filter((log) => log.mode === "deliver" && log.result === "ok").length;
  const alertCount = matchingLogs.filter((log) => log.result === "alert").length;
  const latestLog = matchingLogs
    .slice()
    .sort((first, second) => second.createdAt.localeCompare(first.createdAt))[0];

  return {
    loadCount,
    deliverCount,
    alertCount,
    latestAt: latestLog?.createdAt ?? "",
    latestMessage: latestLog?.message ?? "",
  };
}

export async function getJobReportJobs(filters: JobReportFilters = {}) {
  const status = normalizeStatusFilter(filters.status);
  const jobIdSet = new Set((filters.jobIds ?? []).map((jobId) => jobId.trim()).filter(Boolean));
  const jobs: JobReportRecord[] = [];

  if (status === "all" || status === "active") {
    const activeJobs = await listJobs();
    jobs.push(
      ...activeJobs.map((job) => ({
        ...job,
        reportKind: "active" as const,
        reportEventDate: getReportEventDate(job, "active"),
      })),
    );
  }

  if (status === "all" || status === "archived") {
    const archivedJobs = await listJobArchives();
    jobs.push(
      ...archivedJobs.map((job) => ({
        ...job,
        reportKind: "archived" as const,
        reportEventDate: getReportEventDate(job, "archived"),
      })),
    );
  }

  return jobs
    .filter((job) => (jobIdSet.size ? jobIdSet.has(job.id) : true))
    .filter((job) => jobMatchesQuery(job, filters.query ?? ""))
    .filter((job) => jobMatchesDateRange(job, filters.dateFrom, filters.dateTo))
    .sort((first, second) => second.reportEventDate.localeCompare(first.reportEventDate));
}

export function buildJobReportExcelRows(jobs: JobReportRecord[]): JobReportExcelRow[] {
  return jobs.flatMap((job) => {
    const poCount = new Set(job.items.map((item) => item.poSapNo).filter(Boolean)).size;
    const base = {
      "ประเภทงาน": job.reportKind === "archived" ? "งานปิดแล้ว" : "งานเปิดอยู่",
      "รหัส Job": job.id,
      "ห้องงาน": job.roomName || job.id,
      "สถานะ": getJobStatusLabel(job.status),
      "วันที่สร้าง": formatDateTime(job.createdAt),
      "วันที่อัปเดต": formatDateTime(job.updatedAt),
      "วันที่ปิดงาน": formatDateTime(job.completedAt),
      "วันที่เก็บเข้าประวัติ": formatDateTime(getArchivedAt(job)),
      "คนขับ": job.driver || "",
      "รถ": job.vehicle || "",
      "ต้นทาง": job.origin || "",
      "GPS ต้นทาง": job.originGps || "",
      "เวลาเช็กอินต้นทาง": formatDateTime(job.originCheckedInAt),
      "หมายเหตุ": job.note || "",
      "จำนวนต้องสแกนรวม": job.requiredTotal,
      "ขึ้นรถรวม": job.loadedTotal,
      "ส่งของรวม": job.deliveredTotal,
      "จำนวน PO": poCount,
      "จำนวนปลายทาง": job.destinations.length,
      "จำนวน alerts": job.alerts.length,
      "จำนวน scan logs": job.scanLogs.length,
      "ลบอัตโนมัติ": formatDateTime(getDeleteAfterAt(job)),
    };

    if (!job.items.length) {
      return [base];
    }

    return job.items.map((item) => {
      const destination = job.destinations.find((currentDestination) => currentDestination.id === item.destinationId);
      const scanSummary = getItemScanSummary(job, item.registryKey);

      return {
        ...base,
        "registry key": item.registryKey,
        "PO SAP": item.poSapNo,
        "PO item": item.poSapItem,
        "PO web": item.poWebNo,
        "vendor": item.vendor,
        "unit": item.unitName,
        "material code": item.materialCode,
        "material name": item.materialName,
        "จำนวนในไฟล์": item.sourceOrderQty || "",
        "มูลค่าจากไฟล์": item.sourceTotalAmount || "",
        "จำนวนต้องสแกน": item.orderQty,
        "ขึ้นรถแล้ว": item.loadedQty,
        "ส่งแล้ว": item.deliveredQty,
        "สถานะรายการ": formatItemStatus(item),
        "destination id": item.destinationId,
        "destination name": destination?.name || item.destinationName,
        "destination address": destination?.address || "",
        "GPS ปลายทาง": destination?.gps || "",
        "รัศมี": destination?.radiusMeters ?? "",
        "GPS ส่งของจริง": destination?.deliveryGps || "",
        "เวลาเช็กอินปลายทาง": formatDateTime(destination?.deliveryCheckedInAt),
        "สถานะปลายทาง": destination?.status || "",
        "จำนวนสแกนขึ้นรถ": scanSummary.loadCount,
        "จำนวนสแกนส่ง": scanSummary.deliverCount,
        "จำนวน scan alert": scanSummary.alertCount,
        "เวลาสแกนล่าสุด": formatDateTime(scanSummary.latestAt),
        "ข้อความสแกนล่าสุด": scanSummary.latestMessage,
        "PO ทั้งงาน": uniqueText(job.items.map((currentItem) => currentItem.poSapNo)),
      };
    });
  });
}
