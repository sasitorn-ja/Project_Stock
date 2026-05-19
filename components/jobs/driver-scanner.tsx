"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { BrowserMultiFormatReader, type IScannerControls } from "@zxing/browser";
import Link from "next/link";
import { Camera, Check, ChevronDown, FileText, MapPin, QrCode, ScanLine, Square, Truck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { checkInJobDestination, checkInJobOrigin, getJob, getJobs, submitJobScan } from "@/lib/job-db";
import { type JobSummaryRecord, type ScanMode } from "@/lib/jobs";
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

export function DriverScanner({
  initialJobId,
  initialJob = null,
  initialJobs = [],
}: {
  initialJobId?: string;
  initialJob?: JobSummaryRecord | null;
  initialJobs?: JobSummaryRecord[];
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scannerControlsRef = useRef<IScannerControls | null>(null);
  const scanLockRef = useRef(false);
  const [jobs, setJobs] = useState<JobSummaryRecord[]>(initialJobs);
  const [selectedJobId, setSelectedJobId] = useState(initialJobId ?? initialJob?.id ?? initialJobs[0]?.id ?? "");
  const [job, setJob] = useState<JobSummaryRecord | null>(initialJob ?? initialJobs[0] ?? null);
  const [isLoading, setIsLoading] = useState(!initialJob && !initialJobs.length);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [mode, setMode] = useState<ScanMode>("load");
  const [currentLocation, setCurrentLocation] = useState(initialJob?.destinations[0]?.id ?? initialJobs[0]?.destinations[0]?.id ?? "");
  const [code, setCode] = useState("");
  const [message, setMessage] = useState("");
  const [scanResult, setScanResult] = useState<"ok" | "alert" | null>(null);
  const [latestGps, setLatestGps] = useState("");
  const [cameraMessage, setCameraMessage] = useState("เปิดกล้องเพื่อสแกน QR หรือบาร์โค้ด");
  const [isCameraScanning, setIsCameraScanning] = useState(false);
  const [isFetchingOriginGps, setIsFetchingOriginGps] = useState(false);
  const [isFetchingDestinationGps, setIsFetchingDestinationGps] = useState(false);

  useEffect(() => {
    return () => stopCamera();
  }, []);

  useEffect(() => {
    async function loadJobs() {
      if (initialJob || initialJobs.length) {
        return;
      }

      setIsLoading(true);

      try {
        if (initialJobId) {
          const nextJob = await getJob(initialJobId);
          setJobs(nextJob ? [nextJob] : []);
          selectLoadedJob(nextJob);
        } else {
          const nextJobs = await getJobs();
          const nextJob = nextJobs.find((currentJob) => currentJob.id === selectedJobId) ?? nextJobs[0] ?? null;
          setJobs(nextJobs);
          selectLoadedJob(nextJob);
        }
      } catch {
        setMessage("โหลดข้อมูลห้องคนขับไม่สำเร็จ");
        setScanResult("alert");
      } finally {
        setIsLoading(false);
      }
    }

    void loadJobs();
    // โหลดตอนเปิดห้องเท่านั้น ตอนเลือกห้องจะใช้ข้อมูลใน list ที่โหลดมาแล้ว
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialJob, initialJobId, initialJobs.length]);

  function selectLoadedJob(nextJob: JobSummaryRecord | null) {
    setSelectedJobId(nextJob?.id ?? "");
    setJob(nextJob);
    setCurrentLocation((current) => {
      if (current && nextJob?.destinations.some((destination) => destination.id === current)) {
        return current;
      }

      return nextJob?.destinations[0]?.id ?? "";
    });
  }

  function selectJobFromList(jobId: string) {
    const nextJob = jobs.find((currentJob) => currentJob.id === jobId) ?? null;
    selectLoadedJob(nextJob);
  }

  const currentDestination = useMemo(
    () => job?.destinations.find((destination) => destination.id === currentLocation) ?? job?.destinations[0],
    [currentLocation, job],
  );
  const isDedicatedDriverMode = Boolean(initialJobId);
  const hasOriginCheckIn = Boolean(job?.originCheckedInAt && job.originGps);
  const isOriginLocked = Boolean(job?.originLockedAt);
  const canRecheckOrigin = Boolean(job?.allowOriginRecheckAfterLocked);
  const isOriginGpsRequired = Boolean(job) && !hasOriginCheckIn;
  const hasDestinationCheckIn = Boolean(currentDestination?.deliveryCheckedInAt && currentDestination.deliveryGps);
  const isDestinationGpsRequired = mode === "deliver" && Boolean(job) && Boolean(currentDestination) && !hasDestinationCheckIn;
  const requiredTotal = job?.items.reduce((sum, item) => sum + item.orderQty, 0) ?? 0;
  const loadedTotal = job?.items.reduce((sum, item) => sum + item.loadedQty, 0) ?? 0;
  const deliveredTotal = job?.items.reduce((sum, item) => sum + item.deliveredQty, 0) ?? 0;
  const isFullyLoaded = requiredTotal > 0 && loadedTotal >= requiredTotal;
  const canOpenDestinationEarly = Boolean(job?.allowDestinationBeforeFullyLoaded);
  const isDeliverModeLocked = Boolean(job) && (!hasOriginCheckIn || (!isFullyLoaded && !canOpenDestinationEarly));
  const isScanBlocked = !job || isOriginGpsRequired || (mode === "deliver" && (isDeliverModeLocked || isDestinationGpsRequired));
  const roomTitle = job?.roomName?.trim() || job?.id || "ยังไม่ได้เลือกห้องงาน";
  const selectedJobLabel = job ? `${job.roomName?.trim() || job.id} - ${job.vehicle || "ไม่ระบุรถ"}` : "เลือกห้องงาน";
  const activeStep = !job ? 0 : isOriginGpsRequired ? 1 : !isFullyLoaded && !canOpenDestinationEarly ? 2 : isDestinationGpsRequired ? 2 : 3;
  const originStatusText = isOriginLocked ? "ต้นทางปิดแล้ว" : hasOriginCheckIn ? "เช็กอินแล้ว" : "รอ GPS";
  const nextActionText = isOriginGpsRequired
    ? "กดเช็กอินต้นทาง"
    : !isFullyLoaded
      ? "สแกนขึ้นรถให้ครบ"
      : mode === "deliver"
        ? hasDestinationCheckIn
          ? "สแกนส่งของ"
          : "กดเช็กอินปลายทาง"
        : "ไปปลายทาง";

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

    if (isOriginLocked && !canRecheckOrigin) {
      setMessage("ต้นทางปิดแล้วหลังสแกนขึ้นรถครบ หากต้องแก้ไขให้โทรหาผู้ดูแลเพื่อเปิดต้นทางกรณีพิเศษ");
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
      setMessage(canRecheckOrigin ? "ผู้ดูแลเปิดต้นทางกรณีพิเศษ: เช็กอินต้นทางใหม่เรียบร้อยแล้ว" : "ดึง GPS จากมือถือและเช็กอินต้นทางเรียบร้อยแล้ว");
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
      setMessage("ต้องเช็กอินต้นทางและสแกนสินค้าขึ้นรถให้ครบก่อน จึงจะเปิดปลายทางได้ หากมีเหตุจำเป็นให้ผู้ดูแลเปิดปลายทางกรณีพิเศษ");
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
      setMessage("ต้องสแกนสินค้าขึ้นรถให้ครบก่อน จึงจะบันทึกส่งปลายทางได้ หากมีเหตุจำเป็นให้ผู้ดูแลเปิดปลายทางกรณีพิเศษ");
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
            ? "ต้องสแกนขึ้นรถให้ครบก่อนเปิดปลายทาง"
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
      setCameraMessage("เล็งกรอบไปที่ QR หรือบาร์โค้ดที่มีเลข PO/รหัสสินค้า");

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
    <div className="mx-auto flex max-w-6xl flex-col gap-3">
      {!isDedicatedDriverMode ? (
        <Card className="order-1">
          <CardContent className="space-y-2 p-3">
            <Label>เลือกห้องงาน</Label>
            <DropdownMenu.Root>
              <DropdownMenu.Trigger
                className="flex h-11 w-full items-center justify-between gap-3 rounded-xl border border-[#cfd6df] bg-white px-3 text-left text-sm font-medium text-slate-900 shadow-sm outline-none transition hover:bg-slate-50 focus-visible:border-slate-400 focus-visible:ring-2 focus-visible:ring-slate-900/10 data-[state=open]:border-slate-400 data-[state=open]:ring-2 data-[state=open]:ring-slate-900/10"
                disabled={isLoading || !jobs.length}
              >
                <span className="min-w-0 truncate">{isLoading ? "กำลังโหลดห้องงาน" : selectedJobLabel}</span>
                <ChevronDown className="size-4 shrink-0 text-slate-500 transition-transform data-[state=open]:rotate-180" />
              </DropdownMenu.Trigger>
              <DropdownMenu.Portal>
                <DropdownMenu.Content
                  align="start"
                  sideOffset={8}
                  className="z-50 max-h-72 w-[var(--radix-dropdown-menu-trigger-width)] overflow-y-auto rounded-xl border border-[#d8dde6] bg-white p-2 text-sm text-slate-900 shadow-lg shadow-slate-900/10"
                >
                  {jobs.length ? (
                    jobs.map((currentJob) => {
                      const isSelected = selectedJobId === currentJob.id;

                      return (
                        <DropdownMenu.Item
                          key={currentJob.id}
                          onSelect={() => selectJobFromList(currentJob.id)}
                          className="flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 outline-none transition-colors hover:bg-slate-50 focus:bg-slate-50 data-[highlighted]:bg-slate-50"
                        >
                          <span className="flex size-4 shrink-0 items-center justify-center">
                            {isSelected ? <Check className="size-4 text-slate-950" /> : null}
                          </span>
                          <span className="min-w-0">
                            <span className="block truncate font-semibold">{currentJob.roomName?.trim() || currentJob.id}</span>
                            <span className="mt-0.5 block truncate text-xs text-slate-500">
                              {currentJob.vehicle || "ไม่ระบุรถ"} / {currentJob.driver || "ไม่ระบุคนขับ"}
                            </span>
                          </span>
                        </DropdownMenu.Item>
                      );
                    })
                  ) : (
                    <div className="rounded-lg px-3 py-2.5 text-sm text-slate-500">ยังไม่มีห้องงานให้เลือก</div>
                  )}
                </DropdownMenu.Content>
              </DropdownMenu.Portal>
            </DropdownMenu.Root>
          </CardContent>
        </Card>
      ) : null}

      <section className="order-2 rounded-md border border-[#d8dde6] bg-white px-3 py-3">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <p className="text-xs font-semibold text-slate-500">ห้องคนขับ</p>
            <h2 className="mt-1 break-words text-lg font-bold tracking-normal text-slate-950 sm:text-xl">{roomTitle}</h2>
            <p className="mt-1 break-words text-sm text-slate-500">
              {job ? `${job.id} / รถ ${job.vehicle || "-"} / คนขับ ${job.driver || "-"}` : "เลือกห้องงานเพื่อเริ่มงาน"}
            </p>
          </div>
          <div className="flex shrink-0 flex-col gap-2 lg:w-[520px]">
            <Badge variant={mode === "load" ? "warning" : "success"} className="w-fit self-start lg:self-end">
              {mode === "load" ? "โหมดขึ้นรถ" : "โหมดส่งปลายทาง"}
            </Badge>
            <div className="rounded-md border-2 border-slate-900 bg-slate-950 px-3 py-2 text-white">
              <p className="text-[11px] text-slate-300">ขั้นตอนต่อไป</p>
              <p className="text-lg font-bold">{nextActionText}</p>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <div className="rounded-md border border-[#d8dde6] bg-slate-50 px-3 py-2">
                <p className="text-[11px] text-slate-500">ต้องสแกน</p>
                <p className="text-base font-semibold text-slate-950">{requiredTotal.toLocaleString("th-TH")}</p>
              </div>
              <div className="rounded-md border border-[#d8dde6] bg-slate-50 px-3 py-2">
                <p className="text-[11px] text-slate-500">ขึ้นรถแล้ว</p>
                <p className="text-base font-semibold text-slate-950">{loadedTotal.toLocaleString("th-TH")}</p>
              </div>
              <div className="rounded-md border border-[#d8dde6] bg-slate-50 px-3 py-2">
                <p className="text-[11px] text-slate-500">ส่งแล้ว</p>
                <p className="text-base font-semibold text-slate-950">{deliveredTotal.toLocaleString("th-TH")}</p>
              </div>
              <div className="rounded-md border border-[#d8dde6] bg-slate-50 px-3 py-2">
                <p className="text-[11px] text-slate-500">ต้นทาง</p>
                <p className="text-sm font-semibold text-slate-950">{originStatusText}</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {isOriginGpsRequired && job ? (
        <Card className="order-3 border-slate-950">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <MapPin className="h-4 w-4" />
              เริ่มงาน: เช็กอินต้นทาง
            </CardTitle>
            <CardDescription>คนขับต้องกดเช็กอิน GPS ต้นทางจากมือถือเครื่องนี้ก่อน จึงจะเปิดส่วนสแกนสินค้าได้</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 p-3">
            <div className="rounded-md border border-[#d8dde6] bg-slate-50 p-3">
              <p className="text-sm font-medium">ต้นทาง</p>
              <p className="mt-1 break-words text-sm text-slate-600">{job.origin || "-"}</p>
              <p className="mt-2 text-xs leading-5 text-slate-500">ยังไม่เช็กอินต้นทาง</p>
            </div>
            <Button
              type="button"
              className="h-12 w-full gap-2 text-base"
              onClick={captureOriginGps}
              disabled={!job || isFetchingOriginGps}
            >
              <MapPin className="h-5 w-5" />
              {isFetchingOriginGps ? "กำลังดึง GPS ต้นทาง" : "เช็กอินต้นทางเพื่อเริ่มสแกน"}
            </Button>
            <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              หลังเช็กอินสำเร็จ ระบบจะแสดงปุ่มเปิดกล้องและช่องสแกนสินค้า
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
      ) : null}

      <Card className="order-4">
        <CardContent className="grid gap-2 p-3 md:grid-cols-3">
          {[
            ["1", "เช็กอินต้นทาง", hasOriginCheckIn ? "เสร็จแล้ว" : "รอดึง GPS"],
            [
              "2",
              "สแกนขึ้นรถ",
              isFullyLoaded ? "โหลดครบ / ปิดต้นทาง" : canOpenDestinationEarly ? "ผู้ดูแลเปิดปลายทาง" : "ยังโหลดไม่ครบ",
            ],
            ["3", "สแกนสินค้า", activeStep === 3 ? "พร้อมสแกน" : "ยังล็อกอยู่"],
          ].map(([step, label, status]) => (
            <div
              key={step}
              className={`rounded-md border px-3 py-2 ${
                Number(step) <= activeStep ? "border-slate-900 bg-slate-950 text-white" : "border-[#d8dde6] bg-white text-slate-700"
              }`}
            >
              <div className="flex items-center gap-2">
                <span className="flex size-6 items-center justify-center rounded-full bg-white text-xs font-bold text-slate-950">{step}</span>
                <span className="text-sm font-medium">{label}</span>
              </div>
              <p className={Number(step) <= activeStep ? "mt-2 text-xs text-slate-200" : "mt-2 text-xs text-slate-500"}>{status}</p>
            </div>
          ))}
        </CardContent>
      </Card>

      {!isOriginGpsRequired ? (
      <Card className="order-5">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <MapPin className="h-4 w-4" />
            จุดเช็กอิน
          </CardTitle>
          <CardDescription>ใช้พิกัดจากมือถือเครื่องนี้เท่านั้น</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 p-3 md:grid-cols-2">
          <div className="rounded-md border border-[#d8dde6] bg-slate-50 p-3">
            <p className="text-sm font-medium">ต้นทาง</p>
            <p className="mt-1 text-sm text-slate-500">{job?.origin || "-"}</p>
            <p className="mt-2 whitespace-pre-line break-words text-xs leading-5 text-slate-500">{job?.originGps || "ยังไม่เช็กอิน"}</p>
            {isOriginLocked && !canRecheckOrigin ? (
              <div className="mt-3 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-800">
                ปิดต้นทางแล้ว ห้ามเช็กอินต้นทางซ้ำ
              </div>
            ) : null}
            <Button
              type="button"
              variant={canRecheckOrigin ? "default" : "outline"}
              className="mt-3 h-12 w-full text-base"
              onClick={captureOriginGps}
              disabled={!job || isFetchingOriginGps || (isOriginLocked && !canRecheckOrigin)}
            >
              {isFetchingOriginGps
                ? "กำลังดึง GPS"
                : canRecheckOrigin
                ? "ผู้ดูแลเปิดแล้ว: เช็กอินต้นทางใหม่"
                  : hasOriginCheckIn
                    ? "เช็กอินต้นทางใหม่"
                    : "เช็กอินต้นทาง"}
            </Button>
          </div>

          <div className="rounded-md border border-[#d8dde6] bg-slate-50 p-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-medium">ปลายทางปัจจุบัน</p>
              {isDeliverModeLocked ? <Badge variant="outline">ล็อกอยู่</Badge> : null}
            </div>
            {job?.destinations.length ? (
              <DropdownMenu.Root>
                <DropdownMenu.Trigger
                  className="mt-2 flex h-10 w-full items-center justify-between gap-3 rounded-xl border border-[#cfd6df] bg-white px-3 text-left text-sm font-medium text-slate-900 shadow-sm outline-none transition hover:bg-slate-50 focus-visible:border-slate-400 focus-visible:ring-2 focus-visible:ring-slate-900/10 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400 data-[state=open]:border-slate-400 data-[state=open]:ring-2 data-[state=open]:ring-slate-900/10"
                  disabled={isDeliverModeLocked}
                >
                  <span className="min-w-0 truncate">{currentDestination?.name || "เลือกปลายทาง"}</span>
                  <ChevronDown className="size-4 shrink-0 text-slate-500" />
                </DropdownMenu.Trigger>
                <DropdownMenu.Portal>
                  <DropdownMenu.Content
                    align="start"
                    sideOffset={8}
                    className="z-50 max-h-72 w-[var(--radix-dropdown-menu-trigger-width)] overflow-y-auto rounded-xl border border-[#d8dde6] bg-white p-2 text-sm text-slate-900 shadow-lg shadow-slate-900/10"
                  >
                    {job.destinations.map((destination) => {
                      const isSelected = currentLocation === destination.id;

                      return (
                        <DropdownMenu.Item
                          key={destination.id}
                          onSelect={() => setCurrentLocation(destination.id)}
                          className="flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 outline-none transition-colors hover:bg-slate-50 focus:bg-slate-50 data-[highlighted]:bg-slate-50"
                        >
                          <span className="flex size-4 shrink-0 items-center justify-center">
                            {isSelected ? <Check className="size-4 text-slate-950" /> : null}
                          </span>
                          <span className="min-w-0">
                            <span className="block truncate font-semibold">{destination.name}</span>
                            <span className="mt-0.5 block truncate text-xs text-slate-500">
                              {destination.address || "ไม่มีที่อยู่ปลายทาง"}
                            </span>
                          </span>
                        </DropdownMenu.Item>
                      );
                    })}
                  </DropdownMenu.Content>
                </DropdownMenu.Portal>
              </DropdownMenu.Root>
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
                  ? "ต้องสแกนสินค้าขึ้นรถให้ครบก่อน ระบบจึงจะเปิดส่วนปลายทาง หากมีเหตุจำเป็นให้ผู้ดูแลเปิดปลายทางกรณีพิเศษ"
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
      ) : null}

      {!isOriginGpsRequired ? (
      <Card className="order-6">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <ScanLine className="h-4 w-4" />
            สแกนสินค้า
          </CardTitle>
          <CardDescription>เลือกโหมดให้ตรงกับงานที่ทำอยู่ แล้วสแกนหรือกรอกรหัส</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 p-3">
          {/* Video — full card width, no column constraint */}
          <div
            className="relative mx-auto w-full max-w-4xl overflow-hidden rounded-lg border bg-slate-950"
            style={{ aspectRatio: "16/9", minHeight: "300px", maxHeight: "560px" }}
          >
            <video ref={videoRef} className="h-full w-full object-cover" playsInline muted />
            {/* Scan frame — decorative guide for user */}
            <div className="pointer-events-none absolute inset-0 grid place-items-center">
              <div className="relative h-[70%] w-[76%] max-w-2xl rounded-md border-2 border-cyan-300 shadow-[0_0_0_999px_rgba(2,6,23,0.32)]">
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
          <div className="mx-auto grid w-full max-w-4xl gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_auto_auto]">
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
                  setMessage("ต้องเช็กอินต้นทางและสแกนสินค้าขึ้นรถให้ครบก่อน จึงจะเลือกโหมดส่งปลายทางได้");
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

          <div className="mx-auto w-full max-w-4xl space-y-2">
            <Label htmlFor="scan-code">เลข PO / บาร์โค้ด / QR / รหัสรายการ</Label>
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
      ) : null}

      <Card className="order-7">
        <CardHeader className="pb-4">
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
                        <p className="mt-1 break-words text-xs text-slate-500">
                          {item.materialName || "-"} / จำนวนในไฟล์ {item.sourceOrderQty || String(item.orderQty || "-")}
                        </p>
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
              <Link href={`/jobs/monitor?jobId=${encodeURIComponent(job.id)}`}>เปิดหน้าติดตามงานนี้</Link>
            </Button>
          ) : null}
        </CardContent>
      </Card>

      {isLoading ? <div className="order-8 text-sm text-muted-foreground">กำลังโหลดข้อมูลห้องคนขับ</div> : null}
    </div>
  );
}
