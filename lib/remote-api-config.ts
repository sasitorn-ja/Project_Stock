export function isRemoteDevMode() {
  return process.env.NODE_ENV === "development" && process.env.Stock_API_MODE === "remote";
}

export function isLoopbackUrl(value: string) {
  try {
    return ["localhost", "127.0.0.1", "[::1]"].includes(new URL(value).hostname);
  } catch {
    return false;
  }
}

export function isLocalRemoteRequest(request: Request) {
  if (!isLoopbackUrl(request.url)) return false;
  const url = new URL(request.url);
  const host = request.headers.get("host");
  if (host && !isLoopbackUrl(`${url.protocol}//${host}`)) return false;
  if (request.headers.get("sec-fetch-site") === "cross-site") return false;
  const origin = request.headers.get("origin");
  return !origin || origin === (host ? `${url.protocol}//${host}` : url.origin);
}

export function getRemoteApiConfig() {
  if (!isRemoteDevMode()) throw new Error("Remote API client is only available in development mode");
  const token = process.env.Stock_API_TOKEN?.trim();
  const value = process.env.Stock_API_BASE_URL?.trim();
  if (!token || !value) throw new Error("Missing Stock_API_BASE_URL or Stock_API_TOKEN");
  const base = new URL(value.replace(/\/+$/, "") + "/");
  if (base.protocol !== "https:" || base.username || base.password || base.search || base.hash || !base.pathname.endsWith("/api/")) {
    throw new Error("Stock_API_BASE_URL must be an HTTPS API URL ending in /api");
  }
  return { base, token };
}
