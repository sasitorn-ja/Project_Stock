"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { Header } from "@/components/layout/header";
import { Sidebar } from "@/components/layout/sidebar";
import { withBasePath, withoutBasePath } from "@/lib/app-paths";
import type { AppSession } from "@/lib/rmc-session";

export function AppShell({ children, session }: { children: React.ReactNode; session: AppSession | null }) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const pathname = withoutBasePath(usePathname());
  const searchParams = useSearchParams();

  useEffect(() => {
    setIsMobileOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!isMobileOpen) return;
    const previousOverflow = document.body.style.overflow;
    const previousPaddingRight = document.body.style.paddingRight;
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
    if (scrollbarWidth > 0) {
      document.body.style.paddingRight = `${parseFloat(window.getComputedStyle(document.body).paddingRight) + scrollbarWidth}px`;
    }
    document.body.style.overflow = "hidden";
    const previousFocus = document.activeElement as HTMLElement | null;
    const menu = menuRef.current;
    const focusable = () => Array.from(menu?.querySelectorAll<HTMLElement>('a[href], button:not([disabled])') ?? []).filter((element) => element.tabIndex >= 0);
    focusable()[0]?.focus();
    function handleKey(event: KeyboardEvent) {
      if (event.key === "Escape") setIsMobileOpen(false);
      if (event.key !== "Tab") return;
      const items = focusable();
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }
    document.addEventListener("keydown", handleKey);
    const desktop = window.matchMedia("(min-width: 1024px)");
    const closeOnDesktop = () => { if (desktop.matches) setIsMobileOpen(false); };
    desktop.addEventListener("change", closeOnDesktop);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.body.style.paddingRight = previousPaddingRight;
      document.removeEventListener("keydown", handleKey);
      desktop.removeEventListener("change", closeOnDesktop);
      previousFocus?.focus();
    };
  }, [isMobileOpen]);

  if (pathname.startsWith("/login")) {
    return <>{children}</>;
  }

  if (pathname.startsWith("/driver-room") || (pathname === "/driver" && Boolean(searchParams.get("jobId")?.trim()))) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-900">
        <main className="min-h-screen w-full">{children}</main>
      </div>
    );
  }

  return (
    <div className="workspace-backdrop relative isolate min-h-screen text-slate-900" style={{ "--warehouse-image": `url("${withBasePath("/warehouse-background.webp")}")` } as CSSProperties}>
      <div ref={menuRef}>
        <Sidebar
          isOpen={isSidebarOpen}
          isMobileOpen={isMobileOpen}
          onCloseMobile={() => setIsMobileOpen(false)}
        />
      </div>
      <div
        className="workspace-frame min-h-screen min-w-0"
        data-sidebar-open={isSidebarOpen}
        inert={isMobileOpen}
        aria-hidden={isMobileOpen || undefined}
      >
        <Header
          session={session}
          isSidebarOpen={isSidebarOpen}
          isMobileOpen={isMobileOpen}
          onMenuClick={() => setIsMobileOpen((value) => !value)}
          onToggleSidebar={() => setIsSidebarOpen((value) => !value)}
        />
        <main id="main-content" tabIndex={-1} className="w-full min-w-0 px-3 py-4 sm:px-5 sm:py-6 md:px-7 xl:px-8">
          <div key={pathname} className="workspace-content mx-auto w-full max-w-[1600px]">{children}</div>
        </main>
      </div>
    </div>
  );
}
