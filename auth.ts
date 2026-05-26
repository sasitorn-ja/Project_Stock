import NextAuth from "next-auth";
import type { NextAuthConfig } from "next-auth";

const issuer = process.env.AUTH_RMC_SSO_ISSUER ?? "https://rmc-sso.cipcloud.net";
const wellKnown =
  process.env.AUTH_RMC_SSO_WELL_KNOWN ??
  `${issuer}/api/auth/.well-known/openid-configuration`;
const clientId = process.env.AUTH_RMC_SSO_CLIENT_ID ?? "sync-drop";
const clientSecret = process.env.AUTH_RMC_SSO_CLIENT_SECRET ?? "";

function serializeAuthMetadata(metadata: unknown) {
  if (!metadata) {
    return "";
  }

  if (metadata instanceof Error) {
    return metadata.stack ?? metadata.message;
  }

  try {
    return JSON.stringify(metadata);
  } catch {
    return String(metadata);
  }
}

function getAuthErrorDetails(error: Error) {
  const cause = "cause" in error ? error.cause : undefined;

  return {
    name: error.name,
    message: error.message,
    stack: error.stack,
    cause: serializeAuthMetadata(cause),
  };
}

if (!clientSecret) {
  // ในระหว่าง build อาจยังไม่มีค่า แต่ runtime ต้องมีเสมอ
  // log แทน throw เพื่อไม่ให้ next build พังถ้า env ไม่ถูกตั้งใน CI
  console.warn("[auth] AUTH_RMC_SSO_CLIENT_SECRET ยังไม่ถูกตั้งค่า");
}

const authConfig: NextAuthConfig = {
  trustHost: true,
  debug: process.env.AUTH_DEBUG === "true",
  session: {
    strategy: "jwt",
  },
  pages: {
    signIn: "/login",
    error: "/login",
  },
  providers: [
    {
      id: "rmc-sso",
      name: "RMC SSO",
      type: "oidc",
      issuer,
      wellKnown,
      clientId,
      clientSecret,
      // PKCE (S256) บังคับจากฝั่ง RMC SSO อยู่แล้ว Auth.js v5 จะเปิด PKCE ให้อัตโนมัติ
      checks: ["pkce", "state"],
      authorization: {
        url: `${issuer}/api/auth/oauth2/authorize`,
        params: {
          scope: "openid profile email offline_access",
          response_type: "code",
        },
      },
      token: {
        url: `${issuer}/api/auth/oauth2/token`,
      },
      userinfo: {
        url: `${issuer}/api/auth/oauth2/userinfo`,
      },
      // ใช้ client_secret_post ตาม spec ของ RMC SSO
      client: {
        token_endpoint_auth_method: "client_secret_post",
        id_token_signed_response_alg: "HS256",
      },
      profile(profile) {
        return {
          id: (profile.sub as string) ?? "",
          name:
            (profile.name as string) ??
            (profile.preferred_username as string) ??
            (profile.email as string) ??
            "",
          email: (profile.email as string) ?? null,
          image: (profile.picture as string) ?? null,
        };
      },
    },
  ],
  callbacks: {
    async jwt({ token, account, profile }) {
      // ครั้งแรกที่ login ให้เก็บ access_token / id_token ลง JWT
      if (account) {
        token.accessToken = account.access_token;
        token.idToken = account.id_token;
        token.refreshToken = account.refresh_token;
        token.expiresAt = account.expires_at;
      }
      if (profile?.sub) {
        token.sub = profile.sub as string;
      }
      return token;
    },
    async session({ session, token }) {
      if (token?.sub && session.user) {
        session.user.id = token.sub;
      }
      return session;
    },
    // หมายเหตุ การตรวจ public/protected path ทำใน middleware.ts เพื่อรวมศูนย์
    // logic เกี่ยวกับ driver QR flow ไว้ที่เดียว
  },
  logger: {
    error(error) {
      console.error("[auth][sso][error]", JSON.stringify(getAuthErrorDetails(error), null, 2));
    },
    warn(code) {
      console.warn(`[auth][sso][warn] ${code}`);
    },
    debug(message, metadata) {
      if (process.env.AUTH_DEBUG === "true") {
        console.debug(`[auth][sso][debug] ${message}`, serializeAuthMetadata(metadata));
      }
    },
  },
};

export const { auth, handlers, signIn, signOut } = NextAuth(authConfig);
