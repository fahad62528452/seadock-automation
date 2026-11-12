import "server-only";

import { isSupabaseConfigured, shouldUseSupabaseData } from "@/lib/data-source";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database";
import type { SupabaseClient } from "@supabase/supabase-js";

export type SeaDockSupabaseClient = SupabaseClient<Database>;

export interface DatabaseClient {
  provider: "supabase";
  mode: "user" | "admin";
  client: SeaDockSupabaseClient;
}

export function isDatabaseReady(): boolean {
  return isSupabaseConfigured();
}

/**
 * Returns a server Supabase client when the project is configured.
 * Prefer the user-scoped client. Use admin only for trusted server jobs.
 */
export async function getDatabaseClient(options?: {
  preferAdmin?: boolean;
}): Promise<DatabaseClient | null> {
  if (!isSupabaseConfigured()) return null;

  if (options?.preferAdmin && process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()) {
    return {
      provider: "supabase",
      mode: "admin",
      client: createAdminSupabaseClient(),
    };
  }

  return {
    provider: "supabase",
    mode: "user",
    client: await createServerSupabaseClient(),
  };
}

/** Active persistence target for application services. */
export function getPersistenceMode(): "mock" | "supabase" {
  return shouldUseSupabaseData() ? "supabase" : "mock";
}
