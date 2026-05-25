"use client";

import { FileText, RotateCcw } from "lucide-react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

const selectedPOStorageKey = "project-stock.selected-po-registry-keys";

export function JobSelectionActions() {
  const router = useRouter();

  function chooseMorePO() {
    router.push("/po");
  }

  function chooseNewPO() {
    window.sessionStorage.removeItem(selectedPOStorageKey);
    router.push("/po");
  }

  return (
    <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
      <Button type="button" variant="outline" size="sm" onClick={chooseMorePO} className="w-full sm:w-auto">
        <FileText className="mr-2 h-3.5 w-3.5" />
        เพิ่ม PO
      </Button>
      <Button type="button" variant="outline" size="sm" onClick={chooseNewPO} className="w-full sm:w-auto">
        <RotateCcw className="mr-2 h-3.5 w-3.5" />
        เลือกใหม่
      </Button>
    </div>
  );
}
