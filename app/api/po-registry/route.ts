import { NextResponse } from "next/server";
import {
  clearPORegistry,
  getPORecordsPage,
  saveNewPORecords,
} from "@/lib/po-registry-store";
import { type NewPORegistryRecord } from "@/lib/po-registry";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
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
}

export async function POST(request: Request) {
  const body = (await request.json()) as { records?: NewPORegistryRecord[] };
  const records = Array.isArray(body.records) ? body.records : [];
  const savedCount = await saveNewPORecords(records);

  return NextResponse.json({ savedCount });
}

export async function DELETE() {
  await clearPORegistry();
  return NextResponse.json({ cleared: true });
}
