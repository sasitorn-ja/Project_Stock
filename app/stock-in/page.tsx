import { StockForm } from "@/components/stock/stock-form";

export default function StockInPage() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-normal">รับสินค้าเข้า</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          บันทึกสินค้าเข้าคลังพร้อมข้อมูล Lot, Supplier และตำแหน่งจัดเก็บ
        </p>
      </div>
      <StockForm mode="in" />
    </div>
  );
}
