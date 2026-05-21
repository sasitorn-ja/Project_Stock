import Link from "next/link";
import { redirect } from "next/navigation";
import { AlertTriangle, History, MapPin, Radio, Route, Truck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { JobAddPOPanel } from "@/components/jobs/job-add-po-panel";
import { JobAlertList } from "@/components/jobs/job-alert-list";
import { JobAutoRefresh } from "@/components/jobs/job-auto-refresh";
import { JobDeleteButton } from "@/components/jobs/job-delete-button";
import { JobDestinationOverrideButton } from "@/components/jobs/job-destination-override-button";
import { JobDriverAccessCard } from "@/components/jobs/job-driver-access-card";
import { JobMonitorSelector } from "@/components/jobs/job-monitor-selector";
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

  if (!selectedJobId) {
    redirect("/jobs");
  }

  const [jobs, job] = await Promise.all([
    listJobs(),
    selectedJobId
      ? getJob(selectedJobId).then(async (activeJob) => activeJob ?? getJobArchive(selectedJobId))
      : Promise.resolve(null),
  ]);
  const isArchivedJob = Boolean(job?.completedAt);

  return (
    <div className="space-y-3">
      <JobAutoRefresh />

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <h2 className="text-lg font-bold tracking-normal text-slate-900">ติดตามงาน</h2>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center lg:justify-end">
          {!isArchivedJob ? (
            <div className="w-full sm:w-72">
              <JobMonitorSelector jobs={jobs} selectedJobId={selectedJobId} compact />
            </div>
          ) : null}
          <Badge variant="success" className="shrink-0">
            <Radio className="mr-1 h-3 w-3" />
            ข้อมูลสด
          </Badge>
          <Button asChild variant="outline" size="sm">
            <Link href="/reports?status=archived">
              <History className="mr-1.5 h-3.5 w-3.5" />
              ประวัติงาน
            </Link>
          </Button>
        </div>
      </div>

      {isArchivedJob && selectedJobId && job ? (
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
          <section className="grid gap-2 rounded-md border bg-white p-2 text-sm sm:grid-cols-2 xl:grid-cols-5">
            {[
              ["ห้องงาน", job.roomName?.trim() || job.id, Truck],
              ["สถานะ", getJobStatusLabel(job.status), Radio],
              ["ต้นทาง", job.isOriginLocked ? "ปิดแล้ว" : job.originCheckedInAt ? "เช็กอินแล้ว" : "รอเช็กอิน", MapPin],
              ["เส้นทาง", `${job.destinations.length.toLocaleString("th-TH")} ปลายทาง`, Route],
              ["แจ้งเตือน", String(job.alerts.length), AlertTriangle],
            ].map(([label, value, Icon]) => (
              <div key={String(label)} className="flex min-h-12 items-center justify-between gap-2 rounded-md bg-slate-50 px-3 py-2">
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold text-slate-400">{String(label)}</p>
                  <p className="truncate text-[13px] font-bold text-slate-900">{String(value)}</p>
                </div>
                <Icon className="h-4 w-4 shrink-0 text-[#0d7a5f]" />
              </div>
            ))}
          </section>

          <div className="rounded-md border bg-white px-3 py-3">
            <div className="flex flex-col justify-between gap-3 lg:flex-row lg:items-center">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-slate-900">{isArchivedJob ? "งานปิดแล้ว" : "ห้องคนขับ"}</p>
                {isArchivedJob ? <p className="mt-0.5 text-xs text-muted-foreground">{job.roomName?.trim() || job.id}</p> : null}
              </div>
              <div className="flex flex-col gap-2 lg:items-end">
                {isArchivedJob ? (
                  <div className="flex flex-wrap gap-2 lg:justify-end">
                    <Badge variant="success">ปิดงานแล้ว</Badge>
                    <Button asChild variant="outline" size="sm">
                      <Link href={`/reports?status=archived&query=${encodeURIComponent(job.id)}`}>
                        <History className="mr-1.5 h-3.5 w-3.5" />
                        เปิดในประวัติงาน
                      </Link>
                    </Button>
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-2 lg:justify-end">
                    <JobDriverAccessCard jobId={job.id} driver={job.driver} vehicle={job.vehicle} compact />
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
            </div>
          </div>

          {!isArchivedJob ? <JobAddPOPanel job={job} /> : null}

          <section className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
            <JobProgress job={job} editableScanQty={!isArchivedJob} />
            <div className="rounded-md border bg-white">
              <JobAlertList alerts={job.alerts} />
            </div>
          </section>

          <Card>
            <CardHeader className="py-3">
              <CardTitle className="text-sm">สรุป PO ในงาน</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-2 py-3 md:grid-cols-3">
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
