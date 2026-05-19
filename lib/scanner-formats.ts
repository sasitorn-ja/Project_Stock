import { BarcodeFormat, DecodeHintType } from "@zxing/library";

/**
 * รองรับเฉพาะ format ที่ใช้จริงในงานขนส่ง/คลังสินค้า
 * ตัดพวก RSS_14, RSS_EXPANDED, CODABAR, UPC_EAN_EXTENSION, MICRO_QR_CODE ออก
 * เพราะ false-positive สูงมากเมื่อกล้องชี้ไปที่พื้นผิวทั่วไป
 */
export const SUPPORTED_SCAN_FORMATS = [
  BarcodeFormat.QR_CODE,       // QR บน PO / ใบส่งของ
  BarcodeFormat.CODE_128,      // บาร์โค้ดคลังสินค้า/โลจิสติกส์ที่พบมากที่สุด
  BarcodeFormat.CODE_39,       // อุตสาหกรรม / ยานยนต์
  BarcodeFormat.CODE_93,       // อุตสาหกรรม
  BarcodeFormat.EAN_13,        // สินค้าทั่วไป
  BarcodeFormat.EAN_8,         // สินค้าขนาดเล็ก
  BarcodeFormat.UPC_A,         // สินค้าอเมริกา
  BarcodeFormat.DATA_MATRIX,   // อุตสาหกรรม/อิเล็กทรอนิกส์
  BarcodeFormat.PDF_417,       // บัตรประชาชน / เอกสารราชการ
] as const;

export const SUPPORTED_SCAN_FORMAT_LABEL =
  "QR Code, Code 128, Code 39/93, EAN-13/8, UPC-A, Data Matrix, PDF417";

/** ความยาวขั้นต่ำของรหัสที่จะถือว่า valid (ป้องกัน false-positive สั้นๆ) */
export const MIN_SCAN_CODE_LENGTH = 4;

export function createScanHints() {
  const hints = new Map<DecodeHintType, unknown>();
  hints.set(DecodeHintType.POSSIBLE_FORMATS, [...SUPPORTED_SCAN_FORMATS]);
  // ไม่ใช้ TRY_HARDER — ทำให้ false-positive สูงมากเมื่อไม่มีบาร์โค้ดในกรอบ
  hints.set(DecodeHintType.ENABLE_CODE_39_EXTENDED_MODE, true);
  return hints;
}
