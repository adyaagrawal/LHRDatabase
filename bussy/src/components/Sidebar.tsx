"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import type { UserRole } from "@/lib/types";

interface Props {
  name: string;
  email: string;
  role: UserRole;
  pendingApprovals: number;
  readyToExport: number;
  accessRequests: number;
}

const MAIN = [
  { href: "/", label: "Dashboard" },
  { href: "/request/new", label: "New request" },
  { href: "/raw", label: "Raw data" },
  { href: "/packages", label: "Package log" },
];

function NavLink({
  href,
  label,
  badge,
  onNavigate,
}: {
  href: string;
  label: string;
  badge?: number;
  onNavigate: () => void;
}) {
  const path = usePathname();
  const active = href === "/" ? path === "/" : path === href || path.startsWith(`${href}/`);
  return (
    <Link
      href={href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={`flex min-h-touch items-center justify-between rounded-md px-3 text-[15px] font-medium transition-colors ${
        active ? "bg-accent text-white" : "text-[#D8D4CC] hover:bg-white/10 hover:text-white"
      }`}
    >
      <span>{label}</span>
      {badge ? (
        <span
          className={`min-w-[24px] rounded-full px-2 py-0.5 text-center font-mono text-xs ${
            active ? "bg-white text-accent-ink" : "bg-accent text-white"
          }`}
          aria-label={`${badge} waiting`}
        >
          {badge}
        </span>
      ) : null}
    </Link>
  );
}

export function Sidebar(p: Props) {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);
  const showApprovals = p.role === "admin" || p.role === "approver";
  const showAdmin = p.role === "admin";

  return (
    <aside className="bg-side text-[#EDEAE4] md:sticky md:top-0 md:flex md:h-screen md:w-sidebar md:shrink-0 md:flex-col">
      <div className="flex items-center justify-between px-5 py-4 md:py-6">
        <Link href="/" className="font-display text-3xl font-bold uppercase tracking-wider text-white">
          BUSSY
        </Link>
        <button
          type="button"
          className="btn-ghost min-w-touch text-white hover:bg-white/10 md:hidden"
          aria-expanded={open}
          aria-controls="main-nav"
          onClick={() => setOpen((o) => !o)}
        >
          {open ? "Close" : "Menu"}
        </button>
      </div>

      <nav
        id="main-nav"
        aria-label="Main"
        className={`${open ? "block" : "hidden"} px-3 pb-4 md:flex md:flex-1 md:flex-col md:pb-0`}
      >
        <ul className="space-y-1">
          {MAIN.map((l) => (
            <li key={l.href}>
              <NavLink {...l} onNavigate={close} />
            </li>
          ))}
        </ul>

        {(showApprovals || showAdmin) && (
          <>
            <p className="mb-1 mt-6 px-3 text-xs font-semibold text-[#9C978E]">Admin</p>
            <ul className="space-y-1">
              {showApprovals && (
                <li>
                  <NavLink
                    href="/admin/approvals"
                    label="Approvals"
                    badge={p.pendingApprovals}
                    onNavigate={close}
                  />
                </li>
              )}
              {showAdmin && (
                <>
                  <li>
                    <NavLink href="/admin/export" label="ESL export" badge={p.readyToExport} onNavigate={close} />
                  </li>
                  <li>
                    <NavLink
                      href="/admin/users"
                      label="Users & settings"
                      badge={p.accessRequests}
                      onNavigate={close}
                    />
                  </li>
                </>
              )}
            </ul>
          </>
        )}

        <div className="mt-6 border-t border-white/10 px-3 pt-4 md:mt-auto md:pb-6">
          <p className="truncate text-sm font-semibold text-white">{p.name}</p>
          <p className="truncate text-xs text-[#9C978E]">{p.email}</p>
          <form action="/auth/signout" method="post" className="mt-2">
            <button
              type="submit"
              className="min-h-touch text-sm font-medium text-[#D8D4CC] underline-offset-4 hover:text-white hover:underline"
            >
              Sign out
            </button>
          </form>
        </div>
      </nav>
    </aside>
  );
}
