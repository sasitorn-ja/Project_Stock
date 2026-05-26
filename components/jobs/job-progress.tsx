"use client";

import { useMemo, useState } from "react";
import { CheckCircle2, MapPin, Plus, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { JobItemScanQtyEditor } from "@/components/jobs/job-item-scan-qty-editor";
import { JobMergedScanQtyEditor } from "@/components/jobs/job-merged-scan-qty-editor";
import { cn } from "@/lib/utils";
import { type getJob, type getJobArchive } from "@/lib/job-store";

type JobDetail =
  | NonNullable<Awaited<ReturnType<typeof getJob>>>
  | NonNullable<Awaited<ReturnType<typeof getJobArchive>>>;

type StatusFilter = "all" | "waitLoad" | "loaded" | "delivered";

type JobLocation = JobDetail["destinations"][number];
type JobLocationItem = JobLocation["items"][number];

// item ที่อาจรวมจากหลาย registryKey ของ material code เดียวกันใน PO เดียวกัน
type MergedItem = {
  key: string; // ใช้เป็น React key (poSapNo + materialCode)
  registryKeys: string[];
  poSapNo: string;
  materialCode: string;
  materialName: string;
  sourceOrderQty: string;
  orderQty: number;
  loadedQty: number;
  deliveredQty: number;
  // เก็บ underlying items ไว้ส่งเข้า MergedScanQtyEditor เพื่อกระจาย qty ตอน save
  underlying: { registryKey: string; orderQty: number; loadedQty: number; deliveredQty: number }[];
};

const STATUS_FILTERS: { value: StatusFilter; label: string }[] = [
  { value: "all", label: "ทั้งหมด" },
  { value: "waitLoad", label: "รอโหลด" },
  { value: "loaded", label: "ขึ้นรถแล้ว" },
  { value: "delivered", label: "ส่งแล้ว" },
];

function itemMatchesStatus(item: MergedItem, status: StatusFilter) {
  const order = Math.max(0, item.orderQty);
  if (status === "all") return true;
  if (status === "waitLoad") return order > 0 && item.loadedQty < order;
  if (status === "loaded") return order > 0 && item.loadedQty >= order && item.deliveredQty < order;
  if (status === "delivered") return order > 0 && item.deliveredQty >= order;
  return true;
}

function itemMatchesSearch(item: MergedItem, query: string) {
  if (!query) return true;
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  return (
    item.poSapNo.toLowerCase().includes(needle) ||
    item.materialCode.toLowerCase().includes(needle) ||
    item.materialName.toLowerCase().includes(needle)
  );
}

function getItemStatus(item: MergedItem) {
  const order = Math.max(0, item.orderQty);
  if (order === 0) return { tone: "muted", label: "ไม่ส่งรอบนี้" };
  if (item.deliveredQty >= order) return { tone: "delivered", label: `ส่งแล้ว ${item.deliveredQty}/${order}` };
  if (item.loadedQty >= order) return { tone: "loaded", label: `ขึ้นรถแล้ว ${item.loadedQty}/${order}` };
  return { tone: "wait", label: `รอ ${item.loadedQty}/${order}` };
}

const STATUS_TONE_CLASS: Record<string, string> = {
  wait: "bg-amber-100 text-amber-800",
  loaded: "bg-cyan-100 text-cyan-800",
  delivered: "bg-emerald-100 text-emerald-800",
  muted: "bg-slate-100 text-slate-500",
};

// รวม item ที่มี (poSapNo + materialCode) เหมือนกันใน destination เดียวกันเป็นแถวเดียว
function mergeDuplicateItems(items: JobLocationItem[]): MergedItem[] {
  const map = new Map<string, MergedItem>();
  items.forEach((item) => {
    const materialCode = item.materialCode || "(ไม่มีรหัสวัสดุ)";
    const key = `${item.poSapNo}__${materialCode}`;
    const existing = map.get(key);
    if (existing) {
      existing.registryKeys.push(item.registryKey);
      existing.orderQty += Math.max(0, item.orderQty);
      existing.loadedQty += Math.max(0, item.loadedQty);
      existing.deliveredQty += Math.max(0, item.deliveredQty);
      existing.underlying.push({
        registryKey: item.registryKey,
        orderQty: Math.max(0, item.orderQty),
        loadedQty: Math.max(0, item.loadedQty),
        deliveredQty: Math.max(0, item.deliveredQty),
      });
    } else {
      map.set(key, {
        key,
        registryKeys: [item.registryKey],
        poSapNo: item.poSapNo,
        materialCode,
        materialName: item.materialName || "-",
        sourceOrderQty: item.sourceOrderQty || String(item.orderQty || ""),
        orderQty: Math.max(0, item.orderQty),
        loadedQty: Math.max(0, item.loadedQty),
        deliveredQty: Math.max(0, item.deliveredQty),
        underlying: [
          {
            registryKey: item.registryKey,
            orderQty: Math.max(0, item.orderQty),
            loadedQty: Math.max(0, item.loadedQty),
            deliveredQty: Math.max(0, item.deliveredQty),
          },
        ],
      });
    }
  });
  return Array.from(map.values());
}

type POGroup = {
  poSapNo: string;
  items: MergedItem[];
  required: number;
  loaded: number;
  delivered: number;
};

function groupByPO(items: MergedItem[]): POGroup[] {
  const map = new Map<string, POGroup>();
  items.forEach((item) => {
    const key = item.poSapNo || "(ไม่มี PO)";
    const group = map.get(key) ?? {
      poSapNo: key,
      items: [],
      required: 0,
      loaded: 0,
      delivered: 0,
    };
    group.items.push(item);
    group.required += item.orderQty;
    group.loaded += item.loadedQty;
    group.delivered += item.deliveredQty;
    map.set(key, group);
  });
  return Array.from(map.values()).sort((a, b) => a.poSapNo.localeCompare(b.poSapNo));
}

export function JobProgress({ job, editableScanQty = false }: { job: JobDetail; editableScanQty?: boolean }) {
  const destinations = job.destinations;
  const [activeId, setActiveId] = useState<string>(() => destinations[0]?.id ?? "");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");

  const active = destinations.find((destination) => destination.id === activeId) ?? destinations[0] ?? null;

  const mergedItems = useMemo(() => {
    if (!active) return [];
    return mergeDuplicateItems(active.items);
  }, [active]);

  const filteredItems = useMemo(
    () => mergedItems.filter((item) => itemMatchesSearch(item, query) && itemMatchesStatus(item, statusFilter)),
    [mergedItems, query, statusFilter],
  );

  const poGroups = useMemo(() => groupByPO(filteredItems), [filteredItems]);

  const statusCounts = useMemo(() => {
    return STATUS_FILTERS.reduce(
      (acc, filter) => {
        acc[filter.value] = mergedItems.filter((item) => itemMatchesStatus(item, filter.value)).length;
        return acc;
      },
      { all: 0, waitLoad: 0, loaded: 0, delivered: 0 } as Record<StatusFilter, number>,
    );
  }, [mergedItems]);

  if (!destinations.length) {
    return (
      <div className="rounded-md border bg-white">
        <div className="border-b px-3 py-3">
          <h3 className="text-sm font-semibold text-slate-900">แผนส่ง / PO</h3>
        </div>
        <p className="p-6 text-center text-sm text-muted-foreground">ยังไม่มีปลายทางสำหรับงานนี้</p>
      </div>
    );
  }

  return (
    <div className="rounded-md border bg-white">
      <div className="flex flex-col gap-2 border-b px-3 py-3 sm:flex-row sm:items-center sm:justify-between">
        <h3 className="text-sm font-semibold text-slate-900">แผนส่ง / PO</h3>
        <p className="text-xs text-muted-foreground">
          {destinations.length.toLocaleString("th-TH")} ปลายทาง ·{" "}
          {destinations.reduce((sum, destination) => sum + destination.items.length, 0).toLocaleString("th-TH")} รายการ
        </p>
      </div>

      {/* Tab strip: scrollable on mobile */}
      <div className="flex gap-1 overflow-x-auto border-b px-2 pt-2 [scrollbar-width:thin]">
        {destinations.map((destination, index) => {
          const isActive = destination.id === active?.id;
          return (
            <button
              type="button"
              key={destination.id}
              onClick={() => setActiveId(destination.id)}
              aria-selected={isActive}
              className={cn(
                "flex shrink-0 items-center gap-2 whitespace-nowrap rounded-t-md border-b-2 px-3 py-2.5 text-xs font-medium transition-colors sm:text-sm",
                isActive
                  ? "border-cyan-700 bg-white text-slate-900"
                  : "border-transparent text-slate-500 hover:bg-slate-50 hover:text-slate-900",
              )}
            >
              <span className="truncate max-w-[180px]">
                {index + 1}. {destination.name}
              </span>
              <span
                className={cn(
                  "rounded-full px-2 py-0.5 text-[10px]",
                  isActive ? "bg-cyan-700 text-white" : "bg-slate-100 text-slate-600",
                )}
              >
                {destination.items.length.toLocaleString("th-TH")}
              </span>
            </button>
          );
        })}
      </div>

      {active ? (
        <div className="p-3 sm:p-4">
          {/* Destination info + status summary */}
          <div className="mb-3 rounded-md bg-slate-50 px-3 py-3">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <p className="flex items-center gap-1.5 text-sm font-semibold text-slate-900">
                  <MapPin className="h-4 w-4 shrink-0 text-cyan-700" />
                  <span className="truncate">{active.name}</span>
                </p>
                <p className="mt-1 text-xs text-muted-foreground">{active.address}</p>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  GPS {active.gps} / รัศมี {active.radiusMeters} ม.
                </p>
                {active.deliveryGps ? (
                  <p className="mt-1 text-[11px] text-muted-foreground">GPS ส่งของ: {active.deliveryGps}</p>
                ) : null}
              </div>
              <div className="grid grid-cols-3 gap-2 text-center sm:min-w-[260px]">
                <div className="rounded-md bg-white px-2 py-1.5">
                  <p className="text-[10px] text-muted-foreground">ต้องสแกน</p>
                  <p className="text-sm font-semibold text-slate-900">{active.required.toLocaleString("th-TH")}</p>
                </div>
                <div className="rounded-md bg-cyan-50 px-2 py-1.5 text-cyan-700">
                  <p className="text-[10px]">ขึ้นรถ</p>
                  <p className="text-sm font-semibold">{active.loaded.toLocaleString("th-TH")}</p>
                </div>
                <div className="rounded-md bg-emerald-50 px-2 py-1.5 text-emerald-700">
                  <p className="text-[10px]">ส่งแล้ว</p>
                  <p className="text-sm font-semibold">{active.delivered.toLocaleString("th-TH")}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Toolbar: search + status filter */}
          <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center">
            <label className="flex flex-1 items-center gap-2 rounded-md border bg-white px-3 py-2 focus-within:ring-2 focus-within:ring-cyan-100">
              <Search className="h-4 w-4 shrink-0 text-slate-400" />
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="ค้นหา PO หรือรหัสวัสดุ..."
                className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-slate-400"
              />
            </label>
            <div className="-mx-1 flex gap-1 overflow-x-auto px-1 [scrollbar-width:thin]">
              {STATUS_FILTERS.map((filter) => {
                const isActiveFilter = filter.value === statusFilter;
                const count = statusCounts[filter.value];
                return (
                  <button
                    type="button"
                    key={filter.value}
                    onClick={() => setStatusFilter(filter.value)}
                    className={cn(
                      "flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3 py-1.5 text-xs transition-colors",
                      isActiveFilter
                        ? "border-cyan-700 bg-cyan-700 text-white"
                        : "border-slate-200 bg-white text-slate-600 hover:border-slate-300",
                    )}
                  >
                    {filter.label}
                    <span
                      className={cn(
                        "rounded-full px-1.5 text-[10px]",
                        isActiveFilter ? "bg-white/20 text-white" : "bg-slate-100 text-slate-500",
                      )}
                    >
                      {count.toLocaleString("th-TH")}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* PO cards */}
          {poGroups.length === 0 ? (
            <div className="rounded-md border border-dashed border-slate-200 bg-slate-50/40 py-10 text-center text-sm text-muted-foreground">
              {query || statusFilter !== "all"
                ? "ไม่พบรายการตามเงื่อนไขที่กรอง"
                : "ยังไม่มีรายการในปลายทางนี้"}
            </div>
          ) : (
            <div className="space-y-3">
              {poGroups.map((group) => (
                <POCard
                  key={group.poSapNo}
                  group={group}
                  jobId={job.id}
                  editableScanQty={editableScanQty}
                />
              ))}
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}

function POCard({
  group,
  jobId,
  editableScanQty,
}: {
  group: POGroup;
  jobId: string;
  editableScanQty: boolean;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const progress = group.required > 0 ? Math.min(100, Math.round((group.loaded / group.required) * 100)) : 0;
  const allLoaded = group.required > 0 && group.loaded >= group.required;
  const allDelivered = group.required > 0 && group.delivered >= group.required;

  return (
    <div className="rounded-md border bg-white">
      <button
        type="button"
        onClick={() => setCollapsed((value) => !value)}
        aria-expanded={!collapsed}
        className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left transition-colors hover:bg-slate-50"
      >
        <div className="flex min-w-0 items-center gap-2">
          <Plus
            className={cn(
              "h-3.5 w-3.5 shrink-0 text-slate-400 transition-transform",
              !collapsed && "rotate-45",
            )}
          />
          <span className="truncate font-mono text-sm font-semibold text-slate-900">PO {group.poSapNo}</span>
          <span className="shrink-0 text-xs text-muted-foreground">· {group.items.length} รายการ</span>
          {allDelivered ? (
            <Badge variant="success" className="ml-1 shrink-0">
              <CheckCircle2 className="mr-1 h-3 w-3" />
              ส่งครบ
            </Badge>
          ) : null}
        </div>
        <span className="shrink-0 text-[11px] text-muted-foreground">
          ขึ้นรถ {group.loaded.toLocaleString("th-TH")} / {group.required.toLocaleString("th-TH")}
        </span>
      </button>

      <div className="px-3">
        <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
          <div
            className={cn(
              "h-full rounded-full transition-all",
              allDelivered ? "bg-emerald-500" : allLoaded ? "bg-cyan-500" : "bg-amber-500",
            )}
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {!collapsed ? (
        <div className="divide-y border-t mt-2">
          {group.items.map((item) => (
            <ItemRow key={item.key} item={item} jobId={jobId} editableScanQty={editableScanQty} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function ItemRow({
  item,
  jobId,
  editableScanQty,
}: {
  item: MergedItem;
  jobId: string;
  editableScanQty: boolean;
}) {
  const status = getItemStatus(item);
  const isMerged = item.registryKeys.length > 1;
  return (
    <div className="flex flex-col gap-2 px-3 py-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5 font-mono text-[11px] text-slate-400">
          <span>{item.materialCode || "-"}</span>
          {isMerged ? (
            <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-600">
              รวม {item.registryKeys.length} รายการ
            </span>
          ) : null}
        </div>
        <p className="break-words text-sm text-slate-900">{item.materialName || "-"}</p>
        <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
          <span
            className={cn(
              "rounded-md px-1.5 py-0.5 text-[10px] font-medium",
              STATUS_TONE_CLASS[status.tone] ?? STATUS_TONE_CLASS.muted,
            )}
          >
            {status.label}
          </span>
          <span>สั่ง {item.sourceOrderQty || String(item.orderQty || "-")}</span>
        </div>
      </div>
      <div className="shrink-0 sm:w-44">
        {editableScanQty ? (
          isMerged ? (
            <JobMergedScanQtyEditor jobId={jobId} underlying={item.underlying} />
          ) : (
            <JobItemScanQtyEditor
              jobId={jobId}
              registryKey={item.registryKeys[0]}
              value={item.orderQty}
              minimum={Math.max(item.loadedQty, item.deliveredQty, 0)}
            />
          )
        ) : (
          <div className="rounded-md bg-slate-50 px-3 py-2 text-center text-sm">
            <p className="text-[10px] text-muted-foreground">ต้องสแกน</p>
            <p className="font-semibold text-slate-900">{item.orderQty}</p>
          </div>
        )}
      </div>
    </div>
  );
}
