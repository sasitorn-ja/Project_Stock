import { DriverScanner } from "@/components/jobs/driver-scanner";

export default async function DriverPage({
  searchParams,
}: {
  searchParams: Promise<{ jobId?: string }>;
}) {
  const { jobId } = await searchParams;
  const isDedicatedDriverMode = Boolean(jobId);

  return (
    <div className={isDedicatedDriverMode ? "" : "mx-auto max-w-6xl space-y-3"}>
      {!isDedicatedDriverMode ? (
        <div className="rounded-md border bg-white px-4 py-3 dark:bg-slate-950">
          <h2 className="text-lg font-bold tracking-normal">ห้องคนขับ</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            เลือก Job จริง บันทึกขึ้นรถ และยืนยันส่งของตามปลายทางเดียวกับข้อมูลในระบบ
          </p>
        </div>
      ) : null}
      <DriverScanner initialJobId={jobId} />
    </div>
  );
}
