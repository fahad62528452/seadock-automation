import type { ReactNode } from "react";
import { hasPermission, type Permission } from "@/lib/permissions";
import { getSession } from "@/services/auth/get-session";

export function Can({
  permission,
  children,
  fallback = null,
}: {
  permission: Permission;
  children: ReactNode;
  fallback?: ReactNode;
}) {
  const session = getSession();
  if (!hasPermission(session.role, permission)) return fallback;
  return children;
}
