"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Ban, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { QuantityStepper } from "@/components/ui/quantity-stepper";
import { updateJobItemScanQuantity } from "@/lib/job-db";

export function JobItemScanQtyEditor({
  jobId,
  registryKey,
  value,
  minimum,
}: {
  jobId: string;
  registryKey: string;
  value: number;
  minimum: number;
}) {
  const router = useRouter();
  const [nextValue, setNextValue] = useState(value);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState("");
  const safeMinimum = Math.max(0, Math.ceil(minimum));
  const hasChanged = Math.ceil(nextValue) !== value;
  const canSkipThisRound = safeMinimum === 0 && value > 0;

  async function saveQuantity(scanQty: number) {
    setIsSaving(true);
    setMessage("");

    try {
      await updateJobItemScanQuantity({
        jobId,
        registryKey,
        scanQty,
      });
      setNextValue(scanQty);
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "บันทึกจำนวนสแกนไม่สำเร็จ");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleSave() {
    await saveQuantity(Math.max(safeMinimum, Math.ceil(Number(nextValue) || 0)));
  }

  async function skipThisRound() {
    setNextValue(0);
    await saveQuantity(0);
  }

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2">
        <QuantityStepper
          value={nextValue}
          min={safeMinimum}
          onChange={setNextValue}
          className="min-w-0 flex-1 sm:w-36 sm:flex-none"
          inputClassName="h-9 text-sm"
        />
        <Button type="button" size="icon" variant={hasChanged ? "default" : "outline"} onClick={handleSave} disabled={isSaving || !hasChanged} title="บันทึกจำนวนที่ต้องสแกน">
          <Save className="h-4 w-4" />
        </Button>
      </div>
      {canSkipThisRound ? (
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-8 w-full gap-1.5 text-xs text-slate-600"
          onClick={skipThisRound}
          disabled={isSaving}
          title="ไม่ต้องสแกนรายการนี้ในรอบนี้"
        >
          <Ban className="h-3.5 w-3.5" />
          ไม่ส่งรอบนี้
        </Button>
      ) : null}
      {safeMinimum > 0 ? (
        <p className="text-xs text-muted-foreground">ลดต่ำกว่า {safeMinimum} ไม่ได้ เพราะมีการสแกนแล้ว</p>
      ) : null}
      {message ? <p className="whitespace-pre-line text-xs text-red-600">{message}</p> : null}
    </div>
  );
}
