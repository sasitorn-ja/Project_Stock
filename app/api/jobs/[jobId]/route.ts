import { NextResponse } from "next/server";
import { deleteJob, getJob, updateJobItemScanQuantity } from "@/lib/job-store";

export const dynamic = "force-dynamic";

export async function GET(_: Request, context: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await context.params;
  const job = await getJob(jobId);

  if (!job) {
    return NextResponse.json({ job: null }, { status: 404 });
  }

  return NextResponse.json({ job });
}

export async function DELETE(_: Request, context: { params: Promise<{ jobId: string }> }) {
  try {
    const { jobId } = await context.params;
    const deleted = await deleteJob(jobId);

    if (!deleted) {
      return NextResponse.json({ error: "ไม่พบ Job ที่ต้องการลบ หรือ Job นี้ปิดงานไปแล้ว" }, { status: 404 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "ลบ Job ไม่สำเร็จ";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function PATCH(request: Request, context: { params: Promise<{ jobId: string }> }) {
  try {
    const { jobId } = await context.params;
    const body = (await request.json()) as {
      registryKey?: string;
      scanQty?: number;
    };

    if (!body.registryKey?.trim()) {
      return NextResponse.json({ error: "กรุณาระบุรายการที่ต้องการแก้จำนวนสแกน" }, { status: 400 });
    }

    const job = await updateJobItemScanQuantity({
      jobId,
      registryKey: body.registryKey.trim(),
      scanQty: Number(body.scanQty),
    });

    return NextResponse.json({ job });
  } catch (error) {
    const message = error instanceof Error ? error.message : "แก้จำนวนที่ต้องสแกนไม่สำเร็จ";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
