import { pendingPOs } from "./po";

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

export const jobs = [
  activeJob,
  { ...activeJob, id: "JOB-2026-0420-002", route: "DC Bangna -> 2 Locations", status: "in_transit", loadedTotal: 80, requiredTotal: 80 },
  { ...activeJob, id: "JOB-2026-0419-014", route: "DC West -> 4 Locations", status: "closed", loadedTotal: 210, requiredTotal: 210 },
];

export const jobPOs = pendingPOs;
