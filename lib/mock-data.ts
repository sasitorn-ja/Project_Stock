export const jobLocations = [
  {
    id: "LOC-BKK-01",
    name: "Central Rama 3",
    address: "79 Sathu Pradit Rd, Bangkok",
    gps: "13.6982,100.5373",
    radius: "120 m",
    status: "กำลังรอส่ง",
    items: [
      { sku: "SKU-10024", name: "สายชาร์จ USB-C", required: 40, loaded: 40, delivered: 0 },
      { sku: "SKU-20411", name: "กล่องบรรจุภัณฑ์ M", required: 20, loaded: 20, delivered: 0 },
    ],
  },
  {
    id: "LOC-NBI-02",
    name: "Warehouse Nonthaburi",
    address: "Bang Kruai, Nonthaburi",
    gps: "13.8240,100.4591",
    radius: "150 m",
    status: "ยังไม่ถึงจุด",
    items: [
      { sku: "SKU-33109", name: "สติ๊กเกอร์ Barcode", required: 60, loaded: 48, delivered: 0 },
      { sku: "SKU-77821", name: "อะไหล่ชุด A", required: 12, loaded: 12, delivered: 0 },
    ],
  },
  {
    id: "LOC-SPK-03",
    name: "Branch Samut Prakan",
    address: "Mueang Samut Prakan",
    gps: "13.5991,100.5998",
    radius: "120 m",
    status: "ยังไม่ถึงจุด",
    items: [
      { sku: "SKU-88001", name: "แพ็กสินค้า Standard", required: 25, loaded: 25, delivered: 0 },
    ],
  },
];

export const pendingPOs = [
  {
    id: "PO-2026-00081",
    customer: "Central Rama 3",
    destinationId: "LOC-BKK-01",
    destination: "Central Rama 3",
    dueDate: "2026-04-20",
    status: "รอจัดส่ง",
    items: [
      { sku: "SKU-10024", name: "สายชาร์จ USB-C", qty: 40 },
      { sku: "SKU-20411", name: "กล่องบรรจุภัณฑ์ M", qty: 20 },
    ],
  },
  {
    id: "PO-2026-00082",
    customer: "Warehouse Nonthaburi",
    destinationId: "LOC-NBI-02",
    destination: "Warehouse Nonthaburi",
    dueDate: "2026-04-20",
    status: "รอจัดส่ง",
    items: [
      { sku: "SKU-33109", name: "สติ๊กเกอร์ Barcode", qty: 60 },
      { sku: "SKU-77821", name: "อะไหล่ชุด A", qty: 12 },
    ],
  },
  {
    id: "PO-2026-00083",
    customer: "Central Rama 3",
    destinationId: "LOC-BKK-01",
    destination: "Central Rama 3",
    dueDate: "2026-04-20",
    status: "รอจัดส่ง",
    items: [
      { sku: "SKU-88001", name: "แพ็กสินค้า Standard", qty: 25 },
    ],
  },
];

export const groupedPOsByDestination = [
  {
    destinationId: "LOC-BKK-01",
    destination: "Central Rama 3",
    poIds: ["PO-2026-00081", "PO-2026-00083"],
    totalItems: 85,
  },
  {
    destinationId: "LOC-NBI-02",
    destination: "Warehouse Nonthaburi",
    poIds: ["PO-2026-00082"],
    totalItems: 72,
  },
];

export const activeJob = {
  id: "JOB-2026-0420-001",
  route: "DC Bangna -> 3 Locations",
  driver: "Somchai Driver",
  vehicle: "6W-4382",
  origin: "DC Bangna",
  originGps: "13.6682,100.6804",
  status: "loading",
  loadedTotal: 145,
  requiredTotal: 157,
  deliveredTotal: 0,
  locations: jobLocations,
};

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

export const systemFlow = [
  "ระบบดึง PO เข้ามา",
  "แสดงรายการ PO ที่รอจัดส่ง",
  "Admin เลือก PO เพื่อสร้าง Job",
  "ระบบรวม PO ตามปลายทาง",
  "ระบบบันทึก Job และสร้าง Job Room",
  "ระบบสร้าง QR ห้องงานและ QR ของแต่ละ Location",
  "Admin แจก QR ให้คนขับ",
  "คนขับสแกน QR ห้องงาน",
  "ระบบตรวจสถานะและเข้าโหมดรับต้นทางอัตโนมัติ",
  "คนขับสแกนสินค้าขึ้นรถ",
  "ระบบเช็คกับรายการ PO ใน Job, เป็นของ location ไหน, ซ้ำไหม และเก็บ GPS",
  "โหลดครบทุก location แล้วเปลี่ยนสถานะเป็น in_transit",
  "คนขับถึงปลายทางและสแกน QR location",
  "ระบบเข้าโหมดส่งอัตโนมัติ",
  "คนขับสแกนสินค้าลง",
  "ระบบเช็คกับ PO ว่าตรงปลายทางไหม จำนวน scan ซ้ำ และ GPS",
  "ถ้าผิดปกติ สร้าง alert และส่ง realtime ไป Admin",
  "ระบบสรุปว่า PO ไหนส่งครบหรือยังไม่ครบ",
  "Admin ตรวจสอบและปิด Job",
];
