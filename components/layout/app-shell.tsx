"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
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
        <main className="w-full min-w-0 px-5 py-6 md:px-8">{children}</main>
      </div>
    </div>
  );
}
