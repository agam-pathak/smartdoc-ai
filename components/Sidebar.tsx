"use client";

import Image from "next/image";
import type { LucideIcon } from "lucide-react";
import {
  ArrowUpRight,
  FileUp,
  LayoutDashboard,
  LoaderCircle,
  LogOut,
  MessageSquareText,
  Orbit,
  Sparkles,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import type { AuthSession } from "@/lib/types";

type NavigationLink = {
  href: string;
  label: string;
  icon: LucideIcon;
  meta: string;
};

type SidebarProps = {
  session: AuthSession | null;
};

const navigationLinks: NavigationLink[] = [
  {
    href: "/",
    label: "Gateway",
    icon: LayoutDashboard,
    meta: "Overview and app access",
  },
  {
    href: "/upload",
    label: "Library",
    icon: FileUp,
    meta: "Upload, review, and manage PDFs",
  },
  {
    href: "/chat",
    label: "Workspace",
    icon: MessageSquareText,
    meta: "Grounded chat and source review",
  },
];

const flowSteps = ["Authenticate", "Index PDFs", "Query with retrieval"];

function DesktopNavigationItem({
  href,
  label,
  meta,
  icon: Icon,
  active,
}: NavigationLink & { active: boolean }) {
  return (
    <Link
      href={href}
      className={`group flex items-start justify-between rounded-[24px] px-4 py-4 transition ${
        active
          ? "border border-cyan-300/24 bg-cyan-300/12 text-white shadow-[0_16px_36px_rgba(34,211,238,0.08)]"
          : "border border-transparent bg-white/[0.02] text-slate-300 hover:border-white/10 hover:bg-white/[0.05] hover:text-white"
      }`}
    >
      <span className="flex items-start gap-3">
        <span
          className={`mt-0.5 flex h-10 w-10 items-center justify-center rounded-2xl ${
            active ? "bg-cyan-300/14 text-cyan-100" : "bg-white/[0.06] text-slate-300"
          }`}
        >
          <Icon className="h-4.5 w-4.5" />
        </span>
        <span className="min-w-0">
          <span className="block text-sm font-semibold">{label}</span>
          <span className="mt-1 block text-xs leading-5 text-slate-400">
            {meta}
          </span>
        </span>
      </span>

      <ArrowUpRight
        className={`mt-1 h-4 w-4 transition ${
          active ? "opacity-100" : "opacity-0 group-hover:opacity-60"
        }`}
      />
    </Link>
  );
}

function MobileNavigationItem({
  href,
  icon: Icon,
  active,
}: Pick<NavigationLink, "href" | "icon"> & { active: boolean }) {
  return (
    <Link
      href={href}
      className={`flex h-12 w-12 items-center justify-center rounded-2xl transition ${
        active
          ? "bg-cyan-300/14 text-white shadow-[inset_0_0_0_1px_rgba(103,232,249,0.18)]"
          : "text-slate-300 hover:bg-white/[0.06] hover:text-white"
      }`}
      aria-label={href}
    >
      <Icon className="h-4.5 w-4.5" />
    </Link>
  );
}

export default function Sidebar({ session }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [signingOut, setSigningOut] = useState(false);

  const profile = useMemo(() => {
    if (!session) {
      return {
        label: "Guest access",
        meta: "Sign in to unlock the workspace",
        initials: "G",
      };
    }

    const initials = session.name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((segment) => segment[0]?.toUpperCase() ?? "")
      .join("");

    return {
      label: session.name,
      meta: session.email,
      initials: initials || "S",
    };
  }, [session]);

  async function handleSignOut() {
    setSigningOut(true);

    try {
      await fetch("/api/auth/session", {
        method: "DELETE",
      });
      router.push("/auth");
      router.refresh();
    } finally {
      setSigningOut(false);
    }
  }

  return (
    <>
      <div className="fixed inset-x-4 top-4 z-40 lg:hidden">
        <div className="panel px-4 py-3">
          <div className="flex items-center justify-between gap-4">
            <Link href="/" className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center">
                <Image
                  src="/logo-mark.png"
                  width={36}
                  height={36}
                  alt="Lexora AI"
                  className="h-9 w-9 object-contain"
                />
              </div>
              <div>
                <p className="mono text-[10px] uppercase tracking-[0.32em] text-cyan-100/65">
                  Lexora AI
                </p>
                <p className="text-sm font-semibold text-white">Workspace shell</p>
              </div>
            </Link>

            <div className="flex items-center gap-2">
              {navigationLinks.map((link) => (
                <MobileNavigationItem
                  key={link.href}
                  href={link.href}
                  icon={link.icon}
                  active={pathname === link.href}
                />
              ))}
            </div>
          </div>
        </div>
      </div>

      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[20.25rem] px-5 py-6 lg:flex lg:flex-col">
        <div className="panel h-full p-4">
          <div className="flex h-full flex-col">
            <div className="panel-soft overflow-hidden p-4">
              <div className="shine-surface absolute inset-0 opacity-20" />
              <div className="relative">
                <div className="flex items-start justify-between gap-3">
                  <Link href="/" className="flex items-center gap-3">
                    <div className="flex h-12 w-12 items-center justify-center">
                      <Image
                        src="/logo-mark.png"
                        width={40}
                        height={40}
                        alt="Lexora AI"
                        className="h-10 w-10 object-contain"
                      />
                    </div>
                    <div>
                      <p className="mono text-[10px] uppercase tracking-[0.32em] text-cyan-100/65">
                        Retrieval layer
                      </p>
                      <h1 className="text-lg font-semibold text-white">Lexora AI</h1>
                    </div>
                  </Link>

                  <div className="data-pill">
                    <span className="status-ring" />
                    Live
                  </div>
                </div>

                <p className="mt-4 text-sm leading-6 text-slate-300">
                  A premium workspace for upload, indexing, retrieval, and
                  evidence-backed chat.
                </p>
              </div>
            </div>

            <div className="mt-5">
              <div className="mb-3 flex items-center justify-between">
                <p className="mono text-[11px] uppercase tracking-[0.28em] text-cyan-100/70">
                  Navigation
                </p>
                <div className="data-pill">
                  <Orbit className="h-3.5 w-3.5 text-cyan-100" />
                  Flow
                </div>
              </div>

              <nav className="space-y-2">
                {navigationLinks.map((link) => (
                  <DesktopNavigationItem
                    key={link.href}
                    {...link}
                    active={pathname === link.href}
                  />
                ))}
              </nav>
            </div>

            <div className="panel-soft mt-5 p-4">
              <p className="mono text-[11px] uppercase tracking-[0.28em] text-cyan-100/70">
                Workspace cadence
              </p>

              <div className="mt-4 space-y-3">
                {flowSteps.map((step, index) => (
                  <div
                    key={step}
                    className="flex items-center gap-3 rounded-[22px] border border-white/8 bg-slate-950/35 px-3 py-3"
                  >
                    <span className="mono flex h-8 w-8 items-center justify-center rounded-full bg-white/[0.06] text-[11px] text-cyan-100">
                      0{index + 1}
                    </span>
                    <span className="text-sm text-slate-200">{step}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="panel-soft mt-5 p-4">
              <div className="flex items-center justify-between rounded-[22px] border border-white/8 bg-slate-950/35 px-3 py-3">
                <span className="text-sm text-slate-300">Security</span>
                <span className="mono text-[11px] text-cyan-100">httpOnly</span>
              </div>
              <div className="mt-3 flex items-center justify-between rounded-[22px] border border-white/8 bg-slate-950/35 px-3 py-3">
                <span className="text-sm text-slate-300">Context mode</span>
                <span className="mono text-[11px] text-emerald-200">grounded</span>
              </div>
            </div>

            <div className="panel-soft mt-auto p-4">
              <div className="mb-4 flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/[0.07] text-slate-100">
                  <span className="text-sm font-semibold">{profile.initials}</span>
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-white">
                    {profile.label}
                  </p>
                  <p className="truncate text-xs text-slate-400">{profile.meta}</p>
                </div>
              </div>

              <div className="rounded-[22px] border border-white/8 bg-slate-950/35 p-3 text-sm text-slate-300">
                <div className="flex items-center gap-2 text-white">
                  <Sparkles className="h-4 w-4 text-cyan-100" />
                  Robust flow
                </div>
                <p className="mt-2 leading-6">
                  Jump between library and workspace without losing the product
                  thread.
                </p>
              </div>

              <button
                type="button"
                onClick={() => void handleSignOut()}
                disabled={signingOut}
                className="premium-button-secondary mt-4 w-full disabled:cursor-not-allowed disabled:opacity-60"
              >
                {signingOut ? (
                  <LoaderCircle className="h-4 w-4 animate-spin" />
                ) : (
                  <LogOut className="h-4 w-4" />
                )}
                Sign out
              </button>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}
