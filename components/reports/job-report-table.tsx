"use client";

import { Download, FileSpreadsheet } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export type JobReportListItem = {
  id: string;
  reportKind: "active" | "archived";
  roomName: string;
  statusLabel: string;
  driver: string;
  vehicle: string;
  eventDate: string;
  createdAt: string;
  completedAt: string;
  archivedAt: string;
  requiredTotal: number;
  loadedTotal: number;
  deliveredTotal: number;
  itemCount: number;
  destinationCount: number;
};

export type JobReportTableFilters = {
  query: string;
  dateFrom: string;
  dateTo: string;
  status: string;
};

function buildExportUrl(filters: JobReportTableFilters, jobIds: string[] = []) {
  const searchParams = new URLSearchParams();

  if (filters.query) {
    searchParams.set("query", filters.query);
  }
  if (filters.dateFrom) {
    searchParams.set("dateFrom", filters.dateFrom);
  }
  if (filters.dateTo) {
    searchParams.set("dateTo", filters.dateTo);
  }
  if (filters.status && filters.status !== "all") {
    searchParams.set("status", filters.status);
  }
  jobIds.forEach((jobId) => searchParams.append("jobIds", jobId));

  return `/api/reports/jobs/export?${searchParams.toString()}`;
}

export function JobReportTable({
  jobs,
  filters,
}: {
  jobs: JobReportListItem[];
  filters: JobReportTableFilters;
}) {
  const [selectedJobIds, setSelectedJobIds] = useState<string[]>([]);
  const selectedJobIdSet = useMemo(() => new Set(selectedJobIds), [selectedJobIds]);
  const allVisibleSelected = jobs.length > 0 && jobs.every((job) => selectedJobIdSet.has(job.id));

  function toggleJob(jobId: string) {
    setSelectedJobIds((current) =>
      current.includes(jobId) ? current.filter((currentJobId) => currentJobId !== jobId) : [...current, jobId],
    );
  }

  function toggleAllVisible() {
    setSelectedJobIds(allVisibleSelected ? [] : jobs.map((job) => job.id));
  }

  function downloadFiltered() {
    window.location.href = buildExportUrl(filters);
  }

  function downloadSelected() {
    if (!selectedJobIds.length) {
      return;
    }

    window.location.href = buildExportUrl(filters, selectedJobIds);
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div className="text-sm text-muted-foreground">
          พบ <span className="font-semibold text-slate-950">{jobs.length.toLocaleString("th-TH")}</span> งาน / เลือก{" "}
          <span className="font-semibold text-slate-950">{selectedJobIds.length.toLocaleString("th-TH")}</span> งาน
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
          <Button type="button" variant="outline" size="sm" onClick={downloadSelected} disabled={!selectedJobIds.length}>
            <Download className="mr-2 size-4" />
            Export ที่เลือก
          </Button>
          <Button type="button" size="sm" onClick={downloadFiltered} disabled={!jobs.length}>
            <FileSpreadsheet className="mr-2 size-4" />
            Export ตามผลกรอง
          </Button>
        </div>
      </div>

      {!jobs.length ? (
        <div className="rounded-md border border-dashed border-slate-300 bg-slate-50 px-4 py-5 text-center text-sm text-muted-foreground">
          ไม่พบงานตามเงื่อนไขที่เลือก
        </div>
      ) : (
        <>
          <div className="hidden overflow-hidden rounded-md border md:block">
            <div className="max-h-[calc(100vh-260px)] min-h-64 overflow-auto">
              <table className="w-full min-w-[980px] text-[13px]">
                <thead className="sticky top-0 z-10 border-b bg-slate-50 text-left text-xs font-semibold text-slate-500">
                  <tr>
                    <th className="w-10 px-3 py-2">
                      <input
                        type="checkbox"
                        aria-label="เลือกงานทั้งหมดที่แสดง"
                        checked={allVisibleSelected}
                        onChange={toggleAllVisible}
                        className="size-4 rounded border-slate-300"
                      />
                    </th>
                    <th className="w-48 px-3 py-2">งาน</th>
                    <th className="w-28 px-3 py-2">ประเภท</th>
                    <th className="w-36 px-3 py-2">วันที่อ้างอิง</th>
                    <th className="w-40 px-3 py-2">คนขับ / รถ</th>
                    <th className="w-32 px-3 py-2">สถานะ</th>
                    <th className="w-36 px-3 py-2 text-right">ความคืบหน้า</th>
                    <th className="w-28 px-3 py-2 text-right">รายการ</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {jobs.map((job) => (
                    <tr key={job.id} className="hover:bg-slate-50">
                      <td className="px-3 py-2 align-top">
                        <input
                          type="checkbox"
                          aria-label={`เลือก ${job.roomName}`}
                          checked={selectedJobIdSet.has(job.id)}
                          onChange={() => toggleJob(job.id)}
                          className="size-4 rounded border-slate-300"
                        />
                      </td>
                      <td className="px-3 py-2 align-top">
                        <p className="break-words font-semibold text-slate-950">{job.roomName}</p>
                        <p className="mt-0.5 break-all text-xs text-muted-foreground">{job.id}</p>
                      </td>
                      <td className="px-3 py-2 align-top">
                        <Badge variant={job.reportKind === "archived" ? "success" : "warning"}>
                          {job.reportKind === "archived" ? "งานปิดแล้ว" : "งานเปิดอยู่"}
                        </Badge>
                      </td>
                      <td className="px-3 py-2 align-top">
                        <p>{job.eventDate || "-"}</p>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {job.reportKind === "archived" ? "วันที่ปิดงาน" : "วันที่สร้างงาน"}
                        </p>
                      </td>
                      <td className="px-3 py-2 align-top">
                        <p className="break-words">{job.driver || "-"}</p>
                        <p className="mt-0.5 text-xs text-muted-foreground">{job.vehicle || "-"}</p>
                      </td>
                      <td className="px-3 py-2 align-top">{job.statusLabel}</td>
                      <td className="px-3 py-2 text-right align-top">
                        <p>ขึ้นรถ {job.loadedTotal}/{job.requiredTotal}</p>
                        <p className="mt-0.5 text-xs text-muted-foreground">ส่งแล้ว {job.deliveredTotal}/{job.requiredTotal}</p>
                      </td>
                      <td className="px-3 py-2 text-right align-top">
                        <p>{job.itemCount.toLocaleString("th-TH")} รายการ</p>
                        <p className="mt-0.5 text-xs text-muted-foreground">{job.destinationCount.toLocaleString("th-TH")} ปลายทาง</p>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="max-h-[calc(100vh-250px)] divide-y overflow-y-auto rounded-md border md:hidden">
            {jobs.map((job) => (
              <div key={job.id} className="space-y-3 p-3 text-sm">
                <div className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    aria-label={`เลือก ${job.roomName}`}
                    checked={selectedJobIdSet.has(job.id)}
                    onChange={() => toggleJob(job.id)}
                    className="mt-1 size-4 rounded border-slate-300"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="break-words font-semibold text-slate-950">{job.roomName}</p>
                      <Badge variant={job.reportKind === "archived" ? "success" : "warning"}>
                        {job.reportKind === "archived" ? "ปิดแล้ว" : "เปิดอยู่"}
                      </Badge>
                    </div>
                    <p className="mt-0.5 break-all text-xs text-muted-foreground">{job.id}</p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="rounded-md bg-slate-50 px-3 py-2">
                    <p className="text-muted-foreground">วันที่อ้างอิง</p>
                    <p className="mt-1 font-semibold text-slate-950">{job.eventDate || "-"}</p>
                  </div>
                  <div className="rounded-md bg-slate-50 px-3 py-2">
                    <p className="text-muted-foreground">สถานะ</p>
                    <p className="mt-1 font-semibold text-slate-950">{job.statusLabel}</p>
                  </div>
                  <div className="rounded-md bg-slate-50 px-3 py-2">
                    <p className="text-muted-foreground">คนขับ / รถ</p>
                    <p className="mt-1 font-semibold text-slate-950">{job.driver || "-"} / {job.vehicle || "-"}</p>
                  </div>
                  <div className="rounded-md bg-slate-50 px-3 py-2">
                    <p className="text-muted-foreground">ส่งแล้ว</p>
                    <p className="mt-1 font-semibold text-slate-950">{job.deliveredTotal}/{job.requiredTotal}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
