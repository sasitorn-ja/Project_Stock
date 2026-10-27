import { POImporter } from "@/components/po/po-importer";
import { StorageWarning } from "@/components/system/storage-warning";
import { PageHeading } from "@/components/layout/page-heading";

export default function POImportPage() {
  return (
    <div className="space-y-6">
      <PageHeading title="นำเข้า PO" description="เริ่มต้นงานขนส่งด้วยการนำเข้าข้อมูลจาก SAP ผ่านไฟล์ Excel หรือ CSV" />
      <div className="mx-auto w-full max-w-4xl">
        <StorageWarning />
      </div>

      <POImporter />
    </div>
  );
}
