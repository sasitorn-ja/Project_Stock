"use client";

import { useState } from "react";
import { AlertTriangle, CheckCircle2, Crosshair, FileText, MapPin, QrCode, ScanLine, Truck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { activeJob, pendingPOs } from "@/lib/mock-data";

type Mode = "load" | "deliver";

export function DriverScanner() {
  const [mode, setMode] = useState<Mode>("load");
  const [currentLocation, setCurrentLocation] = useState("ยังไม่ได้เลือก location");
  const [code, setCode] = useState("");
  const [scanResult, setScanResult] = useState<"ok" | "alert" | null>(null);

  function simulateScan(nextCode: string) {
    setCode(nextCode);
    const isWrongLocation = mode === "deliver" && nextCode === "SKU-33109" && currentLocation.includes("Central");
    setScanResult(isWrongLocation ? "alert" : "ok");
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <CardTitle className="text-base">งานปัจจุบัน</CardTitle>
              <CardDescription>{activeJob.id} / {activeJob.vehicle}</CardDescription>
            </div>
            <Badge variant={mode === "load" ? "warning" : "success"}>
              {mode === "load" ? "โหลดต้นทาง" : "ส่งปลายทาง"}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="grid gap-2 text-sm">
          <div className="flex justify-between gap-3 rounded-md bg-slate-50 px-3 py-2 dark:bg-slate-900">
            <span className="text-muted-foreground">คนขับ</span>
            <span className="min-w-0 break-words text-right font-medium">{activeJob.driver}</span>
          </div>
          <div className="flex justify-between gap-3 rounded-md bg-slate-50 px-3 py-2 dark:bg-slate-900">
            <span className="text-muted-foreground">ปลายทางปัจจุบัน</span>
            <span className="min-w-0 break-words text-right font-medium">{currentLocation}</span>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <FileText className="h-4 w-4" />
            PO ในงานนี้
          </CardTitle>
          <CardDescription>รายการที่ต้องโหลดและส่งในงานนี้</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {pendingPOs.map((po) => (
            <div key={po.id} className="rounded-lg border p-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-semibold">{po.id}</p>
                  <p className="mt-1 text-sm text-muted-foreground">{po.destination}</p>
                </div>
                <Badge variant="secondary">{po.items.reduce((sum, item) => sum + item.qty, 0)} pcs</Badge>
              </div>
              <div className="mt-3 space-y-2">
                {po.items.map((item) => (
                  <div key={`${po.id}-${item.sku}`} className="flex items-center justify-between rounded-md bg-slate-50 px-3 py-2 text-sm dark:bg-slate-900">
                    <span className="min-w-0 break-words">{item.sku} - {item.name}</span>
                    <span className="ml-3 shrink-0 font-semibold">{item.qty}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
            <div>
              <CardTitle className="text-base">สแกนบาร์โค้ด</CardTitle>
              <CardDescription>ตรวจสินค้า ปลายทาง จำนวน และตำแหน่ง GPS</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-3">
            <Button type="button" variant="outline" onClick={() => setMode("load")}>
              <Truck className="mr-2 h-4 w-4" />
              โหมดขึ้นรถ
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setMode("deliver");
                setCurrentLocation("Central Rama 3");
              }}
            >
              <QrCode className="mr-2 h-4 w-4" />
              สแกน QR Location
            </Button>
            <Button type="button" variant="outline">
              <Crosshair className="mr-2 h-4 w-4" />
              ตรวจ GPS
            </Button>
          </div>

          <div className="relative aspect-[4/3] overflow-hidden rounded-lg border bg-slate-950">
            <div className="absolute inset-0 grid place-items-center text-center text-slate-200">
              <div>
                <ScanLine className="mx-auto mb-3 h-12 w-12" />
                <p className="text-sm">พื้นที่กล้องสำหรับสแกน QR/Barcode</p>
                <p className="mt-1 text-xs text-slate-400">รองรับมือถือและ GPS permission ในขั้นต่อไป</p>
              </div>
            </div>
            <div className="pointer-events-none absolute inset-0 grid place-items-center">
              <div className="h-36 w-64 max-w-[78%] rounded-lg border-2 border-cyan-300 shadow-[0_0_0_999px_rgba(2,6,23,0.38)]" />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="scan-code">รหัสสินค้าที่สแกน</Label>
            <Input
              id="scan-code"
              value={code}
              onChange={(event) => setCode(event.target.value)}
              placeholder="SKU หรือ QR payload"
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Button type="button" onClick={() => simulateScan("SKU-10024")}>
              จำลองสแกนถูกต้อง
            </Button>
            <Button type="button" variant="outline" onClick={() => simulateScan("SKU-33109")}>
              จำลองผิดปลายทาง
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">ผลการตรวจ</CardTitle>
          <CardDescription>สถานะล่าสุดของรหัสที่สแกน</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3">
            {[
              ["อยู่ใน PO ของ Job นี้", true],
              ["เป็นของ Location ปัจจุบัน", scanResult !== "alert"],
              ["ยังไม่เคยสแกนซ้ำ", true],
              ["จำนวนไม่เกินแผน", true],
              ["อยู่ใน GPS radius", scanResult !== "alert"],
            ].map(([label, ok]) => (
              <div key={String(label)} className="flex items-center justify-between rounded-lg border p-3 text-sm">
                <span>{label}</span>
                {ok ? (
                  <Badge variant="success"><CheckCircle2 className="mr-1 h-3.5 w-3.5" /> ผ่าน</Badge>
                ) : (
                  <Badge variant="warning"><AlertTriangle className="mr-1 h-3.5 w-3.5" /> Alert</Badge>
                )}
              </div>
            ))}
          </div>

          <div className="rounded-lg border p-4">
            <p className="flex items-center gap-2 text-sm font-medium">
              <MapPin className="h-4 w-4 text-cyan-700" />
              GPS ปัจจุบัน
            </p>
            <p className="mt-2 text-sm text-muted-foreground">
              13.6987,100.5380 / accuracy 18 m
            </p>
          </div>

          {scanResult === "alert" && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">
              พบความผิดปกติ: สินค้าไม่ตรงปลายทางหรือ GPS อยู่นอกพื้นที่ ระบบสร้าง alert และส่งไป Admin ทันที
            </div>
          )}
          {scanResult === "ok" && (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-300">
              ตรวจผ่าน: บันทึก scan log พร้อมเพิ่มจำนวนและเก็บ GPS แล้ว
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
