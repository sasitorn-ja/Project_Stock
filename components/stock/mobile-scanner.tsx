"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, Keyboard, ScanLine, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type BarcodeDetectorShape = {
  detect(source: CanvasImageSource): Promise<Array<{ rawValue: string }>>;
};

type BarcodeDetectorConstructor = new (options?: {
  formats?: string[];
}) => BarcodeDetectorShape;

export function MobileScanner() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [manualCode, setManualCode] = useState("");
  const [lastCode, setLastCode] = useState("");
  const [message, setMessage] = useState("พร้อมสแกน QR Code รับสินค้าเข้าคลัง");

  useEffect(() => {
    return () => stopCamera();
  }, []);

  async function startCamera() {
    if (!("mediaDevices" in navigator)) {
      setMessage("อุปกรณ์นี้ไม่รองรับการเปิดกล้องผ่านเว็บ");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setIsScanning(true);
      setMessage("เล็งกรอบไปที่ Barcode หรือ QR Code");
      void scanLoop();
    } catch {
      setMessage("เปิดกล้องไม่ได้ กรุณาอนุญาตสิทธิ์กล้องหรือใช้การคีย์แทน");
    }
  }

  function stopCamera() {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setIsScanning(false);
  }

  async function scanLoop() {
    const BarcodeDetector = (window as unknown as { BarcodeDetector?: BarcodeDetectorConstructor })
      .BarcodeDetector;

    if (!BarcodeDetector) {
      setMessage("เบราว์เซอร์นี้ยังไม่รองรับ BarcodeDetector ใช้การคีย์รหัสแทนได้");
      return;
    }

    const detector = new BarcodeDetector({
      formats: ["qr_code", "code_128", "ean_13", "ean_8", "upc_a", "upc_e"],
    });

    while (streamRef.current && videoRef.current) {
      try {
        const codes = await detector.detect(videoRef.current);
        if (codes[0]?.rawValue) {
          setLastCode(codes[0].rawValue);
          setManualCode(codes[0].rawValue);
          setMessage("พบรหัสสินค้าแล้ว พร้อมบันทึกรับเข้า");
          stopCamera();
          break;
        }
      } catch {
        setMessage("กำลังค้นหารหัสจากภาพกล้อง");
      }
      await new Promise((resolve) => window.setTimeout(resolve, 350));
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-cyan-50 text-cyan-700 dark:bg-cyan-950 dark:text-cyan-300">
              <ScanLine className="h-5 w-5" />
            </div>
            <div>
              <CardTitle>สแกน QR รับสินค้า</CardTitle>
              <CardDescription>ใช้กล้องมือถือสแกน QR Code หรือ Barcode ของสินค้าเข้าคลัง</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="relative aspect-[4/3] overflow-hidden rounded-lg border bg-slate-950">
            <video ref={videoRef} className="h-full w-full object-cover" playsInline muted />
            <div className="pointer-events-none absolute inset-0 grid place-items-center">
              <div className="h-36 w-64 max-w-[78%] rounded-lg border-2 border-cyan-300 shadow-[0_0_0_999px_rgba(2,6,23,0.38)]" />
            </div>
            {!isScanning && (
              <div className="absolute inset-0 grid place-items-center text-center text-slate-200">
                <div>
                  <Camera className="mx-auto mb-3 h-10 w-10" />
                  <p className="text-sm">{message}</p>
                </div>
              </div>
            )}
          </div>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Button type="button" onClick={startCamera} disabled={isScanning} className="flex-1">
              <Camera className="mr-2 h-4 w-4" />
              เปิดกล้องสแกน
            </Button>
            <Button type="button" variant="outline" onClick={stopCamera} className="flex-1">
              <Square className="mr-2 h-4 w-4" />
              หยุดกล้อง
            </Button>
          </div>
          <p className="text-sm text-muted-foreground">{message}</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>ข้อมูลรับเข้า</CardTitle>
          <CardDescription>หลังสแกนสำเร็จ รหัสจะเติมในช่องนี้อัตโนมัติ</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="scan-code">รหัสสินค้า</Label>
            <div className="flex gap-2">
              <Input
                id="scan-code"
                value={manualCode}
                onChange={(event) => setManualCode(event.target.value)}
                placeholder="สแกนหรือคีย์รหัส"
              />
              <Button type="button" variant="outline" size="icon" title="คีย์รหัส">
                <Keyboard className="h-4 w-4" />
              </Button>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="scan-qty">จำนวนที่รับเข้า</Label>
            <Input id="scan-qty" type="number" min="1" defaultValue="1" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="scan-user">ผู้ตรวจรับ</Label>
            <Input id="scan-user" placeholder="ชื่อผู้ตรวจรับสินค้า" />
          </div>
          {lastCode && (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-300">
              รหัสล่าสุด: {lastCode}
            </div>
          )}
          <Button type="button" className="w-full">
            บันทึกรับเข้า
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
