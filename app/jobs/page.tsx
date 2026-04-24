import Link from "next/link";
import { Eye, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { jobs } from "@/data/pages/jobs";

export default function JobsPage() {
  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
        <div>
          <h2 className="text-2xl font-bold tracking-normal">รายการ Job</h2>
          <p className="mt-1 text-sm text-muted-foreground">งานขนส่งที่สร้างจาก PO และสถานะล่าสุด</p>
        </div>
        <Button asChild>
          <Link href="/jobs/new">
            <Plus className="mr-2 h-4 w-4" />
            สร้าง Job
          </Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>งานทั้งหมด</CardTitle>
          <CardDescription>ติดตามสถานะงานและเปิด monitor ของแต่ละ Job</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-hidden rounded-lg border">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[840px] text-sm">
                <thead className="bg-slate-50 text-left text-slate-500 dark:bg-slate-900 dark:text-slate-400">
                  <tr>
                    <th className="w-44 whitespace-nowrap px-4 py-3 font-medium">Job</th>
                    <th className="px-4 py-3 font-medium">Route / PO</th>
                    <th className="w-40 whitespace-nowrap px-4 py-3 font-medium">Driver</th>
                    <th className="w-28 whitespace-nowrap px-4 py-3 font-medium">Loaded</th>
                    <th className="w-28 whitespace-nowrap px-4 py-3 font-medium">Status</th>
                    <th className="w-32 whitespace-nowrap px-4 py-3 font-medium">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {jobs.map((job) => (
                    <tr key={job.id}>
                      <td className="whitespace-nowrap px-4 py-3 align-top font-medium">{job.id}</td>
                      <td className="break-words px-4 py-3 align-top">
                        {job.route}
                        <br />
                        <span className="text-xs text-muted-foreground">PO-2026-00081, PO-2026-00082</span>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 align-top">{job.driver}</td>
                      <td className="whitespace-nowrap px-4 py-3 align-top">
                        {job.loadedTotal}/{job.requiredTotal}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 align-top">
                        <Badge variant={job.status === "closed" ? "success" : "warning"}>{job.status}</Badge>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 align-top">
                        <Button asChild variant="outline" size="sm">
                          <Link href="/jobs/monitor">
                            <Eye className="mr-2 h-4 w-4" />
                            Monitor
                          </Link>
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
