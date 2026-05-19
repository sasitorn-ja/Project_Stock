"use client";

import { useEffect, useRef, useState } from "react";
import { BrowserMultiFormatReader, type IScannerControls } from "@zxing/browser";
import { Camera, Flashlight, FlashlightOff, Keyboard, ScanLine, Square, ZoomIn } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createScanHints, SUPPORTED_SCAN_FORMAT_LABEL } from "@/lib/scanner-formats";

function getScannerVideoConstraints(): MediaTrackConstraints {
  const isNarrowScreen = typeof window !== "undefined" && window.innerWidth < 768;

  return isNarrowScreen
    ? {
        facingMode: { ideal: "environment" },
        width: { ideal: 1440 },
        height: { ideal: 2560 },
        aspectRatio: { ideal: 9 / 16 },
        frameRate: { ideal: 30 },
      }
    : {
        facingMode: { ideal: "environment" },
        width: { ideal: 2560 },
        height: { ideal: 1440 },
        aspectRatio: { ideal: 16 / 9 },
        frameRate: { ideal: 30 },
      };
}

export function MobileScanner() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scannerControlsRef = useRef<IScannerControls | null>(null);
  const videoTrackRef = useRef<MediaStreamTrack | null>(null);
  const scanLockRef = useRef(false);
  const tapIndicatorTimeoutRef = useRef<number | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [manualCode, setManualCode] = useState("");
  const [lastCode, setLastCode] = useState("");
  const [message, setMessage] = useState("พร้อมสแกน QR / บาร์โค้ดรับสินค้าเข้าคลัง");
  const [torchSupported, setTorchSupported] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const [zoomCapability, setZoomCapability] = useState<{ min: number; max: number; step: number } | null>(null);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [tapIndicator, setTapIndicator] = useState<{ x: number; y: number; id: number } | null>(null);

  useEffect(() => {
    return () => stopCamera();
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

      // ขอ stream เองเพื่อให้เข้าถึง videoTrack สำหรับ torch/zoom/focus
      const stream = await navigator.mediaDevices.getUserMedia({
        video: getScannerVideoConstraints(),
        audio: false,
      });
      streamRef.current = stream;
      videoRef.current.srcObject = stream;
      await videoRef.current.play();

      const videoTrack = stream.getVideoTracks()[0];
      if (videoTrack) {
        videoTrackRef.current = videoTrack;
        try {
          await videoTrack.applyConstraints({
            advanced: [
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              { focusMode: "continuous" } as any,
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              { exposureMode: "continuous" } as any,
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              { whiteBalanceMode: "continuous" } as any,
            ],
          });
        } catch {
          // บางเครื่องไม่รองรับ — ปล่อยไว้
        }

        try {
          const capabilities = videoTrack.getCapabilities() as MediaTrackCapabilities & {
            torch?: boolean;
            zoom?: { min?: number; max?: number; step?: number };
          };
          setTorchSupported(Boolean(capabilities.torch));
          if (capabilities.zoom && typeof capabilities.zoom.max === "number") {
            const min = typeof capabilities.zoom.min === "number" ? capabilities.zoom.min : 1;
            const max = capabilities.zoom.max;
            const step =
              typeof capabilities.zoom.step === "number" && capabilities.zoom.step > 0 ? capabilities.zoom.step : 0.1;
            if (max > min) {
              setZoomCapability({ min, max, step });
              setZoomLevel(min);
            }
          }
        } catch {
          // ignore
        }
      }

      const reader = new BrowserMultiFormatReader(createScanHints(), {
        delayBetweenScanAttempts: 100,
        delayBetweenScanSuccess: 800,
        tryPlayVideoTimeout: 8000,
      });

      scannerControlsRef.current = await reader.decodeFromStream(stream, videoRef.current, (result) => {
        const scannedCode = result?.getText()?.trim();

        if (!scannedCode || scanLockRef.current) {
          return;
        }

        scanLockRef.current = true;

        if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
          try {
            navigator.vibrate(80);
          } catch {
            // ignore
          }
        }

        setLastCode(scannedCode);
        setManualCode(scannedCode);
        setMessage(`พบรหัส: ${scannedCode} — พร้อมบันทึกรับเข้า`);
        stopCamera();
      });
    } catch {
      setMessage("เปิดกล้องไม่ได้ กรุณาอนุญาตสิทธิ์กล้องหรือใช้การคีย์แทน");
      stopCamera();
    }
  }

  function stopCamera() {
    scannerControlsRef.current?.stop();
    scannerControlsRef.current = null;

    const track = videoTrackRef.current;
    if (track && torchOn) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        void track.applyConstraints({ advanced: [{ torch: false } as any] }).catch(() => {});
      } catch {
        // ignore
      }
    }
    videoTrackRef.current = null;

    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    scanLockRef.current = false;

    if (tapIndicatorTimeoutRef.current !== null) {
      window.clearTimeout(tapIndicatorTimeoutRef.current);
      tapIndicatorTimeoutRef.current = null;
    }

    setIsScanning(false);
    setTorchSupported(false);
    setTorchOn(false);
    setZoomCapability(null);
    setZoomLevel(1);
    setTapIndicator(null);
  }

  async function toggleTorch() {
    const track = videoTrackRef.current;
    if (!track || !torchSupported) {
      return;
    }
    const nextOn = !torchOn;
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await track.applyConstraints({ advanced: [{ torch: nextOn } as any] });
      setTorchOn(nextOn);
    } catch {
      setTorchSupported(false);
    }
  }

  async function applyZoom(value: number) {
    const track = videoTrackRef.current;
    if (!track || !zoomCapability) {
      return;
    }
    const clamped = Math.min(Math.max(value, zoomCapability.min), zoomCapability.max);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await track.applyConstraints({ advanced: [{ zoom: clamped } as any] });
      setZoomLevel(clamped);
    } catch {
      // ignore
    }
  }

  async function handleTapToFocus(event: React.PointerEvent<HTMLDivElement>) {
    const track = videoTrackRef.current;
    if (!track) {
      return;
    }
    const rect = event.currentTarget.getBoundingClientRect();
    const offsetX = event.clientX - rect.left;
    const offsetY = event.clientY - rect.top;
    const normalizedX = Math.min(Math.max(offsetX / rect.width, 0), 1);
    const normalizedY = Math.min(Math.max(offsetY / rect.height, 0), 1);

    setTapIndicator({ x: offsetX, y: offsetY, id: Date.now() });
    if (tapIndicatorTimeoutRef.current !== null) {
      window.clearTimeout(tapIndicatorTimeoutRef.current);
    }
    tapIndicatorTimeoutRef.current = window.setTimeout(() => {
      setTapIndicator(null);
      tapIndicatorTimeoutRef.current = null;
    }, 900);

    try {
      await track.applyConstraints({
        advanced: [
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          { pointsOfInterest: [{ x: normalizedX, y: normalizedY }], focusMode: "single-shot" } as any,
        ],
      });
      window.setTimeout(() => {
        track
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .applyConstraints({ advanced: [{ focusMode: "continuous" } as any] })
          .catch(() => {});
      }, 1500);
    } catch {
      // ignore
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
              <CardTitle>สแกน QR / บาร์โค้ดรับสินค้า</CardTitle>
              <CardDescription>รองรับ {SUPPORTED_SCAN_FORMAT_LABEL}</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="relative aspect-[4/3] overflow-hidden rounded-lg border bg-slate-950">
            <video ref={videoRef} className="h-full w-full object-cover" playsInline muted />

            {/* Scan frame */}
            <div className="pointer-events-none absolute inset-0 grid place-items-center">
              <div className="h-[82%] w-[94%] max-w-3xl rounded-lg border-2 border-cyan-300 shadow-[0_0_0_999px_rgba(2,6,23,0.32)]" />
            </div>

            {/* Tap-to-focus overlay */}
            {isScanning && (
              <div
                className="absolute inset-0 cursor-crosshair"
                onPointerDown={handleTapToFocus}
                role="button"
                aria-label="แตะเพื่อโฟกัสกล้อง"
                tabIndex={-1}
              >
                {tapIndicator ? (
                  <div
                    key={tapIndicator.id}
                    className="pointer-events-none absolute h-14 w-14 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-amber-300 motion-safe:animate-ping"
                    style={{ left: tapIndicator.x, top: tapIndicator.y }}
                  />
                ) : null}
              </div>
            )}

            {/* Torch */}
            {isScanning && torchSupported ? (
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  void toggleTorch();
                }}
                className={`absolute right-3 top-3 z-10 flex h-11 w-11 items-center justify-center rounded-full border-2 backdrop-blur transition ${
                  torchOn
                    ? "border-amber-300 bg-amber-300 text-amber-950"
                    : "border-white/40 bg-black/55 text-white hover:bg-black/70"
                }`}
                aria-label={torchOn ? "ปิดไฟฉาย" : "เปิดไฟฉาย"}
                aria-pressed={torchOn}
              >
                {torchOn ? <Flashlight className="h-5 w-5" /> : <FlashlightOff className="h-5 w-5" />}
              </button>
            ) : null}

            {/* Zoom slider */}
            {isScanning && zoomCapability ? (
              <div
                className="absolute bottom-3 left-1/2 z-10 flex w-[82%] max-w-md -translate-x-1/2 items-center gap-3 rounded-full bg-black/55 px-4 py-2 text-xs font-medium text-white backdrop-blur"
                onPointerDown={(event) => event.stopPropagation()}
              >
                <ZoomIn className="h-4 w-4 shrink-0 text-cyan-200" />
                <input
                  type="range"
                  min={zoomCapability.min}
                  max={zoomCapability.max}
                  step={zoomCapability.step}
                  value={zoomLevel}
                  onChange={(event) => {
                    void applyZoom(Number(event.target.value));
                  }}
                  className="flex-1 accent-cyan-300"
                  aria-label="ปรับซูมกล้อง"
                />
                <span className="w-10 shrink-0 text-right tabular-nums">{zoomLevel.toFixed(1)}x</span>
              </div>
            ) : null}

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
          {isScanning && <p className="text-sm text-muted-foreground">{message}</p>}
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
