"use client";

import { useState } from "react";
import { PackageCheck, PackageMinus, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type StockFormMode = "in" | "out";

export function StockForm({ mode }: { mode: StockFormMode }) {
  const [sku, setSku] = useState("");
  const isStockIn = mode === "in";
  const Icon = isStockIn ? PackageCheck : PackageMinus;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-cyan-50 text-cyan-700 dark:bg-cyan-950 dark:text-cyan-300">
            <Icon className="h-5 w-5" />
          </div>
          <div>
            <CardTitle>{isStockIn ? "บันทึกรับสินค้าเข้า" : "บันทึกนำสินค้าออก"}</CardTitle>
            <CardDescription>
              {isStockIn
                ? "กรอกข้อมูลสินค้า ซัพพลายเออร์ จำนวน และตำแหน่งจัดเก็บ"
                : "คีย์ SKU หรือเปิดหน้าสแกนด้วยมือถือเพื่อจ่ายสินค้าออก"}
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <form className="grid gap-5 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="sku">รหัสสินค้า / Barcode</Label>
            <Input
              id="sku"
              value={sku}
              onChange={(event) => setSku(event.target.value)}
              placeholder="เช่น SKU-10024"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="name">ชื่อสินค้า</Label>
            <Input id="name" placeholder="ชื่อสินค้า" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="qty">จำนวน</Label>
            <Input id="qty" type="number" min="1" placeholder="0" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="location">ตำแหน่งคลัง</Label>
            <Input id="location" placeholder="เช่น A-01-02" />
          </div>
          {isStockIn ? (
            <>
              <div className="space-y-2">
                <Label htmlFor="supplier">ผู้ขาย / Supplier</Label>
                <Input id="supplier" placeholder="ชื่อผู้ขาย" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="lot">Lot / เลขที่เอกสาร</Label>
                <Input id="lot" placeholder="PO-2026-0001" />
              </div>
            </>
          ) : (
            <>
              <div className="space-y-2">
                <Label htmlFor="requester">ผู้เบิก</Label>
                <Input id="requester" placeholder="ชื่อผู้เบิกสินค้า" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="purpose">วัตถุประสงค์</Label>
                <Input id="purpose" placeholder="ขาย / ใช้งาน / โอนคลัง" />
              </div>
            </>
          )}
          <div className="md:col-span-2">
            <Button type="button" className="w-full sm:w-auto">
              <Save className="mr-2 h-4 w-4" />
              บันทึกข้อมูล
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
