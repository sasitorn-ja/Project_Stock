import { NextResponse } from "next/server";
import { getPORegistryCount } from "@/lib/po-registry-store";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const count = await getPORegistryCount();
    return NextResponse.json({ count });
  } catch (error) {
    const message = error instanceof Error ? error.message : "นับข้อมูล PO ไม่สำเร็จ";
    return NextResponse.json({ error: message }, { status: 503 });
  }
}
