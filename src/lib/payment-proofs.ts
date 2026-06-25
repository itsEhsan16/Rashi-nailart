import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { MAX_PROOF_BYTES, isAcceptedProofFile } from "@/lib/salon-data";

type Admin = SupabaseClient<Database>;

export const PROOF_BUCKET = "payment-proofs";

const EXT_BY_TYPE: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

/** Human-readable size (e.g. "12.4 MB") for size-related error messages. */
function formatMb(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** HEIC/HEIF detection by MIME type, falling back to the extension when the
 *  browser omits the type (common for iPhone photos). */
function isHeic(file: File): boolean {
  const type = file.type.toLowerCase();
  return type === "image/heic" || type === "image/heif" || /\.(heic|heif)$/i.test(file.name);
}

export type ProofValidation =
  | { ok: true; file: File }
  | { ok: false; error: string };

/** Server-side validation of an uploaded screenshot (presence + size + type).
 *  Each failure returns a distinct, actionable message. */
export function validateProofFile(value: FormDataEntryValue | null): ProofValidation {
  if (!value || typeof value === "string") {
    return { ok: false, error: "Please attach your payment screenshot before submitting." };
  }
  const file = value;
  if (file.size === 0) {
    return { ok: false, error: "That file looks empty. Please pick your screenshot again." };
  }
  if (file.size > MAX_PROOF_BYTES) {
    return { ok: false, error: `That image is ${formatMb(file.size)}. Please upload one under 10 MB.` };
  }
  if (!isAcceptedProofFile(file)) {
    const kind = file.type ? `"${file.type}"` : "That kind of";
    return {
      ok: false,
      error: `${kind} files aren't supported. Please upload a JPG, PNG, WebP or HEIC image.`,
    };
  }
  return { ok: true, file };
}

export type PreparedImage = { buffer: Buffer; contentType: string; ext: string };

/**
 * Normalize a validated image for storage. HEIC/HEIF (what iPhones shoot) is
 * transcoded to JPEG so the proof stays viewable in the admin's browser —
 * Chrome and Firefox can't render HEIC — and gets a predictable content type.
 * heic-convert is imported lazily so the common JPEG/PNG path stays light.
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
      // reject a real payment proof, fall back to storing the original bytes —
      // the admin can still download it (it just won't preview inline).
      return { ok: true, image: { buffer: input, contentType: file.type || "image/heic", ext: "heic" } };
    }
  }

  const ext = EXT_BY_TYPE[file.type.toLowerCase()] ?? "img";
  return {
    ok: true,
    image: { buffer: input, contentType: file.type || "application/octet-stream", ext },
  };
}

/** Map a Supabase Storage upload error to a customer-friendly, cause-specific message. */
export function describeStorageError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes("exceeded") || m.includes("maximum allowed size") || m.includes("too large")) {
    return "That image is too large for our storage. Please upload one under 10 MB.";
  }
  if (m.includes("bucket") && m.includes("not found")) {
    return "Image storage isn't set up correctly — please let the salon know.";
  }
  return "We couldn't save your screenshot just now. Please try again.";
}

/**
 * Upload a validated proof image to the private bucket under `prefix/<id>/…`.
 * HEIC is transcoded to JPEG first. Returns the storage object path (not a
 * public URL — the bucket is private).
 */
export async function uploadProof(
  admin: Admin,
  prefix: "bookings" | "memberships",
  id: string,
  file: File,
): Promise<{ ok: true; path: string } | { ok: false; error: string }> {
  const prepared = await prepareImageForStorage(file);
  if (!prepared.ok) return { ok: false, error: prepared.error };

  const { buffer, contentType, ext } = prepared.image;
  const path = `${prefix}/${id}/proof.${ext}`;
  const { error } = await admin.storage.from(PROOF_BUCKET).upload(path, buffer, {
    contentType,
    upsert: true,
  });
  if (error) return { ok: false, error: describeStorageError(error.message) };

  // A re-upload from a different source type writes a new key (e.g. proof.png
  // then a HEIC -> proof.jpg); drop the superseded object so it doesn't linger.
  await pruneSiblings(admin, PROOF_BUCKET, `${prefix}/${id}`, `proof.${ext}`);

  return { ok: true, path };
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

/** Short-lived signed URL so admins/managers can view a private proof image. */
export async function signedProofUrl(
  admin: Admin,
  path: string,
  expiresInSeconds = 300,
): Promise<string | null> {
  const { data } = await admin.storage.from(PROOF_BUCKET).createSignedUrl(path, expiresInSeconds);
  return data?.signedUrl ?? null;
}
