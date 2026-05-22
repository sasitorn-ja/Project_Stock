import { NextResponse } from "next/server";
import { clearUnusedDestinationCheckIn } from "@/lib/job-store";

export const dynamic = "force-dynamic";

export async function POST(request: Request, context: { params: Promise<{ jobId: string }> }) {
  try {
    const { jobId } = await context.params;
    const body = (await request.json()) as {
      destinationId?: string;
      nextDestinationId?: string;
    };

    if (!body.destinationId?.trim()) {
      return NextResponse.json({ error: "ไม่พบปลายทางที่ต้องการล้างเช็กอิน" }, { status: 400 });
    }

    const response = await clearUnusedDestinationCheckIn({
      jobId,
      destinationId: body.destinationId,
      nextDestinationId: body.nextDestinationId,
    });

    return NextResponse.json(response);
  } catch (error) {
    const message = error instanceof Error ? error.message : "ล้างเช็กอินปลายทางไม่สำเร็จ";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
