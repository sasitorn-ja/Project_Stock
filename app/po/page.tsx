import Link from "next/link";
import { Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PORegistryList } from "@/components/po/po-registry-list";
import { StorageWarning } from "@/components/system/storage-warning";

export default function PurchaseOrdersPage() {
  return (
    <div className="space-y-4">
      <div className="flex flex-col justify-between gap-3 md:flex-row md:items-center">
        <div className="min-w-0">
          <h2 className="text-lg font-bold tracking-tight text-slate-900">PO รอจัดส่ง</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            เลือกรายการ PO ที่นำเข้าแล้วเพื่อสร้าง Job ขนส่ง
          </p>
        </div>
        <Button asChild variant="outline" size="sm" className="w-full sm:w-auto">
          <Link href="/po/import">
            <Upload className="mr-2 h-3.5 w-3.5" />
            นำเข้า PO
          </Link>
        </Button>
      </div>

      <StorageWarning />

      <PORegistryList />
    </div>
  );
}
