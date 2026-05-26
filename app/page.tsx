import { redirect } from "next/navigation";

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string; state?: string; error?: string }>;
}) {
  const params = await searchParams;

  if (params.code || params.error) {
    const callbackUrl = new URLSearchParams();

    if (params.code) {
      callbackUrl.set("code", params.code);
    }

    if (params.state) {
      callbackUrl.set("state", params.state);
    }

    if (params.error) {
      callbackUrl.set("error", params.error);
    }

    redirect(`/api/auth/rmc-sso/callback?${callbackUrl.toString()}`);
  }

  redirect("/po");
}
