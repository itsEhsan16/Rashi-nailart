import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";
import { NavigationProgress } from "@/components/navigation-progress";
import { InstallPrompt } from "@/components/pwa/install-prompt";
import { StaleBuildReload } from "@/components/pwa/stale-build-reload";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "Rashi Nail Art Studio — Premium Nails, Gel & Extensions",
    template: "%s · Rashi Nail Art Studio",
  },
  description:
    "Book your salon moment at Rashi Nail Art Studio — Vile Parle, Bandra & Borivali W. Premium nail art, gel polish & extensions. Members save in-store all year.",
  applicationName: "Rashi Nail Art Studio",
  authors: [{ name: "Rashi Nail Art Studio" }],
  keywords: [
    "nail art Mumbai",
    "gel polish",
    "nail extensions",
    "Vile Parle salon",
    "Bandra nail studio",
    "Borivali West nail salon",
  ],
  openGraph: {
    type: "website",
    title: "Rashi Nail Art Studio — Premium Nails, Gel & Extensions",
    description:
      "Premium nail art, gel polish & extensions across Vile Parle, Bandra & Borivali W. Reserve your spot in under a minute.",
    siteName: "Rashi Nail Art Studio",
    url: siteUrl,
  },
  twitter: {
    card: "summary_large_image",
    title: "Rashi Nail Art Studio",
    description: "Premium nail art, gel polish & extensions across Mumbai.",
  },
  robots: { index: true, follow: true },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Rashi Nails",
  },
  other: {
    // Next's `appleWebApp.capable` only emits the modern, unprefixed
    // "mobile-web-app-capable" tag — iOS Safari still needs the legacy
    // Apple-prefixed name to launch "Add to Home Screen" in standalone
    // mode (no Safari chrome). Next has no dedicated field for it.
    "apple-mobile-web-app-capable": "yes",
  },
};

export const viewport: Viewport = {
  themeColor: "#A727AA",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@500;600;700&family=Inter:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <NavigationProgress />
        {children}
        <Toaster richColors position="top-center" />
        <InstallPrompt />
        <StaleBuildReload />
      </body>
    </html>
  );
}
