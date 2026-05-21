"use client";

import Link from "next/link";
import { useState } from "react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import QRCode from "react-qr-code";
import { ChevronDown, ExternalLink, LockKeyhole, QrCode, ShieldCheck, ShieldOff, Trash2, UnlockKeyhole, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { buildDriverRoomPath, buildDriverRoomUrl } from "@/lib/driver-room";
import { deleteJob, updateJobDestinationOverride, updateJobOriginOverride } from "@/lib/job-db";

const menuItemClass =
  "flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm outline-none transition-colors hover:bg-slate-50 focus:bg-slate-50 data-[highlighted]:bg-slate-50 data-[disabled]:cursor-not-allowed data-[disabled]:opacity-40";

function DriverQrModal({
  jobId,
  driver,
  vehicle,
  url,
  onClose,
}: {
  jobId: string;
  driver?: string;
  vehicle?: string;
  url: string;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="w-full max-w-sm overflow-hidden rounded-xl border border-[#d8dde6] bg-white p-5 shadow-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <p className="text-sm font-semibold text-slate-900">QR สำหรับคนขับ</p>
          <button
            type="button"
            onClick={onClose}
            aria-label="ปิด"
            className="rounded-md p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="mt-4 flex justify-center">
          <div className="rounded-lg bg-white p-3 ring-1 ring-slate-200">
            <QRCode value={url} size={180} />
          </div>
        </div>
        <div className="mt-4 space-y-1.5 text-sm text-slate-700">
          <p className="break-words">
            รหัสงาน: <span className="font-semibold text-slate-900">{jobId}</span>
          </p>
          <p className="break-words">
            คนขับ: <span className="font-medium">{driver || "-"}</span> / รถ:{" "}
            <span className="font-medium">{vehicle || "-"}</span>
          </p>
          <p className="[overflow-wrap:anywhere] rounded-md bg-slate-50 px-3 py-2 text-xs text-slate-600">{url}</p>
          <p className="text-xs text-muted-foreground">ให้คนขับสแกน QR นี้เพื่อเปิดห้องงานทันที</p>
        </div>
      </div>
    </div>
  );
}

export function JobMonitorActions({
  jobId,
  driver,
  vehicle,
  destinationOverrideEnabled,
  isFullyLoaded,
  originOverrideEnabled,
  isOriginLocked,
}: {
  jobId: string;
  driver?: string;
  vehicle?: string;
  destinationOverrideEnabled: boolean;
  isFullyLoaded: boolean;
  originOverrideEnabled: boolean;
  isOriginLocked: boolean;
}) {
  const router = useRouter();
  const [qrUrl, setQrUrl] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const driverRoomPath = buildDriverRoomPath(jobId);

  function showQr() {
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    setQrUrl(buildDriverRoomUrl(origin, jobId));
  }

  async function toggleDestination() {
    const next = !destinationOverrideEnabled;
    const confirmed = window.confirm(
      next
        ? `เปิดปลายทางกรณีพิเศษให้งาน ${jobId} ใช่ไหม?\n\nคนขับจะเช็กอินและสแกนส่งปลายทางได้ แม้สินค้ายังขึ้นรถไม่ครบ`
        : `ปิดสิทธิ์เปิดปลายทางกรณีพิเศษของงาน ${jobId} ใช่ไหม?`,
    );

    if (!confirmed) {
      return;
    }

    setIsBusy(true);

    try {
      await updateJobDestinationOverride({ jobId, allowDestinationBeforeFullyLoaded: next });
      router.refresh();
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "อัปเดตสิทธิ์ปลายทางไม่สำเร็จ");
    } finally {
      setIsBusy(false);
    }
  }

  async function toggleOrigin() {
    const next = !originOverrideEnabled;
    const confirmed = window.confirm(
      next
        ? `เปิดต้นทางกรณีพิเศษให้งาน ${jobId} ใช่ไหม?\n\nคนขับจะเช็กอินต้นทางใหม่ได้ 1 ครั้ง แม้ระบบปิดต้นทางหลังโหลดครบแล้ว`
        : `ปิดสิทธิ์ต้นทางกรณีพิเศษของงาน ${jobId} ใช่ไหม?`,
    );

    if (!confirmed) {
      return;
    }

    setIsBusy(true);

    try {
      await updateJobOriginOverride({ jobId, allowOriginRecheckAfterLocked: next });
      router.refresh();
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "อัปเดตสิทธิ์ต้นทางไม่สำเร็จ");
    } finally {
      setIsBusy(false);
    }
  }

  async function handleDelete() {
    const confirmed = window.confirm(
      `ต้องการลบ Job ${jobId} ใช่ไหม?\n\nระบบจะลบห้องงานนี้และคืน PO กลับไปหน้า PO รอจัดส่ง`,
    );

    if (!confirmed) {
      return;
    }

    setIsBusy(true);

    try {
      await deleteJob(jobId);
      router.push("/jobs");
      router.refresh();
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "ลบ Job ไม่สำเร็จ");
      setIsBusy(false);
    }
  }

  return (
    <>
      <DropdownMenu.Root>
        <DropdownMenu.Trigger asChild>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={isBusy}
            className="w-full justify-center gap-1.5"
            aria-label="เมนูจัดการงาน"
          >
            {isBusy ? "กำลังบันทึก" : "จัดการงาน"}
            <ChevronDown className="h-4 w-4 text-slate-500" />
          </Button>
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content
            align="end"
            sideOffset={6}
            className="z-50 min-w-[var(--radix-dropdown-menu-trigger-width)] rounded-xl border border-[#d8dde6] bg-white p-1.5 text-slate-900 shadow-lg shadow-slate-900/10"
          >
            <DropdownMenu.Item asChild className={menuItemClass}>
              <Link href={driverRoomPath}>
                <ExternalLink className="h-4 w-4 shrink-0 text-slate-500" />
                เปิดห้องคนขับ
              </Link>
            </DropdownMenu.Item>
            <DropdownMenu.Item className={menuItemClass} onSelect={() => showQr()}>
              <QrCode className="h-4 w-4 shrink-0 text-slate-500" />
              แสดง QR สำหรับคนขับ
            </DropdownMenu.Item>
            <DropdownMenu.Separator className="my-1 h-px bg-[#f0f2f5]" />
            <DropdownMenu.Item
              className={menuItemClass}
              disabled={isFullyLoaded}
              onSelect={() => void toggleDestination()}
            >
              {destinationOverrideEnabled ? (
                <ShieldOff className="h-4 w-4 shrink-0 text-slate-500" />
              ) : (
                <ShieldCheck className="h-4 w-4 shrink-0 text-slate-500" />
              )}
              {destinationOverrideEnabled ? "ปิดปลายทางพิเศษ" : "เปิดปลายทางพิเศษ"}
            </DropdownMenu.Item>
            <DropdownMenu.Item
              className={menuItemClass}
              disabled={!isOriginLocked}
              onSelect={() => void toggleOrigin()}
            >
              {originOverrideEnabled ? (
                <LockKeyhole className="h-4 w-4 shrink-0 text-slate-500" />
              ) : (
                <UnlockKeyhole className="h-4 w-4 shrink-0 text-slate-500" />
              )}
              {originOverrideEnabled ? "ปิดต้นทางพิเศษ" : "เปิดต้นทางพิเศษ"}
            </DropdownMenu.Item>
            <DropdownMenu.Separator className="my-1 h-px bg-[#f0f2f5]" />
            <DropdownMenu.Item
              className={`${menuItemClass} text-red-600 hover:bg-red-50 focus:bg-red-50 data-[highlighted]:bg-red-50`}
              onSelect={() => void handleDelete()}
            >
              <Trash2 className="h-4 w-4 shrink-0" />
              ลบ Job
            </DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>

      {qrUrl ? (
        <DriverQrModal jobId={jobId} driver={driver} vehicle={vehicle} url={qrUrl} onClose={() => setQrUrl(null)} />
      ) : null}
    </>
  );
}
