"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { BottomNav } from "@/components/layout/bottom-nav";
import { Header } from "@/components/layout/header";
import { Sidebar } from "@/components/layout/sidebar";
import { cn } from "@/lib/utils";

export function AppShell({ children }: { children: React.ReactNode }) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const pathname = usePathname();

  if (pathname.startsWith("/driver-room")) {
    return (
      <div className="min-h-screen bg-[#f5f6f8] text-slate-900">
        <main className="mx-auto min-h-screen w-full max-w-3xl px-3 py-3 sm:px-4 sm:py-4">{children}</main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f5f6f8] text-slate-900">
      <Sidebar
        isOpen={isSidebarOpen}
        isMobileOpen={isMobileOpen}
        onCloseMobile={() => setIsMobileOpen(false)}
      />
      <div
        className={cn(
          "min-h-screen transition-[padding-left] duration-200 ease-out",
          isSidebarOpen ? "lg:pl-64" : "lg:pl-0",
        )}
      >
        <Header
          isSidebarOpen={isSidebarOpen}
          isMobileOpen={isMobileOpen}
          onMenuClick={() => setIsMobileOpen((value) => !value)}
          onToggleSidebar={() => setIsSidebarOpen((value) => !value)}
        />
        {/* pb-16 เผื่อ BottomNav บน mobile (lg:pb-0 เมื่อมี sidebar) */}
        <main className="w-full min-w-0 px-3 py-4 pb-20 sm:px-5 sm:py-6 sm:pb-20 md:px-8 lg:pb-6">{children}</main>
        <BottomNav />
      </div>
    </div>
  );
}
