import { NextResponse } from "next/server";
import { createJob, listJobs } from "@/lib/job-store";

export const dynamic = "force-dynamic";

export async function GET() {
  const jobs = await listJobs();
  return NextResponse.json({ jobs });
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      roomName?: string;
      driver?: string;
      vehicle?: string;
      origin?: string;
      note?: string;
      registryKeys?: string[];
      itemScanQuantities?: Record<string, number>;
      destinationOverrides?: {
        id?: string;
        name?: string;
        address?: string;
        radiusMeters?: number;
      }[];
    };

    const job = await createJob({
      roomName: body.roomName ?? "",
      driver: body.driver ?? "",
      vehicle: body.vehicle ?? "",
      origin: body.origin ?? "",
      note: body.note ?? "",
      registryKeys: Array.isArray(body.registryKeys) ? body.registryKeys : [],
      itemScanQuantities: body.itemScanQuantities ?? {},
      destinationOverrides: Array.isArray(body.destinationOverrides)
        ? body.destinationOverrides
            .filter((destination) => destination.id?.trim())
            .map((destination) => ({
              id: destination.id!.trim(),
              name: destination.name,
              address: destination.address,
              radiusMeters: destination.radiusMeters,
            }))
        : [],
    });

    return NextResponse.json({ job });
  } catch (error) {
    const message = error instanceof Error ? error.message : "สร้าง Job ไม่สำเร็จ";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
