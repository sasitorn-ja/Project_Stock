import { AlertTriangle, Radio, Route, Truck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { JobProgress } from "@/components/jobs/job-progress";
import { alerts, monitorJob, monitorPOStatuses } from "@/data/pages/job-monitor";

export default function JobMonitorPage() {
  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
        <div>
          <h2 className="text-2xl font-bold tracking-normal">Monitor Realtime</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            ดูสถานะโหลดต้นทาง ส่งปลายทาง GPS alert และความครบถ้วนของ PO ใน Job
          </p>
        </div>
        <Badge variant="success" className="w-fit">
          <Radio className="mr-1 h-3.5 w-3.5" />
          Live
        </Badge>
      </div>

      <section className="grid gap-4 md:grid-cols-4">
        {[
          ["Job", monitorJob.id, Truck],
          ["Status", monitorJob.status, Radio],
          ["Route", "3 Locations", Route],
          ["Alerts", String(alerts.length), AlertTriangle],
        ].map(([label, value, Icon]) => (
          <Card key={String(label)}>
            <CardContent className="flex items-center justify-between p-5">
              <div>
                <p className="text-sm text-muted-foreground">{String(label)}</p>
                <p className="mt-2 text-lg font-semibold">{String(value)}</p>
              </div>
              <Icon className="h-5 w-5 text-cyan-700 dark:text-cyan-300" />
            </CardContent>
          </Card>
        ))}
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <JobProgress />
        <Card>
          <CardHeader>
            <CardTitle>Alert Queue</CardTitle>
            <CardDescription>เมื่อระบบเจอความผิดปกติจะส่งเข้าหน้านี้ทันที</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {alerts.map((alert) => (
              <div key={alert.id} className="rounded-lg border p-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold">{alert.type}</p>
                    <p className="mt-1 text-sm text-muted-foreground">{alert.message}</p>
                  </div>
                  <Badge variant={alert.severity === "สูง" ? "warning" : "secondary"}>
                    {alert.severity}
                  </Badge>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">{alert.time}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      </section>

      <Card>
        <CardHeader>
          <CardTitle>สรุป PO ใน Job</CardTitle>
          <CardDescription>หลังส่งสินค้า ระบบสรุปว่า PO ไหนส่งครบหรือยังไม่ครบ</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-3">
          {monitorPOStatuses.map((item) => (
            <div key={item.po} className="rounded-lg border p-4">
              <p className="font-semibold">{item.po}</p>
              <Badge className="mt-3" variant={item.variant as "success" | "warning" | "secondary"}>
                {item.status}
              </Badge>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
