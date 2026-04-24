import { NextResponse } from "next/server";
import { getExistingPORecords } from "@/lib/po-registry-store";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = (await request.json()) as { registryKeys?: string[] };
  const registryKeys = Array.isArray(body.registryKeys) ? body.registryKeys : [];
  const records = await getExistingPORecords(registryKeys);

  return NextResponse.json({ records });
}
