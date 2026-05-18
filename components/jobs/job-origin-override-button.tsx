"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LockKeyhole, UnlockKeyhole } from "lucide-react";
import { Button } from "@/components/ui/button";
import { updateJobOriginOverride } from "@/lib/job-db";

export function JobOriginOverrideButton({
  jobId,
  enabled,
  isOriginLocked,
}: {
  jobId: string;
  enabled: boolean;
  isOriginLocked: boolean;
}) {
  const router = useRouter();
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState("");

  async function handleToggle() {
    const nextEnabled = !enabled;
    const confirmed = window.confirm(
      nextEnabled
        ? `เปิดต้นทางกรณีพิเศษให้ Job ${jobId} ใช่ไหม?\n\nคนขับจะเช็กอินต้นทางใหม่ได้ 1 ครั้ง แม้ระบบปิดต้นทางหลังโหลดครบแล้ว`
        : `ปิดสิทธิ์ต้นทางกรณีพิเศษของ Job ${jobId} ใช่ไหม?`,
    );

    if (!confirmed) {
      return;
    }

    setIsSaving(true);
    setMessage("");

    try {
      await updateJobOriginOverride({
        jobId,
        allowOriginRecheckAfterLocked: nextEnabled,
      });
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "อัปเดตสิทธิ์ต้นทางไม่สำเร็จ");
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
        disabled={isSaving || !isOriginLocked}
        className="w-full gap-2 sm:w-auto"
      >
        {enabled ? <LockKeyhole className="h-4 w-4" /> : <UnlockKeyhole className="h-4 w-4" />}
        {isSaving ? "กำลังบันทึก" : enabled ? "ปิดสิทธิ์ต้นทางพิเศษ" : "Admin เปิดต้นทางกรณีพิเศษ"}
      </Button>
      {!isOriginLocked ? <p className="text-xs text-muted-foreground">ต้นทางยังไม่ถูกปิดหลังโหลดครบ</p> : null}
      {message ? <p className="whitespace-pre-line text-xs text-red-600">{message}</p> : null}
    </div>
  );
}
