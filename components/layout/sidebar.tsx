"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity,
  History,
  X,
  FilePlus2,
  FileText,
  Upload,
  QrCode,
  Truck,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

const sections = [
  {
    title: "JOB TRANSPORT",
    items: [
      { name: "นำเข้า PO", href: "/po/import", icon: Upload },
      { name: "PO รอจัดส่ง", href: "/po", icon: FileText },
      { name: "สร้าง Job", href: "/jobs/new", icon: FilePlus2 },
      { name: "Monitor Realtime", href: "/jobs/monitor", icon: Activity },
      { name: "Driver Room", href: "/driver", icon: QrCode },
    ],
  },
  {
    title: "MANAGEMENT",
    items: [
      { name: "รายการ Job", href: "/jobs", icon: Truck },
      { name: "ประวัติงาน", href: "/jobs/history", icon: History },
    ],
  },
];

export function Sidebar({
  isOpen,
  isMobileOpen,
  onCloseMobile,
}: {
  isOpen: boolean;
  isMobileOpen: boolean;
  onCloseMobile: () => void;
}) {
  const pathname = usePathname();

  return (
    <>
      <button
        aria-label="ปิดเมนู"
        className={cn(
          "fixed inset-0 z-40 bg-slate-950/45 backdrop-blur-sm transition-opacity lg:hidden",
          isMobileOpen ? "opacity-100" : "pointer-events-none opacity-0",
        )}
        onClick={onCloseMobile}
      />
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 h-screen border-r border-[#d8dde6] bg-white text-slate-900 shadow-none transition-transform duration-200 ease-out",
          "w-72 max-w-[86vw]",
          isMobileOpen ? "translate-x-0" : "-translate-x-full",
          isOpen ? "lg:translate-x-0 lg:w-60" : "lg:-translate-x-full lg:w-60",
        )}
      >
        <div className="flex h-full flex-col">
          <div className="flex h-14 shrink-0 items-center justify-between gap-2 border-b border-[#d8dde6] bg-white px-4 py-0">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex size-8 shrink-0 items-center justify-center rounded-md border border-[#d8dde6] bg-[#171717] text-xs font-bold text-white">
                ST
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-slate-900">Job Transport</p>
                <p className="truncate text-[11px] text-slate-500">Store QR System</p>
              </div>
            </div>

            <div className="flex items-center lg:hidden">
              <Button
                variant="outline"
                size="icon"
                onClick={onCloseMobile}
                title="ปิดเมนู"
                className="size-8 border-[#d8dde6] bg-white text-slate-900 hover:bg-slate-100"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <nav className="min-h-0 flex-1 space-y-4 overflow-y-auto bg-white px-2 py-2">
            {sections.map((section) => (
              <div key={section.title}>
                <div className="mb-1 px-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                  {section.title}
                </div>
                <div className="space-y-1">
                  {section.items.map((item) => {
                    const isActive =
                      pathname === item.href ||
                      (item.href !== "/" && item.href !== "/po" && item.href !== "/jobs" && pathname.startsWith(item.href));
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        onClick={onCloseMobile}
                        aria-current={isActive ? "page" : undefined}
                        className={cn(
                          "group flex h-8 w-full cursor-pointer items-center gap-2 rounded-md px-2 text-sm font-medium transition-colors",
                          isActive
                            ? "bg-slate-100 text-slate-950"
                            : "text-slate-600 hover:bg-slate-100 hover:text-slate-950",
                        )}
                      >
                        <item.icon className="size-4 shrink-0" />
                        <span className="truncate">{item.name}</span>
                      </Link>
                    );
                  })}
                </div>
              </div>
            ))}
          </nav>
        </div>
      </aside>
    </>
  );
}
