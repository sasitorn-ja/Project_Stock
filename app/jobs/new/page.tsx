import { JobCreator } from "@/components/jobs/job-creator";
import { JobSelectionActions } from "@/components/jobs/job-selection-actions";
import { StorageWarning } from "@/components/system/storage-warning";
import { PageHeading } from "@/components/layout/page-heading";

export default function NewJobPage() {
  return (
    <div className="space-y-5">
      <PageHeading title="สร้างงานจาก PO" description="ใช้รายการ PO ที่เลือกจากคิวรอจัดส่ง เพื่อสร้างงานขนส่งและส่งต่อให้ห้องคนขับ" actions={<JobSelectionActions />} />

      <StorageWarning />

      <JobCreator />
    </div>
  );
}
