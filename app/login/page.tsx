import Image from "next/image";
import { redirect } from "next/navigation";
import { auth, signIn } from "@/auth";
import { Button } from "@/components/ui/button";
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
    <div className="flex min-h-[calc(100vh-60px)] items-center justify-center px-4 py-10">
      <div className="w-full max-w-md rounded-xl border border-[#d8dde6] bg-white p-8 shadow-sm">
        <div className="mb-6 flex flex-col items-center text-center">
          <Image
            src="/logo.png"
            alt="SyncDrop Logo"
            width={64}
            height={53}
            className="mb-3 h-14 w-auto object-contain"
          />
          <h1 className="text-xl font-semibold text-slate-900">
            เข้าสู่ระบบ SyncDrop
          </h1>
          <p className="mt-1 text-sm text-slate-500">
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

        <form
          action={async () => {
            "use server";
            await signIn("rmc-sso", { redirectTo: safeCallbackUrl });
          }}
        >
          <Button
            type="submit"
            className="h-11 w-full text-base"
          >
            Sign in with RMC SSO
          </Button>
        </form>

        <p className="mt-6 text-center text-xs text-slate-400">
          การเข้าสู่ระบบหมายความว่าคุณยอมรับการใช้งานภายใต้นโยบายขององค์กร
        </p>
      </div>
    </div>
  );
}
