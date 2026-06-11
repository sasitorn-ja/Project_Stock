"use client";

import { useState } from "react";
import { FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { apiPath } from "@/lib/app-paths";

export async function openTransportInvoice(jobId: string, targetWindow?: Window | null) {
  const response = await fetch(apiPath(`/api/jobs/${encodeURIComponent(jobId)}/transport-invoice`), {
    method: "POST",
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(payload?.error || "สร้างใบกำกับขนส่งไม่สำเร็จ");
  }

  const url = URL.createObjectURL(await response.blob());

  if (targetWindow && !targetWindow.closed) {
    targetWindow.location.href = url;
  } else {
    window.open(url, "_blank", "noopener,noreferrer");
  }

  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export function TransportInvoiceButton({ jobId }: { jobId: string }) {
  const [isLoading, setIsLoading] = useState(false);

  async function handleClick() {
    const targetWindow = window.open("", "_blank");
    setIsLoading(true);

    try {
      await openTransportInvoice(jobId, targetWindow);
    } catch (error) {
      targetWindow?.close();
      window.alert(error instanceof Error ? error.message : "สร้างใบกำกับขนส่งไม่สำเร็จ");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <Button type="button" variant="outline" size="sm" onClick={() => void handleClick()} disabled={isLoading} className="gap-1.5">
      <FileText className="h-3.5 w-3.5" />
      {isLoading ? "กำลังสร้าง PDF" : "ใบกำกับขนส่ง"}
    </Button>
  );
}
