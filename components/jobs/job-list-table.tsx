"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Eye } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { JobDeleteButton } from "@/components/jobs/job-delete-button";
import { JobDriverAccessCard } from "@/components/jobs/job-driver-access-card";
import { getJobStatusLabel } from "@/lib/job-labels";
import type { JobSummaryRecord } from "@/lib/jobs";

const pageSize = 8;

export function JobListTable({ jobs }: { jobs: JobSummaryRecord[] }) {
  const [page, setPage] = useState(1);
  const totalPages = Math.max(1, Math.ceil(jobs.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const startIndex = (currentPage - 1) * pageSize;
  const visibleJobs = useMemo(() => jobs.slice(startIndex, startIndex + pageSize), [jobs, startIndex]);

  if (!jobs.length) {
    return (
      <div className="m-3 rounded-md border border-dashed bg-slate-50 px-4 py-5 text-center text-sm text-muted-foreground dark:bg-slate-900">
        ยังไม่มีงานเปิดอยู่
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-md">
      <div className="hidden max-h-[calc(100vh-230px)] overflow-auto md:block">
        <table className="w-full min-w-[980px]">
          <thead className="sticky top-0 z-10 border-y border-[#f0f2f5] bg-[#fafbfc] text-left">
            <tr>
              <th className="w-56 whitespace-nowrap px-3 py-2 text-[11px] font-semibold text-slate-400">ห้องงาน</th>
              <th className="px-3 py-2 text-[11px] font-semibold text-slate-400">เส้นทาง / PO</th>
              <th className="w-40 whitespace-nowrap px-3 py-2 text-[11px] font-semibold text-slate-400">คนขับ</th>
              <th className="w-28 whitespace-nowrap px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">ขึ้นรถ</th>
              <th className="w-28 whitespace-nowrap px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">ส่งแล้ว</th>
              <th className="w-32 whitespace-nowrap px-3 py-2 text-[11px] font-semibold text-slate-400">สถานะ</th>
              <th className="w-44 whitespace-nowrap px-3 py-2 text-[11px] font-semibold text-slate-400">จัดการ</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#f5f6f8]">
            {visibleJobs.map((job) => (
              <tr key={job.id} className="hover:bg-[#fafbfc]">
                <td className="px-3 py-2 align-top font-semibold text-slate-900">
                  <span className="block max-w-64 break-words text-[12.5px]">{job.roomName?.trim() || job.id}</span>
                  <span className="mt-0.5 block text-[11px] font-normal text-slate-400">{job.id}</span>
                </td>
                <td className="break-words px-3 py-2 align-top text-[12.5px]">
                  {job.route}
                  <br />
                  <span className="text-[11px] text-slate-400">
                    {Array.from(new Set(job.items.map((item) => item.poSapNo))).join(", ")}
                  </span>
                </td>
                <td className="whitespace-nowrap px-3 py-2 align-top text-[12.5px]">
                  {job.driver || "-"}
                  <br />
                  <span className="text-[11px] text-slate-400">{job.vehicle || "-"}</span>
                </td>
                <td className="whitespace-nowrap px-3 py-2 align-top text-[12.5px] font-semibold">
                  {job.loadedTotal}/{job.requiredTotal}
                </td>
                <td className="whitespace-nowrap px-3 py-2 align-top text-[12.5px] font-semibold">
                  {job.deliveredTotal}/{job.requiredTotal}
                </td>
                <td className="whitespace-nowrap px-3 py-2 align-top">
                  <Badge variant={job.status === "completed" ? "success" : job.status === "ready" ? "secondary" : "warning"}>
                    {getJobStatusLabel(job.status)}
                  </Badge>
                </td>
                <td className="whitespace-nowrap px-3 py-2 align-top">
                  <div className="space-y-1.5">
                    <Button asChild variant="outline" size="sm" className="h-7 text-xs">
                      <Link href={`/jobs/monitor?jobId=${encodeURIComponent(job.id)}`}>
                        <Eye className="mr-1.5 h-3.5 w-3.5" />
                        ติดตามงาน
                      </Link>
                    </Button>
                    <JobDriverAccessCard jobId={job.id} driver={job.driver} vehicle={job.vehicle} compact />
                    <JobDeleteButton jobId={job.id} />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="max-h-[calc(100vh-230px)] divide-y overflow-y-auto md:hidden">
        {visibleJobs.map((job) => (
          <div key={job.id} className="space-y-3 p-3 text-sm">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="break-words font-semibold text-slate-950">{job.roomName?.trim() || job.id}</p>
                <p className="mt-0.5 break-all text-xs text-muted-foreground">{job.id}</p>
              </div>
              <Badge variant={job.status === "completed" ? "success" : job.status === "ready" ? "secondary" : "warning"} className="shrink-0">
                {getJobStatusLabel(job.status)}
              </Badge>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">เส้นทาง / PO</p>
              <p className="break-words">{job.route}</p>
              <p className="mt-0.5 break-words text-xs text-muted-foreground">
                {Array.from(new Set(job.items.map((item) => item.poSapNo))).join(", ")}
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <p className="text-xs text-muted-foreground">คนขับ</p>
                <p className="break-words">{job.driver || "-"}</p>
                <p className="text-xs text-muted-foreground">{job.vehicle || "-"}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">ความคืบหน้า</p>
                <p>ขึ้นรถ {job.loadedTotal}/{job.requiredTotal} รอบ</p>
                <p>ส่งแล้ว {job.deliveredTotal}/{job.requiredTotal} รอบ</p>
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <Button asChild variant="outline" size="sm" className="w-full">
                <Link href={`/jobs/monitor?jobId=${encodeURIComponent(job.id)}`}>
                  <Eye className="mr-2 h-4 w-4" />
                  ติดตามงาน
                </Link>
              </Button>
              <JobDriverAccessCard jobId={job.id} driver={job.driver} vehicle={job.vehicle} compact />
              <JobDeleteButton jobId={job.id} />
            </div>
          </div>
        ))}
      </div>
      {jobs.length > pageSize ? (
        <div className="flex flex-col gap-3 border-t px-3 py-3 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <p>
            แสดง {startIndex + 1}-{Math.min(startIndex + pageSize, jobs.length)} จาก{" "}
            {jobs.length.toLocaleString("th-TH")} งาน
          </p>
          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={currentPage === 1}>
              <ChevronLeft className="mr-1 h-4 w-4" />
              ก่อนหน้า
            </Button>
            <span className="min-w-20 text-center">
              หน้า {currentPage} / {totalPages}
            </span>
            <Button type="button" variant="outline" size="sm" onClick={() => setPage((current) => Math.min(totalPages, current + 1))} disabled={currentPage === totalPages}>
              ถัดไป
              <ChevronRight className="ml-1 h-4 w-4" />
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
