import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { LoginForm } from "@/components/auth/login-form";
import { getSsoDiagnostics } from "@/lib/sso-diagnostics";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string; error?: string }>;
}) {
  const session = await auth();
  const { callbackUrl, error } = await searchParams;

  if (session) {
    redirect("/po");
  }

  const diagnostics = error ? await getSsoDiagnostics() : null;

  return <LoginForm callbackUrl={callbackUrl || "/po"} error={error} diagnostics={diagnostics} />;
}
