"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, ClipboardCheck, FileWarning, HelpCircle, Lightbulb, MapPinned, Plus, Save, Truck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { QuantityStepper } from "@/components/ui/quantity-stepper";
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
  const [destinationOrder, setDestinationOrder] = useState<string[]>([]);
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
        const readyRecords = nextRecords.filter((record) => record.lifecycle === "active" && !record.assignedJobId);

        if (selectedKeys.length && !readyRecords.length) {
          window.sessionStorage.removeItem(storageKey);
          setRecords([]);
          setError("รายการ PO ที่เลือกไว้ถูกใช้สร้าง Job แล้ว หรือไม่พร้อมสร้างงาน กรุณากลับไปเลือก PO ใหม่");
          return;
        }

        setRecords(readyRecords);
        setDestinationAssignments((currentAssignments) =>
          Object.fromEntries(
            readyRecords.map((record) => [
              record.registryKey,
              currentAssignments[record.registryKey] ?? createDestinationId(record.unitName.trim() || "ไม่ระบุปลายทาง"),
            ]),
          ),
        );
        setDestinationDrafts((currentDrafts) => {
          const nextDrafts = { ...currentDrafts };
          const nextOrder: string[] = [];

          readyRecords.forEach((record) => {
            const name = record.unitName.trim() || "ไม่ระบุปลายทาง";
            const id = createDestinationId(name);
            nextDrafts[id] = nextDrafts[id] ?? { name, address: name };

            if (!nextOrder.includes(id)) {
              nextOrder.push(id);
            }
          });

          setDestinationOrder((currentOrder) => {
            const knownIds = new Set(Object.keys(nextDrafts));
            const preservedOrder = currentOrder.filter((id) => knownIds.has(id));
            const missingIds = nextOrder.filter((id) => !preservedOrder.includes(id));

            return [...preservedOrder, ...missingIds];
          });

          return nextDrafts;
        });
        setScanQuantities((currentQuantities) =>
          Object.fromEntries(readyRecords.map((record) => [record.registryKey, currentQuantities[record.registryKey] ?? 1])),
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
      const firstIndex = destinationOrder.indexOf(first.id);
      const secondIndex = destinationOrder.indexOf(second.id);

      if (firstIndex !== -1 || secondIndex !== -1) {
        return (firstIndex === -1 ? Number.MAX_SAFE_INTEGER : firstIndex) - (secondIndex === -1 ? Number.MAX_SAFE_INTEGER : secondIndex);
      }

      return first.name.localeCompare(second.name, "th");
    });
  }, [destinationAssignments, destinationDrafts, destinationOrder, records]);

  const destinationNameByRecordKey = useMemo(() => {
    return Object.fromEntries(
      records.map((record) => {
        const fallbackName = record.unitName.trim() || "ไม่ระบุปลายทาง";
        const id = destinationAssignments[record.registryKey] || createDestinationId(fallbackName);
        return [record.registryKey, destinationDrafts[id]?.name || fallbackName];
      }),
    );
  }, [destinationAssignments, destinationDrafts, records]);

  function updateScanQuantity(registryKey: string, value: number) {
    setScanQuantities((currentQuantities) => ({
      ...currentQuantities,
      [registryKey]: Math.max(0, Math.ceil(value || 0)),
    }));
  }

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
    setDestinationOrder((currentOrder) => [...currentOrder, id]);
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
      nextErrors.roomName = "กรุณากรอกชื่อห้องงาน";
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
      if (destination.poCount <= 0) {
        return;
      }

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
      setError("ยังไม่มีรายการ PO ที่พร้อมสร้างงาน");
      return;
    }

    const nextFieldErrors = validateJobDetails();

    if (Object.keys(nextFieldErrors).length) {
      setFieldErrors(nextFieldErrors);
      setError("กรุณากรอกข้อมูลที่จำเป็นให้ครบก่อนสร้างงาน");
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
        destinationOverrides: groupedDestinations
          .filter((destination) => destination.poCount > 0)
          .map((destination) => ({
            id: destination.id,
            name: destinationDrafts[destination.id]?.name ?? destination.name,
            address: destinationDrafts[destination.id]?.address ?? destination.address,
          })),
      });

      window.sessionStorage.removeItem(storageKey);
      window.sessionStorage.removeItem("project-stock.po-registry-list.v1");
      router.push(`/jobs/monitor?jobId=${encodeURIComponent(job.id)}`);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "สร้างงานไม่สำเร็จ");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="space-y-4 pb-6">
      {error ? (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-950 dark:bg-red-950/30 dark:text-red-200">
          <div className="flex items-start gap-2">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <p>{error}</p>
          </div>
        </div>
      ) : null}

      <Card className="min-w-0 overflow-hidden">
        <CardHeader className="px-5 py-4 sm:px-6 sm:py-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <CardTitle className="flex items-center gap-2">
                <Truck className="h-4 w-4 text-cyan-700 dark:text-cyan-300" />
                รายละเอียดงานขนส่ง
              </CardTitle>
              <CardDescription className="mt-1">
                กำหนดผู้รับผิดชอบงานจริง และต้นทาง — ปลายทางจะใช้ตามไฟล์ GR โดยอัตโนมัติ
              </CardDescription>
            </div>
            <Badge variant="secondary" className="shrink-0">ขั้นที่ 1 จาก 2</Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-3 px-5 py-4 sm:px-6">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-1.5">
              <Label htmlFor="room-name">ชื่อห้องงาน</Label>
              <Input
                id="room-name"
                value={roomName}
                aria-invalid={Boolean(fieldErrors.roomName)}
                onChange={(event) => {
                  clearFieldError("roomName");
                  setRoomName(event.target.value);
                }}
                placeholder="เช่น รอบเช้า บางซื่อ"
                className={getInputClassName("roomName")}
              />
              {renderFieldError("roomName")}
            </div>
            <div className="space-y-1.5">
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
            <div className="space-y-1.5">
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
            <div className="space-y-1.5">
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
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>GPS ต้นทาง</Label>
              <div className="flex min-h-10 items-center rounded-md border bg-slate-50 px-3 text-sm text-muted-foreground dark:bg-slate-900">
                ระบบจะดึงจากมือถือของผู้เริ่มงานในห้องคนขับเท่านั้น
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="note">หมายเหตุ</Label>
              <Input id="note" value={note} onChange={(event) => setNote(event.target.value)} placeholder="ข้อมูลเสริมของงานนี้" />
            </div>
          </div>
        </CardContent>
      </Card>

      {isLoading ? (
        <Card>
          <CardContent className="px-5 py-4 sm:px-6">
            <div className="rounded-md border bg-slate-50 p-4 text-sm text-muted-foreground dark:bg-slate-900">
              กำลังโหลดรายการ PO ที่เลือก
            </div>
          </CardContent>
        </Card>
      ) : records.length ? (
        <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] xl:items-start">
          <Card className="min-w-0 overflow-hidden">
            <CardHeader className="px-5 py-4 sm:px-6 sm:py-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <CardTitle className="flex items-center gap-2">
                    <ClipboardCheck className="h-4 w-4 text-cyan-700 dark:text-cyan-300" />
                    รายการที่เลือกจาก PO รอจัดส่ง
                  </CardTitle>
                  <CardDescription className="mt-1">ปรับจำนวนที่ต้องสแกนได้ก่อนยืนยันสร้างงาน</CardDescription>
                </div>
                <div className="flex shrink-0 flex-wrap items-center gap-2">
                  <Badge variant="secondary">{records.length.toLocaleString("th-TH")} รายการ</Badge>
                  <Badge variant="secondary">{groupedDestinations.length.toLocaleString("th-TH")} ปลายทาง</Badge>
                </div>
              </div>
            </CardHeader>
            <CardContent className="px-5 py-4 sm:px-6">
              <div className="overflow-hidden rounded-md border">
                <div className="hidden overflow-x-auto lg:block">
                  <table className="w-full min-w-[760px] text-sm">
                    <thead className="bg-slate-50 text-left text-slate-500 dark:bg-slate-900 dark:text-slate-400">
                      <tr>
                        <th className="px-3 py-3 font-medium">PO SAP No.</th>
                        <th className="px-3 py-3 font-medium">Item</th>
                        <th className="px-3 py-3 font-medium">ปลายทาง</th>
                        <th className="px-3 py-3 font-medium">รหัสวัสดุ</th>
                        <th className="px-3 py-3 font-medium">ชื่อวัสดุ</th>
                        <th className="w-24 whitespace-nowrap px-3 py-3 font-medium">ในไฟล์</th>
                        <th className="w-36 whitespace-nowrap px-3 py-3 font-medium">ที่ต้องสแกน</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {records.map((record) => (
                        <tr key={record.registryKey}>
                          <td className="whitespace-nowrap px-3 py-3 align-top font-medium">{record.poSapNo}</td>
                          <td className="whitespace-nowrap px-3 py-3 align-top">{record.poSapItem}</td>
                          <td className="max-w-56 break-words px-3 py-3 align-top">
                            <span className="font-medium text-slate-900">{destinationNameByRecordKey[record.registryKey] || "-"}</span>
                            {record.unitName && record.unitName !== destinationNameByRecordKey[record.registryKey] ? (
                              <span className="mt-1 block text-xs text-muted-foreground">จากไฟล์: {record.unitName}</span>
                            ) : null}
                          </td>
                          <td className="whitespace-nowrap px-3 py-3 align-top">{record.materialCode || "-"}</td>
                          <td className="max-w-64 break-words px-3 py-3 align-top">{record.materialName || "-"}</td>
                          <td className="whitespace-nowrap px-3 py-3 align-top">{record.orderQty || "-"}</td>
                          <td className="px-3 py-3 align-top">
                            <QuantityStepper
                              value={scanQuantities[record.registryKey] ?? 1}
                              min={0}
                              onChange={(value) => updateScanQuantity(record.registryKey, value)}
                              className="w-36"
                              inputClassName="h-9 text-sm"
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="divide-y lg:hidden">
                  {records.map((record) => (
                    <div key={record.registryKey} className="space-y-3 p-4 text-sm">
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
                        <QuantityStepper
                          id={`scan-qty-${record.registryKey}`}
                          value={scanQuantities[record.registryKey] ?? 1}
                          min={0}
                          onChange={(value) => updateScanQuantity(record.registryKey, value)}
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
            </CardContent>
          </Card>

          <Card className="min-w-0 overflow-hidden xl:sticky xl:top-4">
            <CardHeader className="px-5 py-4 sm:px-6 sm:py-4">
              <div className="flex items-center justify-between gap-3">
                <CardTitle className="flex items-center gap-2">
                  <MapPinned className="h-4 w-4 text-cyan-700 dark:text-cyan-300" />
                  สรุปปลายทาง
                </CardTitle>
                <Badge variant="secondary" className="shrink-0">
                  {groupedDestinations.length.toLocaleString("th-TH")} จุด
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-3 px-5 py-4 sm:px-6">
              <div className="flex items-start gap-2 rounded-md border border-cyan-200 bg-cyan-50 px-3 py-2 text-xs text-cyan-800 dark:border-cyan-900 dark:bg-cyan-950/30 dark:text-cyan-200">
                <Lightbulb className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>1 งานขนส่ง = ส่งของไป 1+ จุด เพิ่มปลายทางที่นี่ได้ตามจริง</span>
              </div>

              <div className="space-y-3">
                {groupedDestinations.map((destination, index) => (
                  <div key={destination.id} className="min-w-0 space-y-3 rounded-md border bg-white px-3 py-3 dark:bg-slate-950">
                    <div className="flex items-start gap-2">
                      <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-cyan-100 text-xs font-semibold text-cyan-800 dark:bg-cyan-900 dark:text-cyan-200">
                        {index + 1}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="break-words text-sm font-medium">
                          {destinationDrafts[destination.id]?.name || destination.name}
                        </p>
                        <p className="mt-0.5 text-[11px] text-muted-foreground">
                          {destination.poCount.toLocaleString("th-TH")} รายการ · จำนวนในไฟล์ {destination.totalQty.toLocaleString("th-TH")}
                        </p>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <div className="space-y-1.5">
                        <Label htmlFor={`destination-name-${destination.id}`} className="text-xs">ชื่อปลายทาง</Label>
                        <Input
                          id={`destination-name-${destination.id}`}
                          value={destinationDrafts[destination.id]?.name ?? destination.name}
                          aria-invalid={Boolean(fieldErrors[`destination.${destination.id}.name`])}
                          onChange={(event) => updateDestinationDraft(destination.id, "name", event.target.value)}
                          placeholder="ชื่อปลายทางที่ใช้ในงานจริง"
                          className={getInputClassName(`destination.${destination.id}.name`, "h-9 text-sm")}
                        />
                        {renderFieldError(`destination.${destination.id}.name`)}
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor={`destination-address-${destination.id}`} className="text-xs">ที่อยู่ / โลเคชัน</Label>
                        <Input
                          id={`destination-address-${destination.id}`}
                          value={destinationDrafts[destination.id]?.address ?? destination.address}
                          aria-invalid={Boolean(fieldErrors[`destination.${destination.id}.address`])}
                          onChange={(event) => updateDestinationDraft(destination.id, "address", event.target.value)}
                          placeholder="อาคาร, จุดส่ง, หรือคำอธิบายสถานที่"
                          className={getInputClassName(`destination.${destination.id}.address`, "h-9 text-sm")}
                        />
                        {renderFieldError(`destination.${destination.id}.address`)}
                      </div>
                    </div>
                    <details className="rounded-md border border-slate-200 bg-slate-50 group dark:border-slate-800 dark:bg-slate-900">
                      <summary className="flex cursor-pointer items-center justify-between gap-2 px-2 py-2 text-xs font-medium text-slate-700 dark:text-slate-200">
                        <span>ติ๊กย้ายรายการ PO มาปลายทางนี้</span>
                        <Badge variant={destination.poCount ? "success" : "secondary"}>
                          {destination.poCount.toLocaleString("th-TH")} รายการ
                        </Badge>
                      </summary>
                      <div className="border-t border-slate-200 p-2 dark:border-slate-800">
                        <div className="grid max-h-56 gap-1 overflow-y-auto pr-1">
                          {records.map((record) => {
                            const checked = destinationAssignments[record.registryKey] === destination.id;
                            const assignedDestination = destinationAssignments[record.registryKey];
                            const assignedElsewhere = Boolean(assignedDestination && assignedDestination !== destination.id);

                            return (
                              <label
                                key={`${destination.id}-${record.registryKey}`}
                                className={`flex min-w-0 cursor-pointer items-start gap-2 rounded-md border px-2 py-2 text-xs ${
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
                        <p className="mt-2 text-[11px] text-muted-foreground">1 รายการอยู่ได้แค่ 1 ปลายทาง</p>
                      </div>
                    </details>
                  </div>
                ))}
              </div>

              <Button
                type="button"
                variant="outline"
                onClick={addDestinationGroup}
                className="h-10 w-full justify-center gap-2 border-dashed border-cyan-300 text-cyan-700 hover:bg-cyan-50 dark:border-cyan-800 dark:text-cyan-300 dark:hover:bg-cyan-950/30"
              >
                <Plus className="h-4 w-4" />
                เพิ่มปลายทาง
              </Button>

              <details className="text-xs">
                <summary className="flex cursor-pointer items-center gap-1.5 text-muted-foreground hover:text-slate-700 dark:hover:text-slate-200">
                  <HelpCircle className="h-3.5 w-3.5" />
                  สรุปปลายทางทำอะไร?
                </summary>
                <p className="mt-2 leading-relaxed text-muted-foreground">
                  ใช้ระบุว่าของในงานนี้ต้องส่งไปกี่จุด เช่น 1 งานอาจส่ง 3 ไซต์ — ระบบจะออก QR แยกตามปลายทางให้คนขับสแกนยืนยันการส่งทีละจุด
                  ลำดับปลายทางคงที่เพื่อให้ตรวจงานง่าย
                </p>
              </details>
            </CardContent>
          </Card>
        </div>
      ) : (
        <Card>
          <CardContent className="space-y-3 px-5 py-6 sm:px-6">
            <div className="flex items-center gap-3 text-sm text-muted-foreground">
              <FileWarning className="h-5 w-5" />
              <p>ยังไม่มีรายการ PO ที่ถูกเลือกจากหน้าคิวรอจัดส่ง</p>
            </div>
            <Button type="button" variant="outline" onClick={() => router.push("/po")}>
              กลับไปเลือก PO
            </Button>
          </CardContent>
        </Card>
      )}

      <div className="rounded-md border bg-white px-4 py-3 dark:bg-slate-950">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-start gap-2 rounded-md bg-slate-50 px-3 py-2 text-xs text-slate-600 dark:bg-slate-900 dark:text-slate-300">
            <Truck className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span className="leading-5">หลังสร้างงาน ระบบจะเปิดหน้าติดตามงานทันที และคนหน้างานต้องเช็กอิน GPS ต้นทางก่อนเริ่มสแกน</span>
          </div>
          <div className="flex w-full shrink-0 gap-2 sm:w-auto">
            <Button type="button" variant="outline" onClick={() => router.push("/po")} className="flex-1 sm:flex-none">
              ยกเลิก
            </Button>
            <Button
              type="button"
              onClick={handleCreateJob}
              disabled={isLoading || isSaving || !records.length}
              className="flex-1 sm:flex-none"
            >
              {isSaving ? (
                <>กำลังบันทึกงาน</>
              ) : (
                <>
                  <Save className="mr-2 h-4 w-4" />
                  สร้างงาน
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
