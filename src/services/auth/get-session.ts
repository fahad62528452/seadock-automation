import { placeholderUser } from "@/lib/mock/session";
import type { UserAccount } from "@/types/auth";

/** Returns the signed-in user. Swap this for Supabase Auth in a later step. */
export function getSession(): UserAccount {
  return placeholderUser;
}
