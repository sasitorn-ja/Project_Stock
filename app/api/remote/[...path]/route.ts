import { NextResponse } from "next/server";
import { isRemoteApiPath } from "@/lib/remote-api-auth";
import { isLocalRemoteRequest, isRemoteDevMode } from "@/lib/remote-api-config";
import { remoteApiRequest } from "@/lib/remote-api-client";

export const dynamic = "force-dynamic";

async function proxy(request: Request, context: { params: Promise<{ path: string[] }> }) {
  if (!isRemoteDevMode() || !isLocalRemoteRequest(request)) {
    return NextResponse.json({ error: "Local remote development only" }, { status: 403 });
  }
  const { path } = await context.params;
  const pathname = `/api/${path.map(encodeURIComponent).join("/")}`;
  if (!isRemoteApiPath(pathname)) {
    return NextResponse.json({ error: "Endpoint is not available through the remote client" }, { status: 403 });
  }
  try {
    const upstream = await remoteApiRequest(pathname.slice(5) + new URL(request.url).search, {
      method: request.method,
      headers: request.headers,
      body: ["GET", "HEAD"].includes(request.method) ? undefined : await request.arrayBuffer(),
    });
    if (upstream.status >= 300 && upstream.status < 400) {
      return NextResponse.json({ error: "Remote API unexpectedly redirected" }, { status: 502 });
    }
    const headers = new Headers({ "Cache-Control": "no-store" });
    for (const name of ["content-type", "content-disposition"]) {
      const value = upstream.headers.get(name);
      if (value) headers.set(name, value);
    }
    return new Response(upstream.body, { status: upstream.status, headers });
  } catch {
    return NextResponse.json({ error: "Remote API unavailable; check remote env and connectivity" }, { status: 502 });
  }
}

export { proxy as GET, proxy as HEAD, proxy as POST, proxy as PUT, proxy as PATCH, proxy as DELETE };
