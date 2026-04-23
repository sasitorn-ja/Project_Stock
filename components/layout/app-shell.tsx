"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { Header } from "@/components/layout/header";
import { Sidebar } from "@/components/layout/sidebar";
import { cn } from "@/lib/utils";

export function AppShell({ children }: { children: React.ReactNode }) {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const pathname = usePathname();

  if (pathname.startsWith("/driver")) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
        <main className="mx-auto min-h-screen w-full max-w-3xl px-4 py-4">{children}</main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <Sidebar
        isCollapsed={isCollapsed}
        isMobileOpen={isMobileOpen}
        onCloseMobile={() => setIsMobileOpen(false)}
        onToggle={() => setIsCollapsed((value) => !value)}
      />
      <div
        className={cn(
          "min-h-screen transition-[padding-left] duration-300 ease-out",
          isCollapsed ? "lg:pl-[72px]" : "lg:pl-60",
        )}
      >
        <Header onMenuClick={() => setIsMobileOpen(true)} />
        <main className="mx-auto w-full max-w-[1600px] px-4 py-6 md:px-8">{children}</main>
      </div>
    </div>
  );
}
