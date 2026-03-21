"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, GraduationCap } from "lucide-react";

const sectionLinks = [
  {
    href: "/scholar",
    label: "Mock Lab",
    meta: "Generate tests",
    icon: GraduationCap,
    match: (pathname: string) => pathname === "/scholar",
  },
  {
    href: "/scholar/analytics",
    label: "Analytics",
    meta: "Strength map",
    icon: BarChart3,
    match: (pathname: string) => pathname === "/scholar/analytics",
  },
] as const;

export default function ScholarSectionTabs() {
  const pathname = usePathname();

  return (
    <div className="rounded-[24px] border border-white/[0.08] bg-white/[0.03] p-1 shadow-[0_16px_50px_rgba(2,8,23,0.18)] backdrop-blur-xl">
      <div className="grid gap-1 sm:grid-cols-2">
        {sectionLinks.map((link) => {
          const active = link.match(pathname);
          const Icon = link.icon;

          return (
            <Link
              key={link.href}
              href={link.href}
              className={`group flex items-center gap-3 rounded-[20px] px-4 py-3 transition ${
                active
                  ? "bg-[linear-gradient(135deg,rgba(245,158,11,0.14),rgba(249,115,22,0.18))] text-white ring-1 ring-amber-300/22"
                  : "text-slate-400 hover:bg-white/[0.04] hover:text-slate-100"
              }`}
            >
              <span
                className={`flex h-10 w-10 items-center justify-center rounded-2xl border transition ${
                  active
                    ? "border-amber-300/18 bg-amber-300/10 text-amber-100"
                    : "border-white/8 bg-white/[0.03] text-slate-400 group-hover:text-slate-200"
                }`}
              >
                <Icon className="h-4.5 w-4.5" />
              </span>
              <span>
                <span className="block text-sm font-semibold">{link.label}</span>
                <span className="block text-[11px] text-slate-500">{link.meta}</span>
              </span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
