import Link from "next/link";
import { AlertTriangle, History, Radio, Route, Truck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { JobDriverAccessCard } from "@/components/jobs/job-driver-access-card";
import { JobProgress } from "@/components/jobs/job-progress";
import { getJob, listJobs } from "@/lib/job-store";

export default async function JobMonitorPage({
  searchParams,
}: {
  searchParams: Promise<{ jobId?: string }>;
}) {
  const { jobId } = await searchParams;
  const jobs = await listJobs();
  const fallbackJobId = jobId || jobs[0]?.id;
  const job = fallbackJobId ? await getJob(fallbackJobId) : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
        <div>
          <h2 className="text-2xl font-bold tracking-normal">Monitor Realtime</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            ดูสถานะโหลดต้นทาง ส่งปลายทาง และ alert ของ Job ที่สร้างจากข้อมูลจริง
          </p>
        </div>
        <Badge variant="success" className="w-fit">
          <Radio className="mr-1 h-3.5 w-3.5" />
          Live Data
        </Badge>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button asChild variant="outline" size="sm">
          <Link href="/jobs/history">
            <History className="mr-2 h-4 w-4" />
            ประวัติงาน
          </Link>
        </Button>
      </div>

      {jobs.length ? (
        <div className="flex flex-wrap gap-2">
          {jobs.map((currentJob) => (
            <Button key={currentJob.id} asChild variant={currentJob.id === fallbackJobId ? "default" : "outline"} size="sm">
              <Link href={`/jobs/monitor?jobId=${encodeURIComponent(currentJob.id)}`}>{currentJob.id}</Link>
            </Button>
          ))}
        </div>
      ) : null}

      {job ? (
        <>
          <section className="grid gap-4 md:grid-cols-4">
            {[
              ["Job", job.id, Truck],
              ["Status", job.status, Radio],
              ["Route", `${job.destinations.length} Locations`, Route],
              ["Alerts", String(job.alerts.length), AlertTriangle],
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

          <Card>
            <CardHeader>
              <CardTitle>ช่องทางเข้าหน้าคนขับ</CardTitle>
              <CardDescription>เปิดหน้าคนขับโดยตรงหรือแสดง QR ให้คนขับสแกนเข้างานนี้จากมือถือ</CardDescription>
            </CardHeader>
            <CardContent>
              <JobDriverAccessCard jobId={job.id} driver={job.driver} vehicle={job.vehicle} />
            </CardContent>
          </Card>

          <section className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
            <JobProgress job={job} />
            <Card>
              <CardHeader>
                <CardTitle>Alert Queue</CardTitle>
                <CardDescription>เมื่อระบบเจอความผิดปกติจากการสแกน จะเก็บเหตุการณ์ไว้ที่นี่ทันที</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {job.alerts.length ? (
                  job.alerts.map((alert) => (
                    <div key={alert.id} className="rounded-lg border p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-semibold">{alert.type}</p>
                          <p className="mt-1 text-sm text-muted-foreground">{alert.message}</p>
                        </div>
                        <Badge variant={alert.severity === "สูง" ? "warning" : "secondary"}>{alert.severity}</Badge>
                      </div>
                      <p className="mt-2 text-xs text-muted-foreground">{alert.time}</p>
                    </div>
                  ))
                ) : (
                  <div className="rounded-lg border bg-slate-50 p-4 text-sm text-muted-foreground dark:bg-slate-900">
                    ยังไม่มี alert สำหรับ Job นี้
                  </div>
                )}
              </CardContent>
            </Card>
          </section>

          <Card>
            <CardHeader>
              <CardTitle>สรุป PO ใน Job</CardTitle>
              <CardDescription>ระบบสรุปจากจำนวนที่ส่งจริงของแต่ละ PO</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 md:grid-cols-3">
              {job.poStatuses.map((item) => (
                <div key={item.po} className="rounded-lg border p-4">
                  <p className="font-semibold">{item.po}</p>
                  <Badge className="mt-3" variant={item.variant}>
                    {item.status}
                  </Badge>
                </div>
              ))}
            </CardContent>
          </Card>
        </>
      ) : (
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground">
            ยังไม่มี Job สำหรับ monitor เริ่มต้นจากหน้า <Link href="/po" className="font-medium text-cyan-700 underline underline-offset-4">PO รอจัดส่ง</Link>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
