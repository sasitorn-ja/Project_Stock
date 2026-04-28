import Link from "next/link";
import { Eye, Plus, QrCode } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { listJobs } from "@/lib/job-store";

export default async function JobsPage() {
  const jobs = await listJobs();

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
        <div>
          <h2 className="text-2xl font-bold tracking-normal">รายการ Job</h2>
          <p className="mt-1 text-sm text-muted-foreground">งานขนส่งที่สร้างจาก PO จริงและสถานะล่าสุดของแต่ละงาน</p>
        </div>
        <Button asChild>
          <Link href="/po">
            <Plus className="mr-2 h-4 w-4" />
            เลือก PO เพื่อสร้าง Job
          </Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>งานทั้งหมด</CardTitle>
          <CardDescription>เปิด monitor หรือลิงก์เข้าห้องคนขับของแต่ละ Job ได้จากตารางนี้</CardDescription>
        </CardHeader>
        <CardContent>
          {jobs.length ? (
            <div className="overflow-hidden rounded-lg border">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[980px] text-sm">
                  <thead className="bg-slate-50 text-left text-slate-500 dark:bg-slate-900 dark:text-slate-400">
                    <tr>
                      <th className="w-44 whitespace-nowrap px-4 py-3 font-medium">Job</th>
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
                        <td className="whitespace-nowrap px-4 py-3 align-top font-medium">{job.id}</td>
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
                          <div className="flex gap-2">
                            <Button asChild variant="outline" size="sm">
                              <Link href={`/jobs/monitor?jobId=${encodeURIComponent(job.id)}`}>
                                <Eye className="mr-2 h-4 w-4" />
                                Monitor
                              </Link>
                            </Button>
                            <Button asChild variant="outline" size="sm">
                              <Link href={`/driver-room?jobId=${encodeURIComponent(job.id)}`}>
                                <QrCode className="mr-2 h-4 w-4" />
                                Driver
                              </Link>
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
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
