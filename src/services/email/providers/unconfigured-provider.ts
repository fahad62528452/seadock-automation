import type { EmailProvider, InboundEmailMessage, ListMessagesResult } from "@/types/email";

/** Stub provider when no email account is connected. */
export class UnconfiguredEmailProvider implements EmailProvider {
  readonly id = "other" as const;

  async listMessages(): Promise<ListMessagesResult> {
    return { messages: [], nextPageToken: null };
  }

  async getMessage(): Promise<InboundEmailMessage | null> {
    return null;
  }

  async markProcessed(): Promise<void> {
    // No-op.
  }

  async testConnection() {
    return { ok: false, error: "No email provider is connected." };
  }
}
