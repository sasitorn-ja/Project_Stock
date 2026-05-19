"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Activity, FilePlus2, FileText, QrCode, Upload } from "lucide-react";
import { cn } from "@/lib/utils";

const navItems = [
  { name: "นำเข้า PO", href: "/po/import", icon: Upload },
  { name: "PO", href: "/po", icon: FileText },
  { name: "สร้างงาน", href: "/jobs/new", icon: FilePlus2 },
  { name: "ติดตาม", href: "/jobs/monitor", icon: Activity },
  { name: "คนขับ", href: "/driver", icon: QrCode },
];

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="เมนูหลัก"
      className="fixed bottom-0 left-0 right-0 z-40 border-t border-[#d8dde6] bg-white lg:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <div className="flex h-14 items-stretch">
        {navItems.map((item) => {
          const isActive =
            pathname === item.href ||
            (item.href !== "/po" && item.href !== "/jobs" && pathname.startsWith(item.href));

          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={isActive ? "page" : undefined}
              className={cn(
                "flex flex-1 flex-col items-center justify-center gap-0.5 text-[10px] font-medium transition-colors",
                isActive
                  ? "text-[#0d7a5f]"
                  : "text-slate-400 hover:text-slate-700",
              )}
            >
              <item.icon
                className={cn(
                  "h-5 w-5 shrink-0",
                  isActive ? "text-[#0d7a5f]" : "text-slate-400",
                )}
              />
              <span className="leading-tight">{item.name}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
