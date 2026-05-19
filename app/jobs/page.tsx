import Link from "next/link";
import { Eye, History, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { JobAutoRefresh } from "@/components/jobs/job-auto-refresh";
import { JobDeleteButton } from "@/components/jobs/job-delete-button";
import { JobDriverAccessCard } from "@/components/jobs/job-driver-access-card";
import { getJobStatusLabel } from "@/lib/job-labels";
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
          <p className="mt-1 text-sm text-muted-foreground">งานขนส่งที่สร้างจาก PO จริงและสถานะล่าสุดของแต่ละงาน</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline" size="sm" className="w-full sm:w-auto">
            <Link href="/jobs/history">
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
        <CardHeader>
          <CardTitle className="text-sm">งานทั้งหมด</CardTitle>
          <CardDescription>เปิดหน้าติดตามหรือลิงก์เข้าห้องคนขับของแต่ละงานได้จากตารางนี้</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {jobs.length ? (
            <div className="overflow-hidden rounded-b-lg">
              <div className="hidden overflow-x-auto md:block">
                <table className="w-full min-w-[980px]">
                  <thead className="border-y border-[#f0f2f5] bg-[#fafbfc] text-left">
                    <tr>
                      <th className="w-56 whitespace-nowrap px-4 py-3 text-[11px] font-semibold text-slate-400">ห้องงาน</th>
                      <th className="px-4 py-3 text-[11px] font-semibold text-slate-400">เส้นทาง / PO</th>
                      <th className="w-40 whitespace-nowrap px-4 py-3 text-[11px] font-semibold text-slate-400">คนขับ</th>
                      <th className="w-28 whitespace-nowrap px-4 py-3 text-[11px] font-semibold uppercase tracking-wide text-slate-400">ขึ้นรถ</th>
                      <th className="w-28 whitespace-nowrap px-4 py-3 text-[11px] font-semibold uppercase tracking-wide text-slate-400">ส่งแล้ว</th>
                      <th className="w-32 whitespace-nowrap px-4 py-3 text-[11px] font-semibold text-slate-400">สถานะ</th>
                      <th className="w-44 whitespace-nowrap px-4 py-3 text-[11px] font-semibold text-slate-400">จัดการ</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#f5f6f8]">
                    {jobs.map((job) => (
                      <tr key={job.id} className="hover:bg-[#fafbfc]">
                        <td className="px-4 py-3 align-top font-semibold text-slate-900">
                          <span className="block max-w-64 break-words text-[12.5px]">{job.roomName?.trim() || job.id}</span>
                          <span className="mt-0.5 block text-[11px] font-normal text-slate-400">{job.id}</span>
                        </td>
                        <td className="break-words px-4 py-3 align-top text-[12.5px]">
                          {job.route}
                          <br />
                          <span className="text-[11px] text-slate-400">
                            {Array.from(new Set(job.items.map((item) => item.poSapNo))).join(", ")}
                          </span>
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 align-top text-[12.5px]">
                          {job.driver || "-"}
                          <br />
                          <span className="text-[11px] text-slate-400">{job.vehicle || "-"}</span>
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 align-top text-[12.5px] font-semibold">
                          {job.loadedTotal}/{job.requiredTotal}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 align-top text-[12.5px] font-semibold">
                          {job.deliveredTotal}/{job.requiredTotal}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 align-top">
                          <Badge variant={job.status === "completed" ? "success" : job.status === "ready" ? "secondary" : "warning"}>
                            {getJobStatusLabel(job.status)}
                          </Badge>
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 align-top">
                          <div className="space-y-1.5">
                            <Button asChild variant="outline" size="sm" className="h-7 text-xs">
                              <Link href={`/jobs/monitor?jobId=${encodeURIComponent(job.id)}`}>
                                <Eye className="mr-1.5 h-3.5 w-3.5" />
                                ติดตามงาน
                              </Link>
                            </Button>
                            <JobDriverAccessCard jobId={job.id} driver={job.driver} vehicle={job.vehicle} compact />
                            <JobDeleteButton jobId={job.id} />
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="divide-y md:hidden">
                {jobs.map((job) => (
                  <div key={job.id} className="space-y-3 p-4 text-sm">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="break-words font-semibold text-slate-950">{job.roomName?.trim() || job.id}</p>
                        <p className="mt-0.5 break-all text-xs text-muted-foreground">{job.id}</p>
                      </div>
                      <Badge variant={job.status === "completed" ? "success" : job.status === "ready" ? "secondary" : "warning"} className="shrink-0">
                        {getJobStatusLabel(job.status)}
                      </Badge>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">เส้นทาง / PO</p>
                      <p className="break-words">{job.route}</p>
                      <p className="mt-0.5 break-words text-xs text-muted-foreground">
                        {Array.from(new Set(job.items.map((item) => item.poSapNo))).join(", ")}
                      </p>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <p className="text-xs text-muted-foreground">คนขับ</p>
                        <p className="break-words">{job.driver || "-"}</p>
                        <p className="text-xs text-muted-foreground">{job.vehicle || "-"}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">ความคืบหน้า</p>
                        <p>ขึ้นรถ {job.loadedTotal}/{job.requiredTotal} รอบ</p>
                        <p>ส่งแล้ว {job.deliveredTotal}/{job.requiredTotal} รอบ</p>
                      </div>
                    </div>
                    <div className="flex flex-col gap-2">
                      <Button asChild variant="outline" size="sm" className="w-full">
                        <Link href={`/jobs/monitor?jobId=${encodeURIComponent(job.id)}`}>
                          <Eye className="mr-2 h-4 w-4" />
                          ติดตามงาน
                        </Link>
                      </Button>
                      <JobDriverAccessCard jobId={job.id} driver={job.driver} vehicle={job.vehicle} compact />
                      <JobDeleteButton jobId={job.id} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="rounded-lg border bg-slate-50 p-6 text-sm text-muted-foreground dark:bg-slate-900">
              ยังไม่มีงานที่ถูกสร้างจากข้อมูลจริง เริ่มจากหน้า PO รอจัดส่งก่อน
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
