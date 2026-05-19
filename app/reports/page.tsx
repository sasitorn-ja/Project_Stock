import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function ReportsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-normal">รายงาน</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          หน้ารายงานถูกเปลี่ยนเป็นสถานะพักไว้ก่อน จนกว่าจะสรุปข้อมูลจากงานที่ปิดจริงครบชุด
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>รอคลังข้อมูลรายงานของงานจริง</CardTitle>
          <CardDescription>ตอนนี้ระบบบันทึกงาน การสแกน และแจ้งเตือนจริงแล้ว แต่ยังไม่ได้สร้างสรุปรายงานระยะยาว</CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          ใช้หน้าติดตามงานเพื่อติดตามงานจริงในระหว่างนี้
        </CardContent>
      </Card>
    </div>
  );
}
