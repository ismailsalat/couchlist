import type { Metadata, Viewport } from "next";
import "./globals.css";
import { MobileNav } from "@/components/mobile-nav";
import { TestModeBanner } from "@/components/test-mode-banner";
import { publicConfig } from "@/lib/config";
import { PwaRegister } from "@/components/pwa-register";

export const metadata: Metadata = {
  title: "Couchlist",
  description: "Good shows. Better company.",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: "/icons/apple-touch-icon.png",
  },
  appleWebApp: {
    capable: true,
    title: "Couchlist",
    statusBarStyle: "black-translucent",
  },
};

export const viewport: Viewport = {
  themeColor: "#0b1220",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { testMode } = publicConfig();

  return (
    <html lang="en">
      <body className="min-h-screen bg-background font-sans text-text-primary antialiased">
        <PwaRegister />
        {testMode ? <TestModeBanner /> : null}
        <div className="mobile-page-shell">{children}</div>
        <MobileNav />
      </body>
    </html>
  );
}
