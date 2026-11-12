import { hasPermission, type Permission } from "@/lib/permissions";
import { getSession } from "@/services/auth/get-session";
import type { Role } from "@/types/auth";

export class AuthorizationError extends Error {
  constructor(message = "You do not have permission to perform this action.") {
    super(message);
    this.name = "AuthorizationError";
  }
}

export function requirePermission(permission: Permission, role?: Role) {
  const session = getSession();
  const effectiveRole = role ?? session.role;
  if (!hasPermission(effectiveRole, permission)) {
    throw new AuthorizationError();
  }
  return session;
}

export function isUuid(value: string | null | undefined): value is string {
  if (!value) return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export function asProfileId(value: string | null | undefined): string | null {
  return isUuid(value) ? value : null;
}

export function toUserMessage(error: unknown, fallback = "Something went wrong. Please try again."): string {
  if (error instanceof AuthorizationError) return error.message;
  if (error instanceof Error && error.message && !/postgres|supabase|sql|permission denied|violates/i.test(error.message)) {
    return error.message;
  }
  return fallback;
}
