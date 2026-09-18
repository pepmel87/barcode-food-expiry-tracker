import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { AppShell } from "@/components/AppShell";
import { NotificationsProvider } from "@/components/NotificationsProvider";
import "./globals.css";

export const metadata: Metadata = {
  title: "Scadenze Scanner",
  description:
    "Scansiona i codici a barre dei prodotti alimentari, registra le scadenze e ricevi le notifiche per metterli in offerta in tempo.",
  manifest: "/manifest.webmanifest",
  applicationName: "Scadenze Scanner",
  appleWebApp: { capable: true, statusBarStyle: "default", title: "Scadenze" },
  icons: {
    icon: [{ url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
};

export const viewport: Viewport = {
  themeColor: "#059669",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="it">
      <body className="bg-slate-100 text-slate-900 antialiased">
        <NotificationsProvider>
          <AppShell>{children}</AppShell>
        </NotificationsProvider>
      </body>
    </html>
  );
}
