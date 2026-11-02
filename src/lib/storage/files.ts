import { createHash } from "node:crypto";

export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;

export const ALLOWED_TYPES = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
} as const;
export type AllowedMime = keyof typeof ALLOWED_TYPES;

/**
 * Detect the real file type from its first bytes. The browser-supplied type
 * and file name are never trusted.
 */
export function sniffMime(b: Uint8Array): AllowedMime | null {
  const at = (i: number, ...bytes: number[]) => bytes.every((x, k) => b[i + k] === x);
  if (at(0, 0x25, 0x50, 0x44, 0x46, 0x2d)) return "application/pdf"; // %PDF-
  if (at(0, 0xff, 0xd8, 0xff)) return "image/jpeg";
  if (at(0, 0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return "image/png";
  if (at(0, 0x52, 0x49, 0x46, 0x46) && at(8, 0x57, 0x45, 0x42, 0x50)) return "image/webp";
  if (at(4, 0x66, 0x74, 0x79, 0x70)) {
    const brand = String.fromCharCode(...b.slice(8, 12));
    if (["heic", "heix", "mif1", "msf1", "hevc"].includes(brand)) return "image/heic";
  }
  return null;
}

export function sha256Hex(b: Uint8Array): string {
  return createHash("sha256").update(b).digest("hex");
}

/** Display name only; the stored object name is a random UUID. */
export function cleanFileName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "file";
  return base.replace(/[\u0000-\u001f<>:"|?*]/g, "_").slice(0, 200) || "file";
}
