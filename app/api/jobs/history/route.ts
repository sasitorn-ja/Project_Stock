import { NextResponse } from "next/server";
import { listJobArchives } from "@/lib/job-store";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const jobs = await listJobArchives({
    query: searchParams.get("query") ?? "",
    dateFrom: searchParams.get("dateFrom") ?? "",
    dateTo: searchParams.get("dateTo") ?? "",
  });

  return NextResponse.json({ jobs });
}
