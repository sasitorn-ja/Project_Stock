const { spawn } = require("node:child_process");
const fs = require("node:fs/promises");
const path = require("node:path");

const ROOT = "/Users/sasitorn/Project_Stock";
const ORIGIN = "https://project-stock-qr.vercel.app";
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const PORT = 9333;
const OUT_DIR = path.join(ROOT, "live_admin_manual");
const SHOT_DIR = path.join(OUT_DIR, "screenshots");
const HTML_PATH = path.join(ROOT, "คู่มือ_Admin_เว็บจริง_Project_Stock_QR.html");
const PDF_PATH = path.join(ROOT, "คู่มือ_Admin_เว็บจริง_Project_Stock_QR.pdf");

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function requestJson(url, options) {
  const response = await fetch(url, options);
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}: ${await response.text()}`);
  }
  return response.json();
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

async function goto(cdp, url, waitMs = 1800) {
  await cdp.send("Page.navigate", { url });
  await sleep(waitMs);
}

async function waitForText(cdp, text, timeoutMs = 18000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const result = await cdp.send("Runtime.evaluate", {
      expression: `Boolean(document.body && document.body.innerText.includes(${JSON.stringify(text)}))`,
      returnByValue: true,
    });
    if (result.result.value) return;
    await sleep(300);
  }
  throw new Error(`Timed out waiting for text: ${text}`);
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
  const body = await cdp.send("Runtime.evaluate", {
    expression: `(document.body?.innerText || "").slice(0, 500)`,
    returnByValue: true,
  });
  throw new Error(`Timed out waiting for any text: ${texts.join(", ")}. Body: ${body.result.value}`);
}

async function screenshot(cdp, filename) {
  const result = await cdp.send("Page.captureScreenshot", {
    format: "png",
    captureBeyondViewport: false,
    fromSurface: true,
  });
  await fs.writeFile(path.join(SHOT_DIR, filename), Buffer.from(result.data, "base64"));
}

async function getLiveData() {
  const poResponse = await fetch(`${ORIGIN}/api/po-registry?limit=20`).then((r) => r.json());
  const records = (poResponse.records || []).slice(0, 2);
  const jobsResponse = await fetch(`${ORIGIN}/api/jobs`).then((r) => r.json()).catch(() => ({ jobs: [] }));
  return {
    records,
    selectedKeys: records.map((record) => record.registryKey),
    latestJob: (jobsResponse.jobs || [])[0] || null,
  };
}

async function capture() {
  await fs.mkdir(SHOT_DIR, { recursive: true });
  const chrome = spawn(CHROME, [
    "--headless=new",
    "--disable-gpu",
    "--hide-scrollbars",
    `--remote-debugging-port=${PORT}`,
    "--user-data-dir=/tmp/project-stock-live-admin-manual",
    "--window-size=1440,1100",
    "about:blank",
  ], { stdio: "ignore" });

  try {
    await waitForChrome();
    const tab = await requestJson(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: "PUT" });
    const cdp = new Cdp(tab.webSocketDebuggerUrl);
    await cdp.open();
    await cdp.send("Page.enable");
    await cdp.send("Runtime.enable");

    const { records, selectedKeys, latestJob } = await getLiveData();

    await goto(cdp, `${ORIGIN}/`);
    await sleep(1200);
    await screenshot(cdp, "01-home.png");

    await goto(cdp, `${ORIGIN}/po/import`);
    await waitForText(cdp, "นำเข้า PO");
    await screenshot(cdp, "02-import-po.png");

    await goto(cdp, `${ORIGIN}/po`);
    await waitForText(cdp, "PO รอจัดส่ง");
    await cdp.send("Runtime.evaluate", {
      expression: `
        (() => {
          const wanted = new Set(${JSON.stringify(selectedKeys)});
          document.querySelectorAll('input[type="checkbox"]').forEach((box) => {
            const row = box.closest('tr');
            if (!row) return;
            if ([...wanted].some((key) => row.innerText.includes(key.split('::')[0])) && !box.checked) {
              box.click();
            }
          });
          window.scrollTo(0, 0);
        })();
      `,
    });
    await sleep(900);
    await screenshot(cdp, "03-po-select.png");

    await cdp.send("Runtime.evaluate", {
      expression: `sessionStorage.setItem('project-stock.selected-po-registry-keys', JSON.stringify(${JSON.stringify(selectedKeys)}));`,
    });
    await goto(cdp, `${ORIGIN}/jobs/new`, 2200);
    await waitForAnyText(cdp, ["สร้าง Job", "รายละเอียดงานขนส่ง", "รายการที่เลือกจาก PO", "กลับไปเลือก PO"]);
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
          setValue(byLabel('ชื่อห้อง Job'), 'A');
          setValue(byLabel('รถขนส่ง'), '1234');
          setValue(byLabel('คนขับ'), 'b');
          setValue(byLabel('ต้นทาง'), 'บางซ่อน');
          setValue(byLabel('หมายเหตุ'), 'ตัวอย่างคู่มือ: ส่งของรอบเช้า ตรวจจำนวนก่อนออกจากคลัง');
          document.querySelectorAll('input[type="number"]').forEach((input) => setValue(input, '1'));
          const destinationCards = [...document.querySelectorAll('input')].filter((input) => input.value);
          const destinationName = destinationCards.find((input) => /ร้าน|Digital|Concrete|Operation|Service|Office/.test(input.value));
          if (destinationName) setValue(destinationName, 'ร้าน A / โซนรับสินค้า 1');
          const destinationAddress = destinationCards.find((input) => input !== destinationName && /ร้าน|Digital|Concrete|Operation|Service|Office/.test(input.value));
          if (destinationAddress) setValue(destinationAddress, 'ร้าน A บางซ่อน');
          window.scrollTo(0, 0);
        })();
      `,
    });
    await sleep(1000);
    await screenshot(cdp, "04-create-job-top.png");
    await cdp.send("Runtime.evaluate", { expression: "window.scrollTo(0, Math.max(0, document.body.scrollHeight * 0.46))" });
    await sleep(800);
    await screenshot(cdp, "05-create-job-destination.png");

    await goto(cdp, `${ORIGIN}/jobs`);
    await waitForAnyText(cdp, ["รายการ Job", "รายการงาน", "งานทั้งหมด"]);
    await screenshot(cdp, "06-jobs-list.png");
    await cdp.send("Runtime.evaluate", {
      expression: `
        (() => {
          const button = [...document.querySelectorAll('button')].find((item) => item.innerText.includes('แสดง QR'));
          button?.click();
          window.scrollTo(0, 0);
        })();
      `,
    });
    await sleep(1000);
    await screenshot(cdp, "07-job-qr.png");

    if (latestJob?.id) {
      await goto(cdp, `${ORIGIN}/jobs/monitor?jobId=${encodeURIComponent(latestJob.id)}`);
      await waitForAnyText(cdp, ["ช่องทางเข้าหน้าคนขับ", "เปิดหน้าคนขับ", "แผนส่งตาม", "Monitor"]);
      await screenshot(cdp, "08-monitor-top.png");
      await cdp.send("Runtime.evaluate", { expression: "window.scrollTo(0, Math.max(0, document.body.scrollHeight * 0.55))" });
      await sleep(800);
      await screenshot(cdp, "09-monitor-progress.png");
    } else {
      await goto(cdp, `${ORIGIN}/jobs/monitor`);
      await waitForAnyText(cdp, ["ติดตามงาน", "เลือกงาน", "Monitor", "ข้อมูลสด"]);
      await screenshot(cdp, "08-monitor-top.png");
      await screenshot(cdp, "09-monitor-progress.png");
    }

    await goto(cdp, `${ORIGIN}/jobs/history`);
    await waitForAnyText(cdp, ["ประวัติงาน", "ประวัติ"]);
    await screenshot(cdp, "10-history.png");

    cdp.close();
    return { records, latestJob };
  } finally {
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

async function buildManual({ records, latestJob }) {
  const poExamples = records.map((record) => `${record.poSapNo} item ${record.poSapItem}`).join(", ") || "PO ตัวอย่างจากระบบจริง";
  const latestJobText = latestJob ? `${latestJob.roomName || latestJob.id} / ${latestJob.vehicle || "-"} / ${latestJob.driver || "-"}` : "ไม่มี Job ตัวอย่างในระบบ";
  const jobListNote = latestJob
    ? "ภาพนี้แสดงรายการ Job จริงและปุ่มใช้งานสำหรับเปิด Monitor, Driver Room และ QR"
    : "ภาพนี้เป็นสถานะเว็บจริงตอนแคป: ยังไม่มี Job ที่ถูกสร้างจากข้อมูลจริง จึงยังไม่แสดง QR/Driver Room จนกว่า Admin จะกดสร้าง Job จริง";
  const css = `
    @page { size: A4 landscape; margin: 10mm; }
    * { box-sizing: border-box; }
    body { margin: 0; color: #111827; font-family: Tahoma, "Noto Sans Thai", Arial, sans-serif; font-size: 11.7px; line-height: 1.5; }
    h1 { margin: 0 0 8px; font-size: 24px; color: #0f172a; }
    h2 { margin: 15px 0 7px; font-size: 16px; color: #0d7a5f; break-after: avoid; }
    h3 { margin: 11px 0 5px; font-size: 13px; color: #0f172a; }
    p { margin: 4px 0 7px; }
    .cover { min-height: 176mm; display: flex; flex-direction: column; justify-content: center; border: 1px solid #d7dee8; border-radius: 10px; padding: 28px; background: #f8fafc; }
    .meta { margin-top: 16px; color: #475569; font-size: 13px; }
    .note { margin: 8px 0; padding: 8px 10px; border-left: 4px solid #0d7a5f; background: #ecfdf5; }
    .warn { margin: 8px 0; padding: 8px 10px; border-left: 4px solid #c2410c; background: #fff7ed; }
    .page { break-before: page; }
    table { width: 100%; border-collapse: collapse; margin: 7px 0 10px; break-inside: avoid; }
    th, td { border: 1px solid #d1d9e6; padding: 5px 6px; vertical-align: top; }
    th { background: #eef2f7; color: #334155; text-align: left; }
    figure { margin: 7px 0 10px; break-inside: avoid; }
    figure img { display: block; width: 100%; max-height: 139mm; object-fit: contain; border: 1px solid #cfd7e3; border-radius: 6px; background: #f8fafc; }
    figcaption { margin-top: 4px; color: #64748b; text-align: center; font-size: 10px; }
    ul, ol { margin: 4px 0 8px 19px; padding: 0; }
    li { margin: 2px 0; }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; align-items: start; }
  `;
  const html = `<!doctype html><html lang="th"><head><meta charset="utf-8"><title>คู่มือ Admin Project Stock QR</title><style>${css}</style></head><body>
    <section class="cover">
      <h1>คู่มือใช้งาน Admin<br>Project Stock QR / Job Transport QR System</h1>
      <p>คู่มือนี้ทำจากภาพหน้าจอที่แคปจากเว็บจริงโดยตรง: <b>${ORIGIN}</b></p>
      <div class="meta">
        <p><b>วันที่จัดทำ:</b> 19 พฤษภาคม 2026</p>
        <p><b>ขอบเขต:</b> สำหรับ Admin เท่านั้น ตั้งแต่นำเข้า PO, เลือก PO, สร้าง Job, ส่ง QR ให้คนขับ, Monitor และดูประวัติ</p>
        <p><b>ข้อมูลจำลองที่กรอกบนฟอร์มจริง:</b> ห้อง A / รถ 1234 / คนขับ b / ต้นทางบางซ่อน / ปลายทางร้าน A</p>
        <p><b>PO ตัวอย่างจากระบบจริง:</b> ${poExamples}</p>
      </div>
      <p class="warn"><b>หมายเหตุ:</b> คู่มือนี้กรอกข้อมูลจำลองบนหน้าเว็บจริง แต่ไม่ได้กดปุ่มสร้าง Job จริง เพื่อไม่ให้ข้อมูลจริงในระบบเปลี่ยน</p>
    </section>

    <section class="page">
      <h2>ภาพรวมการทำงานของ Admin</h2>
      ${table(["ลำดับ", "เมนู", "สิ่งที่ Admin ต้องทำ", "ผลลัพธ์"], [
        ["1", "หน้าแรก/เมนูหลัก", "เลือกเมนูที่ต้องทำงาน เช่น นำเข้า PO หรือ PO รอจัดส่ง", "เข้าสู่หน้าที่ถูกต้อง"],
        ["2", "นำเข้า PO", "อัปโหลดไฟล์ Excel/CSV จาก SAP หรือไฟล์ GR", "ข้อมูล PO เข้าไปอยู่ในคิว"],
        ["3", "PO รอจัดส่ง", "ค้นหาและติ๊กเลือก PO/Item ที่จะส่งในรอบเดียวกัน", "ได้รายการที่จะสร้าง Job"],
        ["4", "สร้าง Job", "กรอกห้องงาน รถ คนขับ ต้นทาง ปลายทาง และจำนวนที่ต้องสแกน", "พร้อมสร้าง Job"],
        ["5", "รายการ Job", "เปิด Driver Room หรือแสดง QR ให้คนขับ", "คนขับเข้าห้องงานถูกต้อง"],
        ["6", "Monitor Realtime", "ติดตามโหลดขึ้นรถ ลงของ ปลายทาง และ Alert", "ควบคุมงานจริงได้"],
        ["7", "ประวัติงาน", "ตรวจงานย้อนหลัง", "ใช้ตรวจสอบ/ทำรายงาน"],
      ])}
      ${image("01-home.png", "ภาพจริงจากเว็บ: หน้าแรก/เมนูหลักของระบบ")}
    </section>

    <section class="page">
      <h2>1. นำเข้า PO</h2>
      ${image("02-import-po.png", "ภาพจริงจากเว็บ: หน้า นำเข้า PO")}
      ${table(["จุดบนหน้าจอ", "กรอก/กดอะไร", "รายละเอียดที่ต้องตรวจ"], [
        ["เลือกไฟล์ Excel/CSV", "กดเลือกไฟล์หรือลากไฟล์มาวาง", "ไฟล์ควรมี PO SAP No., Item, Vendor, PO Web No., Material Code, Material Name, จำนวน"],
        ["รายการที่นำเข้า", "ตรวจผลหลังระบบอ่านไฟล์", "ถ้ามี error ให้แก้ไฟล์ก่อนนำเข้าใหม่"],
        ["ข้อมูลซ้ำ", "ตรวจ PO ที่เคยนำเข้าแล้ว", "อย่านำเข้าซ้ำถ้าไม่แน่ใจ เพราะจะทำให้เลือกสร้าง Job ผิดรอบได้"],
      ])}
      <p class="note">หลังนำเข้าเสร็จ ให้ไปเมนู <b>PO รอจัดส่ง</b> เพื่อเลือก PO สำหรับสร้าง Job</p>
    </section>

    <section class="page">
      <h2>2. เลือก PO รอจัดส่ง</h2>
      ${image("03-po-select.png", "ภาพจริงจากเว็บ: เลือก PO ที่จะสร้าง Job")}
      ${table(["ช่อง/ปุ่ม", "วิธีใช้", "ตัวอย่างจากภาพ"], [
        ["ช่องค้นหา", "ค้นด้วยเลข PO, Vendor, PO Web No. หรือวัสดุ", "ใช้เมื่อต้องหา PO เฉพาะรายการ"],
        ["Checkbox หน้าแถว", "ติ๊กเฉพาะรายการที่จะรวมใน Job เดียว", "เลือก 2 รายการจากข้อมูลจริง"],
        ["เลือกทั้งหมดตามผลค้นหา", "ใช้เมื่อผลค้นหาทั้งหมดต้องส่งรอบเดียวกัน", "ควรตรวจทุกแถวก่อนกด"],
        ["สร้าง Job จากรายการที่เลือก", "กดเพื่อไปหน้าสร้าง Job", "กดหลังจำนวนที่เลือกถูกต้อง"],
        ["ลบรายการที่เลือก/ล้างคิว", "ใช้เมื่อต้องลบข้อมูลคิว", "ควรใช้ด้วยความระวัง"],
      ])}
    </section>

    <section class="page">
      <h2>3. สร้าง Job: กรอกข้อมูลงานขนส่ง</h2>
      ${image("04-create-job-top.png", "ภาพจริงจากเว็บ: หน้า สร้าง Job ส่วนบน พร้อมข้อมูลจำลอง")}
      ${table(["ช่อง", "ต้องกรอกอะไร", "ตัวอย่าง", "ข้อควรระวัง"], [
        ["จำนวนที่ต้องสแกน", "จำนวนกล่อง/รอบสแกนที่ต้องการให้คนขับสแกน", "1", "เป็นจำนวนสำหรับหน้างาน ไม่ใช่จำนวนสั่งซื้อใน SAP เสมอไป"],
        ["ชื่อห้อง Job", "ชื่อห้องงานสั้น ๆ ที่จำง่าย", "A", "คนขับจะเห็นบนมือถือ ควรสั้นและชัด"],
        ["รถขนส่ง", "เลขรถหรือทะเบียน", "1234", "ต้องตรงกับรถจริง"],
        ["คนขับ", "ชื่อหรือรหัสคนขับ", "b", "ใช้ระบุว่าเป็นงานของใคร"],
        ["ต้นทาง", "ชื่อจุดเริ่มงานที่ต้องเช็กอิน GPS", "บางซ่อน", "GPS ต้นทางระบบดึงจากมือถือคนขับ ไม่ต้องกรอกเอง"],
        ["หมายเหตุ", "ข้อมูลกำกับงาน", "ส่งของรอบเช้า ตรวจจำนวนก่อนออกจากคลัง", "ใส่เฉพาะสิ่งที่ช่วยให้หน้างานทำถูก"],
      ])}
    </section>

    <section class="page">
      <h2>4. สร้าง Job: กำหนดปลายทางและผูก PO</h2>
      ${image("05-create-job-destination.png", "ภาพจริงจากเว็บ: ส่วนปลายทางในหน้า สร้าง Job")}
      ${table(["ช่อง/ส่วน", "ต้องทำอะไร", "ตัวอย่าง"], [
        ["ชื่อปลายทาง", "กรอกชื่อจุดส่งที่คนขับเข้าใจ", "ร้าน A / โซนรับสินค้า 1"],
        ["ที่อยู่ / โลเคชัน", "กรอกสถานที่หรือคำอธิบายตำแหน่ง", "ร้าน A บางซ่อน"],
        ["ติ๊ก PO SAP No. เข้าปลายทางนี้", "เลือกว่าสินค้าแต่ละรายการต้องไปปลายทางไหน", "ติ๊ก PO ที่ต้องส่งร้าน A"],
        ["เพิ่มปลายทาง", "กดเมื่อ Job เดียวมีหลายจุดส่ง", "เพิ่มจุดส่งใหม่แล้วผูก PO ให้ถูกจุด"],
        ["สร้าง Job จริงจากรายการที่เลือก", "กดเมื่อทุกข้อมูลถูกต้องแล้ว", "ในคู่มือนี้ไม่ได้กด เพื่อไม่แก้ข้อมูลจริง"],
      ])}
      <p class="warn">ก่อนกดสร้างจริง ต้องตรวจ 5 อย่าง: PO ถูกต้อง, จำนวนสแกนถูกต้อง, รถถูกต้อง, คนขับถูกต้อง, ปลายทางถูกต้อง</p>
    </section>

    <section class="page">
      <h2>5. รายการ Job และ QR สำหรับคนขับ</h2>
      <p class="${latestJob ? "note" : "warn"}">${jobListNote}</p>
      <div class="grid">
        <div>${image("06-jobs-list.png", "ภาพจริงจากเว็บ: รายการงาน")}</div>
        <div>${image("07-job-qr.png", latestJob ? "ภาพจริงจากเว็บ: แสดง QR สำหรับคนขับ" : "ภาพจริงจากเว็บ: ยังไม่มี QR เพราะยังไม่มี Job จริงในระบบตอนแคป")}</div>
      </div>
      ${table(["ปุ่ม/ข้อมูล", "ใช้ทำอะไร", "วิธีใช้งาน"], [
        ["Monitor", "เปิดหน้าติดตาม Job", "ใช้ดูสถานะการโหลด/ส่ง/Alert"],
        ["เปิด Driver Room", "เปิดหน้าคนขับโดยตรง", "ใช้ทดสอบหรือเปิดให้คนขับจากเครื่อง Admin"],
        ["แสดง QR สำหรับคนขับ", "ให้คนขับสแกนเข้าห้องงาน", "ปุ่มนี้จะแสดงหลังมี Job จริงแล้ว ให้เช็กเลข Job, รถ, คนขับ ก่อนให้สแกน"],
        ["ลิงก์ Driver Room", "ใช้แทน QR เมื่อสแกนไม่ได้", "ส่งลิงก์ให้มือถือคนขับ"],
        ["ลบ Job", "ลบงานที่สร้างผิด", "ควรใช้เฉพาะงานที่ยืนยันแล้วว่าผิด"],
      ])}
    </section>

    <section class="page">
      <h2>6. Monitor Realtime</h2>
      ${image("08-monitor-top.png", "ภาพจริงจากเว็บ: Monitor ของ Job ตัวอย่าง ${latestJobText}")}
      ${table(["ส่วน", "ความหมาย", "Admin ต้องดูอะไร"], [
        ["ห้อง Job", "งานที่กำลังติดตาม", "ต้องตรงกับงานที่ส่ง QR ให้คนขับ"],
        ["Status", "สถานะงาน เช่น ready/in progress/completed", "ดูว่างานเดินตามขั้นตอนหรือไม่"],
        ["ต้นทาง", "สถานะเช็กอินต้นทาง", "รอเช็กอิน / เช็กอินแล้ว / ปิดแล้ว"],
        ["Route", "จำนวนปลายทาง", "ต้องตรงกับแผนส่ง"],
        ["Alerts", "จำนวนเหตุผิดปกติ", "ถ้ามี Alert ให้ตรวจรายละเอียดทันที"],
        ["Admin เปิดปลายทางกรณีพิเศษ", "เปิดให้ทำปลายทางเมื่อเงื่อนไขปกติยังไม่ผ่าน", "ใช้เมื่อจำเป็นและตรวจหน้างานแล้ว"],
        ["Admin เปิดต้นทางกรณีพิเศษ", "เปิดเช็กอินต้นทางใหม่หลังระบบปิดต้นทาง", "ใช้เมื่อโหลดเพิ่มหรือแก้เหตุผิดจริง"],
      ])}
    </section>

    <section class="page">
      <h2>7. ดูความคืบหน้าตาม Location / PO</h2>
      ${image("09-monitor-progress.png", "ภาพจริงจากเว็บ: ตารางความคืบหน้าตาม Location / PO")}
      ${table(["คอลัมน์/สถานะ", "ความหมาย", "สิ่งที่ Admin ต้องทำ"], [
        ["ต้องสแกน", "จำนวนที่ Admin กำหนดไว้ตอนสร้าง Job", "ตรวจว่าไม่มาก/น้อยเกินจริง"],
        ["Loaded / ขึ้นรถ", "จำนวนที่คนขับสแกนขึ้นรถแล้ว", "ถ้ายังไม่ครบ ให้คนขับสแกนต่อ"],
        ["Delivered / ลงของ", "จำนวนที่ส่งปลายทางแล้ว", "ต้องครบเมื่อปิดงาน"],
        ["GPS ส่งของ", "สถานะเช็กอินปลายทาง", "ถ้า GPS ไม่ถูก ให้ตรวจหน้างานก่อนเปิดกรณีพิเศษ"],
        ["Alert Queue", "เหตุผิดปกติจากการสแกน", "อ่านรายละเอียดก่อนสั่งให้คนขับทำต่อ"],
      ])}
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
      <h2>Checklist สำหรับ Admin ก่อนส่งงานให้คนขับ</h2>
      <ul>
        <li>เลือก PO ถูกต้องและครบทุก item ที่ต้องส่ง</li>
        <li>กรอกชื่อห้อง Job ให้สั้นและจำง่าย</li>
        <li>ตรวจรถและคนขับให้ตรงกับงานจริง</li>
        <li>ตรวจต้นทางและปลายทางให้ถูกต้อง</li>
        <li>ตรวจจำนวนที่ต้องสแกนก่อนกดสร้าง Job จริง</li>
        <li>ส่ง QR หรือลิงก์ Driver Room ของ Job ที่ถูกต้องเท่านั้น</li>
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
}

async function main() {
  const data = await capture();
  await buildManual(data);
  console.log(PDF_PATH);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
