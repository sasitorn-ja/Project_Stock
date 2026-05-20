import { BarChart3, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { JobReportTable, type JobReportListItem } from "@/components/reports/job-report-table";
import { getJobStatusLabel } from "@/lib/job-labels";
import { getJobReportJobs, type JobReportStatusFilter } from "@/lib/job-reports";

export const dynamic = "force-dynamic";

function normalizeStatus(value: string | undefined): JobReportStatusFilter {
  return value === "active" || value === "archived" ? value : "all";
}

function formatDateTime(value?: string) {
  if (!value) {
    return "";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return new Intl.DateTimeFormat("th-TH", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Bangkok",
  }).format(date);
}

function toListItem(job: Awaited<ReturnType<typeof getJobReportJobs>>[number]): JobReportListItem {
  return {
    id: job.id,
    reportKind: job.reportKind,
    roomName: job.roomName?.trim() || job.id,
    statusLabel: getJobStatusLabel(job.status),
    driver: job.driver,
    vehicle: job.vehicle,
    eventDate: formatDateTime(job.reportEventDate),
    createdAt: formatDateTime(job.createdAt),
    completedAt: formatDateTime(job.completedAt),
    archivedAt: job.reportKind === "archived" ? formatDateTime(job.archivedAt) : "",
    requiredTotal: job.requiredTotal,
    loadedTotal: job.loadedTotal,
    deliveredTotal: job.deliveredTotal,
    itemCount: job.items.length,
    destinationCount: job.destinations.length,
  };
}

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{
    query?: string;
    dateFrom?: string;
    dateTo?: string;
    status?: string;
  }>;
}) {
  const {
    query = "",
    dateFrom = "",
    dateTo = "",
    status: rawStatus = "all",
  } = await searchParams;
  const status = normalizeStatus(rawStatus);
  const jobs = await getJobReportJobs({ query, dateFrom, dateTo, status });
  const listItems = jobs.map(toListItem);
  const activeCount = jobs.filter((job) => job.reportKind === "active").length;
  const archivedCount = jobs.filter((job) => job.reportKind === "archived").length;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
        <div>
          <h2 className="text-xl font-bold tracking-normal">รายงาน</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            เลือกงานขนส่งแล้ว export เป็น Excel ชีตเดียวสำหรับกรอง วิเคราะห์ และส่งต่อ
          </p>
        </div>
        <div className="grid grid-cols-3 gap-2 text-center text-xs md:min-w-80">
          <div className="rounded-md border bg-white px-3 py-2">
            <p className="text-muted-foreground">ทั้งหมด</p>
            <p className="mt-1 text-base font-semibold text-slate-950">{jobs.length.toLocaleString("th-TH")}</p>
          </div>
          <div className="rounded-md border bg-white px-3 py-2">
            <p className="text-muted-foreground">เปิดอยู่</p>
            <p className="mt-1 text-base font-semibold text-slate-950">{activeCount.toLocaleString("th-TH")}</p>
          </div>
          <div className="rounded-md border bg-white px-3 py-2">
            <p className="text-muted-foreground">ปิดแล้ว</p>
            <p className="mt-1 text-base font-semibold text-slate-950">{archivedCount.toLocaleString("th-TH")}</p>
          </div>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-sm">
            <Search className="size-4" />
            ค้นหาและกรองงาน
          </CardTitle>
          <CardDescription>งานเปิดอยู่ใช้วันที่สร้างงาน งานปิดแล้วใช้วันที่ปิดงานเป็นวันที่อ้างอิง</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="grid gap-2 lg:grid-cols-[minmax(260px,1fr)_170px_170px_170px_auto]">
            <Input
              type="text"
              name="query"
              defaultValue={query}
              placeholder="ค้นหารหัสงาน, ห้องงาน, คนขับ, รถ, PO, รหัสวัสดุ"
            />
            <Input type="date" name="dateFrom" defaultValue={dateFrom} />
            <Input type="date" name="dateTo" defaultValue={dateTo} />
            <select
              name="status"
              defaultValue={status}
              className="h-8 w-full rounded-md border border-[#dde3ea] bg-white px-3 py-1.5 text-sm text-slate-900 outline-none transition-colors hover:bg-white focus-visible:border-slate-400 focus-visible:ring-2 focus-visible:ring-slate-900/10"
            >
              <option value="all">ทุกสถานะงาน</option>
              <option value="active">งานเปิดอยู่</option>
              <option value="archived">งานปิดแล้ว</option>
            </select>
            <Button type="submit" size="sm">
              <Search className="mr-2 size-4" />
              ค้นหา
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-sm">
            <BarChart3 className="size-4" />
            รายการงานสำหรับ export
          </CardTitle>
          <CardDescription>เลือกหลายงานได้ หรือ export ทั้งผลลัพธ์ตามเงื่อนไขที่กรองไว้</CardDescription>
        </CardHeader>
        <CardContent>
          <JobReportTable
            jobs={listItems}
            filters={{
              query,
              dateFrom,
              dateTo,
              status,
            }}
          />
        </CardContent>
      </Card>
    </div>
  );
}
