/**
 * Shared detection for "the staff_time_off migration hasn't been applied yet".
 *
 * Production runs behind the repo, so every read/write of public.staff_time_off
 * has to survive the table simply not being there. Callers treat a missing table
 * as "nobody has any days off" (fail open — the feature just isn't live), and
 * treat every OTHER error as a real failure.
 */

/** True when the error is "staff_time_off doesn't exist yet" (migration not applied). */
export function isMissingTimeOffTable(
  error: { code?: string; message?: string } | null,
): boolean {
  if (!error) return false;
  // 42P01 = Postgres undefined_table; PGRST205 = PostgREST can't find the table
  // in its schema cache (what supabase-js reports before a schema reload).
  if (error.code === "42P01" || error.code === "PGRST205") return true;
  // Fall back to the message: only ours, and only when it reads as "not there".
  const message = error.message ?? "";
  return (
    /staff_time_off/i.test(message) && /does not exist|schema cache/i.test(message)
  );
}
