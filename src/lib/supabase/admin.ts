import "server-only";

import { createClient } from "@supabase/supabase-js";
import { getPublicSupabaseConfig } from "@/lib/data-source";
import type { Database } from "@/types/database";

/**
 * Service-role client for trusted server operations.
 * Never import this module from Client Components or expose it to the browser.
 */
export function createAdminSupabaseClient() {
  const config = getPublicSupabaseConfig();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

  if (!config || !serviceRoleKey) {
    throw new Error(
      "Supabase admin client requires NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, and SUPABASE_SERVICE_ROLE_KEY.",
    );
  }

  return createClient<Database>(config.url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
