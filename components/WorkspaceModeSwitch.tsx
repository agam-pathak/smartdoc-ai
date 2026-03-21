"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { GraduationCap, MessageSquareText } from "lucide-react";

const workspaceModes = [
  {
    href: "/chat",
    label: "Standard Workspace",
    meta: "PDF-grounded RAG",
    icon: MessageSquareText,
    match: (pathname: string) => pathname === "/chat" || pathname.startsWith("/chat/"),
  },
  {
    href: "/scholar",
    label: "Scholar Workspace",
    meta: "Exam mode",
    icon: GraduationCap,
    match: (pathname: string) =>
      pathname === "/scholar" || pathname.startsWith("/scholar/"),
  },
] as const;

export default function WorkspaceModeSwitch() {
  const pathname = usePathname();

  return (
    <div className="rounded-[24px] border border-white/[0.08] bg-white/[0.03] p-1 shadow-[0_20px_70px_rgba(2,8,23,0.24)] backdrop-blur-xl">
      <div className="grid gap-1 sm:grid-cols-2">
        {workspaceModes.map((mode) => {
          const active = mode.match(pathname);
          const Icon = mode.icon;

          return (
            <Link
              key={mode.href}
              href={mode.href}
              className={`group flex items-center gap-3 rounded-[20px] px-4 py-3 transition ${
                active
                  ? "bg-[linear-gradient(135deg,rgba(34,211,238,0.16),rgba(59,130,246,0.18))] text-white ring-1 ring-cyan-300/25"
                  : "text-slate-400 hover:bg-white/[0.04] hover:text-slate-100"
              }`}
            >
              <span
                className={`flex h-10 w-10 items-center justify-center rounded-2xl border transition ${
                  active
                    ? "border-cyan-300/20 bg-cyan-300/12 text-cyan-100"
                    : "border-white/8 bg-white/[0.03] text-slate-400 group-hover:text-slate-200"
                }`}
              >
                <Icon className="h-4.5 w-4.5" />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold">{mode.label}</span>
                <span className="block text-[11px] text-slate-500">{mode.meta}</span>
              </span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
