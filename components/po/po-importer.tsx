"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  FileSpreadsheet,
  Upload,
  UploadCloud,
} from "lucide-react";
import * as XLSX from "xlsx";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  createPORegistryKey,
  getExistingPORecords,
  migrateLegacyPORegistry,
  saveNewPORecords,
  type PORegistryRecord,
} from "@/lib/po-import-db";

type ExcelRow = Record<string, unknown>;

type POImportRecord = {
  registryKey: string;
  poSapNo: string;
  poSapItem: string;
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
  duplicateInFileCount: number;
  existingRecord?: PORegistryRecord;
};

type ImportPreview = {
  fileName: string;
  sheetName: string;
  totalRows: number;
  missingPOCount: number;
  missingItemCount: number;
  duplicateInFileCount: number;
  skippedExistingCount: number;
  skippedQueuedCount: number;
  skippedInJobCount: number;
  newPOs: POImportRecord[];
};

function normalizeHeader(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9ก-๙]/g, "");
}

function readText(value: unknown) {
  return String(value ?? "").trim();
}

function findColumn(headers: string[], candidates: string[]) {
  const normalizedCandidates = candidates.map(normalizeHeader);

  return headers.find((header) => normalizedCandidates.includes(normalizeHeader(header)));
}

function readCell(row: ExcelRow, column?: string) {
  return readText(column ? row[column] : "");
}

function buildRecord(row: ExcelRow, rowNumber: number, columns: Record<string, string | undefined>): POImportRecord {
  const poSapNo = readCell(row, columns.poSapNo);
  const poSapItem = readCell(row, columns.poSapItem);

  return {
    registryKey: createPORegistryKey(poSapNo, poSapItem),
    poSapNo,
    poSapItem,
    rowNumber,
    status: readCell(row, columns.status),
    vendor: readCell(row, columns.vendor),
    poWebNo: readCell(row, columns.poWebNo),
    unitName: readCell(row, columns.unitName),
    materialCode: readCell(row, columns.materialCode),
    materialName: readCell(row, columns.materialName),
    orderQty: readCell(row, columns.orderQty),
    receivedQty: readCell(row, columns.receivedQty),
    totalAmount: readCell(row, columns.totalAmount),
    duplicateInFileCount: 0,
  };
}

export function POImporter() {
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [isBusy, setIsBusy] = useState(false);

  useEffect(() => {
    async function prepareRegistry() {
      try {
        await migrateLegacyPORegistry();
      } catch {
        setError("เชื่อมต่อข้อมูล PO ของระบบไม่สำเร็จ");
      }
    }

    prepareRegistry();
  }, []);

  async function processFile(file?: File) {
    setError("");
    setSuccessMessage("");
    setPreview(null);

    if (!file) {
      return;
    }

    if (!/\.(xlsx|xls|csv)$/i.test(file.name)) {
      setError("รองรับเฉพาะไฟล์ Excel / CSV เท่านั้น");
      return;
    }

    setIsBusy(true);

    try {
      const workbook = XLSX.read(await file.arrayBuffer(), { type: "array" });
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const rows = XLSX.utils.sheet_to_json<ExcelRow>(worksheet, { defval: "", raw: false });

      if (!rows.length) {
        setError("ไม่พบข้อมูลในไฟล์ Excel");
        return;
      }

      const headers = Object.keys(rows[0]);
      const poSapNoColumn = findColumn(headers, ["PO SAP No.", "PO SAP No", "POSAPNo", "เลขที่ PO SAP"]);
      const poSapItemColumn = findColumn(headers, ["PO SAP Item", "PO SAP Item No.", "POSAPItem", "รายการ PO SAP"]);

      if (!poSapNoColumn) {
        setError("ไม่พบคอลัมน์ PO SAP No. ในไฟล์ Excel");
        return;
      }

      if (!poSapItemColumn) {
        setError("ไม่พบคอลัมน์ PO SAP Item ในไฟล์ Excel");
        return;
      }

      const columns = {
        poSapNo: poSapNoColumn,
        poSapItem: poSapItemColumn,
        status: findColumn(headers, ["สถานะ", "Status"]),
        vendor: findColumn(headers, ["Vendor", "ผู้ขาย"]),
        poWebNo: findColumn(headers, ["PO Web No.", "PO Web No", "POWebNo"]),
        unitName: findColumn(headers, ["ชื่อหน่วยงาน", "Unit Name"]),
        materialCode: findColumn(headers, ["รหัสวัสดุ", "Material Code"]),
        materialName: findColumn(headers, ["ชื่อวัสดุ", "Material Name"]),
        orderQty: findColumn(headers, ["จำนวนสั่งซื้อ", "Order Qty"]),
        receivedQty: findColumn(headers, ["รับเเล้ว", "รับแล้ว", "Received Qty"]),
        totalAmount: findColumn(headers, ["ยอดรวม", "Total Amount"]),
      };

      const itemRows = rows
        .map((row, index) => ({ row, rowNumber: index + 2 }))
        .filter(({ row }) => readCell(row, poSapNoColumn));
      const rowsMissingItem = itemRows.filter(({ row }) => !readCell(row, poSapItemColumn));
      const validRows = itemRows.filter(({ row }) => readCell(row, poSapItemColumn));
      const records = validRows.map(({ row, rowNumber }) => buildRecord(row, rowNumber, columns));
      const recordsByKey = records.reduce((groups, record) => {
        const currentRecords = groups.get(record.registryKey) ?? [];
        currentRecords.push(record);
        groups.set(record.registryKey, currentRecords);

        return groups;
      }, new Map<string, POImportRecord[]>());
      const uniqueRecords = Array.from(recordsByKey.values()).map((sameKeyRecords) => ({
        ...sameKeyRecords[0],
        duplicateInFileCount: sameKeyRecords.length - 1,
      }));
      const duplicateInFileCount = records.length - uniqueRecords.length;
      const existingRecords = await getExistingPORecords(uniqueRecords.map((record) => record.registryKey));

      setPreview({
        fileName: file.name,
        sheetName,
        totalRows: rows.length,
        missingPOCount: rows.length - itemRows.length,
        missingItemCount: rowsMissingItem.length,
        duplicateInFileCount,
        skippedExistingCount: uniqueRecords.filter((record) => existingRecords.has(record.registryKey)).length,
        skippedQueuedCount: uniqueRecords.filter((record) => {
          const existingRecord = existingRecords.get(record.registryKey);
          return existingRecord && !existingRecord.assignedJobId && existingRecord.lifecycle === "active";
        }).length,
        skippedInJobCount: uniqueRecords.filter((record) => {
          const existingRecord = existingRecords.get(record.registryKey);
          return existingRecord && (Boolean(existingRecord.assignedJobId) || existingRecord.lifecycle !== "active");
        }).length,
        newPOs: uniqueRecords.filter((record) => !existingRecords.has(record.registryKey)),
      });
    } catch {
      setError("อ่านไฟล์ Excel / CSV ไม่สำเร็จ กรุณาตรวจสอบว่าเป็นไฟล์ที่เปิดได้ปกติ");
    } finally {
      setIsBusy(false);
    }
  }

  async function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    try {
      await processFile(event.target.files?.[0]);
    } finally {
      event.target.value = "";
    }
  }

  async function handleFileDrop(event: React.DragEvent<HTMLDivElement>) {
    event.preventDefault();

    if (isBusy) {
      return;
    }

    await processFile(event.dataTransfer.files?.[0]);
  }

  async function confirmImport() {
    if (!preview?.newPOs.length) {
      return;
    }

    setIsBusy(true);
    setError("");
    setSuccessMessage("");

    try {
      await saveNewPORecords(
        preview.newPOs.map((record) => ({
          registryKey: record.registryKey,
          poSapNo: record.poSapNo,
          poSapItem: record.poSapItem,
          sourceFileName: preview.fileName,
          sourceSheetName: preview.sheetName,
          rowNumber: record.rowNumber,
          status: record.status,
          vendor: record.vendor,
          poWebNo: record.poWebNo,
          unitName: record.unitName,
          materialCode: record.materialCode,
          materialName: record.materialName,
          orderQty: record.orderQty,
          receivedQty: record.receivedQty,
          totalAmount: record.totalAmount,
        })),
      );

      window.sessionStorage.removeItem("project-stock.po-registry-list.v1");
      setSuccessMessage(`นำเข้าข้อมูลใหม่แล้ว ${preview.newPOs.length.toLocaleString("th-TH")} รายการ`);
      setPreview(null);
    } catch {
      setError("บันทึกทะเบียน PO SAP No. + PO SAP Item ไม่สำเร็จ");
    } finally {
      setIsBusy(false);
    }
  }

  return (
    <Card className="rounded-md">
      <CardHeader className="border-b-0 px-4 pb-2 pt-4">
        <CardTitle className="text-[15px] font-bold leading-5 text-slate-950">อัปโหลด PO จาก SAP</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 px-4 pb-4 pt-2">
        <div
          className="flex min-h-36 items-center justify-center rounded-md border border-dashed border-[#cfd8e3] bg-[#fafafa] px-4 py-8"
          onDragOver={(event) => event.preventDefault()}
          onDrop={handleFileDrop}
        >
          <div className="flex flex-col items-center text-center">
            <UploadCloud className="h-7 w-7 text-slate-300" />
            <p className="mt-2 text-sm font-medium text-slate-400">ลากไฟล์มาวางที่นี่ หรือ</p>
            <Button asChild variant="outline" className="mt-2 h-9 border-slate-300 px-4 text-[13px] font-semibold text-slate-900">
              <label htmlFor="po-excel-file">เลือกไฟล์ Excel / CSV</label>
            </Button>
            <input
              id="po-excel-file"
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={handleFileChange}
              disabled={isBusy}
              className="sr-only"
            />
          </div>
        </div>

        {error ? (
          <div className="flex items-start gap-3 rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <p>{error}</p>
          </div>
        ) : null}

        {successMessage ? (
          <div className="flex items-start gap-3 rounded-md border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-200">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
            <p>{successMessage}</p>
          </div>
        ) : null}

        {isBusy ? (
          <div className="rounded-md border bg-slate-50 p-4 text-sm text-muted-foreground dark:bg-slate-900">
            กำลังประมวลผลไฟล์และเช็ค PO SAP No. + PO SAP Item
          </div>
        ) : null}

        {preview ? (
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-md border p-4">
                <p className="text-xs text-muted-foreground">ไฟล์</p>
                <p className="mt-1 truncate font-medium">{preview.fileName}</p>
              </div>
              <div className="rounded-md border p-4">
                <p className="text-xs text-muted-foreground">Sheet</p>
                <p className="mt-1 font-medium">{preview.sheetName}</p>
              </div>
              <div className="rounded-md border p-4">
                <p className="text-xs text-muted-foreground">รายการใหม่</p>
                <p className="mt-1 text-2xl font-bold text-emerald-600">{preview.newPOs.length}</p>
              </div>
              <div className="rounded-md border p-4">
                <p className="text-xs text-muted-foreground">มีอยู่แล้ว ไม่นำเข้าซ้ำ</p>
                <p className="mt-1 text-2xl font-bold text-amber-600">{preview.skippedExistingCount}</p>
              </div>
            </div>

            {preview.skippedExistingCount ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-md border border-slate-200 bg-white p-4">
                  <p className="text-xs text-muted-foreground">อยู่ในคิวรอจัดส่งแล้ว</p>
                  <p className="mt-1 text-2xl font-bold text-slate-900">{preview.skippedQueuedCount.toLocaleString("th-TH")}</p>
                </div>
                <div className="rounded-md border border-amber-200 bg-amber-50 p-4">
                  <p className="text-xs text-amber-800">ถูกสร้าง Job แล้ว / ไม่อยู่ในคิว</p>
                  <p className="mt-1 text-2xl font-bold text-amber-700">{preview.skippedInJobCount.toLocaleString("th-TH")}</p>
                </div>
              </div>
            ) : null}

            <div className="flex flex-col justify-between gap-4 rounded-md border bg-slate-50 p-4 dark:bg-slate-900 md:flex-row md:items-center">
              <div className="flex min-w-0 items-start gap-3">
                <FileSpreadsheet className="mt-1 h-5 w-5 text-primary" />
                <div>
                  <p className="font-medium">
                    อ่านข้อมูล {preview.totalRows.toLocaleString("th-TH")} แถว พบรายการจริง{" "}
                    {(preview.newPOs.length + preview.skippedExistingCount).toLocaleString("th-TH")} รายการ
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    ระบบเช็คซ้ำหลังบ้านด้วย PO SAP No. + PO SAP Item และแสดงเฉพาะรายการใหม่ที่จะเพิ่ม รายการที่ถูกสร้าง Job แล้วจะไม่ถูกนำกลับเข้าคิว
                    {preview.missingPOCount
                      ? `, ข้ามแถวที่ไม่มี PO SAP No. ${preview.missingPOCount.toLocaleString("th-TH")} แถว`
                      : ""}
                    {preview.missingItemCount
                      ? `, ข้ามแถวที่ไม่มี PO SAP Item ${preview.missingItemCount.toLocaleString("th-TH")} แถว`
                      : ""}
                    {preview.duplicateInFileCount
                      ? `, พบรายการซ้ำในไฟล์เดียวกัน ${preview.duplicateInFileCount.toLocaleString("th-TH")} แถว`
                      : ""}
                  </p>
                </div>
              </div>
              <Button
                type="button"
                onClick={confirmImport}
                disabled={isBusy || !preview.newPOs.length}
                className="min-h-10 shrink-0 px-5"
              >
                <Upload className="mr-2 h-4 w-4" />
                ยืนยันนำเข้ารายการใหม่
              </Button>
            </div>

            <ImportTable
              title="รายการใหม่ที่พร้อมนำเข้า"
              records={preview.newPOs}
              emptyText="ไม่มีรายการใหม่ในไฟล์นี้"
              variant="success"
            />
          </div>
        ) : null}

        {successMessage ? (
          <Button asChild>
            <Link href="/po">ไปหน้า PO รอจัดส่ง</Link>
          </Button>
        ) : null}

      </CardContent>
    </Card>
  );
}

function ImportTable({
  title,
  records,
  emptyText,
  variant,
}: {
  title: string;
  records: POImportRecord[];
  emptyText: string;
  variant: "success" | "warning";
}) {
  const pageSize = 20;
  const [page, setPage] = useState(1);
  const totalPages = Math.max(1, Math.ceil(records.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const startIndex = (currentPage - 1) * pageSize;
  const visibleRecords = useMemo(
    () => records.slice(startIndex, startIndex + pageSize),
    [records, startIndex],
  );

  useEffect(() => {
    setPage(1);
  }, [records]);

  return (
    <div className="overflow-hidden rounded-md border">
      <div className="flex items-center justify-between border-b bg-background px-4 py-3">
        <p className="font-medium">{title}</p>
        <Badge variant={variant === "warning" ? "warning" : "secondary"}>{records.length} รายการ</Badge>
      </div>
      {records.length ? (
        <>
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full min-w-[1120px] text-sm">
              <thead className="bg-slate-50 text-left text-slate-500 dark:bg-slate-900 dark:text-slate-400">
                <tr>
                  <th className="w-32 whitespace-nowrap px-4 py-3 font-medium">PO SAP No.</th>
                  <th className="w-20 whitespace-nowrap px-4 py-3 font-medium">Item</th>
                  <th className="w-20 whitespace-nowrap px-4 py-3 font-medium">แถว</th>
                  <th className="w-28 whitespace-nowrap px-4 py-3 font-medium">สถานะ</th>
                  <th className="w-56 px-4 py-3 font-medium">Vendor</th>
                  <th className="w-56 px-4 py-3 font-medium">PO Web No.</th>
                  <th className="w-32 whitespace-nowrap px-4 py-3 font-medium">รหัสวัสดุ</th>
                  <th className="w-80 px-4 py-3 font-medium">ชื่อวัสดุ</th>
                  <th className="w-32 whitespace-nowrap px-4 py-3 font-medium">จำนวนสั่งซื้อ</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {visibleRecords.map((record) => (
                  <tr key={record.registryKey}>
                    <td className="whitespace-nowrap px-4 py-3 align-top font-medium">{record.poSapNo}</td>
                    <td className="whitespace-nowrap px-4 py-3 align-top">{record.poSapItem}</td>
                    <td className="whitespace-nowrap px-4 py-3 align-top">{record.rowNumber}</td>
                    <td className="whitespace-nowrap px-4 py-3 align-top">{record.status || "-"}</td>
                    <td className="max-w-56 break-words px-4 py-3 align-top">{record.vendor || "-"}</td>
                    <td className="max-w-56 break-words px-4 py-3 align-top">{record.poWebNo || "-"}</td>
                    <td className="whitespace-nowrap px-4 py-3 align-top">{record.materialCode || "-"}</td>
                    <td className="max-w-80 break-words px-4 py-3 align-top">{record.materialName || "-"}</td>
                    <td className="whitespace-nowrap px-4 py-3 align-top">{record.orderQty || "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="divide-y md:hidden">
            {visibleRecords.map((record) => (
              <div key={record.registryKey} className="space-y-3 p-3 text-sm">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="break-words font-semibold text-slate-950">{record.poSapNo}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">Item {record.poSapItem} / แถว {record.rowNumber}</p>
                  </div>
                  <Badge variant={variant === "warning" ? "warning" : "secondary"} className="shrink-0">
                    {record.status || "-"}
                  </Badge>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Vendor</p>
                  <p className="break-words">{record.vendor || "-"}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">วัสดุ</p>
                  <p className="break-words font-medium">{record.materialCode || "-"}</p>
                  <p className="mt-0.5 break-words text-muted-foreground">{record.materialName || "-"}</p>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <p className="text-xs text-muted-foreground">PO Web No.</p>
                    <p className="break-words">{record.poWebNo || "-"}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">จำนวนสั่งซื้อ</p>
                    <p>{record.orderQty || "-"}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
          {records.length > pageSize ? (
            <div className="flex flex-col gap-3 border-t px-4 py-3 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
              <p>
                แสดง {startIndex + 1}-{Math.min(startIndex + pageSize, records.length)} จาก{" "}
                {records.length.toLocaleString("th-TH")} รายการ
              </p>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((current) => Math.max(1, current - 1))}
                  disabled={currentPage === 1}
                >
                  <ChevronLeft className="mr-1 h-4 w-4" />
                  ก่อนหน้า
                </Button>
                <span className="min-w-20 text-center">
                  หน้า {currentPage} / {totalPages}
                </span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
                  disabled={currentPage === totalPages}
                >
                  ถัดไป
                  <ChevronRight className="ml-1 h-4 w-4" />
                </Button>
              </div>
            </div>
          ) : null}
        </>
      ) : (
        <div className="flex items-center gap-2 px-4 py-6 text-sm text-muted-foreground">
          <CheckCircle2 className="h-4 w-4" />
          {emptyText}
        </div>
      )}
    </div>
  );
}
