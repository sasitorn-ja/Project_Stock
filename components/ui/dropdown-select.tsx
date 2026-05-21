"use client";

import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { Check, ChevronDown } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";

export type DropdownSelectOption = {
  value: string;
  label: string;
};

export function DropdownSelect({
  name,
  value,
  options,
  onValueChange,
  ariaLabel,
  className,
}: {
  name?: string;
  value: string;
  options: DropdownSelectOption[];
  onValueChange?: (value: string) => void;
  ariaLabel?: string;
  className?: string;
}) {
  const [uncontrolledValue, setUncontrolledValue] = useState(value);
  const currentValue = onValueChange ? value : uncontrolledValue;
  const selectedOption = options.find((option) => option.value === currentValue) ?? options[0];

  function selectValue(nextValue: string) {
    if (onValueChange) {
      onValueChange(nextValue);
      return;
    }

    setUncontrolledValue(nextValue);
  }

  return (
    <>
      {name ? <input type="hidden" name={name} value={selectedOption?.value ?? ""} /> : null}
      <DropdownMenu.Root>
        <DropdownMenu.Trigger
          aria-label={ariaLabel}
          className={cn(
            "flex h-8 w-full items-center justify-between gap-2 rounded-md border border-[#cfd6df] bg-white px-2.5 text-left text-sm font-medium text-slate-900 shadow-sm outline-none transition hover:bg-slate-50 focus-visible:border-slate-400 focus-visible:ring-2 focus-visible:ring-slate-900/10 data-[state=open]:border-slate-400 data-[state=open]:ring-2 data-[state=open]:ring-slate-900/10",
            className,
          )}
        >
          <span className="min-w-0 truncate">{selectedOption?.label ?? "-"}</span>
          <ChevronDown className="size-4 shrink-0 text-slate-500" />
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content
            align="start"
            sideOffset={8}
            className="z-50 w-[var(--radix-dropdown-menu-trigger-width)] rounded-xl border border-[#d8dde6] bg-white p-2 text-sm text-slate-900 shadow-lg shadow-slate-900/10"
          >
            {options.map((option) => {
              const isSelected = option.value === selectedOption?.value;

              return (
                <DropdownMenu.Item
                  key={option.value}
                  onSelect={() => selectValue(option.value)}
                  className="flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2 outline-none transition-colors hover:bg-slate-50 focus:bg-slate-50 data-[highlighted]:bg-slate-50"
                >
                  <span className="flex size-4 shrink-0 items-center justify-center">
                    {isSelected ? <Check className="size-4 text-slate-950" /> : null}
                  </span>
                  <span className="truncate">{option.label}</span>
                </DropdownMenu.Item>
              );
            })}
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
    </>
  );
}
