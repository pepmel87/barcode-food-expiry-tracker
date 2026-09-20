"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { useNotifications } from "./NotificationsProvider";

const NAV = [
  {
    href: "/",
    label: "Scadenze",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-6 w-6">
        <rect x="3" y="4" width="18" height="17" rx="2" />
        <path d="M3 9h18M8 2v4M16 2v4M8 14h3M13 14h3M8 18h3" />
      </svg>
    ),
  },
  {
    href: "/scansiona",
    label: "Scansiona",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-6 w-6">
        <path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2" />
        <path d="M7 8v8M10 8v8M13 8v8M17 8v8" />
      </svg>
    ),
  },
  {
    href: "/notifiche",
    label: "Notifiche",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-6 w-6">
        <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0" />
      </svg>
    ),
  },
  {
    href: "/prodotti",
    label: "Prodotti",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-6 w-6">
        <path d="M21 8l-9-5-9 5v8l9 5 9-5V8z" />
        <path d="M3 8l9 5 9-5M12 13v8" />
      </svg>
    ),
  },
];

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { unread } = useNotifications();

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col">
      <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="flex items-center justify-between px-4 py-3">
          <Link href="/" className="flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-600 text-white shadow-sm">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" className="h-5 w-5">
                <path d="M4 7V5a1 1 0 0 1 1-1h2M17 4h2a1 1 0 0 1 1 1v2M20 17v2a1 1 0 0 1-1 1h-2M7 20H5a1 1 0 0 1-1-1v-2" />
                <path d="M8 8v8M11 8v8M14 8v8M16.5 8v8" />
              </svg>
            </span>
            <div className="leading-tight">
              <p className="text-base font-bold tracking-tight text-slate-900">Scadenze Scanner</p>
              <p className="text-[11px] text-slate-500">Gestione scadenze e offerte</p>
            </div>
          </Link>
          <Link
            href="/notifiche"
            aria-label="Notifiche"
            className="relative flex h-10 w-10 items-center justify-center rounded-full text-slate-600 hover:bg-slate-100"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-6 w-6">
              <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0" />
            </svg>
            {unread > 0 ? (
              <span className="absolute -right-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-600 px-1 text-[11px] font-bold text-white">
                {unread > 99 ? "99+" : unread}
              </span>
            ) : null}
          </Link>
        </div>
      </header>

      <main className="flex-1 px-4 pb-28 pt-4">{children}</main>

      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto grid max-w-3xl grid-cols-4">
          {NAV.map((item) => {
            const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`relative flex flex-col items-center gap-0.5 py-2.5 text-[11px] font-medium ${
                  active ? "text-emerald-700" : "text-slate-500 hover:text-slate-800"
                }`}
              >
                <span className={`rounded-xl px-4 py-1 ${active ? "bg-emerald-50" : ""}`}>{item.icon}</span>
                {item.label}
                {item.href === "/notifiche" && unread > 0 ? (
                  <span className="absolute right-[calc(50%-22px)] top-1.5 h-2.5 w-2.5 rounded-full bg-red-600" />
                ) : null}
              </Link>
            );
          })}
        </div>
        <div className="h-[env(safe-area-inset-bottom)]" />
      </nav>
    </div>
  );
}
