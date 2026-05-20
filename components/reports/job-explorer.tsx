"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import {
  Check,
  ChevronDown,
  Download,
  FileSpreadsheet,
  Search,
} from "lucide-react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export type JobExplorerItem = {
  id: string;
  reportKind: "active" | "archived";
  roomName: string;
  statusLabel: string;
  driver: string;
  vehicle: string;
  eventDate: string;
  requiredTotal: number;
  loadedTotal: number;
  deliveredTotal: number;
  itemCount: number;
  destinationCount: number;
};

export type JobExplorerFilters = {
  query: string;
  dateFrom: string;
  dateTo: string;
  status: "all" | "active" | "archived";
};

const statusOptions: Array<{ value: JobExplorerFilters["status"]; label: string }> = [
  { value: "all", label: "ทุกสถานะงาน" },
  { value: "active", label: "งานเปิดอยู่" },
  { value: "archived", label: "งานปิดแล้ว" },
];

function buildExportUrl(filters: JobExplorerFilters, jobIds: string[] = []) {
  const searchParams = new URLSearchParams();
  if (filters.query) searchParams.set("query", filters.query);
  if (filters.dateFrom) searchParams.set("dateFrom", filters.dateFrom);
  if (filters.dateTo) searchParams.set("dateTo", filters.dateTo);
  if (filters.status && filters.status !== "all") searchParams.set("status", filters.status);
  jobIds.forEach((jobId) => searchParams.append("jobIds", jobId));
  return `/api/reports/jobs/export?${searchParams.toString()}`;
}

export function JobExplorerFilterForm({ filters }: { filters: JobExplorerFilters }) {
  const router = useRouter();
  const params = useSearchParams();

  function onStatusChange(next: JobExplorerFilters["status"]) {
    const search = new URLSearchParams(params.toString());
    if (next === "all") {
      search.delete("status");
    } else {
      search.set("status", next);
    }
    search.delete("jobId");
    router.push(`/reports/v2?${search.toString()}`);
  }

  const current = statusOptions.find((option) => option.value === filters.status) ?? statusOptions[0];

  return (
    <form
      className="grid gap-2 lg:grid-cols-[minmax(260px,1fr)_170px_170px_180px_auto]"
      method="get"
    >
      <Input
        type="text"
        name="query"
        defaultValue={filters.query}
        placeholder="ค้นหารหัสงาน, ห้องงาน, คนขับ, รถ, PO, รหัสวัสดุ"
      />
      <Input type="date" name="dateFrom" defaultValue={filters.dateFrom} />
      <Input type="date" name="dateTo" defaultValue={filters.dateTo} />

      <DropdownMenu.Root>
        <DropdownMenu.Trigger
          className="flex h-8 w-full items-center justify-between gap-2 rounded-md border border-[#dde3ea] bg-white px-3 text-left text-sm font-medium text-slate-900 outline-none transition hover:bg-white focus-visible:border-slate-400 focus-visible:ring-2 focus-visible:ring-slate-900/10 data-[state=open]:border-slate-400 data-[state=open]:ring-2 data-[state=open]:ring-slate-900/10"
        >
          <span className="min-w-0 truncate">{current.label}</span>
          <ChevronDown className="size-4 shrink-0 text-slate-500" />
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content
            align="start"
            sideOffset={6}
            className="z-50 w-[var(--radix-dropdown-menu-trigger-width)] rounded-xl border border-[#d8dde6] bg-white p-2 text-sm text-slate-900 shadow-lg shadow-slate-900/10"
          >
            {statusOptions.map((option) => {
              const isSelected = option.value === filters.status;
              return (
                <DropdownMenu.Item
                  key={option.value}
                  onSelect={() => onStatusChange(option.value)}
                  className="flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 outline-none transition-colors hover:bg-slate-50 focus:bg-slate-50 data-[highlighted]:bg-slate-50"
                >
                  <span className="flex size-4 shrink-0 items-center justify-center">
                    {isSelected ? <Check className="size-4 text-slate-950" /> : null}
                  </span>
                  <span className="min-w-0 truncate">{option.label}</span>
                </DropdownMenu.Item>
              );
            })}
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
      {/* keep current status value when submitting via Enter */}
      <input type="hidden" name="status" value={filters.status} />

      <Button type="submit" size="sm">
        <Search className="mr-2 size-4" />
        ค้นหา
      </Button>
    </form>
  );
}

export function JobExplorerList({
  jobs,
  filters,
  selectedJobId,
}: {
  jobs: JobExplorerItem[];
  filters: JobExplorerFilters;
  selectedJobId: string | null;
}) {
  const params = useSearchParams();
  const [selectedJobIds, setSelectedJobIds] = useState<string[]>([]);
  const selectedJobIdSet = useMemo(() => new Set(selectedJobIds), [selectedJobIds]);
  const allVisibleSelected =
    jobs.length > 0 && jobs.every((job) => selectedJobIdSet.has(job.id));

  function toggleJob(jobId: string) {
    setSelectedJobIds((current) =>
      current.includes(jobId) ? current.filter((existing) => existing !== jobId) : [...current, jobId],
    );
  }

  function toggleAll() {
    setSelectedJobIds(allVisibleSelected ? [] : jobs.map((job) => job.id));
  }

  function buildJobHref(jobId: string) {
    const search = new URLSearchParams(params.toString());
    search.set("jobId", jobId);
    return `/reports/v2?${search.toString()}`;
  }

  function downloadFiltered() {
    window.location.href = buildExportUrl(filters);
  }

  function downloadSelected() {
    if (!selectedJobIds.length) return;
    window.location.href = buildExportUrl(filters, selectedJobIds);
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2 px-1">
        <p className="text-sm text-muted-foreground">
          พบ <span className="font-semibold text-slate-950">{jobs.length.toLocaleString("th-TH")}</span> งาน
          {selectedJobIds.length > 0 ? (
            <>
              {" "}/ เลือก{" "}
              <span className="font-semibold text-slate-950">
                {selectedJobIds.length.toLocaleString("th-TH")}
              </span>{" "}
              งาน
            </>
          ) : null}
        </p>
        <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
          <input
            type="checkbox"
            checked={allVisibleSelected}
            onChange={toggleAll}
            className="size-3.5 rounded border-slate-300"
            aria-label="เลือกทั้งหมด"
          />
          เลือกทั้งหมด
        </label>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={downloadSelected}
          disabled={!selectedJobIds.length}
          className="w-full sm:w-auto"
        >
          <Download className="mr-2 size-4" />
          Export ที่เลือก
        </Button>
        <Button
          type="button"
          size="sm"
          onClick={downloadFiltered}
          disabled={!jobs.length}
          className="w-full sm:w-auto"
        >
          <FileSpreadsheet className="mr-2 size-4" />
          Export ตามผลกรอง
        </Button>
      </div>

      {!jobs.length ? (
        <div className="rounded-lg border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-muted-foreground">
          ไม่พบงานตามเงื่อนไขที่เลือก
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-border bg-white">
          <ul className="max-h-[640px] divide-y divide-border overflow-y-auto">
            {jobs.map((job) => {
              const isActive = job.id === selectedJobId;
              const isArchived = job.reportKind === "archived";
              return (
                <li key={job.id} className="relative">
                  <Link
                    href={buildJobHref(job.id)}
                    aria-current={isActive ? "page" : undefined}
                    className={cn(
                      "flex items-start gap-3 px-3 py-3 transition-colors",
                      isActive
                        ? "bg-[#f0faf7]"
                        : "hover:bg-slate-50",
                    )}
                  >
                    {isActive && (
                      <span className="absolute left-0 top-0 bottom-0 w-[3px] rounded-r-full bg-[#0d7a5f]" />
                    )}
                    <input
                      type="checkbox"
                      checked={selectedJobIdSet.has(job.id)}
                      onChange={(event) => {
                        event.stopPropagation();
                        toggleJob(job.id);
                      }}
                      onClick={(event) => event.stopPropagation()}
                      className="mt-1 size-4 shrink-0 rounded border-slate-300"
                      aria-label={`เลือก ${job.roomName}`}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className={cn(
                          "truncate text-sm font-semibold",
                          isActive ? "text-[#0d7a5f]" : "text-slate-950",
                        )}>
                          {job.roomName}
                        </p>
                        <Badge variant={isArchived ? "success" : "warning"} className="text-[10px]">
                          {isArchived ? "ปิดแล้ว" : "เปิดอยู่"}
                        </Badge>
                      </div>
                      <p className="mt-0.5 break-all text-[11px] text-muted-foreground">{job.id}</p>
                      <p className="mt-1 text-xs text-slate-600">
                        {job.driver || "-"} · {job.vehicle || "-"}
                      </p>
                      <p className="mt-0.5 text-[11px] text-muted-foreground">{job.eventDate || "-"}</p>
                      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
                        <span>ขึ้น {job.loadedTotal}/{job.requiredTotal}</span>
                        <span>ส่ง {job.deliveredTotal}/{job.requiredTotal}</span>
                        <span>{job.destinationCount} ปลายทาง</span>
                      </div>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
