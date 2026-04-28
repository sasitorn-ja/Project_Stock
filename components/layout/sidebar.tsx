"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity,
  BarChart3,
  Boxes,
  X,
  ClipboardList,
  FilePlus2,
  PanelLeftClose,
  PanelLeftOpen,
  FileText,
  Upload,
  QrCode,
  Truck,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

const sections = [
  {
    title: "JOB TRANSPORT",
    items: [
      { name: "PO รอจัดส่ง", href: "/po", icon: FileText },
      { name: "นำเข้า PO", href: "/po/import", icon: Upload },
      { name: "สร้าง Job", href: "/jobs/new", icon: FilePlus2 },
      { name: "Monitor Realtime", href: "/jobs/monitor", icon: Activity },
      { name: "Driver Room", href: "/driver", icon: QrCode },
    ],
  },
  {
    title: "MANAGEMENT",
    items: [
      { name: "รายการ Job", href: "/jobs", icon: Truck },
      { name: "รายการสินค้า", href: "/products", icon: Boxes },
      { name: "รายงาน", href: "/reports", icon: BarChart3 },
      { name: "Flow งาน", href: "/flow", icon: ClipboardList },
    ],
  },
];

export function Sidebar({
  isCollapsed,
  onToggle,
  isMobileOpen,
  onCloseMobile,
}: {
  isCollapsed: boolean;
  onToggle: () => void;
  isMobileOpen: boolean;
  onCloseMobile: () => void;
}) {
  const pathname = usePathname();

  return (
    <>
      <button
        aria-label="ปิดเมนู"
        className={cn(
          "fixed inset-0 z-40 bg-slate-950/45 backdrop-blur-sm transition-opacity lg:hidden",
          isMobileOpen ? "opacity-100" : "pointer-events-none opacity-0",
        )}
        onClick={onCloseMobile}
      />
      <aside
        className={cn(
          "fixed left-0 top-0 z-50 h-screen border-r border-slate-200 bg-white/95 shadow-[0_18px_40px_rgba(15,23,42,0.10)] backdrop-blur transition-all duration-300 ease-out dark:border-slate-800 dark:bg-slate-950/95 dark:shadow-[0_22px_45px_rgba(2,6,23,0.45)]",
          isCollapsed ? "lg:w-[72px]" : "lg:w-60",
          "w-72 max-w-[86vw]",
          isMobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0",
        )}
      >
      <div className="flex h-full flex-col px-2 py-4">
        <div
          className={cn(
            "mb-8 flex items-center px-2",
            isCollapsed ? "lg:justify-center" : "justify-between gap-2",
          )}
        >
          <div className={cn("flex items-center gap-3", isCollapsed && "lg:justify-center lg:gap-0")}>
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-900 text-sm font-bold text-white dark:bg-cyan-500 dark:text-slate-950">
              ST
            </div>
            <span
              className={cn(
                "text-lg font-bold tracking-normal text-slate-900 dark:text-slate-100",
                isCollapsed && "lg:hidden",
              )}
            >
                Job<span className="text-cyan-600 dark:text-cyan-300">Transport</span>
            </span>
          </div>

          <div className={cn("flex items-center gap-2", isCollapsed && "lg:hidden")}>
            <Button
              variant="outline"
              size="icon"
              onClick={onToggle}
              title="ย่อเมนู"
              className="hidden lg:inline-flex"
            >
              <PanelLeftClose className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="icon" onClick={onCloseMobile} title="ปิดเมนู" className="lg:hidden">
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {isCollapsed && (
          <div className="mb-6 hidden justify-center lg:flex">
            <Button variant="outline" size="icon" onClick={onToggle} title="ขยายเมนู">
              <PanelLeftOpen className="h-4 w-4" />
            </Button>
          </div>
        )}

        <nav className="flex-1 space-y-4 overflow-y-auto pr-1">
          {sections.map((section) => (
            <div key={section.title}>
              <div
                className={cn(
                  "mb-1 px-3 text-xs font-bold uppercase tracking-wider text-slate-400",
                  isCollapsed && "lg:hidden",
                )}
              >
                  {section.title}
              </div>
              <div className="space-y-1">
                {section.items.map((item) => {
                  const isActive =
                    pathname === item.href ||
                    (item.href !== "/" && item.href !== "/po" && pathname.startsWith(item.href));
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      title={isCollapsed ? item.name : undefined}
                      onClick={onCloseMobile}
                      aria-current={isActive ? "page" : undefined}
                      className={cn(
                        "group flex items-center rounded-lg text-sm font-medium transition-all",
                        isCollapsed ? "gap-3 px-3 py-2.5 lg:ml-1 lg:justify-center lg:px-2" : "gap-3 px-3 py-2.5",
                        isActive
                          ? "bg-cyan-50 text-cyan-700 shadow-[inset_0_0_0_1px_rgba(8,145,178,0.12)] dark:bg-slate-800 dark:text-cyan-300"
                          : "text-slate-600 hover:bg-slate-50 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-900 dark:hover:text-slate-100",
                      )}
                    >
                      <item.icon className="h-5 w-5 shrink-0" />
                      <span className={cn("truncate", isCollapsed && "lg:hidden")}>{item.name}</span>
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>
      </div>
      </aside>
    </>
  );
}
