import { cookies } from "next/headers";
import { getSessionFromCookieValue, sessionCookieName, type AppSession } from "@/lib/rmc-session";

export async function auth(): Promise<AppSession | null> {
  const cookieStore = await cookies();
  return getSessionFromCookieValue(cookieStore.get(sessionCookieName)?.value);
}
