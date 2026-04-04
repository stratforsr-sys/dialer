import type { Metadata } from "next";
import "./globals.css";
import { ThemeProvider } from "@/components/ThemeProvider";
import { SessionProvider } from "@/components/SessionProvider";

export const metadata: Metadata = {
  title: "Telink Sales Hub",
  description: "Professional sales hub by Telink",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="sv" className="light" data-theme="light" suppressHydrationWarning>
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
