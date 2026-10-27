"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useSyncExternalStore } from "react";
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
import { SyncDropMascot } from "@/components/brand/syncdrop-mascot";

function subscribeToDesktop(onChange: () => void) {
  const query = window.matchMedia("(min-width: 1024px)");
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

function getDesktopSnapshot() {
  return window.matchMedia("(min-width: 1024px)").matches;
}

function getServerDesktopSnapshot() {
  return true;
}

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
  const isDesktop = useSyncExternalStore(subscribeToDesktop, getDesktopSnapshot, getServerDesktopSnapshot);
  const isVisible = isDesktop ? isOpen : isMobileOpen;

  return (
    <>
      <button
        aria-label="ปิดเมนู"
        className="sidebar-backdrop fixed inset-0 z-40 bg-slate-950/40 backdrop-blur-sm lg:hidden"
        data-open={isMobileOpen}
        onClick={onCloseMobile}
        tabIndex={-1}
        aria-hidden={!isMobileOpen}
      />
      <aside
        className="sidebar-panel fixed inset-y-0 left-0 z-50 h-dvh border-r border-slate-200 bg-white text-slate-700 shadow-sm shadow-slate-900/5"
        data-desktop-open={isOpen}
        data-mobile-open={isMobileOpen}
        id="workspace-navigation"
        inert={!isVisible}
        aria-hidden={!isVisible}
        role={!isDesktop && isMobileOpen ? "dialog" : undefined}
        aria-modal={!isDesktop && isMobileOpen ? true : undefined}
        aria-label="เมนูหลัก SyncDrop"
      >
        <div className="flex h-full flex-col">
          <div className="flex h-[76px] shrink-0 items-center justify-between gap-2 border-b border-slate-200 px-4 lg:px-5">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex h-12 w-[58px] shrink-0 items-center justify-center">
                <Image
                  src={withBasePath("/logo.png")}
                  alt="SyncDrop Logo"
                  width={58}
                  height={48}
                  unoptimized
                  className="h-auto max-h-full w-full object-contain"
                />
              </div>
              <div className="min-w-0">
                <p className="truncate text-base font-semibold leading-none tracking-tight text-slate-900">SyncDrop</p>
              </div>
            </div>

            <div className="flex items-center lg:hidden">
              <Button
                variant="ghost"
                size="icon"
                onClick={onCloseMobile}
                title="ปิดเมนู"
                aria-label="ปิดเมนู"
                className="size-8 shrink-0 text-slate-500 hover:bg-slate-100 hover:text-slate-900"
              >
                <X className="h-5 w-5" />
              </Button>
            </div>
          </div>

          <nav aria-label="เมนูหลัก" className="min-h-0 flex-1 space-y-6 overflow-y-auto px-3 py-5">
            {sections.map((section) => (
              <div key={section.title}>
                <div className="mb-2 px-3 text-[10px] font-medium tracking-[0.12em] text-slate-400">
                  {section.title}
                </div>
                <div className="space-y-1">
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
                          "group relative flex h-10 w-full cursor-pointer items-center gap-3 rounded-lg px-3 text-[13px] transition-colors duration-200 focus-visible:outline-blue-600",
                          isActive
                            ? "bg-sky-100 font-medium text-blue-700"
                            : "text-slate-600 hover:bg-sky-50 hover:text-blue-700",
                        )}
                      >
                        {isActive && (
                          <span className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-blue-600" />
                        )}
                        <item.icon className={cn("size-[18px] shrink-0", !isActive && "text-slate-500 group-hover:text-blue-700")} />
                        <span className="truncate">{item.name}</span>
                      </Link>
                    );
                  })}
                </div>
              </div>
            ))}
          </nav>
          <div className="flex shrink-0 justify-center px-4 pb-4 pt-2 [@media(max-height:640px)]:hidden">
            <SyncDropMascot className="w-40" sizes="160px" />
          </div>
        </div>
      </aside>
    </>
  );
}
