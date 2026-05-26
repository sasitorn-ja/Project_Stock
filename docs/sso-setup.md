# RMC SSO Setup สำหรับ SyncDrop

เอกสารนี้สรุปขั้นตอนการเชื่อม RMC SSO กับโปรเจกต์ SyncDrop ที่ใช้ Next.js 15 + Auth.js v5

## 1. เพิ่ม Redirect URI ใน RMC SSO Admin

Auth.js v5 ใช้ callback path มาตรฐานคือ `/api/auth/callback/<provider-id>` ในโปรเจกต์นี้ provider id คือ `rmc-sso` ดังนั้นต้องเข้า RMC SSO Admin แล้วเพิ่ม Redirect URI ต่อไปนี้ทั้งหมด

- `http://localhost:3000/api/auth/callback/rmc-sso` (สำหรับ local dev)
- `https://project-syncdrop.vercel.app/api/auth/callback/rmc-sso` (สำหรับ production)

หมายเหตุ Redirect URI เดิม `https://project-syncdrop.vercel.app/` ไม่จำเป็นต้องลบ แต่ค่าใหม่ที่เพิ่มต้องตรงทุกตัวอักษรกับ URL ด้านบน รวมถึง trailing slash (ไม่มี trailing slash ในเส้นทาง callback)

## 2. Environment Variables

ค่าใน `.env.local` ที่จำเป็น

```bash
AUTH_SECRET=<random-32-bytes-hex>
AUTH_URL=http://localhost:3000           # production ให้เปลี่ยนเป็น URL จริง
AUTH_TRUST_HOST=true                     # สำหรับ Vercel/proxy
AUTH_RMC_SSO_CLIENT_ID=sync-drop
AUTH_RMC_SSO_CLIENT_SECRET=<client-secret>
AUTH_RMC_SSO_ISSUER=https://rmc-sso.cipcloud.net
# AUTH_DEBUG=true                        # เปิดเพื่อดู log ระหว่าง dev
```

ใน Vercel Project Settings ต้องตั้งค่าทั้งหมดข้างต้น โดย `AUTH_URL` ใช้ `https://project-syncdrop.vercel.app`

## 3. การทำงานของระบบ

1. `middleware.ts` ตรวจ session ของ Auth.js ทุก request ที่ไม่ใช่ asset, `/login`, หรือ `/api/auth/*`
2. ถ้ายังไม่มี session จะ redirect ไป `/login?callbackUrl=<originalPath>`
3. หน้า `/login` แสดงปุ่ม "Sign in with RMC SSO" เมื่อกดจะเรียก server action `signIn("rmc-sso", { redirectTo })`
4. Auth.js สร้าง state + PKCE แล้ว redirect ไป Authorize endpoint ของ RMC SSO
5. RMC SSO redirect กลับมา `/api/auth/callback/rmc-sso?code=...&state=...`
6. Auth.js ตรวจ state, แลก token ที่ Token endpoint ด้วย `client_secret_post`, ตรวจ id_token แล้วสร้าง JWT session
7. ผู้ใช้ถูก redirect กลับไปยัง `callbackUrl` (default = `/po`)
8. ปุ่ม "ออกจากระบบ" ใน Header เรียก `signOut({ callbackUrl: "/login" })`

## 4. ตรวจสอบหลัง deploy

หลังเพิ่ม env และ deploy เสร็จ ทดสอบดังนี้

- เข้า `https://project-syncdrop.vercel.app/` ต้องถูก redirect ไป `/login`
- กดปุ่ม Sign in แล้วต้องเข้าหน้า RMC SSO
- หลัง login ต้องเข้าหน้า `/po` ได้ และเห็นชื่อผู้ใช้ใน Header
- กด "ออกจากระบบ" ต้องกลับไปหน้า `/login`

## 5. Troubleshooting

- `redirect_uri_mismatch`: ตรวจว่า callback URL ใน RMC Admin ตรงกับที่ Auth.js ใช้จริง (ดู Browser DevTools → Network → request ไป `/authorize`)
- `invalid_client`: ตรวจ Client Secret และ token endpoint auth method ต้องเป็น `client_secret_post`
- `state mismatch`: มักเกิดจาก cookie ถูก block ลองเปิด third-party cookie หรือใช้ same domain
- `id_token signature`: ถ้า RMC SSO เปลี่ยนเป็น RS256 ต้องแก้ `id_token_signed_response_alg` ใน `auth.ts` เป็น `"RS256"` และให้ Auth.js ดึง JWKS เอง

## 6. คนขับ (ไม่ต้อง SSO)

คนขับเข้าระบบผ่าน QR code หรือ link เฉพาะงานที่หน้าจอ Monitor/PO สร้างให้ ลิงก์มี pattern

- `/driver-room?jobId=<jobId>`
- `/driver?jobId=<jobId>`

เส้นทางเหล่านี้ middleware จะอนุญาตให้เข้าได้โดย**ไม่ต้อง login SSO** และ AppShell จะตัด sidebar/header ออก เห็นเฉพาะหน้าทำงานของ job นั้น

API ที่เปิด public ให้ driver page เรียก (ถูกผูกกับ jobId เสมอ)

- `GET /api/jobs/<jobId>`
- `POST /api/jobs/<jobId>/check-in-origin`
- `POST /api/jobs/<jobId>/check-in-destination`
- `POST /api/jobs/<jobId>/clear-unused-destination-check-in`
- `POST /api/jobs/<jobId>/scan`

API อื่น (เช่น `/api/jobs` list, `/api/jobs/<id>/items`, `/api/po-registry/*`, `/api/reports/*`) ยังคงบังคับ SSO ตามปกติ ดังนั้น คนขับจะ**เห็นและทำได้เฉพาะ job ที่ระบุ jobId เท่านั้น** เข้าถึงเมนูหลังบ้านไม่ได้

หมายเหตุด้านความปลอดภัย: โมเดลนี้ใช้ jobId เป็น access token แบบ "unguessable URL" ควรตรวจสอบให้แน่ใจว่า jobId เป็นค่าสุ่มที่เดาไม่ได้ และอย่าโพสต์ลิงก์ลงช่องสาธารณะ

## 7. ความปลอดภัย

- **อย่า** commit `.env.local` ขึ้น git
- ใช้ secret manager ของ Vercel ในการเก็บ `AUTH_RMC_SSO_CLIENT_SECRET`
- `AUTH_SECRET` ควรเป็นค่าสุ่ม 32 ไบต์ขึ้นไป สร้างด้วย `openssl rand -hex 32`
- หาก secret รั่ว ต้อง rotate ใน RMC Admin แล้ว update env ใน Vercel ทันที
