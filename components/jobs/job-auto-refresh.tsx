"use client";

import { useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";

export function JobAutoRefresh({ intervalMs = 2000 }: { intervalMs?: number }) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  useEffect(() => {
    function refreshJobs() {
      if (document.visibilityState === "hidden") {
        return;
      }

      startTransition(() => {
        router.refresh();
      });
    }

    const intervalId = window.setInterval(refreshJobs, intervalMs);

    window.addEventListener("focus", refreshJobs);
    document.addEventListener("visibilitychange", refreshJobs);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener("focus", refreshJobs);
      document.removeEventListener("visibilitychange", refreshJobs);
    };
  }, [intervalMs, router]);

  return null;
}
