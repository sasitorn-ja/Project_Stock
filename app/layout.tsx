import type { Metadata } from "next";
import "./globals.css";
import { auth } from "@/auth";
import { AppShell } from "@/components/layout/app-shell";
import { AuthProvider } from "@/components/providers/auth-provider";
import { ThemeProvider } from "@/components/providers/theme-provider";

export const metadata: Metadata = {
  title: "SyncDrop",
  description: "ระบบขนส่ง ตรวจรับ-ส่งสินค้าแบบ Job ด้วย QR และ GPS",
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const session = await auth();

  return (
    <html lang="th" suppressHydrationWarning>
      <body>
        <ThemeProvider>
          <AuthProvider session={session}>
            <AppShell>{children}</AppShell>
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
