import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Telink Dialer — Sales Cockpit",
  description: "AI-powered sales dialer by Telink",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="sv">
      <body className="min-h-screen bg-telink-bg text-telink-text antialiased">
        <div className="relative z-10">{children}</div>
      </body>
    </html>
  );
}
