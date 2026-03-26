"use client";

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import { Loader2, Settings, User, X } from "lucide-react";

import { updateProfile } from "@/app/profile/actions";

const AVATARS = [
  "/avatars/avatar1.png",
  "/avatars/avatar2.png",
  "/avatars/avatar3.png",
  "/avatars/avatar4.png",
] as const;

export default function EditProfileModal({ 
  currentName,
  currentAvatar 
}: { 
  currentName: string;
  currentAvatar: string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [name, setName] = useState(currentName);
  const [avatar, setAvatar] = useState(currentAvatar);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      const result = await updateProfile(name, avatar);
      if (result.success) {
        setIsOpen(false);
        // Fully refresh the app shell to reload the session & avatar
        window.location.reload();
      } else {
        alert(result.error);
      }
    } catch (err) {
      alert("A technical error occurred. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <>
      <button 
        onClick={() => setIsOpen(true)}
        className="flex items-center gap-2 rounded-xl bg-white/5 border border-white/10 px-5 py-2.5 text-xs font-bold text-white transition hover:bg-white/10"
      >
        <Settings className="h-4 w-4" />
        Edit Profile
      </button>

      {isOpen && mounted && createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in">
          <div className="relative w-full max-w-sm rounded-3xl border border-white/[0.08] bg-slate-900 shadow-[0_0_80px_rgba(34,211,238,0.15)] p-6">
            <button 
              onClick={() => setIsOpen(false)}
              className="absolute right-4 top-4 text-slate-400 hover:text-white transition"
            >
              <X className="h-5 w-5" />
            </button>
            
            <div className="flex items-center gap-3 mb-6">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-cyan-500/10 text-cyan-300">
                <User className="h-5 w-5" />
              </div>
              <h3 className="text-xl font-bold text-white">Edit Profile</h3>
            </div>
            
            <form onSubmit={(e) => void handleSubmit(e)}>
              <div className="space-y-6">
                <div>
                  <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-3 block">Choose Identity Avatar</label>
                  <div className="grid grid-cols-4 gap-3">
                    {AVATARS.map((srv) => (
                      <button
                        key={srv}
                        type="button"
                        onClick={() => setAvatar(srv)}
                        className={`relative h-12 w-12 overflow-hidden rounded-xl border-2 transition-all ${
                          avatar === srv 
                            ? "border-cyan-400 ring-2 ring-cyan-400/20 scale-110 shadow-lg shadow-cyan-400/10" 
                            : "border-transparent opacity-50 hover:opacity-100 hover:border-white/20"
                        }`}
                      >
                        <Image src={srv} alt="Selection" fill className="object-cover" sizes="48px" />
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-2 block">Full Name</label>
                  <input 
                    type="text" 
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                    maxLength={80}
                    className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder:text-slate-600 focus:border-cyan-400/50 focus:outline-none focus:ring-1 focus:ring-cyan-400/20"
                    placeholder="Enter your name"
                  />
                </div>
              </div>

              <div className="mt-8 flex justify-end gap-3">
                <button 
                  type="button" 
                  onClick={() => setIsOpen(false)}
                  className="rounded-xl px-4 py-2.5 text-xs font-bold text-slate-400 hover:text-white transition"
                >
                  Cancel
                </button>
                <button 
                  type="submit" 
                  disabled={isSubmitting || !name.trim() || (name === currentName && avatar === currentAvatar)}
                  className="flex items-center gap-2 rounded-xl bg-cyan-500 px-5 py-2.5 text-xs font-bold text-slate-950 transition hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Update Identity"}
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
