import "server-only";

/**
 * Malware scanning integration point. Returns 'skipped' until a scanner is
 * configured (e.g. a ClamAV REST service or a cloud AV API via MALWARE_SCAN_URL).
 * Files with status 'infected' or 'pending' are never served.
 */
export async function scanFile(bytes: Uint8Array, mime: string): Promise<"clean" | "infected" | "skipped" | "error"> {
  const url = process.env.MALWARE_SCAN_URL;
  if (!url) return "skipped";
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": mime, ...(process.env.MALWARE_SCAN_TOKEN ? { Authorization: `Bearer ${process.env.MALWARE_SCAN_TOKEN}` } : {}) },
      body: Buffer.from(bytes),
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) return "error";
    const body = (await res.json()) as { infected?: boolean };
    return body.infected ? "infected" : "clean";
  } catch {
    return "error";
  }
}
