"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { FileWarning, MapPinned, Save, Truck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createJob } from "@/lib/job-db";
import { getExistingPORecords, type PORegistryRecord } from "@/lib/po-import-db";

const storageKey = "project-stock.selected-po-registry-keys";

function createDestinationId(name: string) {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9ก-๙]+/g, "-")
    .replace(/^-+|-+$/g, "") || "unknown-destination";
}

export function JobCreator() {
  const router = useRouter();
  const [records, setRecords] = useState<PORegistryRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");
  const [driver, setDriver] = useState("");
  const [vehicle, setVehicle] = useState("");
  const [origin, setOrigin] = useState("DC Bangna");
  const [note, setNote] = useState("");

  useEffect(() => {
    async function loadSelectedRecords() {
      setIsLoading(true);
      setError("");

      try {
        const rawKeys = window.sessionStorage.getItem(storageKey);
        const selectedKeys = rawKeys ? (JSON.parse(rawKeys) as string[]) : [];

        if (!selectedKeys.length) {
          setRecords([]);
          return;
        }

        const existingRecords = await getExistingPORecords(selectedKeys);
        setRecords(selectedKeys.map((key) => existingRecords.get(key)).filter(Boolean) as PORegistryRecord[]);
      } catch {
        setError("โหลดรายการ PO ที่เลือกไม่สำเร็จ กรุณากลับไปเลือกใหม่");
      } finally {
        setIsLoading(false);
      }
    }

    loadSelectedRecords();
  }, []);

  const groupedDestinations = useMemo(() => {
    const groups = new Map<string, { id: string; name: string; totalQty: number; poCount: number }>();

    records.forEach((record) => {
      const name = record.unitName.trim() || "ไม่ระบุปลายทาง";
      const id = createDestinationId(name);
      const current = groups.get(id) ?? { id, name, totalQty: 0, poCount: 0 };
      current.totalQty += Number(record.orderQty.replace(/,/g, "")) || 0;
      current.poCount += 1;
      groups.set(id, current);
    });

    return Array.from(groups.values());
  }, [records]);

  async function handleCreateJob() {
    if (!records.length) {
      setError("ยังไม่มีรายการ PO ที่พร้อมสร้าง Job");
      return;
    }

    setIsSaving(true);
    setError("");

    try {
      const job = await createJob({
        driver,
        vehicle,
        origin,
        note,
        registryKeys: records.map((record) => record.registryKey),
      });

      window.sessionStorage.removeItem(storageKey);
      router.push(`/jobs/monitor?jobId=${encodeURIComponent(job.id)}`);
      router.refresh();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "สร้าง Job ไม่สำเร็จ");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <section className="grid gap-6 xl:grid-cols-[1fr_0.9fr]">
        <Card>
          <CardHeader>
            <CardTitle>รายการที่เลือกจาก PO รอจัดส่ง</CardTitle>
            <CardDescription>ระบบจะใช้รายการจริงเหล่านี้ไปสร้าง Job และตัดออกจากคิวรอจัดส่งทันที</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {isLoading ? (
              <div className="rounded-md border bg-slate-50 p-4 text-sm text-muted-foreground dark:bg-slate-900">
                กำลังโหลดรายการ PO ที่เลือก
              </div>
            ) : records.length ? (
              <>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="secondary">{records.length.toLocaleString("th-TH")} รายการ</Badge>
                  <Badge variant="secondary">{groupedDestinations.length.toLocaleString("th-TH")} ปลายทาง</Badge>
                </div>
                <div className="overflow-hidden rounded-md border">
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[980px] text-sm">
                      <thead className="bg-slate-50 text-left text-slate-500 dark:bg-slate-900 dark:text-slate-400">
                        <tr>
                          <th className="px-4 py-3 font-medium">PO SAP No.</th>
                          <th className="px-4 py-3 font-medium">Item</th>
                          <th className="px-4 py-3 font-medium">ปลายทาง</th>
                          <th className="px-4 py-3 font-medium">รหัสวัสดุ</th>
                          <th className="px-4 py-3 font-medium">ชื่อวัสดุ</th>
                          <th className="px-4 py-3 font-medium">จำนวน</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {records.map((record) => (
                          <tr key={record.registryKey}>
                            <td className="whitespace-nowrap px-4 py-3 align-top font-medium">{record.poSapNo}</td>
                            <td className="whitespace-nowrap px-4 py-3 align-top">{record.poSapItem}</td>
                            <td className="max-w-72 break-words px-4 py-3 align-top">{record.unitName || "-"}</td>
                            <td className="whitespace-nowrap px-4 py-3 align-top">{record.materialCode || "-"}</td>
                            <td className="max-w-80 break-words px-4 py-3 align-top">{record.materialName || "-"}</td>
                            <td className="whitespace-nowrap px-4 py-3 align-top">{record.orderQty || "-"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            ) : (
              <div className="space-y-3 rounded-md border bg-slate-50 p-6 text-sm text-muted-foreground dark:bg-slate-900">
                <div className="flex items-center gap-3">
                  <FileWarning className="h-5 w-5" />
                  <p>ยังไม่มีรายการ PO ที่ถูกเลือกจากหน้าคิวรอจัดส่ง</p>
                </div>
                <Button type="button" variant="outline" onClick={() => router.push("/po")}>
                  กลับไปเลือก PO
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>รายละเอียดงานขนส่ง</CardTitle>
            <CardDescription>กำหนดผู้รับผิดชอบงานจริงก่อนบันทึกเข้าระบบ โดยปลายทางของงานจะอ้างอิงจาก PO ที่เลือกไว้เท่านั้น</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-5 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="vehicle">รถขนส่ง</Label>
              <Input id="vehicle" value={vehicle} onChange={(event) => setVehicle(event.target.value)} placeholder="เช่น 6W-4382" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="driver">คนขับ</Label>
              <Input id="driver" value={driver} onChange={(event) => setDriver(event.target.value)} placeholder="ชื่อคนขับ" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="origin">ต้นทาง</Label>
              <Input id="origin" value={origin} onChange={(event) => setOrigin(event.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>GPS ต้นทาง</Label>
              <div className="flex min-h-10 items-center rounded-md border bg-slate-50 px-3 text-sm text-muted-foreground dark:bg-slate-900">
                ระบบจะดึงจากมือถือของผู้เริ่มงานใน Driver Room เท่านั้น
              </div>
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="note">หมายเหตุ</Label>
              <Input id="note" value={note} onChange={(event) => setNote(event.target.value)} placeholder="ข้อมูลเสริมของงานนี้" />
            </div>
            <div className="md:col-span-2">
              <div className="rounded-lg border bg-slate-50 p-4 text-sm dark:bg-slate-900">
                <div className="flex items-center gap-2 font-medium">
                  <MapPinned className="h-4 w-4 text-cyan-700 dark:text-cyan-300" />
                  สรุปปลายทาง
                </div>
                <p className="mt-2 text-muted-foreground">ปลายทางทั้งหมดด้านล่างถูกสร้างมาจากรายการ PO ที่ admin เลือกเข้า job นี้</p>
                <div className="mt-3 space-y-2">
                  {groupedDestinations.map((destination) => (
                    <div key={destination.id} className="flex items-center justify-between gap-3 rounded-md border bg-white px-3 py-2 dark:bg-slate-950">
                      <span className="min-w-0 break-words">{destination.name}</span>
                      <span className="shrink-0 text-muted-foreground">
                        {destination.poCount.toLocaleString("th-TH")} รายการ / {destination.totalQty.toLocaleString("th-TH")} ชิ้น
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            {error ? (
              <div className="md:col-span-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-950 dark:bg-red-950/30 dark:text-red-200">
                {error}
              </div>
            ) : null}
            <div className="md:col-span-2">
              <Button type="button" className="w-full" onClick={handleCreateJob} disabled={isLoading || isSaving || !records.length}>
                {isSaving ? (
                  <>กำลังบันทึก Job</>
                ) : (
                  <>
                    <Save className="mr-2 h-4 w-4" />
                    สร้าง Job จริงจากรายการที่เลือก
                  </>
                )}
              </Button>
            </div>
            <div className="md:col-span-2 rounded-lg border bg-cyan-50 p-4 text-sm text-cyan-800 dark:border-cyan-900 dark:bg-cyan-950/30 dark:text-cyan-200">
              <div className="flex items-center gap-2 font-medium">
                <Truck className="h-4 w-4" />
                หลังสร้างสำเร็จ
              </div>
              <p className="mt-2">ระบบจะพาไปหน้า Monitor ของ Job ทันที และต้องให้คนหน้างานเช็กอิน GPS ต้นทางจากมือถือก่อนเริ่มโหลดสินค้า</p>
            </div>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
