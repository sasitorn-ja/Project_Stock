import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, Check, MapPin, PackageCheck, Truck, UserRound } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { withBasePath } from "@/lib/app-paths";
import { getJobStatusLabel } from "@/lib/job-labels";
import type { JobSummaryRecord } from "@/lib/jobs";

export function DriverRoomHeader() {
  return (
    <header className="sticky top-0 z-30 border-b border-slate-200/80 bg-white/95 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <Image src={withBasePath("/logo.png")} alt="SyncDrop" width={48} height={42} unoptimized className="h-10 w-12 shrink-0 object-contain" />
          <div className="min-w-0 border-l border-slate-200 pl-3">
            <p className="text-sm font-semibold text-slate-900">SyncDrop</p>
            <p className="text-xs text-slate-500">ห้องคนขับ</p>
          </div>
        </div>
        <Button asChild variant="outline" size="sm" className="shrink-0 gap-1.5">
          <Link href="/jobs"><ArrowLeft className="size-4" />รายการงาน</Link>
        </Button>
      </div>
    </header>
  );
}

export function DriverRoomSummary({ job }: { job: JobSummaryRecord }) {
  const required = job.items.reduce((sum, item) => sum + item.orderQty, 0);
  const loaded = job.items.reduce((sum, item) => sum + item.loadedQty, 0);
  const delivered = job.items.reduce((sum, item) => sum + item.deliveredQty, 0);
  const completed = Boolean(job.completedAt || job.status === "completed");
  const checkedIn = Boolean(job.originCheckedInAt && job.originGps);
  const fullyLoaded = required > 0 && loaded >= required;
  const currentStep = completed ? 3 : !checkedIn ? 0 : fullyLoaded || job.allowDestinationBeforeFullyLoaded ? 2 : 1;
  const poCount = new Set(job.items.map((item) => item.poSapNo.trim()).filter(Boolean)).size;
  const steps = [
    { label: "เช็กอินต้นทาง", icon: MapPin, done: checkedIn },
    { label: "สแกนขึ้นรถ", icon: Truck, done: fullyLoaded },
    { label: "ส่งสินค้าปลายทาง", icon: PackageCheck, done: completed },
  ];

  return (
    <section aria-labelledby="driver-room-title" className="surface-panel overflow-hidden">
      <div className="relative isolate overflow-hidden bg-[#0b2e55] px-4 py-5 text-white sm:px-6">
        <Image src={withBasePath("/warehouse-background.webp")} alt="" fill sizes="(max-width: 1152px) 100vw, 1152px" className="-z-20 object-cover object-center" />
        <div className="absolute inset-0 -z-10 bg-gradient-to-r from-[#071c39]/95 via-[#0b2e55]/90 to-[#0b2e55]/70" />
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-sky-200">ห้องงานขนส่ง</span>
          <Badge variant="outline" className="border-white/25 bg-white/10 text-white">{getJobStatusLabel(job.status)}</Badge>
        </div>
        <h1 id="driver-room-title" className="mt-2 break-words text-xl font-bold sm:text-2xl">{job.roomName?.trim() || job.id}</h1>
        <p className="mt-1 break-all text-xs text-slate-300">{job.id}</p>
        <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-slate-200">
          <span className="inline-flex min-w-0 items-center gap-2"><Truck className="size-4 shrink-0 text-sky-300" /><span className="break-words">รถ {job.vehicle || "ไม่ระบุ"}</span></span>
          <span className="inline-flex min-w-0 items-center gap-2"><UserRound className="size-4 shrink-0 text-sky-300" /><span className="break-words">{job.driver || "ไม่ระบุคนขับ"}</span></span>
          <span>{poCount.toLocaleString("th-TH")} PO · {job.destinations.length.toLocaleString("th-TH")} ปลายทาง</span>
        </div>
        <div className="absolute bottom-0 left-0 h-[3px] w-32 bg-gradient-to-r from-sky-400 to-cyan-300" />
      </div>
      <dl className="grid grid-cols-3 divide-x divide-slate-100 border-b border-slate-100 bg-white py-4">
        {[
          { label: "ต้องสแกน", value: required, color: "text-slate-900" },
          { label: "ขึ้นรถแล้ว", value: loaded, color: "text-blue-700" },
          { label: "ส่งแล้ว", value: delivered, color: "text-emerald-700" },
        ].map((metric) => (
          <div key={metric.label} className="px-2 text-center sm:px-4">
            <dt className="text-[11px] text-slate-500 sm:text-xs">{metric.label}</dt>
            <dd className={`mt-1 text-xl font-bold tabular-nums sm:text-2xl ${metric.color}`}>
              {metric.value.toLocaleString("th-TH")}<span className="ml-1 text-[11px] font-normal text-slate-400">รอบ</span>
            </dd>
          </div>
        ))}
      </dl>
      <ol aria-label="ขั้นตอนการขนส่ง" className="grid grid-cols-3 gap-2 bg-slate-50/60 px-3 py-3 sm:px-6">
        {steps.map((step, index) => (
          <li key={step.label} aria-current={index === currentStep ? "step" : undefined} className="flex flex-col items-center gap-1.5 text-center sm:flex-row sm:gap-2 sm:text-left">
            <span className={`grid size-7 shrink-0 place-items-center rounded-full ${step.done ? "bg-emerald-100 text-emerald-700" : index === currentStep ? "bg-primary text-white" : "bg-slate-200/70 text-slate-400"}`}>
              {step.done ? <Check className="size-4" /> : <step.icon className="size-3.5" />}
            </span>
            <span className={`text-[10px] sm:text-xs ${step.done ? "text-emerald-700" : index === currentStep ? "font-semibold text-primary" : "text-slate-400"}`}>{step.label}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}
