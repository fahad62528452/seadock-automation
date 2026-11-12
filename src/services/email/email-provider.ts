import "server-only";

import { getPersistenceMode } from "@/services/db/client";
import { UnconfiguredEmailProvider } from "@/services/email/providers/unconfigured-provider";
import { MockEmailProvider } from "@/services/email/providers/mock-provider";
import { GmailEmailProvider } from "@/services/email/providers/gmail-provider";
import {
  getStoredGmailTokens,
  saveGmailAccessToken,
} from "@/services/email/connection-service";
import type { EmailProvider } from "@/types/email";

export { UnconfiguredEmailProvider } from "@/services/email/providers/unconfigured-provider";

/**
 * Resolve the active email provider.
 * Mock mode always uses MockEmailProvider.
 * Supabase mode uses Gmail when connected; otherwise unconfigured.
 */
export async function getEmailProvider(): Promise<EmailProvider> {
  if (getPersistenceMode() === "mock") {
    return new MockEmailProvider();
  }

  const tokens = await getStoredGmailTokens();
  if (!tokens?.accessToken && !tokens?.refreshToken) {
    return new UnconfiguredEmailProvider();
  }

  return new GmailEmailProvider(
    tokens.accessToken ?? "",
    tokens.refreshToken,
    async (accessToken, expiresIn) => {
      await saveGmailAccessToken(accessToken, expiresIn);
    },
  );
}
