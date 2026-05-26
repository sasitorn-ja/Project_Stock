# Sync drop SSO Handoff

เอกสารนี้มีข้อมูลลับและมี Client Secret อยู่ภายใน โปรดส่งต่อผ่านช่องทางที่ปลอดภัยเท่านั้น

## Current Authentication Model

- Sync drop ควรใช้ RMC SSO ผ่าน OIDC Authorization Code Flow พร้อม PKCE แล้วสร้าง session ของ application เองหลังจากตรวจสอบ token สำเร็จ
- Frontend หรือ server เริ่ม login ด้วยการ redirect ไป RMC SSO Authorize endpoint
- RMC SSO redirect กลับมาที่ Redirect URI พร้อม code และ state
- Application ต้องตรวจ state และใช้ code_verifier แลก token ที่ Token endpoint
- Server ตรวจ id_token เช่น signature, issuer, audience และ expiry ก่อนสร้าง session ภายใน
- API ภายในควรใช้ session ของ application หรือ trusted identity headers จาก gateway ที่เชื่อถือได้

## Project Summary

- Client ID: sync-drop
- Client Secret: v3zczpdRRxco1kO5g1grco3mjX6vqG2hc9VC8WQZxes
- Protocol: OIDC
- Environment: production
- Status: Active
- Owner: SASITOJA@SCG.COM
- Home URL: https://project-syncdrop.vercel.app/

## Redirect URIs

- Redirect URI: https://project-syncdrop.vercel.app/

ค่า SSO_REDIRECT_URI ต้องตรงกับ Redirect URI ที่ลงทะเบียนไว้ทุกตัวอักษร

## Allowed Origins

- Allowed Origin: https://project-syncdrop.vercel.app/

## OIDC Provider Endpoints

- Issuer: https://rmc-sso.cipcloud.net
- OIDC Discovery: https://rmc-sso.cipcloud.net/api/auth/.well-known/openid-configuration
- Authorize: https://rmc-sso.cipcloud.net/api/auth/oauth2/authorize
- Token: https://rmc-sso.cipcloud.net/api/auth/oauth2/token
- UserInfo: https://rmc-sso.cipcloud.net/api/auth/oauth2/userinfo

## Required OIDC Values

- Grant type: authorization_code, refresh_token
- Response type: code
- Scopes: openid profile email offline_access
- PKCE: Required (S256 only)
- Token auth method used by application: client_secret_post
- ID token signing: HS256 supported; RS256 requires JWKS verification before production use

## Environment Variables

ตั้งค่าที่ server runtime หรือ `.env` ตาม environment ที่ deploy

```bash
UI_BASE_URL=https://project-syncdrop.vercel.app/
SSO_ISSUER=https://rmc-sso.cipcloud.net
SSO_CLIENT_ID=sync-drop
SSO_CLIENT_SECRET=v3zczpdRRxco1kO5g1grco3mjX6vqG2hc9VC8WQZxes
SSO_AUTHORIZE_URL=https://rmc-sso.cipcloud.net/api/auth/oauth2/authorize
SSO_TOKEN_URL=https://rmc-sso.cipcloud.net/api/auth/oauth2/token
SSO_USERINFO_URL=https://rmc-sso.cipcloud.net/api/auth/oauth2/userinfo
SSO_REDIRECT_URI=https://project-syncdrop.vercel.app/
SSO_SCOPE=openid profile email offline_access
SSO_TOKEN_AUTH_METHOD=client_secret_post
APP_SESSION_SECRET=<generate-a-strong-random-secret>
```

ควรตั้ง session secret แยกจาก Client Secret ใน production

## Application Endpoints

- GET /: รับ code และ state จาก RMC SSO แล้วเริ่ม callback flow ของ application
- Token exchange endpoint: ควรทำบน server เมื่อ client มี Client Secret หรือเมื่อต้องควบคุม session ภายในเอง
- Session endpoint: หลังตรวจ id_token สำเร็จ ให้สร้าง session/cookie ของ application ตาม framework ที่ใช้งาน

## Login Flow

### Step 1: ผู้ใช้เปิด Sync drop

ผู้ใช้เข้าใช้งานผ่าน

```text
https://project-syncdrop.vercel.app/
```

- ถ้ายังไม่มี session ให้แสดงหน้า login หรือ redirect ไป RMC SSO ตาม UX ของ application

### Step 2: เริ่ม RMC SSO

เมื่อผู้ใช้กด login ให้ application สร้าง Authorization URL ด้วยค่าหลักเหล่านี้
จากนั้น redirect browser ไปที่ RMC SSO domain ตาม URL ตัวอย่างนี้

```text
https://rmc-sso.cipcloud.net/api/auth/oauth2/authorize?client_id=sync-drop&redirect_uri=https%3A%2F%2Fproject-syncdrop.vercel.app%2F&response_type=code&scope=openid+profile+email+offline_access&state=%3Crandom-state%3E&code_challenge=%3Cs256-code-challenge%3E&code_challenge_method=S256
```

- client_id=sync-drop
- redirect_uri=https://project-syncdrop.vercel.app/
- response_type=code
- scope=openid profile email offline_access
- state=<random>
- code_challenge=<SHA256(code_verifier)>
- code_challenge_method=S256

### Step 3: RMC SSO redirect กลับ Sync drop

หลังผู้ใช้ยืนยันตัวตนสำเร็จ RMC SSO จะ redirect กลับมาที่

```text
https://project-syncdrop.vercel.app/?code=...&state=...
```

- application ต้องตรวจว่า state ที่กลับมาตรงกับค่าที่สร้างไว้ก่อนเริ่ม login

### Step 4: แลก token

ส่ง authorization_code ไปที่ Token endpoint แบบ application/x-www-form-urlencoded

```text
POST https://rmc-sso.cipcloud.net/api/auth/oauth2/token
```

- grant_type=authorization_code
- client_id=sync-drop
- client_secret=<SSO_CLIENT_SECRET>
- redirect_uri=https://project-syncdrop.vercel.app/
- code=<authorization_code>
- code_verifier=<stored-code-verifier>

### Step 5: สร้าง application session

หลังได้ token แล้ว server ควรตรวจ id_token ก่อนสร้าง session ภายใน application

- ตรวจ signature ตาม algorithm ที่รองรับ
- iss ต้องตรงกับ https://rmc-sso.cipcloud.net
- aud ต้องมี sync-drop
- exp ต้องยังไม่หมดอายุ
- สร้าง HTTP-only cookie หรือ server-side session ของ application

### Step 6: ใช้งาน API ภายใน

หลัง login สำเร็จ frontend ควรเรียก endpoint ตรวจ session ของ application ก่อนเรียก API ที่ต้องการ auth

- ส่ง cookie ด้วย credentials/include ตาม framework ที่ใช้งาน
- API ภายในควรตรวจ session ทุกครั้งก่อนคืนข้อมูล
- ถ้ามี gateway ยืนยันตัวตนแล้ว สามารถรับ trusted identity headers เป็น fallback ได้

## Operational Notes

- ห้าม commit หรือเผยแพร่ Client Secret ใน public repository
- production ควรตั้ง session secret แยกจาก SSO_CLIENT_SECRET
- Redirect URI ต้องตรงกับค่าที่ลงทะเบียนไว้ทุกตัวอักษร รวมถึง trailing slash
- ถ้าเปลี่ยน Client Secret ต้อง update ทั้ง environment variable และค่า secret ใน RMC SSO Admin
- ถ้า token endpoint ไม่อนุญาต CORS สำหรับ browser flow ต้องย้าย token exchange ไปทำที่ server endpoint
- ถ้าจะใช้ RS256 ใน production ควรเพิ่ม JWKS verification ก่อนรับ id_token

## Framework Examples

### React SPA

เหมาะกับแอป React ที่รันบน browser ล้วน เช่น Vite, CRA หรือ static SPA ให้ใช้ Authorization Code Flow พร้อม PKCE และไม่ฝัง Client Secret ไว้ใน browser เด็ดขาด เพราะผู้ใช้สามารถดู source และ network request ได้

- ตั้ง Redirect URI เป็น callback route ของ SPA เช่น /auth/callback และต้องตรงกับค่าที่ลงทะเบียนไว้
- สร้าง code_verifier และ code_challenge ใน browser ก่อน redirect ไปที่ Authorize endpoint
- เก็บ state และ code_verifier ชั่วคราวใน sessionStorage แล้วตรวจสอบ state ตอนกลับมาที่ callback
- แลก token จาก browser ได้เฉพาะ client แบบ public ที่ใช้ token auth method none หากโปรเจกต์นี้ต้องใช้ client secret ให้ทำ backend callback แทน

#### ตัวอย่างเริ่ม sign-in ใน React

```
const issuer = "https://rmc-sso.cipcloud.net";
const clientId = "sync-drop";
const redirectUri = "https://project-syncdrop.vercel.app/";

async function sha256(value) {
  const data = new TextEncoder().encode(value);
  return crypto.subtle.digest("SHA-256", data);
}

function base64Url(buffer) {
  return btoa(String.fromCharCode(...new Uint8Array(buffer)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export async function signInWithRmcSso() {
  const verifier = base64Url(crypto.getRandomValues(new Uint8Array(32)));
  const challenge = base64Url(await sha256(verifier));
  const state = crypto.randomUUID();

  sessionStorage.setItem("rmc_sso_state", state);
  sessionStorage.setItem("rmc_sso_verifier", verifier);

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "openid profile email",
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
  });

  window.location.href = `${issuer}/api/auth/oauth2/authorize?${params}`;
}
```

### Next.js

เหมาะกับ Next.js App Router หรือ Pages Router เพราะสามารถเก็บ Client Secret ไว้ฝั่ง server ได้ ปลอดภัยกว่า SPA และสามารถตั้ง session cookie แบบ httpOnly หลังแลก token สำเร็จ

- เก็บ ISSUER, CLIENT_ID, CLIENT_SECRET และ REDIRECT_URI ใน environment variables ฝั่ง server
- สร้าง route /api/auth/rmc-sso/login สำหรับ redirect ไป SSO และ /api/auth/rmc-sso/callback สำหรับแลก code
- ใช้ cookie แบบ httpOnly, secure และ sameSite=lax เพื่อเก็บ state, code_verifier และ session ของระบบคุณ
- หลังได้ ID token ให้ตรวจสอบ issuer, audience, expiry และ signature ก่อนสร้าง session ภายในแอป

#### ตัวอย่าง callback route ใน Next.js App Router

```
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

const issuer = process.env.RMC_SSO_ISSUER ?? "https://rmc-sso.cipcloud.net";
const clientId = process.env.RMC_SSO_CLIENT_ID ?? "sync-drop";
const clientSecret = process.env.RMC_SSO_CLIENT_SECRET;
const redirectUri = process.env.RMC_SSO_REDIRECT_URI ?? "https://project-syncdrop.vercel.app/";

export async function GET(request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const cookieStore = await cookies();

  if (!code || !clientSecret || state !== cookieStore.get("rmc_sso_state")?.value) {
    return NextResponse.json({ error: "Invalid callback state" }, { status: 400 });
  }

  const body = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
    code,
    code_verifier: cookieStore.get("rmc_sso_verifier")?.value ?? "",
  });

  const tokenResponse = await fetch(`${issuer}/api/auth/oauth2/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });

  if (!tokenResponse.ok) {
    return NextResponse.json(await tokenResponse.json(), { status: 400 });
  }

  const tokens = await tokenResponse.json();
  // Verify tokens.id_token, then create your own app session.
  return NextResponse.redirect(new URL("/me", request.url));
}
```

### PHP Backend

เหมาะกับ Laravel, Symfony หรือ PHP แบบ custom ที่มี server-side session ให้เก็บ Client Secret บน server เท่านั้น แล้วให้ PHP เป็นผู้แลก authorization code และสร้าง session ของระบบปลายทาง

- ใช้ $_SESSION เก็บ state และ code_verifier ก่อน redirect ไป SSO
- callback ต้องตรวจสอบ state ก่อนเรียก Token endpoint ทุกครั้ง
- ส่ง token request แบบ application/x-www-form-urlencoded และแนบ client_secret เฉพาะจาก server
- หลังได้ token ควรตรวจสอบ ID token และดึง profile เพิ่มจาก UserInfo endpoint เมื่อต้องการข้อมูลล่าสุด

#### ตัวอย่าง PHP callback แลก code เป็น token

```
<?php
session_start();

$issuer = "https://rmc-sso.cipcloud.net";
$clientId = "sync-drop";
$clientSecret = getenv("RMC_SSO_CLIENT_SECRET");
$redirectUri = "https://project-syncdrop.vercel.app/";

if (!isset($_GET["code"], $_GET["state"]) || $_GET["state"] !== ($_SESSION["rmc_sso_state"] ?? "")) {
    http_response_code(400);
    exit("Invalid callback state");
}

if (!$clientSecret) {
    http_response_code(500);
    exit("Missing RMC_SSO_CLIENT_SECRET");
}

$payload = http_build_query([
    "grant_type" => "authorization_code",
    "client_id" => $clientId,
    "client_secret" => $clientSecret,
    "redirect_uri" => $redirectUri,
    "code" => $_GET["code"],
    "code_verifier" => $_SESSION["rmc_sso_verifier"] ?? "",
]);

$ch = curl_init("$issuer/api/auth/oauth2/token");
curl_setopt_array($ch, [
    CURLOPT_POST => true,
    CURLOPT_POSTFIELDS => $payload,
    CURLOPT_HTTPHEADER => ["Content-Type: application/x-www-form-urlencoded"],
    CURLOPT_RETURNTRANSFER => true,
]);

$response = curl_exec($ch);
$status = curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
curl_close($ch);

if ($status !== 200) {
    http_response_code(400);
    exit($response ?: "Token exchange failed");
}

$tokens = json_decode($response, true);
// Verify $tokens["id_token"], then create your PHP application session.
header("Location: /me");
exit;
```

### HTML + JavaScript

เหมาะกับหน้า HTML ธรรมดาที่ต้องการปุ่มเข้าสู่ระบบแบบเบื้องต้น ใช้ได้กับ public client ที่ไม่ต้องใช้ Client Secret เท่านั้น ถ้าต้องใช้ Client Secret ให้เปลี่ยนเป็น backend callback เช่น PHP หรือ Next.js

- เพิ่มปุ่ม login ที่เรียก JavaScript เพื่อสร้าง PKCE แล้ว redirect ไป Authorize endpoint
- หน้า callback อ่าน code และ state จาก URL แล้วตรวจ state ให้ตรงกับ sessionStorage
- อย่าใส่ Client Secret ใน HTML, JavaScript, localStorage หรือไฟล์ static ใด ๆ
- ควรส่ง code ไป backend ของคุณเพื่อแลก token หากต้องการ session ที่ปลอดภัยและควบคุมสิทธิ์ได้

#### ตัวอย่างปุ่ม login ใน HTML

```
<button type="button" id="login">Sign in with RMC SSO</button>
<script type="module">
const issuer = "https://rmc-sso.cipcloud.net";
const clientId = "sync-drop";
const redirectUri = "https://project-syncdrop.vercel.app/";

document.querySelector("#login").addEventListener("click", async () => {
  const verifierBytes = crypto.getRandomValues(new Uint8Array(32));
  const verifier = btoa(String.fromCharCode(...verifierBytes))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  const challenge = btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const state = crypto.randomUUID();

  sessionStorage.setItem("rmc_sso_state", state);
  sessionStorage.setItem("rmc_sso_verifier", verifier);

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "openid profile email",
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
  });

  location.href = `${issuer}/api/auth/oauth2/authorize?${params}`;
});
</script>
```

## Legacy Integration Guide

### Step 1: ลงทะเบียนค่า client ใน application

ตั้งค่า Client ID เป็น sync-drop, Client Secret เป็นค่าที่ระบุในเอกสารนี้, Issuer/Discovery URL เป็น https://rmc-sso.cipcloud.net/api/auth/.well-known/openid-configuration และ Redirect URI ต้องตรงกับค่าที่ลงทะเบียนไว้ทุกตัวอักษร โดยเฉพาะ https://project-syncdrop.vercel.app/

### Step 2: เริ่ม Sign-In ด้วย Authorization Code Flow

ให้แอปพาผู้ใช้ไปที่ Authorize endpoint พร้อมพารามิเตอร์หลักอย่างน้อย client_id, redirect_uri, response_type=code, scope=openid profile email, state, code_challenge และ code_challenge_method=S256 โดยระบบนี้บังคับใช้ PKCE เสมอ

### Step 3: รับ authorization code กลับที่ redirect URI

หลังผู้ใช้ล็อกอินสำเร็จ ระบบจะ redirect กลับมายัง redirect URI ที่ลงทะเบียนไว้ พร้อม query parameter ชื่อ code และ state ให้แอปตรวจสอบ state ทุกครั้งก่อนนำ code ไปแลก token

### Step 4: แลก code เป็น token

ส่งคำขอ POST ไปที่ Token endpoint โดยใช้ grant_type=authorization_code, client_id, redirect_uri, code และ code_verifier ถ้า application ของคุณเป็น confidential client ให้ส่ง client authentication ด้วย client_secret_basic หรือ client_secret_post ตามที่ framework รองรับ

### Step 5: อ่านข้อมูลผู้ใช้จาก ID token หรือ UserInfo

เมื่อลงชื่อเข้าใช้สำเร็จ คุณจะได้รับ ID token และ access token โดย claim ที่รองรับประกอบด้วย sub, iss, aud, exp, email, email_verified และ name หากต้องการ profile ล่าสุดสามารถเรียก UserInfo endpoint ด้วย Bearer access token ได้

### Step 6: รองรับ session ต่อเนื่องและ sign-out

หากต้องการต่ออายุ session ให้ใช้ refresh token flow ด้วย grant_type=refresh_token เมื่อขอ scope offline_access และถ้าต้องการ sign-out ฝั่ง OIDC ให้เรียก End Session endpoint จาก discovery document ตาม flow ของ framework ที่ใช้งาน

Generated from RMC SSO Admin and structured from docs/stepsso.md principles. Treat this document as confidential because it may include the client secret.
