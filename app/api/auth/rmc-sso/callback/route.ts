import { NextResponse } from "next/server";
import {
  getCookieOptions,
  getSsoClientId,
  getSsoClientSecret,
  getSsoIssuer,
  getSsoRedirectUri,
  getSsoTokenUrl,
  normalizeInternalCallbackUrl,
} from "@/lib/rmc-sso";
import {
  createSessionCookieValue,
  getSessionCookieMaxAge,
  sessionCookieName,
  ssoCallbackCookieName,
  ssoStateCookieName,
  ssoVerifierCookieName,
  verifyHs256Jwt,
} from "@/lib/rmc-session";

export const dynamic = "force-dynamic";

function createLoginErrorRedirect(requestUrl: URL, error: string) {
  const loginUrl = new URL("/login", requestUrl);
  loginUrl.searchParams.set("error", error);
  return NextResponse.redirect(loginUrl);
}

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const state = requestUrl.searchParams.get("state");
  const error = requestUrl.searchParams.get("error");

  if (error) {
    return createLoginErrorRedirect(requestUrl, error);
  }

  if (!code || !state) {
    return createLoginErrorRedirect(requestUrl, "MissingCode");
  }

  const cookieHeader = request.headers.get("cookie") || "";
  const requestCookies = Object.fromEntries(
    cookieHeader
      .split(";")
      .map((cookie) => cookie.trim().split("="))
      .filter(([key, value]) => key && typeof value === "string")
      .map(([key, value]) => [key, decodeURIComponent(value)]),
  );
  const storedState = requestCookies[ssoStateCookieName];
  const verifier = requestCookies[ssoVerifierCookieName];
  const callbackUrl = normalizeInternalCallbackUrl(requestCookies[ssoCallbackCookieName]);
  const clientSecret = getSsoClientSecret();

  if (!storedState || storedState !== state || !verifier) {
    return createLoginErrorRedirect(requestUrl, "InvalidState");
  }

  if (!clientSecret) {
    return createLoginErrorRedirect(requestUrl, "MissingClientSecret");
  }

  try {
    const tokenResponse = await fetch(getSsoTokenUrl(), {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        client_id: getSsoClientId(),
        client_secret: clientSecret,
        redirect_uri: getSsoRedirectUri(),
        code,
        code_verifier: verifier,
      }),
    });
    const tokenData = (await tokenResponse.json().catch(() => null)) as {
      id_token?: string;
      error?: string;
      error_description?: string;
    } | null;

    if (!tokenResponse.ok || !tokenData?.id_token) {
      console.error("[rmc-sso][token]", tokenResponse.status, tokenData);
      return createLoginErrorRedirect(requestUrl, tokenData?.error || "TokenExchangeFailed");
    }

    const claims = await verifyHs256Jwt(tokenData.id_token, clientSecret);
    const issuer = getSsoIssuer();
    const audience = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
    const now = Math.floor(Date.now() / 1000);

    if (claims.iss !== issuer || !audience.includes(getSsoClientId()) || !claims.exp || claims.exp <= now || !claims.sub) {
      return createLoginErrorRedirect(requestUrl, "InvalidIdToken");
    }

    const sessionValue = await createSessionCookieValue({
      id: claims.sub,
      name: claims.name ?? claims.email ?? claims.sub,
      email: claims.email ?? null,
    });
    const response = NextResponse.redirect(new URL(callbackUrl, requestUrl));

    response.cookies.set(sessionCookieName, sessionValue, getCookieOptions(getSessionCookieMaxAge()));
    response.cookies.set(ssoStateCookieName, "", getCookieOptions(0));
    response.cookies.set(ssoVerifierCookieName, "", getCookieOptions(0));
    response.cookies.set(ssoCallbackCookieName, "", getCookieOptions(0));

    return response;
  } catch (callbackError) {
    console.error("[rmc-sso][callback]", callbackError);
    return createLoginErrorRedirect(requestUrl, "CallbackFailed");
  }
}
