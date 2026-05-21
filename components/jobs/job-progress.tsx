"use client";

import { useState } from "react";
import { CheckCircle2, ChevronDown, Circle, MapPin } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { JobItemScanQtyEditor } from "@/components/jobs/job-item-scan-qty-editor";
import { type getJob, type getJobArchive } from "@/lib/job-store";

type JobDetail =
  | NonNullable<Awaited<ReturnType<typeof getJob>>>
  | NonNullable<Awaited<ReturnType<typeof getJobArchive>>>;

export function JobProgress({ job, editableScanQty = false }: { job: JobDetail; editableScanQty?: boolean }) {
  const destinations = job.destinations;
  // ค่าเริ่มต้น: เปิดปลายทางแรกไว้ ที่เหลือพับเก็บ เพื่อให้หน้าไม่ยาวเกินไป
  const [openIds, setOpenIds] = useState<Set<string>>(
    () => new Set(destinations.slice(0, 1).map((destination) => destination.id)),
  );

  const allOpen = destinations.length > 0 && destinations.every((destination) => openIds.has(destination.id));

  function toggle(id: string) {
    setOpenIds((current) => {
      const next = new Set(current);

      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }

      return next;
    });
  }

  function toggleAll() {
    setOpenIds(allOpen ? new Set() : new Set(destinations.map((destination) => destination.id)));
  }

  return (
    <div className="rounded-md border bg-white">
      <div className="flex items-center justify-between gap-3 border-b px-3 py-3">
        <h3 className="text-sm font-semibold text-slate-900">แผนส่ง / PO</h3>
        {destinations.length > 1 ? (
          <button
            type="button"
            onClick={toggleAll}
            className="text-xs font-medium text-slate-500 transition-colors hover:text-slate-800"
          >
            {allOpen ? "ย่อทั้งหมด" : "ขยายทั้งหมด"}
          </button>
        ) : null}
      </div>
      <div className="space-y-3 p-3">
        {destinations.map((location, index) => {
          const complete = location.delivered >= location.required && location.required > 0;
          const scrollHint = location.items.length > 5;
          const isOpen = openIds.has(location.id);

          return (
            <div key={location.id} className="rounded-md border">
              <button
                type="button"
                onClick={() => toggle(location.id)}
                aria-expanded={isOpen}
                className="relative flex w-full flex-col gap-3 px-3 py-3 pr-10 text-left transition-colors hover:bg-slate-50/70 sm:flex-row sm:items-start sm:justify-between"
              >
                <div className="flex gap-3">
                  <div className="mt-1 text-cyan-700 dark:text-cyan-300">
                    {complete ? <CheckCircle2 className="h-5 w-5" /> : <Circle className="h-5 w-5" />}
                  </div>
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold">{index + 1}. {location.name}</p>
                      <Badge variant={complete ? "success" : "secondary"}>{location.status}</Badge>
                      <span className="text-[11px] text-muted-foreground">{location.items.length} รายการ</span>
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">{location.address}</p>
                    <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                      <MapPin className="h-3.5 w-3.5" />
                      {location.gps} / รัศมี {location.radiusMeters} ม.
                    </p>
                    {location.deliveryGps ? <p className="mt-1 text-xs text-muted-foreground">GPS ส่งของ: {location.deliveryGps}</p> : null}
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2 text-center text-sm sm:min-w-72">
                  <div className="rounded-md bg-slate-50 px-2 py-2 dark:bg-slate-900">
                    <p className="text-xs text-muted-foreground">ต้องสแกน</p>
                    <p className="font-semibold">{location.required}</p>
                  </div>
                  <div className="rounded-md bg-cyan-50 px-2 py-2 text-cyan-700 dark:bg-cyan-950 dark:text-cyan-300">
                    <p className="text-xs">ขึ้นรถแล้ว</p>
                    <p className="font-semibold">{location.loaded}</p>
                  </div>
                  <div className="rounded-md bg-emerald-50 px-2 py-2 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                    <p className="text-xs">ลงของแล้ว</p>
                    <p className="font-semibold">{location.delivered}</p>
                  </div>
                </div>
                <ChevronDown
                  className={`absolute right-3 top-3.5 h-4 w-4 shrink-0 text-slate-400 transition-transform ${
                    isOpen ? "rotate-180" : ""
                  }`}
                />
              </button>

              {isOpen ? (
                <div className="overflow-hidden border-t">
                  {scrollHint ? (
                    <p className="bg-slate-50 px-3 py-1.5 text-[11px] text-muted-foreground dark:bg-slate-900">
                      {location.items.length} รายการ — เลื่อนดูในตาราง
                    </p>
                  ) : null}
                  <div className="hidden max-h-[280px] overflow-auto md:block">
                    <table className="w-full min-w-[820px] text-[13px]">
                      <thead className="sticky top-0 z-10 bg-slate-50 text-left text-slate-500 dark:bg-slate-900 dark:text-slate-400">
                        <tr>
                          <th className="w-32 whitespace-nowrap px-3 py-2 font-medium">PO</th>
                          <th className="w-32 whitespace-nowrap px-3 py-2 font-medium">รหัสวัสดุ</th>
                          <th className="min-w-[220px] px-3 py-2 font-medium">สินค้า</th>
                          <th className="w-28 whitespace-nowrap px-3 py-2 font-medium">จำนวนสั่งซื้อ</th>
                          <th className="w-36 whitespace-nowrap px-3 py-2 font-medium">ต้องสแกน</th>
                          <th className="w-24 whitespace-nowrap px-3 py-2 font-medium">ขึ้นรถ</th>
                          <th className="w-24 whitespace-nowrap px-3 py-2 font-medium">ลงของ</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {location.items.map((item) => (
                          <tr key={item.registryKey}>
                            <td className="whitespace-nowrap px-3 py-2 align-top font-medium">{item.poSapNo}</td>
                            <td className="whitespace-nowrap px-3 py-2 align-top">{item.materialCode || "-"}</td>
                            <td className="break-words px-3 py-2 align-top">{item.materialName || "-"}</td>
                            <td className="whitespace-nowrap px-3 py-2 align-top">{item.sourceOrderQty || String(item.orderQty || "-")}</td>
                            <td className="whitespace-nowrap px-3 py-2 align-top">
                              {editableScanQty ? (
                                <JobItemScanQtyEditor
                                  jobId={job.id}
                                  registryKey={item.registryKey}
                                  value={item.orderQty}
                                  minimum={Math.max(item.loadedQty, item.deliveredQty, 0)}
                                />
                              ) : (
                                item.orderQty
                              )}
                            </td>
                            <td className="whitespace-nowrap px-3 py-2 align-top">{item.loadedQty}</td>
                            <td className="whitespace-nowrap px-3 py-2 align-top">{item.deliveredQty}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="max-h-[420px] divide-y overflow-y-auto md:hidden">
                    {location.items.map((item) => (
                      <div key={item.registryKey} className="space-y-2 p-4 text-sm">
                        <div>
                          <p className="break-words font-semibold">{item.poSapNo}</p>
                          <p className="mt-0.5 break-words text-xs text-muted-foreground">{item.materialCode || "-"}</p>
                        </div>
                        <p className="break-words text-muted-foreground">{item.materialName || "-"}</p>
                        <div className="grid grid-cols-2 gap-2 text-center text-xs">
                          <div className="rounded-md bg-slate-50 px-2 py-2">
                            <p className="text-muted-foreground">จำนวนสั่งซื้อ</p>
                            <p className="font-semibold text-slate-950">{item.sourceOrderQty || String(item.orderQty || "-")}</p>
                          </div>
                          <div className="rounded-md bg-slate-50 px-2 py-2">
                            <p className="text-muted-foreground">ต้องสแกน</p>
                            <p className="font-semibold text-slate-950">{item.orderQty}</p>
                          </div>
                          <div className="rounded-md bg-cyan-50 px-2 py-2 text-cyan-700">
                            <p>ขึ้นรถ</p>
                            <p className="font-semibold">{item.loadedQty}</p>
                          </div>
                          <div className="rounded-md bg-emerald-50 px-2 py-2 text-emerald-700">
                            <p>ลงของ</p>
                            <p className="font-semibold">{item.deliveredQty}</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
