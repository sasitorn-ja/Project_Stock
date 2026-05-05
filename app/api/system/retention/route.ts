import { NextResponse } from "next/server";
import { cleanupExpiredSharedData, hasSharedDatabase } from "@/lib/postgres-storage";

export const dynamic = "force-dynamic";

function isAuthorized(request: Request) {
  const configuredToken = process.env.RETENTION_CRON_TOKEN?.trim();

  if (!configuredToken) {
    return true;
  }

  const bearerToken = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim();
  return bearerToken === configuredToken;
}

export async function POST(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!hasSharedDatabase()) {
    return NextResponse.json(
      { error: "ระบบยังไม่ได้ตั้งค่า DATABASE_URL สำหรับ shared database" },
      { status: 503 },
    );
  }

  await cleanupExpiredSharedData();

  return NextResponse.json({
    ok: true,
    deletedAt: new Date().toISOString(),
  });
}
