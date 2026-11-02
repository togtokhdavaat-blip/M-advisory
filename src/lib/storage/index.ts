import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { env, isProduction } from "../env";

export type Bucket = "order-documents" | "reports";

export interface StorageProvider {
  put(bucket: Bucket, path: string, data: Uint8Array, contentType: string): Promise<void>;
  get(bucket: Bucket, path: string): Promise<Uint8Array>;
  /** Short-lived URL for direct download, or null when the server must stream the file itself. */
  signedUrl(bucket: Bucket, path: string, ttlSeconds: number): Promise<string | null>;
  remove(bucket: Bucket, path: string): Promise<void>;
}

const SAFE_PATH = /^[a-z0-9][a-z0-9/_.-]*$/;
function checkPath(path: string) {
  if (!SAFE_PATH.test(path) || path.includes("..")) throw new Error("unsafe_storage_path");
}

/** DEVELOPMENT ONLY: files under LOCAL_STORAGE_DIR. Refused in production by env(). */
const localStorage: StorageProvider = {
  async put(bucket, path, data) {
    checkPath(path);
    const file = resolve(env().LOCAL_STORAGE_DIR, bucket, path);
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, data, { flag: "wx" });
  },
  async get(bucket, path) {
    checkPath(path);
    return new Uint8Array(await readFile(join(resolve(env().LOCAL_STORAGE_DIR), bucket, path)));
  },
  async signedUrl() {
    return null;
  },
  async remove(bucket, path) {
    checkPath(path);
    await rm(join(resolve(env().LOCAL_STORAGE_DIR), bucket, path), { force: true });
  },
};

let admin: SupabaseClient | null = null;
function supabaseAdmin(): SupabaseClient {
  admin ??= createClient(env().NEXT_PUBLIC_SUPABASE_URL!, env().SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return admin;
}

/** Supabase Storage with the service role key (server only). Buckets are private. */
const supabaseStorage: StorageProvider = {
  async put(bucket, path, data, contentType) {
    checkPath(path);
    const { error } = await supabaseAdmin().storage.from(bucket).upload(path, data, { contentType, upsert: false });
    if (error) throw new Error(`storage_upload_failed: ${error.message}`);
  },
  async get(bucket, path) {
    checkPath(path);
    const { data, error } = await supabaseAdmin().storage.from(bucket).download(path);
    if (error || !data) throw new Error(`storage_download_failed: ${error?.message}`);
    return new Uint8Array(await data.arrayBuffer());
  },
  async signedUrl(bucket, path, ttlSeconds) {
    checkPath(path);
    const { data, error } = await supabaseAdmin().storage.from(bucket).createSignedUrl(path, ttlSeconds, { download: true });
    if (error || !data) throw new Error(`storage_sign_failed: ${error?.message}`);
    return data.signedUrl;
  },
  async remove(bucket, path) {
    checkPath(path);
    await supabaseAdmin().storage.from(bucket).remove([path]);
  },
};

export function storage(): StorageProvider {
  if (env().STORAGE_PROVIDER === "supabase") return supabaseStorage;
  if (isProduction()) throw new Error("local storage is disabled in production");
  return localStorage;
}
