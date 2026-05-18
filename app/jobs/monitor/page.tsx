import Link from "next/link";
import { AlertTriangle, History, Radio, Route, Truck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { JobAutoRefresh } from "@/components/jobs/job-auto-refresh";
import { JobDeleteButton } from "@/components/jobs/job-delete-button";
import { JobDestinationOverrideButton } from "@/components/jobs/job-destination-override-button";
import { JobDriverAccessCard } from "@/components/jobs/job-driver-access-card";
import { JobProgress } from "@/components/jobs/job-progress";
import { getJob, listJobs } from "@/lib/job-store";

export const dynamic = "force-dynamic";

export default async function JobMonitorPage({
  searchParams,
}: {
  searchParams: Promise<{ jobId?: string }>;
}) {
  const { jobId } = await searchParams;
  const selectedJobId = jobId ?? null;
  const [jobs, job] = await Promise.all([
    selectedJobId ? Promise.resolve([]) : listJobs(),
    selectedJobId ? getJob(selectedJobId) : Promise.resolve(null),
  ]);

  return (
    <div className="space-y-4">
      <JobAutoRefresh />

      <div className="flex flex-col justify-between gap-3 md:flex-row md:items-center">
        <div className="min-w-0">
          <h2 className="text-lg font-bold tracking-tight text-slate-900">Monitor Realtime</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            ดูสถานะโหลดต้นทาง ส่งปลายทาง และ alert ของ Job ที่สร้างจากข้อมูลจริง
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="success" className="shrink-0">
            <Radio className="mr-1 h-3 w-3" />
            Live Data
          </Badge>
          <Button asChild variant="outline" size="sm">
            <Link href="/jobs/history">
              <History className="mr-1.5 h-3.5 w-3.5" />
              ประวัติงาน
            </Link>
          </Button>
        </div>
      </div>

      {/* เลือก Job */}
      {jobs.length ? (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-slate-900 text-[11px] font-bold text-white">1</span>
              <CardTitle className="text-sm">เลือก Job ที่ต้องการ monitor</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {jobs.map((currentJob) => (
                <Button key={currentJob.id} asChild variant={currentJob.id === selectedJobId ? "default" : "outline"} size="sm" className="h-8 text-[12.5px]">
                  <Link href={`/jobs/monitor?jobId=${encodeURIComponent(currentJob.id)}`}>
                    {currentJob.roomName?.trim() || currentJob.id}
                  </Link>
                </Button>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : selectedJobId && job ? (
        <Card>
          <CardContent className="flex flex-col justify-between gap-3 p-4 sm:flex-row sm:items-center">
            <p className="text-sm text-muted-foreground">
              กำลังดู {job.roomName?.trim() || job.id}
            </p>
            <Button asChild variant="outline" size="sm">
              <Link href="/jobs/monitor">เลือก Job อื่น</Link>
            </Button>
          </CardContent>
        </Card>
      ) : null}

      {job ? (
        <>
          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {[
              ["ห้อง Job", job.roomName?.trim() || job.id, Truck],
              ["Status", job.status, Radio],
              ["Route", `${job.destinations.length} Locations`, Route],
              ["Alerts", String(job.alerts.length), AlertTriangle],
            ].map(([label, value, Icon]) => (
              <Card key={String(label)}>
                <CardContent className="flex items-center justify-between p-4">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{String(label)}</p>
                    <p className="mt-1 break-words text-[15px] font-bold text-slate-900">{String(value)}</p>
                  </div>
                  <Icon className="h-4 w-4 text-[#0d7a5f]" />
                </CardContent>
              </Card>
            ))}
          </section>

          <Card>
            <CardHeader className="pb-3">
              <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
                <div>
                  <CardTitle className="text-sm">ช่องทางเข้าหน้าคนขับ</CardTitle>
                  <CardDescription>เปิดหน้าคนขับโดยตรงหรือแสดง QR ให้คนขับสแกนเข้างานนี้จากมือถือ</CardDescription>
                </div>
                <div className="flex flex-col gap-2 sm:items-end">
                  <JobDestinationOverrideButton
                    jobId={job.id}
                    enabled={Boolean(job.allowDestinationBeforeFullyLoaded)}
                    isFullyLoaded={job.isFullyLoaded}
                  />
                  <JobDeleteButton jobId={job.id} redirectTo="/jobs" />
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <JobDriverAccessCard jobId={job.id} driver={job.driver} vehicle={job.vehicle} />
            </CardContent>
          </Card>

          <section className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
            <JobProgress job={job} editableScanQty />
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">Alert Queue</CardTitle>
                <CardDescription>เมื่อระบบเจอความผิดปกติจากการสแกน จะเก็บเหตุการณ์ไว้ที่นี่ทันที</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {job.alerts.length ? (
                  job.alerts.map((alert) => (
                    <div key={alert.id} className="rounded-lg border border-[#f0f2f5] bg-[#fafbfc] p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-[12.5px] font-semibold text-slate-900">{alert.type}</p>
                          <p className="mt-0.5 text-[11.5px] text-muted-foreground">{alert.message}</p>
                        </div>
                        <Badge variant={alert.severity === "สูง" ? "warning" : "secondary"}>{alert.severity}</Badge>
                      </div>
                      <p className="mt-1.5 text-[11px] text-muted-foreground">{alert.time}</p>
                    </div>
                  ))
                ) : (
                  <div className="rounded-lg border border-dashed border-slate-200 p-4 text-[12.5px] text-muted-foreground">
                    ยังไม่มี alert สำหรับ Job นี้
                  </div>
                )}
              </CardContent>
            </Card>
          </section>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">สรุป PO ใน Job</CardTitle>
              <CardDescription>ระบบสรุปตามจำนวนรอบสแกน/กล่องที่ Admin ยืนยัน แยกจากจำนวนสั่งซื้อและราคาในไฟล์</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-2 md:grid-cols-3">
              {job.poStatuses.map((item) => (
                <div key={item.po} className="rounded-lg border border-[#f0f2f5] bg-[#fafbfc] p-3">
                  <p className="text-[12.5px] font-semibold text-slate-900">{item.po}</p>
                  <Badge className="mt-2" variant={item.variant}>
                    {item.status}
                  </Badge>
                </div>
              ))}
            </CardContent>
          </Card>
        </>
      ) : (
        !selectedJobId && (
          <div className="rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-muted-foreground">
            เลือก Job จากรายการด้านบนเพื่อเริ่ม monitor
          </div>
        )
      )}
    </div>
  );
}
