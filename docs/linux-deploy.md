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

หลังจาก push โค้ดขึ้น GitHub แล้ว สามารถ deploy เว็บจริงจากเครื่อง dev ได้เร็วขึ้นด้วยคำสั่งเดียว:

```bash
./scripts/deploy-production.sh
```

สคริปต์จะ SSH ไปที่ `root@192.168.1.141`, ดึง branch `main` ลง `/opt/syncdrop`, rebuild container และแสดง log ท้ายสุดของ `syncdrop`

## 3. Nginx

ใช้ `docs/nginx-syncdrop.conf` เป็นตัวอย่าง แล้ว reload nginx

```bash
sudo nginx -t
sudo systemctl reload nginx
```

หลัง DNS ชี้ `store.cipcloud.net` มาที่ public IP แล้ว ค่อยออก SSL certificate และปรับ server block เป็น HTTPS

## 4. SSO

แจ้งทีม SSO ให้เพิ่ม production URL นี้:

```text
https://store.cipcloud.net/syncdrop/
```

ถ้า URL นี้ยังไม่อยู่ใน SSO allow list การ login จะ redirect กลับมาไม่ได้
