import { NextResponse } from "next/server";
import { listFrequentDrivers } from "@/lib/job-store";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const drivers = await listFrequentDrivers();
    return NextResponse.json({ drivers });
  } catch (error) {
    const message = error instanceof Error ? error.message : "โหลดรายชื่อคนขับไม่สำเร็จ";
    return NextResponse.json({ error: message }, { status: 503 });
  }
}
