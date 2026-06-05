export const appBasePath = (process.env.NEXT_PUBLIC_BASE_PATH || "").replace(/\/+$/, "");

export function withBasePath(path: string) {
  if (!appBasePath || /^https?:\/\//i.test(path)) {
    return path;
  }

  const normalizedPath = path.startsWith("/") ? path : `/${path}`;

  if (normalizedPath === appBasePath || normalizedPath.startsWith(`${appBasePath}/`)) {
    return normalizedPath;
  }

  return `${appBasePath}${normalizedPath}`;
}

export function withoutBasePath(pathname: string) {
  if (!appBasePath || pathname === appBasePath) {
    return pathname === appBasePath ? "/" : pathname;
  }

  if (pathname.startsWith(`${appBasePath}/`)) {
    return pathname.slice(appBasePath.length) || "/";
  }

  return pathname;
}

export function apiPath(path: string) {
  return withBasePath(path);
}
