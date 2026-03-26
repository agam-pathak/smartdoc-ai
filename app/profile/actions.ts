"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";

import {
  requireSession,
  updateUserProfile,
  createSessionCookie,
} from "@/lib/auth";

export async function updateProfile(name: string, avatarUrl: string) {
  const session = await requireSession();
  
  if (!name.trim()) {
    throw new Error("Name is required.");
  }

  // Update backend (Supabase)
  const updatedUser = await updateUserProfile(session.userId, { name });
  if (!updatedUser) {
    throw new Error("User update failed.");
  }

  const secure = process.env.NODE_ENV === "production";
  const cookieStore = await cookies();

  // Bulletproof cookie updates
  const { cookie } = createSessionCookie(updatedUser, secure);
  
  // Set session cookie
  cookieStore.set({
    name: cookie.name,
    value: cookie.value,
    path: cookie.path,
    secure: cookie.secure,
    httpOnly: cookie.httpOnly,
    sameSite: cookie.sameSite,
    expires: cookie.expires
  });

  // Set avatar cookie
  cookieStore.set({
    name: "lexora_avatar",
    value: avatarUrl,
    path: "/",
    secure,
    httpOnly: false,
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 365
  });

  // Trigger UI updates
  revalidatePath("/profile");
  revalidatePath("/");

  return { success: true };
}
