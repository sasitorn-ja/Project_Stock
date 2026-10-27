import { cookies, headers } from "next/headers";
import { getSessionFromCookieValue, sessionCookieName, type AppSession } from "@/lib/rmc-session";
import { getRemoteApiConfig, isLoopbackUrl, isRemoteDevMode } from "@/lib/remote-api-config";

export async function auth(): Promise<AppSession | null> {
  if (isRemoteDevMode()) {
    const host = (await headers()).get("host");
    if (!host || !isLoopbackUrl(`http://${host}`)) return null;
    getRemoteApiConfig();
    return {
      mode: "remote-development",
      user: { id: "remote-api-development", name: "Remote API (local)" },
      expiresAt: Math.floor(Date.now() / 1000) + 60 * 60,
    };
  }
  const cookieStore = await cookies();
  return getSessionFromCookieValue(cookieStore.get(sessionCookieName)?.value);
}
