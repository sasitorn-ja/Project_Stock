export type AppSession = {
  user: {
    id: string;
    name?: string | null;
    email?: string | null;
  };
  expiresAt: number;
};

export const sessionCookieName = "syncdrop.session";
export const ssoStateCookieName = "syncdrop.sso.state";
export const ssoVerifierCookieName = "syncdrop.sso.verifier";
export const ssoCallbackCookieName = "syncdrop.sso.callback";

const sessionMaxAgeSeconds = 8 * 60 * 60;

function getSessionSecret() {
  return process.env.AUTH_SECRET || process.env.APP_SESSION_SECRET || "";
}

function base64UrlEncode(input: ArrayBuffer | Uint8Array | string) {
  const bytes =
    typeof input === "string"
      ? new TextEncoder().encode(input)
      : input instanceof Uint8Array
        ? input
        : new Uint8Array(input);

  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });

  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlDecode(input: string) {
  const normalized = input.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
}

function base64UrlDecodeText(input: string) {
  return new TextDecoder().decode(base64UrlDecode(input));
}

async function sign(value: string, secret: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value));

  return base64UrlEncode(signature);
}

async function verifySignature(value: string, signature: string, secret: string) {
  const expected = await sign(value, secret);
  return expected === signature;
}

export function getSessionCookieMaxAge() {
  return sessionMaxAgeSeconds;
}

export async function createSessionCookieValue(user: AppSession["user"]) {
  const secret = getSessionSecret();

  if (!secret) {
    throw new Error("Missing AUTH_SECRET");
  }

  const payload: AppSession = {
    user,
    expiresAt: Math.floor(Date.now() / 1000) + sessionMaxAgeSeconds,
  };
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const signature = await sign(encodedPayload, secret);

  return `${encodedPayload}.${signature}`;
}

export async function getSessionFromCookieValue(value?: string | null): Promise<AppSession | null> {
  const secret = getSessionSecret();

  if (!value || !secret) {
    return null;
  }

  const [encodedPayload, signature] = value.split(".");

  if (!encodedPayload || !signature) {
    return null;
  }

  if (!(await verifySignature(encodedPayload, signature, secret))) {
    return null;
  }

  try {
    const session = JSON.parse(base64UrlDecodeText(encodedPayload)) as AppSession;
    const now = Math.floor(Date.now() / 1000);

    if (!session.user?.id || !session.expiresAt || session.expiresAt <= now) {
      return null;
    }

    return session;
  } catch {
    return null;
  }
}

export function createRandomBase64Url(byteLength = 32) {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return base64UrlEncode(bytes);
}

export async function createPkceChallenge(verifier: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return base64UrlEncode(digest);
}

export function decodeJwtPayload(token: string) {
  const [, payload] = token.split(".");

  if (!payload) {
    throw new Error("Invalid ID token");
  }

  return JSON.parse(base64UrlDecodeText(payload)) as {
    sub?: string;
    iss?: string;
    aud?: string | string[];
    exp?: number;
    email?: string;
    name?: string;
  };
}

export async function verifyHs256Jwt(token: string, secret: string) {
  const [header, payload, signature] = token.split(".");

  if (!header || !payload || !signature) {
    throw new Error("Invalid ID token");
  }

  const parsedHeader = JSON.parse(base64UrlDecodeText(header)) as { alg?: string };

  if (parsedHeader.alg !== "HS256") {
    throw new Error(`Unsupported ID token alg: ${parsedHeader.alg || "unknown"}`);
  }

  const valid = await verifySignature(`${header}.${payload}`, signature, secret);

  if (!valid) {
    throw new Error("Invalid ID token signature");
  }

  return decodeJwtPayload(token);
}
