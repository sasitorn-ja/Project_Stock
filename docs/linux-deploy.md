# SyncDrop Linux Deployment

โปรเจกต์นี้เตรียมไว้สำหรับรันใต้ path `/syncdrop` เช่น `https://store.cipcloud.net/syncdrop`

## 1. เตรียม env

คัดลอกจาก `.env.production.example` เป็น `.env.production` แล้วใส่ค่าจริงบน server

```bash
cp .env.production.example .env.production
```

ค่าที่ต้องตรงกับ production:

- `NEXT_PUBLIC_BASE_PATH=/syncdrop`
- `AUTH_URL=https://store.cipcloud.net/syncdrop`
- `SSO_REDIRECT_URI=https://store.cipcloud.net/syncdrop/`
- `SSO_POST_LOGOUT_REDIRECT_URI=https://store.cipcloud.net/syncdrop/`
- `AUTH_RMC_SSO_CLIENT_ID=store`
- `DATABASE_URL` ของ PostgreSQL production

## 2. Build และ run ด้วย Docker Compose

```bash
docker compose up -d --build
docker compose logs -f syncdrop
```

แอปจะฟังที่ `http://127.0.0.1:3000` และคาดหวังว่า reverse proxy จะส่ง path `/syncdrop/...` เข้ามาแบบไม่ strip path

Docker Compose จะสร้าง volume ชื่อ `syncdrop_data` เพื่อให้ local file storage เขียน `/app/data` ได้และไม่หายหลัง recreate container ถึง production ควรตั้ง `DATABASE_URL` เสมอ แต่ volume นี้ช่วยให้ระบบไม่ล้มถ้าอยู่ในโหมด fallback

## 3. Deploy อัตโนมัติจาก GitHub Actions

Workflow `.github/workflows/deploy-release.yml` จะ deploy เฉพาะเมื่อ push เข้า branch **`Release`** (ตัว R ใหญ่) และสามารถสั่ง Run workflow โดยเลือก `Release` ได้ด้วย หลังติดตั้ง runner ตามขั้นตอนด้านล่างแล้ว ใช้งานดังนี้:

```bash
git switch Release
git merge main
git push origin Release
```

ดูผลที่ [Deploy Release](https://github.com/sasitorn-ja/Project_Stock/actions/workflows/deploy-release.yml) โดย push เข้า `main` อย่างเดียวจะไม่ deploy

### ตั้งค่า runner ครั้งแรกบน 192.168.1.141

1. เปิด [Settings → Actions → Runners → New self-hosted runner](https://github.com/sasitorn-ja/Project_Stock/settings/actions/runners/new) แล้วเลือก Linux x64
2. บนเซิร์ฟเวอร์ `192.168.1.141` เตรียมผู้ใช้ `syncdrop-runner` ที่อยู่ในกลุ่ม `docker` และให้อ่าน `/opt/syncdrop/.env.production` ได้ เก็บไฟล์ env ไว้นอกโฟลเดอร์ checkout ของ runner และไม่ commit ขึ้น Git
3. ทำตามคำสั่ง Download และ Configure ที่ GitHub แสดง โดยรัน `config.sh` ด้วยผู้ใช้ `syncdrop-runner` และเพิ่ม `--labels syncdrop-prod-141` อย่าใช้ runner ของ Project_Rmc-salesupport เพราะเป็นคนละเซิร์ฟเวอร์
4. ในโฟลเดอร์ runner ติดตั้งและเริ่ม service:

   ```bash
   sudo ./svc.sh install syncdrop-runner
   sudo ./svc.sh start
   ```

5. ตรวจว่า runner ขึ้น **Idle/Online** ใน GitHub แล้วกด Re-run jobs ของรอบ `Release` ที่ค้างอยู่ หรือ push commit ใหม่เข้า `Release`

Runner ต้องออกอินเทอร์เน็ตไป GitHub ได้และมี Docker Compose v2, Git, curl และ tar ดู [คู่มือติดตั้ง runner ของ GitHub](https://docs.github.com/en/actions/how-tos/manage-runners/self-hosted-runners/add-runners)

Workflow จะตรวจ IP ของเครื่องก่อน deploy, checkout revision ของ push นั้น, build image ให้เสร็จก่อนเปลี่ยน container และตรวจหน้า `/syncdrop/login` ว่าตอบ HTTP 200 การตรวจนี้ยืนยันว่าแอปเริ่มทำงานได้ แต่ไม่แทนการทดสอบ login SSO หรือฐานข้อมูลจริง งาน deploy จะเข้าคิวเพื่อไม่ให้เปลี่ยน container พร้อมกันหลายรอบ

ใช้ Compose project เดียวกับ container `syncdrop` ที่รันอยู่เพื่อใช้ data volume เดิม และอ่านค่าจาก `/opt/syncdrop/.env.production` โดยตรง จึงไม่ต้องคัดลอก secrets เข้า GitHub checkout

### Deploy ผ่าน SSH จากเครื่อง dev

ยังสามารถสั่ง deploy เองเมื่อเครื่อง dev เข้า LAN/VPN ของเซิร์ฟเวอร์ได้:

```bash
./scripts/deploy-production.sh
```

สคริปต์จะ SSH ไปที่ `root@192.168.1.141`, ดึง branch `Release` ลง `/opt/syncdrop` และใช้สคริปต์ build/deploy/ตรวจ startup ตัวเดียวกับ Actions หลีกเลี่ยงการสั่ง SSH deploy พร้อมกับ Actions ที่กำลังทำงานอยู่

## 4. Nginx

ใช้ `docs/nginx-syncdrop.conf` เป็นตัวอย่าง แล้ว reload nginx

```bash
sudo nginx -t
sudo systemctl reload nginx
```

หลัง DNS ชี้ `store.cipcloud.net` มาที่ public IP แล้ว ค่อยออก SSL certificate และปรับ server block เป็น HTTPS

## 5. SSO

แจ้งทีม SSO ให้เพิ่ม production URL นี้:

```text
https://store.cipcloud.net/syncdrop/
```

ถ้า URL นี้ยังไม่อยู่ใน SSO allow list การ login จะ redirect กลับมาไม่ได้
