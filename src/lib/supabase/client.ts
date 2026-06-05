import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@/integrations/supabase/types";

/**
 * Browser Supabase client (anon key). Use inside Client Components.
 * Reads only — all privileged writes go through Server Actions / route handlers.
 */
export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
