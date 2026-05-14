import Link from "next/link";
import { Eye, History, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { JobDriverAccessCard } from "@/components/jobs/job-driver-access-card";
import { listJobs } from "@/lib/job-store";

export const dynamic = "force-dynamic";

export default async function JobsPage() {
  const jobs = await listJobs();

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
        <div className="min-w-0">
          <h2 className="text-xl font-bold tracking-normal sm:text-2xl">รายการ Job</h2>
          <p className="mt-1 text-sm text-muted-foreground">งานขนส่งที่สร้างจาก PO จริงและสถานะล่าสุดของแต่ละงาน</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline" className="w-full sm:w-auto">
            <Link href="/jobs/history">
              <History className="mr-2 h-4 w-4" />
              ประวัติงาน
            </Link>
          </Button>
          <Button asChild className="w-full sm:w-auto">
            <Link href="/po">
              <Plus className="mr-2 h-4 w-4" />
              เลือก PO เพื่อสร้าง Job
            </Link>
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>งานทั้งหมด</CardTitle>
          <CardDescription>เปิด monitor หรือลิงก์เข้าห้องคนขับของแต่ละ Job ได้จากตารางนี้</CardDescription>
        </CardHeader>
        <CardContent>
          {jobs.length ? (
            <div className="overflow-hidden rounded-lg border">
              <div className="hidden overflow-x-auto md:block">
                <table className="w-full min-w-[980px] text-sm">
                  <thead className="bg-slate-50 text-left text-slate-500 dark:bg-slate-900 dark:text-slate-400">
                    <tr>
                      <th className="w-56 whitespace-nowrap px-4 py-3 font-medium">ห้อง Job</th>
                      <th className="px-4 py-3 font-medium">Route / PO</th>
                      <th className="w-40 whitespace-nowrap px-4 py-3 font-medium">Driver</th>
                      <th className="w-28 whitespace-nowrap px-4 py-3 font-medium">Loaded</th>
                      <th className="w-28 whitespace-nowrap px-4 py-3 font-medium">Delivered</th>
                      <th className="w-28 whitespace-nowrap px-4 py-3 font-medium">Status</th>
                      <th className="w-44 whitespace-nowrap px-4 py-3 font-medium">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {jobs.map((job) => (
                      <tr key={job.id}>
                        <td className="px-4 py-3 align-top font-medium">
                          <span className="block max-w-64 break-words">{job.roomName?.trim() || job.id}</span>
                          <span className="mt-1 block text-xs font-normal text-muted-foreground">{job.id}</span>
                        </td>
                        <td className="break-words px-4 py-3 align-top">
                          {job.route}
                          <br />
                          <span className="text-xs text-muted-foreground">
                            {Array.from(new Set(job.items.map((item) => item.poSapNo))).join(", ")}
                          </span>
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 align-top">
                          {job.driver || "-"}
                          <br />
                          <span className="text-xs text-muted-foreground">{job.vehicle || "-"}</span>
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 align-top">
                          {job.loadedTotal}/{job.requiredTotal}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 align-top">
                          {job.deliveredTotal}/{job.requiredTotal}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 align-top">
                          <Badge variant={job.status === "completed" ? "success" : job.status === "ready" ? "secondary" : "warning"}>
                            {job.status}
                          </Badge>
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 align-top">
                          <div className="space-y-2">
                            <Button asChild variant="outline" size="sm">
                              <Link href={`/jobs/monitor?jobId=${encodeURIComponent(job.id)}`}>
                                <Eye className="mr-2 h-4 w-4" />
                                Monitor
                              </Link>
                            </Button>
                            <JobDriverAccessCard jobId={job.id} driver={job.driver} vehicle={job.vehicle} compact />
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="divide-y md:hidden">
                {jobs.map((job) => (
                  <div key={job.id} className="space-y-3 p-3 text-sm">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="break-words font-semibold text-slate-950">{job.roomName?.trim() || job.id}</p>
                        <p className="mt-0.5 break-all text-xs text-muted-foreground">{job.id}</p>
                      </div>
                      <Badge variant={job.status === "completed" ? "success" : job.status === "ready" ? "secondary" : "warning"} className="shrink-0">
                        {job.status}
                      </Badge>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Route / PO</p>
                      <p className="break-words">{job.route}</p>
                      <p className="mt-0.5 break-words text-xs text-muted-foreground">
                        {Array.from(new Set(job.items.map((item) => item.poSapNo))).join(", ")}
                      </p>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <p className="text-xs text-muted-foreground">Driver</p>
                        <p className="break-words">{job.driver || "-"}</p>
                        <p className="text-xs text-muted-foreground">{job.vehicle || "-"}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Progress</p>
                        <p>ขึ้นรถ {job.loadedTotal}/{job.requiredTotal}</p>
                        <p>ส่งแล้ว {job.deliveredTotal}/{job.requiredTotal}</p>
                      </div>
                    </div>
                    <div className="flex flex-col gap-2">
                      <Button asChild variant="outline" size="sm" className="w-full">
                        <Link href={`/jobs/monitor?jobId=${encodeURIComponent(job.id)}`}>
                          <Eye className="mr-2 h-4 w-4" />
                          Monitor
                        </Link>
                      </Button>
                      <JobDriverAccessCard jobId={job.id} driver={job.driver} vehicle={job.vehicle} compact />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="rounded-lg border bg-slate-50 p-6 text-sm text-muted-foreground dark:bg-slate-900">
              ยังไม่มี Job ที่ถูกสร้างจากข้อมูลจริง เริ่มจากหน้า PO รอจัดส่งก่อน
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
