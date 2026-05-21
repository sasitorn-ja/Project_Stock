"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { deleteJob } from "@/lib/job-db";

export function JobDeleteButton({
  jobId,
  label = "ลบ Job",
  redirectTo,
  iconOnly = false,
}: {
  jobId: string;
  label?: string;
  redirectTo?: string;
  iconOnly?: boolean;
}) {
  const router = useRouter();
  const [isDeleting, setIsDeleting] = useState(false);
  const [message, setMessage] = useState("");

  async function handleDelete() {
    const confirmed = window.confirm(
      `ต้องการลบ Job ${jobId} ใช่ไหม?\n\nระบบจะลบห้องงานนี้และคืน PO กลับไปหน้า PO รอจัดส่ง`,
    );

    if (!confirmed) {
      return;
    }

    setIsDeleting(true);
    setMessage("");

    try {
      await deleteJob(jobId);
      if (redirectTo) {
        router.push(redirectTo);
      }
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "ลบ Job ไม่สำเร็จ");
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <div className="space-y-2">
      <Button
        type="button"
        variant="destructive"
        size={iconOnly ? "icon" : "sm"}
        onClick={handleDelete}
        disabled={isDeleting}
        className={iconOnly ? "h-8 w-8" : "w-full gap-2 sm:w-auto"}
        title={label}
        aria-label={label}
      >
        <Trash2 className="h-4 w-4" />
        {iconOnly ? <span className="sr-only">{isDeleting ? "กำลังลบ" : label}</span> : isDeleting ? "กำลังลบ" : label}
      </Button>
      {message ? <p className="whitespace-pre-line text-xs text-red-600">{message}</p> : null}
    </div>
  );
}
