import Link from "next/link";
import { FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { JobCreator } from "@/components/jobs/job-creator";
import { StorageWarning } from "@/components/system/storage-warning";

export default function NewJobPage() {
  return (
    <div className="space-y-4">
      <div className="flex flex-col justify-between gap-3 md:flex-row md:items-center">
        <div className="min-w-0">
          <h2 className="text-lg font-bold tracking-normal text-slate-900">สร้างงานจาก PO</h2>
          <p className="mt-0.5 text-[13px] text-muted-foreground">
            ใช้รายการ PO ที่เลือกจริงจากคิวรอจัดส่ง เพื่อสร้างงานขนส่งและส่งต่อให้ห้องคนขับ
          </p>
        </div>
        <Button asChild variant="outline" size="sm" className="w-full sm:w-auto">
          <Link href="/po">
            <FileText className="mr-2 h-3.5 w-3.5" />
            กลับไปเลือก PO
          </Link>
        </Button>
      </div>

      <StorageWarning />

      <JobCreator />
    </div>
  );
}
