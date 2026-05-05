import { NextResponse } from "next/server";
import { checkInJobDestination } from "@/lib/job-store";

export const dynamic = "force-dynamic";

export async function POST(request: Request, context: { params: Promise<{ jobId: string }> }) {
  try {
    const { jobId } = await context.params;
    const body = (await request.json()) as {
      destinationId?: string;
      latitude?: number;
      longitude?: number;
      accuracy?: number;
    };

    if (!body.destinationId?.trim()) {
      return NextResponse.json({ error: "กรุณาเลือกปลายทางก่อนเช็กอิน GPS" }, { status: 400 });
    }

    if (!Number.isFinite(body.latitude) || !Number.isFinite(body.longitude)) {
      return NextResponse.json({ error: "พิกัด GPS ไม่ถูกต้อง" }, { status: 400 });
    }

    const latitude = Number(body.latitude);
    const longitude = Number(body.longitude);

    const job = await checkInJobDestination({
      jobId,
      destinationId: body.destinationId,
      latitude,
      longitude,
      accuracy: body.accuracy,
    });

    return NextResponse.json({ job });
  } catch (error) {
    const message = error instanceof Error ? error.message : "บันทึก GPS ปลายทางไม่สำเร็จ";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
