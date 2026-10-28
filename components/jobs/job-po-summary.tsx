"use client";

import { useId, useState } from "react";
import { ChevronRight } from "lucide-react";
import type { JobSummaryRecord } from "@/lib/jobs";

const previewLimit = 2;

export function JobPoSummary({ job }: { job: JobSummaryRecord }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const listId = useId();
  const poNumbers = Array.from(new Set(job.items.map((item) => item.poSapNo.trim()).filter(Boolean)));
  const remainingCount = poNumbers.length - previewLimit;
  const canExpand = remainingCount > 0;
  const showAll = canExpand && isExpanded;

  return (
    <div className="mt-0.5 max-w-[22rem] text-[11px] text-slate-400">
      <div className="flex items-center gap-2">
        <span className="min-w-0 truncate">
          {showAll ? "PO ทั้งหมด" : poNumbers.slice(0, previewLimit).join(", ") || "-"}
        </span>
        {canExpand ? (
          <button
            type="button"
            onClick={() => setIsExpanded((current) => !current)}
            aria-expanded={showAll}
            aria-controls={listId}
            aria-label={showAll ? "ย่อรายการ PO" : `แสดง PO ทั้งหมด ${poNumbers.length.toLocaleString("th-TH")} รายการ`}
            className="inline-flex shrink-0 items-center gap-1 rounded-md bg-sky-50 px-1.5 py-0.5 font-medium text-sky-700 transition-colors hover:bg-sky-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
          >
            {showAll ? poNumbers.length.toLocaleString("th-TH") : `+${remainingCount.toLocaleString("th-TH")}`} PO
            <ChevronRight aria-hidden="true" className={`h-3 w-3 transition-transform motion-reduce:transition-none ${showAll ? "rotate-90" : ""}`} />
          </button>
        ) : null}
      </div>
      {canExpand ? (
        <div id={listId} hidden={!showAll}>
          {showAll ? (
            <ul aria-label="เลข PO ทั้งหมด" className="mt-2 flex flex-wrap gap-1.5">
              {poNumbers.map((number) => (
                <li key={number} className="max-w-full break-all rounded border border-slate-100 bg-slate-50 px-2 py-1 text-slate-600">
                  {number}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
