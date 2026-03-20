import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const SUPABASE_URL =
  process.env.LEXORA_SUPABASE_URL?.trim() ||
  process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ||
  "";
const SUPABASE_SERVICE_ROLE_KEY =
  process.env.LEXORA_SUPABASE_SERVICE_ROLE_KEY?.trim() ||
  process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
  "";

type GlobalWithSupabase = typeof globalThis & {
  __lexoraSupabaseAdmin?: SupabaseClient;
};

export const SUPABASE_TABLES = {
  users: "lexora_users",
  documents: "lexora_documents",
  conversations: "lexora_conversations",
  messages: "lexora_messages",
} as const;

export function isSupabaseConfigured() {
  return Boolean(SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY);
}

export function getSupabaseAdminClient() {
  if (!isSupabaseConfigured()) {
    return null;
  }

  const globalScope = globalThis as GlobalWithSupabase;

  if (!globalScope.__lexoraSupabaseAdmin) {
    globalScope.__lexoraSupabaseAdmin = createClient(
      SUPABASE_URL,
      SUPABASE_SERVICE_ROLE_KEY,
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        },
      },
    );
  }

  return globalScope.__lexoraSupabaseAdmin;
}

