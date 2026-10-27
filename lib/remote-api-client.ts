import { getRemoteApiConfig } from "@/lib/remote-api-config";
import { isRemoteApiPath } from "@/lib/remote-api-auth";

// Only imported by server modules. Credentials never enter client components.
export async function remoteApiRequest(path: string, init: RequestInit = {}) {
  const { base, token } = getRemoteApiConfig();
  const target = new URL(path.replace(/^\/+/, ""), base);
  if (target.origin !== base.origin || !target.pathname.startsWith(base.pathname) ||
      !isRemoteApiPath(`/api/${target.pathname.slice(base.pathname.length)}`)) {
    throw new Error("Remote API path must stay within the configured API");
  }
  const headers = new Headers();
  const contentType = new Headers(init.headers).get("content-type");
  if (contentType) headers.set("Content-Type", contentType);
  headers.set("Authorization", `Bearer ${token}`);
  return fetch(target, {
    ...init, headers, cache: "no-store", redirect: "manual",
    signal: AbortSignal.timeout(30000),
  });
}

export async function remoteApiJson<T>(path: string): Promise<T> {
  const response = await remoteApiRequest(path);
  if (!response.ok) throw new Error(`Remote API returned HTTP ${response.status}`);
  return response.json() as Promise<T>;
}
