"use client";

import Image from "next/image";
import { ChevronRight, LogOut, Menu, UserRound } from "lucide-react";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import { withBasePath, withoutBasePath } from "@/lib/app-paths";
import type { AppSession } from "@/lib/rmc-session";
import { cn } from "@/lib/utils";

export function Header({
  session,
  isSidebarOpen,
  isMobileOpen,
  onMenuClick,
  onToggleSidebar,
}: {
  session: AppSession | null;
  isSidebarOpen: boolean;
  isMobileOpen: boolean;
  onMenuClick: () => void;
  onToggleSidebar: () => void;
}) {
  const displayName = session?.user?.name || session?.user?.email || "ผู้ใช้งาน";
  const pathname = withoutBasePath(usePathname());
  const section = pathname.startsWith("/po/import") ? "นำเข้า PO" : pathname === "/po" ? "PO รอจัดส่ง" : pathname.startsWith("/jobs/new") ? "สร้างงาน" : pathname.startsWith("/jobs/monitor") ? "ติดตามงาน" : pathname.startsWith("/reports") || pathname.startsWith("/jobs/history") ? "ประวัติงาน" : pathname.startsWith("/driver") ? "ห้องคนขับ" : "รายการงาน";

  return (
    <header className="sticky top-0 z-30 h-[76px] border-b border-slate-200/70 bg-white/90 backdrop-blur-xl">
      <a href="#main-content" className="absolute left-4 top-2 z-50 -translate-y-24 rounded-lg bg-primary px-4 py-2 text-white focus:translate-y-0">ข้ามไปยังเนื้อหา</a>
      <div className="flex h-full items-center justify-between gap-3 px-3 sm:px-5 md:px-7 xl:px-8">
        <div className="flex min-w-0 items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            className="size-10 shrink-0 text-slate-500 hover:bg-sky-50 hover:text-primary lg:hidden"
            title={isMobileOpen ? "ปิดเมนู" : "เปิดเมนู"}
            aria-label={isMobileOpen ? "ปิดเมนู" : "เปิดเมนู"}
            aria-expanded={isMobileOpen}
            aria-controls="workspace-navigation"
            onClick={onMenuClick}
          >
            <Menu className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="hidden size-9 shrink-0 text-slate-500 hover:bg-sky-50 hover:text-primary lg:inline-flex"
            title={isSidebarOpen ? "ซ่อนเมนู" : "แสดงเมนู"}
            aria-label={isSidebarOpen ? "ซ่อนเมนู" : "แสดงเมนู"}
            aria-expanded={isSidebarOpen}
            aria-controls="workspace-navigation"
            onClick={onToggleSidebar}
          >
            <Menu className="size-[18px]" />
          </Button>

          <div className="hidden items-center gap-2 border-l border-slate-200 pl-4 text-xs sm:flex">
            <span className="text-slate-400">Workspace</span><ChevronRight className="size-3 text-slate-300" /><span className="font-medium text-slate-700">{section}</span>
          </div>

          <div
            className={cn(
              "flex min-w-0 items-center gap-2.5 sm:hidden",
              isSidebarOpen && "lg:hidden",
            )}
          >
            <div className="flex h-11 shrink-0 items-center justify-center">
              <Image
                src={withBasePath("/logo.png")}
                alt="SyncDrop Logo"
                width={53}
                height={44}
                unoptimized
                className="h-11 w-auto object-contain"
              />
            </div>
            <div className="min-w-0">
              <p className="truncate text-base font-semibold leading-tight tracking-[-0.04em] text-slate-900">
                SyncDrop
              </p>
            </div>
          </div>
        </div>

        {session ? (
          <div className="flex min-w-0 items-center gap-2">
            <div className="flex min-w-0 items-center gap-2.5 sm:mr-2">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-full border border-sky-200 bg-gradient-to-br from-sky-50 to-blue-100 text-primary"><UserRound className="size-4" /></span>
              <div className="hidden min-w-0 sm:block"><p className="max-w-44 truncate text-xs font-semibold text-slate-700">{displayName}</p><p className="mt-0.5 text-[10px] text-slate-400">{session.mode === "remote-development" ? "Local workspace" : "RMC workspace"}</p></div>
            </div>
            <Button
              asChild
              variant="outline"
              size="sm"
              className="gap-1.5 border-[#d8dde6] text-slate-700 hover:bg-slate-100"
              aria-label="ออกจากระบบ"
            >
              <a href={withBasePath("/api/auth/logout")}>
                <LogOut className="h-4 w-4" />
                <span className="hidden sm:inline">ออกจากระบบ</span>
              </a>
            </Button>
          </div>
        ) : (
          <div />
        )}
      </div>
    </header>
  );
}
