import NextAuth from "next-auth";

export const { auth, handlers, signIn, signOut } = NextAuth({
  trustHost: true,
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
      issuer: process.env.AUTH_RMC_SSO_ISSUER ?? "https://rmc-sso.cipcloud.net",
      // RMC SSO วาง discovery document ไว้ที่ path ไม่มาตรฐาน (ใต้ /api/auth)
      // ถ้าไม่ระบุ wellKnown Auth.js จะไปดึง {issuer}/.well-known/openid-configuration
      // ซึ่งไม่มีอยู่จริง ทำให้ดึง provider metadata ไม่ได้ -> error=Configuration
      wellKnown:
        process.env.AUTH_RMC_SSO_WELL_KNOWN ??
        `${process.env.AUTH_RMC_SSO_ISSUER ?? "https://rmc-sso.cipcloud.net"}/api/auth/.well-known/openid-configuration`,
      clientId: process.env.AUTH_RMC_SSO_CLIENT_ID ?? "sync-drop",
      clientSecret: process.env.AUTH_RMC_SSO_CLIENT_SECRET,
      authorization: {
        params: {
          scope: "openid profile email offline_access",
        },
      },
      // RMC SSO เซ็น ID token ด้วย HS256 (symmetric, ใช้ client_secret เป็น key)
      // ต้องประกาศให้ openid-client ยอมรับ alg นี้ ไม่งั้น verify id_token จะล้มเหลว
      client: {
        id_token_signed_response_alg: "HS256",
        token_endpoint_auth_method: "client_secret_post",
      },
      checks: ["pkce", "state", "nonce"],
      profile(profile) {
        return {
          id: profile.sub,
          name: profile.name ?? profile.email ?? profile.sub,
          email: profile.email,
          image: null,
        };
      },
    },
  ],
});
