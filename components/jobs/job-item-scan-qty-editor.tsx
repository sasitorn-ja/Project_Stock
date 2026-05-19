"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Save } from "lucide-react";
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

  async function handleSave() {
    const scanQty = Math.max(safeMinimum, Math.ceil(Number(nextValue) || 0));

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

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2">
        <QuantityStepper
          value={nextValue}
          min={safeMinimum}
          onChange={setNextValue}
          className="w-36"
          inputClassName="h-9 text-sm"
        />
        <Button type="button" size="icon" variant={hasChanged ? "default" : "outline"} onClick={handleSave} disabled={isSaving || !hasChanged} title="บันทึกจำนวนที่ต้องสแกน">
          <Save className="h-4 w-4" />
        </Button>
      </div>
      {message ? <p className="whitespace-pre-line text-xs text-red-600">{message}</p> : null}
    </div>
  );
}
