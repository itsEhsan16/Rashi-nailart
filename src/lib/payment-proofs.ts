import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { ALLOWED_PROOF_TYPES, MAX_PROOF_BYTES } from "@/lib/salon-data";

type Admin = SupabaseClient<Database>;

export const PROOF_BUCKET = "payment-proofs";

const EXT_BY_TYPE: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
};

export type ProofValidation =
  | { ok: true; file: File }
  | { ok: false; error: string };

/** Server-side validation of an uploaded screenshot (type + size + presence). */
export function validateProofFile(value: FormDataEntryValue | null): ProofValidation {
  if (!value || typeof value === "string") {
    return { ok: false, error: "Please attach your payment screenshot." };
  }
  const file = value;
  if (file.size === 0) return { ok: false, error: "The uploaded file is empty." };
  if (file.size > MAX_PROOF_BYTES) {
    return { ok: false, error: "Image is too large (max 10 MB)." };
  }
  if (!(ALLOWED_PROOF_TYPES as readonly string[]).includes(file.type)) {
    return { ok: false, error: "Only JPG, PNG, WebP or HEIC images are allowed." };
  }
  return { ok: true, file };
}

/**
 * Upload a validated proof image to the private bucket under `prefix/<id>/…`.
 * Returns the storage object path (not a public URL — the bucket is private).
 */
export async function uploadProof(
  admin: Admin,
  prefix: "bookings" | "memberships",
  id: string,
  file: File,
): Promise<{ ok: true; path: string } | { ok: false; error: string }> {
  const ext = EXT_BY_TYPE[file.type] ?? "img";
  const path = `${prefix}/${id}/proof.${ext}`;
  const buffer = Buffer.from(await file.arrayBuffer());
  const { error } = await admin.storage.from(PROOF_BUCKET).upload(path, buffer, {
    contentType: file.type,
    upsert: true,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true, path };
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
