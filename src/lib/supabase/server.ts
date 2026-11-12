import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getPublicSupabaseConfig } from "@/lib/data-source";
import type { Database } from "@/types/database";

/** Server Supabase client for Server Components, Route Handlers, and Server Actions. */
export async function createServerSupabaseClient() {
  const config = getPublicSupabaseConfig();
  if (!config) {
    throw new Error("Supabase server client requires NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.");
  }

  const cookieStore = await cookies();

  return createServerClient<Database>(config.url, config.anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch {
          // Called from a Server Component where cookies are read-only.
          // Session refresh is handled later with auth middleware.
        }
      },
    },
  });
}
