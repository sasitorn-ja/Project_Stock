"use client";

import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { Check, ChevronDown } from "lucide-react";
import { useRouter } from "next/navigation";
import type { JobSummaryRecord } from "@/lib/jobs";

export function JobMonitorSelector({
  jobs,
  selectedJobId,
  compact = false,
}: {
  jobs: JobSummaryRecord[];
  selectedJobId: string | null;
  compact?: boolean;
}) {
  const router = useRouter();
  const selectedJob = jobs.find((job) => job.id === selectedJobId);

  function selectJob(jobId: string) {
    router.push(jobId ? `/jobs/monitor?jobId=${encodeURIComponent(jobId)}` : "/jobs/monitor");
  }

  return (
    <div className={compact ? "min-w-0" : "grid gap-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-center"}>
      <DropdownMenu.Root>
        <DropdownMenu.Trigger
          className={compact
            ? "flex h-8 w-full items-center justify-between gap-2 rounded-md border border-[#cfd6df] bg-white px-2.5 text-left text-xs font-medium text-slate-900 shadow-sm outline-none transition hover:bg-slate-50 focus-visible:border-slate-400 focus-visible:ring-2 focus-visible:ring-slate-900/10 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400 data-[state=open]:border-slate-400 data-[state=open]:ring-2 data-[state=open]:ring-slate-900/10"
            : "flex h-11 w-full items-center justify-between gap-3 rounded-xl border border-[#cfd6df] bg-white px-3 text-left text-sm font-medium text-slate-900 shadow-sm outline-none transition hover:bg-slate-50 focus-visible:border-slate-400 focus-visible:ring-2 focus-visible:ring-slate-900/10 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400 data-[state=open]:border-slate-400 data-[state=open]:ring-2 data-[state=open]:ring-slate-900/10"}
          disabled={!jobs.length}
        >
          <span className="min-w-0 truncate">
            {selectedJob
              ? `${selectedJob.roomName?.trim() || selectedJob.id} - รถ ${selectedJob.vehicle || "-"}`
              : jobs.length
                ? "เลือกงานที่ต้องการติดตาม"
                : "ยังไม่มีงานที่กำลังเปิด"}
          </span>
          <ChevronDown className="size-4 shrink-0 text-slate-500" />
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content
            align="start"
            sideOffset={8}
            className="z-50 max-h-80 w-[var(--radix-dropdown-menu-trigger-width)] overflow-y-auto rounded-xl border border-[#d8dde6] bg-white p-2 text-sm text-slate-900 shadow-lg shadow-slate-900/10"
          >
            {jobs.map((job) => {
              const isSelected = job.id === selectedJobId;

              return (
                <DropdownMenu.Item
                  key={job.id}
                  onSelect={() => selectJob(job.id)}
                  className="flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 outline-none transition-colors hover:bg-slate-50 focus:bg-slate-50 data-[highlighted]:bg-slate-50"
                >
                  <span className="flex size-4 shrink-0 items-center justify-center">
                    {isSelected ? <Check className="size-4 text-slate-950" /> : null}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate font-semibold">{job.roomName?.trim() || job.id}</span>
                    <span className="mt-0.5 block truncate text-xs text-slate-500">
                      รถ {job.vehicle || "-"} / คนขับ {job.driver || "-"} / {job.id}
                    </span>
                  </span>
                </DropdownMenu.Item>
              );
            })}
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
      {!compact ? (
      <div className="text-sm text-muted-foreground md:text-right">
        เปิดอยู่ <span className="font-semibold text-slate-950">{jobs.length.toLocaleString("th-TH")}</span> งาน
      </div>
      ) : null}
    </div>
  );
}
