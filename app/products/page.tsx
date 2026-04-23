import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const products = [
  { code: "SKU-10024", name: "สายชาร์จ USB-C", stock: 520, min: 100, location: "A-01-02" },
  { code: "SKU-20411", name: "กล่องบรรจุภัณฑ์ M", stock: 74, min: 120, location: "B-03-01" },
  { code: "SKU-33109", name: "สติ๊กเกอร์ Barcode", stock: 310, min: 80, location: "C-02-04" },
];

export default function ProductsPage() {
  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
        <div>
          <h2 className="text-2xl font-bold tracking-normal">รายการสินค้า</h2>
          <p className="mt-1 text-sm text-muted-foreground">จัดการ SKU, Barcode, ตำแหน่ง และจำนวนขั้นต่ำ</p>
        </div>
        <Button>เพิ่มสินค้า</Button>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>ทะเบียนสินค้า</CardTitle>
          <CardDescription>รายการ SKU พร้อมจำนวนคงเหลือและตำแหน่งจัดเก็บ</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-hidden rounded-lg border">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-sm">
              <thead className="bg-slate-50 text-left text-slate-500 dark:bg-slate-900 dark:text-slate-400">
                <tr>
                  <th className="w-36 whitespace-nowrap px-4 py-3 font-medium">SKU</th>
                  <th className="px-4 py-3 font-medium">สินค้า</th>
                  <th className="w-28 whitespace-nowrap px-4 py-3 font-medium">คงเหลือ</th>
                  <th className="w-32 whitespace-nowrap px-4 py-3 font-medium">ตำแหน่ง</th>
                  <th className="w-28 whitespace-nowrap px-4 py-3 font-medium">สถานะ</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {products.map((product) => (
                  <tr key={product.code}>
                    <td className="whitespace-nowrap px-4 py-3 align-top font-medium">{product.code}</td>
                    <td className="break-words px-4 py-3 align-top">{product.name}</td>
                    <td className="whitespace-nowrap px-4 py-3 align-top">{product.stock}</td>
                    <td className="whitespace-nowrap px-4 py-3 align-top">{product.location}</td>
                    <td className="whitespace-nowrap px-4 py-3 align-top">
                      <Badge variant={product.stock < product.min ? "warning" : "success"}>
                        {product.stock < product.min ? "ใกล้หมด" : "ปกติ"}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
              </table>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
