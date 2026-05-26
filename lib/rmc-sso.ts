import { type ResponseCookie } from "next/dist/compiled/@edge-runtime/cookies";

export const rmcSsoProviderId = "rmc-sso";

export function getAppBaseUrl() {
  return (process.env.AUTH_URL || process.env.UI_BASE_URL || "http://localhost:3000").replace(/\/+$/, "");
}

export function getSsoRedirectUri() {
  return process.env.SSO_REDIRECT_URI || `${getAppBaseUrl()}/`;
}

export function getSsoIssuer() {
  return process.env.AUTH_RMC_SSO_ISSUER || process.env.SSO_ISSUER || "https://rmc-sso.cipcloud.net";
}

export function getSsoClientId() {
  return process.env.AUTH_RMC_SSO_CLIENT_ID || process.env.SSO_CLIENT_ID || "sync-drop";
}

export function getSsoClientSecret() {
  return process.env.AUTH_RMC_SSO_CLIENT_SECRET || process.env.SSO_CLIENT_SECRET || "";
}

export function getSsoAuthorizeUrl() {
  return process.env.SSO_AUTHORIZE_URL || `${getSsoIssuer()}/api/auth/oauth2/authorize`;
}

export function getSsoTokenUrl() {
  return process.env.SSO_TOKEN_URL || `${getSsoIssuer()}/api/auth/oauth2/token`;
}

export function getSsoWellKnownUrl() {
  return process.env.AUTH_RMC_SSO_WELL_KNOWN || `${getSsoIssuer()}/api/auth/.well-known/openid-configuration`;
}

export function getCookieOptions(maxAge?: number): Partial<ResponseCookie> {
  const secure = getAppBaseUrl().startsWith("https://");

  return {
    httpOnly: true,
    secure,
    sameSite: "lax",
    path: "/",
    ...(typeof maxAge === "number" ? { maxAge } : {}),
  };
}

export function normalizeInternalCallbackUrl(value: string | null | undefined) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) {
    return "/po";
  }

  if (value.startsWith("/api/")) {
    return "/po";
  }

  return value;
}
