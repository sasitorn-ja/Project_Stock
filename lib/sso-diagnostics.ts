type SsoDiagnosticItem = {
  label: string;
  value: string;
  ok: boolean;
};

import { getAppBaseUrl, getSsoRedirectUri, getSsoWellKnownUrl } from "@/lib/rmc-sso";

export type SsoDiagnostics = {
  items: SsoDiagnosticItem[];
};

function maskUrl(value: string | undefined) {
  if (!value) {
    return "missing";
  }

  try {
    return new URL(value).origin;
  } catch {
    return value;
  }
}

function getWellKnownUrl() {
  return getSsoWellKnownUrl();
}

async function checkWellKnownEndpoint(url: string) {
  try {
    const response = await fetch(url, { cache: "no-store" });
    return {
      ok: response.ok,
      value: `${response.status} ${response.statusText || ""}`.trim(),
    };
  } catch (error) {
    return {
      ok: false,
      value: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function getSsoDiagnostics(): Promise<SsoDiagnostics> {
  const wellKnownUrl = getWellKnownUrl();
  const wellKnownStatus = await checkWellKnownEndpoint(wellKnownUrl);
  const authUrl = getAppBaseUrl();

  return {
    items: [
      {
        label: "AUTH_URL",
        value: maskUrl(authUrl),
        ok: Boolean(authUrl?.startsWith("https://")),
      },
      {
        label: "AUTH_SECRET",
        value: process.env.AUTH_SECRET?.trim() ? "configured" : "missing",
        ok: Boolean(process.env.AUTH_SECRET?.trim()),
      },
      {
        label: "AUTH_RMC_SSO_CLIENT_ID",
        value: process.env.AUTH_RMC_SSO_CLIENT_ID?.trim() || "fallback: sync-drop",
        ok: true,
      },
      {
        label: "AUTH_RMC_SSO_CLIENT_SECRET",
        value: process.env.AUTH_RMC_SSO_CLIENT_SECRET?.trim() ? "configured" : "missing",
        ok: Boolean(process.env.AUTH_RMC_SSO_CLIENT_SECRET?.trim()),
      },
      {
        label: "SSO_REDIRECT_URI",
        value: getSsoRedirectUri(),
        ok: getSsoRedirectUri().endsWith("/"),
      },
      {
        label: "AUTH_RMC_SSO_ISSUER",
        value: process.env.AUTH_RMC_SSO_ISSUER?.trim() || "fallback: https://rmc-sso.cipcloud.net",
        ok: true,
      },
      {
        label: "OIDC discovery",
        value: `${wellKnownUrl} -> ${wellKnownStatus.value}`,
        ok: wellKnownStatus.ok,
      },
    ],
  };
}
