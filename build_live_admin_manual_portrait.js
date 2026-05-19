const { spawn } = require("node:child_process");
const fs = require("node:fs/promises");
const path = require("node:path");

const ROOT = "/Users/sasitorn/Project_Stock";
const ORIGIN = "https://project-stock-qr.vercel.app";
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const SHOT_DIR = path.join(ROOT, "live_admin_manual", "screenshots");
const HTML_PATH = path.join(ROOT, "คู่มือ_Admin_เว็บจริง_แนวตั้ง_Project_Stock_QR.html");
const PDF_PATH = path.join(ROOT, "คู่มือ_Admin_เว็บจริง_แนวตั้ง_Project_Stock_QR.pdf");

function fileUri(filePath) {
  return `file://${filePath.split(path.sep).map((part, index) => index === 0 ? "" : encodeURIComponent(part)).join("/")}`;
}

function image(filename, caption) {
  return `
    <figure>
      <img src="${fileUri(path.join(SHOT_DIR, filename))}" alt="${caption}">
      <figcaption>${caption}</figcaption>
    </figure>
  `;
}

function table(headers, rows) {
  return `
    <table>
      <thead><tr>${headers.map((header) => `<th>${header}</th>`).join("")}</tr></thead>
      <tbody>${rows.map((row) => `<tr>${row.map((cell) => `<td>${cell}</td>`).join("")}</tr>`).join("")}</tbody>
    </table>
  `;
}

async function main() {
  const css = `
    @page { size: A4 portrait; margin: 11mm; }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      color: #111827;
      font-family: Tahoma, "Noto Sans Thai", Arial, sans-serif;
      font-size: 11.4px;
      line-height: 1.48;
    }
    h1 { margin: 0 0 8px; font-size: 22px; color: #0f172a; line-height: 1.25; }
    h2 { margin: 13px 0 7px; font-size: 15px; color: #0d7a5f; break-after: avoid; }
    p { margin: 4px 0 7px; }
    .cover {
      min-height: 265mm;
      display: flex;
      flex-direction: column;
      justify-content: center;
      border: 1px solid #d7dee8;
      border-radius: 8px;
      padding: 22px;
      background: #f8fafc;
    }
    .meta { margin-top: 14px; color: #475569; font-size: 12.5px; }
    .note { margin: 8px 0; padding: 8px 10px; border-left: 4px solid #0d7a5f; background: #ecfdf5; }
    .warn { margin: 8px 0; padding: 8px 10px; border-left: 4px solid #c2410c; background: #fff7ed; }
    .page { break-before: page; }
    table { width: 100%; border-collapse: collapse; margin: 7px 0 10px; break-inside: avoid; }
    th, td { border: 1px solid #d1d9e6; padding: 5px 6px; vertical-align: top; }
    th { background: #eef2f7; color: #334155; text-align: left; }
    figure {
      margin: 7px 0 9px;
      break-inside: avoid;
      width: 100%;
    }
    figure img {
      display: block;
      width: 100%;
      max-height: 168mm;
      object-fit: contain;
      border: 1px solid #cfd7e3;
      border-radius: 5px;
      background: white;
    }
    figcaption {
      margin-top: 4px;
      color: #64748b;
      text-align: center;
      font-size: 9.8px;
    }
    ul { margin: 4px 0 8px 18px; padding: 0; }
    li { margin: 2px 0; }
  `;

  const html = `<!doctype html>
  <html lang="th">
  <head>
    <meta charset="utf-8">
    <title>คู่มือ Admin Project Stock QR แนวตั้ง</title>
    <style>${css}</style>
  </head>
  <body>
    <section class="cover">
      <h1>คู่มือใช้งาน Admin<br>Project Stock QR / Job Transport QR System</h1>
      <p>คู่มือนี้ใช้ภาพหน้าจอจากเว็บจริงโดยตรง: <b>${ORIGIN}</b></p>
      <div class="meta">
        <p><b>รูปแบบไฟล์:</b> A4 แนวตั้ง</p>
        <p><b>ขอบเขต:</b> สำหรับ Admin ตั้งแต่นำเข้า PO, เลือก PO, สร้าง Job, ส่ง QR ให้คนขับ, ติดตามงาน และประวัติงาน</p>
        <p><b>ข้อมูลจำลองที่กรอกบนฟอร์มจริง:</b> ห้อง A / รถ 1234 / คนขับ b / ต้นทางบางซ่อน / ปลายทางร้าน A</p>
      </div>
      <p class="warn"><b>หมายเหตุ:</b> ภาพในคู่มือนี้ยังติดแถบเมนูซ้ายไว้ เพราะเป็นส่วนหนึ่งของหน้าเว็บจริง แต่ปรับเป็นแนวตั้งและไม่จัดวางให้เกิดพื้นที่ว่างแบบไฟล์เดิมแล้ว</p>
    </section>

    <section class="page">
      <h2>ภาพรวมขั้นตอน Admin</h2>
      ${table(["ลำดับ", "เมนู", "Admin ต้องทำ", "ผลลัพธ์"], [
        ["1", "นำเข้า PO", "อัปโหลดไฟล์ Excel/CSV จาก SAP หรือ GR", "ข้อมูล PO เข้าคิวรอจัดส่ง"],
        ["2", "PO รอจัดส่ง", "ค้นหาและติ๊กเลือก PO/Item ที่จะสร้าง Job", "ได้รายการสำหรับสร้างงาน"],
        ["3", "สร้างงาน", "กรอกห้องงาน รถ คนขับ ต้นทาง ปลายทาง และจำนวนที่ต้องสแกน", "พร้อมกดสร้าง Job จริง"],
        ["4", "รายการงาน", "เปิด Driver Room หรือแสดง QR ให้คนขับ", "คนขับเข้าห้องงานถูกต้อง"],
        ["5", "ติดตามงาน", "ดูยอดขึ้นรถ ลงของ และ Alert", "ควบคุมงานได้แบบ realtime"],
        ["6", "ประวัติงาน", "ตรวจงานย้อนหลัง", "ใช้ทำรายงานหรือตรวจสอบ"],
      ])}
      ${image("01-home.png", "ภาพจริงจากเว็บ: หน้าแรก/เมนูหลัก")}
    </section>

    <section class="page">
      <h2>1. นำเข้า PO</h2>
      ${image("02-import-po.png", "ภาพจริงจากเว็บ: หน้า นำเข้า PO")}
      ${table(["จุดบนหน้าจอ", "กรอก/กดอะไร", "รายละเอียดที่ต้องตรวจ"], [
        ["เลือกไฟล์ Excel/CSV", "กดเลือกไฟล์หรือลากไฟล์มาวาง", "ไฟล์ควรมี PO SAP No., Item, Vendor, PO Web No., Material Code, Material Name, จำนวน"],
        ["รายการที่นำเข้า", "ตรวจผลหลังระบบอ่านไฟล์", "ถ้ามี error ให้แก้ไฟล์ก่อนนำเข้าใหม่"],
        ["ข้อมูลซ้ำ", "ตรวจ PO ที่เคยนำเข้าแล้ว", "ไม่ควรนำเข้าซ้ำถ้าไม่แน่ใจ"],
      ])}
    </section>

    <section class="page">
      <h2>2. เลือก PO รอจัดส่ง</h2>
      ${image("03-po-select.png", "ภาพจริงจากเว็บ: เลือก PO ที่จะสร้าง Job")}
      ${table(["ช่อง/ปุ่ม", "วิธีใช้", "ตัวอย่างจากภาพ"], [
        ["ช่องค้นหา", "ค้นด้วยเลข PO, Vendor, PO Web No. หรือวัสดุ", "ใช้หา PO เฉพาะรายการ"],
        ["Checkbox หน้าแถว", "ติ๊กเฉพาะรายการที่จะรวมใน Job เดียว", "เลือก 2 รายการจากข้อมูลจริง"],
        ["เลือกทั้งหมดตามผลค้นหา", "ใช้เมื่อผลค้นหาทั้งหมดต้องส่งรอบเดียวกัน", "ตรวจทุกแถวก่อนกด"],
        ["สร้าง Job จากรายการที่เลือก", "กดเพื่อไปหน้าสร้างงาน", "กดหลังจำนวนที่เลือกถูกต้อง"],
      ])}
    </section>

    <section class="page">
      <h2>3. สร้างงาน: กรอกข้อมูลงานขนส่ง</h2>
      ${image("04-create-job-top.png", "ภาพจริงจากเว็บ: หน้า สร้างงาน ส่วนบน พร้อมข้อมูลจำลอง")}
      ${table(["ช่อง", "ต้องกรอกอะไร", "ตัวอย่าง", "ข้อควรระวัง"], [
        ["จำนวนที่ต้องสแกน", "จำนวนกล่อง/รอบสแกนที่ต้องการให้คนขับสแกน", "1", "เป็นจำนวนสำหรับหน้างาน ไม่ใช่จำนวนสั่งซื้อใน SAP เสมอไป"],
        ["ชื่อห้องงาน", "ชื่อห้องงานสั้น ๆ ที่จำง่าย", "A", "คนขับจะเห็นบนมือถือ ควรสั้นและชัด"],
        ["รถขนส่ง", "เลขรถหรือทะเบียน", "1234", "ต้องตรงกับรถจริง"],
        ["คนขับ", "ชื่อหรือรหัสคนขับ", "b", "ใช้ระบุว่าเป็นงานของใคร"],
        ["ต้นทาง", "ชื่อจุดเริ่มงานที่ต้องเช็กอิน GPS", "บางซ่อน", "GPS ต้นทางระบบดึงจากมือถือคนขับ"],
        ["หมายเหตุ", "ข้อมูลกำกับงาน", "ส่งของรอบเช้า ตรวจจำนวนก่อนออกจากคลัง", "ใส่เฉพาะข้อมูลที่ช่วยหน้างาน"],
      ])}
    </section>

    <section class="page">
      <h2>4. สร้างงาน: กำหนดปลายทางและผูก PO</h2>
      ${image("05-create-job-destination.png", "ภาพจริงจากเว็บ: ส่วนปลายทางในหน้า สร้างงาน")}
      ${table(["ช่อง/ส่วน", "ต้องทำอะไร", "ตัวอย่าง"], [
        ["ชื่อปลายทาง", "กรอกชื่อจุดส่งที่คนขับเข้าใจ", "ร้าน A / โซนรับสินค้า 1"],
        ["ที่อยู่ / โลเคชัน", "กรอกสถานที่หรือคำอธิบายตำแหน่ง", "ร้าน A บางซ่อน"],
        ["ติ๊ก PO SAP No. เข้าปลายทางนี้", "เลือกว่าสินค้าแต่ละรายการต้องไปปลายทางไหน", "ติ๊ก PO ที่ต้องส่งร้าน A"],
        ["เพิ่มปลายทาง", "กดเมื่อ Job เดียวมีหลายจุดส่ง", "เพิ่มจุดส่งใหม่แล้วผูก PO ให้ถูกจุด"],
        ["สร้างงานจริงจากรายการที่เลือก", "กดเมื่อทุกข้อมูลถูกต้องแล้ว", "ในคู่มือนี้ไม่ได้กด เพื่อไม่แก้ข้อมูลจริง"],
      ])}
      <p class="warn">ก่อนกดสร้างจริง ต้องตรวจ PO, จำนวนสแกน, รถ, คนขับ, ต้นทาง และปลายทางให้ครบ</p>
    </section>

    <section class="page">
      <h2>5. รายการงาน</h2>
      ${image("06-jobs-list.png", "ภาพจริงจากเว็บ: รายการงาน")}
      ${table(["ปุ่ม/ข้อมูล", "ใช้ทำอะไร", "วิธีใช้งาน"], [
        ["ติดตามงาน / Monitor", "เปิดหน้าติดตาม Job", "ใช้ดูสถานะการโหลด/ส่ง/Alert"],
        ["เปิด Driver Room", "เปิดหน้าคนขับโดยตรง", "ใช้ทดสอบหรือเปิดให้คนขับจากเครื่อง Admin"],
        ["แสดง QR สำหรับคนขับ", "ให้คนขับสแกนเข้าห้องงาน", "ปุ่มนี้จะแสดงหลังมี Job จริงแล้ว"],
        ["ลบ Job", "ลบงานที่สร้างผิด", "ควรใช้เฉพาะงานที่ยืนยันแล้วว่าผิด"],
      ])}
      ${image("07-job-qr.png", "ภาพจริงจากเว็บ: พื้นที่ QR/รายการงานตามสถานะจริงตอนแคป")}
    </section>

    <section class="page">
      <h2>6. ติดตามงาน</h2>
      ${image("08-monitor-top.png", "ภาพจริงจากเว็บ: หน้า ติดตามงาน")}
      ${table(["ส่วน", "ความหมาย", "Admin ต้องดูอะไร"], [
        ["ห้องงาน", "งานที่กำลังติดตาม", "ต้องตรงกับงานที่ส่ง QR ให้คนขับ"],
        ["Status", "สถานะงาน เช่น ready/in progress/completed", "ดูว่างานเดินตามขั้นตอนหรือไม่"],
        ["ต้นทาง", "สถานะเช็กอินต้นทาง", "รอเช็กอิน / เช็กอินแล้ว / ปิดแล้ว"],
        ["Alerts", "เหตุผิดปกติ", "ถ้ามี Alert ให้ตรวจรายละเอียดทันที"],
        ["เปิดปลายทาง/ต้นทางกรณีพิเศษ", "ใช้เมื่อเงื่อนไขปกติยังล็อกอยู่", "ต้องตรวจหน้างานก่อนเปิด"],
      ])}
    </section>

    <section class="page">
      <h2>7. ความคืบหน้าตาม Location / PO</h2>
      ${image("09-monitor-progress.png", "ภาพจริงจากเว็บ: ตารางความคืบหน้าตาม Location / PO")}
      <p class="note"><b>กติกาสำคัญ:</b> เมื่อคนขับสแกนขึ้นรถครบแล้ว ระบบควรปิดต้นทางเพื่อกันการเช็กอินต้นทางผิดที่ หากต้องเปิดใหม่ให้ Admin เป็นคนเปิดต้นทางกรณีพิเศษ</p>
    </section>

    <section class="page">
      <h2>8. ประวัติงาน</h2>
      ${image("10-history.png", "ภาพจริงจากเว็บ: เมนูประวัติงาน")}
      ${table(["กรณีใช้งาน", "ต้องดูอะไร", "ใช้เพื่ออะไร"], [
        ["งานส่งเสร็จแล้ว", "ตรวจ Job ที่จบหรือถูกปิด", "ทำรายงานย้อนหลัง"],
        ["มีปัญหาหน้างาน", "ดูเวลา สถานะ ยอดขึ้นรถ/ลงของ", "ตรวจสอบข้อเท็จจริง"],
        ["ต้องสรุปงานรายวัน", "กรองงานตาม Job/รถ/คนขับ/PO", "ส่งรายงานให้ทีม"],
      ])}
      <h2>Checklist ก่อนส่งงานให้คนขับ</h2>
      <ul>
        <li>เลือก PO ถูกต้องและครบทุก item ที่ต้องส่ง</li>
        <li>กรอกชื่อห้องงาน รถ คนขับ ต้นทาง และปลายทางครบ</li>
        <li>ตรวจจำนวนที่ต้องสแกนก่อนกดสร้างงานจริง</li>
        <li>ส่ง QR หรือลิงก์ Driver Room ของ Job ที่ถูกต้องเท่านั้น</li>
        <li>เปิดกรณีพิเศษเฉพาะเมื่อจำเป็นและตรวจหน้างานแล้ว</li>
      </ul>
    </section>
  </body>
  </html>`;

  await fs.writeFile(HTML_PATH, html, "utf8");
  await new Promise((resolve, reject) => {
    const chrome = spawn(CHROME, [
      "--headless=new",
      "--disable-gpu",
      "--no-pdf-header-footer",
      `--print-to-pdf=${PDF_PATH}`,
      fileUri(HTML_PATH),
    ], { stdio: "ignore" });
    chrome.on("exit", (code) => code === 0 ? resolve() : reject(new Error(`Chrome PDF failed: ${code}`)));
  });
  console.log(PDF_PATH);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
