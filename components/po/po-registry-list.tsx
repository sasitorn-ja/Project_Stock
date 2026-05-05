"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, ClipboardList, FilePlus2, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { getPORecordsPage, type PORegistryRecord } from "@/lib/po-import-db";

export function PORegistryList() {
  const [records, setRecords] = useState<PORegistryRecord[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
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
      const result = await getPORecordsPage({ page: 1, pageSize: Math.max(totalCount, pageSize), query });
      setSelectedKeys(result.records.map((record) => record.registryKey));
    } catch {
      setError("เลือกรายการทั้งหมดไม่สำเร็จ กรุณาลองใหม่");
    } finally {
      setIsLoading(false);
    }
  }

  function refreshRecords() {
    setReloadToken((current) => current + 1);
  }

  function clearSearch() {
    setQuery("");
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
            <div className="overflow-x-auto">
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
                    </tr>
                  ))}
                </tbody>
              </table>
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
