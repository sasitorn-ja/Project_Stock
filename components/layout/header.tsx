"use client";

import { Menu } from "lucide-react";
import { Button } from "@/components/ui/button";

export function Header({
  isSidebarOpen,
  isMobileOpen,
  onMenuClick,
  onToggleSidebar,
}: {
  isSidebarOpen: boolean;
  isMobileOpen: boolean;
  onMenuClick: () => void;
  onToggleSidebar: () => void;
}) {
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
        </div>

        <div />
      </div>
    </header>
  );
}
