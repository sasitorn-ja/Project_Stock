import Link from "next/link";
import { History, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { JobAutoRefresh } from "@/components/jobs/job-auto-refresh";
import { JobListTable } from "@/components/jobs/job-list-table";
import { listJobs } from "@/lib/job-store";

export const dynamic = "force-dynamic";

export default async function JobsPage() {
  const jobs = await listJobs();

  return (
    <div className="space-y-3">
      <JobAutoRefresh />

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-lg font-bold tracking-normal text-slate-900">รายการงาน</h2>
          <span className="flex h-8 items-center rounded-md border bg-white px-3 text-xs font-semibold text-slate-700">
            {jobs.length.toLocaleString("th-TH")} งาน
          </span>
        </div>
        <div className="flex flex-wrap gap-2 lg:justify-end">
          <Button asChild variant="outline" size="sm" className="w-full sm:w-auto">
            <Link href="/reports?status=archived">
              <History className="mr-2 h-3.5 w-3.5" />
              ประวัติงาน
            </Link>
          </Button>
          <Button asChild size="sm" className="w-full sm:w-auto">
            <Link href="/po">
              <Plus className="mr-2 h-3.5 w-3.5" />
              สร้างงาน
            </Link>
          </Button>
        </div>
      </div>

      <div className="rounded-md border bg-white">
        <JobListTable jobs={jobs} />
      </div>
    </div>
  );
}
