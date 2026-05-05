import { NextResponse } from "next/server";
import { getJobArchive } from "@/lib/job-store";

export const dynamic = "force-dynamic";

export async function GET(_: Request, context: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await context.params;
  const job = await getJobArchive(jobId);

  if (!job) {
    return NextResponse.json({ job: null }, { status: 404 });
  }

  return NextResponse.json({ job });
}
