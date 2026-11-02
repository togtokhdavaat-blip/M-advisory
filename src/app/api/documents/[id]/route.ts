import { NextResponse, type NextRequest } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { authorizeDownload } from "@/lib/documents/service";
import { serveFile } from "@/lib/storage/serve";

export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const file = await authorizeDownload(user, (await params).id);
  if (!file) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return serveFile(file);
}
