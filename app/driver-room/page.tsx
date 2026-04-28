import { DriverScanner } from "@/components/jobs/driver-scanner";

export default async function DriverRoomPage({
  searchParams,
}: {
  searchParams: Promise<{ jobId?: string }>;
}) {
  const { jobId } = await searchParams;

  return <DriverScanner initialJobId={jobId} />;
}
