import { POImporter } from "@/components/po/po-importer";
import { StorageWarning } from "@/components/system/storage-warning";

export default function POImportPage() {
  return (
    <div className="mx-auto w-full max-w-4xl space-y-4">
      <StorageWarning />

      <POImporter />
    </div>
  );
}
