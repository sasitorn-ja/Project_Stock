"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Ban, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { QuantityStepper } from "@/components/ui/quantity-stepper";
import { updateJobItemScanQuantity } from "@/lib/job-db";

type UnderlyingItem = {
  registryKey: string;
  orderQty: number;
  loadedQty: number;
  deliveredQty: number;
};

// editor สำหรับ item ที่รวมจากหลาย registryKey ภายใต้ (PO + material code) เดียวกัน
// ใช้ stepper ตัวเดียว ตอน save จะกระจาย qty ใหม่ไปยังแต่ละ underlying item
// โดยรักษา minimum ของแต่ละตัว (max(loaded, delivered))
export function JobMergedScanQtyEditor({
  jobId,
  underlying,
}: {
  jobId: string;
  underlying: UnderlyingItem[];
}) {
  const router = useRouter();

  const currentTotal = useMemo(
    () => underlying.reduce((sum, item) => sum + Math.max(0, item.orderQty), 0),
    [underlying],
  );
  const sumMinimum = useMemo(
    () => underlying.reduce((sum, item) => sum + Math.max(0, item.loadedQty, item.deliveredQty), 0),
    [underlying],
  );

  const [nextValue, setNextValue] = useState(currentTotal);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState("");

  const hasChanged = Math.ceil(nextValue) !== currentTotal;
  const canSkipThisRound = sumMinimum === 0 && currentTotal > 0;

  function distributeTargets(target: number) {
    // base = minimum ต่อ item; extra = ที่เหลือกระจายตามสัดส่วน orderQty เดิม
    const minimums = underlying.map((item) => Math.max(0, item.loadedQty, item.deliveredQty));
    const totalMin = minimums.reduce((sum, value) => sum + value, 0);
    const remaining = Math.max(0, target - totalMin);
    const originalSum = underlying.reduce((sum, item) => sum + Math.max(0, item.orderQty - Math.max(item.loadedQty, item.deliveredQty)), 0);

    const raw = underlying.map((item, index) => {
      if (remaining === 0) return minimums[index];
      const headroom = Math.max(0, item.orderQty - minimums[index]);
      const share = originalSum > 0 ? (headroom / originalSum) * remaining : remaining / underlying.length;
      return minimums[index] + share;
    });

    // ปัดเป็นจำนวนเต็ม แล้วชดเชย rounding diff ไปที่ตัวแรกที่รับได้
    const rounded = raw.map((value) => Math.floor(value));
    let diff = target - rounded.reduce((sum, value) => sum + value, 0);
    for (let i = 0; i < rounded.length && diff > 0; i += 1) {
      rounded[i] += 1;
      diff -= 1;
    }
    // กรณีปัดเกิน (ไม่น่าเกิด แต่กันเหนียว) — ลดที่ตัวที่มี headroom เหลือ
    for (let i = rounded.length - 1; i >= 0 && diff < 0; i -= 1) {
      if (rounded[i] > minimums[i]) {
        rounded[i] -= 1;
        diff += 1;
      }
    }
    return rounded;
  }

  async function saveQuantity(target: number) {
    const safeTarget = Math.max(sumMinimum, Math.ceil(target));
    setIsSaving(true);
    setMessage("");

    try {
      const targets = distributeTargets(safeTarget);
      // อัปเดตทุก underlying item ที่จำนวนเปลี่ยน
      const tasks = underlying
        .map((item, index) => ({ item, target: targets[index] }))
        .filter(({ item, target: newQty }) => newQty !== item.orderQty)
        .map(({ item, target: newQty }) =>
          updateJobItemScanQuantity({
            jobId,
            registryKey: item.registryKey,
            scanQty: newQty,
          }),
        );

      await Promise.all(tasks);
      setNextValue(safeTarget);
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "บันทึกจำนวนสแกนไม่สำเร็จ");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleSave() {
    await saveQuantity(Math.max(sumMinimum, Math.ceil(Number(nextValue) || 0)));
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
          min={sumMinimum}
          onChange={setNextValue}
          className="min-w-0 flex-1 sm:w-36 sm:flex-none"
          inputClassName="h-9 text-sm"
        />
        <Button
          type="button"
          size="icon"
          variant={hasChanged ? "default" : "outline"}
          onClick={handleSave}
          disabled={isSaving || !hasChanged}
          title="บันทึกจำนวนที่ต้องสแกน"
        >
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
      {sumMinimum > 0 ? (
        <p className="text-xs text-muted-foreground">ลดต่ำกว่า {sumMinimum} ไม่ได้ เพราะสแกนไปบางส่วนแล้ว</p>
      ) : null}
      <p className="text-[10px] text-muted-foreground">รวม {underlying.length} รายการย่อย</p>
      {message ? <p className="whitespace-pre-line text-xs text-red-600">{message}</p> : null}
    </div>
  );
}
