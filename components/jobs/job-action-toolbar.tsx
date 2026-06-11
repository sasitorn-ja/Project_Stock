"use client";

import { useState } from "react";
import { Plus, Settings2, Truck, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { JobAddPOPanel } from "@/components/jobs/job-add-po-panel";
import { JobDeleteButton } from "@/components/jobs/job-delete-button";
import { JobDestinationOverrideButton } from "@/components/jobs/job-destination-override-button";
import { JobDriverAccessCard } from "@/components/jobs/job-driver-access-card";
import { JobMonitorActions } from "@/components/jobs/job-monitor-actions";
import { JobOriginOverrideButton } from "@/components/jobs/job-origin-override-button";
import { TransportInvoiceButton } from "@/components/jobs/transport-invoice-button";
import { type JobSummaryRecord } from "@/lib/jobs";

// Toolbar รวม "ห้องคนขับ" + "เพิ่ม PO ระหว่างงาน" + ตั้งค่าพิเศษ + ลบ Job
// แทน 2 card ที่แยกกัน เพื่อให้ดูเป็นชุดเดียวและเข้าใจง่ายขึ้น
export function JobActionToolbar({ job }: { job: JobSummaryRecord }) {
  const [isAddPOOpen, setIsAddPOOpen] = useState(false);

  return (
    <div className="space-y-3">
      <div className="rounded-md border bg-white">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b px-3 py-3 sm:px-4">
          <div className="flex min-w-0 items-center gap-2">
            <Truck className="h-4 w-4 shrink-0 text-cyan-700" />
            <p className="text-sm font-semibold text-slate-900">การจัดการงาน</p>
            {job.roomName?.trim() ? (
              <Badge variant="secondary" className="shrink-0">
                {job.roomName.trim()}
              </Badge>
            ) : null}
          </div>
          {/* มือถือ: รวมเมนูเดียว */}
          <div className="w-full sm:w-auto lg:hidden">
            <JobMonitorActions
              jobId={job.id}
              driver={job.driver}
              vehicle={job.vehicle}
              destinationOverrideEnabled={Boolean(job.allowDestinationBeforeFullyLoaded)}
              isFullyLoaded={job.isFullyLoaded}
              originOverrideEnabled={Boolean(job.allowOriginRecheckAfterLocked)}
              isOriginLocked={job.isOriginLocked}
            />
          </div>
        </div>

        {/* Desktop: ปุ่มแยกเป็นกลุ่ม */}
        <div className="hidden flex-wrap items-center gap-x-3 gap-y-2 px-3 py-3 sm:px-4 lg:flex">
          <ToolbarGroup label="คนขับ">
            <JobDriverAccessCard jobId={job.id} driver={job.driver} vehicle={job.vehicle} compact />
          </ToolbarGroup>

          <ToolbarDivider />

          <ToolbarGroup label="เพิ่ม PO">
            <Button
              type="button"
              variant={isAddPOOpen ? "outline" : "default"}
              size="sm"
              onClick={() => setIsAddPOOpen((value) => !value)}
              className="gap-1.5"
            >
              {isAddPOOpen ? (
                <>
                  <X className="h-3.5 w-3.5" />
                  ปิด
                </>
              ) : (
                <>
                  <Plus className="h-3.5 w-3.5" />
                  เพิ่ม PO ระหว่างงาน
                </>
              )}
            </Button>
          </ToolbarGroup>

          <ToolbarDivider />

          <ToolbarGroup label="ตั้งค่าพิเศษ" icon={<Settings2 className="h-3.5 w-3.5 text-slate-400" />}>
            <JobDestinationOverrideButton
              jobId={job.id}
              enabled={Boolean(job.allowDestinationBeforeFullyLoaded)}
              isFullyLoaded={job.isFullyLoaded}
            />
            <JobOriginOverrideButton
              jobId={job.id}
              enabled={Boolean(job.allowOriginRecheckAfterLocked)}
              isOriginLocked={job.isOriginLocked}
            />
            <TransportInvoiceButton jobId={job.id} />
          </ToolbarGroup>

          <div className="ml-auto">
            <JobDeleteButton jobId={job.id} redirectTo="/jobs" />
          </div>
        </div>

        {/* มือถือ: ปุ่มเพิ่ม PO อยู่ใต้ header เพราะ JobMonitorActions ไม่ได้ครอบเรื่อง PO */}
        <div className="border-t px-3 py-3 lg:hidden">
          <Button
            type="button"
            variant={isAddPOOpen ? "outline" : "default"}
            size="sm"
            onClick={() => setIsAddPOOpen((value) => !value)}
            className="w-full gap-1.5"
          >
            {isAddPOOpen ? (
              <>
                <X className="h-3.5 w-3.5" />
                ปิด เพิ่ม PO
              </>
            ) : (
              <>
                <Plus className="h-3.5 w-3.5" />
                เพิ่ม PO ระหว่างงาน
              </>
            )}
          </Button>
        </div>
      </div>

      {isAddPOOpen ? <JobAddPOPanel job={job} embedded /> : null}
    </div>
  );
}

function ToolbarGroup({
  label,
  icon,
  children,
}: {
  label: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <p className="flex items-center gap-1 text-[10px] font-medium uppercase tracking-wide text-slate-400">
        {icon}
        {label}
      </p>
      <div className="flex flex-wrap items-center gap-2">{children}</div>
    </div>
  );
}

function ToolbarDivider() {
  return <div className="hidden h-10 w-px bg-slate-200 lg:block" />;
}
