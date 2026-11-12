import type { ReactNode } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { ROLE_LABELS } from "@/lib/permissions";
import { getSession } from "@/services/auth/get-session";
import { getNotificationPreview } from "@/services/dashboard/get-dashboard";

export async function Shell({ children }: { children: ReactNode }) {
  const user = getSession();
  const notifications = await getNotificationPreview();

  return (
    <AppShell
      user={{
        name: user.name,
        email: user.email,
        role: ROLE_LABELS[user.role],
      }}
      notifications={notifications}
    >
      {children}
    </AppShell>
  );
}
