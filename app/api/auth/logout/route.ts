import { NextResponse } from "next/server";
import {
  getCookieOptions,
  getSsoClientId,
  getSsoEndSessionUrl,
  getSsoPostLogoutRedirectUri,
} from "@/lib/rmc-sso";
import { sessionCookieName } from "@/lib/rmc-session";

export const dynamic = "force-dynamic";

export async function GET() {
  const endSessionUrl = new URL(getSsoEndSessionUrl());
  endSessionUrl.searchParams.set("client_id", getSsoClientId());
  endSessionUrl.searchParams.set("post_logout_redirect_uri", getSsoPostLogoutRedirectUri());
  endSessionUrl.searchParams.set("state", crypto.randomUUID());

  const response = NextResponse.redirect(endSessionUrl);
  response.cookies.set(sessionCookieName, "", getCookieOptions(0));
  return response;
}
