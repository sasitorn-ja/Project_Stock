import { NextResponse } from "next/server";
import { withBasePath, withoutBasePath } from "@/lib/app-paths";
import { getSessionFromCookieValue, sessionCookieName } from "@/lib/rmc-session";
import { checkRemoteApiAccess, isRemoteApiPath } from "@/lib/remote-api-auth";
import { getRemoteApiConfig, isLocalRemoteRequest, isRemoteDevMode } from "@/lib/remote-api-config";

function isAssetPath(pathname: string) {
  return (
    pathname.startsWith("/_next/") ||
    pathname === "/favicon.ico" ||
    pathname === "/logo.png" ||
    /\.(?:png|jpg|jpeg|gif|svg|ico|webp|css|js|map|txt|xml)$/i.test(pathname)
  );
}

// public path ที่ไม่ต้อง login (เปิดให้ทุกคน)
function isPublicPath(pathname: string) {
  return (
    pathname === "/login" ||
    pathname.startsWith("/api/auth") // NextAuth route ต้องเข้าถึงได้เสมอ
  );
}

// path สำหรับคนขับที่เข้าระบบผ่าน QR/ลิงก์เฉพาะงาน ไม่ต้อง SSO
// คนขับเข้าถึงงานได้เฉพาะ jobId ที่ระบุใน URL เท่านั้น
function isDriverPath(pathname: string, hasJobId: boolean) {
  // /driver-room เป็นห้องคนขับโดยเฉพาะ (เปิดให้ทุกคน)
  if ((pathname === "/driver-room" || pathname.startsWith("/driver-room/")) && hasJobId) {
    return true;
  }
  // /driver ต้องมี jobId ใน query string เท่านั้นถึงเป็น driver mode
  // ถ้าไม่มี jobId แปลว่าเข้าจากเมนูหลังบ้าน ต้อง SSO
  if (pathname === "/driver" && hasJobId) {
    return true;
  }
  return false;
}

// API ที่ driver-scanner เรียกระหว่างทำงานในห้องคนขับ ต้องเปิด public ให้เรียกได้
// อนุญาตเฉพาะการเรียกที่ผูกกับ jobId (action endpoints + GET single job)
function isDriverApiPath(pathname: string, method: string) {
  // GET /api/jobs/<id> สำหรับโหลดข้อมูล job เดียว
  const jobDetailMatch = pathname.match(/^\/api\/jobs\/([^/]+)$/);
  if (jobDetailMatch && method === "GET") {
    return true;
  }
  // action endpoints ของ job
  const allowedActions = [
    "check-in-origin",
    "check-in-destination",
    "clear-unused-destination-check-in",
    "scan",
  ];
  const actionMatch = pathname.match(/^\/api\/jobs\/([^/]+)\/([^/]+)$/);
  if (actionMatch && allowedActions.includes(actionMatch[2])) {
    return true;
  }
  return false;
}

export default async function middleware(request: Request & { nextUrl: URL; cookies: { get: (name: string) => { value?: string } | undefined } }) {
  const { nextUrl, method } = request;
  const pathname = withoutBasePath(nextUrl.pathname);
  const hasJobId = Boolean(nextUrl.searchParams.get("jobId")?.trim());

  if (isRemoteDevMode()) {
    if (!isLocalRemoteRequest(request)) {
      return NextResponse.json({ error: "Remote development accepts same-origin loopback requests only" }, { status: 403 });
    }
    try {
      getRemoteApiConfig();
    } catch {
      return NextResponse.json({ error: "Invalid remote API configuration; start with npm run dev:remote" }, { status: 503 });
    }
    if (pathname === "/login" || pathname.startsWith("/api/auth/")) {
      return NextResponse.redirect(new URL(withBasePath("/po"), nextUrl));
    }
    if (isRemoteApiPath(pathname)) {
      const proxyUrl = new URL(nextUrl);
      proxyUrl.pathname = withBasePath(`/api/remote/${pathname.slice(5)}`);
      return NextResponse.rewrite(proxyUrl);
    }
    if (pathname.startsWith("/api/") && !pathname.startsWith("/api/remote/") && pathname !== "/api/system/health") {
      return NextResponse.json({ error: "Endpoint is unavailable in remote development" }, { status: 403 });
    }
    return NextResponse.next();
  }

  if (pathname === "/api/system/health" && (method === "GET" || method === "HEAD")) {
    return NextResponse.next();
  }

  // Check explicit API credentials before public driver routes or SSO cookies.
  // A rejected token must never fall through to another authentication method.
  if (isRemoteApiPath(pathname) && request.headers.has("authorization")) {
    const status = await checkRemoteApiAccess(request);
    if (status !== 200) {
      return NextResponse.json({ error: status === 401 ? "Unauthorized" : "Write access disabled" }, { status });
    }
    return NextResponse.next();
  }

  // This diagnostic always requires a token, even with an SSO session.
  if (pathname === "/api/system/token-check") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const session = await getSessionFromCookieValue(request.cookies.get(sessionCookieName)?.value);

  if (isAssetPath(pathname)) {
    return NextResponse.next();
  }

  if (pathname === "/" && (nextUrl.searchParams.has("code") || nextUrl.searchParams.has("error"))) {
    return NextResponse.next();
  }

  // ถ้า login แล้วเข้าหน้า /login ให้ส่งไป /po
  if (pathname === "/login" && session) {
    return NextResponse.redirect(new URL(withBasePath("/po"), nextUrl));
  }

  if (isPublicPath(pathname)) {
    return NextResponse.next();
  }

  // driver flow: เข้าหน้าผ่าน QR/ลิงก์เฉพาะงาน ไม่ต้อง SSO
  if (isDriverPath(pathname, hasJobId)) {
    return NextResponse.next();
  }

  // API ที่ driver ต้องเรียก (GET job เดียว, check-in, scan ฯลฯ)
  if (isDriverApiPath(pathname, method)) {
    return NextResponse.next();
  }

  if (pathname === "/api/system/retention") {
    return NextResponse.next();
  }

  // ยังไม่ login → redirect ไป /login พร้อม callbackUrl
  if (!session) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const loginUrl = new URL(withBasePath("/login"), nextUrl);
    loginUrl.searchParams.set("callbackUrl", pathname + nextUrl.search);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
