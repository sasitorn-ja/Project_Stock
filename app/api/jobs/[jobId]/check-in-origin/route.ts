import { NextResponse } from "next/server";
import { checkInJobOrigin } from "@/lib/job-store";

export const dynamic = "force-dynamic";

export async function POST(request: Request, context: { params: Promise<{ jobId: string }> }) {
  try {
    const { jobId } = await context.params;
    const body = (await request.json()) as {
      latitude?: number;
      longitude?: number;
      accuracy?: number;
    };

    if (!Number.isFinite(body.latitude) || !Number.isFinite(body.longitude)) {
      return NextResponse.json({ error: "พิกัด GPS ไม่ถูกต้อง" }, { status: 400 });
    }

    const job = await checkInJobOrigin({
      jobId,
      latitude: body.latitude,
      longitude: body.longitude,
      accuracy: body.accuracy,
    });

    return NextResponse.json({ job });
  } catch (error) {
    const message = error instanceof Error ? error.message : "บันทึก GPS ต้นทางไม่สำเร็จ";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
