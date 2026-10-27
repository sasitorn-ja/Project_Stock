import { NextResponse } from "next/server";
import { checkRemoteApiAccess } from "@/lib/remote-api-auth";

export const dynamic = "force-dynamic";

// Exercises the production token policy without importing or calling storage.
async function check(request: Request) {
  const status = await checkRemoteApiAccess(request);
  const headers = { "Cache-Control": "no-store" };
  if (status !== 200) {
    return NextResponse.json({ error: status === 401 ? "Unauthorized" : "Write access disabled" }, { status, headers });
  }
  return NextResponse.json({
    ok: true,
    method: request.method,
    permissions: { read: true, write: process.env.Stock_API_WRITE_ENABLED === "true" },
    storageAccessed: false,
  }, { headers });
}

export { check as GET, check as POST, check as PUT, check as PATCH, check as DELETE };
