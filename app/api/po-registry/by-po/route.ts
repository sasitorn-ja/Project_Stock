import { NextResponse } from "next/server";
import { getPORecordsByPoSapNos } from "@/lib/po-registry-store";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { poSapNos?: string[] };
    const poSapNos = Array.isArray(body.poSapNos) ? body.poSapNos : [];
    const records = await getPORecordsByPoSapNos(poSapNos);

    return NextResponse.json({ records });
  } catch (error) {
    const message = error instanceof Error ? error.message : "โหลดรายการของ PO เดียวกันไม่สำเร็จ";
    return NextResponse.json({ error: message }, { status: 503 });
  }
}
