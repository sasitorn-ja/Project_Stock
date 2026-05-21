import { redirect } from "next/navigation";

export default async function JobHistoryPage({
  searchParams,
}: {
  searchParams: Promise<{
    jobId?: string;
    query?: string;
    dateFrom?: string;
    dateTo?: string;
  }>;
}) {
  const { jobId, query, dateFrom, dateTo } = await searchParams;
  const nextParams = new URLSearchParams({ status: "archived" });

  if (jobId) {
    nextParams.set("query", jobId);
  }
  if (query && !jobId) {
    nextParams.set("query", query);
  }
  if (dateFrom) {
    nextParams.set("dateFrom", dateFrom);
  }
  if (dateTo) {
    nextParams.set("dateTo", dateTo);
  }

  redirect(`/reports?${nextParams.toString()}`);
}
