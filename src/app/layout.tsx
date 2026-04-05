import type { Metadata } from "next";
import "./globals.css";
import { Instrument_Serif, Space_Grotesk, JetBrains_Mono } from "next/font/google";
import { ThemeProvider } from "@/components/ThemeProvider";
import { SessionProvider } from "@/components/SessionProvider";

const serif = Instrument_Serif({
  weight: ["400"],
  style: ["normal", "italic"],
  subsets: ["latin"],
  variable: "--font-serif",
  display: "swap",
});

const sans = Space_Grotesk({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  variable: "--font-sans",
  display: "swap",
});

const mono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Sales Hub — Techgruppen",
  description: "Engineering-grade sales intelligence platform",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="sv"
      className={`light ${serif.variable} ${sans.variable} ${mono.variable}`}
      data-theme="light"
      suppressHydrationWarning
    >
      <body className="min-h-screen antialiased">
        <SessionProvider>
          <ThemeProvider>
            <div className="relative z-10">{children}</div>
          </ThemeProvider>
        </SessionProvider>
      </body>
    </html>
  );
}
