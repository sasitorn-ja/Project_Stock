import { type JobRecord, type ScanMode } from "@/lib/jobs";

async function readResponse<T>(response: Response) {
  if (!response.ok) {
    const data = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(data?.error || `Request failed with status ${response.status}`);
  }

  return (await response.json()) as T;
}

export async function getJobs() {
  const data = await readResponse<{ jobs: JobRecord[] }>(
    await fetch("/api/jobs", {
      cache: "no-store",
    }),
  );

  return data.jobs;
}

export async function getJob(jobId: string) {
  const data = await readResponse<{ job: JobRecord | null }>(
    await fetch(`/api/jobs/${encodeURIComponent(jobId)}`, {
      cache: "no-store",
    }),
  );

  return data.job;
}

export async function createJob(input: {
  driver: string;
  vehicle: string;
  origin: string;
  note?: string;
  registryKeys: string[];
}) {
  const data = await readResponse<{ job: JobRecord }>(
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

export async function checkInJobOrigin(input: {
  jobId: string;
  latitude: number;
  longitude: number;
  accuracy?: number;
}) {
  const data = await readResponse<{ job: JobRecord }>(
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
  const data = await readResponse<{ job: JobRecord }>(
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

export async function submitJobScan(input: {
  jobId: string;
  code: string;
  mode: ScanMode;
  destinationId?: string;
}) {
  return readResponse<{
    job: JobRecord;
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
