"use client";

import { useEffect, useState } from "react";
import { Minus, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type QuantityStepperProps = {
  id?: string;
  value: number;
  min?: number;
  onChange: (value: number) => void;
  inputClassName?: string;
  className?: string;
  decrementLabel?: string;
  incrementLabel?: string;
};

function normalizeQuantity(value: string | number, minimum: number) {
  return Math.max(minimum, Math.ceil(Number(value) || 0));
}

export function QuantityStepper({
  id,
  value,
  min = 0,
  onChange,
  inputClassName,
  className,
  decrementLabel = "ลดจำนวน",
  incrementLabel = "เพิ่มจำนวน",
}: QuantityStepperProps) {
  const minimum = Math.max(0, Math.ceil(min));
  const [draftValue, setDraftValue] = useState(String(Math.max(minimum, Math.ceil(value || 0))));

  useEffect(() => {
    setDraftValue(String(Math.max(minimum, Math.ceil(value || 0))));
  }, [minimum, value]);

  function commit(nextValue: string) {
    const normalizedValue = normalizeQuantity(nextValue, minimum);
    setDraftValue(String(normalizedValue));
    onChange(normalizedValue);
  }

  function step(offset: number) {
    const normalizedValue = normalizeQuantity(draftValue, minimum);
    const nextValue = Math.max(minimum, normalizedValue + offset);
    setDraftValue(String(nextValue));
    onChange(nextValue);
  }

  return (
    <div className={cn("flex w-full items-center gap-2", className)}>
      <Button
        type="button"
        size="icon"
        variant="outline"
        className="h-11 w-11 shrink-0"
        onClick={() => step(-1)}
        disabled={normalizeQuantity(draftValue, minimum) <= minimum}
        title={decrementLabel}
        aria-label={decrementLabel}
      >
        <Minus className="h-4 w-4" />
      </Button>
      <Input
        id={id}
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        value={draftValue}
        onChange={(event) => setDraftValue(event.target.value.replace(/\D/g, ""))}
        onBlur={(event) => commit(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.currentTarget.blur();
          }
        }}
        className={cn("h-11 min-w-0 flex-1 text-center text-base font-semibold", inputClassName)}
      />
      <Button
        type="button"
        size="icon"
        variant="outline"
        className="h-11 w-11 shrink-0"
        onClick={() => step(1)}
        title={incrementLabel}
        aria-label={incrementLabel}
      >
        <Plus className="h-4 w-4" />
      </Button>
    </div>
  );
}
