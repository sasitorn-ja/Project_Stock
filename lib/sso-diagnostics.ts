type SsoDiagnosticItem = {
  label: string;
  value: string;
  ok: boolean;
};

export type SsoDiagnostics = {
  items: SsoDiagnosticItem[];
};

function maskUrl(value: string | undefined) {
  if (!value) {
    return "missing";
  }

  try {
    const url = new URL(value);
    return url.origin;
  } catch {
    return value;
  }
}

function getWellKnownUrl() {
  return (
    process.env.AUTH_RMC_SSO_WELL_KNOWN ||
    `${process.env.AUTH_RMC_SSO_ISSUER || "https://rmc-sso.cipcloud.net"}/api/auth/.well-known/openid-configuration`
  );
}

async function checkWellKnownEndpoint(url: string) {
  try {
    const response = await fetch(url, {
      cache: "no-store",
    });

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
  const authUrl = process.env.AUTH_URL || process.env.NEXTAUTH_URL;
  const clientSecretConfigured = Boolean(process.env.AUTH_RMC_SSO_CLIENT_SECRET?.trim());

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
        value: process.env.AUTH_RMC_SSO_CLIENT_ID?.trim() || "missing",
        ok: Boolean(process.env.AUTH_RMC_SSO_CLIENT_ID?.trim()),
      },
      {
        label: "AUTH_RMC_SSO_CLIENT_SECRET",
        value: clientSecretConfigured ? "configured" : "missing",
        ok: clientSecretConfigured,
      },
      {
        label: "AUTH_RMC_SSO_ISSUER",
        value: process.env.AUTH_RMC_SSO_ISSUER?.trim() || "missing",
        ok: Boolean(process.env.AUTH_RMC_SSO_ISSUER?.trim()),
      },
      {
        label: "OIDC discovery",
        value: `${wellKnownUrl} -> ${wellKnownStatus.value}`,
        ok: wellKnownStatus.ok,
      },
    ],
  };
}
