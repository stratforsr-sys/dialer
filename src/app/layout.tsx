import type { Metadata } from "next";
import "./globals.css";
import { Inter, Space_Grotesk, JetBrains_Mono } from "next/font/google";
import { ThemeProvider } from "@/components/ThemeProvider";
import { SessionProvider } from "@/components/SessionProvider";

// Inter bär gränssnittet. Space Grotesk är gjord för rubriker och stora
// tal — i 13px tabellceller blir den bred och svårläst, och det är där
// säljaren tillbringar dagen. Instrument Serif är borta: en serif-rubrik
// signalerar redaktionellt, inte operativt instrument.
const sans = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

const display = Space_Grotesk({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-display",
  display: "swap",
});

const mono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Sales Dialer - Clicknet",
  description: "Engineering-grade sales intelligence platform",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="sv"
      className={`light ${sans.variable} ${display.variable} ${mono.variable}`}
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
