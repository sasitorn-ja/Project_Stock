import { NextResponse } from "next/server";
import { auth } from "@/auth";

const publicPrefixes = ["/api/auth", "/login"];
const publicDriverActions = [
  /^\/api\/jobs\/[^/]+$/,
  /^\/api\/jobs\/[^/]+\/scan$/,
  /^\/api\/jobs\/[^/]+\/check-in-origin$/,
  /^\/api\/jobs\/[^/]+\/check-in-destination$/,
  /^\/api\/jobs\/[^/]+\/clear-unused-destination-check-in$/,
];

function isPublicPath(pathname: string) {
  return publicPrefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

function isAssetPath(pathname: string) {
  return (
    pathname.startsWith("/_next/") ||
    pathname === "/favicon.ico" ||
    pathname === "/logo.png" ||
    /\.(?:png|jpg|jpeg|gif|svg|ico|webp|css|js|map|txt|xml)$/i.test(pathname)
  );
}

function isDriverJobPage(pathname: string, searchParams: URLSearchParams) {
  return (pathname === "/driver" || pathname === "/driver-room") && Boolean(searchParams.get("jobId")?.trim());
}

function isPublicDriverApi(pathname: string, method: string) {
  if (method === "GET" && /^\/api\/jobs\/[^/]+$/.test(pathname)) {
    return true;
  }

  if (method !== "POST") {
    return false;
  }

  return publicDriverActions.some((pattern) => pattern.test(pathname));
}

function createLoginRedirect(requestUrl: URL) {
  const loginUrl = new URL("/login", requestUrl);
  const callbackPath = `${requestUrl.pathname}${requestUrl.search}`;

  if (callbackPath !== "/login") {
    loginUrl.searchParams.set("callbackUrl", callbackPath);
  }

  return NextResponse.redirect(loginUrl);
}

export default auth((request) => {
  const { nextUrl } = request;
  const pathname = nextUrl.pathname;
  const hasSession = Boolean(request.auth);

  if (isAssetPath(pathname) || isPublicPath(pathname) || isDriverJobPage(pathname, nextUrl.searchParams)) {
    if (pathname === "/login" && hasSession) {
      return NextResponse.redirect(new URL("/po", nextUrl));
    }

    return NextResponse.next();
  }

  if (pathname === "/driver-room") {
    return hasSession ? NextResponse.redirect(new URL("/po", nextUrl)) : createLoginRedirect(nextUrl);
  }

  if (pathname.startsWith("/api/")) {
    if (pathname === "/api/system/retention" || isPublicDriverApi(pathname, request.method)) {
      return NextResponse.next();
    }

    if (!hasSession) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    return NextResponse.next();
  }

  if (!hasSession) {
    return createLoginRedirect(nextUrl);
  }

  return NextResponse.next();
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
