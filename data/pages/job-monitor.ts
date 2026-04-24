import { activeJob } from "./jobs";

export const monitorJob = activeJob;

export const alerts = [
  {
    id: "ALT-001",
    type: "ผิดปลายทาง",
    message: "SKU-33109 ถูกสแกนที่ Central Rama 3 แต่เป็นของ Warehouse Nonthaburi",
    time: "10:42",
    severity: "สูง",
  },
  {
    id: "ALT-002",
    type: "GPS นอกพื้นที่",
    message: "สแกนส่งสินค้าอยู่นอก radius ของ LOC-BKK-01 280 เมตร",
    time: "10:48",
    severity: "สูง",
  },
  {
    id: "ALT-003",
    type: "จำนวนไม่ครบ",
    message: "LOC-NBI-02 ยังโหลด SKU-33109 ขาด 12 ชิ้น",
    time: "11:05",
    severity: "กลาง",
  },
];

export const monitorPOStatuses = [
  { po: "PO-2026-00081", status: "ส่งครบ", variant: "success" },
  { po: "PO-2026-00082", status: "ยังไม่ครบ", variant: "warning" },
  { po: "PO-2026-00083", status: "รอส่ง", variant: "secondary" },
];
