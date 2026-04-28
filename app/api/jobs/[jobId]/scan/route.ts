import { NextResponse } from "next/server";
import { registerJobScan } from "@/lib/job-store";

export const dynamic = "force-dynamic";

export async function POST(request: Request, context: { params: Promise<{ jobId: string }> }) {
  try {
    const { jobId } = await context.params;
    const body = (await request.json()) as {
      code?: string;
      mode?: "load" | "deliver";
      destinationId?: string;
    };

    const response = await registerJobScan({
      jobId,
      code: body.code ?? "",
      mode: body.mode === "deliver" ? "deliver" : "load",
      destinationId: body.destinationId,
    });

    return NextResponse.json(response);
  } catch (error) {
    const message = error instanceof Error ? error.message : "บันทึกการสแกนไม่สำเร็จ";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
