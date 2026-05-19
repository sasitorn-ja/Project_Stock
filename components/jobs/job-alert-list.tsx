"use client";

import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { type JobAlertRecord } from "@/lib/jobs";

const pageSize = 7;

function getAlertBadge(alertSeverity: string) {
  if (alertSeverity === "ผ่าน" || alertSeverity === "สำเร็จ") {
    return { label: "ผ่าน", variant: "success" as const, filter: "pass" as const };
  }

  if (alertSeverity === "สูง") {
    return { label: "ผิดปกติ", variant: "danger" as const, filter: "critical" as const };
  }

  return { label: "เตือน", variant: "warning" as const, filter: "warning" as const };
}

function formatAlertDateTime(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "-";
  }

  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Bangkok",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const getPart = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  const buddhistYear = (Number(getPart("year")) + 543) % 100;

  return `${getPart("day")}/${getPart("month")}/${String(buddhistYear).padStart(2, "0")} ${getPart("hour")}:${getPart("minute")} น.`;
}

export function JobAlertList({ alerts }: { alerts: JobAlertRecord[] }) {
  const [filter, setFilter] = useState<"all" | "pass" | "warning" | "critical">("all");
  const [page, setPage] = useState(1);

  const filteredAlerts = useMemo(() => {
    if (filter === "all") {
      return alerts;
    }

    return alerts.filter((alert) => getAlertBadge(alert.severity).filter === filter);
  }, [alerts, filter]);

  const pageCount = Math.max(1, Math.ceil(filteredAlerts.length / pageSize));
  const safePage = Math.min(page, pageCount);
  const visibleAlerts = filteredAlerts.slice((safePage - 1) * pageSize, safePage * pageSize);

  function updateFilter(nextFilter: typeof filter) {
    setFilter(nextFilter);
    setPage(1);
  }

  if (!alerts.length) {
    return (
      <div className="rounded-lg border border-dashed border-slate-200 p-4 text-[12.5px] text-muted-foreground">
        ยังไม่มีแจ้งเตือนสำหรับงานนี้
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {[
          ["all", "ทั้งหมด"],
          ["pass", "ผ่าน"],
          ["warning", "เตือน"],
          ["critical", "ผิดปกติ"],
        ].map(([value, label]) => (
          <Button
            key={value}
            type="button"
            variant={filter === value ? "default" : "outline"}
            size="sm"
            className="h-8 text-[12px]"
            onClick={() => updateFilter(value as typeof filter)}
          >
            {label}
          </Button>
        ))}
      </div>

      {visibleAlerts.length ? (
        visibleAlerts.map((alert) => {
          const badge = getAlertBadge(alert.severity);

          return (
            <div key={alert.id} className="rounded-lg border border-[#f0f2f5] bg-[#fafbfc] p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[12.5px] font-semibold text-slate-900">{alert.type}</p>
                  <p className="mt-0.5 whitespace-pre-line text-[11.5px] text-muted-foreground">{alert.message}</p>
                </div>
                <Badge variant={badge.variant}>{badge.label}</Badge>
              </div>
              <p className="mt-1.5 text-[11px] text-muted-foreground">{formatAlertDateTime(alert.createdAt)}</p>
            </div>
          );
        })
      ) : (
        <div className="rounded-lg border border-dashed border-slate-200 p-4 text-[12.5px] text-muted-foreground">
          ไม่มีรายการในตัวกรองนี้
        </div>
      )}

      <div className="flex items-center justify-between gap-3 border-t border-[#f0f2f5] pt-3">
        <p className="text-[11.5px] text-muted-foreground">
          แสดง {visibleAlerts.length ? (safePage - 1) * pageSize + 1 : 0}-{Math.min(safePage * pageSize, filteredAlerts.length)} จาก{" "}
          {filteredAlerts.length} รายการ
        </p>
        <div className="flex items-center gap-2">
          <Button type="button" variant="outline" size="sm" disabled={safePage <= 1} onClick={() => setPage((current) => Math.max(1, current - 1))}>
            ก่อนหน้า
          </Button>
          <span className="text-[11.5px] text-muted-foreground">
            {safePage}/{pageCount}
          </span>
          <Button type="button" variant="outline" size="sm" disabled={safePage >= pageCount} onClick={() => setPage((current) => Math.min(pageCount, current + 1))}>
            ถัดไป
          </Button>
        </div>
      </div>
    </div>
  );
}
