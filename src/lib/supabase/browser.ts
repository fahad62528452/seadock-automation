import { createBrowserClient } from "@supabase/ssr";
import { getPublicSupabaseConfig } from "@/lib/data-source";
import type { Database } from "@/types/database";

/** Browser Supabase client. Uses the anon key only. */
export function createBrowserSupabaseClient() {
  const config = getPublicSupabaseConfig();
  if (!config) {
    throw new Error("Supabase browser client requires NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.");
  }

  return createBrowserClient<Database>(config.url, config.anonKey);
}
