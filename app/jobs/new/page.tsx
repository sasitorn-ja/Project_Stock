import { JobCreator } from "@/components/jobs/job-creator";
import { JobSelectionActions } from "@/components/jobs/job-selection-actions";
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
        <JobSelectionActions />
      </div>

      <StorageWarning />

      <JobCreator />
    </div>
  );
}
