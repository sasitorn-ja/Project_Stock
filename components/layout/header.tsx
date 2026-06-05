"use client";

import Image from "next/image";
import { LogOut, Menu, UserCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { withBasePath } from "@/lib/app-paths";
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

  return (
    <header className="sticky top-0 z-30 h-[60px] border-b border-[#d8dde6] bg-white">
      <div className="flex h-full items-center justify-between px-5 md:px-8">
        <div className="flex min-w-0 items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            className="size-8 shrink-0 border border-transparent text-slate-600 hover:border-[#d8dde6] hover:bg-slate-100 hover:text-slate-900 lg:hidden"
            title={isMobileOpen ? "ปิดเมนู" : "เปิดเมนู"}
            aria-label={isMobileOpen ? "ปิดเมนู" : "เปิดเมนู"}
            aria-expanded={isMobileOpen}
            onClick={onMenuClick}
          >
            <Menu className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="hidden size-8 shrink-0 border border-transparent text-slate-600 hover:border-[#d8dde6] hover:bg-slate-100 hover:text-slate-900 lg:inline-flex"
            title={isSidebarOpen ? "ซ่อนเมนู" : "แสดงเมนู"}
            aria-label={isSidebarOpen ? "ซ่อนเมนู" : "แสดงเมนู"}
            aria-expanded={isSidebarOpen}
            onClick={onToggleSidebar}
          >
            <Menu className="h-4 w-4" />
          </Button>

          <div
            className={cn(
              "flex min-w-0 items-center gap-2.5",
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
              <p className="truncate text-sm font-semibold leading-tight text-slate-900">
                SyncDrop
              </p>
            </div>
          </div>
        </div>

        {session ? (
          <div className="flex min-w-0 items-center gap-2">
            <div className="hidden min-w-0 items-center gap-2 rounded-md border border-[#d8dde6] bg-white px-2.5 py-1.5 text-sm text-slate-700 sm:flex">
              <UserCircle className="h-4 w-4 shrink-0 text-slate-500" />
              <span className="max-w-48 truncate">{displayName}</span>
            </div>
            <Button
              asChild
              variant="outline"
              size="sm"
              className="gap-1.5 border-[#d8dde6] text-slate-700 hover:bg-slate-100"
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
