import Link from "next/link";
import { CalendarClock, History, Truck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { JobProgress } from "@/components/jobs/job-progress";
import { getJobArchive, listJobArchives } from "@/lib/job-store";

export default async function JobHistoryPage({
  searchParams,
}: {
  searchParams: Promise<{
    jobId?: string;
    query?: string;
    dateFrom?: string;
    dateTo?: string;
  }>;
}) {
  const { jobId, query = "", dateFrom = "", dateTo = "" } = await searchParams;
  const jobs = await listJobArchives({ query, dateFrom, dateTo });
  const fallbackJobId = jobId || jobs[0]?.id;
  const job = fallbackJobId ? await getJobArchive(fallbackJobId) : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
        <div>
          <h2 className="text-2xl font-bold tracking-normal">ประวัติงาน</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            งานที่ปิดจบแล้วจะถูกย้ายมาเก็บในประวัติ 100 วัน และไม่อยู่ในคิวปฏิบัติการหลักอีกต่อไป
          </p>
        </div>
        <Button asChild variant="outline">
          <Link href="/jobs">
            <Truck className="mr-2 h-4 w-4" />
            กลับไปงานปัจจุบัน
          </Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>ค้นหางานย้อนหลัง</CardTitle>
          <CardDescription>ค้นหาได้จาก Job ID, คนขับ, รถ, PO หรือรหัสวัสดุ พร้อมกรองช่วงวันที่ปิดงาน</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="grid gap-3 md:grid-cols-[1.4fr_0.8fr_0.8fr_auto]">
            <input
              type="text"
              name="query"
              defaultValue={query}
              placeholder="ค้นหา job id, driver, vehicle, PO, material"
              className="h-10 rounded-md border border-input bg-background px-3 text-sm"
            />
            <input
              type="date"
              name="dateFrom"
              defaultValue={dateFrom}
              className="h-10 rounded-md border border-input bg-background px-3 text-sm"
            />
            <input
              type="date"
              name="dateTo"
              defaultValue={dateTo}
              className="h-10 rounded-md border border-input bg-background px-3 text-sm"
            />
            <Button type="submit">ค้นหา</Button>
          </form>
        </CardContent>
      </Card>

      {jobs.length ? (
        <div className="flex flex-wrap gap-2">
          {jobs.map((currentJob) => (
            <Button key={currentJob.id} asChild variant={currentJob.id === fallbackJobId ? "default" : "outline"} size="sm">
              <Link
                href={`/jobs/history?jobId=${encodeURIComponent(currentJob.id)}&query=${encodeURIComponent(query)}&dateFrom=${encodeURIComponent(dateFrom)}&dateTo=${encodeURIComponent(dateTo)}`}
              >
                {currentJob.id}
              </Link>
            </Button>
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground">
            ยังไม่มีงานในประวัติย้อนหลังตามเงื่อนไขที่ค้นหา
          </CardContent>
        </Card>
      )}

      {job ? (
        <>
          <section className="grid gap-4 md:grid-cols-4">
            {[
              ["Job", job.id, Truck],
              ["สถานะ", job.status, History],
              ["Archived", new Date(job.archivedAt).toLocaleString("th-TH"), CalendarClock],
              ["ลบอัตโนมัติ", new Date(job.deleteAfterAt).toLocaleDateString("th-TH"), CalendarClock],
            ].map(([label, value, Icon]) => (
              <Card key={String(label)}>
                <CardContent className="flex items-center justify-between p-5">
                  <div>
                    <p className="text-sm text-muted-foreground">{String(label)}</p>
                    <p className="mt-2 text-sm font-semibold">{String(value)}</p>
                  </div>
                  <Icon className="h-5 w-5 text-cyan-700 dark:text-cyan-300" />
                </CardContent>
              </Card>
            ))}
          </section>

          <Card>
            <CardHeader>
              <CardTitle>ข้อมูลสรุปงาน</CardTitle>
              <CardDescription>ดูย้อนหลังจาก snapshot ของงานหลังปิดจบแล้ว</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 md:grid-cols-4">
              <div className="rounded-lg border p-4">
                <p className="text-sm text-muted-foreground">คนขับ</p>
                <p className="mt-2 font-semibold">{job.driver || "-"}</p>
              </div>
              <div className="rounded-lg border p-4">
                <p className="text-sm text-muted-foreground">รถ</p>
                <p className="mt-2 font-semibold">{job.vehicle || "-"}</p>
              </div>
              <div className="rounded-lg border p-4">
                <p className="text-sm text-muted-foreground">ต้นทาง</p>
                <p className="mt-2 font-semibold">{job.origin || "-"}</p>
              </div>
              <div className="rounded-lg border p-4">
                <p className="text-sm text-muted-foreground">GPS ต้นทางจริง</p>
                <p className="mt-2 text-sm font-semibold">{job.originGps || "-"}</p>
              </div>
            </CardContent>
          </Card>

          <section className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
            <JobProgress job={job} />
            <Card>
              <CardHeader>
                <CardTitle>Alert Queue</CardTitle>
                <CardDescription>เหตุการณ์ผิดปกติที่เกิดขึ้นระหว่างงานนี้ก่อนปิดจบ</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {job.alerts.length ? (
                  job.alerts.map((alert) => (
                    <div key={alert.id} className="rounded-lg border p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-semibold">{alert.type}</p>
                          <p className="mt-1 text-sm text-muted-foreground">{alert.message}</p>
                        </div>
                        <Badge variant={alert.severity === "สูง" ? "warning" : "secondary"}>{alert.severity}</Badge>
                      </div>
                      <p className="mt-2 text-xs text-muted-foreground">{alert.time}</p>
                    </div>
                  ))
                ) : (
                  <div className="rounded-lg border bg-slate-50 p-4 text-sm text-muted-foreground dark:bg-slate-900">
                    ไม่มี alert ในงานนี้
                  </div>
                )}
              </CardContent>
            </Card>
          </section>

          <Card>
            <CardHeader>
              <CardTitle>สรุป PO ใน Job</CardTitle>
              <CardDescription>สถานะสุดท้ายของแต่ละ PO จาก snapshot ก่อนย้ายเข้า archive</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 md:grid-cols-3">
              {job.poStatuses.map((item) => (
                <div key={item.po} className="rounded-lg border p-4">
                  <p className="font-semibold">{item.po}</p>
                  <Badge className="mt-3" variant={item.variant}>
                    {item.status}
                  </Badge>
                </div>
              ))}
            </CardContent>
          </Card>
        </>
      ) : null}
    </div>
  );
}
