import "server-only";
import { NextResponse } from "next/server";
import { storage, type Bucket } from "./index";

/** Redirect to a 60-second signed URL, or stream the bytes when the provider has none (local dev). */
export async function serveFile(f: { bucket: Bucket; path: string; name: string; mime: string }) {
  const url = await storage().signedUrl(f.bucket, f.path, 60);
  if (url) return NextResponse.redirect(url, { headers: { "Cache-Control": "no-store" } });
  const bytes = await storage().get(f.bucket, f.path);
  return new NextResponse(Buffer.from(bytes), {
    headers: {
      "Content-Type": f.mime,
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(f.name)}`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
