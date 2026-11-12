import type { UserAccount } from "@/types/auth";

/**
 * Placeholder signed-in user. Replace getSession() with Supabase Auth later.
 * This is not a persisted account.
 */
export const placeholderUser: UserAccount = {
  id: "user_ahmed_khan",
  name: "Ahmed Khan",
  email: "ahmed.khan@seadock.local",
  role: "warehouse_manager",
  active: true,
};
