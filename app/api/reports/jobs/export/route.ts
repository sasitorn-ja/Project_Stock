import { NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { buildJobReportExcelRows, getJobReportJobs, jobReportExcelHeaders, type JobReportStatusFilter } from "@/lib/job-reports";

export const dynamic = "force-dynamic";

function parseJobIds(searchParams: URLSearchParams) {
  return searchParams
    .getAll("jobIds")
    .flatMap((value) => value.split(","))
    .map((jobId) => jobId.trim())
    .filter(Boolean);
}

function parseStatus(value: string | null): JobReportStatusFilter {
  return value === "active" || value === "archived" ? value : "all";
}

function buildFilename() {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");

  return `job-report-${year}${month}${day}-${hours}${minutes}.xlsx`;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const jobs = await getJobReportJobs({
    query: searchParams.get("query") ?? "",
    dateFrom: searchParams.get("dateFrom") ?? "",
    dateTo: searchParams.get("dateTo") ?? "",
    status: parseStatus(searchParams.get("status")),
    jobIds: parseJobIds(searchParams),
  });
  const rows = buildJobReportExcelRows(jobs);
  const worksheet = XLSX.utils.json_to_sheet(rows, {
    header: [...jobReportExcelHeaders],
    skipHeader: false,
  });

  worksheet["!autofilter"] = {
    ref: XLSX.utils.encode_range({
      s: { r: 0, c: 0 },
      e: { r: Math.max(rows.length, 1), c: jobReportExcelHeaders.length - 1 },
    }),
  };
  worksheet["!cols"] = jobReportExcelHeaders.map((header) => ({
    wch: Math.min(Math.max(String(header).length + 4, 14), 34),
  }));

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Job Report");

  const fileBuffer = XLSX.write(workbook, {
    bookType: "xlsx",
    type: "buffer",
  }) as Buffer;
  const filename = buildFilename();
  const responseBody = new Uint8Array(fileBuffer).buffer;

  return new NextResponse(responseBody, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
      "Cache-Control": "no-store",
    },
  });
}
