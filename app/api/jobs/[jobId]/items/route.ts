import { NextResponse } from "next/server";
import { addPORecordsToJob } from "@/lib/job-store";

export const dynamic = "force-dynamic";

export async function POST(request: Request, context: { params: Promise<{ jobId: string }> }) {
  try {
    const { jobId } = await context.params;
    const body = (await request.json()) as {
      registryKeys?: string[];
      itemScanQuantities?: Record<string, number>;
      destinationAssignments?: Record<string, string>;
      destinationOverrides?: {
        id?: string;
        name?: string;
        address?: string;
        radiusMeters?: number;
      }[];
    };

    const job = await addPORecordsToJob({
      jobId,
      registryKeys: Array.isArray(body.registryKeys) ? body.registryKeys : [],
      itemScanQuantities: body.itemScanQuantities ?? {},
      destinationAssignments: body.destinationAssignments ?? {},
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
    const message = error instanceof Error ? error.message : "เพิ่ม PO เข้า Job ไม่สำเร็จ";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
