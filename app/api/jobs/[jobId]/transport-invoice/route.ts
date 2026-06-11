import { NextResponse } from "next/server";
import { ensureJobTransportDocumentNumbers } from "@/lib/job-store";
import { buildTransportInvoicePdf } from "@/lib/transport-invoice";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(_: Request, context: { params: Promise<{ jobId: string }> }) {
  try {
    const { jobId } = await context.params;
    const job = await ensureJobTransportDocumentNumbers(jobId);
    const pdfBytes = await buildTransportInvoicePdf(job);
    const filename = `transport-invoice-${job.id}.pdf`;

    return new NextResponse(pdfBytes.buffer as ArrayBuffer, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "สร้างใบกำกับขนส่งไม่สำเร็จ";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
