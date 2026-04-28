"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AlertTriangle, CheckCircle2, FileText, MapPin, QrCode, ScanLine, Truck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { checkInJobOrigin, getJob, getJobs, submitJobScan } from "@/lib/job-db";
import { type JobRecord, type ScanMode } from "@/lib/jobs";

const driverScanChecks = [
  "อยู่ใน PO ของ Job นี้",
  "เป็นของ Location ปัจจุบัน",
  "จำนวนไม่เกินแผน",
  "อยู่ในลำดับ flow ที่ถูกต้อง",
];

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
  const [deviceGps, setDeviceGps] = useState("");
  const [isFetchingGps, setIsFetchingGps] = useState(false);

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
          setCurrentLocation(nextJob?.destinations[0]?.id ?? "");
        } else {
          setJob(null);
        }
      } catch {
        setMessage("โหลดข้อมูลห้องคนขับไม่สำเร็จ");
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

  async function captureDeviceGps() {
    if (!job) {
      setMessage("ยังไม่มี Job ให้เช็กอิน GPS");
      setScanResult("alert");
      return;
    }

    if (!("geolocation" in navigator)) {
      setMessage("อุปกรณ์นี้ไม่รองรับการดึง GPS");
      setScanResult("alert");
      return;
    }

    setIsFetchingGps(true);

    try {
      const position = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 15000,
          maximumAge: 0,
        });
      });

      const latitude = position.coords.latitude;
      const longitude = position.coords.longitude;
      const accuracy = position.coords.accuracy;
      const gpsText = `${latitude.toFixed(6)},${longitude.toFixed(6)} / accuracy ${Math.round(accuracy)} m`;

      setDeviceGps(gpsText);
      const nextJob = await checkInJobOrigin({
        jobId: job.id,
        latitude,
        longitude,
        accuracy,
      });

      setJob(nextJob);
      setMessage("ดึง GPS จากมือถือและเช็กอินต้นทางเรียบร้อยแล้ว");
      setScanResult("ok");
    } catch {
      setMessage("ดึง GPS จากอุปกรณ์ไม่สำเร็จ กรุณาอนุญาตตำแหน่งและลองใหม่");
      setScanResult("alert");
    } finally {
      setIsFetchingGps(false);
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
                      </div>
                      <Badge variant="secondary">{items.reduce((sum, item) => sum + item.orderQty, 0)} pcs</Badge>
                    </div>
                    <div className="mt-3 space-y-2">
                      {items.map((item) => (
                        <div key={item.registryKey} className="flex items-center justify-between rounded-md bg-slate-50 px-3 py-2 text-sm dark:bg-slate-900">
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
            <p className="mt-2">ระบบจะใช้พิกัดจากมือถือเครื่องนี้เท่านั้น ไม่รับการพิมพ์ตำแหน่งเอง</p>
            <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center">
              <Button type="button" variant="outline" onClick={captureDeviceGps} disabled={!job || isFetchingGps}>
                {isFetchingGps ? "กำลังดึง GPS" : "ดึง GPS ปัจจุบัน"}
              </Button>
              <span className="text-xs text-cyan-900 dark:text-cyan-100">{deviceGps || job?.originGps || "ยังไม่มีพิกัดจากอุปกรณ์"}</span>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Button type="button" variant={mode === "load" ? "default" : "outline"} onClick={() => setMode("load")}>
              <Truck className="mr-2 h-4 w-4" />
              โหมดขึ้นรถ
            </Button>
            <Button type="button" variant={mode === "deliver" ? "default" : "outline"} onClick={() => setMode("deliver")}>
              <QrCode className="mr-2 h-4 w-4" />
              โหมดส่งปลายทาง
            </Button>
          </div>

          {mode === "deliver" && job?.destinations.length ? (
            <div className="space-y-2">
              <Label htmlFor="destination-selector">เลือกปลายทางปัจจุบัน</Label>
              <select
                id="destination-selector"
                value={currentLocation}
                onChange={(event) => setCurrentLocation(event.target.value)}
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                {job.destinations.map((destination) => (
                  <option key={destination.id} value={destination.id}>
                    {destination.name}
                  </option>
                ))}
              </select>
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
              placeholder="เช่น material code, PO SAP No. หรือ registry key"
            />
          </div>

          <Button type="button" onClick={handleScanSubmit} disabled={!job || isSubmitting}>
            บันทึกการสแกน
          </Button>

          {job?.items.length ? (
            <div className="grid gap-2 sm:grid-cols-2">
              {job.items.slice(0, 6).map((item) => (
                <Button key={item.registryKey} type="button" variant="outline" onClick={() => setCode(item.materialCode || item.registryKey)}>
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
                    <Badge variant="success"><CheckCircle2 className="mr-1 h-3.5 w-3.5" /> ผ่าน</Badge>
                  ) : (
                    <Badge variant="warning"><AlertTriangle className="mr-1 h-3.5 w-3.5" /> Alert</Badge>
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
          </div>

          {message ? (
            scanResult === "alert" ? (
              <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">
                {message}
              </div>
            ) : (
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-300">
                {message}
              </div>
            )
          ) : null}

          {job ? (
            !isDedicatedDriverMode ? (
              <Button asChild variant="outline">
                <Link href={`/jobs/monitor?jobId=${encodeURIComponent(job.id)}`}>เปิด Monitor ของ Job นี้</Link>
              </Button>
            ) : null
          ) : null}
        </CardContent>
      </Card>

      {isLoading ? (
        <div className="text-sm text-muted-foreground">กำลังโหลดข้อมูลห้องคนขับ</div>
      ) : null}
    </div>
  );
}
