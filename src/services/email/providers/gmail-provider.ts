import "server-only";

import { refreshGmailAccessToken } from "@/services/email/providers/gmail-oauth";
import type {
  EmailProvider,
  InboundEmailMessage,
  ListMessagesInput,
  ListMessagesResult,
} from "@/types/email";

type GmailListResponse = {
  messages?: Array<{ id: string; threadId?: string }>;
  nextPageToken?: string;
};

type GmailPart = {
  headers?: Array<{ name: string; value: string }>;
  filename?: string;
  mimeType?: string;
  body?: { data?: string; size?: number; attachmentId?: string };
  parts?: GmailPart[];
};

type GmailMessageResponse = {
  id: string;
  threadId?: string;
  snippet?: string;
  internalDate?: string;
  payload?: GmailPart;
};

function headerValue(headers: Array<{ name: string; value: string }> | undefined, name: string) {
  return headers?.find((header) => header.name.toLowerCase() === name.toLowerCase())?.value ?? null;
}

function decodeBody(data?: string | null): string | null {
  if (!data) return null;
  try {
    return Buffer.from(data.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
  } catch {
    return null;
  }
}

function collectParts(
  part: GmailPart | undefined,
  attachments: InboundEmailMessage["attachments"],
  bodies: string[],
) {
  if (!part) return;
  if (part.mimeType?.startsWith("text/plain") && part.body?.data) {
    const text = decodeBody(part.body.data);
    if (text) bodies.push(text);
  }
  if (part.filename && part.body?.attachmentId) {
    attachments?.push({
      externalAttachmentId: part.body.attachmentId,
      filename: part.filename,
      mimeType: part.mimeType ?? null,
      sizeBytes: part.body.size ?? null,
      contentText: null,
    });
  }
  for (const child of part.parts ?? []) {
    collectParts(child, attachments, bodies);
  }
}

function mapGmailMessage(raw: GmailMessageResponse): InboundEmailMessage {
  const headers = raw.payload?.headers;
  const attachments: NonNullable<InboundEmailMessage["attachments"]> = [];
  const bodies: string[] = [];
  collectParts(raw.payload, attachments, bodies);

  return {
    externalMessageId: raw.id,
    provider: "gmail",
    sender: headerValue(headers, "From"),
    recipient: headerValue(headers, "To"),
    subject: headerValue(headers, "Subject"),
    receivedAt: raw.internalDate
      ? new Date(Number(raw.internalDate)).toISOString()
      : headerValue(headers, "Date"),
    threadId: raw.threadId ?? null,
    snippet: raw.snippet ?? null,
    bodyText: bodies.join("\n\n") || null,
    hasAttachments: attachments.length > 0,
    attachments,
  };
}

export class GmailEmailProvider implements EmailProvider {
  readonly id = "gmail" as const;

  constructor(
    private accessToken: string,
    private refreshToken: string | null,
    private onTokenRefreshed?: (accessToken: string, expiresIn: number) => Promise<void>,
  ) {}

  private async authorizedFetch(url: string): Promise<Response> {
    let response = await fetch(url, {
      headers: { Authorization: `Bearer ${this.accessToken}` },
    });

    if (response.status === 401 && this.refreshToken) {
      const refreshed = await refreshGmailAccessToken(this.refreshToken);
      this.accessToken = refreshed.accessToken;
      if (this.onTokenRefreshed) {
        await this.onTokenRefreshed(refreshed.accessToken, refreshed.expiresIn);
      }
      response = await fetch(url, {
        headers: { Authorization: `Bearer ${this.accessToken}` },
      });
    }

    return response;
  }

  async listMessages(input: ListMessagesInput = {}): Promise<ListMessagesResult> {
    const params = new URLSearchParams({
      maxResults: String(input.limit ?? 25),
      q: input.query ?? "in:inbox",
    });
    if (input.pageToken) params.set("pageToken", input.pageToken);
    if (input.since) {
      const epoch = Math.floor(new Date(input.since).getTime() / 1000);
      if (!Number.isNaN(epoch)) params.set("q", `${params.get("q")} after:${epoch}`);
    }

    const listResponse = await this.authorizedFetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages?${params.toString()}`,
    );
    const listPayload = (await listResponse.json()) as GmailListResponse & {
      error?: { message?: string };
    };
    if (!listResponse.ok) {
      throw new Error(listPayload.error?.message || "Unable to list Gmail messages.");
    }

    const messages: InboundEmailMessage[] = [];
    for (const item of listPayload.messages ?? []) {
      const full = await this.getMessage(item.id);
      if (full) messages.push(full);
    }

    return {
      messages,
      nextPageToken: listPayload.nextPageToken ?? null,
    };
  }

  async getMessage(externalMessageId: string): Promise<InboundEmailMessage | null> {
    const response = await this.authorizedFetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(externalMessageId)}?format=full`,
    );
    if (response.status === 404) return null;
    const payload = (await response.json()) as GmailMessageResponse & { error?: { message?: string } };
    if (!response.ok) {
      throw new Error(payload.error?.message || "Unable to load Gmail message.");
    }
    return mapGmailMessage(payload);
  }

  async markProcessed(): Promise<void> {
    // SeaDock tracks processing in email_messages; Gmail labels are not mutated in Step 6.
  }

  async testConnection() {
    const response = await this.authorizedFetch("https://gmail.googleapis.com/gmail/v1/users/me/profile");
    const payload = (await response.json()) as { emailAddress?: string; error?: { message?: string } };
    if (!response.ok) {
      return { ok: false, error: payload.error?.message || "Gmail connection failed." };
    }
    return { ok: true, accountEmail: payload.emailAddress ?? null };
  }
}
