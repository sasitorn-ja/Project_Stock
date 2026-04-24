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
