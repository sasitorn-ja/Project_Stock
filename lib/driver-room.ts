import { withBasePath } from "@/lib/app-paths";

export function buildDriverRoomPath(jobId: string) {
  return `/driver-room?jobId=${encodeURIComponent(jobId)}`;
}

export function buildDriverRoomUrl(origin: string, jobId: string) {
  return new URL(withBasePath(buildDriverRoomPath(jobId)), origin).toString();
}
