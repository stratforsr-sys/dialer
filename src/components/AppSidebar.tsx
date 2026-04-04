"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import {
  LayoutGrid,
  Users,
  Phone,
  BarChart2,
  Settings,
  LogOut,
  Zap,
  Upload,
} from "lucide-react";

const NAV = [
  { href: "/leads",    label: "Leads",    icon: Users },
  { href: "/pipeline", label: "Pipeline", icon: LayoutGrid },
  { href: "/cockpit",  label: "Cockpit",  icon: Phone },
  { href: "/import",   label: "Importera", icon: Upload },
  { href: "/stats",    label: "Statistik",icon: BarChart2 },
  { href: "/settings", label: "Inställningar", icon: Settings },
];

export function AppSidebar({
  user,
}: {
  user: { id: string; name: string; email: string; role: string };
}) {
  const pathname = usePathname();

  return (
    <aside
      className="flex flex-col w-[220px] shrink-0 h-screen border-r"
      style={{
        background: "var(--surface)",
        borderColor: "var(--border)",
      }}
    >
      {/* Logo */}
      <div
        className="flex items-center gap-2 px-5 h-[56px] border-b"
        style={{ borderColor: "var(--border)" }}
      >
        <div
          className="w-7 h-7 rounded-[7px] flex items-center justify-center shrink-0"
          style={{ background: "var(--accent)" }}
        >
          <Zap size={13} color="white" strokeWidth={2.5} />
        </div>
        <span
          className="text-[14px] font-semibold tracking-tight"
          style={{ color: "var(--text)" }}
        >
          Sales Hub
        </span>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 flex flex-col gap-[2px]">
        {NAV.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(href + "/");
          return (
            <Link
              key={href}
              href={href}
              className="flex items-center gap-[10px] px-3 py-[7px] text-[13px] font-medium transition-colors duration-100"
              style={{
                borderRadius: "8px",
                background: active ? "var(--accent-muted)" : "transparent",
                color: active ? "var(--accent)" : "var(--text-muted)",
              }}
            >
              <Icon size={15} strokeWidth={active ? 2.5 : 2} />
              {label}
            </Link>
          );
        })}
      </nav>

      {/* User + signout */}
      <div
        className="px-3 py-3 border-t"
        style={{ borderColor: "var(--border)" }}
      >
        <div
          className="flex items-center gap-[10px] px-3 py-2 rounded-[8px] mb-1"
          style={{ background: "var(--surface-inset)" }}
        >
          <div
            className="w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0"
            style={{ background: "var(--accent)", color: "white" }}
          >
            {user.name.charAt(0).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <p
              className="text-[12px] font-medium truncate"
              style={{ color: "var(--text)" }}
            >
              {user.name}
            </p>
            <p
              className="text-[11px] truncate"
              style={{ color: "var(--text-dim)" }}
            >
              {user.role === "ADMIN" ? "Admin" : "Säljare"}
            </p>
          </div>
        </div>

        <button
          onClick={() => signOut({ callbackUrl: "/login" })}
          className="flex items-center gap-[10px] w-full px-3 py-[7px] text-[13px] transition-colors duration-100"
          style={{
            borderRadius: "8px",
            color: "var(--text-muted)",
          }}
          onMouseEnter={(e) =>
            (e.currentTarget.style.color = "var(--danger)")
          }
          onMouseLeave={(e) =>
            (e.currentTarget.style.color = "var(--text-muted)")
          }
        >
          <LogOut size={14} />
          Logga ut
        </button>
      </div>
    </aside>
  );
}
