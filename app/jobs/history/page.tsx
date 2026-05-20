import { CalendarClock, History, Truck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { JobAlertList } from "@/components/jobs/job-alert-list";
import { JobHistorySelector } from "@/components/jobs/job-history-selector";
import { JobProgress } from "@/components/jobs/job-progress";
import { getJobStatusLabel } from "@/lib/job-labels";
import { getJobArchive, listJobArchives } from "@/lib/job-store";

export const dynamic = "force-dynamic";

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
  const selectedJobId = jobId ?? null;
  const job = selectedJobId ? await getJobArchive(selectedJobId) : null;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold tracking-normal">ประวัติงาน</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          งานที่ปิดจบแล้วจะถูกย้ายมาเก็บในประวัติ 100 วัน และไม่อยู่ในคิวปฏิบัติการหลักอีกต่อไป
        </p>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">ค้นหาและเลือกงานย้อนหลัง</CardTitle>
          <CardDescription>ค้นหาได้จากรหัสงาน คนขับ รถ PO หรือรหัสวัสดุ แล้วเลือกงานจากรายการแบบ dropdown</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <form className="grid gap-2 lg:grid-cols-[minmax(260px,1fr)_180px_180px_auto]">
            <input
              type="text"
              name="query"
              defaultValue={query}
              placeholder="ค้นหารหัสงาน, คนขับ, รถ, PO, รหัสวัสดุ"
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
            />
            <input
              type="date"
              name="dateFrom"
              defaultValue={dateFrom}
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
            />
            <input
              type="date"
              name="dateTo"
              defaultValue={dateTo}
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
            />
            <Button type="submit" size="sm">ค้นหา</Button>
          </form>
          <JobHistorySelector
            jobs={jobs}
            selectedJobId={selectedJobId}
            query={query}
            dateFrom={dateFrom}
            dateTo={dateTo}
          />
        </CardContent>
      </Card>

      {!selectedJobId && (
        <div className="rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-muted-foreground">
          เลือกงานจากรายการด้านบนเพื่อดูรายละเอียด
        </div>
      )}

      {job && selectedJobId ? (
        <>
          <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {[
              ["ห้องงาน", job.roomName?.trim() || job.id, Truck],
              ["สถานะ", getJobStatusLabel(job.status), History],
              ["เก็บเข้าประวัติ", new Date(job.archivedAt).toLocaleString("th-TH"), CalendarClock],
              ["ลบอัตโนมัติ", new Date(job.deleteAfterAt).toLocaleDateString("th-TH"), CalendarClock],
            ].map(([label, value, Icon]) => (
              <Card key={String(label)}>
                <CardContent className="flex min-h-20 items-center justify-between gap-3 p-4">
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
              <CardDescription>ดูย้อนหลังจากข้อมูลของงานหลังปิดจบแล้ว</CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <div className="rounded-md border p-4">
                <p className="text-sm text-muted-foreground">คนขับ</p>
                <p className="mt-2 font-semibold">{job.driver || "-"}</p>
              </div>
              <div className="rounded-md border p-4">
                <p className="text-sm text-muted-foreground">รถ</p>
                <p className="mt-2 font-semibold">{job.vehicle || "-"}</p>
              </div>
              <div className="rounded-md border p-4">
                <p className="text-sm text-muted-foreground">ต้นทาง</p>
                <p className="mt-2 font-semibold">{job.origin || "-"}</p>
              </div>
              <div className="rounded-md border p-4">
                <p className="text-sm text-muted-foreground">GPS ต้นทางจริง</p>
                <p className="mt-2 text-sm font-semibold">{job.originGps || "-"}</p>
              </div>
            </CardContent>
          </Card>

          <section className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
            <JobProgress job={job} />
            <Card>
              <JobAlertList
                alerts={job.alerts}
                description="บันทึกเหตุการณ์ระหว่างงาน ทั้งสแกนผ่าน คำเตือน และความผิดปกติ"
              />
            </Card>
          </section>

          <Card>
            <CardHeader>
              <CardTitle>สรุป PO ในงาน</CardTitle>
              <CardDescription>สถานะสุดท้ายของแต่ละ PO จากข้อมูลก่อนย้ายเข้าประวัติ</CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-3 md:grid-cols-3">
              {job.poStatuses.map((item) => (
                <div key={item.po} className="rounded-md border p-4">
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
