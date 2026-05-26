import { NextResponse } from "next/server";
import { getAppBaseUrl, rmcSsoProviderId } from "@/lib/rmc-sso";

export const dynamic = "force-dynamic";

export async function GET() {
  const baseUrl = getAppBaseUrl();

  return NextResponse.json({
    [rmcSsoProviderId]: {
      id: rmcSsoProviderId,
      name: "RMC SSO",
      type: "oidc",
      signinUrl: `${baseUrl}/api/auth/rmc-sso/login`,
      callbackUrl: `${baseUrl}/`,
    },
  });
}
