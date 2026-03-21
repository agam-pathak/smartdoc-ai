import type { AuthSession } from "@/lib/types";

const SESSION_COOKIE_NAME = "lexora_session";
const DEVELOPMENT_AUTH_SECRET = "lexora-dev-secret-change-me";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

let authKeyPromise: Promise<CryptoKey> | null = null;

function getAuthSecret() {
  const configuredSecret = process.env.LEXORA_AUTH_SECRET?.trim();
  return configuredSecret || DEVELOPMENT_AUTH_SECRET;
}

function decodeBase64Url(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padding = normalized.length % 4 === 0 ? "" : "=".repeat(4 - (normalized.length % 4));
  const binary = atob(`${normalized}${padding}`);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
}

function encodeBase64Url(value: Uint8Array) {
  let binary = "";

  for (let index = 0; index < value.length; index += 1) {
    binary += String.fromCharCode(value[index]);
  }

  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function timingSafeEqual(left: string, right: string) {
  const leftBytes = encoder.encode(left);
  const rightBytes = encoder.encode(right);
  const length = Math.max(leftBytes.length, rightBytes.length);
  let result = leftBytes.length ^ rightBytes.length;

  for (let index = 0; index < length; index += 1) {
    result |= (leftBytes[index] ?? 0) ^ (rightBytes[index] ?? 0);
  }

  return result === 0;
}

async function getAuthKey() {
  if (!authKeyPromise) {
    authKeyPromise = crypto.subtle.importKey(
      "raw",
      encoder.encode(getAuthSecret()),
      {
        name: "HMAC",
        hash: "SHA-256",
      },
      false,
      ["sign"],
    );
  }

  return authKeyPromise;
}

async function signPayload(payload: string) {
  const key = await getAuthKey();
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(payload));
  return encodeBase64Url(new Uint8Array(signature));
}

function readCookieValue(request: Request, name: string) {
  const cookieHeader = request.headers.get("cookie");

  if (!cookieHeader) {
    return null;
  }

  const entries = cookieHeader.split(";");

  for (const entry of entries) {
    const [rawName, ...rawValue] = entry.trim().split("=");

    if (rawName !== name) {
      continue;
    }

    const value = rawValue.join("=");

    if (!value) {
      return null;
    }

    try {
      return decodeURIComponent(value);
    } catch {
      return value;
    }
  }

  return null;
}

async function parseSessionToken(token: string): Promise<AuthSession | null> {
  const [payload, signature] = token.split(".");

  if (!payload || !signature) {
    return null;
  }

  const expectedSignature = await signPayload(payload);

  if (!timingSafeEqual(signature, expectedSignature)) {
    return null;
  }

  try {
    const session = JSON.parse(decoder.decode(decodeBase64Url(payload))) as AuthSession;

    if (
      !session.userId ||
      !session.name ||
      !session.email ||
      !session.issuedAt ||
      !session.expiresAt
    ) {
      return null;
    }

    if (Date.parse(session.expiresAt) <= Date.now()) {
      return null;
    }

    return session;
  } catch {
    return null;
  }
}

export async function getEdgeSession(request: Request) {
  const token = readCookieValue(request, SESSION_COOKIE_NAME);

  if (!token) {
    return null;
  }

  return parseSessionToken(token);
}
