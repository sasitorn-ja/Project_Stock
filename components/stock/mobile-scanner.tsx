"use client";

import { useEffect, useRef, useState } from "react";
import { BrowserMultiFormatReader, type IScannerControls } from "@zxing/browser";
import { Camera, Keyboard, ScanLine, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createScanHints, SUPPORTED_SCAN_FORMAT_LABEL } from "@/lib/scanner-formats";

export function MobileScanner() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scannerControlsRef = useRef<IScannerControls | null>(null);
  const scanLockRef = useRef(false);
  const [isScanning, setIsScanning] = useState(false);
  const [manualCode, setManualCode] = useState("");
  const [lastCode, setLastCode] = useState("");
  const [message, setMessage] = useState("พร้อมสแกน QR / บาร์โค้ดรับสินค้าเข้าคลัง");

  useEffect(() => {
    return () => stopCamera();
  }, []);

  async function startCamera() {
    if (!("mediaDevices" in navigator)) {
      setMessage("อุปกรณ์นี้ไม่รองรับการเปิดกล้องผ่านเว็บ");
      return;
    }

    if (!videoRef.current) {
      setMessage("ยังไม่พร้อมเปิดกล้อง กรุณาลองใหม่");
      return;
    }

    try {
      scanLockRef.current = false;
      setIsScanning(true);
      setMessage("เล็งกรอบไปที่ QR หรือบาร์โค้ดให้เต็มกรอบ");

      const reader = new BrowserMultiFormatReader(createScanHints(), {
        delayBetweenScanAttempts: 100,
        delayBetweenScanSuccess: 800,
        tryPlayVideoTimeout: 8000,
      });

      scannerControlsRef.current = await reader.decodeFromConstraints(
        {
          video: {
            facingMode: { ideal: "environment" },
            width: { ideal: 1920 },
            height: { ideal: 1080 },
            frameRate: { ideal: 30 },
          },
          audio: false,
        },
        videoRef.current,
        (result) => {
          const scannedCode = result?.getText()?.trim();

          if (!scannedCode || scanLockRef.current) {
            return;
          }

          scanLockRef.current = true;
          setLastCode(scannedCode);
          setManualCode(scannedCode);
          setMessage(`พบรหัส: ${scannedCode} — พร้อมบันทึกรับเข้า`);
          stopCamera();
        },
      );

      streamRef.current =
        videoRef.current.srcObject instanceof MediaStream ? videoRef.current.srcObject : null;
    } catch {
      setMessage("เปิดกล้องไม่ได้ กรุณาอนุญาตสิทธิ์กล้องหรือใช้การคีย์แทน");
      setIsScanning(false);
    }
  }

  function stopCamera() {
    scannerControlsRef.current?.stop();
    scannerControlsRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    scanLockRef.current = false;
    setIsScanning(false);
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
              <CardTitle>สแกน QR / บาร์โค้ดรับสินค้า</CardTitle>
              <CardDescription>
                รองรับ {SUPPORTED_SCAN_FORMAT_LABEL}
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="relative aspect-[4/3] overflow-hidden rounded-lg border bg-slate-950">
            <video ref={videoRef} className="h-full w-full object-cover" playsInline muted />
            <div className="pointer-events-none absolute inset-0 grid place-items-center">
              <div className="h-[72%] w-[90%] max-w-3xl rounded-lg border-2 border-cyan-300 shadow-[0_0_0_999px_rgba(2,6,23,0.32)]" />
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
          {isScanning && (
            <p className="text-sm text-muted-foreground">{message}</p>
          )}
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
