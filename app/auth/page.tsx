"use client";

import {
  Eye,
  EyeOff,
  KeyRound,
  LockKeyhole,
  Mail,
  Sparkles,
  UserRound,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

type AuthMode = "signin" | "signup" | "forgot" | "reset";

type FormState = {
  name: string;
  email: string;
  password: string;
  confirmPassword: string;
};

function normalizeRedirectPath(candidate: string | null) {
  if (!candidate || !candidate.startsWith("/") || candidate.startsWith("//")) {
    return "/chat";
  }

  return candidate;
}

const modeCopy: Record<AuthMode, { title: string; subtitle: string; submitLabel: string; }> = {
  signin: { title: "Welcome back", subtitle: "Enter your credentials to access your private document workspace.", submitLabel: "Sign In" },
  signup: { title: "Create Workspace", subtitle: "Start a protected account and move straight into grounded retrieval.", submitLabel: "Create Account" },
  forgot: { title: "Reset Access", subtitle: "Generate a recovery link for the email tied to your workspace.", submitLabel: "Send Reset Link" },
  reset: { title: "New Password", subtitle: "Finish the recovery flow with a secure replacement password.", submitLabel: "Reset Password" },
};

function AuthPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [mode, setMode] = useState<AuthMode>("signin");
  const [form, setForm] = useState<FormState>({ name: "", email: "", password: "", confirmPassword: "" });
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [resetPreviewPath, setResetPreviewPath] = useState("");
  const [resetPreviewExpiry, setResetPreviewExpiry] = useState("");

  const token = searchParams.get("token") || "";
  const redirectPath = normalizeRedirectPath(
    searchParams.get("redirect") || searchParams.get("next"),
  );

  useEffect(() => {
    const requestedMode = searchParams.get("mode") as AuthMode;
    if (["signin", "signup", "forgot", "reset"].includes(requestedMode)) {
      setMode(requestedMode);
    }
  }, [searchParams]);

  useEffect(() => {
    if (mode !== "forgot") {
      setResetPreviewPath("");
      setResetPreviewExpiry("");
    }
  }, [mode]);

  function updateField(field: keyof FormState, value: string) {
    setForm(prev => ({ ...prev, [field]: value }));
    setErrorMessage("");
    setStatusMessage("");
  }

  async function handleSubmit() {
    setSubmitting(true);
    setErrorMessage("");
    try {
      if (
        (mode === "signup" || mode === "reset") &&
        form.password !== form.confirmPassword
      ) {
        throw new Error("Passwords do not match.");
      }

      const endpoint = mode === "signup" ? "/api/auth/signup" : mode === "signin" ? "/api/auth/signin" : mode === "forgot" ? "/api/auth/forgot" : "/api/auth/reset";
      const payload = mode === "reset" ? { token, password: form.password } : mode === "forgot" ? { email: form.email } : mode === "signup" ? { name: form.name, email: form.email, password: form.password } : { email: form.email, password: form.password };
      
      const res = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Auth failed.");
      
      if (mode === "forgot") {
        setStatusMessage(data.message);
        setResetPreviewPath(
          typeof data.resetPath === "string" ? data.resetPath : "",
        );
        setResetPreviewExpiry(
          typeof data.expiresAt === "string" ? data.expiresAt : "",
        );
      } else if (mode === "reset") {
        setMode("signin");
        setStatusMessage("Password reset successful. Please sign in.");
        setForm({
          name: "",
          email: "",
          password: "",
          confirmPassword: "",
        });
      } else {
        router.push(redirectPath);
        router.refresh();
      }
    } catch (e: unknown) {
      setErrorMessage(e instanceof Error ? e.message : "Auth failed.");
    } finally {
      setSubmitting(false);
    }
  }

  const currentCopy = modeCopy[mode];

  return (
    <div className="flex min-h-[80vh] items-center justify-center p-4">
      <div className="w-full max-w-[440px] space-y-8">
        {/* ── Logo & Header ── */}
        <div className="text-center space-y-3">
          <Link href="/" className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-cyan-400/20 to-blue-500/20 shadow-inner">
            <Image
              src="/logo.png"
              width={32}
              height={32}
              className="h-8 w-8 object-contain"
              alt="Lexora AI"
            />
          </Link>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-white">{currentCopy.title}</h1>
            <p className="mt-2 text-sm text-slate-500">{currentCopy.subtitle}</p>
          </div>
        </div>

        {/* ── Auth Card ── */}
        <div className="rounded-[2.5rem] border border-white/[0.08] bg-slate-950/40 p-8 shadow-2xl backdrop-blur-xl">
          <div className="space-y-5">
            {mode === "signup" && (
              <div className="space-y-2">
                <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500 ml-1">Full Name</label>
                <div className="relative">
                  <UserRound className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                  <input value={form.name} onChange={e => updateField("name", e.target.value)} placeholder="Agam Pathak" className="w-full rounded-2xl border border-white/10 bg-white/5 pl-11 pr-4 py-3.5 text-sm text-white outline-none focus:border-cyan-400/30" />
                </div>
              </div>
            )}

            {mode !== "reset" && (
              <div className="space-y-2">
                <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500 ml-1">Email Address</label>
                <div className="relative">
                  <Mail className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                  <input type="email" value={form.email} onChange={e => updateField("email", e.target.value)} placeholder="name@company.com" className="w-full rounded-2xl border border-white/10 bg-white/5 pl-11 pr-4 py-3.5 text-sm text-white outline-none focus:border-cyan-400/30" />
                </div>
              </div>
            )}

            {mode !== "forgot" && (
              <div className="space-y-2">
                <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500 ml-1">{mode === "reset" ? "New Password" : "Password"}</label>
                <div className="relative">
                  <KeyRound className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                  <input type={showPassword ? "text" : "password"} value={form.password} onChange={e => updateField("password", e.target.value)} placeholder="••••••••" className="w-full rounded-2xl border border-white/10 bg-white/5 pl-11 pr-12 py-3.5 text-sm text-white outline-none focus:border-cyan-400/30" />
                  <button onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 p-2 text-slate-500 hover:text-white transition-colors">
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
            )}

            {(mode === "signup" || mode === "reset") && (
              <div className="space-y-2">
                <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500 ml-1">Confirm Password</label>
                <div className="relative">
                  <LockKeyhole className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                  <input type={showPassword ? "text" : "password"} value={form.confirmPassword} onChange={e => updateField("confirmPassword", e.target.value)} placeholder="••••••••" className="w-full rounded-2xl border border-white/10 bg-white/5 pl-11 pr-4 py-3.5 text-sm text-white outline-none focus:border-cyan-400/30" />
                </div>
              </div>
            )}

            {mode === "signin" && (
              <div className="flex justify-end">
                <button onClick={() => setMode("forgot")} className="text-[11px] font-bold uppercase tracking-widest text-cyan-400 hover:text-cyan-300 transition-colors">Forgot Password?</button>
              </div>
            )}

            <button onClick={handleSubmit} disabled={submitting} className="flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-br from-cyan-500 to-blue-600 py-4 text-sm font-bold text-white shadow-lg transition hover:brightness-110 disabled:opacity-30 disabled:grayscale">
              {submitting ? <LoaderCircle className="animate-spin h-4 w-4" /> : <Sparkles className="h-4 w-4" />}
              {submitting ? "Processing..." : currentCopy.submitLabel}
            </button>

            {statusMessage && (
              <div className="rounded-xl bg-emerald-500/10 border border-emerald-500/20 p-4 text-xs font-medium text-emerald-400 text-center">
                <p>{statusMessage}</p>
                {resetPreviewPath ? (
                  <div className="mt-3 space-y-2">
                    <Link
                      href={resetPreviewPath}
                      className="inline-flex rounded-lg border border-emerald-400/20 bg-emerald-500/10 px-3 py-2 text-[11px] font-bold uppercase tracking-widest text-emerald-300 transition hover:bg-emerald-500/15"
                    >
                      Open recovery link
                    </Link>
                    {resetPreviewExpiry ? (
                      <p className="text-[10px] uppercase tracking-widest text-emerald-300/80">
                        Expires {new Date(resetPreviewExpiry).toLocaleString("en-IN")}
                      </p>
                    ) : null}
                  </div>
                ) : null}
              </div>
            )}
            {errorMessage && <div className="rounded-xl bg-rose-500/10 border border-rose-500/20 p-4 text-xs font-medium text-rose-400 text-center">{errorMessage}</div>}
          </div>
        </div>

        {/* ── Footer ── */}
        <div className="text-center">
            {mode === "signin" ? (
              <p className="text-xs text-slate-500">New to Lexora AI? <button onClick={() => setMode("signup")} className="font-bold text-white hover:text-cyan-400 transition-colors border-b border-white/10">Create an account</button></p>
            ) : mode === "signup" ? (
              <p className="text-xs text-slate-500">Already have an account? <button onClick={() => setMode("signin")} className="font-bold text-white hover:text-cyan-400 transition-colors border-b border-white/10">Sign in instead</button></p>
            ) : (
              <button onClick={() => setMode("signin")} className="text-xs font-bold text-slate-400 hover:text-white transition-colors">Back to Sign In</button>
            )}
        </div>
      </div>
    </div>
  );
}

const LoaderCircle = ({ className }: { className?: string }) => (
  <svg className={className} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
);

export default function AuthPage() {
  return (
    <Suspense fallback={<div className="flex h-screen items-center justify-center text-slate-500 text-xs font-bold uppercase tracking-widest">Initialising Secure Gateway...</div>}>
      <AuthPageContent />
    </Suspense>
  );
}
