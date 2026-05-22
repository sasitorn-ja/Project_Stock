import { type JobSummaryRecord, type ScanMode } from "@/lib/jobs";

async function readResponse<T>(response: Response) {
  if (!response.ok) {
    const data = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(data?.error || `Request failed with status ${response.status}`);
  }

  return (await response.json()) as T;
}

export async function getJobs() {
  const data = await readResponse<{ jobs: JobSummaryRecord[] }>(
    await fetch("/api/jobs", {
      cache: "no-store",
    }),
  );

  return data.jobs;
}

export async function getJob(jobId: string) {
  const data = await readResponse<{ job: JobSummaryRecord | null }>(
    await fetch(`/api/jobs/${encodeURIComponent(jobId)}`, {
      cache: "no-store",
    }),
  );

  return data.job;
}

export async function createJob(input: {
  roomName?: string;
  driver: string;
  vehicle: string;
  origin: string;
  note?: string;
  registryKeys: string[];
  itemScanQuantities?: Record<string, number>;
  destinationAssignments?: Record<string, string>;
  destinationOverrides?: {
    id: string;
    name?: string;
    address?: string;
    radiusMeters?: number;
  }[];
}) {
  const data = await readResponse<{ job: JobSummaryRecord }>(
    await fetch("/api/jobs", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(input),
    }),
  );

  return data.job;
}

export async function updateJobItemScanQuantity(input: {
  jobId: string;
  registryKey: string;
  scanQty: number;
}) {
  const data = await readResponse<{ job: JobSummaryRecord }>(
    await fetch(`/api/jobs/${encodeURIComponent(input.jobId)}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        registryKey: input.registryKey,
        scanQty: input.scanQty,
      }),
    }),
  );

  return data.job;
}

export async function updateJobDestinationOverride(input: {
  jobId: string;
  allowDestinationBeforeFullyLoaded: boolean;
}) {
  const data = await readResponse<{ job: JobSummaryRecord }>(
    await fetch(`/api/jobs/${encodeURIComponent(input.jobId)}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        allowDestinationBeforeFullyLoaded: input.allowDestinationBeforeFullyLoaded,
      }),
    }),
  );

  return data.job;
}

export async function updateJobOriginOverride(input: {
  jobId: string;
  allowOriginRecheckAfterLocked: boolean;
}) {
  const data = await readResponse<{ job: JobSummaryRecord }>(
    await fetch(`/api/jobs/${encodeURIComponent(input.jobId)}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        allowOriginRecheckAfterLocked: input.allowOriginRecheckAfterLocked,
      }),
    }),
  );

  return data.job;
}

export async function deleteJob(jobId: string) {
  await readResponse<{ ok: true }>(
    await fetch(`/api/jobs/${encodeURIComponent(jobId)}`, {
      method: "DELETE",
    }),
  );
}

export async function addPORecordsToJob(input: {
  jobId: string;
  registryKeys: string[];
  itemScanQuantities?: Record<string, number>;
  destinationAssignments?: Record<string, string>;
  destinationOverrides?: {
    id: string;
    name?: string;
    address?: string;
    radiusMeters?: number;
  }[];
}) {
  const data = await readResponse<{ job: JobSummaryRecord }>(
    await fetch(`/api/jobs/${encodeURIComponent(input.jobId)}/items`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(input),
    }),
  );

  return data.job;
}

export async function checkInJobOrigin(input: {
  jobId: string;
  latitude: number;
  longitude: number;
  accuracy?: number;
}) {
  const data = await readResponse<{ job: JobSummaryRecord }>(
    await fetch(`/api/jobs/${encodeURIComponent(input.jobId)}/check-in-origin`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(input),
    }),
  );

  return data.job;
}

export async function checkInJobDestination(input: {
  jobId: string;
  destinationId: string;
  latitude: number;
  longitude: number;
  accuracy?: number;
}) {
  const data = await readResponse<{ job: JobSummaryRecord }>(
    await fetch(`/api/jobs/${encodeURIComponent(input.jobId)}/check-in-destination`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(input),
    }),
  );

  return data.job;
}

export async function clearUnusedDestinationCheckIn(input: {
  jobId: string;
  destinationId: string;
  nextDestinationId?: string;
}) {
  return readResponse<{
    job: JobSummaryRecord;
    cleared: boolean;
    message: string;
  }>(
    await fetch(`/api/jobs/${encodeURIComponent(input.jobId)}/clear-unused-destination-check-in`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(input),
    }),
  );
}

export async function submitJobScan(input: {
  jobId: string;
  code: string;
  mode: ScanMode;
  destinationId?: string;
}) {
  return readResponse<{
    job: JobSummaryRecord;
    result: "ok" | "alert";
    message: string;
  }>(
    await fetch(`/api/jobs/${encodeURIComponent(input.jobId)}/scan`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(input),
    }),
  );
}
