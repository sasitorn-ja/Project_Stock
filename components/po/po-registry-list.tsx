"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { AlertTriangle, ChevronLeft, ChevronRight, ClipboardList, FilePlus2, Search, Trash2, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { withBasePath } from "@/lib/app-paths";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { clearPORegistry, getPORecordsByPoSapNos, getPORecordsPage, type PORegistryRecord } from "@/lib/po-import-db";

const selectedPOStorageKey = "project-stock.selected-po-registry-keys";

function readSelectedPOKeys() {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const rawKeys = window.sessionStorage.getItem(selectedPOStorageKey);
    const parsedKeys = rawKeys ? (JSON.parse(rawKeys) as unknown) : [];

    return Array.isArray(parsedKeys)
      ? Array.from(new Set(parsedKeys.filter((key): key is string => typeof key === "string" && key.trim().length > 0)))
      : [];
  } catch {
    return [];
  }
}

function writeSelectedPOKeys(keys: string[]) {
  try {
    if (!keys.length) {
      window.sessionStorage.removeItem(selectedPOStorageKey);
      return;
    }

    window.sessionStorage.setItem(selectedPOStorageKey, JSON.stringify(keys));
  } catch {
    return;
  }
}

function getPoSapNoFromRegistryKey(registryKey: string) {
  return registryKey.split("::")[0]?.trim() || registryKey;
}

async function getAllMatchingPORecords(query: string) {
  const pageSize = 1000;
  let page = 1;
  let totalCount = 0;
  const records: PORegistryRecord[] = [];

  do {
    const result = await getPORecordsPage({ page, pageSize, query });
    totalCount = result.totalCount;
    records.push(...result.records);
    page += 1;
  } while (records.length < totalCount);

  return { records, totalCount };
}

export function PORegistryList() {
  const [records, setRecords] = useState<PORegistryRecord[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [totalPoCount, setTotalPoCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [page, setPage] = useState(1);
  const [query, setQuery] = useState("");
  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);
  const [isClearConfirmOpen, setIsClearConfirmOpen] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);
  const hasLoadedSelectedKeysRef = useRef(false);
  const pageSize = 20;
  const normalizedQuery = query.trim();
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const currentPage = Math.min(page, totalPages);
  const startIndex = (currentPage - 1) * pageSize;
  const visibleRecordKeys = useMemo(() => records.map((record) => record.registryKey), [records]);
  const selectedKeySet = useMemo(() => new Set(selectedKeys), [selectedKeys]);
  const selectedPoCount = useMemo(
    () => new Set(selectedKeys.map(getPoSapNoFromRegistryKey)).size,
    [selectedKeys],
  );
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
        setTotalPoCount(result.totalPoCount);
      } catch {
        setRecords([]);
        setTotalCount(0);
        setTotalPoCount(0);
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
    setSelectedKeys(readSelectedPOKeys());
    hasLoadedSelectedKeysRef.current = true;
  }, []);

  useEffect(() => {
    if (!hasLoadedSelectedKeysRef.current) {
      return;
    }

    writeSelectedPOKeys(selectedKeys);
  }, [selectedKeys]);

  useEffect(() => {
    function refreshOnFocus() {
      setReloadToken((current) => current + 1);
    }

    window.addEventListener("focus", refreshOnFocus);

    return () => {
      window.removeEventListener("focus", refreshOnFocus);
    };
  }, []);

  async function toggleRecord(record: PORegistryRecord) {
    const isSelected = selectedKeySet.has(record.registryKey);
    const visibleSamePoRecords = records.filter((currentRecord) => currentRecord.poSapNo === record.poSapNo);

    if (isSelected) {
      setSelectedKeys((currentKeys) => {
        const keysToRemove = new Set(visibleSamePoRecords.map((currentRecord) => currentRecord.registryKey));
        return currentKeys.filter((currentKey) => !keysToRemove.has(currentKey));
      });

      try {
        const samePoRecords = await getPORecordsByPoSapNos([record.poSapNo]);
        const samePoKeys = new Set(samePoRecords.map((currentRecord) => currentRecord.registryKey));
        setSelectedKeys((currentKeys) => currentKeys.filter((currentKey) => !samePoKeys.has(currentKey)));
      } catch {
        setError("ยกเลิกเลือก PO ที่เลขซ้ำให้ครบไม่สำเร็จ กรุณาลองอีกครั้ง");
      }

      return;
    }

    setSelectedKeys((currentKeys) =>
      Array.from(new Set([...currentKeys, ...visibleSamePoRecords.map((currentRecord) => currentRecord.registryKey)])),
    );

    try {
      const samePoRecords = await getPORecordsByPoSapNos([record.poSapNo]);
      const samePoKeys = samePoRecords.map((currentRecord) => currentRecord.registryKey);

      setSelectedKeys((currentKeys) => Array.from(new Set([...currentKeys, ...samePoKeys])));

      if (samePoKeys.length > visibleSamePoRecords.length) {
        setSuccessMessage(
          `เลือก PO ${record.poSapNo} ให้ครบแล้ว ${samePoKeys.length.toLocaleString("th-TH")} รายการ`,
        );
      }
    } catch {
      setError("เลือก PO ที่เลขซ้ำให้ครบไม่สำเร็จ กรุณาลองติ๊กอีกครั้ง");
    }
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
    writeSelectedPOKeys(selectedKeys);
    window.location.href = withBasePath("/jobs/new");
  }

  async function selectAllMatchingRecords() {
    try {
      setIsLoading(true);
      setError("");
      setSuccessMessage("");
      const result = await getAllMatchingPORecords(query);
      setTotalCount(result.totalCount);
      setTotalPoCount(new Set(result.records.map((record) => record.poSapNo)).size);
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

  async function clearAllRecords() {
    try {
      setIsLoading(true);
      setError("");
      setSuccessMessage("");
      await clearPORegistry();
      setSelectedKeys([]);
      setPage(1);
      setIsClearConfirmOpen(false);
      setSuccessMessage("ลบข้อมูล PO รอจัดส่งทั้งหมดแล้ว");
      setReloadToken((current) => current + 1);
    } catch {
      setError("ลบข้อมูล PO ทั้งหมดไม่สำเร็จ กรุณาลองใหม่");
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
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary">{totalPoCount.toLocaleString("th-TH")} รายการ</Badge>
            <Button type="button" variant="outline" size="sm" onClick={refreshRecords} disabled={isLoading}>
              รีเฟรชรายการ
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setIsClearConfirmOpen(true)}
              disabled={!totalCount || isLoading}
              className="border-red-200 text-red-700 hover:bg-red-50 hover:text-red-800"
            >
              <Trash2 className="mr-1.5 h-3.5 w-3.5" />
              ลบข้อมูลทั้งหมด
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
          {/* ช่องค้นหา */}
          <div className="relative w-full xl:max-w-sm xl:shrink-0">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="ค้นหา PO, Vendor, PO Web No., วัสดุ"
              className="pl-9"
            />
          </div>

          {/* Actions — mobile: flex-col | desktop: flex-row เป็นแถวเดียว */}
          {selectedKeys.length > 0 ? (
            <div className="flex flex-col gap-2 xl:flex-1 xl:flex-row xl:items-center xl:justify-end">
              <span className="text-sm font-medium text-slate-700 whitespace-nowrap">
                เลือกแล้ว {selectedPoCount.toLocaleString("th-TH")} รายการ
              </span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setSelectedKeys([])}
                className="whitespace-nowrap"
              >
                ยกเลิกการเลือก
              </Button>
              <Button
                type="button"
                onClick={createJobFromSelection}
                className="h-auto min-h-9 w-full whitespace-nowrap xl:w-auto"
              >
                <FilePlus2 className="mr-2 h-4 w-4 shrink-0" />
                สร้าง Job จาก {selectedPoCount.toLocaleString("th-TH")} รายการที่เลือก
              </Button>
            </div>
          ) : (
            <div className="flex flex-col gap-2 xl:flex-1 xl:flex-row xl:items-center xl:justify-end">
              <span className="text-sm text-muted-foreground whitespace-nowrap">
                ยังไม่ได้เลือกรายการ
              </span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={selectAllMatchingRecords}
                disabled={!totalCount || isLoading}
                className="whitespace-nowrap"
              >
                เลือกทั้งหมด
              </Button>
              <Button
                type="button"
                disabled
                className="h-auto min-h-9 w-full whitespace-nowrap xl:w-auto"
              >
                <FilePlus2 className="mr-2 h-4 w-4 shrink-0" />
                สร้าง Job จากรายการที่เลือก
              </Button>
            </div>
          )}
        </div>

        {successMessage ? (
          <div className="rounded-md border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200">
            {successMessage}
          </div>
        ) : null}

        {isLoading && !records.length ? (
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
              <table className="w-full min-w-[1040px] text-sm">
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
                  {records.map((record, index) => {
                    const isFirstPoRow = index === 0 || records[index - 1]?.poSapNo !== record.poSapNo;

                    return (
                      <tr key={record.registryKey}>
                        <td className="px-4 py-3 align-top">
                          {isFirstPoRow ? (
                            <input
                              type="checkbox"
                              aria-label={`เลือก PO ${record.poSapNo} item ${record.poSapItem}`}
                              checked={selectedKeySet.has(record.registryKey)}
                              onChange={() => void toggleRecord(record)}
                              className="h-4 w-4 rounded border-slate-300"
                            />
                          ) : null}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 align-top font-medium">{isFirstPoRow ? record.poSapNo : ""}</td>
                        <td className="whitespace-nowrap px-4 py-3 align-top">{record.poSapItem}</td>
                        <td className="whitespace-nowrap px-4 py-3 align-top">{record.status || "-"}</td>
                        <td className="max-w-56 break-words px-4 py-3 align-top">{record.vendor || "-"}</td>
                        <td className="max-w-56 break-words px-4 py-3 align-top">{record.poWebNo || "-"}</td>
                        <td className="whitespace-nowrap px-4 py-3 align-top">{record.materialCode || "-"}</td>
                        <td className="max-w-80 break-words px-4 py-3 align-top">{record.materialName || "-"}</td>
                        <td className="whitespace-nowrap px-4 py-3 align-top">{record.orderQty || "-"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="divide-y md:hidden">
              {records.map((record) => (
                <div key={record.registryKey} className="space-y-4 p-4">
                  <div className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      aria-label={`เลือก PO ${record.poSapNo} item ${record.poSapItem}`}
                      checked={selectedKeySet.has(record.registryKey)}
                      onChange={() => void toggleRecord(record)}
                      className="mt-1 h-4 w-4 shrink-0 rounded border-slate-300"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="break-words font-semibold text-slate-950">{record.poSapNo}</p>
                          <p className="mt-0.5 text-xs text-muted-foreground">Item {record.poSapItem} / {record.status || "-"}</p>
                        </div>
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
              <div className="flex flex-col gap-3 border-t px-4 py-4 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
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

      {isClearConfirmOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="clear-po-title"
          onClick={() => setIsClearConfirmOpen(false)}
        >
          <div
            className="w-full max-w-md overflow-hidden rounded-lg border border-red-200 bg-white shadow-xl dark:border-red-900 dark:bg-slate-950"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3 border-b border-red-100 bg-red-50 px-4 py-4 dark:border-red-950 dark:bg-red-950/30">
              <div className="flex min-w-0 gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-red-600 text-white">
                  <AlertTriangle className="h-4 w-4" />
                </span>
                <div className="min-w-0">
                  <p id="clear-po-title" className="font-semibold text-red-950 dark:text-red-100">
                    ยืนยันลบข้อมูลทั้งหมด
                  </p>
                  <p className="mt-1 text-sm text-red-800 dark:text-red-200">
                    จะลบ PO รอจัดส่งทั้งหมด {totalPoCount.toLocaleString("th-TH")} รายการออกจากคิว
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsClearConfirmOpen(false)}
                aria-label="ปิด"
                className="rounded-md p-1 text-red-500 transition-colors hover:bg-red-100 hover:text-red-700 dark:hover:bg-red-950"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="space-y-4 px-4 py-4">
              <p className="text-sm leading-6 text-slate-600 dark:text-slate-300">
                ข้อมูลที่ถูกสร้าง Job แล้วจะไม่ถูกลบ แต่รายการที่ยังอยู่ในคิว PO รอจัดส่งจะหายจากหน้านี้ กรุณากดยืนยันอีกครั้งถ้าต้องการลบจริง
              </p>
              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <Button type="button" variant="outline" onClick={() => setIsClearConfirmOpen(false)} disabled={isLoading}>
                  ยกเลิก
                </Button>
                <Button type="button" onClick={() => void clearAllRecords()} disabled={isLoading} className="bg-red-600 text-white hover:bg-red-700">
                  {isLoading ? "กำลังลบ" : "ยืนยันลบข้อมูลทั้งหมด"}
                </Button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </Card>
  );
}
