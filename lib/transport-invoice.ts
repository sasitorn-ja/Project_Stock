import { readFile } from "node:fs/promises";
import path from "node:path";
import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, type PDFFont, type PDFPage, rgb } from "pdf-lib";
import type { JobSummaryRecord } from "@/lib/jobs";

const rowsPerPage = 30;
const pageWidth = 595.28;
const pageHeight = 841.89;
const black = rgb(0.08, 0.08, 0.08);

type TransportRow = {
  po: string;
  materialName: string;
};

function uniqueText(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean))).join(", ");
}

function buildRows(destination: JobSummaryRecord["destinations"][number]) {
  const groups = new Map<string, string[]>();

  destination.items.forEach((item) => {
    const names = groups.get(item.poSapNo) ?? [];
    names.push(item.materialName);
    groups.set(item.poSapNo, names);
  });

  return Array.from(groups.entries()).map(([po, materialNames]) => ({
    po,
    materialName: uniqueText(materialNames),
  }));
}

function splitPages<T>(items: T[], size: number) {
  const pages: T[][] = [];

  for (let index = 0; index < items.length; index += size) {
    pages.push(items.slice(index, index + size));
  }

  return pages.length ? pages : [[]];
}

function formatJobDate(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return new Intl.DateTimeFormat("th-TH", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "Asia/Bangkok",
  }).format(date);
}

function fitText(text: string, font: PDFFont, size: number, maxWidth: number) {
  if (font.widthOfTextAtSize(text, size) <= maxWidth) {
    return text;
  }

  let fitted = text;
  while (fitted && font.widthOfTextAtSize(`${fitted}...`, size) > maxWidth) {
    fitted = fitted.slice(0, -1);
  }

  return fitted ? `${fitted.trimEnd()}...` : "...";
}

function drawText(
  page: PDFPage,
  text: string,
  x: number,
  y: number,
  font: PDFFont,
  size = 9,
  maxWidth?: number,
) {
  page.drawText(maxWidth ? fitText(text, font, size, maxWidth) : text, { x, y, font, size, color: black });
}

function drawCenteredText(page: PDFPage, text: string, centerX: number, y: number, font: PDFFont, size = 9) {
  page.drawText(text, {
    x: centerX - font.widthOfTextAtSize(text, size) / 2,
    y,
    font,
    size,
    color: black,
  });
}

function drawCenteredBoldText(page: PDFPage, text: string, centerX: number, y: number, font: PDFFont, size = 9) {
  const x = centerX - font.widthOfTextAtSize(text, size) / 2;

  [0, 0.3, 0.6].forEach((offset) => {
    page.drawText(text, { x: x + offset, y, font, size, color: black });
  });
}

function drawLine(page: PDFPage, x1: number, y1: number, x2: number, y2: number, thickness = 0.7) {
  page.drawLine({ start: { x: x1, y: y1 }, end: { x: x2, y: y2 }, thickness, color: black });
}

function drawSignatureArea(page: PDFPage, font: PDFFont) {
  drawText(page, "ผู้ออกเอกสาร  ....................................", 62, 137, font, 10.5);
  drawText(page, "ผู้รับจ้างขนส่ง  ....................................", 236, 137, font, 10.5);
  drawText(page, "รถออกวันที่  ......./....../...... เวลา ..........", 410, 137, font, 10.5);
  drawText(page, "ผู้อนุมัติขนส่ง  ....................................", 62, 120, font, 10.5);
  drawText(page, "เลขทะเบียนรถ  ....................................", 236, 120, font, 10.5);
  drawText(page, "ยามผู้ตรวจนำของออก  .............................", 410, 120, font, 10.5);

  page.drawRectangle({ x: 32, y: 27, width: 173, height: 78, borderColor: black, borderWidth: 0.6 });
  page.drawRectangle({ x: 208, y: 27, width: 160, height: 78, borderColor: black, borderWidth: 0.6 });
  drawText(page, "ชื่อผู้รับของ ........................................", 56, 91, font, 10);
  drawText(page, "(......................................................)", 56, 79, font, 10);
  drawText(page, "วันที่ถึง ....../....../...... เวลา ............ น.", 56, 65, font, 10);
  drawText(page, "วันที่ส่ง ....../....../...... เวลา ............ น.", 56, 51, font, 10);
  drawCenteredText(page, "ผู้รับโปรดเซ็นชื่อพร้อมประทับตรา", 118.5, 36, font, 10);

  drawCenteredText(page, "รายการตรวจรับของไม่ครบ", 288, 91, font, 10);
  drawText(page, "รายการที่ ........................ จำนวน ................", 218, 76, font, 10);
  drawText(page, "รายการที่ ........................ จำนวน ................", 218, 63, font, 10);
  drawText(page, "ผู้รับของ ..............................................", 218, 49, font, 10);
  drawText(page, "ผู้รับจ้างขนส่ง ......................................", 218, 36, font, 10);

  drawText(page, "ต้นฉบับสีขาว - ผู้รับของ", 388, 91, font, 10);
  drawText(page, "สำเนาสีเขียว - ผู้รับจ้างขนส่ง", 388, 76, font, 10);
  drawText(page, "สำเนาสีฟ้า - พัสดุ", 388, 61, font, 10);
  drawText(page, "CPAC : F-15-004 XLS REV. 01/DEC/01", 388, 46, font, 9);
  drawText(page, "ผู้ปรับปรุง ชาตรี ว.", 388, 31, font, 10);

  drawText(page, "CPAC : F-15-004.XLS REV. 02/FEB 02", 58, 15, font, 8.5);
  drawCenteredText(page, "ระยะเวลาการจัดเก็บ 12 เดือน", 288, 15, font, 8.5);
}

function drawPage(
  page: PDFPage,
  font: PDFFont,
  job: JobSummaryRecord,
  destination: JobSummaryRecord["destinations"][number],
  rows: TransportRow[],
  rowNumberOffset: number,
) {
  drawCenteredBoldText(page, "บริษัท ปูนซิเมนต์ไทย (ท่าหลวง) จำกัด", pageWidth / 2, 805, font, 17);
  drawCenteredBoldText(page, "ใบกำกับขนส่ง", pageWidth / 2, 784, font, 14);
  drawText(page, `จาก ${job.origin || "-"}`, 36, 761, font, 11, 300);
  drawText(page, `ถึง ${destination.name || "-"}`, 36, 739, font, 11, 360);
  drawText(page, `หมายเลข ${destination.transportDocumentNo || "-"}`, 455, 761, font, 11, 110);
  drawText(page, `วันที่ ${formatJobDate(job.createdAt)}`, 455, 739, font, 11, 110);

  const tableLeft = 32;
  const tableRight = 563;
  const tableTop = 720;
  const headerHeight = 24;
  const rowHeight = 17.8;
  const columns = [32, 70, 132, 230, 350, 444, 506, 563];
  const headers = ["ลำดับ", "GI/GT/PO", "เลข GI/GT/PO", "ชื่อสินค้า", "หน่วยงาน", "จำนวน", "หน่วย"];

  drawLine(page, tableLeft, tableTop, tableRight, tableTop, 1);
  drawLine(page, tableLeft, tableTop - headerHeight, tableRight, tableTop - headerHeight, 1);

  columns.forEach((x) => drawLine(page, x, tableTop, x, tableTop - headerHeight - rowHeight * rowsPerPage, 1));
  headers.forEach((header, index) => {
    drawCenteredText(page, header, (columns[index] + columns[index + 1]) / 2, tableTop - 17, font, 10);
  });

  for (let index = 0; index < rowsPerPage; index += 1) {
    const rowTop = tableTop - headerHeight - rowHeight * index;
    const rowBottom = rowTop - rowHeight;
    const row = rows[index];
    drawLine(page, tableLeft, rowBottom, tableRight, rowBottom, 0.7);
    drawCenteredText(page, String(rowNumberOffset + index + 1), (columns[0] + columns[1]) / 2, rowBottom + 4.2, font, 8.5);

    if (row) {
      drawCenteredText(page, "PO", (columns[1] + columns[2]) / 2, rowBottom + 4.2, font, 8.5);
      drawText(page, fitText(row.po, font, 8.5, columns[3] - columns[2] - 6), columns[2] + 3, rowBottom + 4.2, font, 8.5);
      drawText(
        page,
        fitText(row.materialName || "-", font, 8.5, columns[4] - columns[3] - 6),
        columns[3] + 3,
        rowBottom + 4.2,
        font,
        8.5,
      );
    }
  }

  drawSignatureArea(page, font);
}

export async function buildTransportInvoicePdf(job: JobSummaryRecord) {
  const document = await PDFDocument.create();
  document.registerFontkit(fontkit);
  const fontBytes = await readFile(path.join(process.cwd(), "public", "fonts", "THSarabunPSK-Regular.ttf"));
  const font = await document.embedFont(fontBytes, { subset: true });

  job.destinations.forEach((destination) => {
    splitPages(buildRows(destination), rowsPerPage).forEach((rows, pageIndex) => {
      const page = document.addPage([pageWidth, pageHeight]);
      drawPage(page, font, job, destination, rows, pageIndex * rowsPerPage);
    });
  });

  return document.save();
}
