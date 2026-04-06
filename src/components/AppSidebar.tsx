"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import {
  Users, LayoutGrid, Phone, Upload, BarChart2, ShieldCheck, LogOut, Zap, Search,
} from "lucide-react";

const NAV = [
  { href: "/leads",    label: "Leads",     icon: Users },
  { href: "/pipeline", label: "Pipeline",  icon: LayoutGrid },
  { href: "/cockpit",  label: "Cockpit",   icon: Phone },
  { href: "/research", label: "Research",  icon: Search },
  { href: "/import",   label: "Importera", icon: Upload },
  { href: "/stats",    label: "Statistik", icon: BarChart2 },
  { href: "/admin",    label: "Admin",     icon: ShieldCheck, adminOnly: true },
];

export function AppSidebar({
  user,
}: {
  user: { id: string; name: string; email: string; role: string };
}) {
  const pathname = usePathname();
  const navItems = NAV.filter((n) => !("adminOnly" in n) || !n.adminOnly || user.role === "ADMIN");

  return (
    <aside
      className="flex flex-col items-center w-[56px] shrink-0 h-screen border-r py-4 gap-1"
      style={{ background: "var(--surface)", borderColor: "var(--border)" }}
    >
      {/* Logo mark */}
      <div className="mb-4 flex items-center justify-center">
        <div
          className="w-8 h-8 rounded-[9px] flex items-center justify-center"
          style={{ background: "var(--accent)" }}
        >
          <Zap size={14} color="var(--bg)" strokeWidth={2.5} />
        </div>
      </div>

      {/* Nav icons */}
      <nav className="flex flex-col items-center gap-[3px] flex-1">
        {navItems.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(href + "/");
          return (
            <Link
              key={href}
              href={href}
              title={label}
              className="relative group flex items-center justify-center w-9 h-9 transition-all duration-150"
              style={{
                borderRadius: "10px",
                background: active ? "var(--accent)" : "transparent",
                color: active ? "var(--bg)" : "var(--text-dim)",
              }}
            >
              <Icon size={16} strokeWidth={active ? 2.2 : 1.8} />

              {/* Tooltip */}
              <span
                className="pointer-events-none absolute left-full ml-3 whitespace-nowrap px-2 py-1 text-[11px] font-medium rounded-[6px] opacity-0 group-hover:opacity-100 transition-opacity duration-150 z-50"
                style={{
                  background: "var(--text)",
                  color: "var(--bg)",
                  boxShadow: "var(--shadow-md)",
                }}
              >
                {label}
              </span>
            </Link>
          );
        })}
      </nav>

      {/* User avatar + signout */}
      <div className="flex flex-col items-center gap-[3px] mt-auto">
        {/* Avatar */}
        <div
          className="group relative flex items-center justify-center w-9 h-9 rounded-[10px] text-[12px] font-bold"
          style={{ background: "var(--surface-inset)", color: "var(--text-muted)", border: "1px solid var(--border-strong)" }}
          title={user.name}
        >
          {user.name.charAt(0).toUpperCase()}
          {/* Tooltip */}
          <span
            className="pointer-events-none absolute left-full ml-3 whitespace-nowrap px-2 py-1 text-[11px] font-medium rounded-[6px] opacity-0 group-hover:opacity-100 transition-opacity duration-150 z-50"
            style={{ background: "var(--text)", color: "var(--bg)", boxShadow: "var(--shadow-md)" }}
          >
            {user.name} · {user.role === "ADMIN" ? "Admin" : "Säljare"}
          </span>
        </div>

        {/* Signout */}
        <button
          onClick={() => signOut({ callbackUrl: "/login" })}
          title="Logga ut"
          className="group relative flex items-center justify-center w-9 h-9 transition-all duration-150"
          style={{ borderRadius: "10px", color: "var(--text-dim)" }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "var(--danger)"; (e.currentTarget as HTMLButtonElement).style.background = "var(--danger-bg)"; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "var(--text-dim)"; (e.currentTarget as HTMLButtonElement).style.background = "transparent"; }}
        >
          <LogOut size={15} strokeWidth={1.8} />
          <span
            className="pointer-events-none absolute left-full ml-3 whitespace-nowrap px-2 py-1 text-[11px] font-medium rounded-[6px] opacity-0 group-hover:opacity-100 transition-opacity duration-150 z-50"
            style={{ background: "var(--text)", color: "var(--bg)", boxShadow: "var(--shadow-md)" }}
          >
            Logga ut
          </span>
        </button>
      </div>
    </aside>
  );
}
