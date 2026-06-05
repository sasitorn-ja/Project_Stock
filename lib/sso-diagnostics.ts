type SsoDiagnosticItem = {
  label: string;
  value: string;
  ok: boolean;
};

import { appBasePath } from "@/lib/app-paths";
import { getAppBaseUrl, getSsoRedirectUri, getSsoWellKnownUrl } from "@/lib/rmc-sso";

export type SsoDiagnostics = {
  items: SsoDiagnosticItem[];
};

function formatUrl(value: string | undefined) {
  if (!value) {
    return "missing";
  }

  return value;
}

function classifyFetchError(error: unknown) {
  if (!(error instanceof Error)) {
    return `Unknown error: ${String(error)}`;
  }

  const message = error.message || "";
  const cause = (error as Error & { cause?: { code?: string; message?: string } }).cause;
  const code = cause?.code || "";

  // node fetch (undici) emits cause.code such as ENOTFOUND, ECONNREFUSED, UND_ERR_CONNECT_TIMEOUT
  if (code === "ENOTFOUND" || /ENOTFOUND/i.test(message)) {
    return "DNS resolve failed (ENOTFOUND) — server resolve โดเมน rmc-sso.cipcloud.net ไม่ออก ตรวจ DNS หรือ /etc/hosts";
  }

  if (code === "ECONNREFUSED" || /ECONNREFUSED/i.test(message)) {
    return "Connection refused — ปลายทางปิด port 443 หรือ firewall บล็อก";
  }

  if (code === "ETIMEDOUT" || /timeout/i.test(message) || code === "UND_ERR_CONNECT_TIMEOUT") {
    return "Connect timeout — outbound ไป rmc-sso ถูก firewall/proxy บล็อก หรือ network ไม่ออก";
  }

  if (code === "CERT_HAS_EXPIRED" || /certificate|cert|TLS|SSL/i.test(message)) {
    return `TLS/Certificate error: ${cause?.message || message}`;
  }

  if (code === "EAI_AGAIN") {
    return "DNS resolver ช้า/ไม่ตอบ (EAI_AGAIN)";
  }

  if (code) {
    return `fetch failed: ${code} (${cause?.message || message})`;
  }

  return `fetch failed: ${message}`;
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
      value: classifyFetchError(error),
    };
  }
}

export async function getSsoDiagnostics(): Promise<SsoDiagnostics> {
  const wellKnownUrl = getSsoWellKnownUrl();
  const wellKnownStatus = await checkWellKnownEndpoint(wellKnownUrl);
  const authUrlEnv = process.env.AUTH_URL?.trim() || process.env.UI_BASE_URL?.trim() || "";
  const authUrlResolved = getAppBaseUrl();
  const basePath = appBasePath;

  // basePath consistency check: ถ้าตั้ง basePath แล้ว AUTH_URL ต้องลงท้ายด้วย basePath ด้วย
  const authUrlHasBasePath =
    !basePath ||
    authUrlResolved.endsWith(basePath) ||
    authUrlResolved.endsWith(`${basePath}/`);

  const redirectUri = getSsoRedirectUri();
  const expectedRedirectStart = `${authUrlResolved.replace(/\/+$/, "")}/`;
  const redirectUriMatchesBase = redirectUri.startsWith(expectedRedirectStart);

  return {
    items: [
      {
        label: "NEXT_PUBLIC_BASE_PATH",
        value: basePath || "(empty)",
        ok: Boolean(basePath),
      },
      {
        label: "AUTH_URL",
        value: authUrlEnv
          ? `${formatUrl(authUrlEnv)}${authUrlHasBasePath ? "" : ` — ❌ ควรลงท้ายด้วย ${basePath}`}`
          : `(fallback) ${authUrlResolved}`,
        ok: Boolean(authUrlEnv) && authUrlEnv.startsWith("https://") && authUrlHasBasePath,
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
        value: `${redirectUri}${redirectUriMatchesBase ? "" : ` — ❌ ไม่ match กับ AUTH_URL (${authUrlResolved})`}`,
        ok: redirectUri.endsWith("/") && redirectUriMatchesBase,
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
