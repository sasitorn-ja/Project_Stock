"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AlertTriangle, CheckCircle2, FileText, MapPin, QrCode, ScanLine, Truck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { checkInJobDestination, checkInJobOrigin, getJob, getJobs, submitJobScan } from "@/lib/job-db";
import { type JobRecord, type ScanMode } from "@/lib/jobs";

const driverScanChecks = [
  "อยู่ใน PO ของ Job นี้",
  "เป็นของ Location ปัจจุบัน",
  "จำนวนไม่เกินแผน",
  "อยู่ในลำดับ flow ที่ถูกต้อง",
];

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
  const [isFetchingOriginGps, setIsFetchingOriginGps] = useState(false);
  const [isFetchingDestinationGps, setIsFetchingDestinationGps] = useState(false);

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
  const isScanBlocked = isOriginGpsRequired || isDestinationGpsRequired;

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

      setLatestGps(gpsText);
      const nextJob = await checkInJobOrigin({
        jobId: job.id,
        latitude,
        longitude,
        accuracy,
      });

      setJob(nextJob);
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

    setIsFetchingDestinationGps(true);

    try {
      const position = await requestCurrentPosition();
      const latitude = position.coords.latitude;
      const longitude = position.coords.longitude;
      const accuracy = position.coords.accuracy;
      const gpsText = `${latitude.toFixed(6)},${longitude.toFixed(6)} / accuracy ${Math.round(accuracy)} m`;

      setLatestGps(gpsText);
      const nextJob = await checkInJobDestination({
        jobId: job.id,
        destinationId: currentDestination.id,
        latitude,
        longitude,
        accuracy,
      });

      setJob(nextJob);
      setMessage(`เช็กอิน GPS ปลายทาง ${currentDestination.name} เรียบร้อยแล้ว`);
      setScanResult("ok");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "ดึง GPS ปลายทางไม่สำเร็จ กรุณาลองใหม่");
      setScanResult("alert");
    } finally {
      setIsFetchingDestinationGps(false);
    }
  }

  async function handleScanSubmit() {
    if (!job) {
      setMessage("ยังไม่มี Job ให้สแกน");
      setScanResult("alert");
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await submitJobScan({
        jobId: job.id,
        code,
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

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <CardTitle className="text-base">งานปัจจุบัน</CardTitle>
              <CardDescription>{job ? `${job.id} / ${job.vehicle || "-"}` : "ยังไม่ได้เลือก Job"}</CardDescription>
            </div>
            <Badge variant={mode === "load" ? "warning" : "success"}>
              {mode === "load" ? "โหลดต้นทาง" : "ส่งปลายทาง"}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="grid gap-4">
          {!isDedicatedDriverMode ? (
            <div className="space-y-2">
              <Label htmlFor="job-selector">เลือก Job</Label>
              <select
                id="job-selector"
                value={selectedJobId}
                onChange={(event) => setSelectedJobId(event.target.value)}
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="">เลือก Job</option>
                {jobs.map((currentJob) => (
                  <option key={currentJob.id} value={currentJob.id}>
                    {currentJob.id}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
          {job ? (
            <div className="grid gap-2 text-sm">
              <div className="flex justify-between gap-3 rounded-md bg-slate-50 px-3 py-2 dark:bg-slate-900">
                <span className="text-muted-foreground">คนขับ</span>
                <span className="min-w-0 break-words text-right font-medium">{job.driver || "-"}</span>
              </div>
              <div className="flex justify-between gap-3 rounded-md bg-slate-50 px-3 py-2 dark:bg-slate-900">
                <span className="text-muted-foreground">ต้นทาง</span>
                <span className="min-w-0 break-words text-right font-medium">{job.origin || "-"}</span>
              </div>
              <div className="flex justify-between gap-3 rounded-md bg-slate-50 px-3 py-2 dark:bg-slate-900">
                <span className="text-muted-foreground">GPS ต้นทางจริง</span>
                <span className="min-w-0 break-words text-right font-medium">{job.originGps || "ยังไม่เช็กอินจากอุปกรณ์"}</span>
              </div>
              <div className="flex justify-between gap-3 rounded-md bg-slate-50 px-3 py-2 dark:bg-slate-900">
                <span className="text-muted-foreground">ปลายทางปัจจุบัน</span>
                <span className="min-w-0 break-words text-right font-medium">{currentDestination?.name || "-"}</span>
              </div>
              {mode === "deliver" && currentDestination ? (
                <div className="flex justify-between gap-3 rounded-md bg-slate-50 px-3 py-2 dark:bg-slate-900">
                  <span className="text-muted-foreground">GPS ปลายทางจริง</span>
                  <span className="min-w-0 break-words text-right font-medium">
                    {currentDestination.deliveryGps || "ยังไม่เช็กอินปลายทางนี้"}
                  </span>
                </div>
              ) : null}
            </div>
          ) : null}
        </CardContent>
      </Card>

      {!isDedicatedDriverMode ? (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <FileText className="h-4 w-4" />
              PO ในงานนี้
            </CardTitle>
            <CardDescription>รายการจริงที่ต้องโหลดและส่งใน Job ที่เลือก</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {job?.items.length ? (
              job.destinations.map((destination) => {
                const items = job.items.filter((item) => item.destinationId === destination.id);

                return (
                  <div key={destination.id} className="rounded-lg border p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold">{destination.name}</p>
                        <p className="mt-1 text-sm text-muted-foreground">{destination.id}</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          GPS ส่งของ: {destination.deliveryGps || "ยังไม่เช็กอิน"}
                        </p>
                      </div>
                      <Badge variant="secondary">{items.reduce((sum, item) => sum + item.orderQty, 0)} pcs</Badge>
                    </div>
                    <div className="mt-3 space-y-2">
                      {items.map((item) => (
                        <div
                          key={item.registryKey}
                          className="flex items-center justify-between rounded-md bg-slate-50 px-3 py-2 text-sm dark:bg-slate-900"
                        >
                          <span className="min-w-0 break-words">
                            {item.materialCode || item.registryKey} - {item.materialName || "-"}
                          </span>
                          <span className="ml-3 shrink-0 font-semibold">
                            {item.deliveredQty}/{item.loadedQty}/{item.orderQty}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="rounded-lg border bg-slate-50 p-4 text-sm text-muted-foreground dark:bg-slate-900">
                ยังไม่มีรายการใน Job นี้
              </div>
            )}
          </CardContent>
        </Card>
      ) : null}

      <Card className={isDedicatedDriverMode ? "border-cyan-200 shadow-sm dark:border-cyan-900" : undefined}>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <ScanLine className="h-4 w-4" />
            {isDedicatedDriverMode ? "หน้าปฏิบัติงานคนขับ" : "สแกนบาร์โค้ด"}
          </CardTitle>
          <CardDescription>
            {isDedicatedDriverMode
              ? "หน้านี้ออกแบบให้คนขับใช้งานอย่างเดียว ไม่มีเมนูฝั่งแอดมิน"
              : "กรอกรหัสวัสดุ, เลข PO หรือ registry key เพื่อบันทึกขึ้นรถ/ส่งปลายทางจริง"}
          </CardDescription>
        </CardHeader>
      </Card>

      <Card>
        <CardContent className="space-y-5 pt-6">
          <div className="rounded-lg border bg-cyan-50 p-4 text-sm text-cyan-800 dark:border-cyan-900 dark:bg-cyan-950/30 dark:text-cyan-200">
            <div className="flex items-center gap-2 font-medium">
              <MapPin className="h-4 w-4" />
              GPS จากอุปกรณ์
            </div>
            <p className="mt-2">ระบบจะใช้พิกัดจากมือถือเครื่องนี้เท่านั้น ไม่รับการพิมพ์ตำแหน่งเอง และต้องเช็กอินตามขั้นตอนก่อนสแกน</p>
            <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center">
              <Button type="button" variant="outline" onClick={captureOriginGps} disabled={!job || isFetchingOriginGps}>
                {isFetchingOriginGps ? "กำลังดึง GPS ต้นทาง" : "เช็กอิน GPS ต้นทาง"}
              </Button>
              <span className="text-xs text-cyan-900 dark:text-cyan-100">{latestGps || job?.originGps || "ยังไม่มีพิกัดจากอุปกรณ์"}</span>
            </div>
            {isOriginGpsRequired ? (
              <p className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
                ต้องเช็กอิน GPS ต้นทางก่อน ระบบจึงจะเปิดให้สแกนขึ้นรถหรือส่งปลายทาง
              </p>
            ) : null}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Button type="button" variant={mode === "load" ? "default" : "outline"} onClick={() => setMode("load")} disabled={isOriginGpsRequired}>
              <Truck className="mr-2 h-4 w-4" />
              โหมดขึ้นรถ
            </Button>
            <Button type="button" variant={mode === "deliver" ? "default" : "outline"} onClick={() => setMode("deliver")} disabled={isOriginGpsRequired}>
              <QrCode className="mr-2 h-4 w-4" />
              โหมดส่งปลายทาง
            </Button>
          </div>

          {mode === "deliver" && job?.destinations.length ? (
            <div className="space-y-3 rounded-lg border p-4">
              <div className="space-y-2">
                <Label htmlFor="destination-selector">เลือกปลายทางปัจจุบัน</Label>
                <select
                  id="destination-selector"
                  value={currentLocation}
                  onChange={(event) => setCurrentLocation(event.target.value)}
                  disabled={isOriginGpsRequired}
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                >
                  {job.destinations.map((destination) => (
                    <option key={destination.id} value={destination.id}>
                      {destination.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="rounded-md bg-slate-50 p-3 text-sm dark:bg-slate-900">
                <p className="font-medium">สถานะ GPS ปลายทาง</p>
                <p className="mt-1 text-muted-foreground">{currentDestination?.deliveryGps || "ยังไม่เช็กอินปลายทางนี้"}</p>
              </div>
              <Button
                type="button"
                variant="outline"
                onClick={captureDestinationGps}
                disabled={!job || !currentDestination || isOriginGpsRequired || isFetchingDestinationGps}
              >
                {isFetchingDestinationGps ? "กำลังเช็กอิน GPS ปลายทาง" : "เช็กอิน GPS ปลายทางนี้"}
              </Button>
              {isDestinationGpsRequired ? (
                <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
                  ต้องเช็กอิน GPS ของปลายทาง {currentDestination?.name} ก่อน จึงจะสแกนส่งของได้
                </p>
              ) : null}
            </div>
          ) : null}

          <div className="relative aspect-[4/3] overflow-hidden rounded-lg border bg-slate-950">
            <div className="absolute inset-0 grid place-items-center text-center text-slate-200">
              <div>
                <ScanLine className="mx-auto mb-3 h-12 w-12" />
                <p className="text-sm">พร้อมเชื่อมกล้อง/เครื่องสแกนภายนอกในขั้นถัดไป</p>
                <p className="mt-1 text-xs text-slate-400">รอบนี้บันทึกข้อมูลจริงผ่านการคีย์รหัสก่อน</p>
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="scan-code">รหัสที่สแกน</Label>
            <Input
              id="scan-code"
              value={code}
              onChange={(event) => setCode(event.target.value)}
              disabled={isScanBlocked}
              placeholder="เช่น material code, PO SAP No. หรือ registry key"
            />
          </div>

          <Button type="button" onClick={handleScanSubmit} disabled={!job || isSubmitting || isScanBlocked}>
            บันทึกการสแกน
          </Button>

          {job?.items.length ? (
            <div className="grid gap-2 sm:grid-cols-2">
              {job.items.slice(0, 6).map((item) => (
                <Button
                  key={item.registryKey}
                  type="button"
                  variant="outline"
                  disabled={isScanBlocked}
                  onClick={() => setCode(item.materialCode || item.registryKey)}
                >
                  ใช้ {item.materialCode || item.registryKey}
                </Button>
              ))}
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">ผลการตรวจ</CardTitle>
          <CardDescription>สถานะล่าสุดของการสแกนและเงื่อนไขตรวจสอบหลัก</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3">
            {driverScanChecks.map((label) => {
              const ok = scanResult !== "alert";

              return (
                <div key={label} className="flex items-center justify-between rounded-lg border p-3 text-sm">
                  <span>{label}</span>
                  {ok ? (
                    <Badge variant="success">
                      <CheckCircle2 className="mr-1 h-3.5 w-3.5" /> ผ่าน
                    </Badge>
                  ) : (
                    <Badge variant="warning">
                      <AlertTriangle className="mr-1 h-3.5 w-3.5" /> Alert
                    </Badge>
                  )}
                </div>
              );
            })}
          </div>

          <div className="rounded-lg border p-4">
            <p className="flex items-center gap-2 text-sm font-medium">
              <MapPin className="h-4 w-4 text-cyan-700" />
              ปลายทางที่เลือก
            </p>
            <p className="mt-2 text-sm text-muted-foreground">
              {currentDestination ? `${currentDestination.name} / radius ${currentDestination.radiusMeters} m` : "ยังไม่ได้เลือกปลายทาง"}
            </p>
            {mode === "deliver" && currentDestination ? (
              <p className="mt-1 text-xs text-muted-foreground">
                สถานะเช็กอินปลายทาง: {currentDestination.deliveryCheckedInAt ? "พร้อมส่ง" : "ยังไม่เช็กอิน"}
              </p>
            ) : null}
          </div>

          {message ? (
            scanResult === "alert" ? (
              <div className="whitespace-pre-line rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">
                {message}
              </div>
            ) : (
              <div className="whitespace-pre-line rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-300">
                {message}
              </div>
            )
          ) : null}

          {job ? !isDedicatedDriverMode ? (
            <Button asChild variant="outline">
              <Link href={`/jobs/monitor?jobId=${encodeURIComponent(job.id)}`}>เปิด Monitor ของ Job นี้</Link>
            </Button>
          ) : null : null}
        </CardContent>
      </Card>

      {isLoading ? <div className="text-sm text-muted-foreground">กำลังโหลดข้อมูลห้องคนขับ</div> : null}
    </div>
  );
}
