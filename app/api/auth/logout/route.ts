import { NextResponse } from "next/server";
import { getCookieOptions } from "@/lib/rmc-sso";
import { sessionCookieName } from "@/lib/rmc-session";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const response = NextResponse.redirect(new URL("/login", requestUrl));
  response.cookies.set(sessionCookieName, "", getCookieOptions(0));
  return response;
}
