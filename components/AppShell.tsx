"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import {
  FileUp,
  GraduationCap,
  LayoutDashboard,
  LoaderCircle,
  LogOut,
  MessageSquareText,
  Zap,
} from "lucide-react";

import type { AuthSession } from "@/lib/types";

type AppShellProps = {
  children: React.ReactNode;
  session: AuthSession | null;
};

const navLinks = [
  { href: "/", label: "Home", icon: LayoutDashboard },
  { href: "/upload", label: "Library", icon: FileUp },
  { href: "/chat", label: "Workspace", icon: MessageSquareText },
  { href: "/scholar", label: "Scholar", icon: GraduationCap },
];

export default function AppShell({ children, session }: AppShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [signingOut, setSigningOut] = useState(false);

  const isAuthPage = pathname === "/auth";
  const isChatPage = pathname === "/chat" || pathname.startsWith("/chat/");
  const isScholarPage =
    pathname === "/scholar" || pathname.startsWith("/scholar/");
  const isWorkspacePage = isChatPage || isScholarPage;

  async function handleSignOut() {
    setSigningOut(true);
    try {
      await fetch("/api/auth/session", { method: "DELETE" });
      router.push("/auth");
      router.refresh();
    } finally {
      setSigningOut(false);
    }
  }

  const profile = session
    ? {
        initials: session.name
          .split(/\s+/)
          .filter(Boolean)
          .slice(0, 2)
          .map((s) => s[0]?.toUpperCase() ?? "")
          .join(""),
        label: session.name,
      }
    : null;

  return (
    <div className={`flex flex-col h-screen overflow-hidden bg-slate-950 font-sans transition-colors duration-500`}>
      {/* ── UNIFIED TOP BAR ── */}
      {!isAuthPage && (
        <header className="sticky top-0 z-[60] flex h-16 shrink-0 items-center justify-between border-b border-white/[0.06] bg-slate-950/70 px-6 backdrop-blur-xl shadow-lg ring-1 ring-white/[0.02]">
          <div className="flex items-center gap-8">
            <Link href="/" className="flex items-center gap-3 active:scale-95 transition-transform group">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-400/20 to-blue-500/20 shadow-inner ring-1 ring-white/10 group-hover:ring-cyan-400/30 transition-all">
                <Image
                  src="/logo-mark.png"
                  width={24}
                  height={24}
                  alt="Lexora AI"
                  className="h-6 w-6 object-contain"
                />
              </div>
              <div className="hidden sm:block">
                 <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-cyan-400/80">Lexora AI</p>
                 <p className="text-xs font-bold text-white group-hover:text-cyan-400 transition-colors">Intelligence Layer</p>
              </div>
            </Link>

            <nav className="flex items-center gap-1">
              {navLinks.map((link) => {
                const active = pathname === link.href || (link.href !== "/" && pathname.startsWith(link.href));
                const Icon = link.icon;
                return (
                  <Link
                    key={link.label}
                    href={link.href}
                    className={`flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition-all relative group ${
                      active
                        ? "text-white bg-white/[0.05]"
                        : "text-slate-400 hover:text-slate-100 hover:bg-white/[0.02]"
                    }`}
                  >
                    {active && <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-cyan-400 to-blue-500 rounded-full" />}
                    <Icon className={`h-4 w-4 ${active ? "text-cyan-400" : "group-hover:text-slate-200"}`} />
                    {link.label}
                  </Link>
                );
              })}
            </nav>
          </div>

          <div className="flex items-center gap-4">
             <div className="hidden md:flex items-center gap-1.5 rounded-full border border-emerald-500/20 bg-emerald-500/5 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-emerald-400">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                System Ready
             </div>

             {session ? (
               <div className="flex items-center gap-3 pl-4 border-l border-white/5">
                  <div className="hidden lg:flex flex-col items-end mr-1">
                     <p className="text-xs font-bold text-white leading-tight">{session.name}</p>
                     <p className="text-[9px] uppercase font-bold tracking-widest text-slate-500">Workspace Owner</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void handleSignOut()}
                    disabled={signingOut}
                    className="h-9 w-9 flex items-center justify-center rounded-xl border border-white/5 bg-white/5 text-slate-400 hover:bg-rose-500/10 hover:text-rose-400 transition-all disabled:opacity-30"
                  >
                    {signingOut ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <LogOut className="h-4 w-4" />}
                  </button>
                  <div className="h-10 w-10 flex items-center justify-center rounded-xl bg-gradient-to-br from-cyan-400/20 to-blue-500/20 text-xs font-bold text-cyan-200 border border-white/10 shadow-inner select-none">
                    {profile?.initials}
                  </div>
               </div>
             ) : (
                <div className="flex items-center gap-2">
                   <Link href="/auth?mode=signin" className="px-4 py-2 text-xs font-bold text-slate-400 hover:text-white transition-colors">Sign In</Link>
                   <Link href="/auth?mode=signup" className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 px-5 py-2.5 text-xs font-bold text-white transition hover:brightness-110 shadow-lg shadow-cyan-900/20">
                     Join Engine
                     <Zap className="h-3.5 w-3.5" />
                   </Link>
                </div>
             )}
          </div>
        </header>
      )}

      {/* ── ROBUST MAIN CONTAINER ── */}
      <main className={`relative flex-1 ${isWorkspacePage ? 'overflow-hidden' : 'overflow-y-auto overflow-x-hidden'}`}>
        {!isAuthPage && (
          <>
            <div className="workspace-orb workspace-orb-left" />
            <div className="workspace-orb workspace-orb-right" />
          </>
        )}
        
        {/* Children wrapper - Fix: No more height constraint for scrollable pages */}
        <div className={`relative z-10 w-full ${isWorkspacePage ? 'h-full' : 'min-h-full'}`}>
          {children}
        </div>
      </main>
    </div>
  );
}
