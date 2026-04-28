import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function ReportsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-normal">รายงาน</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          หน้ารายงานถูกเปลี่ยนเป็นสถานะพักไว้ก่อน จนกว่าจะสรุปข้อมูลจาก Job ปิดงานจริงครบชุด
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>รอ data mart ของงานจริง</CardTitle>
          <CardDescription>ตอนนี้ระบบบันทึก job, scan และ alert จริงแล้ว แต่ยังไม่ได้สร้างสรุปรายงานระยะยาว</CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          ใช้หน้า Monitor Realtime เพื่อติดตามงานจริงในระหว่างนี้
        </CardContent>
      </Card>
    </div>
  );
}
