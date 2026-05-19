const { spawn } = require("node:child_process");
const fs = require("node:fs/promises");
const path = require("node:path");

const chromePath = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const origin = "https://project-stock-qr.vercel.app";
const outDir = "/Users/sasitorn/Project_Stock/real_admin_manual/screenshots";
const port = 9333;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function requestJson(url, options) {
  const response = await fetch(url, options);
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}: ${await response.text()}`);
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
      if (data.id && this.pending.has(data.id)) {
        const { resolve, reject } = this.pending.get(data.id);
        this.pending.delete(data.id);
        if (data.error) reject(new Error(data.error.message));
        else resolve(data.result);
      }
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
  for (let i = 0; i < 60; i++) {
    try {
      await requestJson(`http://127.0.0.1:${port}/json/version`);
      return;
    } catch {
      await sleep(250);
    }
  }
  throw new Error("Chrome did not start");
}

async function waitForText(cdp, text, timeout = 15000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    const result = await cdp.send("Runtime.evaluate", {
      expression: `document.body && document.body.innerText.includes(${JSON.stringify(text)})`,
      returnByValue: true,
    });
    if (result.result.value) return;
    await sleep(300);
  }
}

async function screenshot(cdp, name) {
  const result = await cdp.send("Page.captureScreenshot", {
    format: "png",
    captureBeyondViewport: false,
  });
  await fs.writeFile(path.join(outDir, `${name}.png`), Buffer.from(result.data, "base64"));
}

async function goto(cdp, url) {
  await cdp.send("Page.navigate", { url });
  await cdp.send("Page.loadEventFired").catch(() => {});
  await sleep(1800);
}

async function main() {
  await fs.mkdir(outDir, { recursive: true });
  const userDataDir = "/tmp/project-stock-real-admin-manual";
  const chrome = spawn(chromePath, [
    "--headless=new",
    "--disable-gpu",
    "--hide-scrollbars",
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${userDataDir}`,
    "--window-size=1440,1100",
    "about:blank",
  ], { stdio: "ignore" });

  try {
    await waitForChrome();
    const tab = await requestJson(`http://127.0.0.1:${port}/json/new`, { method: "PUT" });
    const cdp = new Cdp(tab.webSocketDebuggerUrl);
    await cdp.open();
    await cdp.send("Page.enable");
    await cdp.send("Runtime.enable");

    const recordsResponse = await fetch(`${origin}/api/po-registry?limit=20`).then((r) => r.json());
    const selectedKeys = recordsResponse.records.slice(0, 2).map((record) => record.registryKey);

    await goto(cdp, `${origin}/po/import`);
    await waitForText(cdp, "อัปโหลด PO");
    await screenshot(cdp, "01-real-import-po");

    await goto(cdp, `${origin}/po`);
    await waitForText(cdp, "PO รอจัดส่ง");
    await cdp.send("Runtime.evaluate", {
      expression: `
        (() => {
          const wanted = new Set(${JSON.stringify(selectedKeys)});
          document.querySelectorAll('input[type="checkbox"]').forEach((box) => {
            const row = box.closest('tr');
            if (!row) return;
            if ([...wanted].some((key) => row.innerText.includes(key.split('::')[0]))) {
              box.click();
            }
          });
        })();
      `,
    });
    await sleep(800);
    await screenshot(cdp, "02-real-select-po");

    await cdp.send("Runtime.evaluate", {
      expression: `
        sessionStorage.setItem('project-stock.selected-po-registry-keys', JSON.stringify(${JSON.stringify(selectedKeys)}));
      `,
    });
    await goto(cdp, `${origin}/jobs/new`);
    await waitForText(cdp, "รายละเอียดงานขนส่ง");
    await cdp.send("Runtime.evaluate", {
      expression: `
        (() => {
          const setValue = (input, value) => {
            const setter = Object.getOwnPropertyDescriptor(input instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype, 'value').set;
            setter.call(input, value);
            input.dispatchEvent(new Event('input', { bubbles: true }));
            input.dispatchEvent(new Event('change', { bubbles: true }));
          };
          const labels = [...document.querySelectorAll('label')];
          const byLabel = (text) => {
            const label = labels.find((current) => current.innerText.trim().includes(text));
            const id = label?.getAttribute('for');
            return id ? document.getElementById(id) : label?.parentElement?.querySelector('input,textarea');
          };
          setValue(byLabel('ชื่อห้อง Job'), 'A');
          setValue(byLabel('รถขนส่ง'), '1234');
          setValue(byLabel('คนขับ'), 'b');
          setValue(byLabel('ต้นทาง'), 'บางซ่อน');
          const note = byLabel('หมายเหตุ');
          if (note) setValue(note, 'ตัวอย่างคู่มือ: ส่งของรอบเช้า ตรวจจำนวนก่อนออกจากคลัง');
          document.querySelectorAll('input[type="number"]').forEach((input) => setValue(input, '1'));
          const textInputs = [...document.querySelectorAll('input[type="text"], input:not([type])')];
          const destinationName = textInputs.find((input) => input.value && /Digital|Operation|Concrete|ไม่ระบุ|ปลายทาง|Technology|Office/.test(input.value));
          if (destinationName) setValue(destinationName, 'ร้าน A / โซนรับสินค้า 1');
          const destinationAddress = textInputs.find((input) => input !== destinationName && input.value && /Digital|Operation|Concrete|ไม่ระบุ|ปลายทาง|Technology|Office/.test(input.value));
          if (destinationAddress) setValue(destinationAddress, 'ร้าน A บางซ่อน');
          window.scrollTo(0, 0);
        })();
      `,
    });
    await sleep(1200);
    await screenshot(cdp, "03-real-create-job-top");
    await cdp.send("Runtime.evaluate", { expression: "window.scrollTo(0, document.body.scrollHeight * 0.45)" });
    await sleep(700);
    await screenshot(cdp, "04-real-create-job-destination");

    await goto(cdp, `${origin}/jobs/monitor`);
    await waitForText(cdp, "Monitor Realtime");
    await screenshot(cdp, "05-real-monitor");

    await goto(cdp, `${origin}/jobs`);
    await waitForText(cdp, "รายการ Job");
    const jobIdResult = await cdp.send("Runtime.evaluate", {
      expression: `
        (() => {
          const link = [...document.querySelectorAll('a[href*="/driver-room?jobId="]')][0];
          if (link) return new URL(link.href).searchParams.get('jobId');
          const text = document.body.innerText.match(/JOB-\\d{8}-\\d{6}-\\d{6}/);
          return text ? text[0] : null;
        })();
      `,
      returnByValue: true,
    });
    const latestJobId = jobIdResult.result.value;
    await cdp.send("Runtime.evaluate", {
      expression: `
        (() => {
          const button = [...document.querySelectorAll('button')].find((item) => item.innerText.includes('ซ่อน QR') || item.innerText.includes('แสดง QR'));
          button?.click();
        })();
      `,
    });
    await sleep(1000);
    await screenshot(cdp, "06-real-job-list-qr");

    if (latestJobId) {
      await goto(cdp, `${origin}/jobs/monitor?jobId=${encodeURIComponent(latestJobId)}`);
      await waitForText(cdp, "ช่องทางเข้าหน้าคนขับ");
      await screenshot(cdp, "07-real-monitor-selected-job");
      await cdp.send("Runtime.evaluate", { expression: "window.scrollTo(0, document.body.scrollHeight * 0.55)" });
      await sleep(700);
      await screenshot(cdp, "08-real-monitor-progress");
    }

    await goto(cdp, `${origin}/jobs/history`);
    await waitForText(cdp, "ประวัติงาน");
    await screenshot(cdp, "09-real-history");

    cdp.close();
  } finally {
    chrome.kill("SIGTERM");
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
