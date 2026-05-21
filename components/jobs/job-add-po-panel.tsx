"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Plus, Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { addPORecordsToJob } from "@/lib/job-db";
import { getPORecordsPage, type PORegistryRecord } from "@/lib/po-import-db";
import { type JobSummaryRecord } from "@/lib/jobs";

const PAGE_SIZE = 5;

function slugifyDestination(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9ก-๙]+/g, "-")
    .replace(/^-+|-+$/g, "") || "unknown-destination";
}

export function JobAddPOPanel({ job }: { job: JobSummaryRecord }) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [records, setRecords] = useState<PORegistryRecord[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(1);
  const [query, setQuery] = useState("");
  // เก็บทั้ง record ไว้ เพื่อให้การเลือกยังอยู่ครบเมื่อเปลี่ยนหน้า
  const [selectedRecords, setSelectedRecords] = useState<Record<string, PORegistryRecord>>({});
  const [destinationMode, setDestinationMode] = useState("from-po");
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const selectedKeys = useMemo(() => Object.keys(selectedRecords), [selectedRecords]);
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const startIndex = (currentPage - 1) * PAGE_SIZE;
  const fillerRowCount = Math.max(0, PAGE_SIZE - records.length);

  // เปลี่ยนคำค้นหา ให้กลับไปหน้าแรกเสมอ
  useEffect(() => {
    setPage(1);
  }, [query]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    async function loadRecords() {
      setIsLoading(true);
      setError("");

      try {
        const result = await getPORecordsPage({ page: currentPage, pageSize: PAGE_SIZE, query });
        setRecords(result.records);
        setTotalCount(result.totalCount);
      } catch {
        setRecords([]);
        setTotalCount(0);
        setError("โหลด PO รอจัดส่งไม่สำเร็จ");
      } finally {
        setIsLoading(false);
      }
    }

    const timeoutId = window.setTimeout(loadRecords, 200);

    return () => window.clearTimeout(timeoutId);
  }, [isOpen, query, currentPage]);

  function toggleRecord(record: PORegistryRecord) {
    setSelectedRecords((current) => {
      const next = { ...current };

      if (next[record.registryKey]) {
        delete next[record.registryKey];
      } else {
        next[record.registryKey] = record;
      }

      return next;
    });
  }

  function clearSelection() {
    setSelectedRecords({});
  }

  async function submit() {
    if (!selectedKeys.length) {
      setError("กรุณาเลือก PO ก่อนเพิ่มเข้า Job");
      return;
    }

    setIsSaving(true);
    setError("");
    setMessage("");

    try {
      const chosenRecords = Object.values(selectedRecords);
      const destinationAssignments =
        destinationMode === "from-po"
          ? Object.fromEntries(
              chosenRecords.map((record) => [record.registryKey, slugifyDestination(record.unitName.trim() || "ไม่ระบุปลายทาง")]),
            )
          : Object.fromEntries(chosenRecords.map((record) => [record.registryKey, destinationMode]));
      const destinationOverrides =
        destinationMode === "from-po"
          ? chosenRecords.map((record) => {
              const name = record.unitName.trim() || "ไม่ระบุปลายทาง";

              return {
                id: slugifyDestination(name),
                name,
                address: name,
              };
            })
          : job.destinations.map((destination) => ({
              id: destination.id,
              name: destination.name,
              address: destination.address,
              radiusMeters: destination.radiusMeters,
            }));

      await addPORecordsToJob({
        jobId: job.id,
        registryKeys: selectedKeys,
        itemScanQuantities: Object.fromEntries(selectedKeys.map((key) => [key, 1])),
        destinationAssignments,
        destinationOverrides,
      });
      setSelectedRecords({});
      setMessage("เพิ่ม PO เข้า Job แล้ว คนขับ refresh ห้องงานจะเห็นรายการใหม่");
      router.refresh();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "เพิ่ม PO เข้า Job ไม่สำเร็จ");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="rounded-md border bg-white">
      <div className="flex flex-col justify-between gap-3 px-3 py-3 sm:flex-row sm:items-center">
        <div className="flex items-center gap-2">
          <p className="text-sm font-semibold text-slate-900">เพิ่ม PO ระหว่างงาน</p>
          {isOpen && totalCount > 0 ? (
            <Badge variant="secondary">{totalCount.toLocaleString("th-TH")} รายการ</Badge>
          ) : null}
        </div>
        <Button
          type="button"
          variant={isOpen ? "outline" : "default"}
          size="sm"
          onClick={() => setIsOpen((value) => !value)}
          className="w-full sm:w-auto"
        >
          <Plus className="mr-1.5 h-3.5 w-3.5" />
          {isOpen ? "ปิด" : "เพิ่ม PO"}
        </Button>
      </div>

      {isOpen ? (
        <div className="space-y-3 border-t px-3 py-3">
          <div className="grid gap-2 md:grid-cols-[1fr_240px]">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="ค้นหา PO, Vendor, วัสดุ"
                className="pl-9"
              />
            </div>
            <select
              value={destinationMode}
              onChange={(event) => setDestinationMode(event.target.value)}
              className="h-9 rounded-md border border-[#d8dde6] bg-white px-3 text-sm sm:h-8"
            >
              <option value="from-po">ปลายทางจาก PO</option>
              {job.destinations.map((destination) => (
                <option key={destination.id} value={destination.id}>
                  {destination.name}
                </option>
              ))}
            </select>
          </div>

          <div className="overflow-hidden rounded-md border">
            {/* ===== Desktop: ตารางฟิก 5 แถว ===== */}
            <div className="hidden md:block">
              <table className="w-full table-fixed text-sm">
                <thead className="bg-slate-50 text-left text-[12px] text-slate-500">
                  <tr>
                    <th className="w-12 px-3 py-2 font-medium" />
                    <th className="w-44 px-3 py-2 font-medium">PO / Item</th>
                    <th className="px-3 py-2 font-medium">วัสดุ</th>
                    <th className="w-28 px-3 py-2 text-right font-medium">จำนวนสั่งซื้อ</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {isLoading && !records.length ? (
                    <tr>
                      <td colSpan={4} className="h-[260px] px-3 text-center text-sm text-muted-foreground">
                        กำลังโหลด PO
                      </td>
                    </tr>
                  ) : records.length ? (
                    <>
                      {records.map((record) => {
                        const isSelected = Boolean(selectedRecords[record.registryKey]);

                        return (
                          <tr
                            key={record.registryKey}
                            className={`h-[52px] cursor-pointer transition-colors ${
                              isSelected ? "bg-emerald-50/70" : "hover:bg-slate-50"
                            }`}
                            onClick={() => toggleRecord(record)}
                          >
                            <td className="px-3 align-middle">
                              <input
                                type="checkbox"
                                aria-label={`เลือก PO ${record.poSapNo} item ${record.poSapItem}`}
                                checked={isSelected}
                                onChange={() => toggleRecord(record)}
                                onClick={(event) => event.stopPropagation()}
                                className="h-4 w-4 rounded border-slate-300"
                              />
                            </td>
                            <td className="px-3 align-middle font-semibold text-slate-900">
                              <span className="block truncate">{record.poSapNo}</span>
                              <span className="block text-[11px] font-normal text-muted-foreground">
                                Item {record.poSapItem}
                              </span>
                            </td>
                            <td className="px-3 align-middle">
                              <span className="block truncate text-[12.5px] font-medium text-slate-900">
                                {record.materialCode || "-"}
                              </span>
                              <span className="block truncate text-[11.5px] text-muted-foreground">
                                {record.materialName || "-"}
                              </span>
                            </td>
                            <td className="px-3 text-right align-middle">
                              <Badge variant="secondary">{record.orderQty || "-"}</Badge>
                            </td>
                          </tr>
                        );
                      })}
                      {Array.from({ length: fillerRowCount }).map((_, index) => (
                        <tr key={`filler-${index}`} className="h-[52px]">
                          <td colSpan={4} className="px-3" />
                        </tr>
                      ))}
                    </>
                  ) : (
                    <tr>
                      <td colSpan={4} className="h-[260px] px-3 text-center text-sm text-muted-foreground">
                        {query.trim() ? "ไม่พบ PO ที่ตรงกับคำค้นหา" : "ไม่พบ PO รอจัดส่ง"}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* ===== Mobile: การ์ด สูงคงที่ ~5 แถว ===== */}
            <div className="md:hidden">
              {isLoading && !records.length ? (
                <div className="flex h-[280px] items-center justify-center p-3 text-sm text-muted-foreground">
                  กำลังโหลด PO
                </div>
              ) : records.length ? (
                <div className="divide-y">
                  {records.map((record) => {
                    const isSelected = Boolean(selectedRecords[record.registryKey]);

                    return (
                      <label
                        key={record.registryKey}
                        className={`flex min-h-[56px] cursor-pointer items-center gap-3 p-3 transition-colors ${
                          isSelected ? "bg-emerald-50/70" : "active:bg-slate-50"
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleRecord(record)}
                          className="h-5 w-5 shrink-0 rounded border-slate-300"
                        />
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center justify-between gap-2">
                            <span className="truncate text-sm font-semibold text-slate-900">
                              {record.poSapNo} / Item {record.poSapItem}
                            </span>
                            <Badge variant="secondary" className="shrink-0">
                              {record.orderQty || "-"}
                            </Badge>
                          </span>
                          <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                            {record.materialCode || "-"} / {record.materialName || "-"}
                          </span>
                        </span>
                      </label>
                    );
                  })}
                </div>
              ) : (
                <div className="flex h-[200px] items-center justify-center p-3 text-center text-sm text-muted-foreground">
                  {query.trim() ? "ไม่พบ PO ที่ตรงกับคำค้นหา" : "ไม่พบ PO รอจัดส่ง"}
                </div>
              )}
            </div>

            {/* ===== แถบเลื่อนหน้า ===== */}
            {totalCount > 0 ? (
              <div className="flex flex-col gap-2 border-t bg-slate-50 px-3 py-2.5 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
                <p>
                  แสดง {startIndex + 1}-{Math.min(startIndex + PAGE_SIZE, totalCount)} จาก{" "}
                  {totalCount.toLocaleString("th-TH")} รายการ
                </p>
                <div className="flex items-center justify-between gap-2 sm:justify-end">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="flex-1 sm:flex-none"
                    onClick={() => setPage((current) => Math.max(1, current - 1))}
                    disabled={currentPage <= 1 || isLoading}
                  >
                    <ChevronLeft className="mr-1 h-4 w-4" />
                    ก่อนหน้า
                  </Button>
                  <span className="min-w-[68px] text-center font-medium text-slate-700">
                    หน้า {currentPage} / {totalPages}
                  </span>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="flex-1 sm:flex-none"
                    onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
                    disabled={currentPage >= totalPages || isLoading}
                  >
                    ถัดไป
                    <ChevronRight className="ml-1 h-4 w-4" />
                  </Button>
                </div>
              </div>
            ) : null}
          </div>

          {error ? (
            <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>
          ) : null}
          {message ? (
            <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">{message}</div>
          ) : null}

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-muted-foreground">
              เลือกแล้ว {selectedKeys.length.toLocaleString("th-TH")} รายการ
              {selectedKeys.length ? (
                <button
                  type="button"
                  onClick={clearSelection}
                  className="ml-2 font-medium text-slate-500 underline underline-offset-2 hover:text-slate-700"
                >
                  ล้างที่เลือก
                </button>
              ) : null}
            </p>
            <Button
              type="button"
              onClick={submit}
              disabled={!selectedKeys.length || isSaving}
              className="w-full sm:w-auto"
            >
              {isSaving ? "กำลังเพิ่ม" : "ยืนยันเพิ่มเข้า Job"}
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
