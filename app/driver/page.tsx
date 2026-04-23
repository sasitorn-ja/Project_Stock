import { DriverScanner } from "@/components/jobs/driver-scanner";

export default function DriverPage() {
  return (
    <div className="space-y-4">
      <div className="rounded-lg border bg-white p-4 shadow-sm dark:bg-slate-950">
        <h2 className="text-xl font-bold tracking-normal">ห้องคนขับ</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          สแกน QR ห้องงาน โหลดขึ้นรถ และยืนยันส่งของตามปลายทาง
        </p>
      </div>
      <DriverScanner />
    </div>
  );
}
