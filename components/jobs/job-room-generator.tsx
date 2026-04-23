"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { CheckCircle2, Copy, ExternalLink, MapPinned, Save, Truck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { groupedPOsByDestination } from "@/lib/mock-data";
import { cn } from "@/lib/utils";

function MiniQr({ value, label }: { value: string; label: string }) {
  const cells = useMemo(() => {
    const seed = Array.from(value).reduce((sum, char) => sum + char.charCodeAt(0), 0);
    return Array.from({ length: 121 }, (_, index) => {
      const row = Math.floor(index / 11);
      const col = index % 11;
      const finder =
        (row < 3 && col < 3) ||
        (row < 3 && col > 7) ||
        (row > 7 && col < 3);

      if (finder) return true;
      return ((index * 17 + seed + row * 7 + col * 11) % 5) < 2;
    });
  }, [value]);

  return (
    <div className="rounded-lg border bg-white p-3 text-slate-950">
      <div className="grid grid-cols-11 gap-0.5">
        {cells.map((filled, index) => (
          <div
            key={`${value}-${index}`}
            className={cn("aspect-square rounded-[1px]", filled ? "bg-slate-950" : "bg-white")}
          />
        ))}
      </div>
      <p className="mt-2 truncate text-center text-xs font-medium">{label}</p>
    </div>
  );
}

export function JobRoomGenerator() {
  const [jobNo, setJobNo] = useState("JOB-2026-0420-001");
  const [vehicle, setVehicle] = useState("6W-4382");
  const [driver, setDriver] = useState("Somchai Driver");
  const [origin, setOrigin] = useState("DC Bangna");
  const [originGps, setOriginGps] = useState("13.6682,100.6804 / radius 150 m");
  const [created, setCreated] = useState(false);
  const [copied, setCopied] = useState(false);

  const jobRoomUrl = `/driver?job=${encodeURIComponent(jobNo)}`;
  const jobRoomPayload = JSON.stringify({
    type: "job_room",
    jobNo,
    vehicle,
    driver,
    origin,
  });

  async function copyRoomUrl() {
    await navigator.clipboard?.writeText(`${window.location.origin}${jobRoomUrl}`);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>รายละเอียดงาน</CardTitle>
          <CardDescription>กำหนดรถ คนขับ ต้นทาง และข้อมูลสำหรับ QR ห้องงาน</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-5 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="job-no">Job No.</Label>
            <Input id="job-no" value={jobNo} onChange={(event) => setJobNo(event.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="vehicle">รถขนส่ง</Label>
            <Input id="vehicle" value={vehicle} onChange={(event) => setVehicle(event.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="driver">คนขับ</Label>
            <Input id="driver" value={driver} onChange={(event) => setDriver(event.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="origin">ต้นทาง</Label>
            <Input id="origin" value={origin} onChange={(event) => setOrigin(event.target.value)} />
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="origin-gps">GPS ต้นทาง</Label>
            <Input id="origin-gps" value={originGps} onChange={(event) => setOriginGps(event.target.value)} />
          </div>
          <div className="md:col-span-2">
            <Button type="button" className="w-full" onClick={() => setCreated(true)}>
              <Save className="mr-2 h-4 w-4" />
              สร้าง Job Room + QR
            </Button>
          </div>
        </CardContent>
      </Card>

      {created && (
        <Card className="border-emerald-200 dark:border-emerald-900">
          <CardHeader>
            <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                  สร้าง Job Room สำเร็จ
                </CardTitle>
                <CardDescription>ส่ง QR ห้องงานให้คนขับ และใช้ QR location เมื่อถึงปลายทาง</CardDescription>
              </div>
              <Badge variant="success">ready</Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid gap-4 lg:grid-cols-[220px_1fr]">
              <MiniQr value={jobRoomPayload} label={jobNo} />
              <div className="space-y-3 rounded-lg border p-4">
                <p className="font-semibold">Job Room</p>
                <p className="break-all text-sm text-muted-foreground">{jobRoomUrl}</p>
                <div className="grid gap-2 sm:grid-cols-3">
                  <Button asChild>
                    <Link href={jobRoomUrl}>
                      <ExternalLink className="mr-2 h-4 w-4" />
                      เปิดห้องงาน
                    </Link>
                  </Button>
                  <Button type="button" variant="outline" onClick={copyRoomUrl}>
                    <Copy className="mr-2 h-4 w-4" />
                    {copied ? "คัดลอกแล้ว" : "คัดลอกลิงก์"}
                  </Button>
                  <Button asChild variant="outline">
                    <Link href="/jobs/monitor">ไป Monitor</Link>
                  </Button>
                </div>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              {groupedPOsByDestination.map((group) => (
                <div key={group.destinationId} className="grid gap-4 rounded-lg border p-4 sm:grid-cols-[140px_1fr]">
                  <MiniQr
                    value={JSON.stringify({ type: "location", jobNo, locationId: group.destinationId })}
                    label={group.destinationId}
                  />
                  <div>
                    <div className="flex items-center gap-2">
                      <MapPinned className="h-4 w-4 text-cyan-700 dark:text-cyan-300" />
                      <p className="font-semibold">{group.destination}</p>
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">PO: {group.poIds.join(", ")}</p>
                    <p className="mt-2 text-sm text-muted-foreground">{group.totalItems} pcs</p>
                    <Badge className="mt-3" variant="secondary">QR Location</Badge>
                  </div>
                </div>
              ))}
            </div>

            <div className="rounded-lg border bg-cyan-50 p-4 text-sm text-cyan-800 dark:border-cyan-900 dark:bg-cyan-950/30 dark:text-cyan-200">
              <div className="flex items-center gap-2 font-medium">
                <Truck className="h-4 w-4" />
                Flow ถัดไป
              </div>
              <p className="mt-2">
                คนขับสแกน QR ห้องงาน เข้าสู่โหมดรับต้นทางอัตโนมัติ แล้วสแกนสินค้าโดยระบบเช็คกับ PO ใน Job
              </p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
