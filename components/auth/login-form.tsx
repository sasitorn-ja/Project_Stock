"use client";

import Image from "next/image";
import { LogIn } from "lucide-react";
import { signIn } from "next-auth/react";
import { Button } from "@/components/ui/button";
import type { SsoDiagnostics } from "@/lib/sso-diagnostics";

export function LoginForm({
  callbackUrl,
  error,
  diagnostics,
}: {
  callbackUrl: string;
  error?: string;
  diagnostics?: SsoDiagnostics | null;
}) {
  const readableError = error ? decodeURIComponent(error) : "";

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#f5f6f8] px-4 py-10 text-slate-900">
      <div className="w-full max-w-sm rounded-lg border border-[#d8dde6] bg-white p-6 shadow-sm">
        <div className="flex flex-col items-center text-center">
          <Image
            src="/logo.png"
            alt="SyncDrop Logo"
            width={88}
            height={72}
            className="h-16 w-auto object-contain"
            priority
          />
          <h1 className="mt-4 text-xl font-bold">SyncDrop</h1>
          <p className="mt-1 text-sm text-slate-500">
            เข้าสู่ระบบสำหรับผู้ใช้งานหลังบ้าน
          </p>
        </div>

        {error ? (
          <div className="mt-5 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            <p className="font-medium">เข้าสู่ระบบไม่สำเร็จ กรุณาลองใหม่อีกครั้ง</p>
            <p className="mt-1 text-xs text-red-600">SSO error: {readableError}</p>
          </div>
        ) : null}

        {diagnostics ? (
          <div className="mt-3 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-left text-xs text-slate-700">
            <p className="font-semibold text-slate-900">SSO debug</p>
            <div className="mt-2 space-y-1.5">
              {diagnostics.items.map((item) => (
                <div key={item.label} className="grid grid-cols-[112px_1fr] gap-2">
                  <span className={item.ok ? "text-emerald-700" : "text-red-700"}>
                    {item.ok ? "OK" : "FAIL"} {item.label}
                  </span>
                  <span className="break-words text-slate-600">{item.value}</span>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        <Button
          type="button"
          className="mt-6 h-11 w-full gap-2 bg-slate-950 text-white hover:bg-slate-800"
          onClick={() => void signIn("rmc-sso", { callbackUrl })}
        >
          <LogIn className="h-4 w-4" />
          เข้าสู่ระบบด้วย SSO
        </Button>
      </div>
    </div>
  );
}
