import { TopNav } from "@/components/nav/top-nav";

export default function ShellLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col min-h-screen" style={{ background: "var(--bg-root)" }}>
      <TopNav />
      <main className="flex-1">{children}</main>
    </div>
  );
}
