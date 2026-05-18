"use client";

import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { ChevronDown, LogOut, Menu, Settings, User } from "lucide-react";
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
    <header className="sticky top-0 z-30 h-14 border-b border-[#d8dde6] bg-white">
      <div className="flex h-full items-center justify-between px-4 md:px-5">
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

        <div className="flex shrink-0 items-center gap-2">
          <DropdownMenu.Root>
            <DropdownMenu.Trigger className="inline-flex h-8 cursor-pointer items-center gap-2 rounded-md border border-[#d8dde6] bg-white px-2 pr-3 text-left text-sm font-medium text-slate-900 outline-none transition hover:bg-slate-100 focus-visible:ring-2 focus-visible:ring-ring">
              <span className="flex size-6 items-center justify-center rounded-md bg-[#171717] text-[10px] font-bold text-white">
                ST
              </span>
              <div className="hidden sm:block">
                <p className="text-[12px] font-semibold leading-tight text-slate-800">Store Transport</p>
                <p className="text-[10px] leading-tight text-slate-400">DC Bangna</p>
              </div>
              <ChevronDown className="size-3.5 text-slate-400" />
            </DropdownMenu.Trigger>
            <DropdownMenu.Portal>
              <DropdownMenu.Content
                align="end"
                sideOffset={6}
                className="z-50 min-w-48 rounded-md border border-[#d8dde6] bg-white p-1 text-sm text-slate-900 shadow-none"
              >
                <div className="px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400">บัญชี</div>
                <DropdownMenu.Item className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 outline-none hover:bg-slate-50">
                  <User className="size-4 text-slate-400" />
                  บัญชีผู้ใช้
                </DropdownMenu.Item>
                <DropdownMenu.Item className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 outline-none hover:bg-slate-50">
                  <Settings className="size-4 text-slate-400" />
                  ตั้งค่า
                </DropdownMenu.Item>
                <DropdownMenu.Separator className="my-1 h-px bg-[#f0f2f5]" />
                <DropdownMenu.Item className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-red-600 outline-none hover:bg-red-50">
                  <LogOut className="size-4" />
                  ออกจากระบบ
                </DropdownMenu.Item>
              </DropdownMenu.Content>
            </DropdownMenu.Portal>
          </DropdownMenu.Root>
        </div>
      </div>
    </header>
  );
}
