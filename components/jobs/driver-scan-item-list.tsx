"use client";

import Image from "next/image";
import { useEffect, useId, useRef, useState } from "react";
import { ArrowLeft, CheckCircle2, FileText, MapPin, ScanLine, Search, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { withBasePath } from "@/lib/app-paths";
import type { JobItemRecord, JobSummaryRecord, ScanMode } from "@/lib/jobs";

type ScanItem = JobItemRecord & { completedQty: number; remainingQty: number };
type ItemFilter = "all" | "pending" | "completed" | "not_required";

export function DriverScanItemList({
  job,
  items,
  mode,
  location,
  onClose,
}: {
  job: JobSummaryRecord | null;
  items: ScanItem[];
  mode: ScanMode;
  location: string;
  onClose: () => void;
}) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<ItemFilter>("all");
  const titleId = useId();
  const searchId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    return () => {
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus();
    };
  }, []);

  const required = items.reduce((sum, item) => sum + item.orderQty, 0);
  const completed = items.reduce((sum, item) => sum + Math.min(item.completedQty, item.orderQty), 0);
  const remaining = items.reduce((sum, item) => sum + item.remainingQty, 0);
  const counts = {
    all: items.length,
    pending: items.filter((item) => item.remainingQty > 0).length,
    completed: items.filter((item) => item.orderQty > 0 && item.remainingQty === 0).length,
    not_required: items.filter((item) => item.orderQty === 0).length,
  };
  const normalizedSearch = search.trim().toLowerCase();
  const visibleItems = items.filter((item) => {
    const matchesFilter = filter === "all" || (filter === "pending" && item.remainingQty > 0)
      || (filter === "completed" && item.orderQty > 0 && item.remainingQty === 0)
      || (filter === "not_required" && item.orderQty === 0);
    return matchesFilter && (!normalizedSearch || [item.poSapNo, item.poSapItem, item.materialCode, item.materialName]
      .some((value) => value?.toLowerCase().includes(normalizedSearch)));
  });
  const filters: { value: ItemFilter; label: string }[] = [
    { value: "all", label: "ทั้งหมด" },
    { value: "pending", label: "รอสแกน" },
    { value: "completed", label: "สแกนครบ" },
    { value: "not_required", label: "ไม่ต้องสแกน" },
  ];

  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      className="fixed inset-0 z-[80] flex h-dvh flex-col bg-gradient-to-br from-[#eef5fc] via-[#f5f8fc] to-[#edf5fa]"
      onKeyDown={(event) => {
        if (event.key === "Escape") { event.stopPropagation(); onClose(); }
        if (event.key !== "Tab") return;
        const focusable = Array.from(panelRef.current?.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), a[href]') ?? []);
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }}
    >
      <header className="shrink-0 border-b border-slate-200/80 bg-white px-3 py-3 sm:px-6">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <Image src={withBasePath("/logo.png")} alt="SyncDrop" width={48} height={42} unoptimized className="h-10 w-12 shrink-0 object-contain" />
            <div className="min-w-0 border-l border-slate-200 pl-3">
              <p className="text-sm font-semibold text-slate-900">SyncDrop</p>
              <p className="text-xs text-slate-500">ห้องคนขับ · รายการสินค้า</p>
            </div>
          </div>
          <Button ref={closeRef} type="button" variant="outline" className="h-10 shrink-0 gap-1.5 px-3 text-xs sm:text-sm" onClick={onClose}>
            <ArrowLeft className="size-4" />กลับไปสแกน
          </Button>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <div className="mx-auto max-w-6xl space-y-4 px-3 py-4 sm:px-6 sm:py-6">
          <section className="surface-panel overflow-hidden" aria-labelledby={titleId}>
            <div className="relative isolate overflow-hidden bg-[#0b2e55] px-4 py-5 text-white sm:px-6">
              <Image src={withBasePath("/warehouse-background.webp")} alt="" fill sizes="(max-width: 1152px) 100vw, 1152px" className="-z-20 object-cover" />
              <div className="absolute inset-0 -z-10 bg-gradient-to-r from-[#071c39]/95 via-[#0b2e55]/90 to-[#0b2e55]/70" />
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs text-sky-200">{job?.roomName?.trim() || job?.id || "ห้องคนขับ"}</span>
                <Badge variant="outline" className="border-white/25 bg-white/10 text-white">{mode === "deliver" ? "สแกนส่งสินค้า" : "สแกนขึ้นรถ"}</Badge>
              </div>
              <h2 id={titleId} className="mt-2 text-xl font-bold sm:text-2xl">รายการที่ต้องสแกน</h2>
              <p className="mt-2 flex items-start gap-1.5 text-xs leading-5 text-slate-200"><MapPin className="mt-0.5 size-3.5 shrink-0 text-sky-300" /><span className="min-w-0 break-words">{location}</span></p>
              <div className="absolute bottom-0 left-0 h-[3px] w-32 bg-gradient-to-r from-sky-400 to-cyan-300" />
            </div>
            <dl className="grid grid-cols-3 divide-x divide-slate-100 py-4">
              {[
                { label: "ต้องสแกน", value: required, color: "text-slate-900" },
                { label: "สแกนแล้ว", value: completed, color: "text-emerald-700" },
                { label: "คงเหลือ", value: remaining, color: "text-primary" },
              ].map((metric) => (
                <div key={metric.label} className="px-2 text-center">
                  <dt className="text-[11px] text-slate-500 sm:text-xs">{metric.label}</dt>
                  <dd className={`mt-1 text-xl font-bold tabular-nums sm:text-2xl ${metric.color}`}>{metric.value.toLocaleString("th-TH")}<span className="ml-1 text-[11px] font-normal text-slate-400">รอบ</span></dd>
                </div>
              ))}
            </dl>
          </section>

          <section className="surface-panel p-3 sm:p-4" aria-label="ค้นหาและกรองรายการสินค้า">
            <label htmlFor={searchId} className="sr-only">ค้นหาเลข PO, Item, รหัสหรือชื่อสินค้า</label>
            <div className="relative">
              <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
              <Input id={searchId} type="search" value={search} onChange={(event) => setSearch(event.target.value)} className="h-11 bg-white pl-9 text-sm" placeholder="ค้นหาเลข PO, Item, รหัสหรือชื่อสินค้า" />
            </div>
            <div role="group" aria-label="สถานะการสแกน" className="mt-3 flex gap-2 overflow-x-auto pb-1">
              {filters.map((option) => (
                <button key={option.value} type="button" aria-pressed={filter === option.value} onClick={() => setFilter(option.value)} className={`inline-flex min-h-10 shrink-0 items-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium transition-colors ${filter === option.value ? "border-primary bg-primary text-white" : "border-slate-200 bg-white text-slate-600 hover:border-sky-200 hover:bg-sky-50"}`}>
                  {option.label}<span className={`rounded px-1.5 py-0.5 text-[10px] tabular-nums ${filter === option.value ? "bg-white/20 text-white" : "bg-slate-100 text-slate-500"}`}>{counts[option.value].toLocaleString("th-TH")}</span>
                </button>
              ))}
            </div>
          </section>

          <div className="flex flex-wrap items-center justify-between gap-2 px-1 text-xs text-slate-500">
            <p role="status">แสดง {visibleItems.length.toLocaleString("th-TH")} จาก {items.length.toLocaleString("th-TH")} รายการสินค้า</p>
            <p className="flex items-center gap-1.5"><ScanLine className="size-3.5 text-primary" />รายการที่ยังสแกนไม่ครบอยู่ด้านบน</p>
          </div>

          {visibleItems.length ? (
            <ul aria-label="รายการสินค้า" className="grid items-start gap-3 lg:grid-cols-2">
              {visibleItems.map((item) => {
                const notRequired = item.orderQty === 0;
                const done = !notRequired && item.remainingQty === 0;
                return (
                  <li key={item.registryKey} className={`surface-panel min-w-0 overflow-hidden border-l-4 ${notRequired ? "border-l-slate-300" : done ? "border-l-emerald-400" : "border-l-sky-400"}`}>
                    <div className="p-4">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex min-w-0 flex-wrap items-center gap-2">
                          <FileText className={`size-4 shrink-0 ${done ? "text-emerald-600" : "text-slate-400"}`} />
                          <h3 className="break-all text-sm font-semibold text-slate-900">PO {item.poSapNo || item.registryKey}</h3>
                          {item.poSapItem ? <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-500">Item {item.poSapItem}</span> : null}
                        </div>
                        <Badge variant={notRequired ? "outline" : done ? "success" : "secondary"} className="shrink-0">
                          {done ? <CheckCircle2 className="size-3" /> : null}{notRequired ? "ไม่ต้องสแกน" : done ? "สแกนครบ" : "รอสแกน"}
                        </Badge>
                      </div>
                      <p className={`mt-3 break-words text-[13px] leading-6 ${notRequired ? "text-slate-400" : "text-slate-700"}`}>{item.materialName || item.materialCode || "ไม่ระบุชื่อสินค้า"}</p>
                      {mode === "load" && item.destinationName ? <p className="mt-2 flex items-start gap-1.5 text-[11px] leading-5 text-slate-400"><MapPin className="mt-0.5 size-3 shrink-0" /><span className="min-w-0 break-words">{item.destinationName}</span></p> : null}
                    </div>
                    <div className={`flex flex-wrap items-center justify-between gap-2 border-t px-4 py-2.5 text-xs ${notRequired ? "border-slate-100 bg-slate-50/70 text-slate-400" : done ? "border-emerald-100 bg-emerald-50/60 text-emerald-700" : "border-slate-100 bg-slate-50/70 text-slate-500"}`}>
                      <span>{notRequired ? "กำหนดจำนวนสแกนไว้ 0 รอบ" : <>สแกนแล้ว <strong className="font-semibold tabular-nums">{item.completedQty.toLocaleString("th-TH")} / {item.orderQty.toLocaleString("th-TH")}</strong> รอบ</>}</span>
                      {!notRequired ? <span className={`font-semibold ${done ? "text-emerald-700" : "text-primary"}`}>{done ? "ครบตามกำหนด" : <>เหลือ <span className="text-base tabular-nums">{item.remainingQty.toLocaleString("th-TH")}</span> รอบ</>}</span> : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : (
            <div className="empty-state min-h-56">
              <Search className="mb-3 size-8 text-sky-400" />
              <p className="text-sm font-semibold text-slate-700">{items.length ? "ไม่พบรายการที่ตรงกับตัวกรอง" : "ยังไม่มีรายการสินค้าในขั้นตอนนี้"}</p>
              <p className="mt-1 text-xs text-slate-500">{items.length ? "ลองเปลี่ยนคำค้นหรือเลือกสถานะอื่น" : "กลับไปตรวจสอบห้องงานหรือปลายทางที่เลือก"}</p>
              {search || filter !== "all" ? <Button type="button" variant="outline" size="sm" className="mt-4 gap-1.5" onClick={() => { setSearch(""); setFilter("all"); }}><X className="size-3.5" />ล้างการค้นหาและตัวกรอง</Button> : null}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
