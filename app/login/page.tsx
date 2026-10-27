import Image from "next/image";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { Button } from "@/components/ui/button";
import { ArrowRight, Boxes, MapPin, QrCode, ShieldCheck } from "lucide-react";
import { Card } from "@/components/ui/card";
import { SyncDropMascot } from "@/components/brand/syncdrop-mascot";
import { withBasePath } from "@/lib/app-paths";
import { getSsoDiagnostics } from "@/lib/sso-diagnostics";

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

  if (session) {
    redirect(safeCallbackUrl);
  }

  const diagnostics = params.error ? await getSsoDiagnostics() : null;
  const errorMessage = params.error
    ? "เข้าสู่ระบบไม่สำเร็จ โปรดลองอีกครั้ง หรือติดต่อผู้ดูแลระบบ"
    : null;

  return (
    <div className="relative isolate flex min-h-dvh items-center justify-center overflow-hidden bg-[#0b203b] px-4 py-8 sm:px-8">
      <Image src={withBasePath("/warehouse-background.webp")} alt="" fill priority sizes="100vw" className="-z-20 object-cover" />
      <div className="absolute inset-0 -z-10 bg-gradient-to-r from-[#081a31]/95 via-[#0b2848]/80 to-[#0b2848]/45" />
      <div className="grid w-full max-w-6xl items-center gap-10 lg:grid-cols-[1.2fr_1fr] lg:gap-20">
        <div className="hidden text-white lg:block">
          <div className="mb-10 flex items-center gap-3"><span className="flex size-12 items-center justify-center rounded-2xl border border-white/20 bg-white/10 backdrop-blur-sm"><Boxes className="size-6 text-sky-300" /></span><span className="text-[11px] font-medium uppercase tracking-[0.2em] text-sky-200">Connected logistics workspace</span></div>
          <div className="flex items-center gap-4">
            <h2 className="min-w-0 flex-1 text-4xl font-bold leading-[1.4] tracking-tight xl:text-5xl">ทุกการส่ง<br /><span className="text-sky-300">เชื่อมถึงกัน</span></h2>
            <SyncDropMascot className="w-36 xl:w-48" sizes="(min-width: 1280px) 192px, 144px" />
          </div>
          <p className="mt-6 max-w-sm text-sm leading-7 text-slate-300">จัดการ PO วางแผนงานขนส่ง และติดตามสินค้า<br />จากคลังสินค้าถึงปลายทาง ด้วย SyncDrop</p>
          <div className="mt-10 flex flex-wrap gap-3">
            {[{ icon: Boxes, label: "จัดการ PO" }, { icon: QrCode, label: "สแกนรับ–ส่ง" }, { icon: MapPin, label: "ติดตาม GPS" }].map(({ icon: Icon, label }) => <span key={label} className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-2 text-xs text-slate-200"><Icon className="size-3.5 text-sky-300" />{label}</span>)}
          </div>
        </div>
      <Card className="mx-auto w-full max-w-md border-white/60 bg-white/95 p-6 shadow-2xl shadow-slate-950/30 backdrop-blur-xl sm:p-9">
        <div className="mb-7 flex flex-col items-center text-center">
          <Image
            src={withBasePath("/logo.png")}
            alt="SyncDrop Logo"
            width={64}
            height={53}
            unoptimized
            className="mb-4 h-16 w-auto object-contain"
          />
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            เข้าสู่ระบบ SyncDrop
          </h1>
          <p className="mt-2 text-[13px] text-slate-500">
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
            className="h-12 w-full gap-3 rounded-xl text-sm"
          >
            Sign in with RMC SSO
            <ArrowRight className="size-4" />
          </Button>
        </form>

        <div className="mt-6 flex items-center justify-center gap-2 border-t pt-5 text-[11px] text-slate-500"><ShieldCheck className="size-4 text-primary" />ยืนยันตัวตนผ่านบัญชีองค์กร RMC</div>
        <p className="mt-3 text-center text-[10px] leading-relaxed text-slate-400">
          การเข้าสู่ระบบหมายความว่าคุณยอมรับการใช้งานภายใต้นโยบายขององค์กร
        </p>
      </Card>
      </div>
    </div>
  );
}
