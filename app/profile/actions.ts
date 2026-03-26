"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";

import {
  requireSession,
  updateUserProfile,
  createSessionCookie,
} from "@/lib/auth";

export async function updateProfile(name: string, avatarUrl: string) {
  try {
    const session = await requireSession();
    
    if (!name.trim()) {
      return { success: false, error: "Name is required." };
    }

    // Update backend (Supabase)
    const updatedUser = await updateUserProfile(session.userId, { name });
    if (!updatedUser) {
      return { success: false, error: "User update failed. Check Supabase columns." };
    }

    const secure = process.env.NODE_ENV === "production";
    const cookieStore = await cookies();

    // Bulletproof session update
    const { cookie } = createSessionCookie(updatedUser, secure);
    
    cookieStore.set(cookie.name, cookie.value, {
      path: "/",
      secure,
      httpOnly: true,
      sameSite: "lax",
      expires: cookie.expires
    });

    // Set avatar cookie
    cookieStore.set("lexora_avatar", avatarUrl, {
      path: "/",
      secure,
      httpOnly: false,
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 365
    });

    // We do NOT call revalidatePath(root) here as it can crash some Vercel builds
    // Return success and let the client handle the refresh
    return { success: true };
  } catch (err: any) {
    console.error("Profile Action Error:", err);
    return { 
      success: false, 
      error: err instanceof Error ? err.message : "Internal Server Error" 
    };
  }
}
