"use server";

import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requirePermission, toUserMessage } from "@/lib/authz";
import { PERMISSIONS } from "@/lib/permissions";
import { getPersistenceMode } from "@/services/db/client";
import {
  canConfigureGmail,
  connectMockProvider,
  disconnectGmail,
  getGmailConnectUrl,
  testEmailConnection,
} from "@/services/email/connection-service";
import { syncEmailInbox } from "@/services/email/email-intake-service";
import { GMAIL_OAUTH_STATE_COOKIE } from "@/services/email/oauth-constants";

export type EmailActionState = {
  ok: boolean;
  message?: string;
};

export async function connectGmailAction(): Promise<void> {
  requirePermission(PERMISSIONS.emailManage);

  if (getPersistenceMode() === "mock") {
    await connectMockProvider();
    revalidatePath("/settings/email");
    redirect("/settings/email?connected=1");
  }

  if (!canConfigureGmail()) {
    redirect("/settings/email?error=oauth_not_configured");
  }

  const state = randomBytes(24).toString("hex");
  const cookieStore = await cookies();
  cookieStore.set(GMAIL_OAUTH_STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 600,
  });

  redirect(getGmailConnectUrl(state));
}

export async function disconnectGmailAction(): Promise<EmailActionState> {
  try {
    requirePermission(PERMISSIONS.emailManage);
    await disconnectGmail();
    revalidatePath("/settings/email");
    return { ok: true, message: "Email provider disconnected." };
  } catch (error) {
    return { ok: false, message: toUserMessage(error, "Unable to disconnect email provider.") };
  }
}

export async function testEmailConnectionAction(): Promise<EmailActionState> {
  try {
    requirePermission(PERMISSIONS.emailView);
    const result = await testEmailConnection();
    if (!result.ok) {
      return { ok: false, message: result.error || "Connection test failed." };
    }
    return {
      ok: true,
      message: `Connection OK${result.accountEmail ? ` · ${result.accountEmail}` : ""}.`,
    };
  } catch (error) {
    return { ok: false, message: toUserMessage(error, "Connection test failed.") };
  }
}

export async function syncEmailInboxAction(): Promise<EmailActionState> {
  try {
    requirePermission(PERMISSIONS.emailManage);
    const summary = await syncEmailInbox();
    revalidatePath("/settings/email");
    revalidatePath("/customer-orders/inbox");
    revalidatePath("/");
    return {
      ok: true,
      message: `Sync completed · checked ${summary.messagesChecked}, new ${summary.newMessages}, PO candidates ${summary.poCandidates}, action required ${summary.actionRequired}, ignored ${summary.ignored}.`,
    };
  } catch (error) {
    return { ok: false, message: toUserMessage(error, "Email sync failed.") };
  }
}
