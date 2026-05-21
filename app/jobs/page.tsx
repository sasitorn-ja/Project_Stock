import Link from "next/link";
import { History, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { JobAutoRefresh } from "@/components/jobs/job-auto-refresh";
import { JobListTable } from "@/components/jobs/job-list-table";
import { listJobs } from "@/lib/job-store";

export const dynamic = "force-dynamic";

export default async function JobsPage() {
  const jobs = await listJobs();

  return (
    <div className="space-y-6">
      <JobAutoRefresh />

      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
        <div className="min-w-0">
          <h2 className="text-xl font-bold tracking-tight text-slate-900">รายการงาน</h2>
          <p className="mt-1 text-sm text-muted-foreground">งานขนส่งที่กำลังเปิดอยู่และสถานะล่าสุด</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline" size="sm" className="w-full sm:w-auto">
            <Link href="/reports?status=archived">
              <History className="mr-2 h-3.5 w-3.5" />
              ประวัติงาน
            </Link>
          </Button>
          <Button asChild size="sm" className="w-full sm:w-auto">
            <Link href="/po">
              <Plus className="mr-2 h-3.5 w-3.5" />
              เลือก PO เพื่อสร้างงาน
            </Link>
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle className="text-sm">งานที่เปิดอยู่</CardTitle>
            <CardDescription>เปิดหน้าติดตาม ลิงก์ห้องคนขับ หรือจัดการงานจากตารางนี้</CardDescription>
          </div>
          <div className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
            {jobs.length.toLocaleString("th-TH")} งาน
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <JobListTable jobs={jobs} />
        </CardContent>
      </Card>
    </div>
  );
}
