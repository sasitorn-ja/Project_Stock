import { NextResponse } from "next/server";
import { createJob, listJobs } from "@/lib/job-store";

export const dynamic = "force-dynamic";

export async function GET() {
  const jobs = await listJobs();
  return NextResponse.json({ jobs });
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      driver?: string;
      vehicle?: string;
      origin?: string;
      note?: string;
      registryKeys?: string[];
    };

    const job = await createJob({
      driver: body.driver ?? "",
      vehicle: body.vehicle ?? "",
      origin: body.origin ?? "",
      note: body.note ?? "",
      registryKeys: Array.isArray(body.registryKeys) ? body.registryKeys : [],
    });

    return NextResponse.json({ job });
  } catch (error) {
    const message = error instanceof Error ? error.message : "สร้าง Job ไม่สำเร็จ";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
