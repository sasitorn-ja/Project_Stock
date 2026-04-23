import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function SettingsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-normal">ตั้งค่า</h2>
        <p className="mt-1 text-sm text-muted-foreground">กำหนดต้นทาง พื้นที่ GPS และเงื่อนไขพื้นฐานของงานขนส่ง</p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>ต้นทางและ GPS</CardTitle>
          <CardDescription>ใช้เป็นค่าเริ่มต้นตอนสร้าง Job และตรวจตำแหน่งสแกน</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-5 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="warehouse">ต้นทางหลัก</Label>
            <Input id="warehouse" defaultValue="DC Bangna" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="prefix">GPS Radius Default</Label>
            <Input id="prefix" defaultValue="150 m" />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
