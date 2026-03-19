import {
  Activity,
  ArrowRight,
  Database,
  FileSearch,
  FileStack,
  MessageSquare,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  Zap,
  Globe,
  Clock,
  CheckCircle2,
} from "lucide-react";
import Link from "next/link";
import { getSession } from "@/lib/auth";

export default async function HomePage() {
  const session = await getSession();

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8 space-y-16">
      {/* ── HERO SECTION ── */}
      <section className="relative overflow-hidden rounded-[3rem] border border-white/[0.08] bg-slate-950/40 p-8 sm:p-16 shadow-2xl backdrop-blur-3xl ring-1 ring-white/[0.03]">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(103,232,249,0.15),transparent_60%)] pointer-events-none" />
        <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-slate-950/20 to-transparent pointer-events-none" />
        
        <div className="relative z-10 grid gap-16 lg:grid-cols-[1.2fr_0.8fr] lg:items-center">
          <div className="space-y-10">
            <div className="inline-flex items-center gap-2 rounded-full border border-cyan-400/20 bg-cyan-400/10 px-5 py-2 text-[11px] font-bold uppercase tracking-widest text-cyan-300 shadow-lg shadow-cyan-900/10">
              <Sparkles className="h-3.5 w-3.5" />
              Grounded Intelligence v2.1
            </div>
            
            <h1 className="text-5xl font-bold tracking-tight text-white sm:text-7xl">
              Professional <br/>
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-blue-500">Document</span> <br/>
              Intelligence.
            </h1>
            
            <p className="max-w-xl text-xl leading-relaxed text-slate-400 font-medium">
              Beyond simple PDF viewing. Securely index, retrieve, and chat with your document library using grounded evidence and agentic reasoning.
            </p>

            <div className="flex flex-wrap gap-5 pt-4">
              {session ? (
                <>
                  <Link href="/chat" className="group flex items-center gap-3 rounded-2xl bg-gradient-to-br from-cyan-500 to-blue-600 px-8 py-4 text-sm font-bold text-white transition hover:brightness-110 shadow-xl shadow-cyan-900/30 ring-1 ring-white/10 active:scale-95">
                    Open Workspace
                    <ArrowRight className="h-4.5 w-4.5 transition-transform group-hover:translate-x-1" />
                  </Link>
                  <Link href="/upload" className="flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-8 py-4 text-sm font-bold text-white transition hover:bg-white/10 hover:border-white/20 active:scale-95">
                    Manage Library
                  </Link>
                </>
              ) : (
                <Link href="/auth" className="flex items-center gap-3 rounded-2xl bg-gradient-to-r from-cyan-500 to-blue-600 px-8 py-4 text-sm font-bold text-white transition hover:brightness-110 shadow-xl shadow-cyan-900/30 ring-1 ring-white/10 active:scale-95">
                  Get Started Free
                  <ArrowRight className="h-4.5 w-4.5" />
                </Link>
              )}
            </div>
          </div>

          {/* Metric Grid */}
          <div className="grid grid-cols-2 gap-5">
            {[
              { icon: ShieldCheck, title: "Grounded", sub: "GroundedMode", col: "text-cyan-400", bg: "bg-cyan-400/10" },
              { icon: Activity, title: "99.9%", sub: "Core Uptime", col: "text-emerald-400", bg: "bg-emerald-400/10" },
              { icon: Database, title: "Local", sub: "Vector Core", col: "text-amber-400", bg: "bg-amber-400/10" },
              { icon: TrendingUp, title: "Fast", sub: "Latent Match", col: "text-blue-400", bg: "bg-blue-400/10" }
            ].map((m, i) => (
              <div key={i} className="rounded-[2rem] border border-white/[0.06] bg-white/[0.03] p-8 backdrop-blur-xl transition hover:border-white/20 hover:bg-white/[0.06] group cursor-default">
                <div className={`mb-6 h-12 w-12 flex items-center justify-center rounded-[1.25rem] ${m.bg} ${m.col} group-hover:scale-110 transition-transform`}>
                  <m.icon className="h-6 w-6" />
                </div>
                <p className="text-3xl font-bold text-white mb-1.5">{m.title}</p>
                <p className="text-[10px] uppercase font-bold tracking-[0.2em] text-slate-500">{m.sub}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── LIVE ACTIVITY FEED (Robust Section) ── */}
      <section className="grid gap-12 lg:grid-cols-[1fr_400px]">
        <div className="space-y-8">
           <div className="space-y-2">
              <h2 className="text-3xl font-bold text-white">Advanced Extraction Flow</h2>
              <p className="text-slate-500 max-w-lg text-lg leading-relaxed">SmartDoc uses the Perplexify retrieval engine to chunk, embed, and cite your documents with extreme precision.</p>
           </div>
           
           <div className="grid gap-4">
              {[
                { title: "Vector Index Generation", body: "Automatic latent indexing upon document ingestion.", icon: Zap },
                { title: "Grounded Citations", body: "Every answer is linked to a highlighted source page.", icon: ShieldCheck },
                { title: "Agentic Reasoning", body: "Multi-step thinking process for complex questions.", icon: Sparkles }
              ].map((f, i) => (
                <div key={i} className="flex gap-6 rounded-3xl border border-white/5 bg-slate-950/20 p-6 transition hover:border-cyan-400/20 hover:bg-slate-950/40 group">
                   <div className="mt-1 h-12 w-12 shrink-0 flex items-center justify-center rounded-2xl bg-white/5 text-slate-400 group-hover:bg-cyan-400/10 group-hover:text-cyan-400 transition-colors">
                      <f.icon className="h-6 w-6" />
                   </div>
                   <div>
                      <h4 className="font-bold text-white mb-2 text-lg">{f.title}</h4>
                      <p className="text-sm leading-relaxed text-slate-500">{f.body}</p>
                   </div>
                </div>
              ))}
           </div>
        </div>

        <aside className="rounded-[2.5rem] border border-white/[0.06] bg-slate-950/40 p-8 flex flex-col justify-between">
           <div className="space-y-6">
              <div className="flex items-center justify-between">
                 <h3 className="font-bold text-white text-lg">System Health</h3>
                 <span className="flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2 py-1 text-[9px] font-bold uppercase tracking-widest text-emerald-400">Operational</span>
              </div>
              <div className="space-y-4">
                 {[
                   { label: "Vector Search API", val: "14ms", status: "Healthy" },
                   { label: "Indexing Pipe", val: "Active", status: "Healthy" },
                   { label: "Auth Middleware", val: "Signed", status: "Healthy" },
                 ].map((s, i) => (
                    <div key={i} className="flex items-center justify-between border-b border-white/5 pb-3">
                       <span className="text-xs text-slate-400">{s.label}</span>
                       <span className="text-xs font-bold text-white">{s.val}</span>
                    </div>
                 ))}
              </div>
           </div>
           <div className="mt-12 rounded-3xl bg-cyan-500/5 border border-cyan-400/10 p-6 text-center">
              <p className="text-sm font-bold text-cyan-300">Ready for Intelligence?</p>
              <Link href="/chat" className="mt-4 inline-flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-white hover:text-cyan-400 transition-colors">
                 Launch Workspace <ArrowRight className="h-3 w-3" />
              </Link>
           </div>
        </aside>
      </section>

      {/* ── SECURITY COMPLIANCE FOOTER ── */}
      <footer className="border-t border-white/5 pt-12 pb-24">
         <div className="grid gap-12 md:grid-cols-4">
            <div className="space-y-6">
               <div className="flex items-center gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/5">
                     <img src="/logo.png" className="h-4 w-4 opacity-50" alt="" />
                  </div>
                  <span className="text-[10px] font-extrabold uppercase tracking-[0.4em] text-slate-500">SmartDoc AI</span>
               </div>
               <p className="text-xs leading-loose text-slate-600 uppercase font-bold tracking-widest">A private, high-fidelity intelligence layer for document processing.</p>
            </div>
            
            <div className="space-y-4">
               <h4 className="text-[10px] uppercase font-bold tracking-widest text-slate-400">Compliance</h4>
               <ul className="space-y-2 text-xs text-slate-600 font-bold uppercase tracking-widest">
                  <li className="flex items-center gap-2"><CheckCircle2 className="h-3 w-3 text-cyan-500" /> Signed Sessions</li>
                  <li className="flex items-center gap-2"><CheckCircle2 className="h-3 w-3 text-cyan-500" /> Isolated Sandbox</li>
                  <li className="flex items-center gap-2"><CheckCircle2 className="h-3 w-3 text-cyan-500" /> Grounded Cite</li>
               </ul>
            </div>

            <div className="space-y-4">
               <h4 className="text-[10px] uppercase font-bold tracking-widest text-slate-400">Navigation</h4>
               <ul className="space-y-2 text-xs text-slate-600 font-bold uppercase tracking-widest">
                  <li><Link href="/upload" className="hover:text-white transition-colors">Library Console</Link></li>
                  <li><Link href="/chat" className="hover:text-white transition-colors">Chat Workspace</Link></li>
                  <li><Link href="/auth" className="hover:text-white transition-colors">Workspace Access</Link></li>
               </ul>
            </div>

            <div className="space-y-4">
               <h4 className="text-[10px] uppercase font-bold tracking-widest text-slate-400">Engine V2.1</h4>
               <div className="rounded-xl border border-white/5 bg-white/[0.02] p-4 text-[10px] text-slate-500 uppercase tracking-widest leading-5">
                  Local Vector Storage: Active <br/>
                  Reasoning Pipe: Groq/Llama-8b <br/>
                  Session Model: HttpOnly
               </div>
            </div>
         </div>
      </footer>
    </div>
  );
}
