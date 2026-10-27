import Image from "next/image";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";
import { Card } from "@/components/ui/card";
import { SyncDropMascot } from "@/components/brand/syncdrop-mascot";
import { LoginBackground } from "@/components/layout/login-background";
import { withBasePath } from "@/lib/app-paths";
import { getSsoDiagnostics } from "@/lib/sso-diagnostics";
import { isRemoteDevMode } from "@/lib/remote-api-config";

type SearchParams = Promise<{ callbackUrl?: string; error?: string }>;

export default async function LoginPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const session = await auth();
  const params = await searchParams;
  const callbackUrl = params.callbackUrl ?? "/po";
  const safeCallbackUrl = callbackUrl.startsWith("/") && !callbackUrl.startsWith("//") ? callbackUrl : "/po";

  const isLocalPreview = isRemoteDevMode() && session?.mode === "remote-development";

  if (session && !isLocalPreview) {
    redirect(safeCallbackUrl);
  }

  const diagnostics = params.error ? await getSsoDiagnostics() : null;
  const errorMessage = params.error
    ? "เข้าสู่ระบบไม่สำเร็จ โปรดลองอีกครั้ง หรือติดต่อผู้ดูแลระบบ"
    : null;

  return (
    <div className="relative isolate flex min-h-dvh items-center justify-center overflow-hidden bg-[#0b203b] px-4 py-8 sm:px-8">
      <LoginBackground />
      <div className="absolute inset-0 -z-10 bg-gradient-to-r from-[#081a31]/95 via-[#0b2848]/80 to-[#0b2848]/45" />
      <div className="grid w-full max-w-7xl items-center gap-10 lg:grid-cols-[1.2fr_1fr] lg:gap-20">
        <div className="hidden text-white lg:block">
          <div className="flex items-center gap-5">
            <h2 className="min-w-0 flex-1 text-[clamp(3.25rem,5.5vw,5.25rem)] font-bold leading-[1.15] tracking-[-0.025em] drop-shadow-[0_4px_20px_rgba(2,6,23,0.25)]">
              <span className="block whitespace-nowrap text-white">ทุกการส่ง</span>
              <span className="mt-3 block whitespace-nowrap bg-gradient-to-r from-sky-100 via-sky-300 to-cyan-200 bg-clip-text text-transparent">เชื่อมถึงกัน</span>
            </h2>
            <SyncDropMascot className="w-44 xl:-mr-8 xl:w-64" sizes="(min-width: 1280px) 256px, 176px" />
          </div>
        </div>
      <div className="login-card login-card-frame mx-auto w-full max-w-[460px]">
      <Card className="relative isolate overflow-hidden rounded-[31px] border-0 bg-gradient-to-br from-white via-[#f7fbff] to-[#eaf4ff] px-6 py-8 shadow-none sm:px-10 sm:py-10">
        <div aria-hidden="true" className="pointer-events-none absolute -bottom-24 -left-20 -z-10 size-64 rounded-full bg-blue-100/60 blur-3xl" />
        <div className="mb-8 flex flex-col items-center text-center">
          <div className="relative mb-6 flex size-28 items-center justify-center">
          <span aria-hidden="true" className="absolute -inset-2 -z-10 rounded-full bg-gradient-to-br from-white to-sky-100/80 shadow-[0_8px_30px_-12px_rgba(14,165,233,0.35)] ring-1 ring-white" />
          <span aria-hidden="true" className="absolute -right-1 top-1 size-2.5 rounded-full bg-sky-400 ring-4 ring-white" />
          <Image
            src={withBasePath("/logo.png")}
            alt="SyncDrop Logo"
            width={64}
            height={53}
            unoptimized
            className="h-24 w-auto object-contain"
          />
          </div>
          <h1 className="text-[28px] font-bold leading-snug tracking-tight text-slate-900">
            เข้าสู่ระบบ SyncDrop
          </h1>
          <p className="mt-2 text-[13px] leading-relaxed text-slate-500">
            กรุณายืนยันตัวตนด้วยบัญชี RMC SSO
          </p>
        </div>

        {errorMessage ? (
          <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            <p className="font-medium">{errorMessage}</p>
            <p className="mt-1 text-xs text-red-600">SSO error: {params.error}</p>
          </div>
        ) : null}

        {diagnostics ? (
          <div className="mb-4 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-left text-xs text-slate-700">
            <p className="font-semibold text-slate-900">SSO debug</p>
            <div className="mt-2 space-y-1.5">
              {diagnostics.items.map((item) => (
                <div key={item.label} className="grid grid-cols-[120px_1fr] gap-2">
                  <span className={item.ok ? "text-emerald-700" : "text-red-700"}>
                    {item.ok ? "OK" : "FAIL"} {item.label}
                  </span>
                  <span className="break-words text-slate-600">{item.value}</span>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        <form action={withBasePath("/api/auth/rmc-sso/login")} method="GET">
          <input type="hidden" name="callbackUrl" value={safeCallbackUrl} />
          <Button
            type="submit"
            className="login-cta group relative h-14 w-full gap-4 overflow-hidden rounded-2xl border-blue-500/40 bg-gradient-to-r from-blue-700 via-blue-600 to-sky-500 text-sm shadow-[0_10px_24px_-8px_rgba(37,99,235,0.6)] hover:shadow-[0_14px_30px_-8px_rgba(37,99,235,0.75)]"
          >
            <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 -left-1/3 w-1/4 -skew-x-12 bg-white/20 blur-sm transition-transform duration-700 ease-out group-hover:translate-x-[600%] group-focus-visible:translate-x-[600%]" />
            <span className="relative">Sign in with RMC SSO</span>
            <span aria-hidden="true" className="relative flex size-7 items-center justify-center rounded-full bg-white/15 ring-1 ring-white/20 transition-colors group-hover:bg-white/25"><ArrowRight className="size-4 transition-transform duration-200 group-hover:translate-x-0.5 group-focus-visible:translate-x-0.5" /></span>
          </Button>
        </form>

        <div className="mt-7 space-y-2.5 text-center">
          <div aria-hidden="true" className="mb-5 h-px bg-gradient-to-r from-transparent via-sky-200 to-transparent" />
          <p className="text-xs leading-relaxed text-slate-600">เชื่อมต่ออย่างปลอดภัยด้วยระบบ Single Sign-On</p>
          <p className="text-[11px] tracking-wide text-slate-400">Bethezank Lab 2026</p>
        </div>
      </Card>
      </div>
      </div>
    </div>
  );
}
