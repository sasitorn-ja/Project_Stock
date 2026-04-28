import { DriverScanner } from "@/components/jobs/driver-scanner";

export default async function DriverPage({
  searchParams,
}: {
  searchParams: Promise<{ jobId?: string }>;
}) {
  const { jobId } = await searchParams;
  const isDedicatedDriverMode = Boolean(jobId);

  return (
    <div className={isDedicatedDriverMode ? "" : "space-y-4"}>
      {!isDedicatedDriverMode ? (
        <div className="rounded-lg border bg-white p-4 shadow-sm dark:bg-slate-950">
          <h2 className="text-xl font-bold tracking-normal">ห้องคนขับ</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            เลือก Job จริง บันทึกขึ้นรถ และยืนยันส่งของตามปลายทางเดียวกับข้อมูลในระบบ
          </p>
        </div>
      ) : null}
      <DriverScanner initialJobId={jobId} />
    </div>
  );
}
