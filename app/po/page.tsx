import Link from "next/link";
import { Upload } from "lucide-react";
import { PageHeading } from "@/components/layout/page-heading";
import { Button } from "@/components/ui/button";
import { PORegistryList } from "@/components/po/po-registry-list";
import { StorageWarning } from "@/components/system/storage-warning";

export default function PurchaseOrdersPage() {
  return (
    <div className="space-y-5">
      <PageHeading title="PO รอจัดส่ง" description="จัดการรายการ PO และเตรียมพร้อมสำหรับการขนส่งครั้งต่อไป" actions={
        <Button asChild variant="outline" size="sm" className="hero-primary w-full sm:w-auto">
          <Link href="/po/import">
            <Upload className="mr-2 h-3.5 w-3.5" />
            นำเข้า PO
          </Link>
        </Button>
      } />

      <StorageWarning />

      <PORegistryList />
    </div>
  );
}
