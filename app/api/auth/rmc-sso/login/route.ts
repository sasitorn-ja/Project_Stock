import { NextResponse } from "next/server";
import {
  getCookieOptions,
  getSsoAuthorizeUrl,
  getSsoClientId,
  getSsoRedirectUri,
  normalizeInternalCallbackUrl,
} from "@/lib/rmc-sso";
import {
  createPkceChallenge,
  createRandomBase64Url,
  ssoCallbackCookieName,
  ssoStateCookieName,
  ssoVerifierCookieName,
} from "@/lib/rmc-session";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const callbackUrl = normalizeInternalCallbackUrl(requestUrl.searchParams.get("callbackUrl"));
  const state = createRandomBase64Url();
  const verifier = createRandomBase64Url();
  const challenge = await createPkceChallenge(verifier);
  const authorizeUrl = new URL(getSsoAuthorizeUrl());

  authorizeUrl.searchParams.set("client_id", getSsoClientId());
  authorizeUrl.searchParams.set("redirect_uri", getSsoRedirectUri());
  authorizeUrl.searchParams.set("response_type", "code");
  authorizeUrl.searchParams.set("scope", "openid profile email offline_access");
  authorizeUrl.searchParams.set("state", state);
  authorizeUrl.searchParams.set("code_challenge", challenge);
  authorizeUrl.searchParams.set("code_challenge_method", "S256");

  const response = NextResponse.redirect(authorizeUrl);
  const temporaryCookieOptions = getCookieOptions(10 * 60);

  response.cookies.set(ssoStateCookieName, state, temporaryCookieOptions);
  response.cookies.set(ssoVerifierCookieName, verifier, temporaryCookieOptions);
  response.cookies.set(ssoCallbackCookieName, callbackUrl, temporaryCookieOptions);

  return response;
}
