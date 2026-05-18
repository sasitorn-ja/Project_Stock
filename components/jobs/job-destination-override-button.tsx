"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ShieldCheck, ShieldOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { updateJobDestinationOverride } from "@/lib/job-db";

export function JobDestinationOverrideButton({
  jobId,
  enabled,
  isFullyLoaded,
}: {
  jobId: string;
  enabled: boolean;
  isFullyLoaded: boolean;
}) {
  const router = useRouter();
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState("");

  async function handleToggle() {
    const nextEnabled = !enabled;
    const confirmed = window.confirm(
      nextEnabled
        ? `เปิดปลายทางกรณีพิเศษให้ Job ${jobId} ใช่ไหม?\n\nคนขับจะเช็กอินและสแกนส่งปลายทางได้ แม้สินค้ายังขึ้นรถไม่ครบ`
        : `ปิดสิทธิ์เปิดปลายทางกรณีพิเศษของ Job ${jobId} ใช่ไหม?`,
    );

    if (!confirmed) {
      return;
    }

    setIsSaving(true);
    setMessage("");

    try {
      await updateJobDestinationOverride({
        jobId,
        allowDestinationBeforeFullyLoaded: nextEnabled,
      });
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "อัปเดตสิทธิ์ปลายทางไม่สำเร็จ");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="space-y-1">
      <Button
        type="button"
        variant={enabled ? "outline" : "secondary"}
        size="sm"
        onClick={handleToggle}
        disabled={isSaving || isFullyLoaded}
        className="w-full gap-2 sm:w-auto"
      >
        {enabled ? <ShieldOff className="h-4 w-4" /> : <ShieldCheck className="h-4 w-4" />}
        {isSaving ? "กำลังบันทึก" : enabled ? "ปิดสิทธิ์ปลายทางพิเศษ" : "Admin เปิดปลายทางกรณีพิเศษ"}
      </Button>
      {isFullyLoaded ? <p className="text-xs text-muted-foreground">โหลดครบแล้ว ไม่ต้องใช้สิทธิ์พิเศษ</p> : null}
      {message ? <p className="whitespace-pre-line text-xs text-red-600">{message}</p> : null}
    </div>
  );
}
