import { ArrowDown, CheckCircle2 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { systemFlow } from "@/lib/mock-data";

const adminFlow = [
  "Login",
  "ระบบดึง PO เข้ามา",
  "ดูรายการ PO ที่รอจัดส่ง",
  "เลือก PO เพื่อสร้าง Job",
  "ระบบรวม PO ตามปลายทาง",
  "บันทึก Job",
  "ระบบสร้างห้องและ QR",
  "แจก QR ให้คนขับ",
  "เปิดหน้า monitor",
  "ดูสถานะ realtime",
  "ตรวจสอบ alert",
  "ดูสรุปว่า PO ไหนส่งครบหรือยังไม่ครบ",
  "ดูสรุปและปิด Job",
];

const driverFlow = [
  "เปิดมือถือ",
  "สแกน QR ห้องงาน",
  "เข้าโหมดรับต้นทางอัตโนมัติ",
  "สแกนของขึ้นรถ",
  "ระบบเช็คกับรายการ PO และนับแยกตาม location",
  "โหลดครบแล้วเริ่มเดินทาง",
  "ถึง location และสแกน QR location",
  "เข้าโหมดส่งอัตโนมัติ",
  "สแกนของลง",
  "ระบบเช็คกับ PO ว่าตรงปลายทางไหม",
  "ส่งครบทุก location แล้วจบงาน",
];

function FlowList({ title, items }: { title: string; items: string[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>ลำดับการทำงานตั้งแต่รับข้อมูลจนปิดงาน</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {items.map((item, index) => (
            <div key={`${item}-${index}`}>
              <div className="flex items-center gap-3 rounded-lg border p-3 text-sm">
                <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
                <span>{item}</span>
              </div>
              {index < items.length - 1 && (
                <div className="flex h-6 items-center pl-5 text-slate-400">
                  <ArrowDown className="h-4 w-4" />
                </div>
              )}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

export default function FlowPage() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-normal">Flow การทำงาน</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          ภาพรวมขั้นตอนของ Admin และคนขับในงานขนส่ง
        </p>
      </div>

      <FlowList title="ภาพรวมระบบ" items={systemFlow} />
      <div className="grid gap-6 xl:grid-cols-2">
        <FlowList title="Flow ฝั่ง Admin" items={adminFlow} />
        <FlowList title="Flow ฝั่งคนขับ/คนสแกน" items={driverFlow} />
      </div>
    </div>
  );
}
