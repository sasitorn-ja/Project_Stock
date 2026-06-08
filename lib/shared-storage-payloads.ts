import { normalizeJobDestination, type JobArchiveRecord, type JobRecord } from "@/lib/jobs";
import type { NewPORegistryRecord, PORegistryArchiveRecord, PORegistryRecord } from "@/lib/po-registry";

type DatabaseRow = Record<string, unknown>;

export type PORegistryDatabasePayload = {
  line_registry_key: string;
  purchase_order_number: string;
  purchase_order_item_number: string;
  first_imported_at: string;
  last_imported_at: string;
  import_file_name: string;
  import_sheet_name: string;
  import_row_number: number;
  document_status: string;
  vendor_name: string;
  web_order_number: string;
  plant_code: string;
  business_unit_name: string;
  material_code: string;
  material_name: string;
  ordered_quantity_text: string;
  received_quantity_text: string;
  total_amount_text: string;
  import_count: number;
  record_state: PORegistryRecord["lifecycle"];
  assigned_delivery_job_id: string | null;
  assigned_to_job_at: string | null;
  archived_at: string | null;
  completed_at: string | null;
  cleanup_after_at: string | null;
};

export type JobDatabasePayload = {
  delivery_job_id: string;
  job_room_name: string;
  created_at: string;
  updated_at: string;
  job_status: JobRecord["status"];
  driver_name: string;
  vehicle_plate: string;
  origin_location_name: string;
  origin_check_in_coordinates: string;
  origin_checked_in_at: string | null;
  origin_locked_at: string | null;
  allow_origin_recheck_after_locked: boolean;
  allow_destination_before_fully_loaded: boolean;
  job_note: string;
  selected_line_registry_keys: string[];
  job_items_json: JobRecord["items"];
  delivery_destinations_json: JobRecord["destinations"];
  job_alerts_json: JobRecord["alerts"];
  scan_events_json: JobRecord["scanLogs"];
  completed_at: string | null;
  cleanup_after_at: string | null;
};

export type JobArchiveDatabasePayload = {
  delivery_job_id: string;
  job_room_name: string;
  created_at: string;
  updated_at: string;
  job_status: JobRecord["status"];
  driver_name: string;
  vehicle_plate: string;
  origin_location_name: string;
  origin_check_in_coordinates: string;
  origin_checked_in_at: string | null;
  origin_locked_at: string | null;
  allow_origin_recheck_after_locked: boolean;
  allow_destination_before_fully_loaded: boolean;
  job_note: string;
  selected_line_registry_keys: string[];
  job_items_json: JobRecord["items"];
  delivery_destinations_json: JobRecord["destinations"];
  job_alerts_json: JobRecord["alerts"];
  scan_events_json: JobRecord["scanLogs"];
  completed_at: string | null;
  archived_at: string;
  delete_after_at: string;
};

export type PORegistryArchiveDatabasePayload = {
  archived_from_delivery_job_id: string;
  line_registry_key: string;
  purchase_order_number: string;
  purchase_order_item_number: string;
  first_imported_at: string;
  last_imported_at: string;
  import_file_name: string;
  import_sheet_name: string;
  import_row_number: number;
  document_status: string;
  vendor_name: string;
  web_order_number: string;
  plant_code: string;
  business_unit_name: string;
  material_code: string;
  material_name: string;
  ordered_quantity_text: string;
  received_quantity_text: string;
  total_amount_text: string;
  import_count: number;
  record_state: PORegistryRecord["lifecycle"];
  assigned_delivery_job_id: string | null;
  assigned_to_job_at: string | null;
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

function toJsonArray<T>(value: unknown): T[] {
  if (Array.isArray(value)) {
    return value as T[];
  }

  if (typeof value !== "string" || !value.trim()) {
    return [];
  }

  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
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
    line_registry_key: record.registryKey,
    purchase_order_number: record.poSapNo,
    purchase_order_item_number: record.poSapItem,
    first_imported_at: record.firstImportedAt,
    last_imported_at: record.latestImportedAt,
    import_file_name: record.sourceFileName,
    import_sheet_name: record.sourceSheetName,
    import_row_number: record.rowNumber,
    document_status: record.status,
    vendor_name: record.vendor,
    web_order_number: record.poWebNo,
    plant_code: record.plantCode ?? "",
    business_unit_name: record.unitName,
    material_code: record.materialCode,
    material_name: record.materialName,
    ordered_quantity_text: record.orderQty,
    received_quantity_text: record.receivedQty,
    total_amount_text: record.totalAmount,
    import_count: record.importCount,
    record_state: record.lifecycle,
    assigned_delivery_job_id: record.assignedJobId ?? null,
    assigned_to_job_at: record.assignedAt ?? null,
    archived_at: record.archivedAt ?? null,
    completed_at: record.completedAt ?? null,
    cleanup_after_at: record.purgeAfterAt ?? null,
  };
}

export function mapDatabasePORecord(row: DatabaseRow): PORegistryRecord {
  return {
    registryKey: String(row.line_registry_key ?? ""),
    poSapNo: String(row.purchase_order_number ?? ""),
    poSapItem: String(row.purchase_order_item_number ?? ""),
    firstImportedAt: toOptionalIsoString(row.first_imported_at) ?? new Date(0).toISOString(),
    latestImportedAt: toOptionalIsoString(row.last_imported_at) ?? new Date(0).toISOString(),
    sourceFileName: String(row.import_file_name ?? ""),
    sourceSheetName: String(row.import_sheet_name ?? ""),
    rowNumber: Number(row.import_row_number ?? 0),
    status: String(row.document_status ?? ""),
    vendor: String(row.vendor_name ?? ""),
    poWebNo: String(row.web_order_number ?? ""),
    plantCode: String(row.plant_code ?? ""),
    unitName: String(row.business_unit_name ?? ""),
    materialCode: String(row.material_code ?? ""),
    materialName: String(row.material_name ?? ""),
    orderQty: String(row.ordered_quantity_text ?? ""),
    receivedQty: String(row.received_quantity_text ?? ""),
    totalAmount: String(row.total_amount_text ?? ""),
    importCount: Number(row.import_count ?? 0),
    lifecycle: (row.record_state as PORegistryRecord["lifecycle"]) ?? "active",
    assignedJobId: row.assigned_delivery_job_id ? String(row.assigned_delivery_job_id) : undefined,
    assignedAt: toOptionalIsoString(row.assigned_to_job_at),
    archivedAt: toOptionalIsoString(row.archived_at),
    completedAt: toOptionalIsoString(row.completed_at),
    purgeAfterAt: toOptionalIsoString(row.cleanup_after_at),
  };
}

export function serializeJobRecordForDatabase(job: JobRecord): JobDatabasePayload {
  return {
    delivery_job_id: job.id,
    job_room_name: job.roomName,
    created_at: job.createdAt,
    updated_at: job.updatedAt,
    job_status: job.status,
    driver_name: job.driver,
    vehicle_plate: job.vehicle,
    origin_location_name: job.origin,
    origin_check_in_coordinates: job.originGps,
    origin_checked_in_at: job.originCheckedInAt ?? null,
    origin_locked_at: job.originLockedAt ?? null,
    allow_origin_recheck_after_locked: Boolean(job.allowOriginRecheckAfterLocked),
    allow_destination_before_fully_loaded: Boolean(job.allowDestinationBeforeFullyLoaded),
    job_note: job.note,
    selected_line_registry_keys: job.poRegistryKeys,
    job_items_json: job.items,
    delivery_destinations_json: job.destinations,
    job_alerts_json: job.alerts,
    scan_events_json: job.scanLogs,
    completed_at: job.completedAt ?? null,
    cleanup_after_at: job.purgeAfterAt ?? null,
  };
}

export function serializeJobArchiveRecordForDatabase(job: JobArchiveRecord): JobArchiveDatabasePayload {
  return {
    delivery_job_id: job.id,
    job_room_name: job.roomName,
    created_at: job.createdAt,
    updated_at: job.updatedAt,
    job_status: job.status,
    driver_name: job.driver,
    vehicle_plate: job.vehicle,
    origin_location_name: job.origin,
    origin_check_in_coordinates: job.originGps,
    origin_checked_in_at: job.originCheckedInAt ?? null,
    origin_locked_at: job.originLockedAt ?? null,
    allow_origin_recheck_after_locked: Boolean(job.allowOriginRecheckAfterLocked),
    allow_destination_before_fully_loaded: Boolean(job.allowDestinationBeforeFullyLoaded),
    job_note: job.note,
    selected_line_registry_keys: job.poRegistryKeys,
    job_items_json: job.items,
    delivery_destinations_json: job.destinations,
    job_alerts_json: job.alerts,
    scan_events_json: job.scanLogs,
    completed_at: job.completedAt ?? null,
    archived_at: job.archivedAt,
    delete_after_at: job.deleteAfterAt,
  };
}

export function mapDatabaseJobArchive(row: DatabaseRow): JobArchiveRecord {
  return {
    id: String(row.delivery_job_id ?? ""),
    roomName: String(row.job_room_name ?? row.delivery_job_id ?? ""),
    createdAt: toOptionalIsoString(row.created_at) ?? new Date(0).toISOString(),
    updatedAt: toOptionalIsoString(row.updated_at) ?? new Date(0).toISOString(),
    status: String(row.job_status ?? "ready") as JobRecord["status"],
    driver: String(row.driver_name ?? ""),
    vehicle: String(row.vehicle_plate ?? ""),
    origin: String(row.origin_location_name ?? ""),
    originGps: String(row.origin_check_in_coordinates ?? ""),
    originCheckedInAt: toOptionalIsoString(row.origin_checked_in_at),
    originLockedAt: toOptionalIsoString(row.origin_locked_at),
    allowOriginRecheckAfterLocked: Boolean(row.allow_origin_recheck_after_locked),
    allowDestinationBeforeFullyLoaded: Boolean(row.allow_destination_before_fully_loaded),
    note: String(row.job_note ?? ""),
    poRegistryKeys: toJsonArray<string>(row.selected_line_registry_keys).map((item) => String(item)),
    items: toJsonArray<JobRecord["items"][number]>(row.job_items_json),
    destinations: toJsonArray<Partial<JobRecord["destinations"][number]>>(row.delivery_destinations_json).map(
      normalizeJobDestination,
    ),
    alerts: toJsonArray<JobRecord["alerts"][number]>(row.job_alerts_json),
    scanLogs: toJsonArray<JobRecord["scanLogs"][number]>(row.scan_events_json),
    completedAt: toOptionalIsoString(row.completed_at),
    archivedAt: toOptionalIsoString(row.archived_at) ?? new Date(0).toISOString(),
    deleteAfterAt: toOptionalIsoString(row.delete_after_at) ?? new Date(0).toISOString(),
  };
}

export function serializePORegistryArchiveRecordForDatabase(
  record: PORegistryArchiveRecord,
): PORegistryArchiveDatabasePayload {
  return {
    archived_from_delivery_job_id: record.archivedFromJobId,
    line_registry_key: record.registryKey,
    purchase_order_number: record.poSapNo,
    purchase_order_item_number: record.poSapItem,
    first_imported_at: record.firstImportedAt,
    last_imported_at: record.latestImportedAt,
    import_file_name: record.sourceFileName,
    import_sheet_name: record.sourceSheetName,
    import_row_number: record.rowNumber,
    document_status: record.status,
    vendor_name: record.vendor,
    web_order_number: record.poWebNo,
    plant_code: record.plantCode ?? "",
    business_unit_name: record.unitName,
    material_code: record.materialCode,
    material_name: record.materialName,
    ordered_quantity_text: record.orderQty,
    received_quantity_text: record.receivedQty,
    total_amount_text: record.totalAmount,
    import_count: record.importCount,
    record_state: record.lifecycle,
    assigned_delivery_job_id: record.assignedJobId ?? null,
    assigned_to_job_at: record.assignedAt ?? null,
    archived_at: record.archivedAt,
    completed_at: record.completedAt ?? null,
    delete_after_at: record.deleteAfterAt,
  };
}

export function mapDatabaseJob(row: DatabaseRow): JobRecord {
  return {
    id: String(row.delivery_job_id ?? ""),
    roomName: String(row.job_room_name ?? row.delivery_job_id ?? ""),
    createdAt: toOptionalIsoString(row.created_at) ?? new Date(0).toISOString(),
    updatedAt: toOptionalIsoString(row.updated_at) ?? new Date(0).toISOString(),
    status: String(row.job_status ?? "ready") as JobRecord["status"],
    driver: String(row.driver_name ?? ""),
    vehicle: String(row.vehicle_plate ?? ""),
    origin: String(row.origin_location_name ?? ""),
    originGps: String(row.origin_check_in_coordinates ?? ""),
    originCheckedInAt: toOptionalIsoString(row.origin_checked_in_at),
    originLockedAt: toOptionalIsoString(row.origin_locked_at),
    allowOriginRecheckAfterLocked: Boolean(row.allow_origin_recheck_after_locked),
    allowDestinationBeforeFullyLoaded: Boolean(row.allow_destination_before_fully_loaded),
    note: String(row.job_note ?? ""),
    poRegistryKeys: toJsonArray<string>(row.selected_line_registry_keys).map((item) => String(item)),
    items: toJsonArray<JobRecord["items"][number]>(row.job_items_json),
    destinations: toJsonArray<Partial<JobRecord["destinations"][number]>>(row.delivery_destinations_json).map(
      normalizeJobDestination,
    ),
    alerts: toJsonArray<JobRecord["alerts"][number]>(row.job_alerts_json),
    scanLogs: toJsonArray<JobRecord["scanLogs"][number]>(row.scan_events_json),
    completedAt: toOptionalIsoString(row.completed_at),
    purgeAfterAt: toOptionalIsoString(row.cleanup_after_at),
  };
}
