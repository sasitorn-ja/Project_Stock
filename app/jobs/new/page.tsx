import Link from "next/link";
import { FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { JobCreator } from "@/components/jobs/job-creator";
import { StorageWarning } from "@/components/system/storage-warning";

export default function NewJobPage() {
  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
        <div>
          <h2 className="text-2xl font-bold tracking-normal">สร้าง Job จาก PO</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            ใช้รายการ PO ที่เลือกจริงจากคิวรอจัดส่ง เพื่อสร้างงานขนส่งและส่งต่อให้ห้องคนขับ
          </p>
        </div>
        <Button asChild variant="outline">
          <Link href="/po">
            <FileText className="mr-2 h-4 w-4" />
            กลับไปเลือก PO
          </Link>
        </Button>
      </div>

      <StorageWarning />

      <JobCreator />
    </div>
  );
}
