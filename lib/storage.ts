import { copyFile, mkdir, rm } from "node:fs/promises";
import path from "node:path";

export const LEXORA_ROOT = path.join(process.cwd(), ".lexora");
export const USER_WORKSPACES_ROOT = path.join(LEXORA_ROOT, "users");
export const LEGACY_INDEX_ROOT = path.join(LEXORA_ROOT, "indexes");
export const LEGACY_MANIFEST_PATH = path.join(LEXORA_ROOT, "manifest.json");
export const LEGACY_CONVERSATIONS_PATH = path.join(
  LEXORA_ROOT,
  "conversations.json",
);
export const LEGACY_PUBLIC_UPLOADS_ROOT = path.join(
  process.cwd(),
  "public",
  "uploads",
);

export function resolveUserWorkspaceRoot(userId: string) {
  return path.join(USER_WORKSPACES_ROOT, userId);
}

export function resolveUserIndexesRoot(userId: string) {
  return path.join(resolveUserWorkspaceRoot(userId), "indexes");
}

export function resolveUserManifestPath(userId: string) {
  return path.join(resolveUserWorkspaceRoot(userId), "manifest.json");
}

export function resolveUserConversationsPath(userId: string) {
  return path.join(resolveUserWorkspaceRoot(userId), "conversations.json");
}

export function resolveUserUploadsRoot(userId: string) {
  return path.join(resolveUserWorkspaceRoot(userId), "uploads");
}

export function resolveUserUploadFilePath(userId: string, fileName: string) {
  return path.join(resolveUserUploadsRoot(userId), fileName);
}

export function resolveLegacyPublicUploadsRoot(userId: string) {
  return path.join(LEGACY_PUBLIC_UPLOADS_ROOT, userId);
}

export function resolveLegacyPublicUploadFilePath(
  userId: string,
  fileName: string,
) {
  return path.join(resolveLegacyPublicUploadsRoot(userId), fileName);
}

export function resolveUserUploadUrl(userId: string, fileName: string) {
  return `/uploads/${userId}/${fileName}`;
}

export function isUserUploadUrl(userId: string, fileUrl: string) {
  return fileUrl.startsWith(`/uploads/${userId}/`);
}

export async function ensureLexoraRoot() {
  await mkdir(LEXORA_ROOT, { recursive: true });
}

export async function ensureUserWorkspaceDirectories(userId: string) {
  await mkdir(resolveUserIndexesRoot(userId), { recursive: true });
  await mkdir(resolveUserUploadsRoot(userId), { recursive: true });
}

export async function ensurePrivateUploadAvailable(
  userId: string,
  fileName: string,
) {
  const privatePath = resolveUserUploadFilePath(userId, fileName);
  const legacyPath = resolveLegacyPublicUploadFilePath(userId, fileName);

  try {
    await mkdir(path.dirname(privatePath), { recursive: true });
    await copyFile(legacyPath, privatePath);
    await rm(legacyPath, { force: true });
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "ENOENT"
    ) {
      return privatePath;
    }

    throw error;
  }

  return privatePath;
}
