import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function ProductsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-normal">รายการสินค้า</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          โมดูลนี้ยังไม่ได้ผูกกับคลังข้อมูลจริง จึงถูกปิดข้อมูลตัวอย่างออกก่อนเพื่อไม่ให้เกิดความเข้าใจผิด
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>ยังไม่เปิดใช้งาน production</CardTitle>
          <CardDescription>เมื่อพร้อมเชื่อม stock master และ barcode registry จริงแล้ว หน้านี้จะกลับมาใช้งานได้</CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          ตอนนี้เส้นทางที่พร้อมใช้งานจริงคือ PO รอจัดส่ง, สร้าง Job, ห้องคนขับ และ Monitor
        </CardContent>
      </Card>
    </div>
  );
}
