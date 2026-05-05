import { POImporter } from "@/components/po/po-importer";
import { StorageWarning } from "@/components/system/storage-warning";

export default function POImportPage() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-normal">นำเข้า PO</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          อัปโหลดไฟล์ GR .xlsx เพื่อเพิ่มรายการใหม่เข้าสู่คิวรอจัดส่ง
        </p>
      </div>

      <StorageWarning />

      <POImporter />
    </div>
  );
}
