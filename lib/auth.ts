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
    throw new Error(
      "LEXORA_AUTH_SECRET must be configured in production.",
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

async function readUsersStore() {
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

async function writeUsersStore(users: StoredUser[]) {
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

async function updateUser(userId: string, updater: (user: StoredUser) => StoredUser) {
  const store = await readUsersStore();
  const userIndex = store.users.findIndex((user) => user.id === userId);

  if (userIndex < 0) {
    return null;
  }

  const nextUsers = [...store.users];
  nextUsers[userIndex] = updater(nextUsers[userIndex]);
  await writeUsersStore(nextUsers);
  return nextUsers[userIndex];
}

export async function getUsersCount() {
  const store = await readUsersStore();
  return store.users.length;
}

export async function findUserByEmail(email: string) {
  const normalizedEmail = normalizeEmail(email);
  const store = await readUsersStore();
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

  const store = await readUsersStore();
  await writeUsersStore([user, ...store.users]);
  return user;
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
  const store = await readUsersStore();
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

  await writeUsersStore(nextUsers);
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
