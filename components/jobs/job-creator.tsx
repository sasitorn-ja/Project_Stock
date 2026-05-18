"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, FileWarning, MapPinned, Plus, Save, Truck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createJob } from "@/lib/job-db";
import { getExistingPORecords, type PORegistryRecord } from "@/lib/po-import-db";
import { cn } from "@/lib/utils";

const storageKey = "project-stock.selected-po-registry-keys";
type FieldErrors = Record<string, string>;
type DestinationDraft = { name: string; address: string };

function createDestinationId(name: string) {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9ก-๙]+/g, "-")
    .replace(/^-+|-+$/g, "") || "unknown-destination";
}

export function JobCreator() {
  const router = useRouter();
  const [records, setRecords] = useState<PORegistryRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [roomName, setRoomName] = useState("");
  const [driver, setDriver] = useState("");
  const [vehicle, setVehicle] = useState("");
  const [origin, setOrigin] = useState("DC Bangna");
  const [note, setNote] = useState("");
  const [destinationDrafts, setDestinationDrafts] = useState<Record<string, DestinationDraft>>({});
  const [destinationAssignments, setDestinationAssignments] = useState<Record<string, string>>({});
  const [scanQuantities, setScanQuantities] = useState<Record<string, number>>({});

  useEffect(() => {
    async function loadSelectedRecords() {
      setIsLoading(true);
      setError("");

      try {
        const rawKeys = window.sessionStorage.getItem(storageKey);
        const selectedKeys = rawKeys ? (JSON.parse(rawKeys) as string[]) : [];

        if (!selectedKeys.length) {
          setRecords([]);
          return;
        }

        const existingRecords = await getExistingPORecords(selectedKeys);
        const nextRecords = selectedKeys.map((key) => existingRecords.get(key)).filter(Boolean) as PORegistryRecord[];
        setRecords(nextRecords);
        setDestinationAssignments((currentAssignments) =>
          Object.fromEntries(
            nextRecords.map((record) => [
              record.registryKey,
              currentAssignments[record.registryKey] ?? createDestinationId(record.unitName.trim() || "ไม่ระบุปลายทาง"),
            ]),
          ),
        );
        setDestinationDrafts((currentDrafts) => {
          const nextDrafts = { ...currentDrafts };

          nextRecords.forEach((record) => {
            const name = record.unitName.trim() || "ไม่ระบุปลายทาง";
            const id = createDestinationId(name);
            nextDrafts[id] = nextDrafts[id] ?? { name, address: name };
          });

          return nextDrafts;
        });
        setScanQuantities((currentQuantities) =>
          Object.fromEntries(nextRecords.map((record) => [record.registryKey, currentQuantities[record.registryKey] ?? 1])),
        );
      } catch {
        setError("โหลดรายการ PO ที่เลือกไม่สำเร็จ กรุณากลับไปเลือกใหม่");
      } finally {
        setIsLoading(false);
      }
    }

    loadSelectedRecords();
  }, []);

  const groupedDestinations = useMemo(() => {
    const groups = new Map<string, { id: string; name: string; address: string; totalQty: number; poCount: number; records: PORegistryRecord[] }>();

    records.forEach((record) => {
      const fallbackName = record.unitName.trim() || "ไม่ระบุปลายทาง";
      const id = destinationAssignments[record.registryKey] || createDestinationId(fallbackName);
      const draft = destinationDrafts[id];
      const name = draft?.name || fallbackName;
      const address = draft?.address || name;
      const current = groups.get(id) ?? { id, name, address, totalQty: 0, poCount: 0, records: [] };
      current.totalQty += Number(record.orderQty.replace(/,/g, "")) || 0;
      current.poCount += 1;
      current.records.push(record);
      groups.set(id, current);
    });

    Object.entries(destinationDrafts).forEach(([id, draft]) => {
      if (!groups.has(id)) {
        groups.set(id, { id, name: draft.name, address: draft.address, totalQty: 0, poCount: 0, records: [] });
      }
    });

    return Array.from(groups.values()).sort((first, second) => {
      if (second.poCount !== first.poCount) {
        return second.poCount - first.poCount;
      }

      return first.name.localeCompare(second.name, "th");
    });
  }, [destinationAssignments, destinationDrafts, records]);

  const destinationNameByRecordKey = useMemo(() => {
    return Object.fromEntries(
      records.map((record) => {
        const fallbackName = record.unitName.trim() || "ไม่ระบุปลายทาง";
        const id = destinationAssignments[record.registryKey] || createDestinationId(fallbackName);
        return [record.registryKey, destinationDrafts[id]?.name || fallbackName];
      }),
    );
  }, [destinationAssignments, destinationDrafts, records]);

  function updateDestinationDraft(destinationId: string, field: "name" | "address", value: string) {
    clearFieldError(`destination.${destinationId}.${field}`);
    setDestinationDrafts((currentDrafts) => ({
      ...currentDrafts,
      [destinationId]: {
        name: currentDrafts[destinationId]?.name ?? "",
        address: currentDrafts[destinationId]?.address ?? "",
        [field]: value,
      },
    }));
  }

  function addDestinationGroup() {
    const nextNumber = Object.keys(destinationDrafts).filter((id) => id.startsWith("custom-destination-")).length + 1;
    const id = `custom-destination-${Date.now()}-${nextNumber}`;

    setDestinationDrafts((currentDrafts) => ({
      ...currentDrafts,
      [id]: {
        name: `ปลายทางใหม่ ${nextNumber}`,
        address: "",
      },
    }));
  }

  function assignRecordToDestination(registryKey: string, destinationId: string, checked: boolean) {
    clearFieldError(`assignment.${registryKey}`);
    setDestinationAssignments((currentAssignments) => ({
      ...currentAssignments,
      [registryKey]: checked ? destinationId : "",
    }));
  }

  function clearFieldError(field: string) {
    setFieldErrors((currentErrors) => {
      if (!currentErrors[field]) {
        return currentErrors;
      }

      const nextErrors = { ...currentErrors };
      delete nextErrors[field];
      return nextErrors;
    });
  }

  function getInputClassName(field: string, className?: string) {
    return cn(
      fieldErrors[field] &&
        "border-red-400 bg-red-50 text-red-900 placeholder:text-red-300 focus-visible:border-red-500 focus-visible:ring-red-500/20 dark:border-red-800 dark:bg-red-950/20 dark:text-red-100",
      className,
    );
  }

  function renderFieldError(field: string) {
    const message = fieldErrors[field];

    if (!message) {
      return null;
    }

    return <p className="text-xs font-medium text-red-600 dark:text-red-300">{message}</p>;
  }

  function validateJobDetails() {
    const nextErrors: FieldErrors = {};

    if (!roomName.trim()) {
      nextErrors.roomName = "กรุณากรอกชื่อห้อง Job";
    }

    if (!vehicle.trim()) {
      nextErrors.vehicle = "กรุณากรอกรถขนส่ง";
    }

    if (!driver.trim()) {
      nextErrors.driver = "กรุณากรอกชื่อคนขับ";
    }

    if (!origin.trim()) {
      nextErrors.origin = "กรุณากรอกต้นทาง";
    }

    groupedDestinations.forEach((destination) => {
      const draft = destinationDrafts[destination.id];

      if (!(draft?.name ?? destination.name).trim()) {
        nextErrors[`destination.${destination.id}.name`] = "กรุณากรอกชื่อปลายทาง";
      }

      if (!(draft?.address ?? destination.address).trim()) {
        nextErrors[`destination.${destination.id}.address`] = "กรุณากรอกที่อยู่หรือโลเคชัน";
      }
    });

    records.forEach((record) => {
      if (!destinationAssignments[record.registryKey]?.trim()) {
        nextErrors[`assignment.${record.registryKey}`] = "กรุณาเลือกปลายทางให้รายการนี้";
      }
    });

    return nextErrors;
  }

  async function handleCreateJob() {
    if (!records.length) {
      setError("ยังไม่มีรายการ PO ที่พร้อมสร้าง Job");
      return;
    }

    const nextFieldErrors = validateJobDetails();

    if (Object.keys(nextFieldErrors).length) {
      setFieldErrors(nextFieldErrors);
      setError("กรุณากรอกข้อมูลที่จำเป็นให้ครบก่อนสร้าง Job");
      return;
    }

    setIsSaving(true);
    setError("");
    setFieldErrors({});

    try {
      const job = await createJob({
        roomName,
        driver,
        vehicle,
        origin,
        note,
        registryKeys: records.map((record) => record.registryKey),
        itemScanQuantities: Object.fromEntries(
          records.map((record) => [record.registryKey, Math.max(0, Math.ceil(Number(scanQuantities[record.registryKey] ?? 1)))]),
        ),
        destinationAssignments,
        destinationOverrides: groupedDestinations.map((destination) => ({
          id: destination.id,
          name: destinationDrafts[destination.id]?.name ?? destination.name,
          address: destinationDrafts[destination.id]?.address ?? destination.address,
        })),
      });

      window.sessionStorage.removeItem(storageKey);
      window.sessionStorage.removeItem("project-stock.po-registry-list.v1");
      router.push(`/jobs/monitor?jobId=${encodeURIComponent(job.id)}`);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "สร้าง Job ไม่สำเร็จ");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <section className="grid gap-6 xl:grid-cols-[1fr_0.9fr]">
        <Card>
          <CardHeader>
            <CardTitle>รายการที่เลือกจาก PO รอจัดส่ง</CardTitle>
            <CardDescription>ระบบจะใช้รายการจริงเหล่านี้ไปสร้าง Job และตัดออกจากคิวรอจัดส่งทันที</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {isLoading ? (
              <div className="rounded-md border bg-slate-50 p-4 text-sm text-muted-foreground dark:bg-slate-900">
                กำลังโหลดรายการ PO ที่เลือก
              </div>
            ) : records.length ? (
              <>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="secondary">{records.length.toLocaleString("th-TH")} รายการ</Badge>
                  <Badge variant="secondary">{groupedDestinations.length.toLocaleString("th-TH")} ปลายทาง</Badge>
                </div>
                <div className="overflow-hidden rounded-md border">
                  <div className="hidden overflow-x-auto md:block">
                    <table className="w-full min-w-[980px] text-sm">
                      <thead className="bg-slate-50 text-left text-slate-500 dark:bg-slate-900 dark:text-slate-400">
                        <tr>
                          <th className="px-4 py-3 font-medium">PO SAP No.</th>
                          <th className="px-4 py-3 font-medium">Item</th>
                          <th className="px-4 py-3 font-medium">ปลายทาง</th>
                          <th className="px-4 py-3 font-medium">รหัสวัสดุ</th>
                          <th className="px-4 py-3 font-medium">ชื่อวัสดุ</th>
                          <th className="w-32 whitespace-nowrap px-4 py-3 font-medium">จำนวนในไฟล์</th>
                          <th className="w-40 whitespace-nowrap px-4 py-3 font-medium">จำนวนที่ต้องสแกน</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {records.map((record) => (
                          <tr key={record.registryKey}>
                            <td className="whitespace-nowrap px-4 py-3 align-top font-medium">{record.poSapNo}</td>
                            <td className="whitespace-nowrap px-4 py-3 align-top">{record.poSapItem}</td>
                            <td className="max-w-72 break-words px-4 py-3 align-top">
                              <span className="font-medium text-slate-900">{destinationNameByRecordKey[record.registryKey] || "-"}</span>
                              {record.unitName && record.unitName !== destinationNameByRecordKey[record.registryKey] ? (
                                <span className="mt-1 block text-xs text-muted-foreground">จากไฟล์: {record.unitName}</span>
                              ) : null}
                            </td>
                            <td className="whitespace-nowrap px-4 py-3 align-top">{record.materialCode || "-"}</td>
                            <td className="max-w-80 break-words px-4 py-3 align-top">{record.materialName || "-"}</td>
                            <td className="whitespace-nowrap px-4 py-3 align-top">{record.orderQty || "-"}</td>
                            <td className="px-4 py-3 align-top">
                              <Input
                                type="number"
                                min="0"
                                value={scanQuantities[record.registryKey] ?? 1}
                                onChange={(event) =>
                                  setScanQuantities((currentQuantities) => ({
                                    ...currentQuantities,
                                    [record.registryKey]: Math.max(0, Math.ceil(Number(event.target.value) || 0)),
                                  }))
                                }
                                className="h-9 w-28"
                              />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="divide-y md:hidden">
                    {records.map((record) => (
                      <div key={record.registryKey} className="space-y-3 p-3 text-sm">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="break-words font-semibold text-slate-950">{record.poSapNo}</p>
                            <p className="mt-0.5 text-xs text-muted-foreground">Item {record.poSapItem}</p>
                          </div>
                          <span className="shrink-0 rounded-md bg-slate-100 px-2 py-1 text-xs text-slate-600">
                            สแกน {scanQuantities[record.registryKey] ?? 1} รอบ
                          </span>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">ปลายทาง</p>
                          <p className="break-words">{destinationNameByRecordKey[record.registryKey] || "-"}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">จำนวนสั่งซื้อในไฟล์</p>
                          <p>{record.orderQty || "-"}</p>
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor={`scan-qty-${record.registryKey}`}>จำนวนที่ต้องสแกน</Label>
                          <Input
                            id={`scan-qty-${record.registryKey}`}
                            type="number"
                            min="0"
                            value={scanQuantities[record.registryKey] ?? 1}
                            onChange={(event) =>
                              setScanQuantities((currentQuantities) => ({
                                ...currentQuantities,
                                [record.registryKey]: Math.max(0, Math.ceil(Number(event.target.value) || 0)),
                              }))
                            }
                          />
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">วัสดุ</p>
                          <p className="break-words font-medium">{record.materialCode || "-"}</p>
                          <p className="mt-0.5 break-words text-muted-foreground">{record.materialName || "-"}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            ) : (
              <div className="space-y-3 rounded-md border bg-slate-50 p-6 text-sm text-muted-foreground dark:bg-slate-900">
                <div className="flex items-center gap-3">
                  <FileWarning className="h-5 w-5" />
                  <p>ยังไม่มีรายการ PO ที่ถูกเลือกจากหน้าคิวรอจัดส่ง</p>
                </div>
                <Button type="button" variant="outline" onClick={() => router.push("/po")}>
                  กลับไปเลือก PO
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>รายละเอียดงานขนส่ง</CardTitle>
          <CardDescription>กำหนดผู้รับผิดชอบงานจริง และปรับชื่อปลายทาง/ที่อยู่ก่อนบันทึกเข้าระบบ โดยค่าเริ่มต้นจะอ้างอิงจากชื่อหน่วยงานในไฟล์ GR</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-5 md:grid-cols-2">
            {error ? (
              <div className="md:col-span-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-950 dark:bg-red-950/30 dark:text-red-200">
                <div className="flex items-start gap-2">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  <p>{error}</p>
                </div>
              </div>
            ) : null}
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="room-name">ชื่อห้อง Job</Label>
              <Input
                id="room-name"
                value={roomName}
                aria-invalid={Boolean(fieldErrors.roomName)}
                onChange={(event) => {
                  clearFieldError("roomName");
                  setRoomName(event.target.value);
                }}
                placeholder="เช่น รอบเช้า บางซื่อ-ลาดพร้าว / ส่งของร้าน A"
                className={getInputClassName("roomName")}
              />
              {renderFieldError("roomName")}
            </div>
            <div className="space-y-2">
              <Label htmlFor="vehicle">รถขนส่ง</Label>
              <Input
                id="vehicle"
                value={vehicle}
                aria-invalid={Boolean(fieldErrors.vehicle)}
                onChange={(event) => {
                  clearFieldError("vehicle");
                  setVehicle(event.target.value);
                }}
                placeholder="เช่น 6W-4382"
                className={getInputClassName("vehicle")}
              />
              {renderFieldError("vehicle")}
            </div>
            <div className="space-y-2">
              <Label htmlFor="driver">คนขับ</Label>
              <Input
                id="driver"
                value={driver}
                aria-invalid={Boolean(fieldErrors.driver)}
                onChange={(event) => {
                  clearFieldError("driver");
                  setDriver(event.target.value);
                }}
                placeholder="ชื่อคนขับ"
                className={getInputClassName("driver")}
              />
              {renderFieldError("driver")}
            </div>
            <div className="space-y-2">
              <Label htmlFor="origin">ต้นทาง</Label>
              <Input
                id="origin"
                value={origin}
                aria-invalid={Boolean(fieldErrors.origin)}
                onChange={(event) => {
                  clearFieldError("origin");
                  setOrigin(event.target.value);
                }}
                className={getInputClassName("origin")}
              />
              {renderFieldError("origin")}
            </div>
            <div className="space-y-2">
              <Label>GPS ต้นทาง</Label>
              <div className="flex min-h-10 items-center rounded-md border bg-slate-50 px-3 text-sm text-muted-foreground dark:bg-slate-900">
                ระบบจะดึงจากมือถือของผู้เริ่มงานใน Driver Room เท่านั้น
              </div>
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="note">หมายเหตุ</Label>
              <Input id="note" value={note} onChange={(event) => setNote(event.target.value)} placeholder="ข้อมูลเสริมของงานนี้" />
            </div>
            <div className="md:col-span-2">
              <div className="rounded-lg border bg-slate-50 p-4 text-sm dark:bg-slate-900">
                <div className="flex items-center gap-2 font-medium">
                  <MapPinned className="h-4 w-4 text-cyan-700 dark:text-cyan-300" />
                  สรุปปลายทาง
                </div>
                <p className="mt-2 text-muted-foreground">พิมพ์ชื่อ/โลเคชันครั้งเดียวต่อปลายทาง แล้วติ๊กเลือกรายการ PO SAP No. ที่ต้องส่งไปจุดนั้น ระบบจะรวมเป็นปลายทางเดียวใน Driver Room</p>
                <div className="mt-3">
                  <Button type="button" variant="outline" size="sm" onClick={addDestinationGroup} className="gap-2">
                    <Plus className="h-4 w-4" />
                    เพิ่มปลายทาง
                  </Button>
                </div>
                <div className="mt-3 space-y-3">
                  {groupedDestinations.map((destination) => (
                    <div key={destination.id} className="space-y-3 rounded-md border bg-white px-3 py-3 dark:bg-slate-950">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="font-medium">{destinationDrafts[destination.id]?.name || destination.name}</p>
                          <p className="mt-1 text-xs text-muted-foreground">รหัสปลายทาง: {destination.id}</p>
                        </div>
                        <span className="shrink-0 text-muted-foreground">
                          {destination.poCount.toLocaleString("th-TH")} line / จำนวนในไฟล์ {destination.totalQty.toLocaleString("th-TH")}
                        </span>
                      </div>
                      <div className="grid gap-3 md:grid-cols-2">
                        <div className="space-y-2">
                          <Label htmlFor={`destination-name-${destination.id}`}>ชื่อปลายทาง</Label>
                          <Input
                            id={`destination-name-${destination.id}`}
                            value={destinationDrafts[destination.id]?.name ?? destination.name}
                            aria-invalid={Boolean(fieldErrors[`destination.${destination.id}.name`])}
                            onChange={(event) => updateDestinationDraft(destination.id, "name", event.target.value)}
                            placeholder="ชื่อปลายทางที่ใช้ในงานจริง"
                            className={getInputClassName(`destination.${destination.id}.name`)}
                          />
                          {renderFieldError(`destination.${destination.id}.name`)}
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor={`destination-address-${destination.id}`}>ที่อยู่ / โลเคชัน</Label>
                          <Input
                            id={`destination-address-${destination.id}`}
                            value={destinationDrafts[destination.id]?.address ?? destination.address}
                            aria-invalid={Boolean(fieldErrors[`destination.${destination.id}.address`])}
                            onChange={(event) => updateDestinationDraft(destination.id, "address", event.target.value)}
                            placeholder="อาคาร, จุดส่ง, หรือคำอธิบายสถานที่"
                            className={getInputClassName(`destination.${destination.id}.address`)}
                          />
                          {renderFieldError(`destination.${destination.id}.address`)}
                        </div>
                      </div>
                      <div className="rounded-md border border-slate-200 bg-slate-50 p-2">
                        <div className="mb-2 flex items-center justify-between gap-3">
                          <p className="text-xs font-semibold text-slate-700">ติ๊ก PO SAP No. เข้าปลายทางนี้</p>
                          <Badge variant={destination.poCount ? "success" : "secondary"}>
                            {destination.poCount.toLocaleString("th-TH")} รายการ
                          </Badge>
                        </div>
                        <div className="max-h-56 space-y-1 overflow-y-auto pr-1">
                          {records.map((record) => {
                            const checked = destinationAssignments[record.registryKey] === destination.id;
                            const assignedDestination = destinationAssignments[record.registryKey];
                            const assignedElsewhere = Boolean(assignedDestination && assignedDestination !== destination.id);

                            return (
                              <label
                                key={`${destination.id}-${record.registryKey}`}
                                className={`flex cursor-pointer items-start gap-2 rounded-md border px-2 py-2 text-xs ${
                                  checked
                                    ? "border-emerald-200 bg-emerald-50 text-emerald-950"
                                    : assignedElsewhere
                                      ? "border-slate-100 bg-white text-slate-400 hover:border-emerald-200"
                                      : "border-slate-200 bg-white text-slate-700 hover:border-emerald-200"
                                }`}
                              >
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={(event) => assignRecordToDestination(record.registryKey, destination.id, event.target.checked)}
                                  className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300"
                                />
                                <span className="min-w-0">
                                  <span className="block break-words font-semibold">
                                    {record.poSapNo} / Item {record.poSapItem}
                                  </span>
                                  <span className="mt-0.5 block break-words text-[11px] opacity-75">
                                    {record.materialCode || "-"} {record.materialName ? `/ ${record.materialName}` : ""}
                                  </span>
                                  {fieldErrors[`assignment.${record.registryKey}`] ? (
                                    <span className="mt-1 block text-[11px] font-medium text-red-600">
                                      {fieldErrors[`assignment.${record.registryKey}`]}
                                    </span>
                                  ) : null}
                                </span>
                              </label>
                            );
                          })}
                        </div>
                        <p className="mt-2 text-[11px] text-muted-foreground">ติ๊กที่ปลายทางใหม่เพื่อย้ายรายการ ระบบจะให้ 1 รายการอยู่ได้แค่ 1 ปลายทาง</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div className="md:col-span-2">
              <Button type="button" className="w-full" onClick={handleCreateJob} disabled={isLoading || isSaving || !records.length}>
                {isSaving ? (
                  <>กำลังบันทึก Job</>
                ) : (
                  <>
                    <Save className="mr-2 h-4 w-4" />
                    สร้าง Job จริงจากรายการที่เลือก
                  </>
                )}
              </Button>
            </div>
            <div className="md:col-span-2 rounded-lg border bg-cyan-50 p-4 text-sm text-cyan-800 dark:border-cyan-900 dark:bg-cyan-950/30 dark:text-cyan-200">
              <div className="flex items-center gap-2 font-medium">
                <Truck className="h-4 w-4" />
                หลังสร้างสำเร็จ
              </div>
              <p className="mt-2">ระบบจะพาไปหน้า Monitor ของ Job ทันที และต้องให้คนหน้างานเช็กอิน GPS ต้นทางจากมือถือก่อนเริ่มโหลดสินค้า</p>
            </div>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
