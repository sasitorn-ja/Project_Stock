import Link from "next/link";
import { History, Plus } from "lucide-react";
import { PageHeading } from "@/components/layout/page-heading";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { JobAutoRefresh } from "@/components/jobs/job-auto-refresh";
import { JobListTable } from "@/components/jobs/job-list-table";
import { listJobs } from "@/lib/job-store";

export const dynamic = "force-dynamic";

export default async function JobsPage() {
  const jobs = await listJobs();

  return (
    <div className="space-y-5">
      <JobAutoRefresh />

      <PageHeading title="รายการงาน" description="ภาพรวมงานขนส่ง ติดตามความคืบหน้า และจัดการทุกเที่ยวส่ง" actions={<>
          <Badge variant="outline" className="border-white/25 bg-white/10 text-white">
            {jobs.length.toLocaleString("th-TH")} งาน
          </Badge>
          <Button asChild variant="outline" size="sm" className="w-full sm:w-auto">
            <Link href="/reports?status=archived">
              <History className="mr-2 h-3.5 w-3.5" />
              ประวัติงาน
            </Link>
          </Button>
          <Button asChild size="sm" className="hero-primary w-full sm:w-auto">
            <Link href="/po">
              <Plus className="mr-2 h-3.5 w-3.5" />
              สร้างงาน
            </Link>
          </Button>
      </>} />

      <div className="surface-panel data-table overflow-hidden">
        <JobListTable jobs={jobs} />
      </div>
    </div>
  );
}
