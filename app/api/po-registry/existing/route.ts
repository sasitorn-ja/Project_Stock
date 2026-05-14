import { NextResponse } from "next/server";
import { getExistingPORecords } from "@/lib/po-registry-store";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { registryKeys?: string[] };
    const registryKeys = Array.isArray(body.registryKeys) ? body.registryKeys : [];
    const records = await getExistingPORecords(registryKeys);

    return NextResponse.json({ records });
  } catch (error) {
    const message = error instanceof Error ? error.message : "ตรวจสอบรายการ PO ไม่สำเร็จ";
    return NextResponse.json({ error: message }, { status: 503 });
  }
}
