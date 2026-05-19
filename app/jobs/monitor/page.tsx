import Link from "next/link";
import { AlertTriangle, History, MapPin, Radio, Route, Truck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { JobAddPOPanel } from "@/components/jobs/job-add-po-panel";
import { JobAlertList } from "@/components/jobs/job-alert-list";
import { JobAutoRefresh } from "@/components/jobs/job-auto-refresh";
import { JobDeleteButton } from "@/components/jobs/job-delete-button";
import { JobDestinationOverrideButton } from "@/components/jobs/job-destination-override-button";
import { JobDriverAccessCard } from "@/components/jobs/job-driver-access-card";
import { JobOriginOverrideButton } from "@/components/jobs/job-origin-override-button";
import { JobProgress } from "@/components/jobs/job-progress";
import { getJobStatusLabel } from "@/lib/job-labels";
import { getJob, getJobArchive, listJobs } from "@/lib/job-store";

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
    selectedJobId
      ? getJob(selectedJobId).then(async (activeJob) => activeJob ?? getJobArchive(selectedJobId))
      : Promise.resolve(null),
  ]);
  const isArchivedJob = Boolean(job?.completedAt);

  return (
    <div className="space-y-6">
      <JobAutoRefresh />

      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
        <div className="min-w-0">
          <h2 className="text-xl font-bold tracking-tight text-slate-900">ติดตามงาน</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            ดูสถานะโหลดต้นทาง ส่งปลายทาง และแจ้งเตือนของงานที่สร้างจากข้อมูลจริง
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="success" className="shrink-0">
            <Radio className="mr-1 h-3 w-3" />
            ข้อมูลสด
          </Badge>
          <Button asChild variant="outline" size="sm">
            <Link href="/jobs/history">
              <History className="mr-1.5 h-3.5 w-3.5" />
              ประวัติงาน
            </Link>
          </Button>
        </div>
      </div>

      {/* เลือกงาน */}
      {jobs.length ? (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-slate-900 text-[11px] font-bold text-white">1</span>
              <CardTitle className="text-sm">เลือกงานที่ต้องการติดตาม</CardTitle>
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
          <CardContent className="flex flex-col justify-between gap-4 p-5 sm:flex-row sm:items-center">
            <p className="text-sm text-muted-foreground">
              กำลังดู {job.roomName?.trim() || job.id}
            </p>
            <Button asChild variant="outline" size="sm">
              <Link href="/jobs/monitor">เลือกงานอื่น</Link>
            </Button>
          </CardContent>
        </Card>
      ) : null}

      {job ? (
        <>
          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            {[
              ["ห้องงาน", job.roomName?.trim() || job.id, Truck],
              ["สถานะ", getJobStatusLabel(job.status), Radio],
              ["ต้นทาง", job.isOriginLocked ? "ปิดแล้ว" : job.originCheckedInAt ? "เช็กอินแล้ว" : "รอเช็กอิน", MapPin],
              ["เส้นทาง", `${job.destinations.length.toLocaleString("th-TH")} ปลายทาง`, Route],
              ["แจ้งเตือน", String(job.alerts.length), AlertTriangle],
            ].map(([label, value, Icon]) => (
              <Card key={String(label)}>
                <CardContent className="flex min-h-20 items-center justify-between gap-3 p-4">
                  <div>
                    <p className="text-[11px] font-semibold text-slate-400">{String(label)}</p>
                    <p className="mt-1 break-words text-[15px] font-bold text-slate-900">{String(value)}</p>
                  </div>
                  <Icon className="h-4 w-4 text-[#0d7a5f]" />
                </CardContent>
              </Card>
            ))}
          </section>

          <Card>
            <CardHeader>
              <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
                <div>
                  <CardTitle className="text-sm">
                    {isArchivedJob ? "งานนี้ปิดแล้ว" : "ช่องทางเข้าหน้าคนขับ"}
                  </CardTitle>
                  <CardDescription>
                    {isArchivedJob
                      ? "งานถูกส่งครบและย้ายเข้าเมนูประวัติงานแล้ว หน้านี้ยังแสดงผลต่อเพื่อให้ Admin ที่เปิดค้างอยู่ตรวจสอบสถานะสุดท้ายได้"
                      : "เปิดหน้าคนขับโดยตรงหรือแสดง QR ให้คนขับสแกนเข้างานนี้จากมือถือ"}
                  </CardDescription>
                </div>
                {isArchivedJob ? (
                  <div className="flex flex-col gap-2 sm:items-end">
                    <Badge variant="success">ปิดงานแล้ว</Badge>
                    <Button asChild variant="outline" size="sm">
                      <Link href={`/jobs/history/${encodeURIComponent(job.id)}`}>
                        <History className="mr-1.5 h-3.5 w-3.5" />
                        เปิดในประวัติงาน
                      </Link>
                    </Button>
                  </div>
                ) : (
                  <div className="flex flex-col gap-2 sm:items-end">
                    <JobDestinationOverrideButton
                      jobId={job.id}
                      enabled={Boolean(job.allowDestinationBeforeFullyLoaded)}
                      isFullyLoaded={job.isFullyLoaded}
                    />
                    <JobOriginOverrideButton
                      jobId={job.id}
                      enabled={Boolean(job.allowOriginRecheckAfterLocked)}
                      isOriginLocked={job.isOriginLocked}
                    />
                    <JobDeleteButton jobId={job.id} redirectTo="/jobs" />
                  </div>
                )}
              </div>
            </CardHeader>
            {!isArchivedJob ? (
              <CardContent>
                <JobDriverAccessCard jobId={job.id} driver={job.driver} vehicle={job.vehicle} />
              </CardContent>
            ) : null}
          </Card>

          {!isArchivedJob ? <JobAddPOPanel job={job} /> : null}

          <section className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
            <JobProgress job={job} editableScanQty={!isArchivedJob} />
            <Card>
              <JobAlertList alerts={job.alerts} />
            </Card>
          </section>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm">สรุป PO ในงาน</CardTitle>
              <CardDescription>ระบบสรุปตามจำนวนรอบสแกน/กล่องที่ผู้ดูแลยืนยัน แยกจากจำนวนสั่งซื้อและราคาในไฟล์</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-2 md:grid-cols-3">
              {job.poStatuses.map((item) => (
                <div key={item.po} className="rounded-lg border border-[#f0f2f5] bg-[#fafbfc] p-4">
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
            เลือกงานจากรายการด้านบนเพื่อเริ่มติดตาม
          </div>
        )
      )}
    </div>
  );
}
