"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import {
  X,
  FilePlus2,
  FileSpreadsheet,
  FileText,
  Upload,
  QrCode,
  Truck,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { withBasePath, withoutBasePath } from "@/lib/app-paths";
import { Button } from "@/components/ui/button";

const sections = [
  {
    title: "งานขนส่ง",
    items: [
      { name: "นำเข้า PO", href: "/po/import", icon: Upload },
      { name: "PO รอจัดส่ง", href: "/po", icon: FileText },
      { name: "สร้างงาน", href: "/jobs/new", icon: FilePlus2 },
      { name: "ห้องคนขับ", href: "/driver", icon: QrCode },
    ],
  },
  {
    title: "จัดการงาน",
    items: [
      { name: "รายการงาน", href: "/jobs", icon: Truck },
      { name: "ประวัติงาน", href: "/reports", icon: FileSpreadsheet },
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
  const pathname = withoutBasePath(usePathname());

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
          "w-64 max-w-[86vw]",
          isMobileOpen ? "translate-x-0" : "-translate-x-full",
          isOpen ? "lg:translate-x-0 lg:w-56" : "lg:-translate-x-full lg:w-56",
        )}
      >
        <div className="flex h-full flex-col">
          <div className="flex h-[60px] shrink-0 items-center justify-between gap-2 border-b border-[#d8dde6] bg-white px-4 py-0">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex h-12 shrink-0 items-center justify-center">
                <Image
                  src={withBasePath("/logo.png")}
                  alt="SyncDrop Logo"
                  width={58}
                  height={48}
                  unoptimized
                  className="h-12 w-auto object-contain"
                />
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-slate-900">SyncDrop</p>
              </div>
            </div>

            <div className="flex items-center lg:hidden">
              <Button
                variant="outline"
                size="icon"
                onClick={onCloseMobile}
                title="ปิดเมนู"
                className="size-10 shrink-0 border-[#d8dde6] bg-white text-slate-900 hover:bg-slate-100"
              >
                <X className="h-5 w-5" />
              </Button>
            </div>
          </div>

          <nav className="min-h-0 flex-1 space-y-5 overflow-y-auto bg-white px-2.5 py-3">
            {sections.map((section) => (
              <div key={section.title}>
                <div className="mb-2 px-3 text-[10px] font-bold uppercase tracking-[0.15em] text-slate-400">
                  {section.title}
                </div>
                <div className="space-y-0.5">
                  {section.items.map((item) => {
                    const isActive =
                      pathname === item.href ||
                      (item.href === "/jobs" && pathname.startsWith("/jobs/monitor")) ||
                      (item.href !== "/" && item.href !== "/po" && item.href !== "/jobs" && pathname.startsWith(item.href));
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        aria-current={isActive ? "page" : undefined}
                        className={cn(
                          "group relative flex h-9 w-full cursor-pointer items-center gap-2.5 rounded-md px-3 text-[13.5px] font-medium transition-colors",
                          isActive
                            ? "bg-[#f0faf7] text-[#0d7a5f]"
                            : "text-slate-500 hover:bg-slate-50 hover:text-slate-800",
                        )}
                      >
                        {isActive && (
                          <span className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-[#0d7a5f]" />
                        )}
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
