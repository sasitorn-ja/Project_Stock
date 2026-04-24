import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { reportCards } from "@/data/pages/reports";

export default function ReportsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-normal">รายงาน</h2>
        <p className="mt-1 text-sm text-muted-foreground">สรุปการโหลดต้นทาง ส่งปลายทาง ความครบถ้วน และ alert</p>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        {reportCards.map((title) => (
          <Card key={title}>
            <CardHeader>
              <CardTitle>{title}</CardTitle>
              <CardDescription>รอข้อมูลจาก Job ที่ปิดงานแล้ว</CardDescription>
            </CardHeader>
            <CardContent className="h-32 rounded-b-lg bg-slate-50 dark:bg-slate-900" />
          </Card>
        ))}
      </div>
    </div>
  );
}
