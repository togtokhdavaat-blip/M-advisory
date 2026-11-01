import type { Metadata, Viewport } from "next";
import { Golos_Text, Unbounded } from "next/font/google";
import { SiteFooter, SiteHeader } from "@/components/site-header";
import "./globals.css";

const body = Golos_Text({ subsets: ["latin", "cyrillic"], variable: "--font-body", display: "swap" });
const heading = Unbounded({ subsets: ["latin", "cyrillic"], variable: "--font-heading", display: "swap", weight: ["500", "600"] });

export const metadata: Metadata = {
  title: { default: "M ADVISORY — Үл хөдлөх хөрөнгийн зөвлөх үйлчилгээ", template: "%s · M ADVISORY" },
  description: "Худалдан авахаас өмнө эрсдэлээ шалгуул. M Properties-ийн мэргэжлийн зөвлөх үйлчилгээ онлайнаар.",
  applicationName: "M ADVISORY",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f3f4f1" },
    { media: "(prefers-color-scheme: dark)", color: "#0f171b" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="mn" className={`${body.variable} ${heading.variable}`}>
      <body className="min-h-dvh">
        <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-surface focus:px-4 focus:py-2">
          Үндсэн агуулга руу шилжих
        </a>
        <SiteHeader />
        <main id="main">{children}</main>
        <SiteFooter />
      </body>
    </html>
  );
}
