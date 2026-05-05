import Link from "next/link";
import { Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PORegistryList } from "@/components/po/po-registry-list";
import { StorageWarning } from "@/components/system/storage-warning";

export default function PurchaseOrdersPage() {
  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
        <div>
          <h2 className="text-2xl font-bold tracking-normal">PO รอจัดส่ง</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            เลือกรายการ PO ที่นำเข้าแล้วเพื่อสร้าง Job ขนส่ง
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button asChild variant="outline">
            <Link href="/po/import">
              <Upload className="mr-2 h-4 w-4" />
              นำเข้า PO
            </Link>
          </Button>
        </div>
      </div>

      <StorageWarning />

      <PORegistryList />
    </div>
  );
}
