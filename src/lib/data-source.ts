export type DataSource = "mock" | "supabase";

/** Public Supabase values that may be used from browser or server code. */
export function getPublicSupabaseConfig(): { url: string; anonKey: string } | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();

  if (!url || !anonKey) return null;
  return { url, anonKey };
}

export function isSupabaseConfigured(): boolean {
  return getPublicSupabaseConfig() !== null;
}

/**
 * Mock remains the default so local UI work does not require a live database.
 * Set SEADOCK_DATA_SOURCE=supabase after migrations are applied.
 */
export function getDataSource(): DataSource {
  const configured = process.env.SEADOCK_DATA_SOURCE?.trim().toLowerCase();
  if (configured === "supabase") {
    if (!isSupabaseConfigured()) {
      throw new Error(
        "SEADOCK_DATA_SOURCE=supabase requires NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.",
      );
    }
    return "supabase";
  }
  return "mock";
}

export function shouldUseSupabaseData(): boolean {
  return getDataSource() === "supabase";
}
