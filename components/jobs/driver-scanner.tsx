"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { BrowserMultiFormatReader, type IScannerControls } from "@zxing/browser";
import Link from "next/link";
import {
  AlertTriangle,
  Camera,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  FileText,
  Flashlight,
  FlashlightOff,
  Info,
  List,
  MapPin,
  QrCode,
  ScanLine,
  Square,
  Truck,
  UserRound,
  X,
  ZoomIn,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DriverRoomHeader, DriverRoomSummary } from "@/components/jobs/driver-room-header";
import { DriverScanItemList } from "@/components/jobs/driver-scan-item-list";
import { checkInJobDestination, checkInJobOrigin, clearUnusedDestinationCheckIn, getJob, getJobs, submitJobScan } from "@/lib/job-db";
import { type JobSummaryRecord, type ScanMode } from "@/lib/jobs";
import { createScanHints, MIN_SCAN_CODE_LENGTH, SUPPORTED_SCAN_FORMAT_LABEL } from "@/lib/scanner-formats";

type DriverNotice = {
  title: string;
  message: string;
  tone: "alert" | "success" | "info";
  showScanWarning?: boolean;
};

function getDriverAlertTitle(message: string) {
  if (message.includes("ไม่ใช่ของปลายทาง") || message.includes("ผิดปลายทาง")) {
    return "สแกนผิดปลายทาง";
  }

  if (message.includes("เช็กอิน GPS") || message.includes("GPS") || message.includes("ปลายทาง")) {
    return "ต้องเช็กอินให้ถูกต้อง";
  }

  if (message.includes("สแกนซ้ำ") || message.includes("ส่งซ้ำ") || message.includes("โหลดครบ") || message.includes("ส่งครบ")) {
    return "รายการนี้ถูกสแกนแล้ว";
  }

  if (message.includes("ไม่พบ")) {
    return "ไม่พบรายการในงานนี้";
  }

  return "แจ้งเตือนคนขับ";
}

function getScanSuccessNoticeTitle(message: string) {
  if (message.includes("ส่งปลายทางนี้ครบแล้ว")) {
    return "ปลายทางนี้ส่งครบแล้ว";
  }

  if (message.includes("โหลดปลายทางนี้ครบแล้ว")) {
    return "ปลายทางนี้โหลดครบแล้ว";
  }

  if (message.includes("โหลดครบแล้ว")) {
    return "โหลดครบแล้ว";
  }

  return "";
}

function playScanTickSound() {
  if (typeof window === "undefined") {
    return;
  }

  try {
    const AudioContextClass =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;

    if (!AudioContextClass) {
      return;
    }

    const audioContext = new AudioContextClass();
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    const startedAt = audioContext.currentTime;

    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(1320, startedAt);
    oscillator.frequency.exponentialRampToValueAtTime(1760, startedAt + 0.06);
    gain.gain.setValueAtTime(0.001, startedAt);
    gain.gain.exponentialRampToValueAtTime(0.16, startedAt + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, startedAt + 0.09);
    oscillator.connect(gain);
    gain.connect(audioContext.destination);
    oscillator.start(startedAt);
    oscillator.stop(startedAt + 0.1);
    window.setTimeout(() => {
      void audioContext.close().catch(() => {});
    }, 180);
  } catch {
    // Audio feedback is optional; scanning must continue even when browsers block sound.
  }
}

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
        width: { ideal: 1280 },
        height: { ideal: 720 },
        aspectRatio: { ideal: 9 / 16 },
        frameRate: { ideal: 24 },
      }
    : {
        facingMode: { ideal: "environment" },
        width: { ideal: 1280 },
        height: { ideal: 720 },
        aspectRatio: { ideal: 16 / 9 },
        frameRate: { ideal: 24 },
      };
}

function isProbablyIosBrowser() {
  if (typeof navigator === "undefined") {
    return false;
  }

  return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

function getCameraErrorMessage(error: unknown) {
  const name = error instanceof Error ? error.name : "";
  const rawMessage = error instanceof Error ? error.message : String(error);

  if (name === "NotAllowedError" || name === "PermissionDeniedError") {
    return "ยังไม่ได้อนุญาตสิทธิ์กล้อง ให้เปิดสิทธิ์กล้องของ Safari/Browser แล้วแตะเปิดกล้องอีกครั้ง";
  }

  if (name === "NotFoundError" || name === "DevicesNotFoundError") {
    return "ไม่พบกล้องในอุปกรณ์นี้ กรุณาตรวจสอบกล้องหรือคีย์รหัสแทน";
  }

  if (name === "NotReadableError" || name === "TrackStartError") {
    return "กล้องกำลังถูกใช้งานโดยแอปอื่น หรือระบบยังไม่ปล่อยกล้องให้เว็บ ปิดแอปกล้องอื่นแล้วลองใหม่";
  }

  if (name === "AbortError" || rawMessage.toLowerCase().includes("aborted")) {
    return "เบราว์เซอร์ยกเลิกการเปิดกล้องกลางทาง มักเกิดตอนเปิดกล้องเร็วหรือซ้อนกันบน iPhone ให้กดรับทราบแล้วแตะเปิดกล้องอีกครั้ง";
  }

  if (name === "OverconstrainedError" || name === "ConstraintNotSatisfiedError") {
    return "กล้องไม่รองรับค่าความละเอียดที่ร้องขอ ระบบจะให้ลองเปิดด้วยโหมดพื้นฐานอีกครั้ง";
  }

  return `เปิดกล้องไม่ได้ (${rawMessage}) กรุณาอนุญาตสิทธิ์กล้อง หรือคีย์รหัสแทน`;
}

async function requestScannerCameraStream() {
  try {
    return await navigator.mediaDevices.getUserMedia({
      video: getScannerVideoConstraints(),
      audio: false,
    });
  } catch (error) {
    await new Promise((resolve) => window.setTimeout(resolve, 250));

    return navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: { ideal: "environment" },
      },
      audio: false,
    });
  }
}

function ScanQuantityBadges({ required, loaded, delivered }: { required: number; loaded: number; delivered: number }) {
  return (
    <span className="flex max-w-full shrink-0 flex-wrap items-center gap-1.5 text-[11px] font-normal leading-5">
      <span className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2 py-0.5 text-slate-600">ต้องสแกน <strong className="font-semibold tabular-nums text-slate-800">{required.toLocaleString("th-TH")}</strong></span>
      <span className="inline-flex items-center gap-1.5 rounded-md border border-blue-100 bg-blue-50 px-2 py-0.5 text-blue-700">ขึ้นรถแล้ว <strong className="font-semibold tabular-nums">{loaded.toLocaleString("th-TH")}</strong></span>
      <span className="inline-flex items-center gap-1.5 rounded-md border border-sky-100 bg-sky-50 px-2 py-0.5 text-sky-700">ส่งแล้ว <strong className="font-semibold tabular-nums">{delivered.toLocaleString("th-TH")}</strong></span>
    </span>
  );
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
  const cameraStartInFlightRef = useRef(false);
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
  const [cameraMessage, setCameraMessage] = useState("เปิดกล้องเพื่อสแกน PO SAP No.");
  const [isCameraScanning, setIsCameraScanning] = useState(false);
  const [torchSupported, setTorchSupported] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const [zoomCapability, setZoomCapability] = useState<{ min: number; max: number; step: number } | null>(null);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [tapIndicator, setTapIndicator] = useState<{ x: number; y: number; id: number } | null>(null);
  const [isFetchingOriginGps, setIsFetchingOriginGps] = useState(false);
  const [isFetchingDestinationGps, setIsFetchingDestinationGps] = useState(false);
  const [isSwitchingDestination, setIsSwitchingDestination] = useState(false);
  const [driverNotice, setDriverNotice] = useState<DriverNotice | null>(null);
  const [isDriverItemListOpen, setIsDriverItemListOpen] = useState(false);
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
        showDriverFeedback("โหลดข้อมูลห้องคนขับไม่สำเร็จ", "alert", "โหลดห้องงานไม่สำเร็จ");
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
  const driverScanItems = useMemo(() => {
    if (!job) {
      return [];
    }

    return job.items
      .filter((item) => mode !== "deliver" || item.destinationId === currentDestination?.id)
      .map((item) => {
        const completedQty = mode === "deliver" ? item.deliveredQty : item.loadedQty;
        return {
          ...item,
          completedQty,
          remainingQty: Math.max(item.orderQty - completedQty, 0),
        };
      })
      .sort((a, b) => {
        if (a.remainingQty > 0 && b.remainingQty === 0) return -1;
        if (a.remainingQty === 0 && b.remainingQty > 0) return 1;
        return String(a.poSapNo || a.registryKey).localeCompare(String(b.poSapNo || b.registryKey));
      });
  }, [currentDestination?.id, job, mode]);

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
    showDriverSuccess("โหลดครบแล้ว ระบบปิดต้นทางให้แล้ว\nเลือกปลายทางและเช็กอิน GPS ก่อนเริ่มสแกนส่งของ", "โหลดครบแล้ว");
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
    setDriverNotice({
      title: "จบงานแล้ว",
      message: "ส่งครบทุกปลายทาง ระบบบันทึกและปิดงานให้เรียบร้อย",
      tone: "success",
    });
  }, [isJobCompleted, job]);

  useEffect(() => {
    if (!isDedicatedDriverMode || isProbablyIosBrowser() || isScanBlocked || isCameraScanning || driverNotice || !job) {
      return;
    }

    const key = `${job.id}:${mode}:${currentDestination?.id ?? "load"}:${hasDestinationCheckIn ? "gps" : "nogps"}`;
    if (autoStartAttemptRef.current === key) {
      return;
    }

    autoStartAttemptRef.current = key;
    const timeoutId = window.setTimeout(() => {
      void startCamera({ showNoticeOnError: false });
    }, 450);

    return () => window.clearTimeout(timeoutId);
  }, [currentDestination?.id, driverNotice, hasDestinationCheckIn, isCameraScanning, isDedicatedDriverMode, isScanBlocked, job, mode]);

  function closeDriverNotice() {
    const shouldRetryAutoStart = driverNotice?.tone === "success";

    setDriverNotice(null);
    if (shouldRetryAutoStart) {
      autoStartAttemptRef.current = "";
    }
  }

  function showDriverFeedback(nextMessage: string, result: "ok" | "alert", title?: string, options?: { showScanWarning?: boolean }) {
    setMessage(nextMessage);
    setScanResult(result);

    if (result === "alert") {
      stopCamera();
      setDriverNotice({
        title: title ?? getDriverAlertTitle(nextMessage),
        message: nextMessage,
        tone: "alert",
        showScanWarning: options?.showScanWarning ?? true,
      });
    }
  }

  function showDriverSuccess(nextMessage: string, title: string) {
    setMessage(nextMessage);
    setScanResult("ok");
    setDriverNotice({
      title,
      message: nextMessage,
      tone: "success",
    });
  }

  async function captureOriginGps() {
    if (!job) {
      showDriverFeedback("ยังไม่มี Job ให้เช็กอิน GPS", "alert");
      return;
    }

    if (isOriginLocked && !canRecheckOrigin) {
      showDriverFeedback("ต้นทางปิดแล้วหลังสแกนขึ้นรถครบ หากต้องแก้ไขให้โทรหาผู้ดูแลเพื่อเปิดต้นทางกรณีพิเศษ", "alert", "ต้นทางถูกปิดแล้ว");
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
      showDriverFeedback(
        canRecheckOrigin ? "ผู้ดูแลเปิดต้นทางกรณีพิเศษ: เช็กอินต้นทางใหม่เรียบร้อยแล้ว" : "ดึง GPS จากมือถือและเช็กอินต้นทางเรียบร้อยแล้ว",
        "ok",
      );
    } catch (error) {
      showDriverFeedback(error instanceof Error ? error.message : "ดึง GPS จากอุปกรณ์ไม่สำเร็จ กรุณาลองใหม่", "alert");
    } finally {
      setIsFetchingOriginGps(false);
    }
  }

  async function captureDestinationGps() {
    if (!job || !currentDestination) {
      showDriverFeedback("ยังไม่ได้เลือกปลายทางสำหรับเช็กอิน GPS", "alert");
      return;
    }

    if (isDeliverModeLocked) {
      showDriverFeedback(
        "ต้องเช็กอินต้นทางและสแกนสินค้าขึ้นรถให้ครบก่อน จึงจะเปิดปลายทางได้ หากมีเหตุจำเป็นให้ผู้ดูแลเปิดปลายทางกรณีพิเศษ",
        "alert",
      );
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
      showDriverFeedback(`เช็กอิน GPS ปลายทาง ${currentDestination.name} เรียบร้อยแล้ว`, "ok");
    } catch (error) {
      showDriverFeedback(error instanceof Error ? error.message : "ดึง GPS ปลายทางไม่สำเร็จ กรุณาลองใหม่", "alert");
    } finally {
      setIsFetchingDestinationGps(false);
    }
  }

  async function handleDestinationSelect(destinationId: string) {
    if (!job || destinationId === currentDestination?.id) {
      return;
    }

    const previousDestination = currentDestination;
    stopCamera();
    setIsSwitchingDestination(true);

    try {
      if (previousDestination?.deliveryCheckedInAt && previousDestination.deliveryGps.trim()) {
        const response = await clearUnusedDestinationCheckIn({
          jobId: job.id,
          destinationId: previousDestination.id,
          nextDestinationId: destinationId,
        });

        setJob(response.job);
        if (response.cleared && response.message) {
          setMessage(response.message);
          setScanResult("ok");
        }
      }

      setCurrentLocation(destinationId);
      setLatestGps("");
    } catch (error) {
      showDriverFeedback(error instanceof Error ? error.message : "เปลี่ยนปลายทางไม่สำเร็จ กรุณาลองใหม่", "alert", "เปลี่ยนปลายทางไม่สำเร็จ");
    } finally {
      setIsSwitchingDestination(false);
    }
  }

  async function submitScannedCode(nextCode: string) {
    if (!job) {
      showDriverFeedback("ยังไม่มี Job ให้สแกน", "alert");
      return;
    }

    const normalizedCode = nextCode.trim();
    if (!normalizedCode) {
      showDriverFeedback("กรุณาสแกนหรือกรอกรหัสก่อนบันทึก", "alert");
      return;
    }

    if (mode === "deliver" && isDeliverModeLocked) {
      showDriverFeedback("ต้องสแกนสินค้าขึ้นรถให้ครบก่อน จึงจะบันทึกส่งปลายทางได้ หากมีเหตุจำเป็นให้ผู้ดูแลเปิดปลายทางกรณีพิเศษ", "alert");
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
      const successNoticeTitle = response.result === "ok" ? getScanSuccessNoticeTitle(response.message) : "";
      if (successNoticeTitle) {
        showDriverSuccess(response.message, successNoticeTitle);
      } else {
        showDriverFeedback(response.message, response.result);
      }
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
      showDriverFeedback(error instanceof Error ? error.message : "บันทึกการสแกนไม่สำเร็จ", "alert");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleScanSubmit() {
    await submitScannedCode(code);
  }

  async function startCamera(options: { showNoticeOnError?: boolean } = {}) {
    const showNoticeOnError = options.showNoticeOnError ?? true;

    function showCameraProblem(nextMessage: string) {
      setCameraMessage(nextMessage);
      if (showNoticeOnError) {
        showDriverFeedback(nextMessage, "alert", "เปิดกล้องไม่ได้", { showScanWarning: false });
      }
    }

    if (isScanBlocked) {
      const blockedMessage =
        isOriginGpsRequired
          ? "ต้องเช็กอิน GPS ต้นทางก่อนเปิดกล้อง"
          : mode === "deliver" && isDeliverModeLocked
            ? "ต้องสแกนขึ้นรถให้ครบก่อนเปิดปลายทาง"
            : "ต้องเช็กอิน GPS ปลายทางก่อนเปิดกล้อง";
      showCameraProblem(blockedMessage);
      return;
    }

    if (!("mediaDevices" in navigator)) {
      const blockedMessage = "อุปกรณ์นี้ไม่รองรับการเปิดกล้องผ่านเว็บ";
      showCameraProblem(blockedMessage);
      return;
    }

    if (!videoRef.current) {
      const blockedMessage = "ยังไม่พร้อมเปิดกล้อง กรุณาลองใหม่";
      showCameraProblem(blockedMessage);
      return;
    }

    if (cameraStartInFlightRef.current) {
      setCameraMessage("กำลังเปิดกล้องอยู่ กรุณารอสักครู่");
      return;
    }

    try {
      cameraStartInFlightRef.current = true;
      scanLockRef.current = false;

      // Step 1: acquire camera stream
      const stream = await requestScannerCameraStream();

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
      setCameraMessage("เล็งกรอบไปที่ QR Code หรือ Barcode ที่มี PO SAP No.");

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
          playScanTickSound();

          setCode(scannedCode);
          setCameraMessage(`พบรหัส ${scannedCode} กำลังบันทึก`);
          stopCamera();
          void submitScannedCode(scannedCode);
        },
      );
    } catch (err) {
      const blockedMessage = getCameraErrorMessage(err);
      showCameraProblem(blockedMessage);
      setIsCameraScanning(false);
      // clean up stream if it was partially acquired
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    } finally {
      cameraStartInFlightRef.current = false;
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

  if (isDedicatedDriverMode) {
    const currentDestinationItems =
      mode === "deliver" && currentDestination ? job?.items.filter((item) => item.destinationId === currentDestination.id) ?? [] : [];
    const activeRequiredTotal =
      mode === "deliver" ? currentDestinationItems.reduce((sum, item) => sum + item.orderQty, 0) : requiredTotal;
    const activeTotal =
      mode === "deliver" ? currentDestinationItems.reduce((sum, item) => sum + item.deliveredQty, 0) : loadedTotal;
    const remainingTotal = Math.max(activeRequiredTotal - activeTotal, 0);
    const activeLabel = mode === "deliver" ? "ส่งของ" : "ขึ้นรถ";
    const scanTitle = mode === "deliver" ? "สแกนส่งสินค้า" : "สแกนสินค้าขึ้นรถ";
    const activeLocation = mode === "deliver" ? currentDestination?.name || "เลือกปลายทาง" : job?.origin || "ต้นทาง";

    return (
      <div className="min-h-[100dvh] bg-gradient-to-br from-[#eef5fc] via-[#f5f8fc] to-[#edf5fa]">
        {isDriverItemListOpen ? (
          <DriverScanItemList
            job={job}
            items={driverScanItems}
            mode={mode}
            location={activeLocation}
            onClose={() => setIsDriverItemListOpen(false)}
          />
        ) : null}

        {driverNotice ? (
          <div className="fixed inset-0 z-[100] flex items-end bg-slate-950/70 p-3 backdrop-blur-sm sm:items-center sm:justify-center">
            <div className="w-full overflow-hidden rounded-lg bg-white shadow-2xl sm:max-w-md">
              <div
                className={
                  driverNotice.tone === "alert"
                    ? "bg-red-600 px-4 py-4 text-white"
                    : driverNotice.tone === "success"
                      ? "bg-emerald-600 px-4 py-4 text-white"
                      : "bg-sky-600 px-4 py-4 text-white"
                }
              >
                <div className="flex items-center gap-3">
                  {driverNotice.tone === "alert" ? <AlertTriangle className="size-7 shrink-0" /> : <CheckCircle2 className="size-7 shrink-0" />}
                  <h2 className="text-xl font-bold">{driverNotice.title}</h2>
                </div>
              </div>
              <div className="space-y-4 p-4">
                <p className="whitespace-pre-line break-words text-base leading-7 text-slate-900">{driverNotice.message}</p>
                <Button type="button" className="h-14 w-full text-lg" onClick={closeDriverNotice}>
                  รับทราบ
                </Button>
              </div>
            </div>
          </div>
        ) : null}

        <DriverRoomHeader />

        <main className="mx-auto max-w-6xl space-y-4 px-3 py-4 sm:px-6 sm:py-6">
          {job && !isLoading ? <DriverRoomSummary job={job} /> : null}
          {isLoading ? (
            <div className="grid min-h-[70dvh] place-items-center text-sm font-medium text-slate-500">กำลังเปิดห้องงาน</div>
          ) : null}

          {isDedicatedJobUnavailable ? (
            <div className="surface-panel grid min-h-80 place-items-center p-6 text-center">
              <div>
                <CheckCircle2 className="mx-auto size-16 text-emerald-600" />
                <h2 className="mt-4 text-2xl font-bold text-slate-950">งานนี้ปิดแล้ว</h2>
                <p className="mt-2 text-slate-600">ส่งของครบแล้ว ปิดหน้านี้ได้เลย</p>
              </div>
            </div>
          ) : null}

          {isJobCompleted && job ? (
            <div className="surface-panel grid min-h-80 place-items-center p-6 text-center">
              <div className="w-full max-w-sm">
                <CheckCircle2 className="mx-auto size-20 text-emerald-600" />
                <h2 className="mt-4 text-3xl font-bold text-slate-950">จบงานแล้ว</h2>
                <p className="mt-2 text-slate-600">ส่งครบทุกปลายทางเรียบร้อย</p>
                <div className="mt-6 rounded-lg bg-white p-4 text-lg font-bold shadow-sm">
                  ส่งแล้ว {deliveredTotal.toLocaleString("th-TH")} รายการ
                </div>
              </div>
            </div>
          ) : null}

          {!isJobCompleted && isOriginGpsRequired && job ? (
            <section className="surface-panel grid min-h-80 place-items-center p-5 sm:p-8" aria-label="เช็กอินต้นทาง">
              <div className="w-full max-w-sm text-center">
                <div className="mx-auto grid size-20 place-items-center rounded-full bg-sky-100 text-sky-700">
                  <MapPin className="size-10" />
                </div>
                <p className="mt-5 text-sm font-medium text-slate-500">เริ่มงานที่</p>
                <h2 className="mt-1 break-words text-2xl font-bold text-slate-950">{job.origin || "ต้นทาง"}</h2>
                <p className="mt-2 text-sm leading-6 text-slate-500">เช็กอิน GPS เมื่อถึงต้นทาง เพื่อเริ่มสแกนสินค้าขึ้นรถ</p>
                <Button type="button" className="mt-5 h-12 w-full gap-2 text-base" onClick={captureOriginGps} disabled={isFetchingOriginGps}>
                  <MapPin className="size-6" />
                  {isFetchingOriginGps ? "กำลังเช็กตำแหน่ง" : "เช็กอินและเริ่มงาน"}
                </Button>
              </div>
            </section>
          ) : null}

          {!isJobCompleted && !isOriginGpsRequired && shouldShowDestinationOnly && isDestinationGpsRequired ? (
            <section className="surface-panel grid min-h-80 place-items-center p-5 sm:p-8" aria-label="เช็กอินปลายทาง">
              <div className="w-full max-w-md">
                <div className="mx-auto mb-3 grid size-12 place-items-center rounded-xl bg-sky-50 text-primary"><MapPin className="size-6" /></div>
                <h2 className="text-center text-lg font-semibold text-slate-900">เช็กอินปลายทาง</h2>
                <p className="mt-1 text-center text-sm text-slate-500">เลือกจุดส่งและเช็กอิน GPS ก่อนสแกนส่งสินค้า</p>
                <DropdownMenu.Root>
                  <DropdownMenu.Trigger
                    className="mt-3 flex min-h-16 w-full items-center justify-between gap-3 rounded-lg border border-slate-300 bg-white px-4 text-left text-base font-bold shadow-sm"
                    disabled={isSwitchingDestination}
                  >
                    <span className="min-w-0 break-words">{isSwitchingDestination ? "กำลังเปลี่ยนปลายทาง" : currentDestination?.name || "เลือกปลายทาง"}</span>
                    <ChevronDown className="size-5 shrink-0" />
                  </DropdownMenu.Trigger>
                  <DropdownMenu.Portal>
                    <DropdownMenu.Content className="z-50 max-h-[60dvh] w-[var(--radix-dropdown-menu-trigger-width)] overflow-y-auto rounded-lg border bg-white p-1 shadow-xl">
                      {openDestinations.map((destination) => (
                        <DropdownMenu.Item
                          key={destination.id}
                          onSelect={() => void handleDestinationSelect(destination.id)}
                          className="cursor-pointer rounded-md px-3 py-3 text-sm font-semibold outline-none focus:bg-slate-100"
                        >
                          {destination.name}
                        </DropdownMenu.Item>
                      ))}
                    </DropdownMenu.Content>
                  </DropdownMenu.Portal>
                </DropdownMenu.Root>
                <Button
                  type="button"
                  className="mt-4 h-12 w-full gap-2 text-base"
                  onClick={captureDestinationGps}
                  disabled={!currentDestination || isFetchingDestinationGps}
                >
                  <MapPin className="size-6" />
                  {isFetchingDestinationGps ? "กำลังเช็กตำแหน่ง" : "เช็กอินจุดส่งนี้"}
                </Button>
                <p className="mt-4 text-center text-xs leading-5 text-slate-500">เลือกผิดสามารถเปลี่ยนจุดส่งก่อนเริ่มสแกนได้</p>
              </div>
            </section>
          ) : null}

          {shouldShowScanPanel ? (
            <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
              <section className="surface-panel overflow-hidden" aria-labelledby="driver-camera-title">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
                  <div className="min-w-0">
                    <h2 id="driver-camera-title" className="flex items-center gap-2 text-sm font-semibold text-slate-900"><ScanLine className="size-4 shrink-0 text-primary" />{scanTitle}</h2>
                    <p className="mt-1 break-words text-xs text-slate-500">{activeLocation}</p>
                  </div>
                  <Badge variant={isCameraScanning ? "success" : "secondary"}>
                    <span className={`size-1.5 rounded-full ${isCameraScanning ? "bg-emerald-500" : "bg-slate-400"}`} />
                    {isCameraScanning ? "กล้องกำลังทำงาน" : "พร้อมสแกน"}
                  </Badge>
                </div>
                <div className="p-3">
                  <div
                    className={
                      isCameraScanning
                        ? "fixed inset-0 z-50 h-dvh overflow-hidden bg-black lg:relative lg:inset-auto lg:z-auto lg:h-[400px] lg:rounded-xl"
                        : "relative h-[300px] overflow-hidden rounded-xl bg-gradient-to-br from-[#0b2e55] via-[#0b2444] to-[#071426] sm:h-[400px]"
                    }
                  >
                    <video ref={videoRef} className={`h-full w-full object-cover ${isCameraScanning ? "" : "invisible"}`} playsInline muted />

                    {isCameraScanning ? (
                      <div className="pointer-events-none absolute inset-0 grid place-items-center">
                        <div className="relative h-[42%] w-[88%] max-w-xl rounded-lg border-2 border-white/90 shadow-[0_0_0_999px_rgba(0,0,0,0.28)]">
                          <div className="absolute left-0 right-0 h-0.5 bg-cyan-300 motion-safe:animate-[scanLine_2s_linear_infinite]" style={{ top: "50%" }} />
                        </div>
                      </div>
                    ) : null}

                    {isCameraScanning ? (
                      <>
                        <div className="absolute left-0 right-0 top-0 z-10 flex items-start justify-between gap-3 bg-gradient-to-b from-black/80 to-transparent px-4 pb-12 pt-4 text-white">
                          <div className="min-w-0">
                            <p className="text-xs text-white/70">{activeLabel}</p>
                            <p className="truncate text-base font-bold">{activeLocation}</p>
                          </div>
                          <div className="shrink-0 text-right">
                            <p className="text-xs text-white/70">คงเหลือ</p>
                            <p className="text-2xl font-bold tabular-nums">{remainingTotal.toLocaleString("th-TH")}</p>
                          </div>
                        </div>
                        <div className="absolute inset-0 z-[5]" onPointerDown={handleTapToFocus} role="button" aria-label="แตะเพื่อโฟกัสกล้อง" tabIndex={-1}>
                          {tapIndicator ? (
                            <div className="pointer-events-none absolute size-14 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-amber-300" style={{ left: tapIndicator.x, top: tapIndicator.y }} />
                          ) : null}
                        </div>
                        <div className="absolute bottom-0 left-0 right-0 z-10 flex items-center justify-center gap-4 bg-gradient-to-t from-black/90 to-transparent px-4 pb-6 pt-16">
                          {torchSupported ? (
                            <button type="button" onClick={() => void toggleTorch()} className="grid size-14 place-items-center rounded-full bg-white/15 text-white backdrop-blur" aria-label={torchOn ? "ปิดไฟฉาย" : "เปิดไฟฉาย"}>
                              {torchOn ? <Flashlight className="size-6" /> : <FlashlightOff className="size-6" />}
                            </button>
                          ) : null}
                          <button type="button" onClick={stopCamera} className="grid size-16 place-items-center rounded-full border-4 border-white bg-red-600 text-white" aria-label="หยุดสแกน">
                            <Square className="size-6 fill-current" />
                          </button>
                        </div>
                      </>
                    ) : (
                      <button type="button" onClick={() => void startCamera()} className="group absolute inset-0 z-10 grid place-items-center px-5 text-center text-white outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-sky-300">
                        <span className="block max-w-sm">
                          <span className="mx-auto grid size-20 place-items-center rounded-2xl border border-sky-300/30 bg-sky-400/10 text-sky-200 ring-8 ring-sky-400/5 transition-colors group-hover:bg-sky-400/20">
                            <ScanLine className="size-10" />
                          </span>
                          <span className="mt-6 block text-xl font-semibold">พร้อม{scanTitle}</span>
                          <span className="mt-2 block text-xs leading-5 text-slate-300">เล็งกล้องไปที่ QR Code หรือ Barcode ของ PO</span>
                          <span className="mt-5 inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-white px-5 py-2.5 text-sm font-semibold text-[#104c88] shadow-lg transition-colors group-hover:bg-sky-50"><Camera className="size-4" />เปิดกล้องสแกน</span>
                        </span>
                      </button>
                    )}
                  </div>
                </div>
                <p className="border-t border-slate-100 px-4 py-3 text-xs leading-5 text-slate-500">{isCameraScanning ? cameraMessage : "สแกนต่อเนื่องได้ ระบบบันทึกความคืบหน้าให้อัตโนมัติ"}</p>
              </section>

              <aside className="space-y-4" aria-label="ข้อมูลและเครื่องมือสแกน">
                <section className="surface-panel p-4 sm:p-5" aria-labelledby="driver-active-location-title">
                  <div className="flex items-start gap-3">
                    <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-sky-50 text-primary"><MapPin className="size-5" /></span>
                    <div className="min-w-0">
                      <p className="text-[11px] text-slate-500">{mode === "deliver" ? "จุดส่งสินค้าปัจจุบัน" : "จุดรับสินค้าต้นทาง"}</p>
                      <h2 id="driver-active-location-title" className="mt-1 break-words text-base font-semibold text-slate-900">{activeLocation}</h2>
                    </div>
                  </div>
                  <div className="mt-4 flex items-center justify-between gap-3 rounded-xl border border-sky-100 bg-sky-50/70 px-4 py-3">
                    <div>
                      <p className="text-xs font-medium text-sky-800">คงเหลือที่ต้องสแกน{activeLabel}</p>
                      <p className="mt-1 text-[11px] text-slate-500">เฉพาะ{mode === "deliver" ? "ปลายทางนี้" : "ขั้นตอนขึ้นรถ"}</p>
                    </div>
                    <p className="shrink-0 text-3xl font-bold tabular-nums text-primary">{remainingTotal.toLocaleString("th-TH")}<span className="ml-1 text-xs font-normal text-slate-500">รอบ</span></p>
                  </div>
                  <div className="mt-4 flex justify-between gap-2 text-xs text-slate-500">
                    <span>สแกน{activeLabel}แล้ว</span><span className="font-semibold tabular-nums text-slate-700">{activeTotal.toLocaleString("th-TH")} / {activeRequiredTotal.toLocaleString("th-TH")}</span>
                  </div>
                  <div role="progressbar" aria-label={`ความคืบหน้าสแกน${activeLabel}`} aria-valuemin={0} aria-valuemax={activeRequiredTotal || 1} aria-valuenow={Math.min(activeTotal, activeRequiredTotal)} className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100">
                    <div className="h-full rounded-full bg-gradient-to-r from-blue-500 to-cyan-400 transition-[width] motion-reduce:transition-none" style={{ width: `${activeRequiredTotal ? Math.min((activeTotal / activeRequiredTotal) * 100, 100) : 0}%` }} />
                  </div>
                  <Button type="button" variant="outline" className="mt-5 h-auto min-h-11 w-full gap-2 whitespace-normal py-2.5 text-left text-sm" onClick={() => setIsDriverItemListOpen(true)}>
                    <List className="size-4 shrink-0" />ดูรายการ PO และสินค้า<ChevronRight className="ml-auto size-4 shrink-0 text-slate-400" />
                  </Button>
                </section>

                <section className="surface-panel p-4 sm:p-5" aria-labelledby="driver-manual-scan-title">
                  <h2 id="driver-manual-scan-title" className="flex items-center gap-2 text-sm font-semibold text-slate-900"><QrCode className="size-4 text-primary" />กรอกรหัสแทนกล้อง</h2>
                  <p className="mt-1 text-xs leading-5 text-slate-500">ใช้เมื่อไม่สะดวกเปิดกล้อง หรืออ่านรหัสไม่สำเร็จ</p>
                  <form className="mt-4" onSubmit={(event) => { event.preventDefault(); if (!isSubmitting && code.trim()) void handleScanSubmit(); }}>
                    <Label htmlFor="dedicated-driver-scan-code" className="text-xs text-slate-600">รหัส PO SAP No.</Label>
                    <div className="mt-1.5 flex gap-2">
                      <Input id="dedicated-driver-scan-code" value={code} onChange={(event) => setCode(event.target.value)} placeholder="กรอกหรือวางรหัส PO" className="h-11 min-w-0" />
                      <Button type="submit" className="h-11 shrink-0" disabled={isSubmitting || !code.trim()}>{isSubmitting ? "กำลังบันทึก" : "บันทึก"}</Button>
                    </div>
                  </form>
                </section>
                {message ? (
                  <div role="status" aria-live="polite" className={`flex items-start gap-2 rounded-xl border p-3 text-xs leading-5 ${scanResult === "alert" ? "border-amber-200 bg-amber-50 text-amber-900" : "border-emerald-200 bg-emerald-50 text-emerald-800"}`}>
                    {scanResult === "alert" ? <AlertTriangle className="mt-0.5 size-4 shrink-0" /> : <CheckCircle2 className="mt-0.5 size-4 shrink-0" />}
                    <p className="min-w-0 whitespace-pre-line break-words">{message}</p>
                  </div>
                ) : null}
              </aside>
            </div>
          ) : null}
        </main>

        <style>{`
          @keyframes scanLine {
            0% { top: 8%; }
            50% { top: 92%; }
            100% { top: 8%; }
          }
        `}</style>
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-3">
      {driverNotice ? (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="driver-notice-title"
        >
          <div className="w-full max-w-md overflow-hidden rounded-lg border border-slate-200 bg-white shadow-2xl shadow-slate-950/30">
            <div
              className={
                driverNotice.tone === "alert"
                  ? "flex items-start gap-3 border-b border-red-200 bg-red-50 px-4 py-4"
                  : driverNotice.tone === "success"
                    ? "flex items-start gap-3 border-b border-emerald-200 bg-emerald-50 px-4 py-4"
                    : "flex items-start gap-3 border-b border-sky-200 bg-sky-50 px-4 py-4"
              }
            >
              <div
                className={
                  driverNotice.tone === "alert"
                    ? "mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-full bg-red-600 text-white"
                    : driverNotice.tone === "success"
                      ? "mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-white"
                      : "mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-full bg-sky-600 text-white"
                }
              >
                {driverNotice.tone === "alert" ? (
                  <AlertTriangle className="h-5 w-5" />
                ) : driverNotice.tone === "success" ? (
                  <CheckCircle2 className="h-5 w-5" />
                ) : (
                  <Info className="h-5 w-5" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <h3
                  id="driver-notice-title"
                  className={
                    driverNotice.tone === "alert"
                      ? "break-words text-lg font-bold text-red-950"
                      : driverNotice.tone === "success"
                        ? "break-words text-lg font-bold text-emerald-950"
                        : "break-words text-lg font-bold text-sky-950"
                  }
                >
                  {driverNotice.title}
                </h3>
                <p
                  className={
                    driverNotice.tone === "alert"
                      ? "mt-1 text-sm font-medium text-red-800"
                      : driverNotice.tone === "success"
                        ? "mt-1 text-sm font-medium text-emerald-800"
                        : "mt-1 text-sm font-medium text-sky-800"
                  }
                >
                  คนขับต้องเห็นข้อความนี้ก่อนทำต่อ
                </p>
              </div>
              <button
                type="button"
                onClick={closeDriverNotice}
                className="flex size-9 shrink-0 items-center justify-center rounded-full text-slate-500 transition hover:bg-white/70 hover:text-slate-950"
                aria-label="ปิดป๊อปอัพแจ้งเตือน"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="space-y-4 px-4 py-4">
              <div className="max-h-[45vh] overflow-y-auto whitespace-pre-line break-words rounded-md border border-slate-200 bg-slate-50 p-3 text-sm leading-6 text-slate-900">
                {driverNotice.message}
              </div>
              {driverNotice.tone === "alert" && driverNotice.showScanWarning !== false ? (
                <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-900">
                  ระบบยังไม่บันทึกการส่งของรายการที่ผิด ให้ตรวจปลายทางหรือรหัสสินค้าให้ถูกต้องก่อนสแกนต่อ
                </div>
              ) : null}
              <Button type="button" className="h-11 w-full text-base" onClick={closeDriverNotice}>
                รับทราบ
              </Button>
            </div>
          </div>
        </div>
      ) : null}
      <section className="surface-panel order-2 overflow-hidden" aria-labelledby="driver-room-summary-title">
        <div className="space-y-4 border-b border-slate-100 px-4 py-4 sm:px-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0 sm:pt-1">
              <div className="flex flex-wrap items-center gap-2.5">
                <h2 id="driver-room-summary-title" className="break-words text-lg font-semibold leading-snug text-slate-900">{roomTitle}</h2>
                {job ? (
                  <Badge variant={isJobCompleted || shouldShowDestinationOnly ? "success" : "secondary"} className="shrink-0">
                    {isJobCompleted ? "จบงาน" : shouldShowDestinationOnly ? "ปลายทาง" : "ขึ้นรถ"}
                  </Badge>
                ) : null}
              </div>
              <p className="mt-1 break-all text-xs leading-relaxed text-slate-500">
                {job?.id || "เลือกห้องงานเพื่อเริ่มงาน"}
              </p>
            </div>
              {!isDedicatedDriverMode ? (
                <div className="w-full space-y-1.5 sm:w-64 sm:shrink-0">
                  <Label htmlFor="driver-room-selector" className="text-[11px] font-medium text-slate-500">เลือกห้องงาน</Label>
                  <DropdownMenu.Root>
                    <DropdownMenu.Trigger
                      id="driver-room-selector"
                      aria-label="เลือกห้องงาน"
                      className="group flex h-10 w-full items-center justify-between gap-3 rounded-lg border border-input bg-white px-3 text-left text-sm font-medium text-slate-900 shadow-sm outline-none transition hover:border-sky-300 hover:bg-sky-50/50 focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/15 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400 data-[state=open]:border-primary data-[state=open]:ring-2 data-[state=open]:ring-primary/15"
                      disabled={isLoading || !jobs.length}
                    >
                      <span className="min-w-0 truncate">{isLoading ? "กำลังโหลดห้องงาน" : selectedJobLabel}</span>
                      <ChevronDown className="size-4 shrink-0 text-slate-400 transition-transform group-data-[state=open]:rotate-180" />
                    </DropdownMenu.Trigger>
                    <DropdownMenu.Portal>
                      <DropdownMenu.Content
                        align="start"
                        sideOffset={8}
                        className="z-50 max-h-72 w-[var(--radix-dropdown-menu-trigger-width)] overflow-y-auto rounded-xl border border-border bg-white p-1.5 text-sm text-slate-900 shadow-xl shadow-slate-900/10"
                      >
                        {jobs.length ? (
                          jobs.map((currentJob) => {
                            const isSelected = selectedJobId === currentJob.id;

                            return (
                              <DropdownMenu.Item
                                key={currentJob.id}
                                onSelect={() => selectJobFromList(currentJob.id)}
                                className={`flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 outline-none transition-colors focus:bg-sky-50 data-[highlighted]:bg-sky-50 ${isSelected ? "bg-sky-50 text-blue-700" : "hover:bg-sky-50"}`}
                              >
                                <span className="flex size-4 shrink-0 items-center justify-center">
                                  {isSelected ? <Check className="size-4 text-blue-600" /> : null}
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
          <dl className={`grid grid-cols-2 gap-3 ${!shouldShowDestinationOnly ? "sm:grid-cols-3" : ""}`}>
            <div className="flex min-w-0 items-start gap-2.5">
              <Truck aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-slate-400" />
              <div className="min-w-0">
                <dt className="text-[11px] text-slate-500">รถขนส่ง</dt>
                <dd className="mt-0.5 break-words text-sm font-medium text-slate-800">{job?.vehicle || "-"}</dd>
              </div>
            </div>
            <div className="flex min-w-0 items-start gap-2.5">
              <UserRound aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-slate-400" />
              <div className="min-w-0">
                <dt className="text-[11px] text-slate-500">คนขับ</dt>
                <dd className="mt-0.5 break-words text-sm font-medium text-slate-800">{job?.driver || "-"}</dd>
              </div>
            </div>
            {!shouldShowDestinationOnly ? (
              <div className="col-span-2 flex min-w-0 items-start gap-2.5 sm:col-span-1">
                <MapPin aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-slate-400" />
                <div className="min-w-0">
                  <dt className="text-[11px] text-slate-500">สถานะต้นทาง</dt>
                  <dd className="mt-0.5 break-words text-sm font-medium text-slate-800">{job ? originStatusText : "-"}</dd>
                </div>
              </div>
            ) : null}
          </dl>
        </div>
        <div className="grid gap-4 bg-slate-50/60 px-4 py-4 sm:px-5 lg:grid-cols-2 lg:items-center">
          <div className="flex items-center gap-3 rounded-xl border border-sky-100 bg-sky-50 px-3 py-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-white text-primary">
              {isJobCompleted ? <CheckCircle2 aria-hidden="true" className="size-[18px]" /> : isOriginGpsRequired ? <MapPin aria-hidden="true" className="size-[18px]" /> : <ScanLine aria-hidden="true" className="size-[18px]" />}
            </span>
            <div className="min-w-0">
              <p className="text-[11px] font-medium text-sky-700">ขั้นตอนต่อไป</p>
              <p className="mt-0.5 break-words text-sm font-semibold leading-relaxed text-slate-800">{job ? nextActionText : "เลือกห้องงานเพื่อเริ่มงาน"}</p>
            </div>
          </div>
          <dl className="grid grid-cols-3 divide-x divide-slate-200">
            <div className="min-w-0 px-3 first:pl-0 lg:first:pl-3">
              <dt className="text-[11px] text-slate-500">ต้องสแกน</dt>
              <dd className="mt-1 break-words text-xl font-semibold tabular-nums text-slate-800">{requiredTotal.toLocaleString("th-TH")}</dd>
            </div>
            <div className="min-w-0 px-3">
              <dt className="text-[11px] text-slate-500">ขึ้นรถแล้ว</dt>
              <dd className="mt-1 break-words text-xl font-semibold tabular-nums text-blue-700">{loadedTotal.toLocaleString("th-TH")}</dd>
            </div>
            <div className="min-w-0 px-3">
              <dt className="text-[11px] text-slate-500">ส่งแล้ว</dt>
              <dd className="mt-1 break-words text-xl font-semibold tabular-nums text-sky-700">{deliveredTotal.toLocaleString("th-TH")}</dd>
            </div>
          </dl>
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
            <p className="text-sm font-medium text-emerald-900">ปิดหน้านี้ได้เลย ไม่ต้องกลับเข้าเมนูระบบ</p>
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
            <CardDescription>เช็กอิน GPS ต้นทางก่อน จึงจะเริ่มสแกนได้</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 p-3">
            <div className="rounded-md border border-[#d8dde6] bg-slate-50 p-3">
              <p className="text-xs text-slate-500">ต้นทาง</p>
              <p className="mt-0.5 break-words text-sm font-medium text-slate-900">{job.origin || "-"}</p>
            </div>
            <div className="rounded-md border border-sky-200 bg-sky-50 px-3 py-2 text-xs leading-5 text-sky-800">
              ระบบใช้ GPS จากมือถือแบบ high accuracy ค่า accuracy คือความคลาดเคลื่อนโดยประมาณ หน่วยเป็นเมตร เช่น accuracy 25 m หมายถึงพิกัดอาจคลาดเคลื่อนราว 25 เมตร
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
                  disabled={isDeliverModeLocked || isSwitchingDestination}
                >
                  <span className="min-w-0 truncate">{isSwitchingDestination ? "กำลังเปลี่ยนปลายทาง" : currentDestination?.name || "เลือกปลายทาง"}</span>
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
                            void handleDestinationSelect(destination.id);
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
            <p className="mt-2 text-xs leading-5 text-slate-500">
              ค่า accuracy ที่แสดงหลังเช็กอินคือความคลาดเคลื่อนโดยประมาณจากมือถือ หน่วยเป็นเมตร
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
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <ScanLine className="h-4 w-4" />
            {shouldShowDestinationOnly ? "สแกนส่งของ" : "สแกนขึ้นรถ"}
          </CardTitle>
          <CardDescription>{shouldShowDestinationOnly ? "สแกนเฉพาะของปลายทางที่เลือก" : "สแกนสินค้าเข้ารถให้ครบก่อนออกจากต้นทาง"}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 p-4 sm:p-5 lg:grid-cols-[minmax(0,1.6fr)_minmax(15rem,1fr)] lg:items-start">
          <div className="min-w-0 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50/70 px-3 py-2.5">
            <div className="flex min-w-0 items-center gap-2.5">
              {shouldShowDestinationOnly ? <MapPin aria-hidden="true" className="size-4 shrink-0 text-primary" /> : <Truck aria-hidden="true" className="size-4 shrink-0 text-primary" />}
              <div className="min-w-0">
                <p className="break-words text-xs font-medium text-slate-700">{shouldShowDestinationOnly ? currentDestination?.name || "เลือกปลายทาง" : "โหลดสินค้าที่ต้นทาง"}</p>
                <p role="status" className="mt-0.5 text-[11px] text-slate-500">{isCameraScanning ? "กล้องกำลังสแกน" : "กล้องยังไม่เปิด"}</p>
              </div>
            </div>
            {isCameraScanning ? (
              <Button type="button" variant="outline" onClick={stopCamera} className="h-10 shrink-0 gap-2 border-red-200 text-red-700 hover:border-red-300 hover:bg-red-50 hover:text-red-800">
                <Square aria-hidden="true" className="size-3.5" />
                หยุดกล้อง
              </Button>
            ) : (
              <Button type="button" onClick={() => { void startCamera(); }} disabled={!job || isScanBlocked} className="h-10 shrink-0 gap-2">
                <Camera aria-hidden="true" className="size-4" />
                เปิดกล้อง
              </Button>
            )}
          </div>
          <div
            className={`relative w-full overflow-hidden rounded-xl border text-left ${isCameraScanning ? "border-slate-800 bg-slate-950" : "border-sky-100 bg-sky-50/60"}`}
            style={isCameraScanning ? { height: "clamp(280px, 45dvh, 420px)" } : undefined}
          >
            <video ref={videoRef} aria-hidden="true" className={`absolute inset-0 h-full w-full bg-black object-cover ${isCameraScanning ? "opacity-100" : "opacity-0"}`} playsInline muted />

            {/* Scan frame — decorative guide for user */}
            {isCameraScanning ? (
            <div className="pointer-events-none absolute inset-0 grid place-items-center">
              <div className="relative h-[62%] w-[86%] max-w-xl rounded-lg border-2 border-cyan-300 shadow-[0_0_0_999px_rgba(2,6,23,0.34)]">
                <div
                  className="absolute left-0 right-0 h-0.5 bg-cyan-400 opacity-80"
                  style={{ animation: "scanLine 2s linear infinite", top: "50%" }}
                />
              </div>
            </div>
            ) : null}

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
                className="relative flex min-h-52 w-full flex-col items-center justify-center px-5 py-6 text-center text-slate-700 transition-colors hover:bg-sky-100/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-60"
                aria-label="แตะเพื่อเปิดกล้องสแกน"
              >
                <span className="mb-3 flex size-12 items-center justify-center rounded-2xl border border-sky-100 bg-white text-primary shadow-sm"><Camera aria-hidden="true" className="size-6" strokeWidth={1.5} /></span>
                <span className="text-sm font-semibold text-slate-800">แตะเพื่อเปิดกล้องสแกน</span>
                <span className="mt-1 max-w-sm text-xs leading-relaxed text-slate-500">{cameraMessage}</span>
                <span className="mt-3 max-w-sm text-[11px] leading-relaxed text-slate-400">รองรับ {SUPPORTED_SCAN_FORMAT_LABEL}</span>
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
          </div>

          <div className="min-w-0 space-y-4 rounded-xl border border-slate-200 bg-slate-50/60 p-4">
            <div>
              <Label htmlFor="scan-code" className="text-sm font-semibold text-slate-800">PO SAP No.</Label>
              <p className="mt-1 text-xs leading-relaxed text-slate-500">กรอกรหัสด้วยตนเองเมื่อไม่สะดวกใช้กล้อง</p>
            </div>
            <div className="space-y-2.5">
              <Input
                id="scan-code"
                value={code}
                onChange={(event) => setCode(event.target.value)}
                disabled={!job || isScanBlocked}
                placeholder="สแกนหรือกรอก PO SAP No."
                className="h-10"
              />
              <Button type="button" onClick={handleScanSubmit} disabled={!job || isSubmitting || isScanBlocked} className="h-10 w-full">
                {isSubmitting ? "กำลังบันทึก" : "บันทึก"}
              </Button>
            </div>

          {message ? (
            <div
              role="status"
              className={
                scanResult === "alert"
                  ? "whitespace-pre-line rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700"
                  : "whitespace-pre-line rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700"
              }
            >
              {message}
            </div>
          ) : null}
          </div>
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
                <details key={destination.id} className="group overflow-hidden rounded-xl border border-slate-200 bg-white">
                  <summary className="flex cursor-pointer list-none flex-col gap-3 px-4 py-3 text-sm font-medium transition-colors hover:bg-sky-50/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/40 sm:flex-row sm:items-center sm:justify-between [&::-webkit-details-marker]:hidden">
                    <span className="flex min-w-0 items-center gap-2">
                      <ChevronRight aria-hidden="true" className="size-4 shrink-0 text-slate-400 transition-transform group-open:rotate-90" />
                      <span className="min-w-0 break-words text-slate-800">{destination.name}</span>
                    </span>
                    <ScanQuantityBadges required={total} loaded={loaded} delivered={delivered} />
                  </summary>
                  <div className="space-y-2 border-t border-slate-200 p-3">
                    {items.map((item) => (
                      <div key={item.registryKey} className="rounded-lg border border-slate-100 bg-slate-50/80 p-3 text-sm">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                          <div className="min-w-0">
                            <p className="break-words font-semibold text-slate-900">
                              PO {item.poSapNo || item.registryKey}
                              {item.poSapItem ? ` / Item ${item.poSapItem}` : ""}
                            </p>
                            <p className="mt-1 break-words text-xs leading-relaxed text-slate-500">
                              {item.materialName || "-"} / จำนวนสั่งซื้อ {item.sourceOrderQty || String(item.orderQty || "-")}
                            </p>
                          </div>
                          <ScanQuantityBadges required={item.orderQty} loaded={item.loadedQty} delivered={item.deliveredQty} />
                        </div>
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
