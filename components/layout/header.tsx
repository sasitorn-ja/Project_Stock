"use client";

import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import * as Avatar from "@radix-ui/react-avatar";
import { Bell, ChevronDown, LogOut, Menu, Settings, UserCircle, Truck } from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
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

        <DropdownMenu.Root>
          <DropdownMenu.Trigger asChild>
            <button className="group flex cursor-pointer items-center gap-3 border-l border-slate-200 pl-3 transition-opacity hover:opacity-85 dark:border-slate-800 md:pl-5">
              <div className="hidden text-right sm:block">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-semibold leading-none text-slate-900 dark:text-slate-100">
                    Transport Admin
                  </p>
                  <Badge variant="secondary" className="hidden md:inline-flex">
                    Online
                  </Badge>
                </div>
                <p className="mt-1 text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Job Control
                </p>
              </div>
              <Avatar.Root className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full border border-slate-200 bg-slate-100 dark:border-slate-800 dark:bg-slate-900">
                <Avatar.Fallback className="text-sm font-semibold text-slate-600 dark:text-slate-300">
                  SA
                </Avatar.Fallback>
              </Avatar.Root>
              <ChevronDown className="hidden h-4 w-4 text-slate-400 sm:block" />
            </button>
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content
              align="end"
              sideOffset={10}
              className="z-50 w-56 rounded-lg border border-slate-200 bg-white p-2 shadow-lg dark:border-slate-800 dark:bg-slate-950"
            >
              <DropdownMenu.Item asChild>
                <Link
                  href="/settings"
                  className="flex cursor-pointer items-center gap-3 rounded-md px-3 py-2 text-sm text-slate-700 outline-none transition-colors hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-900"
                >
                  <UserCircle className="h-4 w-4" />
                  โปรไฟล์
                </Link>
              </DropdownMenu.Item>
              <DropdownMenu.Item asChild>
                <Link
                  href="/settings"
                  className="flex cursor-pointer items-center gap-3 rounded-md px-3 py-2 text-sm text-slate-700 outline-none transition-colors hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-900"
                >
                  <Settings className="h-4 w-4" />
                  ตั้งค่า
                </Link>
              </DropdownMenu.Item>
              <DropdownMenu.Separator className="my-1 h-px bg-slate-200 dark:bg-slate-800" />
              <DropdownMenu.Item className="flex cursor-pointer items-center gap-3 rounded-md px-3 py-2 text-sm text-red-600 outline-none transition-colors hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/30">
                <LogOut className="h-4 w-4" />
                ออกจากระบบ
              </DropdownMenu.Item>
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
      </div>
    </header>
  );
}
