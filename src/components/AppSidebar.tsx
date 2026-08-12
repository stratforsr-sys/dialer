"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { useEffect, useState } from "react";
import {
  Users, LayoutGrid, Upload, BarChart2, ShieldCheck, LogOut, Zap, Search,
  FolderOpen, Radio, MessageSquare, SlidersHorizontal, PanelLeftClose, PanelLeftOpen,
  Settings,
} from "lucide-react";
import { NotificationBell } from "@/components/notifications/NotificationBell";

// Dialern har medvetet ingen egen meny-ingång: man ringer alltid inifrån en
// ringlista, via "Starta dialer". /cockpit utan listId skickar till /lists.
const NAV = [
  { href: "/lists",         label: "Ringlistor", icon: FolderOpen },
  { href: "/leads",         label: "Leads",      icon: Users },
  { href: "/pipeline",      label: "Pipeline",   icon: LayoutGrid },
  { href: "/research",      label: "Research",   icon: Search },
  // Sidan redirectar redan säljare till /lists, så länken var en återvändsgränd
  // för alla utom admin. Dölj den i stället för att låta den se klickbar ut.
  { href: "/import",        label: "Importera",  icon: Upload, adminOnly: true },
  { href: "/stats",         label: "Statistik",  icon: BarChart2 },
  { href: "/admin/floor",   label: "Golvet",     icon: Radio, adminOnly: true },
  { href: "/admin/scripts", label: "Manus",      icon: MessageSquare, adminOnly: true },
  { href: "/admin/dialer",  label: "Dialer",     icon: SlidersHorizontal, adminOnly: true },
  { href: "/admin",         label: "Admin",      icon: ShieldCheck, adminOnly: true },
  // Sist och för alla. Egna kontot, inte en arbetsyta — hör hemma närmast
  // användarblocket längst ner, inte bland det man jobbar i.
  { href: "/settings",      label: "Inställningar", icon: Settings },
];

const RAIL = 56;
const OPEN = 216;
const STORAGE_KEY = "saleshub.sidebar.pinned";

export function AppSidebar({
  user,
}: {
  user: { id: string; name: string; email: string; role: string };
}) {
  const pathname = usePathname();

  // Pinnad bredd sparas per webbläsare. En säljare utan erfarenhet behöver
  // etiketterna första veckan; någon som kan systemet vill ha pixlarna.
  // Ingen serverrundtur för ett val som bara rör den här datorn.
  const [pinned, setPinned] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setPinned(localStorage.getItem(STORAGE_KEY) === "1");
    setMounted(true);
  }, []);

  function togglePinned() {
    setPinned((p) => {
      localStorage.setItem(STORAGE_KEY, p ? "0" : "1");
      return !p;
    });
  }

  // Opinnad skena breddar sig vid hover men skjuter aldrig innehållet —
  // den lägger sig ovanpå. Pinnad tar plats i flödet.
  const expanded = pinned || hovered;

  const navItems = NAV.filter((n) => !("adminOnly" in n) || !n.adminOnly || user.role === "ADMIN");

  // Mest specifika träffen vinner — annars lyser /admin även när man
  // står på /admin/floor, och två rader ser aktiva ut samtidigt.
  const activeHref = navItems
    .filter((n) => pathname === n.href || pathname.startsWith(n.href + "/"))
    .sort((a, b) => b.href.length - a.href.length)[0]?.href;

  return (
    // Yttre elementet håller bara ut layoutbredden. Skenan inuti är
    // absolut positionerad så hover-expansionen inte flyttar sidan.
    <div
      className="relative shrink-0 h-screen"
      style={{ width: pinned ? OPEN : RAIL, transition: "width 0.18s var(--ease-out-expo)" }}
    >
      <aside
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        className="absolute inset-y-0 left-0 flex flex-col overflow-hidden z-40"
        style={{
          width: expanded ? OPEN : RAIL,
          background: "var(--surface)",
          borderRight: "1px solid var(--border)",
          boxShadow: hovered && !pinned ? "var(--shadow-2)" : "none",
          transition: "width 0.18s var(--ease-out-expo), box-shadow 0.18s ease",
        }}
      >
        {/* Logotyp + pinne */}
        <div className="flex items-center h-14 px-3 shrink-0">
          <div
            className="w-8 h-8 rounded-md flex items-center justify-center shrink-0"
            style={{ background: "var(--accent)" }}
          >
            <Zap size={14} color="var(--on-accent)" strokeWidth={2.5} />
          </div>

          <span
            className="ml-2.5 text-[13px] font-semibold whitespace-nowrap"
            style={{
              color: "var(--text)",
              fontFamily: "var(--font-display)",
              letterSpacing: "-0.02em",
              opacity: expanded ? 1 : 0,
              transition: "opacity 0.14s ease",
            }}
          >
            Sales Hub
          </span>

          {mounted && (
            <button
              onClick={togglePinned}
              title={pinned ? "Fäll ihop menyn" : "Lås menyn öppen"}
              className="ml-auto flex items-center justify-center w-7 h-7 rounded-sm shrink-0"
              style={{
                color: "var(--text-dim)",
                opacity: expanded ? 1 : 0,
                pointerEvents: expanded ? "auto" : "none",
                transition: "opacity 0.14s ease",
              }}
            >
              {pinned ? <PanelLeftClose size={15} /> : <PanelLeftOpen size={15} />}
            </button>
          )}
        </div>

        {/* Navigation */}
        <nav className="flex flex-col gap-[2px] flex-1 px-2 overflow-y-auto overflow-x-hidden">
          {/* Återkomstklockan ligger överst och inte bland navigeringen: den
              är inte en plats man går till, den är något som händer. Egen
              avgränsning nedåt så att räknaren inte läses som ett menyval. */}
          <NotificationBell expanded={expanded} isAdmin={user.role === "ADMIN"} />
          <div className="my-[6px] mx-[2px] shrink-0" style={{ borderTop: "1px solid var(--border-subtle)" }} />

          {navItems.map(({ href, label, icon: Icon }) => {
            const active = activeHref === href;
            return (
              <Link
                key={href}
                href={href}
                title={expanded ? undefined : label}
                className="flex items-center h-[34px] rounded-md shrink-0 pr-[10px]"
                style={{
                  // Hopfälld skena: 8px nav-padding + 12px + halva ikonen (8px)
                  // = 28px, exakt mitten av 56px. Utan det står ikonraden
                  // två pixlar vänster om logotypen ovanför.
                  paddingLeft: expanded ? 10 : 12,
                  background: active ? "var(--accent-muted)" : "transparent",
                  color: active ? "var(--accent)" : "var(--text-muted)",
                  transition: "background-color 0.12s ease, color 0.12s ease",
                }}
                onMouseEnter={(e) => {
                  if (!active) e.currentTarget.style.background = "var(--surface-inset)";
                }}
                onMouseLeave={(e) => {
                  if (!active) e.currentTarget.style.background = "transparent";
                }}
              >
                <span className="w-4 flex items-center justify-center shrink-0">
                  <Icon size={16} strokeWidth={active ? 2.2 : 1.8} />
                </span>
                <span
                  className="ml-3 text-[13px] font-medium whitespace-nowrap"
                  style={{ opacity: expanded ? 1 : 0, transition: "opacity 0.14s ease" }}
                >
                  {label}
                </span>
              </Link>
            );
          })}
        </nav>

        {/* Användare + utloggning */}
        <div className="px-2 pb-3 pt-2 shrink-0" style={{ borderTop: "1px solid var(--border-subtle)" }}>
          <div className="flex items-center h-[34px] px-[10px] rounded-md">
            <span
              className="w-4 h-4 flex items-center justify-center shrink-0 rounded-sm text-[10px] font-bold"
              style={{ background: "var(--surface-inset)", color: "var(--text-muted)" }}
              title={user.name}
            >
              {user.name.charAt(0).toUpperCase()}
            </span>
            <span
              className="ml-3 min-w-0 whitespace-nowrap"
              style={{ opacity: expanded ? 1 : 0, transition: "opacity 0.14s ease" }}
            >
              <span className="block text-[12px] font-medium truncate" style={{ color: "var(--text-secondary)" }}>
                {user.name}
              </span>
              <span className="block text-[10px] leading-tight" style={{ color: "var(--text-dim)" }}>
                {user.role === "ADMIN" ? "Admin" : "Säljare"}
              </span>
            </span>
          </div>

          <button
            onClick={() => signOut({ callbackUrl: "/login" })}
            title={expanded ? undefined : "Logga ut"}
            className="flex items-center h-[34px] w-full px-[10px] rounded-md"
            style={{ color: "var(--text-dim)", transition: "background-color 0.12s ease, color 0.12s ease" }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = "var(--danger)";
              e.currentTarget.style.background = "var(--danger-bg)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = "var(--text-dim)";
              e.currentTarget.style.background = "transparent";
            }}
          >
            <span className="w-4 flex items-center justify-center shrink-0">
              <LogOut size={15} strokeWidth={1.8} />
            </span>
            <span
              className="ml-3 text-[13px] font-medium whitespace-nowrap"
              style={{ opacity: expanded ? 1 : 0, transition: "opacity 0.14s ease" }}
            >
              Logga ut
            </span>
          </button>
        </div>
      </aside>
    </div>
  );
}
