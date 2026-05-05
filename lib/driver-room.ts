export function buildDriverRoomPath(jobId: string) {
  return `/driver-room?jobId=${encodeURIComponent(jobId)}`;
}

export function buildDriverRoomUrl(origin: string, jobId: string) {
  return new URL(buildDriverRoomPath(jobId), origin).toString();
}
