import { CheckCircle2, Circle, MapPin } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { type getJob, type getJobArchive } from "@/lib/job-store";

type JobDetail =
  | NonNullable<Awaited<ReturnType<typeof getJob>>>
  | NonNullable<Awaited<ReturnType<typeof getJobArchive>>>;

export function JobProgress({ job }: { job: JobDetail }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>แผนส่งตาม Location / PO</CardTitle>
        <CardDescription>ระบบนับ loaded/delivered แยกตามปลายทาง โดยอ้างอิงรายการ PO จริงใน Job</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {job.destinations.map((location, index) => {
          const complete = location.delivered >= location.required && location.required > 0;

          return (
            <div key={location.id} className="rounded-lg border p-4">
              <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
                <div className="flex gap-3">
                  <div className="mt-1 text-cyan-700 dark:text-cyan-300">
                    {complete ? <CheckCircle2 className="h-5 w-5" /> : <Circle className="h-5 w-5" />}
                  </div>
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold">{index + 1}. {location.name}</p>
                      <Badge variant={complete ? "success" : "secondary"}>{location.status}</Badge>
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">{location.address}</p>
                    <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                      <MapPin className="h-3.5 w-3.5" />
                      {location.gps} / radius {location.radiusMeters} m
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      GPS ส่งของ: {location.deliveryGps || "ยังไม่เช็กอินปลายทาง"}
                    </p>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2 text-center text-sm">
                  <div className="rounded-md bg-slate-50 px-3 py-2 dark:bg-slate-900">
                    <p className="text-xs text-muted-foreground">Plan</p>
                    <p className="font-semibold">{location.required}</p>
                  </div>
                  <div className="rounded-md bg-cyan-50 px-3 py-2 text-cyan-700 dark:bg-cyan-950 dark:text-cyan-300">
                    <p className="text-xs">Loaded</p>
                    <p className="font-semibold">{location.loaded}</p>
                  </div>
                  <div className="rounded-md bg-emerald-50 px-3 py-2 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                    <p className="text-xs">Delivered</p>
                    <p className="font-semibold">{location.delivered}</p>
                  </div>
                </div>
              </div>

              <div className="mt-4 overflow-hidden rounded-md border">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[720px] text-sm">
                    <thead className="bg-slate-50 text-left text-slate-500 dark:bg-slate-900 dark:text-slate-400">
                      <tr>
                        <th className="w-32 whitespace-nowrap px-3 py-2 font-medium">PO</th>
                        <th className="w-32 whitespace-nowrap px-3 py-2 font-medium">รหัสวัสดุ</th>
                        <th className="px-3 py-2 font-medium">สินค้า</th>
                        <th className="w-24 whitespace-nowrap px-3 py-2 font-medium">ต้องส่ง</th>
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
                          <td className="whitespace-nowrap px-3 py-2 align-top">{item.orderQty}</td>
                          <td className="whitespace-nowrap px-3 py-2 align-top">{item.loadedQty}</td>
                          <td className="whitespace-nowrap px-3 py-2 align-top">{item.deliveredQty}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
