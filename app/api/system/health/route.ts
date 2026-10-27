import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// Liveness only: never connects to storage or runs schema initialization.
export async function GET() {
  return NextResponse.json({ ok: true, service: "syncdrop" }, {
    headers: { "Cache-Control": "no-store" },
  });
}
