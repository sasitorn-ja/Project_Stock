import { BarcodeFormat, DecodeHintType } from "@zxing/library";

export const SUPPORTED_SCAN_FORMATS = [
  BarcodeFormat.QR_CODE,
  BarcodeFormat.MICRO_QR_CODE,
  BarcodeFormat.CODE_128,
  BarcodeFormat.CODE_39,
  BarcodeFormat.CODE_93,
  BarcodeFormat.EAN_13,
  BarcodeFormat.EAN_8,
  BarcodeFormat.ITF,
  BarcodeFormat.UPC_A,
  BarcodeFormat.UPC_E,
  BarcodeFormat.UPC_EAN_EXTENSION,
  BarcodeFormat.CODABAR,
  BarcodeFormat.DATA_MATRIX,
  BarcodeFormat.PDF_417,
  BarcodeFormat.AZTEC,
  BarcodeFormat.RSS_14,
  BarcodeFormat.RSS_EXPANDED,
] as const;

export const SUPPORTED_SCAN_FORMAT_LABEL =
  "QR, Micro QR, Code 128, Code 39, Code 93, EAN-13/8, UPC-A/E, ITF-14, Codabar, Data Matrix, PDF417, Aztec, RSS";

export function createScanHints() {
  const hints = new Map<DecodeHintType, unknown>();
  hints.set(DecodeHintType.POSSIBLE_FORMATS, [...SUPPORTED_SCAN_FORMATS]);
  hints.set(DecodeHintType.TRY_HARDER, true);
  hints.set(DecodeHintType.ENABLE_CODE_39_EXTENDED_MODE, true);
  hints.set(DecodeHintType.RETURN_CODABAR_START_END, true);
  return hints;
}
