import { FileSpreadsheet, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownSelect } from "@/components/ui/dropdown-select";
import { Input } from "@/components/ui/input";
import { JobReportTable, type JobReportListItem } from "@/components/reports/job-report-table";
import { getJobStatusLabel } from "@/lib/job-labels";
import { getJobReportJobs, type JobReportStatusFilter } from "@/lib/job-reports";

export const dynamic = "force-dynamic";

function normalizeStatus(value: string | undefined): JobReportStatusFilter {
  return value === "active" || value === "archived" ? value : "all";
}

const statusOptions = [
  { value: "all", label: "ทุกสถานะ" },
  { value: "active", label: "เปิดอยู่" },
  { value: "archived", label: "ปิดแล้ว" },
];

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
    <div className="space-y-3">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <h2 className="text-lg font-bold tracking-normal">รายงานข้อมูลและประวัติงาน</h2>
        <div className="flex flex-wrap gap-2 text-xs">
          <div className="flex h-8 items-center gap-2 rounded-md border bg-white px-3">
            <span className="text-muted-foreground">ผลลัพธ์</span>
            <span className="font-semibold text-slate-950">{jobs.length.toLocaleString("th-TH")}</span>
          </div>
          <div className="flex h-8 items-center gap-2 rounded-md border bg-white px-3">
            <span className="text-muted-foreground">เปิดอยู่</span>
            <span className="font-semibold text-slate-950">{activeCount.toLocaleString("th-TH")}</span>
          </div>
          <div className="flex h-8 items-center gap-2 rounded-md border bg-white px-3">
            <span className="text-muted-foreground">ปิดแล้ว</span>
            <span className="font-semibold text-slate-950">{archivedCount.toLocaleString("th-TH")}</span>
          </div>
        </div>
      </div>

      <div className="rounded-md border bg-white">
        <form className="grid gap-2 border-b px-3 py-3 lg:grid-cols-[minmax(240px,1fr)_150px_150px_160px_auto]">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="text"
              name="query"
              defaultValue={query}
              placeholder="ค้นหารหัสงาน, ห้องงาน, คนขับ, รถ, PO"
              className="pl-9"
            />
          </div>
          <Input type="date" name="dateFrom" defaultValue={dateFrom} aria-label="วันที่เริ่มต้น" />
          <Input type="date" name="dateTo" defaultValue={dateTo} aria-label="วันที่สิ้นสุด" />
          <DropdownSelect name="status" value={status} options={statusOptions} ariaLabel="สถานะงาน" />
          <Button type="submit" size="sm">
            <Search className="mr-2 size-4" />
            ค้นหา
          </Button>
        </form>

        <div className="px-3 py-3">
          <div className="mb-2 flex items-center gap-2 text-xs text-muted-foreground">
            <FileSpreadsheet className="size-4" />
            <span>Export ตามข้อมูลในตาราง</span>
          </div>
          <JobReportTable
            jobs={listItems}
            filters={{
              query,
              dateFrom,
              dateTo,
              status,
            }}
          />
        </div>
      </div>
    </div>
  );
}
