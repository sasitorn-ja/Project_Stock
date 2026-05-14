"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, ClipboardList, FilePlus2, Search, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { clearPORegistry, deletePORecords, getPORecordsPage, type PORegistryRecord } from "@/lib/po-import-db";

export function PORegistryList() {
  const [records, setRecords] = useState<PORegistryRecord[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [page, setPage] = useState(1);
  const [query, setQuery] = useState("");
  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);
  const [reloadToken, setReloadToken] = useState(0);
  const pageSize = 20;
  const normalizedQuery = query.trim();
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const currentPage = Math.min(page, totalPages);
  const startIndex = (currentPage - 1) * pageSize;
  const visibleRecordKeys = useMemo(() => records.map((record) => record.registryKey), [records]);
  const selectedKeySet = useMemo(() => new Set(selectedKeys), [selectedKeys]);
  const isAllVisibleSelected =
    visibleRecordKeys.length > 0 && visibleRecordKeys.every((registryKey) => selectedKeySet.has(registryKey));

  useEffect(() => {
    async function loadRecords() {
      setIsLoading(true);
      setError("");

      try {
        const result = await getPORecordsPage({ page: currentPage, pageSize, query });
        setRecords(result.records);
        setTotalCount(result.totalCount);
      } catch {
        setRecords([]);
        setTotalCount(0);
        setError("โหลดข้อมูล PO ไม่สำเร็จ กรุณาลองรีเฟรชรายการอีกครั้ง");
      } finally {
        setIsLoading(false);
      }
    }

    loadRecords();
  }, [currentPage, query, reloadToken]);

  useEffect(() => {
    setPage(1);
  }, [query]);

  useEffect(() => {
    function refreshOnFocus() {
      setReloadToken((current) => current + 1);
    }

    window.addEventListener("focus", refreshOnFocus);

    return () => {
      window.removeEventListener("focus", refreshOnFocus);
    };
  }, []);

  function toggleRecord(registryKey: string) {
    setSelectedKeys((currentKeys) =>
      currentKeys.includes(registryKey)
        ? currentKeys.filter((currentKey) => currentKey !== registryKey)
        : [...currentKeys, registryKey],
    );
  }

  function toggleVisibleRecords() {
    setSelectedKeys((currentKeys) => {
      const currentKeySet = new Set(currentKeys);

      if (isAllVisibleSelected) {
        visibleRecordKeys.forEach((registryKey) => currentKeySet.delete(registryKey));
      } else {
        visibleRecordKeys.forEach((registryKey) => currentKeySet.add(registryKey));
      }

      return Array.from(currentKeySet);
    });
  }

  function createJobFromSelection() {
    window.sessionStorage.setItem("project-stock.selected-po-registry-keys", JSON.stringify(selectedKeys));
    window.location.href = "/jobs/new";
  }

  async function selectAllMatchingRecords() {
    try {
      setIsLoading(true);
      setError("");
      setSuccessMessage("");
      const result = await getPORecordsPage({ page: 1, pageSize: Math.max(totalCount, pageSize), query });
      setSelectedKeys(result.records.map((record) => record.registryKey));
    } catch {
      setError("เลือกรายการทั้งหมดไม่สำเร็จ กรุณาลองใหม่");
    } finally {
      setIsLoading(false);
    }
  }

  function refreshRecords() {
    setSuccessMessage("");
    setReloadToken((current) => current + 1);
  }

  function clearSearch() {
    setQuery("");
  }

  async function deleteSelectedRecords() {
    if (!selectedKeys.length) {
      return;
    }

    const confirmed = window.confirm(
      `ลบ PO ที่เลือก ${selectedKeys.length.toLocaleString("th-TH")} รายการออกจากคิวรอจัดส่ง?`,
    );

    if (!confirmed) {
      return;
    }

    try {
      setIsLoading(true);
      setError("");
      setSuccessMessage("");
      const deletedCount = await deletePORecords(selectedKeys);
      setSelectedKeys([]);
      setSuccessMessage(`ลบข้อมูลออกจากคิวแล้ว ${deletedCount.toLocaleString("th-TH")} รายการ`);
      setReloadToken((current) => current + 1);
    } catch {
      setError("ลบข้อมูล PO ที่เลือกไม่สำเร็จ กรุณาลองใหม่");
    } finally {
      setIsLoading(false);
    }
  }

  async function deleteRecord(record: PORegistryRecord) {
    const confirmed = window.confirm(`ลบ PO ${record.poSapNo} item ${record.poSapItem} ออกจากคิวรอจัดส่ง?`);

    if (!confirmed) {
      return;
    }

    try {
      setIsLoading(true);
      setError("");
      setSuccessMessage("");
      const deletedCount = await deletePORecords([record.registryKey]);
      setSelectedKeys((currentKeys) => currentKeys.filter((registryKey) => registryKey !== record.registryKey));
      setSuccessMessage(`ลบข้อมูลออกจากคิวแล้ว ${deletedCount.toLocaleString("th-TH")} รายการ`);
      setReloadToken((current) => current + 1);
    } catch {
      setError("ลบข้อมูล PO ไม่สำเร็จ กรุณาลองใหม่");
    } finally {
      setIsLoading(false);
    }
  }

  async function clearAllRecords() {
    if (!totalCount) {
      return;
    }

    const confirmed = window.confirm(
      `ล้างข้อมูล PO รอจัดส่งทั้งหมด ${totalCount.toLocaleString("th-TH")} รายการ? รายการที่สร้าง Job แล้วจะไม่ถูกลบ`,
    );

    if (!confirmed) {
      return;
    }

    try {
      setIsLoading(true);
      setError("");
      setSuccessMessage("");
      await clearPORegistry();
      setSelectedKeys([]);
      setPage(1);
      setSuccessMessage("ล้างข้อมูล PO รอจัดส่งทั้งหมดแล้ว");
      setReloadToken((current) => current + 1);
    } catch {
      setError("ล้างข้อมูล PO ไม่สำเร็จ กรุณาลองใหม่");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
          <div>
            <CardTitle>คิวจากไฟล์ GR</CardTitle>
            <CardDescription>ค้นหาและเลือกรายการที่ต้องนำไปสร้าง Job</CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" size="sm" onClick={refreshRecords} disabled={isLoading}>
              รีเฟรชรายการ
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={clearAllRecords}
              disabled={!totalCount || isLoading}
              className="border-red-200 text-red-700 hover:bg-red-50 dark:border-red-900 dark:text-red-300 dark:hover:bg-red-950/30"
            >
              <Trash2 className="mr-2 h-4 w-4" />
              ล้างคิวทั้งหมด
            </Button>
            <Badge variant="secondary">{totalCount.toLocaleString("th-TH")} รายการ</Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="relative w-full xl:max-w-md xl:flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="ค้นหา PO, Vendor, PO Web No., วัสดุ"
              className="pl-9"
            />
          </div>
          <div className="flex w-full flex-col gap-2 xl:w-auto xl:min-w-fit">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center xl:justify-end">
              <span className="text-sm text-muted-foreground sm:whitespace-nowrap">
                เลือกแล้ว {selectedKeys.length.toLocaleString("th-TH")} รายการ
              </span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={selectAllMatchingRecords}
                disabled={!totalCount || isLoading}
                className="sm:whitespace-nowrap"
              >
                เลือกทั้งหมดตามผลค้นหา
              </Button>
              <Button
                type="button"
                variant="destructive"
                size="sm"
                onClick={deleteSelectedRecords}
                disabled={!selectedKeys.length || isLoading}
                className="sm:whitespace-nowrap"
              >
                <Trash2 className="mr-2 h-4 w-4" />
                ลบรายการที่เลือก
              </Button>
            </div>
            <Button
              type="button"
              onClick={createJobFromSelection}
              disabled={!selectedKeys.length}
              className="h-auto min-h-10 w-full whitespace-normal sm:w-auto sm:self-end"
            >
              <FilePlus2 className="mr-2 h-4 w-4" />
              สร้าง Job จากรายการที่เลือก
            </Button>
          </div>
        </div>

        {successMessage ? (
          <div className="rounded-md border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200">
            {successMessage}
          </div>
        ) : null}

        {isLoading ? (
          <div className="rounded-md border bg-slate-50 p-4 text-sm text-muted-foreground dark:bg-slate-900">
            กำลังโหลดข้อมูล PO
          </div>
        ) : error ? (
          <div className="space-y-3 rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-950 dark:bg-red-950/30 dark:text-red-200">
            <p>{error}</p>
            <Button type="button" variant="outline" size="sm" onClick={refreshRecords}>
              ลองโหลดใหม่
            </Button>
          </div>
        ) : records.length ? (
          <div className="overflow-hidden rounded-md border">
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full min-w-[1120px] text-sm">
                <thead className="bg-slate-50 text-left text-slate-500 dark:bg-slate-900 dark:text-slate-400">
                  <tr>
                    <th className="w-14 px-4 py-3 font-medium">
                      <input
                        type="checkbox"
                        aria-label="เลือกรายการที่แสดงอยู่ทั้งหมด"
                        checked={isAllVisibleSelected}
                        onChange={toggleVisibleRecords}
                        className="h-4 w-4 rounded border-slate-300"
                      />
                    </th>
                    <th className="w-32 whitespace-nowrap px-4 py-3 font-medium">PO SAP No.</th>
                    <th className="w-20 whitespace-nowrap px-4 py-3 font-medium">Item</th>
                    <th className="w-28 whitespace-nowrap px-4 py-3 font-medium">สถานะ</th>
                    <th className="w-56 px-4 py-3 font-medium">Vendor</th>
                    <th className="w-56 px-4 py-3 font-medium">PO Web No.</th>
                    <th className="w-32 whitespace-nowrap px-4 py-3 font-medium">รหัสวัสดุ</th>
                    <th className="w-80 px-4 py-3 font-medium">ชื่อวัสดุ</th>
                    <th className="w-32 whitespace-nowrap px-4 py-3 font-medium">จำนวนสั่งซื้อ</th>
                    <th className="w-24 whitespace-nowrap px-4 py-3 text-right font-medium">จัดการ</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {records.map((record) => (
                    <tr key={record.registryKey}>
                      <td className="px-4 py-3 align-top">
                        <input
                          type="checkbox"
                          aria-label={`เลือก PO ${record.poSapNo} item ${record.poSapItem}`}
                          checked={selectedKeySet.has(record.registryKey)}
                          onChange={() => toggleRecord(record.registryKey)}
                          className="h-4 w-4 rounded border-slate-300"
                        />
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 align-top font-medium">{record.poSapNo}</td>
                      <td className="whitespace-nowrap px-4 py-3 align-top">{record.poSapItem}</td>
                      <td className="whitespace-nowrap px-4 py-3 align-top">{record.status || "-"}</td>
                      <td className="max-w-56 break-words px-4 py-3 align-top">{record.vendor || "-"}</td>
                      <td className="max-w-56 break-words px-4 py-3 align-top">{record.poWebNo || "-"}</td>
                      <td className="whitespace-nowrap px-4 py-3 align-top">{record.materialCode || "-"}</td>
                      <td className="max-w-80 break-words px-4 py-3 align-top">{record.materialName || "-"}</td>
                      <td className="whitespace-nowrap px-4 py-3 align-top">{record.orderQty || "-"}</td>
                      <td className="px-4 py-3 text-right align-top">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          title="ลบรายการนี้"
                          onClick={() => deleteRecord(record)}
                          disabled={isLoading}
                          className="h-8 w-8 text-red-600 hover:bg-red-50 hover:text-red-700 dark:text-red-300 dark:hover:bg-red-950/30"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="divide-y md:hidden">
              {records.map((record) => (
                <div key={record.registryKey} className="space-y-3 p-3">
                  <div className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      aria-label={`เลือก PO ${record.poSapNo} item ${record.poSapItem}`}
                      checked={selectedKeySet.has(record.registryKey)}
                      onChange={() => toggleRecord(record.registryKey)}
                      className="mt-1 h-4 w-4 shrink-0 rounded border-slate-300"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="break-words font-semibold text-slate-950">{record.poSapNo}</p>
                          <p className="mt-0.5 text-xs text-muted-foreground">Item {record.poSapItem} / {record.status || "-"}</p>
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          title="ลบรายการนี้"
                          onClick={() => deleteRecord(record)}
                          disabled={isLoading}
                          className="h-8 w-8 shrink-0 text-red-600 hover:bg-red-50 hover:text-red-700 dark:text-red-300 dark:hover:bg-red-950/30"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                      <div className="mt-3 grid gap-2 text-sm">
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
                            <p className="text-xs text-muted-foreground">จำนวน</p>
                            <p>{record.orderQty || "-"}</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            {totalCount > pageSize ? (
              <div className="flex flex-col gap-3 border-t px-4 py-3 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
                <p>
                  แสดง {startIndex + 1}-{Math.min(startIndex + pageSize, totalCount)} จาก{" "}
                  {totalCount.toLocaleString("th-TH")} รายการ
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
          </div>
        ) : (
          <div className="rounded-md border bg-slate-50 p-6 dark:bg-slate-900">
            {normalizedQuery ? (
              <div className="space-y-3 text-sm text-muted-foreground">
                <div className="flex items-center gap-3">
                  <ClipboardList className="h-5 w-5" />
                  <p>
                    ไม่พบข้อมูล PO ที่ตรงกับคำค้นหา <span className="font-medium text-foreground">{normalizedQuery}</span>
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button type="button" variant="outline" size="sm" onClick={clearSearch}>
                    ล้างคำค้นหา
                  </Button>
                  <Button type="button" variant="outline" size="sm" onClick={refreshRecords}>
                    รีเฟรชรายการ
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-3 text-sm text-muted-foreground">
                <div className="flex items-center gap-3">
                  <ClipboardList className="h-5 w-5" />
                  <p>ยังไม่มีข้อมูลในทะเบียน PO ที่บันทึกแล้ว กรุณานำเข้าไฟล์ GR และยืนยันการบันทึกก่อน</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button asChild type="button" size="sm">
                    <Link href="/po/import">นำเข้า PO</Link>
                  </Button>
                  <Button type="button" variant="outline" size="sm" onClick={refreshRecords}>
                    รีเฟรชรายการ
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
