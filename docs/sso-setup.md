# RMC SSO Setup สำหรับ SyncDrop

เอกสารนี้สรุปค่าที่ต้องตั้งสำหรับ SyncDrop บน Linux server ภายใต้ sub-path `/syncdrop`

## 1. Redirect URI ใน RMC SSO Admin

โปรเจกต์นี้ใช้ custom RMC SSO flow ไม่ได้ใช้ Auth.js callback มาตรฐานแล้ว โดย RMC SSO จะ redirect กลับมาที่หน้า root ของแอปภายใต้ base path แล้วแอปจะส่งต่อเข้า callback route ภายในเอง

Production Redirect URI ต้องเป็นค่านี้แบบตรงทุกตัวอักษร:

```text
https://store.cipcloud.net/syncdrop/
```

ลบ Redirect URI เก่าของ Vercel ออกจาก client นี้ได้แล้ว เช่น `https://project-syncdrop.vercel.app/po` และ URL อื่นภายใต้ `project-syncdrop.vercel.app`

ค่า Post Logout Redirect URI ควรเป็นค่าเดียวกัน:

```text
https://store.cipcloud.net/syncdrop/
```

ลบ Post Logout Redirect URI เก่าของ Vercel ออกจาก client นี้ได้แล้วเช่นกัน

Allowed Origin:

```text
https://store.cipcloud.net/syncdrop/
```

หมายเหตุ: ถ้า server ยังไม่มี HTTPS certificate และจำเป็นต้องทดสอบแบบ HTTP ชั่วคราว ต้องลงทะเบียน URI แบบ `http://...` แยกต่างหากใน RMC SSO Admin ด้วย เพราะ protocol ต้องตรงกันทุกตัวอักษร

## 2. Environment Variables

ค่า production บน Linux server ควรอิงจาก `.env.production.example`

```bash
NEXT_PUBLIC_BASE_PATH=/syncdrop
AUTH_URL=https://store.cipcloud.net/syncdrop
UI_BASE_URL=https://store.cipcloud.net/syncdrop
AUTH_TRUST_HOST=true
AUTH_SECRET=<random-32-bytes-hex>

AUTH_RMC_SSO_CLIENT_ID=store
AUTH_RMC_SSO_CLIENT_SECRET=<client-secret>
AUTH_RMC_SSO_ISSUER=https://rmc-sso.cipcloud.net
SSO_REDIRECT_URI=https://store.cipcloud.net/syncdrop/
SSO_POST_LOGOUT_REDIRECT_URI=https://store.cipcloud.net/syncdrop/
```

## 3. การทำงานของระบบ

1. ผู้ใช้เข้า `https://store.cipcloud.net/syncdrop/`
2. ถ้ายังไม่มี session จะถูก redirect ไป `/syncdrop/login`
3. หน้า login submit ไป `/syncdrop/api/auth/rmc-sso/login`
4. แอปสร้าง state + PKCE แล้ว redirect ไป RMC SSO authorize endpoint
5. RMC SSO redirect กลับมาที่ `https://store.cipcloud.net/syncdrop/?code=...&state=...`
6. หน้า root ส่งต่อไป `/syncdrop/api/auth/rmc-sso/callback`
7. แอปตรวจ state, แลก token, ตรวจ id_token แล้วสร้าง session cookie
8. ผู้ใช้ถูก redirect กลับไปยังหน้าใช้งาน เช่น `/syncdrop/po`

## 4. ตรวจสอบหลัง deploy

หลัง deploy และตั้ง Nginx/HTTPS เสร็จ ทดสอบดังนี้

- เข้า `https://store.cipcloud.net/syncdrop/` ต้องถูก redirect ไป `/syncdrop/login`
- กดปุ่ม Sign in แล้วต้องเข้าหน้า RMC SSO
- หลัง login ต้องกลับมาที่ `/syncdrop/po` ได้
- กด "ออกจากระบบ" ต้องล้าง session และไปที่ RMC SSO end-session flow

## 5. Troubleshooting

- `redirect_uri_mismatch`: ตรวจว่า RMC SSO Admin ลงทะเบียน `https://store.cipcloud.net/syncdrop/` ตรงทุกตัวอักษร รวมถึง trailing slash
- `invalid_client`: ตรวจ Client ID, Client Secret และ token auth method
- `InvalidState`: มักเกิดจาก cookie/state หาย หรือ protocol/domain/path ตอนเริ่ม login กับตอน callback ไม่ตรงกัน
- กลับมาเป็น `/` แทน `/syncdrop`: ตรวจ `NEXT_PUBLIC_BASE_PATH`, `AUTH_URL`, `SSO_REDIRECT_URI` และ Nginx ว่าไม่ได้ strip `/syncdrop`

## 6. คนขับ ไม่ต้อง SSO

คนขับเข้าระบบผ่าน QR code หรือ link เฉพาะงานที่หน้าจอ Monitor/PO สร้างให้ ลิงก์มี pattern:

- `/syncdrop/driver-room?jobId=<jobId>`
- `/syncdrop/driver?jobId=<jobId>`

เส้นทางเหล่านี้ middleware จะอนุญาตให้เข้าได้โดยไม่ต้อง login SSO และ AppShell จะตัด sidebar/header ออก เห็นเฉพาะหน้าทำงานของ job นั้น

API ที่เปิด public ให้ driver page เรียก ถูกผูกกับ jobId เสมอ:

- `GET /syncdrop/api/jobs/<jobId>`
- `POST /syncdrop/api/jobs/<jobId>/check-in-origin`
- `POST /syncdrop/api/jobs/<jobId>/check-in-destination`
- `POST /syncdrop/api/jobs/<jobId>/clear-unused-destination-check-in`
- `POST /syncdrop/api/jobs/<jobId>/scan`

API อื่น เช่น `/syncdrop/api/jobs` list, `/syncdrop/api/po-registry/*`, `/syncdrop/api/reports/*` ยังคงบังคับ SSO ตามปกติ

## 7. ความปลอดภัย

- อย่า commit `.env.local` หรือ `.env.production` ขึ้น git
- `AUTH_SECRET` ควรเป็นค่าสุ่ม 32 ไบต์ขึ้นไป สร้างด้วย `openssl rand -hex 32`
- เก็บ `AUTH_RMC_SSO_CLIENT_SECRET` เฉพาะบน server/secret manager
- หาก secret รั่ว ต้อง rotate ใน RMC SSO Admin แล้ว update env บน server ทันที
