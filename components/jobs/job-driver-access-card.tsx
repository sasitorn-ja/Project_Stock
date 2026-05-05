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
}: {
  jobId: string;
  driver?: string;
  vehicle?: string;
  compact?: boolean;
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
    <div className="space-y-2">
      <div className={compact ? "flex flex-wrap gap-2" : "flex flex-col gap-2 sm:flex-row"}>
        <Button asChild variant="outline" size={compact ? "sm" : "default"}>
          <Link href={driverRoomPath}>
            <ExternalLink className="mr-2 h-4 w-4" />
            เปิด Driver Room
          </Link>
        </Button>
        <Button
          type="button"
          variant="outline"
          size={compact ? "sm" : "default"}
          onClick={() => setIsQrVisible((currentValue) => !currentValue)}
        >
          <QrCode className="mr-2 h-4 w-4" />
          {isQrVisible ? "ซ่อน QR" : "แสดง QR สำหรับคนขับ"}
        </Button>
      </div>

      {isQrVisible ? (
        <div className="rounded-lg border border-cyan-200 bg-cyan-50 p-4 text-cyan-950 dark:border-cyan-900 dark:bg-cyan-950/30 dark:text-cyan-100">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
            <div className="rounded-lg bg-white p-3 shadow-sm">
              <QRCode value={driverRoomUrl} size={144} />
            </div>
            <div className="space-y-2 text-sm">
              <p className="font-medium">สแกน QR นี้เพื่อเปิดหน้าคนขับของงานนี้ทันที</p>
              <p>
                Job: <span className="font-semibold">{jobId}</span>
              </p>
              <p>คนขับ: <span className="font-medium">{driver || "-"}</span></p>
              <p>รถ: <span className="font-medium">{vehicle || "-"}</span></p>
              <p className="break-all rounded-md bg-white/80 px-3 py-2 text-xs text-cyan-900 dark:bg-slate-950/60 dark:text-cyan-100">
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
