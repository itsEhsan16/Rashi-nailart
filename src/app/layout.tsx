import type { Metadata } from "next";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";
import { NavigationProgress } from "@/components/navigation-progress";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "Rashi Nail Art Studio — Premium Nails, Gel & Extensions",
    template: "%s · Rashi Nail Art Studio",
  },
  description:
    "Book your salon moment at Rashi Nail Art Studio — Vile Parle & Bandra. Premium nail art, gel polish & extensions. Members get an in-store discount for a year.",
  applicationName: "Rashi Nail Art Studio",
  authors: [{ name: "Rashi Nail Art Studio" }],
  keywords: [
    "nail art Mumbai",
    "gel polish",
    "nail extensions",
    "Vile Parle salon",
    "Bandra nail studio",
  ],
  openGraph: {
    type: "website",
    title: "Rashi Nail Art Studio — Premium Nails, Gel & Extensions",
    description:
      "Premium nail art, gel polish & extensions across Vile Parle & Bandra. Reserve your spot in under a minute.",
    siteName: "Rashi Nail Art Studio",
    url: siteUrl,
  },
  twitter: {
    card: "summary_large_image",
    title: "Rashi Nail Art Studio",
    description: "Premium nail art, gel polish & extensions across Mumbai.",
  },
  robots: { index: true, follow: true },
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
      </body>
    </html>
  );
}
