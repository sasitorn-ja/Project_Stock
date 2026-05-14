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
            variant="outline"
            size="icon"
            className="size-8 shrink-0 border-[#d8dde6] bg-white text-slate-900 hover:bg-slate-100 lg:hidden"
            title={isMobileOpen ? "ปิดเมนู" : "เปิดเมนู"}
            aria-label={isMobileOpen ? "ปิดเมนู" : "เปิดเมนู"}
            aria-expanded={isMobileOpen}
            onClick={onMenuClick}
          >
            <Menu className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="hidden size-8 shrink-0 border-[#d8dde6] bg-white text-slate-900 hover:bg-slate-100 lg:inline-flex"
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
            <DropdownMenu.Trigger className="inline-flex h-8 cursor-pointer items-center gap-2 rounded-md border border-[#d8dde6] bg-white px-2 text-left text-sm font-medium text-slate-900 outline-none transition hover:bg-slate-100">
              <span className="flex size-6 items-center justify-center rounded-md border border-[#d8dde6] bg-[#171717] text-[11px] font-semibold text-white">
                ST
              </span>
              <span className="hidden sm:block">Store Transport</span>
              <ChevronDown className="size-4 text-slate-500" />
            </DropdownMenu.Trigger>
            <DropdownMenu.Portal>
              <DropdownMenu.Content
                align="end"
                sideOffset={6}
                className="z-50 min-w-44 rounded-md border border-[#d8dde6] bg-white p-1 text-sm text-slate-900 shadow-none"
              >
                <DropdownMenu.Item className="flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 outline-none hover:bg-slate-100">
                  <User className="size-4 text-slate-500" />
                  บัญชีผู้ใช้
                </DropdownMenu.Item>
                <DropdownMenu.Item className="flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 outline-none hover:bg-slate-100">
                  <Settings className="size-4 text-slate-500" />
                  ตั้งค่า
                </DropdownMenu.Item>
                <DropdownMenu.Separator className="my-1 h-px bg-[#d8dde6]" />
                <DropdownMenu.Item className="flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-red-700 outline-none hover:bg-red-50">
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
