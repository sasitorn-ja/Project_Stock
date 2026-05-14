import { NextResponse } from "next/server";
import {
  clearPORegistry,
  deletePORecords,
  getPORecordsPage,
  saveNewPORecords,
} from "@/lib/po-registry-store";
import { type NewPORegistryRecord } from "@/lib/po-registry";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const page = Number(searchParams.get("page") ?? "1");
    const pageSize = Number(searchParams.get("pageSize") ?? "20");
    const query = searchParams.get("query") ?? "";

    const result = await getPORecordsPage({
      page: Number.isFinite(page) ? page : 1,
      pageSize: Number.isFinite(pageSize) ? pageSize : 20,
      query,
    });

    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "โหลดข้อมูล PO ไม่สำเร็จ";
    return NextResponse.json({ error: message }, { status: 503 });
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { records?: NewPORegistryRecord[] };
    const records = Array.isArray(body.records) ? body.records : [];
    const savedCount = await saveNewPORecords(records);

    return NextResponse.json({ savedCount });
  } catch (error) {
    const message = error instanceof Error ? error.message : "บันทึกทะเบียน PO ไม่สำเร็จ";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function DELETE(request: Request) {
  try {
    const body = (await request.json().catch(() => null)) as { registryKeys?: unknown } | null;
    const registryKeys = Array.isArray(body?.registryKeys)
      ? body.registryKeys.filter((registryKey): registryKey is string => typeof registryKey === "string")
      : [];

    if (registryKeys.length) {
      const deletedCount = await deletePORecords(registryKeys);
      return NextResponse.json({ deletedCount });
    }

    await clearPORegistry();
    return NextResponse.json({ cleared: true, deletedCount: null });
  } catch (error) {
    const message = error instanceof Error ? error.message : "ล้างข้อมูล PO ไม่สำเร็จ";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
