import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

type Admin = SupabaseClient<Database>;

const EXT_BY_TYPE: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

/** HEIC/HEIF detection by MIME type, falling back to the extension when the
 *  browser omits the type (common for iPhone photos). */
function isHeic(file: File): boolean {
  const type = file.type.toLowerCase();
  return type === "image/heic" || type === "image/heif" || /\.(heic|heif)$/i.test(file.name);
}

export type PreparedImage = { buffer: Buffer; contentType: string; ext: string };

/**
 * Normalize a validated image for storage. HEIC/HEIF (what iPhones shoot) is
 * transcoded to JPEG so it renders in every browser and gets a predictable
 * content type. heic-convert is imported lazily so the common JPEG/PNG path stays
 * light. Shared by the admin QR-image and staff-photo uploads.
 */
export async function prepareImageForStorage(
  file: File,
): Promise<{ ok: true; image: PreparedImage } | { ok: false; error: string }> {
  const input = Buffer.from(await file.arrayBuffer());

  if (isHeic(file)) {
    try {
      const { default: convert } = await import("heic-convert");
      const output = await convert({ buffer: input, format: "JPEG", quality: 0.9 });
      return {
        ok: true,
        image: { buffer: Buffer.from(output), contentType: "image/jpeg", ext: "jpg" },
      };
    } catch {
      // Some valid HEICs use ftyp brands heic-convert can't decode. Rather than
      // reject, fall back to storing the original bytes.
      return { ok: true, image: { buffer: input, contentType: file.type || "image/heic", ext: "heic" } };
    }
  }

  const ext = EXT_BY_TYPE[file.type.toLowerCase()] ?? "img";
  return {
    ok: true,
    image: { buffer: input, contentType: file.type || "application/octet-stream", ext },
  };
}

/** Map a Supabase Storage upload error to a friendly, cause-specific message. */
export function describeStorageError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes("exceeded") || m.includes("maximum allowed size") || m.includes("too large")) {
    return "That image is too large for our storage. Please upload one under 10 MB.";
  }
  if (m.includes("bucket") && m.includes("not found")) {
    return "Image storage isn't set up correctly — please let the salon know.";
  }
  return "We couldn't save your image just now. Please try again.";
}

/** Best-effort removal of stale objects in `dir` whose filename isn't `keep`. */
export async function pruneSiblings(
  admin: Admin,
  bucket: string,
  dir: string,
  keep: string,
): Promise<void> {
  try {
    const { data } = await admin.storage.from(bucket).list(dir);
    const stale = (data ?? [])
      .filter((o) => o.name && o.name !== keep)
      .map((o) => `${dir}/${o.name}`);
    if (stale.length) await admin.storage.from(bucket).remove(stale);
  } catch {
    // Cleanup is non-critical; never fail the upload because of it.
  }
}
