import {
  createHmac,
  randomBytes,
  randomUUID,
  scryptSync,
  timingSafeEqual,
} from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { withFileLock } from "@/lib/file-lock";
import { getSupabaseAdminClient, isSupabaseConfigured, SUPABASE_TABLES } from "@/lib/supabase";
import type { AuthSession } from "@/lib/types";
import { ensureLexoraRoot, LEXORA_ROOT } from "@/lib/storage";

type StoredUser = {
  id: string;
  name: string;
  email: string;
  passwordHash: string;
  passwordSalt: string;
  createdAt: string;
  updatedAt: string;
  lastLoginAt?: string;
  resetTokenHash?: string;
  resetTokenExpiresAt?: string;
};

type StoredUserRow = {
  id: string;
  name: string;
  email: string;
  password_hash: string;
  password_salt: string;
  created_at: string;
  updated_at: string;
  last_login_at: string | null;
  reset_token_hash: string | null;
  reset_token_expires_at: string | null;
};

type UsersStore = {
  users: StoredUser[];
  updatedAt: string;
};

type CreateUserInput = {
  name: string;
  email: string;
  password: string;
};

const USERS_PATH = path.join(LEXORA_ROOT, "users.json");
export const SESSION_COOKIE_NAME = "lexora_session";
const SESSION_DURATION_MS = 1000 * 60 * 60 * 24 * 7;
const RESET_TOKEN_DURATION_MS = 1000 * 60 * 30;
const DEVELOPMENT_AUTH_SECRET = "lexora-dev-secret-change-me";

function getAuthSecret() {
  const configuredSecret = process.env.LEXORA_AUTH_SECRET?.trim();

  if (configuredSecret) {
    return configuredSecret;
  }

  if (process.env.NODE_ENV === "production") {
    console.warn(
      "LEXORA_AUTH_SECRET is missing. Using development fallback. Configure this in Vercel for production security.",
    );
  }

  return DEVELOPMENT_AUTH_SECRET;
}

function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

function normalizeName(value: string) {
  return value.replace(/\s+/g, " ").trim().slice(0, 80) || "Lexora member";
}

function toBase64Url(value: Buffer | string) {
  return Buffer.from(value)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function fromBase64Url(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padding = normalized.length % 4 === 0 ? "" : "=".repeat(4 - (normalized.length % 4));
  return Buffer.from(`${normalized}${padding}`, "base64");
}

function hashPassword(password: string, salt: string) {
  return scryptSync(password, salt, 64).toString("hex");
}

function hashResetToken(token: string) {
  return createHmac("sha256", getAuthSecret()).update(token).digest("hex");
}

function signPayload(payload: string) {
  return toBase64Url(
    createHmac("sha256", getAuthSecret()).update(payload).digest(),
  );
}

function createSessionToken(session: AuthSession) {
  const payload = toBase64Url(JSON.stringify(session));
  const signature = signPayload(payload);
  return `${payload}.${signature}`;
}

function parseSessionToken(token: string) {
  const [payload, signature] = token.split(".");

  if (!payload || !signature) {
    return null;
  }

  const expectedSignature = signPayload(payload);

  try {
    if (
      !timingSafeEqual(
        Buffer.from(signature),
        Buffer.from(expectedSignature),
      )
    ) {
      return null;
    }
  } catch {
    return null;
  }

  try {
    const parsed = JSON.parse(fromBase64Url(payload).toString("utf8")) as AuthSession;

    if (!parsed.userId || !parsed.email || !parsed.name || !parsed.expiresAt) {
      return null;
    }

    if (Date.parse(parsed.expiresAt) <= Date.now()) {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

function createSessionFromUser(user: StoredUser): AuthSession {
  const issuedAt = new Date().toISOString();
  const expiresAt = new Date(Date.now() + SESSION_DURATION_MS).toISOString();

  return {
    userId: user.id,
    name: user.name,
    email: user.email,
    issuedAt,
    expiresAt,
  };
}

function fromStoredUserRow(row: StoredUserRow): StoredUser {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    passwordHash: row.password_hash,
    passwordSalt: row.password_salt,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastLoginAt: row.last_login_at ?? undefined,
    resetTokenHash: row.reset_token_hash ?? undefined,
    resetTokenExpiresAt: row.reset_token_expires_at ?? undefined,
  };
}

function toStoredUserRow(user: StoredUser): StoredUserRow {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    password_hash: user.passwordHash,
    password_salt: user.passwordSalt,
    created_at: user.createdAt,
    updated_at: user.updatedAt,
    last_login_at: user.lastLoginAt ?? null,
    reset_token_hash: user.resetTokenHash ?? null,
    reset_token_expires_at: user.resetTokenExpiresAt ?? null,
  };
}

async function readUsersStoreFromFile() {
  try {
    const contents = await readFile(USERS_PATH, "utf8");
    const store = JSON.parse(contents) as UsersStore;
    return {
      users: store.users ?? [],
      updatedAt: store.updatedAt ?? "",
    };
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "ENOENT"
    ) {
      return {
        users: [],
        updatedAt: "",
      };
    }

    throw error;
  }
}

async function writeUsersStoreToFile(users: StoredUser[]) {
  await withFileLock(USERS_PATH, async () => {
    await ensureLexoraRoot();
    await mkdir(path.dirname(USERS_PATH), { recursive: true });

    const store: UsersStore = {
      users,
      updatedAt: new Date().toISOString(),
    };

    await writeFile(USERS_PATH, JSON.stringify(store, null, 2), "utf8");
  });
}

async function findSupabaseUserById(userId: string) {
  const supabase = getSupabaseAdminClient();

  if (!supabase) {
    return null;
  }

  const { data, error } = await supabase
    .from(SUPABASE_TABLES.users)
    .select("*")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data ? fromStoredUserRow(data as StoredUserRow) : null;
}

async function findSupabaseUserByEmail(email: string) {
  const supabase = getSupabaseAdminClient();

  if (!supabase) {
    return null;
  }

  const { data, error } = await supabase
    .from(SUPABASE_TABLES.users)
    .select("*")
    .eq("email", normalizeEmail(email))
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data ? fromStoredUserRow(data as StoredUserRow) : null;
}

async function backfillUserToSupabase(user: StoredUser) {
  const supabase = getSupabaseAdminClient();

  if (!supabase) {
    return user;
  }

  const { data, error } = await supabase
    .from(SUPABASE_TABLES.users)
    .upsert(toStoredUserRow(user), { onConflict: "id" })
    .select("*")
    .single();

  if (error) {
    console.warn("Supabase backfill failed:", error);
    return user; // Return the user anyway to prevent crashing the whole flow if only sync fails
  }

  return fromStoredUserRow(data as StoredUserRow);
}

async function updateUser(userId: string, updater: (user: StoredUser) => StoredUser) {
  if (isSupabaseConfigured()) {
    const existingUser =
      (await findSupabaseUserById(userId)) ??
      (await (async () => {
        const store = await readUsersStoreFromFile();
        const fileUser = store.users.find((user) => user.id === userId) ?? null;

        if (!fileUser) {
          return null;
        }

        return backfillUserToSupabase(fileUser);
      })());

    if (!existingUser) {
      return null;
    }

    const nextUser = updater(existingUser);
    const supabase = getSupabaseAdminClient();

    if (!supabase) {
      return null;
    }

    const { data, error } = await supabase
      .from(SUPABASE_TABLES.users)
      .update(toStoredUserRow(nextUser))
      .eq("id", userId)
      .select("*")
      .single();

    if (error) {
      throw error;
    }

    return fromStoredUserRow(data as StoredUserRow);
  }

  const store = await readUsersStoreFromFile();
  const userIndex = store.users.findIndex((user) => user.id === userId);

  if (userIndex < 0) {
    return null;
  }

  const nextUsers = [...store.users];
  nextUsers[userIndex] = updater(nextUsers[userIndex]);
  await writeUsersStoreToFile(nextUsers);
  return nextUsers[userIndex];
}

export async function getUsersCount() {
  if (isSupabaseConfigured()) {
    const supabase = getSupabaseAdminClient();

    if (!supabase) {
      return 0;
    }

    const { count, error } = await supabase
      .from(SUPABASE_TABLES.users)
      .select("*", { count: "exact", head: true });

    if (error) {
      throw error;
    }

    return count ?? 0;
  }

  const store = await readUsersStoreFromFile();
  return store.users.length;
}

export async function findUserByEmail(email: string) {
  const normalizedEmail = normalizeEmail(email);

  if (isSupabaseConfigured()) {
    const supabaseUser = await findSupabaseUserByEmail(normalizedEmail);

    if (supabaseUser) {
      return supabaseUser;
    }

    const store = await readUsersStoreFromFile();
    const fileUser =
      store.users.find((user) => user.email === normalizedEmail) ?? null;

    return fileUser ? backfillUserToSupabase(fileUser) : null;
  }

  const store = await readUsersStoreFromFile();
  return store.users.find((user) => user.email === normalizedEmail) ?? null;
}

export async function createUser({ name, email, password }: CreateUserInput) {
  const normalizedEmail = normalizeEmail(email);
  const existingUser = await findUserByEmail(normalizedEmail);

  if (existingUser) {
    throw new Error("An account with this email already exists.");
  }

  const salt = randomBytes(16).toString("hex");
  const now = new Date().toISOString();
  const user: StoredUser = {
    id: randomUUID(),
    name: normalizeName(name),
    email: normalizedEmail,
    passwordHash: hashPassword(password, salt),
    passwordSalt: salt,
    createdAt: now,
    updatedAt: now,
  };

  if (isSupabaseConfigured()) {
    await backfillUserToSupabase(user);
    return user;
  }

  const store = await readUsersStoreFromFile();
  await writeUsersStoreToFile([user, ...store.users]);
  return user;
}

export async function updateUserProfile(userId: string, updates: { name: string }) {
  const normalizedName = normalizeName(updates.name);

  if (isSupabaseConfigured()) {
    const supabase = getSupabaseAdminClient();
    if (supabase) {
      const { data, error } = await supabase
        .from(SUPABASE_TABLES.users)
        .update({
          name: normalizedName,
          updated_at: new Date().toISOString(),
        })
        .eq("id", userId)
        .select("*")
        .maybeSingle(); // Use maybeSingle to avoid throw on missing

      if (error) {
        console.error("Supabase profile update error:", error);
        throw new Error("Database update failed.");
      }

      if (!data) {
        throw new Error("User record not found.");
      }

      // Silent fallback sync (ignore errors)
      if (process.env.NODE_ENV !== "production") {
        try {
          const store = await readUsersStoreFromFile();
          const userIdx = store.users.findIndex(u => u.id === userId);
          if (userIdx >= 0) {
            const nextUsers = [...store.users];
            nextUsers[userIdx] = { ...nextUsers[userIdx], name: normalizedName, updatedAt: new Date().toISOString() };
            await writeUsersStoreToFile(nextUsers);
          }
        } catch (e) {}
      }

      return fromStoredUserRow(data as StoredUserRow);
    }
  }

  // Fallback for pure JSON
  const store = await readUsersStoreFromFile();
  const userIdx = store.users.findIndex(u => u.id === userId);
  if (userIdx >= 0) {
    const nextUsers = [...store.users];
    nextUsers[userIdx] = { ...nextUsers[userIdx], name: normalizedName, updatedAt: new Date().toISOString() };
    await writeUsersStoreToFile(nextUsers);
    return nextUsers[userIdx];
  }

  return null;
}

export async function authenticateUser(email: string, password: string) {
  const user = await findUserByEmail(email);

  if (!user) {
    return null;
  }

  const expectedHash = hashPassword(password, user.passwordSalt);

  try {
    if (
      !timingSafeEqual(
        Buffer.from(expectedHash),
        Buffer.from(user.passwordHash),
      )
    ) {
      return null;
    }
  } catch {
    return null;
  }

  const updatedUser = await updateUser(user.id, (currentUser) => ({
    ...currentUser,
    lastLoginAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }));

  return updatedUser ?? user;
}

export async function createPasswordReset(email: string) {
  const user = await findUserByEmail(email);

  if (!user) {
    return null;
  }

  const rawToken = toBase64Url(randomBytes(32));
  const now = new Date();
  const updatedUser = await updateUser(user.id, (currentUser) => ({
    ...currentUser,
    resetTokenHash: hashResetToken(rawToken),
    resetTokenExpiresAt: new Date(
      now.getTime() + RESET_TOKEN_DURATION_MS,
    ).toISOString(),
    updatedAt: now.toISOString(),
  }));

  return updatedUser
    ? {
        token: rawToken,
        expiresAt: updatedUser.resetTokenExpiresAt ?? "",
      }
    : null;
}

export async function resetPasswordWithToken(token: string, password: string) {
  const tokenHash = hashResetToken(token);

  if (isSupabaseConfigured()) {
    const supabase = getSupabaseAdminClient();

    if (!supabase) {
      return null;
    }

    const nowIso = new Date().toISOString();
    const { data, error } = await supabase
      .from(SUPABASE_TABLES.users)
      .select("*")
      .eq("reset_token_hash", tokenHash)
      .gt("reset_token_expires_at", nowIso)
      .maybeSingle();

    if (error) {
      throw error;
    }

    if (!data) {
      const store = await readUsersStoreFromFile();
      const now = Date.now();
      const fileUser = store.users.find(
        (user) =>
          user.resetTokenHash === tokenHash &&
          user.resetTokenExpiresAt &&
          Date.parse(user.resetTokenExpiresAt) > now,
      );

      if (!fileUser) {
        return null;
      }

      await backfillUserToSupabase(fileUser);
      return resetPasswordWithToken(token, password);
    }

    const existingUser = fromStoredUserRow(data as StoredUserRow);
    const salt = randomBytes(16).toString("hex");
    const nextUser: StoredUser = {
      ...existingUser,
      passwordSalt: salt,
      passwordHash: hashPassword(password, salt),
      resetTokenHash: undefined,
      resetTokenExpiresAt: undefined,
      updatedAt: nowIso,
    };

    const { data: updatedUser, error: updateError } = await supabase
      .from(SUPABASE_TABLES.users)
      .update(toStoredUserRow(nextUser))
      .eq("id", existingUser.id)
      .select("*")
      .single();

    if (updateError) {
      throw updateError;
    }

    return fromStoredUserRow(updatedUser as StoredUserRow);
  }

  const store = await readUsersStoreFromFile();
  const now = Date.now();
  const userIndex = store.users.findIndex(
    (user) =>
      user.resetTokenHash === tokenHash &&
      user.resetTokenExpiresAt &&
      Date.parse(user.resetTokenExpiresAt) > now,
  );

  if (userIndex < 0) {
    return null;
  }

  const salt = randomBytes(16).toString("hex");
  const nextUsers = [...store.users];
  nextUsers[userIndex] = {
    ...nextUsers[userIndex],
    passwordSalt: salt,
    passwordHash: hashPassword(password, salt),
    resetTokenHash: undefined,
    resetTokenExpiresAt: undefined,
    updatedAt: new Date().toISOString(),
  };

  await writeUsersStoreToFile(nextUsers);
  return nextUsers[userIndex];
}

export function buildSessionCookieValue(session: AuthSession) {
  return createSessionToken(session);
}

export function shouldUseSecureCookies(request: Request) {
  const { hostname } = new URL(request.url);

  return (
    process.env.NODE_ENV === "production" &&
    hostname !== "localhost" &&
    hostname !== "127.0.0.1"
  );
}

export function isLocalAuthHost(request: Request) {
  const { hostname } = new URL(request.url);
  return hostname === "localhost" || hostname === "127.0.0.1";
}

export function sessionCookieConfig(value: string, secure: boolean) {
  return {
    name: SESSION_COOKIE_NAME,
    value,
    httpOnly: true,
    sameSite: "lax" as const,
    secure,
    path: "/",
    expires: new Date(Date.parse(JSON.parse(fromBase64Url(value.split(".")[0]).toString("utf8")).expiresAt)),
  };
}

export function createSessionCookie(user: StoredUser, secure: boolean) {
  const session = createSessionFromUser(user);
  return {
    session,
    cookie: sessionCookieConfig(createSessionToken(session), secure),
  };
}

export async function getSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  if (!token) {
    return null;
  }

  return parseSessionToken(token);
}

export async function requireSession(): Promise<AuthSession> {
  const session = await getSession();

  if (!session) {
    redirect("/auth");
  }

  return session;
}

export function clearSessionCookie(secure: boolean) {
  return {
    name: SESSION_COOKIE_NAME,
    value: "",
    httpOnly: true,
    sameSite: "lax" as const,
    secure,
    path: "/",
    expires: new Date(0),
  };
}
