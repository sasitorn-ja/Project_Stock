"use client";

import { useEffect, useState } from "react";
import { AlertTriangle } from "lucide-react";

type StorageStatus = {
  mode: "local-file" | "postgres";
  shared: boolean;
  hosted: boolean;
  writable: boolean;
  message: string;
};

export function StorageWarning() {
  const [status, setStatus] = useState<StorageStatus | null>(null);

  useEffect(() => {
    async function loadStatus() {
      try {
        const response = await fetch("/api/system/storage-status", { cache: "no-store" });
        if (!response.ok) {
          return;
        }

        setStatus((await response.json()) as StorageStatus);
      } catch {
        return;
      }
    }

    void loadStatus();
  }, []);

  if (!status || status.shared) {
    return null;
  }

  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-950 dark:bg-amber-950/30 dark:text-amber-100">
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
        <div className="space-y-1">
          <p className="font-medium">{status.hosted ? "Shared storage ยังไม่พร้อมบน deployment นี้" : "ระบบยังใช้ local file storage"}</p>
          <p>{status.message}</p>
        </div>
      </div>
    </div>
  );
}
