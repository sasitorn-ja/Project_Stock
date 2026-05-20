import Link from "next/link";
import {
  BarChart3,
  CalendarClock,
  ExternalLink,
  History,
  Search,
  Truck,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { JobAlertList } from "@/components/jobs/job-alert-list";
import { JobProgress } from "@/components/jobs/job-progress";
import {
  JobExplorerFilterForm,
  JobExplorerList,
  type JobExplorerFilters,
  type JobExplorerItem,
} from "@/components/reports/job-explorer";
import { getJobStatusLabel } from "@/lib/job-labels";
import { getJobReportJobs } from "@/lib/job-reports";
import { getJob, getJobArchive } from "@/lib/job-store";

export const dynamic = "force-dynamic";

function normalizeStatus(value: string | undefined): JobExplorerFilters["status"] {
  return value === "active" || value === "archived" ? value : "all";
}

function formatDateTime(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("th-TH", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Bangkok",
  }).format(date);
}

function toListItem(
  job: Awaited<ReturnType<typeof getJobReportJobs>>[number],
): JobExplorerItem {
  return {
    id: job.id,
    reportKind: job.reportKind,
    roomName: job.roomName?.trim() || job.id,
    statusLabel: getJobStatusLabel(job.status),
    driver: job.driver,
    vehicle: job.vehicle,
    eventDate: formatDateTime(job.reportEventDate),
    requiredTotal: job.requiredTotal,
    loadedTotal: job.loadedTotal,
    deliveredTotal: job.deliveredTotal,
    itemCount: job.items.length,
    destinationCount: job.destinations.length,
  };
}

export default async function ReportsUnifiedPage({
  searchParams,
}: {
  searchParams: Promise<{
    query?: string;
    dateFrom?: string;
    dateTo?: string;
    status?: string;
    jobId?: string;
  }>;
}) {
  const {
    query = "",
    dateFrom = "",
    dateTo = "",
    status: rawStatus = "all",
    jobId: rawJobId,
  } = await searchParams;

  const status = normalizeStatus(rawStatus);
  const jobId = rawJobId?.trim() || null;

  const filters: JobExplorerFilters = { query, dateFrom, dateTo, status };

  const jobs = await getJobReportJobs({ query, dateFrom, dateTo, status });
  const listItems = jobs.map(toListItem);

  const activeCount = jobs.filter((job) => job.reportKind === "active").length;
  const archivedCount = jobs.filter((job) => job.reportKind === "archived").length;

  const selectedJobInList = jobId ? jobs.find((job) => job.id === jobId) ?? null : null;
  const archivedDetail =
    jobId && (!selectedJobInList || selectedJobInList.reportKind === "archived")
      ? await getJobArchive(jobId)
      : null;
  const activeDetail =
    jobId && !archivedDetail && (!selectedJobInList || selectedJobInList.reportKind === "active")
      ? await getJob(jobId)
      : null;

  const detail = archivedDetail ?? activeDetail;
  const detailKind: "archived" | "active" | null = archivedDetail
    ? "archived"
    : activeDetail
      ? "active"
      : null;

  return (
    <div className="space-y-4 md:space-y-6">
      <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
        <div>
          <h2 className="text-xl font-bold tracking-normal">รายงานและประวัติงาน</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            งานเปิดอยู่และงานที่ปิดจบแล้ว · เลือกเพื่อดูรายละเอียด หรือ export เป็น Excel
          </p>
        </div>
        <div className="grid grid-cols-3 gap-2 text-center text-xs md:min-w-80">
          <div className="rounded-md border bg-white px-3 py-2">
            <p className="text-muted-foreground">ทั้งหมด</p>
            <p className="mt-1 text-base font-semibold text-slate-950">
              {jobs.length.toLocaleString("th-TH")}
            </p>
          </div>
          <div className="rounded-md border bg-white px-3 py-2">
            <p className="text-muted-foreground">เปิดอยู่</p>
            <p className="mt-1 text-base font-semibold text-slate-950">
              {activeCount.toLocaleString("th-TH")}
            </p>
          </div>
          <div className="rounded-md border bg-white px-3 py-2">
            <p className="text-muted-foreground">ปิดแล้ว</p>
            <p className="mt-1 text-base font-semibold text-slate-950">
              {archivedCount.toLocaleString("th-TH")}
            </p>
          </div>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-sm">
            <Search className="size-4" />
            ค้นหาและกรองงาน
          </CardTitle>
          <CardDescription>
            งานเปิดอยู่ใช้วันที่สร้างงาน งานปิดแล้วใช้วันที่ปิดงานเป็นวันที่อ้างอิง
          </CardDescription>
        </CardHeader>
        <CardContent>
          <JobExplorerFilterForm filters={filters} />
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,360px)_minmax(0,1fr)] lg:items-start">
        <Card className="lg:sticky lg:top-4">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm">
              <BarChart3 className="size-4" />
              รายการงาน
            </CardTitle>
            <CardDescription>เลือกหนึ่งรายการเพื่อดูรายละเอียดด้านขวา</CardDescription>
          </CardHeader>
          <CardContent>
            <JobExplorerList jobs={listItems} filters={filters} selectedJobId={jobId} />
          </CardContent>
        </Card>

        <div className="space-y-4">
          {!jobId && (
            <div className="rounded-lg border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-muted-foreground">
              <BarChart3 className="mx-auto mb-3 size-8 text-slate-400" />
              เลือกงานจากรายการด้านซ้ายเพื่อดูรายละเอียด
            </div>
          )}

          {jobId && !detail && (
            <div className="rounded-lg border border-dashed border-amber-300 bg-amber-50 p-6 text-center text-sm text-amber-900">
              ไม่พบงานรหัส <span className="font-mono">{jobId}</span> ในระบบ
            </div>
          )}

          {detail && detailKind && (
            <>
              <Card>
                <CardHeader className="pb-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <CardTitle className="text-lg">
                          {detail.roomName?.trim() || detail.id}
                        </CardTitle>
                        <Badge variant={detailKind === "archived" ? "success" : "warning"}>
                          {getJobStatusLabel(detail.status)}
                        </Badge>
                      </div>
                      <p className="mt-1 break-all font-mono text-xs text-muted-foreground">
                        {detail.id}
                      </p>
                    </div>
                    {detailKind === "active" ? (
                      <Button asChild variant="outline" size="sm">
                        <Link href={`/jobs/monitor?jobId=${detail.id}`}>
                          <ExternalLink className="mr-2 size-4" />
                          ติดตามแบบสด
                        </Link>
                      </Button>
                    ) : null}
                  </div>
                </CardHeader>

                <CardContent className="grid grid-cols-2 gap-3 md:grid-cols-4">
                  <div className="rounded-md border p-3">
                    <p className="text-xs text-muted-foreground">คนขับ</p>
                    <p className="mt-1 text-sm font-semibold">{detail.driver || "-"}</p>
                  </div>
                  <div className="rounded-md border p-3">
                    <p className="text-xs text-muted-foreground">รถ</p>
                    <p className="mt-1 text-sm font-semibold">{detail.vehicle || "-"}</p>
                  </div>
                  <div className="rounded-md border p-3">
                    <p className="text-xs text-muted-foreground">ต้นทาง</p>
                    <p className="mt-1 text-sm font-semibold">{detail.origin || "-"}</p>
                  </div>
                  <div className="rounded-md border p-3">
                    <p className="text-xs text-muted-foreground">GPS ต้นทางจริง</p>
                    <p className="mt-1 break-words text-xs font-medium text-slate-700">
                      {detail.originGps || "-"}
                    </p>
                  </div>
                </CardContent>

                {archivedDetail ? (
                  <CardContent className="grid grid-cols-2 gap-3 border-t md:grid-cols-4">
                    <div className="flex items-center gap-2 text-sm">
                      <Truck className="size-4 text-cyan-700" />
                      <div>
                        <p className="text-xs text-muted-foreground">ห้องงาน</p>
                        <p className="font-semibold">{archivedDetail.roomName || archivedDetail.id}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                      <History className="size-4 text-cyan-700" />
                      <div>
                        <p className="text-xs text-muted-foreground">สถานะ</p>
                        <p className="font-semibold">{getJobStatusLabel(archivedDetail.status)}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                      <CalendarClock className="size-4 text-cyan-700" />
                      <div>
                        <p className="text-xs text-muted-foreground">เก็บเข้าประวัติ</p>
                        <p className="font-semibold">
                          {formatDateTime(archivedDetail.archivedAt) || "-"}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                      <CalendarClock className="size-4 text-cyan-700" />
                      <div>
                        <p className="text-xs text-muted-foreground">ลบอัตโนมัติ</p>
                        <p className="font-semibold">
                          {formatDateTime(archivedDetail.deleteAfterAt) || "-"}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                ) : null}
              </Card>

              <div className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
                <JobProgress job={detail} />
                <Card>
                  <JobAlertList
                    alerts={detail.alerts}
                    description="บันทึกเหตุการณ์ระหว่างงาน ทั้งสแกนผ่าน คำเตือน และความผิดปกติ"
                  />
                </Card>
              </div>

              {"poStatuses" in detail && detail.poStatuses?.length ? (
                <Card>
                  <CardHeader>
                    <CardTitle>สรุป PO ในงาน</CardTitle>
                    <CardDescription>
                      สถานะสุดท้ายของแต่ละ PO จากข้อมูลก่อนย้ายเข้าประวัติ
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="grid grid-cols-2 gap-3 md:grid-cols-3">
                    {detail.poStatuses.map((item) => (
                      <div key={item.po} className="rounded-md border p-4">
                        <p className="font-semibold">{item.po}</p>
                        <Badge className="mt-3" variant={item.variant}>
                          {item.status}
                        </Badge>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              ) : null}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
