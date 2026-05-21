"use client";

import { useEffect, useMemo, useState } from "react";
import { Plus, Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { addPORecordsToJob } from "@/lib/job-db";
import { getPORecordsPage, type PORegistryRecord } from "@/lib/po-import-db";
import { type JobSummaryRecord } from "@/lib/jobs";

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
  const [query, setQuery] = useState("");
  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);
  const [destinationMode, setDestinationMode] = useState("from-po");
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const selectedKeySet = useMemo(() => new Set(selectedKeys), [selectedKeys]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    async function loadRecords() {
      setIsLoading(true);
      setError("");

      try {
        const result = await getPORecordsPage({ page: 1, pageSize: 10, query });
        setRecords(result.records);
      } catch {
        setRecords([]);
        setError("โหลด PO รอจัดส่งไม่สำเร็จ");
      } finally {
        setIsLoading(false);
      }
    }

    const timeoutId = window.setTimeout(loadRecords, 250);

    return () => window.clearTimeout(timeoutId);
  }, [isOpen, query]);

  function toggleRecord(record: PORegistryRecord) {
    setSelectedKeys((currentKeys) =>
      selectedKeySet.has(record.registryKey)
        ? currentKeys.filter((key) => key !== record.registryKey)
        : [...currentKeys, record.registryKey],
    );
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
      const selectedRecords = records.filter((record) => selectedKeySet.has(record.registryKey));
      const destinationAssignments =
        destinationMode === "from-po"
          ? Object.fromEntries(
              selectedRecords.map((record) => [record.registryKey, slugifyDestination(record.unitName.trim() || "ไม่ระบุปลายทาง")]),
            )
          : Object.fromEntries(selectedRecords.map((record) => [record.registryKey, destinationMode]));
      const destinationOverrides =
        destinationMode === "from-po"
          ? selectedRecords.map((record) => {
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
      setSelectedKeys([]);
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
        <p className="text-sm font-semibold text-slate-900">เพิ่ม PO ระหว่างงาน</p>
        <Button type="button" variant={isOpen ? "outline" : "default"} size="sm" onClick={() => setIsOpen((value) => !value)}>
          <Plus className="mr-1.5 h-3.5 w-3.5" />
          {isOpen ? "ปิด" : "เพิ่ม PO"}
        </Button>
      </div>
      {isOpen ? (
        <div className="space-y-3 border-t px-3 py-3">
          <div className="grid gap-2 md:grid-cols-[1fr_240px]">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="ค้นหา PO, Vendor, วัสดุ" className="pl-9" />
            </div>
            <select
              value={destinationMode}
              onChange={(event) => setDestinationMode(event.target.value)}
              className="h-8 rounded-md border border-[#d8dde6] bg-white px-3 text-sm"
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
            {isLoading ? (
              <div className="p-3 text-sm text-muted-foreground">กำลังโหลด PO</div>
            ) : records.length ? (
              <div className="divide-y">
                {records.map((record) => (
                  <label key={record.registryKey} className="flex cursor-pointer items-start gap-3 p-3 hover:bg-slate-50">
                    <input
                      type="checkbox"
                      checked={selectedKeySet.has(record.registryKey)}
                      onChange={() => toggleRecord(record)}
                      className="mt-1 h-4 w-4"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold">
                        {record.poSapNo} / Item {record.poSapItem}
                      </span>
                      <span className="mt-1 block break-words text-xs text-muted-foreground">
                        {record.materialCode || "-"} / {record.materialName || "-"}
                      </span>
                    </span>
                    <Badge variant="secondary">{record.orderQty || "-"}</Badge>
                  </label>
                ))}
              </div>
            ) : (
              <div className="p-3 text-sm text-muted-foreground">ไม่พบ PO รอจัดส่ง</div>
            )}
          </div>

          {error ? <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div> : null}
          {message ? <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">{message}</div> : null}

          <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
            <p className="text-xs text-muted-foreground">เลือกแล้ว {selectedKeys.length.toLocaleString("th-TH")} รายการ</p>
            <Button type="button" onClick={submit} disabled={!selectedKeys.length || isSaving}>
              {isSaving ? "กำลังเพิ่ม" : "ยืนยันเพิ่มเข้า Job"}
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
