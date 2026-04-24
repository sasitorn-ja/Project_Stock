import { NextResponse } from "next/server";
import { getPORegistryCount } from "@/lib/po-registry-store";

export const dynamic = "force-dynamic";

export async function GET() {
  const count = await getPORegistryCount();
  return NextResponse.json({ count });
}
