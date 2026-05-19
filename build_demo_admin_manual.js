const { spawn } = require("node:child_process");
const fs = require("node:fs/promises");
const path = require("node:path");

const ROOT = "/Users/sasitorn/Project_Stock";
const ORIGIN = "https://project-stock-qr.vercel.app";
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const PORT = 9334;
const OUT_DIR = path.join(ROOT, "demo_admin_manual");
const SHOT_DIR = path.join(OUT_DIR, "screenshots");
const HTML_PATH = path.join(ROOT, "คู่มือ_Admin_จำลองครบทุกหน้า_Project_Stock_QR.html");
const PDF_PATH = path.join(ROOT, "คู่มือ_Admin_จำลองครบทุกหน้า_Project_Stock_QR.pdf");

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function requestJson(url, options = {}) {
  const response = await fetch(url, options);
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}: ${await response.text()}`);
  }
  return response.json();
}

function destinationId(name) {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9ก-๙]+/g, "-")
    .replace(/^-+|-+$/g, "") || "manual-demo-destination";
}

class Cdp {
  constructor(wsUrl) {
    this.ws = new WebSocket(wsUrl);
    this.nextId = 1;
    this.pending = new Map();
  }

  async open() {
    await new Promise((resolve, reject) => {
      this.ws.addEventListener("open", resolve, { once: true });
      this.ws.addEventListener("error", reject, { once: true });
    });
    this.ws.addEventListener("message", (event) => {
      const data = JSON.parse(event.data);
      if (!data.id || !this.pending.has(data.id)) return;
      const { resolve, reject } = this.pending.get(data.id);
      this.pending.delete(data.id);
      if (data.error) reject(new Error(data.error.message));
      else resolve(data.result);
    });
  }

  send(method, params = {}) {
    const id = this.nextId++;
    this.ws.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => this.pending.set(id, { resolve, reject }));
  }

  close() {
    this.ws.close();
  }
}

async function waitForChrome() {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      await requestJson(`http://127.0.0.1:${PORT}/json/version`);
      return;
    } catch {
      await sleep(250);
    }
  }
  throw new Error("Chrome did not start");
}

async function goto(cdp, url, waitMs = 1700) {
  await cdp.send("Page.navigate", { url });
  await sleep(waitMs);
}

async function waitForAnyText(cdp, texts, timeoutMs = 18000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const result = await cdp.send("Runtime.evaluate", {
      expression: `(() => {
        const body = document.body?.innerText || "";
        return ${JSON.stringify(texts)}.some((text) => body.includes(text));
      })()`,
      returnByValue: true,
    });
    if (result.result.value) return;
    await sleep(300);
  }
  throw new Error(`Timed out waiting for text: ${texts.join(", ")}`);
}

async function screenshot(cdp, filename) {
  const result = await cdp.send("Page.captureScreenshot", {
    format: "png",
    fromSurface: true,
    captureBeyondViewport: false,
  });
  await fs.writeFile(path.join(SHOT_DIR, filename), Buffer.from(result.data, "base64"));
}

async function selectDemoRecords() {
  const response = await requestJson(`${ORIGIN}/api/po-registry?limit=30`);
  const records = (response.records || []).filter((record) => record.registryKey && record.poSapNo).slice(0, 2);
  if (records.length < 2) throw new Error("ไม่พบ PO active อย่างน้อย 2 รายการสำหรับจำลอง");
  return records;
}

async function createDemoJob(records) {
  const assignments = {};
  const overrides = records.map((record, index) => {
    const name = index === 0 ? "ร้าน A / โซนรับสินค้า 1" : "ร้าน B / จุดรับสินค้า 2";
    const id = destinationId(name);
    assignments[record.registryKey] = id;
    return {
      id,
      name,
      address: index === 0 ? "ร้าน A บางซ่อน" : "ร้าน B บางนา",
      radiusMeters: 150,
    };
  });
  const quantities = Object.fromEntries(records.map((record) => [record.registryKey, 1]));
  const response = await requestJson(`${ORIGIN}/api/jobs`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      roomName: "คู่มือ DEMO",
      vehicle: "1234",
      driver: "คนขับตัวอย่าง",
      origin: "บางซ่อน",
      note: "Job ตัวอย่างสำหรับทำคู่มือ ระบบจะลบออกหลังแคปภาพครบ",
      registryKeys: records.map((record) => record.registryKey),
      itemScanQuantities: quantities,
      destinationAssignments: assignments,
      destinationOverrides: overrides,
    }),
  });
  return response.job;
}

async function deleteDemoJob(jobId) {
  if (!jobId) return;
  await fetch(`${ORIGIN}/api/jobs/${encodeURIComponent(jobId)}`, { method: "DELETE" }).catch(() => null);
}

async function captureAll() {
  await fs.mkdir(SHOT_DIR, { recursive: true });
  const records = await selectDemoRecords();
  let demoJob = null;
  const chrome = spawn(CHROME, [
    "--headless=new",
    "--disable-gpu",
    "--hide-scrollbars",
    `--remote-debugging-port=${PORT}`,
    "--user-data-dir=/tmp/project-stock-demo-admin-manual",
    "--window-size=1365,940",
    "about:blank",
  ], { stdio: "ignore" });

  try {
    await waitForChrome();
    const tab = await requestJson(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: "PUT" });
    const cdp = new Cdp(tab.webSocketDebuggerUrl);
    await cdp.open();
    await cdp.send("Page.enable");
    await cdp.send("Runtime.enable");

    await goto(cdp, `${ORIGIN}/`);
    await waitForAnyText(cdp, ["นำเข้า PO", "PO รอจัดส่ง"]);
    await screenshot(cdp, "01-home.png");

    await goto(cdp, `${ORIGIN}/po/import`);
    await waitForAnyText(cdp, ["นำเข้า PO"]);
    await screenshot(cdp, "02-import-po.png");

    await goto(cdp, `${ORIGIN}/po`);
    await waitForAnyText(cdp, ["PO รอจัดส่ง"]);
    await cdp.send("Runtime.evaluate", {
      expression: `
        (() => {
          const wanted = new Set(${JSON.stringify(records.map((record) => record.registryKey))});
          document.querySelectorAll('input[type="checkbox"]').forEach((box) => {
            const row = box.closest('tr');
            if (!row) return;
            if ([...wanted].some((key) => row.innerText.includes(key.split('::')[0])) && !box.checked) box.click();
          });
          window.scrollTo(0, 0);
        })();
      `,
    });
    await sleep(900);
    await screenshot(cdp, "03-select-po.png");

    await cdp.send("Runtime.evaluate", {
      expression: `sessionStorage.setItem('project-stock.selected-po-registry-keys', JSON.stringify(${JSON.stringify(records.map((record) => record.registryKey))}));`,
    });
    await goto(cdp, `${ORIGIN}/jobs/new`, 2200);
    await waitForAnyText(cdp, ["สร้างงาน", "รายการที่เลือกจาก PO", "รายละเอียดงานขนส่ง"]);
    await cdp.send("Runtime.evaluate", {
      expression: `
        (() => {
          const setValue = (input, value) => {
            if (!input) return;
            const prototype = input instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
            const setter = Object.getOwnPropertyDescriptor(prototype, 'value').set;
            setter.call(input, value);
            input.dispatchEvent(new Event('input', { bubbles: true }));
            input.dispatchEvent(new Event('change', { bubbles: true }));
          };
          const labels = [...document.querySelectorAll('label')];
          const byLabel = (text) => {
            const label = labels.find((item) => item.innerText.trim().includes(text));
            const id = label?.getAttribute('for');
            return id ? document.getElementById(id) : label?.parentElement?.querySelector('input, textarea');
          };
          setValue(byLabel('ชื่อห้องงาน') || byLabel('ชื่อห้อง Job'), 'คู่มือ DEMO');
          setValue(byLabel('รถขนส่ง'), '1234');
          setValue(byLabel('คนขับ'), 'คนขับตัวอย่าง');
          setValue(byLabel('ต้นทาง'), 'บางซ่อน');
          setValue(byLabel('หมายเหตุ'), 'Job ตัวอย่างสำหรับทำคู่มือ ระบบจะลบออกหลังแคปภาพครบ');
          document.querySelectorAll('input[type="number"]').forEach((input) => setValue(input, '1'));
          const inputs = [...document.querySelectorAll('input')];
          const nameInput = inputs.find((input) => /Digital|Concrete|Mixed|ร้าน/.test(input.value || ''));
          if (nameInput) setValue(nameInput, 'ร้าน A / โซนรับสินค้า 1');
          const addressInput = inputs.find((input) => input !== nameInput && /Digital|Concrete|Mixed|ร้าน/.test(input.value || ''));
          if (addressInput) setValue(addressInput, 'ร้าน A บางซ่อน');
          window.scrollTo(0, 0);
        })();
      `,
    });
    await sleep(900);
    await screenshot(cdp, "04-create-job-top.png");
    await cdp.send("Runtime.evaluate", { expression: "window.scrollTo(0, document.body.scrollHeight * 0.5)" });
    await sleep(700);
    await screenshot(cdp, "05-create-job-destination.png");

    demoJob = await createDemoJob(records);

    await goto(cdp, `${ORIGIN}/jobs`);
    await waitForAnyText(cdp, ["คู่มือ DEMO", "รายการงาน"]);
    await screenshot(cdp, "06-jobs-list-with-demo.png");
    await cdp.send("Runtime.evaluate", {
      expression: `
        (() => {
          const rows = [...document.querySelectorAll('tr, div')].filter((item) => item.innerText.includes('คู่มือ DEMO'));
          const root = rows[0] || document;
          const button = [...root.querySelectorAll('button')].find((item) => item.innerText.includes('แสดง QR')) || [...document.querySelectorAll('button')].find((item) => item.innerText.includes('แสดง QR'));
          button?.click();
          window.scrollTo(0, 0);
        })();
      `,
    });
    await sleep(900);
    await screenshot(cdp, "07-job-qr-with-demo.png");

    await goto(cdp, `${ORIGIN}/jobs/monitor?jobId=${encodeURIComponent(demoJob.id)}`, 1900);
    await waitForAnyText(cdp, ["คู่มือ DEMO", "ช่องทางเข้าหน้าคนขับ", "แผนส่งตาม"]);
    await screenshot(cdp, "08-monitor-demo-top.png");
    await cdp.send("Runtime.evaluate", { expression: "window.scrollTo(0, document.body.scrollHeight * 0.55)" });
    await sleep(700);
    await screenshot(cdp, "09-monitor-demo-progress.png");

    await goto(cdp, `${ORIGIN}/driver-room?jobId=${encodeURIComponent(demoJob.id)}`, 1700);
    await waitForAnyText(cdp, ["DRIVER ROOM", "คู่มือ DEMO", "เช็กอินต้นทาง"]);
    await screenshot(cdp, "10-driver-room-demo.png");

    await goto(cdp, `${ORIGIN}/jobs/history`);
    await waitForAnyText(cdp, ["ประวัติงาน", "ประวัติ"]);
    await screenshot(cdp, "11-history.png");

    cdp.close();
    return { records, demoJob };
  } finally {
    await deleteDemoJob(demoJob?.id);
    chrome.kill("SIGTERM");
  }
}

function fileUri(filePath) {
  return `file://${filePath.split(path.sep).map((part, index) => index === 0 ? "" : encodeURIComponent(part)).join("/")}`;
}

function image(filename, caption) {
  return `<figure><img src="${fileUri(path.join(SHOT_DIR, filename))}" alt="${caption}"><figcaption>${caption}</figcaption></figure>`;
}

function table(headers, rows) {
  return `<table><thead><tr>${headers.map((header) => `<th>${header}</th>`).join("")}</tr></thead><tbody>${rows.map((row) => `<tr>${row.map((cell) => `<td>${cell}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
}

async function buildManual({ records, demoJob }) {
  const poText = records.map((record) => `${record.poSapNo} item ${record.poSapItem}`).join(", ");
  const css = `
    @page { size: A4 portrait; margin: 8mm; }
    * { box-sizing: border-box; }
    body { margin: 0; color: #111827; font-family: Tahoma, "Noto Sans Thai", Arial, sans-serif; font-size: 10.8px; line-height: 1.42; }
    h1 { margin: 0 0 8px; font-size: 21px; color: #0f172a; line-height: 1.25; }
    h2 { margin: 12px 0 6px; font-size: 14.5px; color: #0d7a5f; break-after: avoid; }
    p { margin: 4px 0 6px; }
    .cover { min-height: 275mm; display: flex; flex-direction: column; justify-content: center; border: 1px solid #d7dee8; border-radius: 8px; padding: 20px; background: #f8fafc; }
    .meta { margin-top: 14px; color: #475569; font-size: 12px; }
    .note { margin: 7px 0; padding: 7px 9px; border-left: 4px solid #0d7a5f; background: #ecfdf5; }
    .warn { margin: 7px 0; padding: 7px 9px; border-left: 4px solid #c2410c; background: #fff7ed; }
    .page { break-before: page; }
    table { width: 100%; border-collapse: collapse; margin: 6px 0 8px; break-inside: avoid; }
    th, td { border: 1px solid #d1d9e6; padding: 4px 5px; vertical-align: top; }
    th { background: #eef2f7; color: #334155; text-align: left; }
    figure { margin: 6px 0 8px; break-inside: avoid; width: 100%; }
    figure img { display: block; width: 100%; max-height: 162mm; object-fit: contain; border: 1px solid #cfd7e3; border-radius: 5px; background: white; }
    figcaption { margin-top: 3px; color: #64748b; text-align: center; font-size: 9.2px; }
    ul { margin: 4px 0 8px 18px; padding: 0; }
    li { margin: 2px 0; }
  `;
  const html = `<!doctype html><html lang="th"><head><meta charset="utf-8"><title>คู่มือ Admin จำลองครบทุกหน้า</title><style>${css}</style></head><body>
    <section class="cover">
      <h1>คู่มือใช้งาน Admin<br>Project Stock QR / Job Transport QR System</h1>
      <p>คู่มือนี้แคปจากเว็บจริงโดยตรง: <b>${ORIGIN}</b></p>
      <div class="meta">
        <p><b>รูปแบบ:</b> A4 แนวตั้ง</p>
        <p><b>ข้อมูลจำลอง:</b> Job “คู่มือ DEMO”, รถ 1234, คนขับตัวอย่าง, ต้นทางบางซ่อน, ปลายทางร้าน A/B</p>
        <p><b>PO ที่ใช้จำลอง:</b> ${poText}</p>
        <p><b>Job ตัวอย่าง:</b> ${demoJob.id}</p>
      </div>
      <p class="warn"><b>หมายเหตุ:</b> ระบบสร้าง Job ตัวอย่างเพื่อแคปภาพ QR และ Monitor ให้เห็นจริง แล้วลบ Job ตัวอย่างออกหลังแคปครบ เพื่อคืนรายการ PO กลับคิว</p>
    </section>

    <section class="page">
      <h2>ภาพรวมขั้นตอน Admin</h2>
      ${table(["ลำดับ", "เมนู", "ภาพที่จำลองให้เห็น", "ผลลัพธ์"], [
        ["1", "หน้าแรก", "เห็นเมนูซ้ายและทางเข้าทุกหน้า", "รู้ว่าจะเริ่มจากเมนูไหน"],
        ["2", "นำเข้า PO", "เห็นหน้าจอนำเข้าไฟล์", "นำ PO เข้าคิว"],
        ["3", "PO รอจัดส่ง", "เห็นการติ๊กเลือก PO จริง", "พร้อมสร้างงาน"],
        ["4", "สร้างงาน", "เห็นการกรอกข้อมูลงานและปลายทาง", "สร้าง Job ได้ถูกต้อง"],
        ["5", "รายการงาน/QR", "เห็น Job ตัวอย่างและ QR", "ส่งให้คนขับได้"],
        ["6", "ติดตามงาน", "เห็น Monitor และตาราง PO", "ดูงาน realtime"],
        ["7", "Driver Room", "เห็นหน้าคนขับของ Job เดียวกัน", "ตรวจว่าคนขับเข้าใช้งานถูกหน้า"],
      ])}
      ${image("01-home.png", "ภาพจริง: หน้าแรก/เมนูหลัก")}
    </section>

    <section class="page">
      <h2>1. นำเข้า PO</h2>
      ${image("02-import-po.png", "ภาพจริง: หน้านำเข้า PO")}
      ${table(["จุดบนหน้าจอ", "ต้องทำอะไร", "ตรวจอะไร"], [
        ["เลือกไฟล์ Excel/CSV", "อัปโหลดไฟล์จาก SAP หรือ GR", "ไฟล์ต้องมีเลข PO, item, vendor, material และจำนวน"],
        ["ผลการนำเข้า", "ดูว่าระบบอ่านไฟล์สำเร็จ", "ถ้ามี error ให้แก้ไฟล์ก่อนนำเข้าใหม่"],
      ])}
    </section>

    <section class="page">
      <h2>2. PO รอจัดส่ง: จำลองเลือก PO</h2>
      ${image("03-select-po.png", "ภาพจริง: ติ๊กเลือก PO 2 รายการเพื่อสร้างงาน")}
      ${table(["ช่อง/ปุ่ม", "วิธีใช้", "ตัวอย่าง"], [
        ["ช่องค้นหา", "ค้นหาเลข PO หรือ vendor", "ใช้หา PO เฉพาะรายการ"],
        ["Checkbox หน้าแถว", "ติ๊กเฉพาะรายการที่จะสร้าง Job เดียวกัน", "เลือก 2 รายการ"],
        ["สร้างงานจากรายการที่เลือก", "กดหลังตรวจจำนวนรายการ", "ไปหน้าสร้างงาน"],
      ])}
    </section>

    <section class="page">
      <h2>3. สร้างงาน: กรอกข้อมูลหลัก</h2>
      ${image("04-create-job-top.png", "ภาพจริง: กรอกชื่อห้องงาน รถ คนขับ ต้นทาง และจำนวนสแกน")}
      ${table(["ช่อง", "ต้องกรอกอะไร", "ตัวอย่างในภาพ"], [
        ["ชื่อห้องงาน", "ชื่อสั้น ๆ ให้จำง่าย", "คู่มือ DEMO"],
        ["รถขนส่ง", "เลขรถหรือทะเบียน", "1234"],
        ["คนขับ", "ชื่อหรือรหัสคนขับ", "คนขับตัวอย่าง"],
        ["ต้นทาง", "จุดเริ่มงานที่ต้องเช็กอิน GPS", "บางซ่อน"],
        ["จำนวนที่ต้องสแกน", "จำนวนกล่อง/รอบสแกน", "1 ต่อรายการ"],
        ["หมายเหตุ", "คำสั่งเพิ่มเติม", "Job ตัวอย่างสำหรับทำคู่มือ"],
      ])}
    </section>

    <section class="page">
      <h2>4. สร้างงาน: กำหนดปลายทาง</h2>
      ${image("05-create-job-destination.png", "ภาพจริง: ผูก PO เข้าปลายทางและปุ่มสร้างงานจริง")}
      ${table(["ส่วน", "ต้องทำอะไร", "ตัวอย่าง"], [
        ["ชื่อปลายทาง", "กรอกชื่อจุดส่งที่คนขับเข้าใจ", "ร้าน A / โซนรับสินค้า 1"],
        ["ที่อยู่ / โลเคชัน", "กรอกรายละเอียดสถานที่", "ร้าน A บางซ่อน"],
        ["ติ๊ก PO เข้าปลายทาง", "เลือกว่าสินค้าใดไปปลายทางใด", "แยก PO ไปแต่ละร้าน"],
        ["สร้างงานจริงจากรายการที่เลือก", "กดเมื่อทุกข้อมูลถูกต้อง", "ระบบสร้าง Job และตัด PO ออกจากคิว"],
      ])}
    </section>

    <section class="page">
      <h2>5. รายการงาน: เห็น Job ที่สร้างแล้ว</h2>
      ${image("06-jobs-list-with-demo.png", "ภาพจริง: รายการงานมี Job คู่มือ DEMO")}
      ${table(["ปุ่ม", "ใช้ทำอะไร"], [
        ["Monitor/ติดตามงาน", "เปิดหน้าติดตามงานของ Job นี้"],
        ["เปิด Driver Room", "เปิดหน้าคนขับโดยตรง"],
        ["แสดง QR", "แสดง QR ให้คนขับสแกนเข้าห้องงาน"],
        ["ลบ Job", "ลบงานที่สร้างผิด"],
      ])}
    </section>

    <section class="page">
      <h2>6. QR สำหรับคนขับ</h2>
      ${image("07-job-qr-with-demo.png", "ภาพจริง: QR ของ Job คู่มือ DEMO")}
      <p class="note">Admin ต้องเช็กเลข Job, รถ และคนขับก่อนส่ง QR ให้คนขับ เพื่อป้องกันเข้าผิดห้องงาน</p>
    </section>

    <section class="page">
      <h2>7. ติดตามงาน: Monitor ส่วนบน</h2>
      ${image("08-monitor-demo-top.png", "ภาพจริง: Monitor ของ Job คู่มือ DEMO")}
      ${table(["ส่วน", "ความหมาย"], [
        ["ห้องงาน", "ชื่อ Job ที่กำลังดู"],
        ["Status", "สถานะงาน เช่น ready/in transit/completed"],
        ["ต้นทาง", "รอเช็กอิน / เช็กอินแล้ว / ปิดแล้ว"],
        ["Alert", "ความผิดปกติที่ต้องตรวจ"],
        ["ปุ่มกรณีพิเศษ", "Admin ใช้เปิดต้นทาง/ปลายทางเมื่อมีเหตุจำเป็น"],
      ])}
    </section>

    <section class="page">
      <h2>8. ติดตามงาน: ตาราง PO / Location</h2>
      ${image("09-monitor-demo-progress.png", "ภาพจริง: ตารางความคืบหน้าตาม Location / PO")}
      <p class="note"><b>กติกาสำคัญ:</b> เมื่อคนขับสแกนขึ้นรถครบ ระบบควรปิดต้นทาง เพื่อกันการเช็กอินต้นทางผิดที่ ถ้าต้องเปิดใหม่ให้ Admin เปิดกรณีพิเศษเท่านั้น</p>
    </section>

    <section class="page">
      <h2>9. ตรวจหน้าคนขับจากมุม Admin</h2>
      ${image("10-driver-room-demo.png", "ภาพจริง: Driver Room ของ Job คู่มือ DEMO")}
      <p class="note">ภาพนี้ช่วยให้ Admin เห็นว่าคนขับจะเจออะไรหลังสแกน QR ได้แก่ เช็กอินต้นทาง, สแกนขึ้นรถ และขั้นตอนส่งปลายทาง</p>
    </section>

    <section class="page">
      <h2>10. ประวัติงาน</h2>
      ${image("11-history.png", "ภาพจริง: เมนูประวัติงาน")}
      <h2>Checklist ก่อนใช้งานจริง</h2>
      <ul>
        <li>เลือก PO ถูกต้องและครบทุก item</li>
        <li>กรอกชื่อห้องงาน รถ คนขับ ต้นทาง และปลายทางครบ</li>
        <li>ตรวจจำนวนที่ต้องสแกนก่อนสร้างงานจริง</li>
        <li>ส่ง QR ของ Job ที่ถูกต้องเท่านั้น</li>
        <li>เปิดกรณีพิเศษเฉพาะเมื่อจำเป็นและตรวจหน้างานแล้ว</li>
      </ul>
    </section>
  </body></html>`;

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

async function main() {
  const data = await captureAll();
  await buildManual(data);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
