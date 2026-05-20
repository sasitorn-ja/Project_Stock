"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { BrowserMultiFormatReader, type IScannerControls } from "@zxing/browser";
import Link from "next/link";
import { Camera, Check, CheckCircle2, ChevronDown, FileText, Flashlight, FlashlightOff, MapPin, QrCode, ScanLine, Square, Truck, ZoomIn } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { checkInJobDestination, checkInJobOrigin, getJob, getJobs, submitJobScan } from "@/lib/job-db";
import { type JobSummaryRecord, type ScanMode } from "@/lib/jobs";
import { createScanHints, MIN_SCAN_CODE_LENGTH, SUPPORTED_SCAN_FORMAT_LABEL } from "@/lib/scanner-formats";

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
  const videoTrackRef = useRef<MediaStreamTrack | null>(null);
  const scanLockRef = useRef(false);
  const completionAlertShownRef = useRef("");
  const fullyLoadedAlertShownRef = useRef("");
  const tapIndicatorTimeoutRef = useRef<number | null>(null);
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
  const [torchSupported, setTorchSupported] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const [zoomCapability, setZoomCapability] = useState<{ min: number; max: number; step: number } | null>(null);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [tapIndicator, setTapIndicator] = useState<{ x: number; y: number; id: number } | null>(null);
  const [isFetchingOriginGps, setIsFetchingOriginGps] = useState(false);
  const [isFetchingDestinationGps, setIsFetchingDestinationGps] = useState(false);
  const autoStartAttemptRef = useRef("");

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

  function getOpenDestinations(nextJob: JobSummaryRecord | null) {
    if (!nextJob) {
      return [];
    }

    return nextJob.destinations.filter((destination) => {
      const items = nextJob.items.filter((item) => item.destinationId === destination.id);
      const required = items.reduce((sum, item) => sum + item.orderQty, 0);
      const delivered = items.reduce((sum, item) => sum + item.deliveredQty, 0);

      return required > 0 && delivered < required;
    });
  }

  const openDestinations = useMemo(() => getOpenDestinations(job), [job]);

  const currentDestination = useMemo(
    () => openDestinations.find((destination) => destination.id === currentLocation) ?? openDestinations[0],
    [currentLocation, openDestinations],
  );
  const isDedicatedDriverMode = Boolean(initialJobId);
  const isJobCompleted = Boolean(job?.completedAt || job?.status === "completed");
  const hasOriginCheckIn = Boolean(job?.originCheckedInAt && job.originGps);
  const isOriginLocked = Boolean(job?.originLockedAt);
  const canRecheckOrigin = Boolean(job?.allowOriginRecheckAfterLocked);
  const isOriginGpsRequired = Boolean(job) && !isJobCompleted && !hasOriginCheckIn;
  const hasDestinationCheckIn = Boolean(currentDestination?.deliveryCheckedInAt && currentDestination.deliveryGps);
  const isDestinationGpsRequired = !isJobCompleted && mode === "deliver" && Boolean(job) && Boolean(currentDestination) && !hasDestinationCheckIn;
  const requiredTotal = job?.items.reduce((sum, item) => sum + item.orderQty, 0) ?? 0;
  const loadedTotal = job?.items.reduce((sum, item) => sum + item.loadedQty, 0) ?? 0;
  const deliveredTotal = job?.items.reduce((sum, item) => sum + item.deliveredQty, 0) ?? 0;
  const isFullyLoaded = requiredTotal > 0 && loadedTotal >= requiredTotal;
  const canOpenDestinationEarly = Boolean(job?.allowDestinationBeforeFullyLoaded);
  const shouldShowDestinationOnly = !isJobCompleted && Boolean(job) && (isFullyLoaded || canOpenDestinationEarly);
  const isDeliverModeLocked = Boolean(job) && (!hasOriginCheckIn || (!isFullyLoaded && !canOpenDestinationEarly));
  const isScanBlocked = !job || isJobCompleted || isOriginGpsRequired || (mode === "deliver" && (isDeliverModeLocked || isDestinationGpsRequired));
  const shouldShowScanPanel =
    Boolean(job) && !isJobCompleted && !isOriginGpsRequired && (!shouldShowDestinationOnly || Boolean(currentDestination && hasDestinationCheckIn));
  const roomTitle = job?.roomName?.trim() || job?.id || "ยังไม่ได้เลือกห้องงาน";
  const selectedJobLabel = job ? `${job.roomName?.trim() || job.id} - ${job.vehicle || "ไม่ระบุรถ"}` : "เลือกห้องงาน";
  const activeStep = !job ? 0 : isJobCompleted ? 4 : isOriginGpsRequired ? 1 : !isFullyLoaded && !canOpenDestinationEarly ? 2 : isDestinationGpsRequired ? 2 : 3;
  const originStatusText = isOriginLocked ? "ต้นทางปิดแล้ว" : hasOriginCheckIn ? "เช็กอินแล้ว" : "รอ GPS";
  const nextActionText = isJobCompleted
    ? "จบงานแล้ว"
    : isOriginGpsRequired
    ? "กดเช็กอินต้นทาง"
    : !isFullyLoaded
      ? "สแกนขึ้นรถให้ครบ"
      : hasDestinationCheckIn
        ? "สแกนส่งของ"
        : "กดเช็กอินปลายทาง";
  const isDedicatedJobUnavailable = Boolean(initialJobId) && !isLoading && !job;

  useEffect(() => {
    if (isJobCompleted) {
      return;
    }

    if (mode === "deliver" && isDeliverModeLocked) {
      setMode("load");
    }
  }, [isDeliverModeLocked, isJobCompleted, mode]);

  useEffect(() => {
    if (isJobCompleted) {
      return;
    }

    if (shouldShowDestinationOnly && mode !== "deliver") {
      setMode("deliver");
      stopCamera();
    }
  }, [isJobCompleted, mode, shouldShowDestinationOnly]);

  useEffect(() => {
    if (isJobCompleted || !job || !isFullyLoaded || canOpenDestinationEarly || fullyLoadedAlertShownRef.current === job.id) {
      return;
    }

    fullyLoadedAlertShownRef.current = job.id;
    stopCamera();
    setScanResult("ok");
    setMessage("โหลดครบแล้ว ระบบปิดต้นทางให้แล้ว\nเลือกปลายทางและเช็กอิน GPS ก่อนเริ่มสแกนส่งของ");

    window.setTimeout(() => {
      window.alert("โหลดครบแล้ว\nระบบปิดต้นทางให้แล้ว กรุณาเลือกปลายทางและเช็กอิน GPS ก่อนสแกนส่งของ");
    }, 100);
  }, [canOpenDestinationEarly, isFullyLoaded, isJobCompleted, job]);

  useEffect(() => {
    if (isJobCompleted || !job || !shouldShowDestinationOnly) {
      return;
    }

    if (!openDestinations.length) {
      setCurrentLocation("");
      stopCamera();
      return;
    }

    if (!openDestinations.some((destination) => destination.id === currentLocation)) {
      setCurrentLocation(openDestinations[0].id);
      stopCamera();
    }
  }, [currentLocation, isJobCompleted, job, openDestinations, shouldShowDestinationOnly]);

  useEffect(() => {
    if (!isJobCompleted || !job) {
      return;
    }

    stopCamera();
    setScanResult("ok");
    setMessage("จบงานแล้ว ส่งครบทุกปลายทาง ระบบบันทึกและปิดงานให้เรียบร้อย");

    if (completionAlertShownRef.current === job.id) {
      return;
    }

    completionAlertShownRef.current = job.id;
    window.setTimeout(() => {
      window.alert("จบงานแล้ว\nส่งครบทุกปลายทาง ระบบบันทึกและปิดงานให้เรียบร้อย");
    }, 100);
  }, [isJobCompleted, job]);

  useEffect(() => {
    if (!isDedicatedDriverMode || isScanBlocked || isCameraScanning || !job) {
      return;
    }

    const key = `${job.id}:${mode}:${currentDestination?.id ?? "load"}:${hasDestinationCheckIn ? "gps" : "nogps"}`;
    if (autoStartAttemptRef.current === key) {
      return;
    }

    autoStartAttemptRef.current = key;
    const timeoutId = window.setTimeout(() => {
      void startCamera();
    }, 450);

    return () => window.clearTimeout(timeoutId);
  }, [currentDestination?.id, hasDestinationCheckIn, isCameraScanning, isDedicatedDriverMode, isScanBlocked, job, mode]);

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
      const nextOpenDestinations = getOpenDestinations(response.job);
      const nextCurrentDestination = nextOpenDestinations.find((destination) => destination.id === currentDestination?.id);

      if (!nextCurrentDestination) {
        setCurrentLocation(nextOpenDestinations[0]?.id ?? "");
        stopCamera();
      }

      const nextRequiredTotal = response.job.items.reduce((sum, item) => sum + item.orderQty, 0);
      const nextLoadedTotal = response.job.items.reduce((sum, item) => sum + item.loadedQty, 0);

      if (nextRequiredTotal > 0 && nextLoadedTotal >= nextRequiredTotal) {
        setMode("deliver");
        stopCamera();
      }
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

      // Step 1: acquire camera stream
      const stream = await navigator.mediaDevices.getUserMedia({
        video: getScannerVideoConstraints(),
        audio: false,
      });

      const videoTrack = stream.getVideoTracks()[0];
      if (videoTrack) {
        videoTrackRef.current = videoTrack;

        try {
          await videoTrack.applyConstraints({
            // Browser บางตัวรองรับ continuous focus/exposure/white-balance ช่วยให้ภาพคมขึ้น
            // และปรับแสงให้พอดีตอนสแกนในที่แสงน้อย
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
          // บางเครื่องไม่รองรับ focusMode ปล่อยให้ browser ใช้ autofocus ปกติ
        }

        // ตรวจจับความสามารถ torch/zoom ของกล้องเพื่อแสดงปุ่ม/แถบเลื่อน
        try {
          const capabilities = videoTrack.getCapabilities() as MediaTrackCapabilities & {
            torch?: boolean;
            zoom?: { min?: number; max?: number; step?: number };
          };
          setTorchSupported(Boolean(capabilities.torch));

          if (capabilities.zoom && typeof capabilities.zoom.max === "number") {
            const min = typeof capabilities.zoom.min === "number" ? capabilities.zoom.min : 1;
            const max = capabilities.zoom.max;
            const step = typeof capabilities.zoom.step === "number" && capabilities.zoom.step > 0 ? capabilities.zoom.step : 0.1;
            if (max > min) {
              setZoomCapability({ min, max, step });
              setZoomLevel(min);
            }
          }
        } catch {
          // บาง browser ไม่รองรับ getCapabilities — ข้ามได้
        }
      }

      streamRef.current = stream;
      videoRef.current.srcObject = stream;
      await videoRef.current.play();

      setIsCameraScanning(true);
      setCameraMessage("เล็งกรอบไปที่ QR Code หรือ Barcode ที่มีเลข PO/รหัสสินค้า");

      // Step 2: attach ZXing decoder to the live stream
      const reader = new BrowserMultiFormatReader(createScanHints(), {
        delayBetweenScanAttempts: 150,
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

          // ป้องกัน false-positive: ข้ามรหัสที่สั้นเกินไป (ไม่น่าใช่บาร์โค้ดจริง)
          if (!scannedCode || scannedCode.length < MIN_SCAN_CODE_LENGTH) return;

          scanLockRef.current = true;

          // Haptic feedback ให้ผู้ใช้รู้ทันทีว่าจับโค้ดได้ (Android Chrome ส่วนใหญ่รองรับ)
          if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
            try {
              navigator.vibrate(80);
            } catch {
              // ignore
            }
          }

          setCode(scannedCode);
          setCameraMessage(`พบรหัส ${scannedCode} กำลังบันทึก`);
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

    // ปิดไฟฉายก่อนหยุดกล้อง — กล้องบางรุ่นไฟค้างถ้าไม่สั่งปิด
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

    setIsCameraScanning(false);
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
      await track.applyConstraints({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        advanced: [{ torch: nextOn } as any],
      });
      setTorchOn(nextOn);
    } catch {
      // อุปกรณ์ไม่รองรับการเปิด torch (เช่น iOS Safari) — ปล่อยให้เงียบ
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
      await track.applyConstraints({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        advanced: [{ zoom: clamped } as any],
      });
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
          // โฟกัสจุดที่แตะ แล้วค่อย switch กลับ continuous ให้ผู้ใช้ขยับกล้องได้ปกติ
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
      // อุปกรณ์ไม่รองรับ tap-to-focus — เงียบไว้
    }
  }

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-3">
      <section className="order-2 rounded-md border border-[#d8dde6] bg-white px-3 py-3">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <p className="text-xs font-semibold text-slate-500">ห้องคนขับ</p>
              {!isDedicatedDriverMode ? (
                <div className="sm:w-72">
                  <DropdownMenu.Root>
                    <DropdownMenu.Trigger
                      className="flex h-9 w-full items-center justify-between gap-3 rounded-lg border border-[#cfd6df] bg-white px-3 text-left text-sm font-medium text-slate-900 shadow-sm outline-none transition hover:bg-slate-50 focus-visible:border-slate-400 focus-visible:ring-2 focus-visible:ring-slate-900/10 data-[state=open]:border-slate-400 data-[state=open]:ring-2 data-[state=open]:ring-slate-900/10"
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
                </div>
              ) : null}
            </div>
            <h2 className="mt-1 break-words text-lg font-bold tracking-normal text-slate-950 sm:text-xl">{roomTitle}</h2>
            <p className="mt-1 break-words text-sm text-slate-500">
              {job ? `${job.id} / รถ ${job.vehicle || "-"} / คนขับ ${job.driver || "-"}` : "เลือกห้องงานเพื่อเริ่มงาน"}
            </p>
          </div>
          <div className="flex shrink-0 flex-col gap-2 lg:w-[520px]">
            <Badge variant={isJobCompleted || shouldShowDestinationOnly ? "success" : "warning"} className="w-fit self-start lg:self-end">
              {isJobCompleted ? "จบงาน" : shouldShowDestinationOnly ? "ปลายทาง" : "ขึ้นรถ"}
            </Badge>
            <div className="rounded-md border-2 border-slate-900 bg-slate-950 px-3 py-2 text-white">
              <p className="text-[11px] text-slate-300">ขั้นตอนต่อไป</p>
              <p className="text-lg font-bold">{nextActionText}</p>
            </div>
            <div className={`grid grid-cols-2 gap-2 ${shouldShowDestinationOnly ? "sm:grid-cols-3" : "sm:grid-cols-4"}`}>
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
              {!shouldShowDestinationOnly ? (
                <div className="rounded-md border border-[#d8dde6] bg-slate-50 px-3 py-2">
                  <p className="text-[11px] text-slate-500">ต้นทาง</p>
                  <p className="text-sm font-semibold text-slate-950">{originStatusText}</p>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </section>

      {isJobCompleted && job ? (
        <Card className="order-3 border-2 border-emerald-500 bg-emerald-50">
          <CardContent className="space-y-4 p-5 text-center">
            <div className="mx-auto flex size-16 items-center justify-center rounded-full bg-emerald-600 text-white">
              <CheckCircle2 className="h-9 w-9" />
            </div>
            <div>
              <h3 className="text-2xl font-bold text-emerald-950">จบงานแล้ว</h3>
              <p className="mt-2 text-base text-emerald-800">ส่งครบทุกปลายทาง ระบบบันทึกและปิดงานเรียบร้อยแล้ว</p>
            </div>
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="rounded-md border border-emerald-200 bg-white px-3 py-2">
                <p className="text-[11px] text-emerald-700">ต้องสแกน</p>
                <p className="text-lg font-bold text-emerald-950">{requiredTotal.toLocaleString("th-TH")}</p>
              </div>
              <div className="rounded-md border border-emerald-200 bg-white px-3 py-2">
                <p className="text-[11px] text-emerald-700">ขึ้นรถแล้ว</p>
                <p className="text-lg font-bold text-emerald-950">{loadedTotal.toLocaleString("th-TH")}</p>
              </div>
              <div className="rounded-md border border-emerald-200 bg-white px-3 py-2">
                <p className="text-[11px] text-emerald-700">ส่งแล้ว</p>
                <p className="text-lg font-bold text-emerald-950">{deliveredTotal.toLocaleString("th-TH")}</p>
              </div>
            </div>
            <p className="text-sm font-medium text-emerald-900">ไม่ต้องสแกนเพิ่มแล้ว สามารถปิดหน้านี้ได้</p>
          </CardContent>
        </Card>
      ) : null}

      {isDedicatedJobUnavailable ? (
        <Card className="order-3 border-2 border-emerald-500 bg-emerald-50">
          <CardContent className="space-y-3 p-5 text-center">
            <div className="mx-auto flex size-14 items-center justify-center rounded-full bg-emerald-600 text-white">
              <CheckCircle2 className="h-8 w-8" />
            </div>
            <h3 className="text-xl font-bold text-emerald-950">งานนี้ปิดแล้ว</h3>
            <p className="text-sm leading-6 text-emerald-800">
              ถ้าเพิ่งสแกนส่งครบ แปลว่าระบบบันทึกจบงานแล้วและย้ายงานเข้าประวัติเรียบร้อย
            </p>
            <Button asChild variant="outline">
              <Link href="/driver">กลับหน้าเลือกงาน</Link>
            </Button>
          </CardContent>
        </Card>
      ) : null}

      {!isJobCompleted && isOriginGpsRequired && job ? (
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

      {!isJobCompleted && !isOriginGpsRequired && shouldShowDestinationOnly ? (
      <Card className="order-5">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <MapPin className="h-4 w-4" />
            ปลายทาง
          </CardTitle>
          <CardDescription>เลือกปลายทางแล้วกดเช็กอิน GPS ก่อน ระบบจึงจะแสดงช่องสแกนส่งของ</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 p-3">
          <div className="rounded-md border border-[#d8dde6] bg-slate-50 p-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-medium">ปลายทางปัจจุบัน</p>
            </div>
            {openDestinations.length ? (
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
                    {openDestinations.map((destination) => {
                      const isSelected = currentLocation === destination.id;

                      return (
                        <DropdownMenu.Item
                          key={destination.id}
                          onSelect={() => {
                            setCurrentLocation(destination.id);
                            stopCamera();
                          }}
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
              <p className="mt-2 text-sm text-slate-500">ส่งครบทุกปลายทางแล้ว</p>
            )}
            <p className="mt-2 whitespace-pre-line break-words text-xs leading-5 text-slate-500">
              {currentDestination?.deliveryGps || "ยังไม่เช็กอินปลายทาง"}
            </p>
            <Button
              type="button"
              className="mt-3 h-12 w-full text-base"
              onClick={captureDestinationGps}
              disabled={!job || !currentDestination || isFetchingDestinationGps}
            >
              {isFetchingDestinationGps ? "กำลังดึง GPS" : hasDestinationCheckIn ? "เช็กอินปลายทางใหม่" : "เช็กอินปลายทาง"}
            </Button>
          </div>

          {isDestinationGpsRequired && job && currentDestination ? (
            <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              ต้องเช็กอิน GPS ปลายทาง {currentDestination?.name || ""} ก่อน จึงจะสแกนส่งของได้
            </div>
          ) : null}
          <div className="rounded-md border border-sky-200 bg-sky-50 px-3 py-2 text-xs leading-5 text-sky-800">
            ถ้าเลือกปลายทางผิดแล้วสแกนสินค้า ระบบจะไม่บันทึกส่ง และจะแจ้งปลายทางที่ถูกต้องให้คนขับเปลี่ยนปลายทางก่อนสแกนต่อ
          </div>
          {latestGps ? (
            <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
              พิกัดล่าสุด: {latestGps}
            </div>
          ) : null}
        </CardContent>
      </Card>
      ) : null}

      {shouldShowScanPanel ? (
      <Card className="order-6 overflow-hidden">
        <CardHeader className="px-3 pb-2 pt-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <ScanLine className="h-4 w-4" />
            {shouldShowDestinationOnly ? "สแกนส่งของ" : "สแกนขึ้นรถ"}
          </CardTitle>
          <CardDescription>{shouldShowDestinationOnly ? "สแกนเฉพาะของปลายทางที่เลือก" : "สแกนสินค้าเข้ารถให้ครบก่อนออกจากต้นทาง"}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 p-3 sm:p-5">
          <div
            className="relative block w-full overflow-hidden rounded-lg border bg-slate-950 text-left"
            style={{ height: "clamp(420px, 72vh, 680px)" }}
          >
            <video ref={videoRef} className="h-full w-full bg-black object-cover" playsInline muted />

            {/* Scan frame — decorative guide for user */}
            <div className="pointer-events-none absolute inset-0 grid place-items-center">
              <div className="relative h-[78%] w-[92%] max-w-3xl rounded-lg border-2 border-cyan-300 shadow-[0_0_0_999px_rgba(2,6,23,0.34)]">
                {/* Animated scan line when camera is on */}
                {isCameraScanning && (
                  <div
                    className="absolute left-0 right-0 h-0.5 bg-cyan-400 opacity-80"
                    style={{ animation: "scanLine 2s linear infinite", top: "50%" }}
                  />
                )}
              </div>
            </div>

            {/* Tap-to-focus overlay (only when scanning) */}
            {isCameraScanning && (
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

            {/* Torch toggle */}
            {isCameraScanning && torchSupported ? (
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
            {isCameraScanning && zoomCapability ? (
              <div
                className="absolute bottom-12 left-1/2 z-10 flex w-[82%] max-w-md -translate-x-1/2 items-center gap-3 rounded-full bg-black/55 px-4 py-2 text-xs font-medium text-white backdrop-blur"
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

            {/* Overlay shown when camera is off (acts as the start button) */}
            {!isCameraScanning && (
              <button
                type="button"
                onClick={() => {
                  void startCamera();
                }}
                disabled={!job || isScanBlocked}
                className="absolute inset-0 grid place-items-center px-4 text-center text-slate-200 disabled:cursor-not-allowed disabled:opacity-80"
                aria-label="แตะเพื่อเปิดกล้องสแกน"
              >
                <div>
                  <Camera className="mx-auto mb-2 h-10 w-10" />
                  <p className="text-base font-semibold">แตะเพื่อสแกน</p>
                  <p className="mt-1 text-sm">{cameraMessage}</p>
                  <p className="mt-1 text-xs text-slate-400">รองรับ {SUPPORTED_SCAN_FORMAT_LABEL}</p>
                </div>
              </button>
            )}

            {/* Live camera message */}
            {isCameraScanning && (
              <div className="pointer-events-none absolute bottom-2 left-0 right-0 flex justify-center">
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

          <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
            <div
              className={`flex items-center justify-center gap-2 rounded-lg border-2 px-3 py-3 text-sm font-semibold ${
                shouldShowDestinationOnly
                  ? "border-emerald-500 bg-emerald-500 text-white"
                  : "border-amber-500 bg-amber-500 text-white"
              }`}
            >
              {shouldShowDestinationOnly ? <QrCode className="h-5 w-5 shrink-0" /> : <Truck className="h-5 w-5 shrink-0" />}
              <div className="text-left">
                <div>{shouldShowDestinationOnly ? "ปลายทาง" : "ขึ้นรถ"}</div>
                <div className="text-[10px] font-normal opacity-80">
                  {shouldShowDestinationOnly ? currentDestination?.name || "เลือกปลายทาง" : "โหลดสินค้าที่ต้นทาง"}
                </div>
              </div>
            </div>
            <Button type="button" variant="outline" onClick={stopCamera} disabled={!isCameraScanning} className="gap-2">
              <Square className="h-4 w-4" />
              หยุด
            </Button>
          </div>

          <div className="space-y-2">
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

      {job ? (
      <Card className="order-7">
        <CardHeader className="pb-4">
          <CardTitle className="flex items-center gap-2 text-base">
            <FileText className="h-4 w-4" />
            รายการในห้อง
          </CardTitle>
          <CardDescription>{shouldShowDestinationOnly ? "แสดงเฉพาะปลายทางที่กำลังส่ง" : "แสดงสรุปตามปลายทาง"}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {job?.destinations.length ? (
            (shouldShowDestinationOnly ? openDestinations : job.destinations).map((destination) => {
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
            <div className="rounded-md border bg-slate-50 p-4 text-sm text-slate-500">
              {shouldShowDestinationOnly ? "ส่งครบทุกปลายทางแล้ว" : "ยังไม่มีรายการในห้องนี้"}
            </div>
          )}

          {job && !isDedicatedDriverMode ? (
            <Button asChild variant="outline">
              <Link href={`/jobs/monitor?jobId=${encodeURIComponent(job.id)}`}>เปิดหน้าติดตามงานนี้</Link>
            </Button>
          ) : null}
        </CardContent>
      </Card>
      ) : null}

      {isLoading ? <div className="order-8 text-sm text-muted-foreground">กำลังโหลดข้อมูลห้องคนขับ</div> : null}
    </div>
  );
}
