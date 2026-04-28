"use client";

import { Bell, Menu, Truck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/layout/theme-toggle";

export function Header({ onMenuClick }: { onMenuClick: () => void }) {
  return (
    <header className="sticky top-0 z-30 flex h-16 w-full items-center justify-between border-b border-slate-200 bg-white/85 px-4 backdrop-blur-md dark:border-slate-800 dark:bg-slate-950/85 md:px-8">
      <div className="flex min-w-0 items-center gap-3">
        <Button
          variant="outline"
          size="icon"
          className="shrink-0 lg:hidden"
          title="เปิดเมนู"
          onClick={onMenuClick}
        >
          <Menu className="h-4 w-4" />
        </Button>
        <div className="hidden h-9 w-9 items-center justify-center rounded-lg bg-cyan-50 text-cyan-700 dark:bg-cyan-950 dark:text-cyan-300 sm:flex">
          <Truck className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <h1 className="truncate text-base font-semibold tracking-normal text-slate-900 dark:text-slate-100 md:text-lg">
            Store QR Job Transport
          </h1>
          <p className="hidden text-xs text-slate-500 dark:text-slate-400 sm:block">
            ระบบขนส่ง ตรวจรับ-ส่งสินค้าแบบเป็น Job
          </p>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-2 md:gap-4">
        <ThemeToggle />

        <Button variant="outline" size="icon" className="relative hidden sm:inline-flex" title="แจ้งเตือน">
          <Bell className="h-4 w-4" />
          <span className="absolute right-2 top-2 flex h-2 w-2 rounded-full bg-red-500" />
        </Button>
      </div>
    </header>
  );
}
