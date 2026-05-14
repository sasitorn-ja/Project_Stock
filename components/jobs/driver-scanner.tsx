"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { BrowserMultiFormatReader, type IScannerControls } from "@zxing/browser";
import Link from "next/link";
import { Camera, FileText, MapPin, QrCode, ScanLine, Square, Truck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { checkInJobDestination, checkInJobOrigin, getJob, getJobs, submitJobScan } from "@/lib/job-db";
import { type JobRecord, type ScanMode } from "@/lib/jobs";
import { createScanHints, SUPPORTED_SCAN_FORMAT_LABEL } from "@/lib/scanner-formats";

async function requestCurrentPosition() {
  if (!("geolocation" in navigator)) {
    throw new Error("อุปกรณ์นี้ไม่รองรับการดึง GPS");
  }

  return new Promise<GeolocationPosition>((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true,
      timeout: 15000,
      maximumAge: 0,
    });
  });
}

export function DriverScanner({ initialJobId }: { initialJobId?: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scannerControlsRef = useRef<IScannerControls | null>(null);
  const scanLockRef = useRef(false);
  const [jobs, setJobs] = useState<JobRecord[]>([]);
  const [selectedJobId, setSelectedJobId] = useState(initialJobId ?? "");
  const [job, setJob] = useState<JobRecord | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [mode, setMode] = useState<ScanMode>("load");
  const [currentLocation, setCurrentLocation] = useState("");
  const [code, setCode] = useState("");
  const [message, setMessage] = useState("");
  const [scanResult, setScanResult] = useState<"ok" | "alert" | null>(null);
  const [latestGps, setLatestGps] = useState("");
  const [cameraMessage, setCameraMessage] = useState("เปิดกล้องเพื่อสแกน QR Code หรือ Barcode");
  const [isCameraScanning, setIsCameraScanning] = useState(false);
  const [isFetchingOriginGps, setIsFetchingOriginGps] = useState(false);
  const [isFetchingDestinationGps, setIsFetchingDestinationGps] = useState(false);

  useEffect(() => {
    return () => stopCamera();
  }, []);

  useEffect(() => {
    async function loadJobs() {
      setIsLoading(true);

      try {
        const nextJobs = await getJobs();
        setJobs(nextJobs);

        const nextSelectedJobId = initialJobId || selectedJobId || nextJobs[0]?.id || "";
        setSelectedJobId(nextSelectedJobId);

        if (nextSelectedJobId) {
          const nextJob = await getJob(nextSelectedJobId);
          setJob(nextJob);
          setCurrentLocation((current) => {
            if (current && nextJob?.destinations.some((destination) => destination.id === current)) {
              return current;
            }

            return nextJob?.destinations[0]?.id ?? "";
          });
        } else {
          setJob(null);
          setCurrentLocation("");
        }
      } catch {
        setMessage("โหลดข้อมูลห้องคนขับไม่สำเร็จ");
        setScanResult("alert");
      } finally {
        setIsLoading(false);
      }
    }

    void loadJobs();
  }, [initialJobId, selectedJobId]);

  const currentDestination = useMemo(
    () => job?.destinations.find((destination) => destination.id === currentLocation) ?? job?.destinations[0],
    [currentLocation, job],
  );
  const isDedicatedDriverMode = Boolean(initialJobId);
  const hasOriginCheckIn = Boolean(job?.originCheckedInAt && job.originGps);
  const isOriginGpsRequired = Boolean(job) && !hasOriginCheckIn;
  const hasDestinationCheckIn = Boolean(currentDestination?.deliveryCheckedInAt && currentDestination.deliveryGps);
  const isDestinationGpsRequired = mode === "deliver" && Boolean(job) && Boolean(currentDestination) && !hasDestinationCheckIn;
  const requiredTotal = job?.items.reduce((sum, item) => sum + item.orderQty, 0) ?? 0;
  const loadedTotal = job?.items.reduce((sum, item) => sum + item.loadedQty, 0) ?? 0;
  const deliveredTotal = job?.items.reduce((sum, item) => sum + item.deliveredQty, 0) ?? 0;
  const hasLoadedItems = loadedTotal > 0;
  const isDeliverModeLocked = Boolean(job) && (!hasOriginCheckIn || !hasLoadedItems);
  const isScanBlocked = !job || isOriginGpsRequired || (mode === "deliver" && (isDeliverModeLocked || isDestinationGpsRequired));
  const roomTitle = job?.roomName?.trim() || job?.id || "ยังไม่ได้เลือกห้อง Job";
  const activeStep = !job ? 0 : isOriginGpsRequired ? 1 : !hasLoadedItems ? 2 : isDestinationGpsRequired ? 2 : 3;

  useEffect(() => {
    if (mode === "deliver" && isDeliverModeLocked) {
      setMode("load");
    }
  }, [isDeliverModeLocked, mode]);

  async function captureOriginGps() {
    if (!job) {
      setMessage("ยังไม่มี Job ให้เช็กอิน GPS");
      setScanResult("alert");
      return;
    }

    setIsFetchingOriginGps(true);

    try {
      const position = await requestCurrentPosition();
      const latitude = position.coords.latitude;
      const longitude = position.coords.longitude;
      const accuracy = position.coords.accuracy;
      const gpsText = `${latitude.toFixed(6)},${longitude.toFixed(6)} / accuracy ${Math.round(accuracy)} m`;

      const nextJob = await checkInJobOrigin({
        jobId: job.id,
        latitude,
        longitude,
        accuracy,
      });

      setJob(nextJob);
      setLatestGps(nextJob.originGps || gpsText);
      setMessage("ดึง GPS จากมือถือและเช็กอินต้นทางเรียบร้อยแล้ว");
      setScanResult("ok");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "ดึง GPS จากอุปกรณ์ไม่สำเร็จ กรุณาลองใหม่");
      setScanResult("alert");
    } finally {
      setIsFetchingOriginGps(false);
    }
  }

  async function captureDestinationGps() {
    if (!job || !currentDestination) {
      setMessage("ยังไม่ได้เลือกปลายทางสำหรับเช็กอิน GPS");
      setScanResult("alert");
      return;
    }

    if (isDeliverModeLocked) {
      setMessage("ต้องเช็กอินต้นทางและสแกนขึ้นรถอย่างน้อย 1 รายการก่อน จึงจะเปิดปลายทางได้");
      setScanResult("alert");
      return;
    }

    setIsFetchingDestinationGps(true);

    try {
      const position = await requestCurrentPosition();
      const latitude = position.coords.latitude;
      const longitude = position.coords.longitude;
      const accuracy = position.coords.accuracy;
      const gpsText = `${latitude.toFixed(6)},${longitude.toFixed(6)} / accuracy ${Math.round(accuracy)} m`;

      const nextJob = await checkInJobDestination({
        jobId: job.id,
        destinationId: currentDestination.id,
        latitude,
        longitude,
        accuracy,
      });

      setJob(nextJob);
      const nextDestination = nextJob.destinations.find((destination) => destination.id === currentDestination.id);
      setLatestGps(nextDestination?.deliveryGps || gpsText);
      setMessage(`เช็กอิน GPS ปลายทาง ${currentDestination.name} เรียบร้อยแล้ว`);
      setScanResult("ok");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "ดึง GPS ปลายทางไม่สำเร็จ กรุณาลองใหม่");
      setScanResult("alert");
    } finally {
      setIsFetchingDestinationGps(false);
    }
  }

  async function submitScannedCode(nextCode: string) {
    if (!job) {
      setMessage("ยังไม่มี Job ให้สแกน");
      setScanResult("alert");
      return;
    }

    const normalizedCode = nextCode.trim();
    if (!normalizedCode) {
      setMessage("กรุณาสแกนหรือกรอกรหัสก่อนบันทึก");
      setScanResult("alert");
      return;
    }

    if (mode === "deliver" && isDeliverModeLocked) {
      setMessage("ต้องสแกนขึ้นรถที่ต้นทางก่อน จึงจะบันทึกส่งปลายทางได้");
      setScanResult("alert");
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await submitJobScan({
        jobId: job.id,
        code: normalizedCode,
        mode,
        destinationId: mode === "deliver" ? currentDestination?.id : undefined,
      });

      setJob(response.job);
      setMessage(response.message);
      setScanResult(response.result);
      setCode("");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "บันทึกการสแกนไม่สำเร็จ");
      setScanResult("alert");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleScanSubmit() {
    await submitScannedCode(code);
  }

  async function startCamera() {
    if (isScanBlocked) {
      setCameraMessage(
        isOriginGpsRequired
          ? "ต้องเช็กอิน GPS ต้นทางก่อนเปิดกล้อง"
          : mode === "deliver" && isDeliverModeLocked
            ? "ต้องสแกนขึ้นรถที่ต้นทางก่อนเปิดปลายทาง"
            : "ต้องเช็กอิน GPS ปลายทางก่อนเปิดกล้อง",
      );
      return;
    }

    if (!("mediaDevices" in navigator)) {
      setCameraMessage("อุปกรณ์นี้ไม่รองรับการเปิดกล้องผ่านเว็บ");
      return;
    }

    if (!videoRef.current) {
      setCameraMessage("ยังไม่พร้อมเปิดกล้อง กรุณาลองใหม่");
      return;
    }

    try {
      scanLockRef.current = false;

      // Step 1: acquire camera stream independently (more reliable than decodeFromConstraints)
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
          frameRate: { ideal: 30 },
        },
        audio: false,
      });

      streamRef.current = stream;
      videoRef.current.srcObject = stream;
      await videoRef.current.play();

      setIsCameraScanning(true);
      setCameraMessage("เล็งกรอบไปที่ QR Code หรือ Barcode ที่มีเลข PO/รหัสสินค้า");

      // Step 2: attach ZXing decoder to the live stream
      const reader = new BrowserMultiFormatReader(createScanHints(), {
        delayBetweenScanAttempts: 100,
        delayBetweenScanSuccess: 800,
        tryPlayVideoTimeout: 8000,
      });

      scannerControlsRef.current = await reader.decodeFromStream(
        stream,
        videoRef.current,
        (result, error) => {
          // error here is NotFoundException (normal when no barcode visible) — ignore it
          if (!result || scanLockRef.current) return;

          const scannedCode = result.getText().trim();
          if (!scannedCode) return;

          scanLockRef.current = true;
          setCode(scannedCode);
          setCameraMessage(`พบรหัส ${scannedCode} — กำลังบันทึก`);
          stopCamera();
          void submitScannedCode(scannedCode);
        },
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setCameraMessage(`เปิดกล้องไม่ได้ (${msg}) — กรุณาอนุญาตสิทธิ์กล้อง หรือคีย์รหัสแทน`);
      setIsCameraScanning(false);
      // clean up stream if it was partially acquired
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  }

  function stopCamera() {
    scannerControlsRef.current?.stop();
    scannerControlsRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    scanLockRef.current = false;
    setIsCameraScanning(false);
  }

  return (
    <div className="space-y-3 sm:space-y-4">
      {!isDedicatedDriverMode ? (
        <Card>
          <CardContent className="space-y-2 pt-5">
            <Label htmlFor="job-selector">เลือกห้อง Job</Label>
            <select
              id="job-selector"
              value={selectedJobId}
              onChange={(event) => setSelectedJobId(event.target.value)}
              className="h-10 w-full rounded-md border border-[#cfd6df] bg-white px-3 text-sm text-slate-900"
            >
              <option value="">เลือกห้อง Job</option>
              {jobs.map((currentJob) => (
                <option key={currentJob.id} value={currentJob.id}>
                  {(currentJob.roomName?.trim() || currentJob.id)} - {currentJob.vehicle || "ไม่ระบุรถ"}
                </option>
              ))}
            </select>
          </CardContent>
        </Card>
      ) : null}

      <section className="rounded-lg border border-[#d8dde6] bg-white px-3 py-3 sm:px-4 sm:py-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Driver Room</p>
            <h2 className="mt-1 break-words text-xl font-bold tracking-normal text-slate-950 sm:text-2xl">{roomTitle}</h2>
            <p className="mt-1 break-words text-sm text-slate-500">
              {job ? `${job.id} / รถ ${job.vehicle || "-"} / คนขับ ${job.driver || "-"}` : "เลือกห้อง Job เพื่อเริ่มงาน"}
            </p>
          </div>
          <Badge variant={mode === "load" ? "warning" : "success"} className="w-fit">
            {mode === "load" ? "โหมดขึ้นรถ" : "โหมดส่งปลายทาง"}
          </Badge>
        </div>

        <div className="mt-4 grid grid-cols-3 gap-2 sm:gap-3">
          <div className="rounded-md border border-[#d8dde6] bg-slate-50 px-2 py-2 sm:px-3 sm:py-3">
            <p className="text-xs text-slate-500">ต้องโหลด</p>
            <p className="mt-1 text-base font-semibold text-slate-950 sm:text-lg">{requiredTotal.toLocaleString("th-TH")} ชิ้น</p>
          </div>
          <div className="rounded-md border border-[#d8dde6] bg-slate-50 px-2 py-2 sm:px-3 sm:py-3">
            <p className="text-xs text-slate-500">ขึ้นรถแล้ว</p>
            <p className="mt-1 text-base font-semibold text-slate-950 sm:text-lg">{loadedTotal.toLocaleString("th-TH")} ชิ้น</p>
          </div>
          <div className="rounded-md border border-[#d8dde6] bg-slate-50 px-2 py-2 sm:px-3 sm:py-3">
            <p className="text-xs text-slate-500">ส่งแล้ว</p>
            <p className="mt-1 text-base font-semibold text-slate-950 sm:text-lg">{deliveredTotal.toLocaleString("th-TH")} ชิ้น</p>
          </div>
        </div>
      </section>

      <Card>
        <CardContent className="grid gap-2 p-3 sm:gap-3 sm:p-5 md:grid-cols-3">
          {[
            ["1", "เช็กอินต้นทาง", hasOriginCheckIn ? "เสร็จแล้ว" : "รอดึง GPS"],
            ["2", "สแกนขึ้นรถ", hasLoadedItems ? "มีรายการขึ้นรถแล้ว" : "ยังไม่เปิดปลายทาง"],
            ["3", "สแกนสินค้า", activeStep === 3 ? "พร้อมสแกน" : "ยังล็อกอยู่"],
          ].map(([step, label, status]) => (
            <div
              key={step}
              className={`rounded-md border px-2 py-3 sm:px-3 ${
                Number(step) <= activeStep ? "border-slate-900 bg-slate-950 text-white" : "border-[#d8dde6] bg-white text-slate-700"
              }`}
            >
              <div className="flex items-center gap-2">
                <span className="flex size-6 items-center justify-center rounded-full bg-white text-xs font-bold text-slate-950">{step}</span>
                <span className="text-sm font-medium sm:text-base">{label}</span>
              </div>
              <p className={Number(step) <= activeStep ? "mt-2 text-xs text-slate-200" : "mt-2 text-xs text-slate-500"}>{status}</p>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <MapPin className="h-4 w-4" />
            จุดเช็กอิน
          </CardTitle>
          <CardDescription>ใช้พิกัดจากมือถือเครื่องนี้เท่านั้น</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 p-3 sm:p-5 md:grid-cols-2">
          <div className="rounded-md border border-[#d8dde6] bg-slate-50 p-3">
            <p className="text-sm font-medium">ต้นทาง</p>
            <p className="mt-1 text-sm text-slate-500">{job?.origin || "-"}</p>
            <p className="mt-2 whitespace-pre-line break-words text-xs leading-5 text-slate-500">{job?.originGps || "ยังไม่เช็กอิน"}</p>
            <Button type="button" variant="outline" className="mt-3 w-full" onClick={captureOriginGps} disabled={!job || isFetchingOriginGps}>
              {isFetchingOriginGps ? "กำลังดึง GPS" : hasOriginCheckIn ? "เช็กอินต้นทางใหม่" : "เช็กอินต้นทาง"}
            </Button>
          </div>

          <div className="rounded-md border border-[#d8dde6] bg-slate-50 p-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-medium">ปลายทางปัจจุบัน</p>
              {isDeliverModeLocked ? <Badge variant="outline">ล็อกอยู่</Badge> : null}
            </div>
            {job?.destinations.length ? (
              <select
                value={currentLocation}
                onChange={(event) => setCurrentLocation(event.target.value)}
                disabled={isDeliverModeLocked}
                className="mt-2 h-10 w-full rounded-md border border-[#cfd6df] bg-white px-3 text-sm text-slate-900"
              >
                {job.destinations.map((destination) => (
                  <option key={destination.id} value={destination.id}>
                    {destination.name}
                  </option>
                ))}
              </select>
            ) : (
              <p className="mt-2 text-sm text-slate-500">ยังไม่มีปลายทาง</p>
            )}
            <p className="mt-2 whitespace-pre-line break-words text-xs leading-5 text-slate-500">
              {currentDestination?.deliveryGps || "ยังไม่เช็กอินปลายทาง"}
            </p>
            <Button
              type="button"
              variant="outline"
              className="mt-3 w-full"
              onClick={captureDestinationGps}
              disabled={!job || !currentDestination || isDeliverModeLocked || isFetchingDestinationGps}
            >
              {isFetchingDestinationGps ? "กำลังดึง GPS" : hasDestinationCheckIn ? "เช็กอินปลายทางใหม่" : "เช็กอินปลายทาง"}
            </Button>
          </div>

          {(isOriginGpsRequired || isDeliverModeLocked || isDestinationGpsRequired) && job ? (
            <div className="md:col-span-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              {isOriginGpsRequired
                ? "ต้องเช็กอิน GPS ต้นทางก่อน จึงจะเปิดให้สแกนสินค้า"
                : isDeliverModeLocked
                  ? "ต้องสแกนขึ้นรถที่ต้นทางก่อนอย่างน้อย 1 รายการ ระบบจึงจะเปิดส่วนปลายทาง"
                : `ต้องเช็กอิน GPS ปลายทาง ${currentDestination?.name || ""} ก่อน จึงจะสแกนส่งของได้`}
            </div>
          ) : null}
          {latestGps ? (
            <div className="md:col-span-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
              พิกัดล่าสุด: {latestGps}
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <ScanLine className="h-4 w-4" />
            สแกนสินค้า
          </CardTitle>
          <CardDescription>เลือกโหมดให้ตรงกับงานที่ทำอยู่ แล้วสแกนหรือกรอกรหัส</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 p-3 sm:p-5">
          {/* Video — full card width, no column constraint */}
          <div className="relative w-full overflow-hidden rounded-lg border bg-slate-950" style={{ aspectRatio: "4/3", minHeight: "320px" }}>
            <video ref={videoRef} className="h-full w-full object-cover" playsInline muted />
            {/* Scan frame — decorative guide for user */}
            <div className="pointer-events-none absolute inset-0 grid place-items-center">
              <div className="relative h-[72%] w-[90%] max-w-3xl rounded-md border-2 border-cyan-300 shadow-[0_0_0_999px_rgba(2,6,23,0.32)] sm:h-[70%] sm:w-[86%]">
                {/* Animated scan line when camera is on */}
                {isCameraScanning && (
                  <div
                    className="absolute left-0 right-0 h-0.5 bg-cyan-400 opacity-80"
                    style={{ animation: "scanLine 2s linear infinite", top: "50%" }}
                  />
                )}
              </div>
            </div>
            {/* Overlay shown when camera is off */}
            {!isCameraScanning && (
              <div className="absolute inset-0 grid place-items-center px-4 text-center text-slate-200">
                <div>
                  <Camera className="mx-auto mb-2 h-10 w-10" />
                  <p className="text-sm">{cameraMessage}</p>
                  <p className="mt-1 text-xs text-slate-400">รองรับ {SUPPORTED_SCAN_FORMAT_LABEL}</p>
                </div>
              </div>
            )}
            {/* Live camera message */}
            {isCameraScanning && (
              <div className="absolute bottom-2 left-0 right-0 flex justify-center">
                <span className="rounded-full bg-black/60 px-3 py-1 text-xs text-cyan-200">{cameraMessage}</span>
              </div>
            )}
          </div>

          {/* Scan line animation keyframes */}
          <style>{`
            @keyframes scanLine {
              0%   { top: 10%; }
              50%  { top: 90%; }
              100% { top: 10%; }
            }
          `}</style>

          {/* Controls — mode buttons + camera buttons + input */}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_auto_auto]">
            <button
              type="button"
              onClick={() => setMode("load")}
              disabled={!job || isOriginGpsRequired}
              className={`flex items-center justify-center gap-2 rounded-lg border-2 px-3 py-3 text-sm font-semibold transition-colors disabled:opacity-40 ${
                mode === "load"
                  ? "border-amber-500 bg-amber-500 text-white shadow-sm"
                  : "border-[#d8dde6] bg-white text-slate-600 hover:border-amber-400 hover:bg-amber-50"
              }`}
            >
              <Truck className="h-5 w-5 shrink-0" />
              <div className="text-left">
                <div>ขึ้นรถ</div>
                <div className="text-[10px] font-normal opacity-75">โหลดสินค้าที่คลัง</div>
              </div>
            </button>
            <button
              type="button"
              onClick={() => {
                if (isDeliverModeLocked) {
                  setMessage("ต้องเช็กอินต้นทางและสแกนขึ้นรถก่อน จึงจะเลือกโหมดส่งปลายทางได้");
                  setScanResult("alert");
                  return;
                }
                setMode("deliver");
              }}
              disabled={!job || isDeliverModeLocked}
              className={`flex items-center justify-center gap-2 rounded-lg border-2 px-3 py-3 text-sm font-semibold transition-colors disabled:opacity-40 ${
                mode === "deliver"
                  ? "border-emerald-500 bg-emerald-500 text-white shadow-sm"
                  : "border-[#d8dde6] bg-white text-slate-600 hover:border-emerald-400 hover:bg-emerald-50"
              }`}
            >
              <QrCode className="h-5 w-5 shrink-0" />
              <div className="text-left">
                <div>ส่งปลายทาง</div>
                <div className="text-[10px] font-normal opacity-75">ส่งของให้ลูกค้า</div>
              </div>
            </button>
            <Button type="button" onClick={startCamera} disabled={!job || isCameraScanning || isScanBlocked} className="gap-2">
              <Camera className="h-4 w-4" />
              เปิดกล้อง
            </Button>
            <Button type="button" variant="outline" onClick={stopCamera} disabled={!isCameraScanning} className="gap-2">
              <Square className="h-4 w-4" />
              หยุด
            </Button>
          </div>

          <div className="space-y-2">
            <Label htmlFor="scan-code">เลข PO / Barcode / QR / registry key</Label>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input
                id="scan-code"
                value={code}
                onChange={(event) => setCode(event.target.value)}
                disabled={!job || isScanBlocked}
                placeholder="สแกนหรือกรอกรหัส"
              />
                <Button type="button" onClick={handleScanSubmit} disabled={!job || isSubmitting || isScanBlocked} className="sm:w-32">
                  {isSubmitting ? "กำลังบันทึก" : "บันทึก"}
                </Button>
              </div>
          </div>

          {message ? (
            <div
              className={
                scanResult === "alert"
                  ? "whitespace-pre-line rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700"
                  : "whitespace-pre-line rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700"
              }
            >
              {message}
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <FileText className="h-4 w-4" />
            รายการในห้อง
          </CardTitle>
          <CardDescription>แสดงแบบสรุปตามปลายทาง ลดเหลือเฉพาะที่ต้องใช้หน้างาน</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {job?.destinations.length ? (
            job.destinations.map((destination) => {
              const items = job.items.filter((item) => item.destinationId === destination.id);
              const total = items.reduce((sum, item) => sum + item.orderQty, 0);
              const loaded = items.reduce((sum, item) => sum + item.loadedQty, 0);
              const delivered = items.reduce((sum, item) => sum + item.deliveredQty, 0);

              return (
                <details key={destination.id} className="rounded-md border border-[#d8dde6] bg-white">
                  <summary className="flex cursor-pointer items-center justify-between gap-3 px-3 py-3 text-sm font-medium">
                    <span className="min-w-0 break-words">{destination.name}</span>
                    <span className="shrink-0 text-xs text-slate-500">
                      {delivered}/{loaded}/{total}
                    </span>
                  </summary>
                  <div className="space-y-2 border-t border-[#d8dde6] p-3">
                    {items.map((item) => (
                      <div key={item.registryKey} className="rounded-md bg-slate-50 px-3 py-2 text-sm">
                        <div className="flex items-start justify-between gap-3">
                          <span className="min-w-0 break-words">{item.materialCode || item.registryKey}</span>
                          <span className="shrink-0 font-semibold">{item.deliveredQty}/{item.loadedQty}/{item.orderQty}</span>
                        </div>
                        <p className="mt-1 break-words text-xs text-slate-500">{item.materialName || "-"}</p>
                      </div>
                    ))}
                  </div>
                </details>
              );
            })
          ) : (
            <div className="rounded-md border bg-slate-50 p-4 text-sm text-slate-500">ยังไม่มีรายการในห้องนี้</div>
          )}

          {job && !isDedicatedDriverMode ? (
            <Button asChild variant="outline">
              <Link href={`/jobs/monitor?jobId=${encodeURIComponent(job.id)}`}>เปิด Monitor ของ Job นี้</Link>
            </Button>
          ) : null}
        </CardContent>
      </Card>

      {isLoading ? <div className="text-sm text-muted-foreground">กำลังโหลดข้อมูลห้องคนขับ</div> : null}
    </div>
  );
}
