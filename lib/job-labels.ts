import { type JobStatus } from "@/lib/jobs";

export function getJobStatusLabel(status: JobStatus | string) {
  const labels: Record<string, string> = {
    ready: "พร้อมเริ่มงาน",
    loading: "กำลังโหลดสินค้า",
    in_transit: "กำลังขนส่ง",
    completed: "ปิดงานแล้ว",
  };

  return labels[status] ?? status;
}
