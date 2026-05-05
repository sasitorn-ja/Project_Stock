import { NextResponse } from "next/server";
import { getStorageStatus } from "@/lib/storage-config";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(getStorageStatus());
}
