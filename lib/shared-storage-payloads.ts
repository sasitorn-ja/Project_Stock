import { normalizeJobDestination, type JobArchiveRecord, type JobRecord } from "@/lib/jobs";
import type { NewPORegistryRecord, PORegistryArchiveRecord, PORegistryRecord } from "@/lib/po-registry";

type DatabaseRow = Record<string, unknown>;

export type PORegistryDatabasePayload = {
  registry_key: string;
  po_sap_no: string;
  po_sap_item: string;
  first_imported_at: string;
  latest_imported_at: string;
  source_file_name: string;
  source_sheet_name: string;
  row_number: number;
  status: string;
  vendor: string;
  po_web_no: string;
  unit_name: string;
  material_code: string;
  material_name: string;
  order_qty: string;
  received_qty: string;
  total_amount: string;
  import_count: number;
  lifecycle: PORegistryRecord["lifecycle"];
  assigned_job_id: string | null;
  assigned_at: string | null;
  archived_at: string | null;
  completed_at: string | null;
  purge_after_at: string | null;
};

export type JobDatabasePayload = {
  id: string;
  created_at: string;
  updated_at: string;
  status: JobRecord["status"];
  driver: string;
  vehicle: string;
  origin: string;
  origin_gps: string;
  origin_checked_in_at: string | null;
  note: string;
  po_registry_keys: string[];
  items: JobRecord["items"];
  destinations: JobRecord["destinations"];
  alerts: JobRecord["alerts"];
  scan_logs: JobRecord["scanLogs"];
  completed_at: string | null;
  purge_after_at: string | null;
};

export type JobArchiveDatabasePayload = {
  job_id: string;
  created_at: string;
  updated_at: string;
  status: JobRecord["status"];
  driver: string;
  vehicle: string;
  origin: string;
  origin_gps: string;
  origin_checked_in_at: string | null;
  note: string;
  po_registry_keys: string[];
  items: JobRecord["items"];
  destinations: JobRecord["destinations"];
  alerts: JobRecord["alerts"];
  scan_logs: JobRecord["scanLogs"];
  completed_at: string | null;
  archived_at: string;
  delete_after_at: string;
};

export type PORegistryArchiveDatabasePayload = {
  archived_from_job_id: string;
  registry_key: string;
  po_sap_no: string;
  po_sap_item: string;
  first_imported_at: string;
  latest_imported_at: string;
  source_file_name: string;
  source_sheet_name: string;
  row_number: number;
  status: string;
  vendor: string;
  po_web_no: string;
  unit_name: string;
  material_code: string;
  material_name: string;
  order_qty: string;
  received_qty: string;
  total_amount: string;
  import_count: number;
  lifecycle: PORegistryRecord["lifecycle"];
  assigned_job_id: string | null;
  assigned_at: string | null;
  archived_at: string;
  completed_at: string | null;
  delete_after_at: string;
};

function toOptionalIsoString(value: unknown) {
  if (!value) {
    return undefined;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  return String(value);
}

export function createStoredPORegistryRecord(record: NewPORegistryRecord, importedAt: string): PORegistryRecord {
  return {
    ...record,
    firstImportedAt: importedAt,
    latestImportedAt: importedAt,
    importCount: 1,
    lifecycle: "active",
  };
}

export function serializePORegistryRecordForDatabase(record: PORegistryRecord): PORegistryDatabasePayload {
  return {
    registry_key: record.registryKey,
    po_sap_no: record.poSapNo,
    po_sap_item: record.poSapItem,
    first_imported_at: record.firstImportedAt,
    latest_imported_at: record.latestImportedAt,
    source_file_name: record.sourceFileName,
    source_sheet_name: record.sourceSheetName,
    row_number: record.rowNumber,
    status: record.status,
    vendor: record.vendor,
    po_web_no: record.poWebNo,
    unit_name: record.unitName,
    material_code: record.materialCode,
    material_name: record.materialName,
    order_qty: record.orderQty,
    received_qty: record.receivedQty,
    total_amount: record.totalAmount,
    import_count: record.importCount,
    lifecycle: record.lifecycle,
    assigned_job_id: record.assignedJobId ?? null,
    assigned_at: record.assignedAt ?? null,
    archived_at: record.archivedAt ?? null,
    completed_at: record.completedAt ?? null,
    purge_after_at: record.purgeAfterAt ?? null,
  };
}

export function mapDatabasePORecord(row: DatabaseRow): PORegistryRecord {
  return {
    registryKey: String(row.registry_key ?? ""),
    poSapNo: String(row.po_sap_no ?? ""),
    poSapItem: String(row.po_sap_item ?? ""),
    firstImportedAt: toOptionalIsoString(row.first_imported_at) ?? new Date(0).toISOString(),
    latestImportedAt: toOptionalIsoString(row.latest_imported_at) ?? new Date(0).toISOString(),
    sourceFileName: String(row.source_file_name ?? ""),
    sourceSheetName: String(row.source_sheet_name ?? ""),
    rowNumber: Number(row.row_number ?? 0),
    status: String(row.status ?? ""),
    vendor: String(row.vendor ?? ""),
    poWebNo: String(row.po_web_no ?? ""),
    unitName: String(row.unit_name ?? ""),
    materialCode: String(row.material_code ?? ""),
    materialName: String(row.material_name ?? ""),
    orderQty: String(row.order_qty ?? ""),
    receivedQty: String(row.received_qty ?? ""),
    totalAmount: String(row.total_amount ?? ""),
    importCount: Number(row.import_count ?? 0),
    lifecycle: (row.lifecycle as PORegistryRecord["lifecycle"]) ?? "active",
    assignedJobId: row.assigned_job_id ? String(row.assigned_job_id) : undefined,
    assignedAt: toOptionalIsoString(row.assigned_at),
    archivedAt: toOptionalIsoString(row.archived_at),
    completedAt: toOptionalIsoString(row.completed_at),
    purgeAfterAt: toOptionalIsoString(row.purge_after_at),
  };
}

export function serializeJobRecordForDatabase(job: JobRecord): JobDatabasePayload {
  return {
    id: job.id,
    created_at: job.createdAt,
    updated_at: job.updatedAt,
    status: job.status,
    driver: job.driver,
    vehicle: job.vehicle,
    origin: job.origin,
    origin_gps: job.originGps,
    origin_checked_in_at: job.originCheckedInAt ?? null,
    note: job.note,
    po_registry_keys: job.poRegistryKeys,
    items: job.items,
    destinations: job.destinations,
    alerts: job.alerts,
    scan_logs: job.scanLogs,
    completed_at: job.completedAt ?? null,
    purge_after_at: job.purgeAfterAt ?? null,
  };
}

export function serializeJobArchiveRecordForDatabase(job: JobArchiveRecord): JobArchiveDatabasePayload {
  return {
    job_id: job.id,
    created_at: job.createdAt,
    updated_at: job.updatedAt,
    status: job.status,
    driver: job.driver,
    vehicle: job.vehicle,
    origin: job.origin,
    origin_gps: job.originGps,
    origin_checked_in_at: job.originCheckedInAt ?? null,
    note: job.note,
    po_registry_keys: job.poRegistryKeys,
    items: job.items,
    destinations: job.destinations,
    alerts: job.alerts,
    scan_logs: job.scanLogs,
    completed_at: job.completedAt ?? null,
    archived_at: job.archivedAt,
    delete_after_at: job.deleteAfterAt,
  };
}

export function mapDatabaseJobArchive(row: DatabaseRow): JobArchiveRecord {
  return {
    id: String(row.job_id ?? ""),
    createdAt: toOptionalIsoString(row.created_at) ?? new Date(0).toISOString(),
    updatedAt: toOptionalIsoString(row.updated_at) ?? new Date(0).toISOString(),
    status: String(row.status ?? "ready") as JobRecord["status"],
    driver: String(row.driver ?? ""),
    vehicle: String(row.vehicle ?? ""),
    origin: String(row.origin ?? ""),
    originGps: String(row.origin_gps ?? ""),
    originCheckedInAt: toOptionalIsoString(row.origin_checked_in_at),
    note: String(row.note ?? ""),
    poRegistryKeys: Array.isArray(row.po_registry_keys) ? row.po_registry_keys.map((item) => String(item)) : [],
    items: Array.isArray(row.items) ? (row.items as JobRecord["items"]) : [],
    destinations: Array.isArray(row.destinations)
      ? (row.destinations as Partial<JobRecord["destinations"][number]>[]).map(normalizeJobDestination)
      : [],
    alerts: Array.isArray(row.alerts) ? (row.alerts as JobRecord["alerts"]) : [],
    scanLogs: Array.isArray(row.scan_logs) ? (row.scan_logs as JobRecord["scanLogs"]) : [],
    completedAt: toOptionalIsoString(row.completed_at),
    archivedAt: toOptionalIsoString(row.archived_at) ?? new Date(0).toISOString(),
    deleteAfterAt: toOptionalIsoString(row.delete_after_at) ?? new Date(0).toISOString(),
  };
}

export function serializePORegistryArchiveRecordForDatabase(
  record: PORegistryArchiveRecord,
): PORegistryArchiveDatabasePayload {
  return {
    archived_from_job_id: record.archivedFromJobId,
    registry_key: record.registryKey,
    po_sap_no: record.poSapNo,
    po_sap_item: record.poSapItem,
    first_imported_at: record.firstImportedAt,
    latest_imported_at: record.latestImportedAt,
    source_file_name: record.sourceFileName,
    source_sheet_name: record.sourceSheetName,
    row_number: record.rowNumber,
    status: record.status,
    vendor: record.vendor,
    po_web_no: record.poWebNo,
    unit_name: record.unitName,
    material_code: record.materialCode,
    material_name: record.materialName,
    order_qty: record.orderQty,
    received_qty: record.receivedQty,
    total_amount: record.totalAmount,
    import_count: record.importCount,
    lifecycle: record.lifecycle,
    assigned_job_id: record.assignedJobId ?? null,
    assigned_at: record.assignedAt ?? null,
    archived_at: record.archivedAt,
    completed_at: record.completedAt ?? null,
    delete_after_at: record.deleteAfterAt,
  };
}

export function mapDatabaseJob(row: DatabaseRow): JobRecord {
  return {
    id: String(row.id ?? ""),
    createdAt: toOptionalIsoString(row.created_at) ?? new Date(0).toISOString(),
    updatedAt: toOptionalIsoString(row.updated_at) ?? new Date(0).toISOString(),
    status: String(row.status ?? "ready") as JobRecord["status"],
    driver: String(row.driver ?? ""),
    vehicle: String(row.vehicle ?? ""),
    origin: String(row.origin ?? ""),
    originGps: String(row.origin_gps ?? ""),
    originCheckedInAt: toOptionalIsoString(row.origin_checked_in_at),
    note: String(row.note ?? ""),
    poRegistryKeys: Array.isArray(row.po_registry_keys) ? row.po_registry_keys.map((item) => String(item)) : [],
    items: Array.isArray(row.items) ? (row.items as JobRecord["items"]) : [],
    destinations: Array.isArray(row.destinations)
      ? (row.destinations as Partial<JobRecord["destinations"][number]>[]).map(normalizeJobDestination)
      : [],
    alerts: Array.isArray(row.alerts) ? (row.alerts as JobRecord["alerts"]) : [],
    scanLogs: Array.isArray(row.scan_logs) ? (row.scan_logs as JobRecord["scanLogs"]) : [],
    completedAt: toOptionalIsoString(row.completed_at),
    purgeAfterAt: toOptionalIsoString(row.purge_after_at),
  };
}
