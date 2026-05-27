"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import QRCode from "react-qr-code";
import { ExternalLink, QrCode } from "lucide-react";
import { buildDriverRoomPath, buildDriverRoomUrl } from "@/lib/driver-room";
import { Button } from "@/components/ui/button";

export function JobDriverAccessCard({
  jobId,
  driver,
  vehicle,
  compact = false,
  iconOnly = false,
}: {
  jobId: string;
  driver?: string;
  vehicle?: string;
  compact?: boolean;
  iconOnly?: boolean;
}) {
  const driverRoomPath = buildDriverRoomPath(jobId);
  const [driverRoomUrl, setDriverRoomUrl] = useState(driverRoomPath);
  const [isQrVisible, setIsQrVisible] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    setDriverRoomUrl(buildDriverRoomUrl(window.location.origin, jobId));
  }, [jobId]);

  return (
    <div className={iconOnly ? "relative" : "space-y-2"}>
      <div className={compact ? "flex flex-col gap-2 sm:flex-row sm:flex-wrap" : "flex flex-col gap-2 sm:flex-row"}>
        <Button
          asChild
          variant="outline"
          size={iconOnly ? "icon" : compact ? "sm" : "default"}
          className={iconOnly ? "h-8 w-8" : undefined}
          title="เปิดห้องคนขับ"
          aria-label="เปิดห้องคนขับ"
        >
          <Link href={driverRoomPath} className={compact && !iconOnly ? "w-full sm:w-auto" : undefined}>
            <ExternalLink className={iconOnly ? "h-4 w-4" : "mr-2 h-4 w-4"} />
            {iconOnly ? <span className="sr-only">เปิดห้องคนขับ</span> : "เปิดห้องคนขับ"}
          </Link>
        </Button>
        <Button
          type="button"
          variant="outline"
          size={iconOnly ? "icon" : compact ? "sm" : "default"}
          onClick={() => setIsQrVisible((currentValue) => !currentValue)}
          className={iconOnly ? "h-8 w-8" : compact ? "w-full sm:w-auto" : undefined}
          title={isQrVisible ? "ซ่อน QR" : "แสดง QR สำหรับคนขับ"}
          aria-label={isQrVisible ? "ซ่อน QR" : "แสดง QR สำหรับคนขับ"}
        >
          <QrCode className={iconOnly ? "h-4 w-4" : "mr-2 h-4 w-4"} />
          {iconOnly ? <span className="sr-only">{isQrVisible ? "ซ่อน QR" : "แสดง QR สำหรับคนขับ"}</span> : isQrVisible ? "ซ่อน QR" : "แสดง QR สำหรับคนขับ"}
        </Button>
      </div>

      {isQrVisible ? (
        <div className={iconOnly ? "absolute right-0 top-10 z-20 w-80 rounded-lg border border-cyan-200 bg-cyan-50 p-4 text-cyan-950 shadow-lg shadow-slate-900/10 dark:border-cyan-900 dark:bg-cyan-950/30 dark:text-cyan-100" : "rounded-lg border border-cyan-200 bg-cyan-50 p-4 text-cyan-950 dark:border-cyan-900 dark:bg-cyan-950/30 dark:text-cyan-100 sm:p-5"}>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
            <div className="rounded-lg bg-white p-4 shadow-sm">
              <QRCode value={driverRoomUrl} size={iconOnly ? 120 : 144} />
            </div>
            <div className="space-y-2 text-sm">
              <p className="font-medium">สแกน QR นี้เพื่อเปิดหน้าคนขับของงานนี้ทันที</p>
              <p>
                รหัสงาน: <span className="font-semibold">{jobId}</span>
              </p>
              <p>คนขับ: <span className="font-medium">{driver || "-"}</span></p>
              <p>รถ: <span className="font-medium">{vehicle || "-"}</span></p>
              <p className="max-h-24 overflow-y-auto break-all rounded-md bg-white/80 px-3 py-2 text-xs leading-5 text-cyan-900 dark:bg-slate-950/60 dark:text-cyan-100">
                {driverRoomUrl}
              </p>
              <p className="text-xs text-cyan-800 dark:text-cyan-200">
                หากสแกนไม่ได้ ให้เปิดลิงก์นี้จากมือถือของคนขับแทน
              </p>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
