from pathlib import Path
import subprocess
import textwrap


ROOT = Path("/Users/sasitorn/Project_Stock")
OUT_DIR = ROOT / "admin_job_manual"
SHOT_DIR = OUT_DIR / "screenshots"
PDF = ROOT / "คู่มือ_Admin_จำลองสร้าง_Job_Project_Stock_QR.pdf"
HTML_MANUAL = ROOT / "คู่มือ_Admin_จำลองสร้าง_Job_Project_Stock_QR.html"
CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"


OUT_DIR.mkdir(exist_ok=True)
SHOT_DIR.mkdir(exist_ok=True)


CSS = """
*{box-sizing:border-box}
body{margin:0;background:#f3f5f8;color:#172033;font-family:Tahoma,'Noto Sans Thai',Arial,sans-serif;font-size:14px}
.app{display:grid;grid-template-columns:240px 1fr;min-height:900px}
.sidebar{background:white;border-right:1px solid #d8dde6;padding:16px}
.brand{display:flex;gap:10px;align-items:center;margin-bottom:24px}
.logo{width:34px;height:34px;border-radius:8px;background:#111827;color:white;display:grid;place-items:center;font-weight:700}
.brand b{display:block}.brand span{color:#64748b;font-size:12px}
.nav-title{letter-spacing:.18em;color:#64748b;font-size:11px;font-weight:700;margin:18px 0 8px}
.nav div{padding:10px 12px;border-radius:8px;color:#334155;margin:2px 0}
.nav .active{background:#ecfdf5;color:#047857;font-weight:700;border-left:4px solid #10b981}
.main{padding:26px 28px}
.top{height:56px;border-bottom:1px solid #d8dde6;background:white;display:flex;align-items:center;justify-content:space-between;padding:0 20px}
h1{font-size:24px;margin:0 0 6px} h2{font-size:18px;margin:0} p{margin:0}.muted{color:#64748b}
.actions{display:flex;gap:10px;margin:18px 0}.btn{border:1px solid #cfd7e3;background:white;border-radius:8px;padding:10px 14px;font-weight:700}.btn.black{background:#111;color:white}.btn.green{background:#047857;color:white}.btn.red{background:#b91c1c;color:white}.btn.disabled{opacity:.45}
.card{background:white;border:1px solid #d8dde6;border-radius:10px;margin-top:18px;overflow:hidden}.card-h{padding:16px 18px;border-bottom:1px solid #d8dde6}.card-b{padding:18px}
.grid{display:grid;gap:16px}.grid2{grid-template-columns:1fr 1fr}.grid3{grid-template-columns:repeat(3,1fr)}.grid4{grid-template-columns:repeat(4,1fr)}
.field label{display:block;font-weight:700;margin-bottom:6px}.field input,.field textarea,.field select{width:100%;border:1px solid #cbd5e1;border-radius:8px;padding:11px 12px;background:white;font:inherit}.field small{display:block;color:#64748b;margin-top:5px}.field textarea{min-height:72px}
table{width:100%;border-collapse:collapse;background:white}th,td{border-bottom:1px solid #e5e7eb;padding:11px 12px;text-align:left;vertical-align:top}th{font-size:12px;text-transform:uppercase;color:#64748b;background:#f8fafc}.check{width:22px;height:22px;accent-color:#059669}.badge{display:inline-block;border-radius:999px;padding:5px 10px;background:#f1f5f9;font-weight:700;font-size:12px}.badge.warn{background:#fff7ed;color:#b45309}.badge.ok{background:#ecfdf5;color:#047857}.note{border:1px solid #fde68a;background:#fffbeb;border-radius:8px;padding:12px;color:#92400e}.kpi{border:1px solid #d8dde6;border-radius:9px;padding:14px;background:#f8fafc}.kpi small{color:#64748b}.kpi b{display:block;font-size:20px;margin-top:4px}.upload{border:2px dashed #cbd5e1;border-radius:14px;background:#f8fafc;height:330px;display:grid;place-items:center;text-align:center}.upload b{font-size:22px}.pill{display:inline-block;background:#f97316;color:white;border-radius:999px;padding:7px 13px;font-weight:700}
.qr{width:150px;height:150px;background:repeating-linear-gradient(45deg,#111 0 8px,#fff 8px 16px);border:10px solid white;box-shadow:0 0 0 1px #d8dde6}
"""


def shell_quote(path: Path) -> str:
    return str(path).replace(" ", "%20")


def page(title: str, active: str, body: str) -> str:
    return f"""<!doctype html><html lang="th"><head><meta charset="utf-8"><style>{CSS}</style></head><body>
    <div class="top"><div>☰</div><div><span class="logo" style="display:inline-grid;width:24px;height:24px;font-size:12px">ST</span> Store Transport · DC Bangna</div></div>
    <div class="app">
      <aside class="sidebar">
        <div class="brand"><div class="logo">ST</div><div><b>Job Transport</b><span>Store QR System</span></div></div>
        <div class="nav">
          <div class="nav-title">JOB TRANSPORT</div>
          {''.join(f'<div class="{ "active" if item == active else "" }">{item}</div>' for item in ["นำเข้า PO","PO รอจัดส่ง","สร้าง Job","Monitor Realtime","Driver Room"])}
          <div class="nav-title">MANAGEMENT</div>
          {''.join(f'<div class="{ "active" if item == active else "" }">{item}</div>' for item in ["รายการ Job","ประวัติงาน"])}
        </div>
      </aside>
      <main class="main"><h1>{title}</h1>{body}</main>
    </div></body></html>"""


pages = {
    "01-import-po": page(
        "อัปโหลด PO จาก SAP",
        "นำเข้า PO",
        """
        <p class="muted">นำเข้าไฟล์ Excel / CSV เพื่อเพิ่มรายการ PO เข้าคิวรอจัดส่ง</p>
        <div class="card"><div class="card-b">
          <div class="upload">
            <div><b>ลากไฟล์มาวางที่นี่</b><p class="muted" style="margin:10px 0">หรือเลือกไฟล์ Excel / CSV</p><button class="btn black">เลือกไฟล์ Excel / CSV</button><p class="muted" style="margin-top:14px">ตัวอย่าง: GR_ADMIN_TRAINING.xlsx</p></div>
          </div>
        </div></div>
        <div class="card"><div class="card-h"><h2>ข้อมูลตัวอย่างในไฟล์</h2></div><div class="card-b">
          <table><tr><th>PO SAP No.</th><th>Item</th><th>Vendor</th><th>รหัสวัสดุ</th><th>สินค้า</th><th>จำนวน</th></tr>
          <tr><td>8030492670</td><td>1</td><td>บจ.ชวนันท์ คอร์ปอเรชั่น</td><td>80216114</td><td>SMC ชัตเติ้ลวาล์วฟิตติ้งแบบ วันทัช</td><td>1</td></tr>
          <tr><td>8030492670</td><td>2</td><td>บจ.ชวนันท์ คอร์ปอเรชั่น</td><td>80216123</td><td>SMC ตัวควบคุมปริมาณลม</td><td>1</td></tr></table>
        </div></div>
        """,
    ),
    "02-select-po": page(
        "PO รอจัดส่ง",
        "PO รอจัดส่ง",
        """
        <p class="muted">เลือกรายการ PO ที่นำเข้าแล้วเพื่อสร้าง Job ขนส่ง</p>
        <div class="actions"><button class="btn">รีเฟรชรายการ</button><button class="btn">เลือกทั้งหมดตามผลค้นหา</button><button class="btn black">สร้าง Job จากรายการที่เลือก</button><span class="badge ok">เลือกแล้ว 2 รายการ</span></div>
        <div class="card"><div class="card-h"><h2>คิวจากไฟล์ GR</h2><p class="muted">ค้นหาและเลือกรายการที่ต้องนำไปสร้าง Job</p></div>
        <div class="card-b"><div class="field" style="margin-bottom:14px"><input value="8030492670" /></div>
        <table><tr><th></th><th>PO SAP No.</th><th>Item</th><th>Vendor</th><th>PO Web No.</th><th>รหัสวัสดุ</th><th>ชื่อวัสดุ</th><th>จำนวน</th></tr>
        <tr><td><input class="check" type="checkbox" checked></td><td>8030492670</td><td>1</td><td>บจ.ชวนันท์ คอร์ปอเรชั่น</td><td>F6831000181D80T-A</td><td>80216114</td><td>SMC ชัตเติ้ลวาล์วฟิตติ้งแบบ วันทัช</td><td>1</td></tr>
        <tr><td><input class="check" type="checkbox" checked></td><td>8030492670</td><td>2</td><td>บจ.ชวนันท์ คอร์ปอเรชั่น</td><td>F6831000181D80T-A</td><td>80216123</td><td>SMC ตัวควบคุมปริมาณลม</td><td>1</td></tr>
        </table></div></div>
        """,
    ),
    "03-create-job": page(
        "สร้าง Job จาก PO",
        "สร้าง Job",
        """
        <p class="muted">กรอกข้อมูลงานขนส่งจริง ก่อนส่งต่อให้ห้องคนขับ</p>
        <section class="grid grid2">
          <div class="card"><div class="card-h"><h2>รายการที่เลือกจาก PO รอจัดส่ง</h2></div><div class="card-b">
            <table><tr><th>PO</th><th>Item</th><th>สินค้า</th><th>ต้องสแกน</th></tr>
            <tr><td>8030492670</td><td>1</td><td>SMC ชัตเติ้ลวาล์วฟิตติ้ง</td><td><input style="width:70px" value="1"></td></tr>
            <tr><td>8030492670</td><td>2</td><td>SMC ตัวควบคุมปริมาณลม</td><td><input style="width:70px" value="1"></td></tr></table>
            <p class="note" style="margin-top:14px">จำนวนที่ต้องสแกน = จำนวนกล่อง/รอบสแกน ไม่จำเป็นต้องเท่าจำนวนในไฟล์ SAP</p>
          </div></div>
          <div class="card"><div class="card-h"><h2>รายละเอียดงานขนส่ง</h2></div><div class="card-b grid">
            <div class="field"><label>ชื่อห้อง Job</label><input value="A"><small>ชื่อสั้น ๆ ที่ Admin และคนขับเข้าใจ เช่น A, รอบเช้า, บางซ่อน</small></div>
            <div class="grid grid2"><div class="field"><label>รถขนส่ง</label><input value="1234"></div><div class="field"><label>คนขับ</label><input value="b"></div></div>
            <div class="field"><label>ต้นทาง</label><input value="บางซ่อน"><small>จุดที่คนขับต้องกดเช็กอิน GPS ก่อนเริ่มสแกนขึ้นรถ</small></div>
            <div class="field"><label>หมายเหตุ</label><textarea>ส่งของรอบเช้า ตรวจจำนวนก่อนออกจากคลัง</textarea></div>
          </div></div>
        </section>
        <div class="card"><div class="card-h"><h2>สรุปปลายทาง</h2></div><div class="card-b">
          <div class="grid grid2"><div class="field"><label>ชื่อปลายทาง</label><input value="ร้าน A / โซนรับสินค้า 1"></div><div class="field"><label>ที่อยู่หรือโลเคชัน</label><input value="ร้าน A บางซ่อน"></div></div>
          <div class="actions"><button class="btn black">สร้าง Job จริงจากรายการที่เลือก</button></div>
        </div></div>
        """,
    ),
    "04-monitor": page(
        "Monitor Realtime",
        "Monitor Realtime",
        """
        <p class="muted">ดูสถานะโหลดต้นทาง ส่งปลายทาง และ alert ของ Job</p>
        <div class="grid grid4">
          <div class="kpi"><small>ห้อง Job</small><b>A</b></div><div class="kpi"><small>Status</small><b>ready</b></div><div class="kpi"><small>ต้นทาง</small><b>รอเช็กอิน</b></div><div class="kpi"><small>Alerts</small><b>0</b></div>
        </div>
        <div class="card"><div class="card-h"><h2>ช่องทางเข้าหน้าคนขับ</h2><p class="muted">เปิด Driver Room หรือแสดง QR ให้คนขับสแกน</p></div><div class="card-b">
          <div class="actions"><button class="btn">Admin เปิดปลายทางกรณีพิเศษ</button><button class="btn">Admin เปิดต้นทางกรณีพิเศษ</button><button class="btn black">เปิด Driver Room</button><button class="btn">แสดง QR สำหรับคนขับ</button></div>
        </div></div>
        <div class="card"><div class="card-h"><h2>แผนส่งตาม Location / PO</h2></div><div class="card-b">
          <p><b>1. ร้าน A / โซนรับสินค้า 1</b> <span class="badge warn">รอโหลด</span></p>
          <table><tr><th>PO</th><th>รหัสวัสดุ</th><th>สินค้า</th><th>ต้องสแกน</th><th>ขึ้นรถ</th><th>ลงของ</th></tr>
          <tr><td>8030492670</td><td>80216114</td><td>SMC ชัตเติ้ลวาล์วฟิตติ้ง</td><td>1</td><td>0</td><td>0</td></tr>
          <tr><td>8030492670</td><td>80216123</td><td>SMC ตัวควบคุมปริมาณลม</td><td>1</td><td>0</td><td>0</td></tr></table>
        </div></div>
        """,
    ),
    "05-qr": page(
        "แสดง QR สำหรับคนขับ",
        "Monitor Realtime",
        """
        <p class="muted">ใช้ส่งเข้าห้องคนขับของ Job ที่สร้างแล้ว</p>
        <div class="card"><div class="card-b grid grid2" style="align-items:center">
          <div><h2>สแกน QR นี้เพื่อเปิดหน้าคนขับ</h2><p style="margin:12px 0">Job: JOB-20260519-090000-TRAINING</p><p>ห้อง: A / รถ 1234 / คนขับ b</p><p class="muted" style="margin-top:12px">หากสแกนไม่ได้ ให้เปิดลิงก์ Driver Room จากมือถือคนขับแทน</p></div>
          <div class="qr"></div>
        </div></div>
        <div class="card"><div class="card-h"><h2>สิ่งที่ Admin ต้องแจ้งคนขับ</h2></div><div class="card-b">
          <table><tr><th>บอกคนขับ</th><th>เหตุผล</th></tr><tr><td>ใช้มือถือเครื่องนี้ตลอดงาน</td><td>เพื่อให้ GPS ต้นทาง/ปลายทางถูกต้อง</td></tr><tr><td>สแกนขึ้นรถให้ครบ 2 รายการ</td><td>ครบแล้วระบบจะปิดต้นทางอัตโนมัติ</td></tr><tr><td>ถ้ามีข้อความเตือนให้โทรหา Admin</td><td>Admin เป็นผู้เปิดกรณีพิเศษ</td></tr></table>
        </div></div>
        """,
    ),
    "06-special": page(
        "กรณีพิเศษสำหรับ Admin",
        "Monitor Realtime",
        """
        <p class="muted">ใช้เฉพาะเมื่อหน้างานมีเหตุจำเป็น ไม่ควรเปิดทิ้งไว้</p>
        <div class="grid grid2">
          <div class="card"><div class="card-h"><h2>เปิดต้นทางกรณีพิเศษ</h2></div><div class="card-b">
            <p class="note">ใช้เมื่อระบบปิดต้นทางหลังโหลดครบแล้ว แต่ต้องให้คนขับเช็กอินต้นทางใหม่ เช่น กลับไปโหลดเพิ่มหรือแก้ GPS ผิด</p>
            <button class="btn black" style="margin-top:14px">Admin เปิดต้นทางกรณีพิเศษ</button>
          </div></div>
          <div class="card"><div class="card-h"><h2>เปิดปลายทางกรณีพิเศษ</h2></div><div class="card-b">
            <p class="note">ใช้เมื่อคนขับต้องเช็กอิน/สแกนส่งปลายทางทั้งที่เงื่อนไขปกติยังล็อกอยู่ เช่น โหลดไม่ครบแต่ต้องส่งก่อน</p>
            <button class="btn black" style="margin-top:14px">Admin เปิดปลายทางกรณีพิเศษ</button>
          </div></div>
        </div>
        <div class="card"><div class="card-h"><h2>Alert Queue</h2></div><div class="card-b">
          <table><tr><th>เหตุการณ์</th><th>Admin ต้องทำ</th></tr><tr><td>สแกนผิดสินค้า</td><td>ตรวจว่าอยู่ Job ไหน แล้วให้คนขับสแกนใหม่หรือเปิดกรณีพิเศษ</td></tr><tr><td>GPS ไม่ตรงรัศมี</td><td>โทรตรวจหน้างานก่อนเปิดปลายทางพิเศษ</td></tr><tr><td>ต้นทางถูกล็อกแล้ว</td><td>เปิดต้นทางพิเศษเฉพาะเมื่อต้องแก้จริง</td></tr></table>
        </div></div>
        """,
    ),
}


for name, html in pages.items():
    path = OUT_DIR / f"{name}.html"
    path.write_text(html, encoding="utf-8")
    subprocess.run(
        [
            CHROME,
            "--headless=new",
            "--disable-gpu",
            "--hide-scrollbars",
            "--window-size=1440,1100",
            f"--screenshot={SHOT_DIR / f'{name}.png'}",
            path.as_uri(),
        ],
        check=True,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )


def manual_img(name: str, caption: str) -> str:
    path = SHOT_DIR / f"{name}.png"
    return f"""<figure><img src="{path.as_uri()}" alt="{caption}"><figcaption>{caption}</figcaption></figure>"""


def table(headers, rows):
    head = "".join(f"<th>{header}</th>" for header in headers)
    body = "".join("<tr>" + "".join(f"<td>{cell}</td>" for cell in row) + "</tr>" for row in rows)
    return f"<table><thead><tr>{head}</tr></thead><tbody>{body}</tbody></table>"


manual_css = """
@page{size:A4;margin:15mm}
body{font-family:Tahoma,'Noto Sans Thai',Arial,sans-serif;color:#172033;font-size:12.5px;line-height:1.55}
h1{font-size:24px;color:#0b2545;border-bottom:2px solid #2e74b5;padding-bottom:6px}h2{font-size:18px;color:#2e74b5;margin-top:24px}h3{font-size:15px;color:#1f4d78}
table{width:100%;border-collapse:collapse;margin:8px 0 14px}th,td{border:1px solid #cfd7e3;padding:6px 7px;vertical-align:top}th{background:#e8eef5;text-align:left}
figure{page-break-inside:avoid;margin:10px 0 16px}figure img{width:100%;border:1px solid #d7dee8;border-radius:5px}figcaption{text-align:center;color:#5b6678;font-size:11px;font-style:italic;margin-top:5px}
.note{border-left:4px solid #2e74b5;background:#f4f7fb;padding:9px 11px}.page-break{break-before:page}
ol,ul{margin-left:22px;padding-left:0}li{margin-bottom:5px}
"""


manual = f"""<!doctype html><html lang="th"><head><meta charset="utf-8"><style>{manual_css}</style></head><body>
<h1>คู่มือ Admin: จำลองสร้าง Job ใน Project Stock QR</h1>
<p><b>วันที่จัดทำ:</b> 19 พฤษภาคม 2026<br><b>เว็บไซต์:</b> https://project-stock-qr.vercel.app/jobs<br><b>ข้อมูลตัวอย่าง:</b> ห้อง A / รถ 1234 / คนขับ b / ต้นทางบางซ่อน / ปลายทางร้าน A</p>
<p class="note">คู่มือนี้ใช้ข้อมูลจำลองเพื่ออธิบายทุกช่องที่ Admin ต้องกรอก โดยไม่ได้สร้างงานลงฐานข้อมูลจริง</p>

<h2>Flow ภาพรวม</h2>
{table(["ลำดับ", "หน้า", "Admin ต้องทำ"], [
    ("1", "นำเข้า PO", "อัปโหลดไฟล์ Excel / CSV จาก SAP"),
    ("2", "PO รอจัดส่ง", "ค้นหาและเลือก PO ที่จะสร้าง Job"),
    ("3", "สร้าง Job", "กรอกชื่อห้อง รถ คนขับ ต้นทาง ปลายทาง และจำนวนที่ต้องสแกน"),
    ("4", "Monitor", "ตรวจ Job ที่สร้าง ดูยอดและ Alert"),
    ("5", "QR", "ส่ง QR หรือ Link ให้คนขับ"),
    ("6", "กรณีพิเศษ", "Admin เปิดต้นทาง/ปลายทางพิเศษเฉพาะเมื่อจำเป็น"),
])}

<h2 class="page-break">1. นำเข้า PO</h2>
{manual_img("01-import-po", "หน้าจำลองนำเข้า PO จากไฟล์ GR_ADMIN_TRAINING.xlsx")}
{table(["ช่อง/ปุ่ม", "ต้องกรอกหรือทำอะไร", "ตัวอย่าง"], [
    ("เลือกไฟล์ Excel / CSV", "เลือกไฟล์จาก SAP หรือไฟล์ GR ที่มีข้อมูล PO", "GR_ADMIN_TRAINING.xlsx"),
    ("ข้อมูลในไฟล์", "ตรวจคอลัมน์ PO, Item, Vendor, รหัสวัสดุ, ชื่อสินค้า, จำนวน", "PO 8030492670 item 1-2"),
])}

<h2>2. เลือก PO รอจัดส่ง</h2>
{manual_img("02-select-po", "หน้าจำลองเลือก PO 8030492670 จำนวน 2 รายการ")}
{table(["ส่วนบนหน้า", "วิธีใช้", "ตัวอย่างในคู่มือ"], [
    ("ช่องค้นหา", "ค้นหา PO, Vendor, PO Web No. หรือวัสดุ", "พิมพ์ 8030492670"),
    ("Checkbox หน้าแถว", "ติ๊กเฉพาะรายการที่จะส่งใน Job นี้", "เลือก item 1 และ item 2"),
    ("สร้าง Job จากรายการที่เลือก", "กดหลังตรวจว่าจำนวนที่เลือกถูกต้อง", "เลือกแล้ว 2 รายการ"),
])}

<h2 class="page-break">3. กรอกสร้าง Job</h2>
{manual_img("03-create-job", "หน้าจำลองสร้าง Job พร้อมกรอกข้อมูลครบ")}
{table(["ช่อง", "ต้องกรอกอะไร", "ตัวอย่าง"], [
    ("ชื่อห้อง Job", "ชื่อสั้น ๆ ให้ Admin และคนขับจำง่าย", "A"),
    ("รถขนส่ง", "ทะเบียนหรือเลขรถที่ใช้ส่งงานนี้", "1234"),
    ("คนขับ", "ชื่อหรือรหัสคนขับ", "b"),
    ("ต้นทาง", "จุดที่คนขับต้องเช็กอิน GPS ก่อนสแกนขึ้นรถ", "บางซ่อน"),
    ("หมายเหตุ", "คำสั่งพิเศษหรือข้อมูลที่ต้องรู้", "ส่งของรอบเช้า ตรวจจำนวนก่อนออกจากคลัง"),
    ("จำนวนที่ต้องสแกน", "จำนวนกล่องหรือรอบสแกนที่ Admin ต้องการให้คนขับสแกน", "1 ต่อรายการ รวม 2"),
    ("ชื่อปลายทาง", "ชื่อจุดส่งที่คนขับเห็นใน Driver Room", "ร้าน A / โซนรับสินค้า 1"),
    ("ที่อยู่หรือโลเคชัน", "รายละเอียดสถานที่ส่ง", "ร้าน A บางซ่อน"),
])}

<h2>4. Monitor หลังสร้าง Job</h2>
{manual_img("04-monitor", "หน้าจำลอง Monitor หลังสร้าง Job A")}
{table(["ส่วน", "Admin ต้องตรวจ"], [
    ("ห้อง Job / Status", "ตรงกับงานที่สร้างหรือไม่"),
    ("ต้นทาง", "ก่อนคนขับเริ่มงานควรเป็นรอเช็กอิน หลังสแกนครบจะเป็นปิดแล้ว"),
    ("แผนส่งตาม Location / PO", "PO, รหัสวัสดุ, จำนวนต้องสแกน ถูกต้องหรือไม่"),
    ("Alert Queue", "มีสแกนผิด/ซ้ำ/ผิดปลายทางหรือไม่"),
])}

<h2 class="page-break">5. แสดง QR ให้คนขับ</h2>
{manual_img("05-qr", "หน้าจำลอง QR สำหรับเปิด Driver Room ของ Job")}
{table(["สิ่งที่ต้องส่งให้คนขับ", "รายละเอียด"], [
    ("QR หรือ Link", "ต้องเป็นของ Job ที่ถูกต้องเท่านั้น"),
    ("Job / รถ / คนขับ", "ให้คนขับตรวจว่าตรงกับงานจริงก่อนเริ่ม"),
    ("คำแนะนำ", "ใช้มือถือเครื่องเดิม และหากมีข้อความเตือนให้โทรหา Admin"),
])}

<h2>6. กรณีพิเศษที่ Admin เป็นผู้เปิด</h2>
{manual_img("06-special", "หน้าจำลองปุ่มเปิดต้นทาง/ปลายทางกรณีพิเศษ และ Alert Queue")}
{table(["ปุ่ม", "ใช้เมื่อไร", "ข้อควรระวัง"], [
    ("Admin เปิดต้นทางกรณีพิเศษ", "ต้นทางถูกปิดหลังโหลดครบแล้ว แต่ต้องแก้ GPS หรือโหลดเพิ่ม", "เปิดเฉพาะหลังตรวจหน้างาน"),
    ("Admin เปิดปลายทางกรณีพิเศษ", "ต้องส่งปลายทางแม้เงื่อนไขปกติยังล็อก เช่น โหลดไม่ครบแต่ต้องส่งก่อน", "ตรวจ Alert และปิดงานให้ถูก"),
])}

<h2>Checklist ก่อนกดสร้าง Job จริง</h2>
<ul>
<li>เลือก PO ถูกชุดและจำนวนรายการถูกต้อง</li>
<li>กรอกชื่อห้อง Job, รถ, คนขับ, ต้นทางครบ</li>
<li>ตั้งปลายทางและที่อยู่/โลเคชันถูกต้อง</li>
<li>จำนวนที่ต้องสแกนตรงกับจำนวนกล่องหรือรอบสแกนจริง</li>
<li>หลังสร้าง Job ให้เปิด Monitor เพื่อตรวจงานก่อนส่ง QR ให้คนขับ</li>
</ul>
</body></html>"""

HTML_MANUAL.write_text(manual, encoding="utf-8")
subprocess.run(
    [
        CHROME,
        "--headless=new",
        "--disable-gpu",
        "--no-pdf-header-footer",
        f"--print-to-pdf={PDF}",
        HTML_MANUAL.as_uri(),
    ],
    check=True,
)
print(PDF)
