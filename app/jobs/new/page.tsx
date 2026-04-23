import { FileText, MapPinned, QrCode, Truck } from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { JobRoomGenerator } from "@/components/jobs/job-room-generator";
import { groupedPOsByDestination, pendingPOs } from "@/lib/mock-data";

export default function NewJobPage() {
  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
        <div>
          <h2 className="text-2xl font-bold tracking-normal">สร้าง Job จาก PO</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Admin เลือก PO ที่รอจัดส่ง ระบบรวมตามปลายทาง แล้วสร้าง Job Room + QR
          </p>
        </div>
        <Button asChild variant="outline">
          <Link href="/po">
            <FileText className="mr-2 h-4 w-4" />
            กลับไปเลือก PO
          </Link>
        </Button>
      </div>

      <section className="grid gap-6 xl:grid-cols-[1fr_0.9fr]">
        <Card>
          <CardHeader>
            <CardTitle>รายการที่เลือก</CardTitle>
            <CardDescription>ใช้เป็นแผนตรวจตอนโหลดขึ้นรถและส่งปลายทาง</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {pendingPOs.map((po) => (
              <div key={po.id} className="rounded-lg border p-4">
                <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold">{po.id}</p>
                      <Badge variant="warning">{po.status}</Badge>
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {po.destination} / Due {po.dueDate}
                    </p>
                  </div>
                  <Badge variant="secondary">{po.items.reduce((sum, item) => sum + item.qty, 0)} pcs</Badge>
                </div>
                <div className="mt-3 grid gap-2">
                  {po.items.map((item) => (
                    <div key={`${po.id}-${item.sku}`} className="flex items-center justify-between rounded-md bg-slate-50 px-3 py-2 text-sm dark:bg-slate-900">
                      <span className="min-w-0 break-words pr-3">{item.sku} - {item.name}</span>
                      <span className="shrink-0 font-semibold">{item.qty}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <JobRoomGenerator />
      </section>

      <Card>
        <CardHeader>
          <CardTitle>แยกตามปลายทาง</CardTitle>
          <CardDescription>กลุ่มงานสำหรับ QR location และแผนโหลดของคนขับ</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 xl:grid-cols-2">
          {groupedPOsByDestination.map((group) => (
            <div key={group.destinationId} className="rounded-lg border p-4">
              <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
                <div>
                  <div className="flex items-center gap-2">
                    <MapPinned className="h-4 w-4 text-cyan-700 dark:text-cyan-300" />
                    <p className="font-semibold">{group.destination}</p>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">{group.destinationId}</p>
                  <p className="mt-2 text-sm text-muted-foreground">PO: {group.poIds.join(", ")}</p>
                </div>
                <Badge variant="secondary">{group.totalItems} pcs</Badge>
              </div>
              <div className="mt-4 grid gap-2 sm:grid-cols-2">
                <Button type="button" variant="outline">
                  <QrCode className="mr-2 h-4 w-4" />
                  QR Location
                </Button>
                <Button type="button" variant="outline">
                  <Truck className="mr-2 h-4 w-4" />
                  Plan Loading
                </Button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
