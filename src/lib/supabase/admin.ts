import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

/**
 * Service-role Supabase client — BYPASSES RLS. Server-only.
 * NEVER import this into a Client Component. Created lazily so a missing key
 * fails at call time (with a clear message) rather than at module import.
 */
export function createAdminClient() {
  // Falls back to the public URL so a single URL var is enough (server still
  // requires the secret service-role key, which is never exposed to the browser).
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    throw new Error(
      "Missing Supabase URL or SUPABASE_SERVICE_ROLE_KEY. Set them in .env.local (and in Vercel project settings).",
    );
  }

  return createClient<Database>(url, serviceKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}
