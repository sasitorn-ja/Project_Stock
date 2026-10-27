// Uses Web Crypto so the same policy can run in Next.js middleware and routes.
export function isRemoteApiPath(pathname: string) {
  return (
    pathname === "/api/jobs" || pathname.startsWith("/api/jobs/") ||
    pathname === "/api/po-registry" || pathname.startsWith("/api/po-registry/") ||
    pathname === "/api/reports/jobs/export" ||
    pathname === "/api/system/storage-status" ||
    pathname === "/api/system/token-check"
  );
}

export async function checkRemoteApiAccess(request: Request): Promise<200 | 401 | 403> {
  const configuredToken = process.env.Stock_API_TOKEN?.trim();
  const match = request.headers.get("authorization")?.match(/^Bearer\s+(\S+)$/i);
  if (!configuredToken || !match) return 401;

  const encoder = new TextEncoder();
  const [expected, supplied] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(configuredToken)),
    crypto.subtle.digest("SHA-256", encoder.encode(match[1])),
  ]);
  const a = new Uint8Array(expected);
  const b = new Uint8Array(supplied);
  let difference = 0;
  for (let index = 0; index < a.length; index++) difference |= a[index] ^ b[index];
  if (difference !== 0) return 401;

  const isRead = request.method === "GET" || request.method === "HEAD";
  return isRead || process.env.Stock_API_WRITE_ENABLED === "true" ? 200 : 403;
}
