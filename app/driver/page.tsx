import { DriverScanner } from "@/components/jobs/driver-scanner";
import { PageHeading } from "@/components/layout/page-heading";

export default async function DriverPage({
  searchParams,
}: {
  searchParams: Promise<{ jobId?: string }>;
}) {
  const { jobId } = await searchParams;
  const isDedicatedDriverMode = Boolean(jobId);

  return (
    <div className={isDedicatedDriverMode ? "" : "mx-auto max-w-6xl space-y-5"}>
      {!isDedicatedDriverMode ? (
        <PageHeading title="ห้องคนขับ" description="เลือกงาน บันทึกขึ้นรถ และยืนยันส่งของให้ครบทุกปลายทาง" />
      ) : null}
      <DriverScanner initialJobId={jobId} />
    </div>
  );
}
