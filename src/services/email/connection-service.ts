import "server-only";

import { asProfileId } from "@/lib/authz";
import {
  mockGetEmailConnection,
  mockSetEmailConnection,
} from "@/lib/mock/email-intake-store";
import { getSession } from "@/services/auth/get-session";
import { recordAuditEntry } from "@/services/audit/audit-service";
import {
  decryptSecret,
  encryptSecret,
  isCredentialEncryptionConfigured,
} from "@/services/email/credentials";
import {
  buildGmailAuthUrl,
  exchangeGmailCode,
  fetchGmailAccountEmail,
  isGmailOAuthConfigured,
} from "@/services/email/providers/gmail-oauth";
import { getDatabaseClient, getPersistenceMode } from "@/services/db/client";
import type { EmailConnectionView, EmailSyncSummary } from "@/types/email";

type NestedRow = { [key: string]: unknown };

async function getClient(preferAdmin = true) {
  const database = await getDatabaseClient({ preferAdmin });
  if (!database) throw new Error("Supabase is not configured.");
  return database.client;
}

export function getGmailConnectUrl(state: string): string {
  return buildGmailAuthUrl(state);
}

export function canConfigureGmail(): boolean {
  return isGmailOAuthConfigured() && isCredentialEncryptionConfigured();
}

export async function getEmailConnection(): Promise<EmailConnectionView> {
  if (getPersistenceMode() === "mock") return mockGetEmailConnection();

  const client = await getClient();
  const { data, error } = await client
    .from("email_provider_connections")
    .select(
      "provider, status, account_email, last_sync_at, last_sync_result, last_error, connected_at",
    )
    .eq("provider", "gmail")
    .maybeSingle();

  if (error) throw new Error("Unable to load email connection status.");
  if (!data) {
    return {
      provider: "gmail",
      status: "not_connected",
      accountEmail: null,
      lastSyncAt: null,
      lastSyncResult: null,
      lastError: null,
      connectedAt: null,
    };
  }

  const row = data as NestedRow;
  return {
    provider: "gmail",
    status: row.status as EmailConnectionView["status"],
    accountEmail: (row.account_email as string | null) ?? null,
    lastSyncAt: (row.last_sync_at as string | null) ?? null,
    lastSyncResult: (row.last_sync_result as EmailSyncSummary | null) ?? null,
    lastError: (row.last_error as string | null) ?? null,
    connectedAt: (row.connected_at as string | null) ?? null,
  };
}

export async function getStoredGmailTokens(): Promise<{
  accessToken: string | null;
  refreshToken: string | null;
  accessTokenExpiresAt: string | null;
} | null> {
  if (getPersistenceMode() === "mock") {
    return { accessToken: "mock-access", refreshToken: "mock-refresh", accessTokenExpiresAt: null };
  }

  const client = await getClient(true);
  const { data, error } = await client
    .from("email_provider_connections")
    .select("access_token_ciphertext, refresh_token_ciphertext, access_token_expires_at, status")
    .eq("provider", "gmail")
    .maybeSingle();

  if (error || !data) return null;
  const row = data as NestedRow;
  if (row.status !== "connected") return null;

  return {
    accessToken: row.access_token_ciphertext
      ? decryptSecret(String(row.access_token_ciphertext))
      : null,
    refreshToken: row.refresh_token_ciphertext
      ? decryptSecret(String(row.refresh_token_ciphertext))
      : null,
    accessTokenExpiresAt: (row.access_token_expires_at as string | null) ?? null,
  };
}

export async function saveGmailAccessToken(accessToken: string, expiresIn: number) {
  if (getPersistenceMode() === "mock") return;
  const client = await getClient(true);
  await client
    .from("email_provider_connections")
    .update({
      access_token_ciphertext: encryptSecret(accessToken),
      access_token_expires_at: new Date(Date.now() + expiresIn * 1000).toISOString(),
    })
    .eq("provider", "gmail");
}

export async function completeGmailOAuth(code: string) {
  const session = getSession();
  const tokens = await exchangeGmailCode(code);
  const accountEmail = await fetchGmailAccountEmail(tokens.accessToken);

  if (getPersistenceMode() === "mock") {
    return mockSetEmailConnection(
      {
        provider: "gmail",
        status: "connected",
        accountEmail: accountEmail ?? "gmail-user@example.com",
        connectedAt: new Date().toISOString(),
        lastError: null,
        refreshToken: tokens.refreshToken,
        accessToken: tokens.accessToken,
      },
      session.name,
      "Gmail Connected",
    );
  }

  if (!isCredentialEncryptionConfigured()) {
    throw new Error("EMAIL_CREDENTIALS_ENCRYPTION_KEY must be set before connecting Gmail.");
  }

  const client = await getClient(true);
  const payload = {
    provider: "gmail" as const,
    account_email: accountEmail,
    status: "connected" as const,
    scopes: tokens.scope ? tokens.scope.split(/\s+/).filter(Boolean) : [],
    refresh_token_ciphertext: tokens.refreshToken ? encryptSecret(tokens.refreshToken) : null,
    access_token_ciphertext: encryptSecret(tokens.accessToken),
    access_token_expires_at: new Date(Date.now() + tokens.expiresIn * 1000).toISOString(),
    last_error: null,
    connected_by: asProfileId(session.id),
    connected_at: new Date().toISOString(),
  };

  const { error } = await client.from("email_provider_connections").upsert(payload, {
    onConflict: "provider",
  });
  if (error) throw new Error("Unable to store Gmail connection.");

  await recordAuditEntry({
    actorId: session.id,
    actorName: session.name,
    action: "Gmail Connected",
    recordType: "email_provider_connection",
    recordId: "gmail",
    recordLabel: accountEmail ?? "gmail",
    field: "status",
    previousValue: null,
    newValue: "connected",
  });

  return getEmailConnection();
}

export async function disconnectGmail() {
  const session = getSession();

  if (getPersistenceMode() === "mock") {
    return mockSetEmailConnection(
      {
        status: "disconnected",
        accountEmail: null,
        refreshToken: null,
        accessToken: null,
        lastError: null,
      },
      session.name,
      "Gmail Disconnected",
    );
  }

  const client = await getClient(true);
  const { error } = await client
    .from("email_provider_connections")
    .upsert(
      {
        provider: "gmail",
        status: "disconnected",
        account_email: null,
        refresh_token_ciphertext: null,
        access_token_ciphertext: null,
        access_token_expires_at: null,
        last_error: null,
        scopes: [],
      },
      { onConflict: "provider" },
    );
  if (error) throw new Error("Unable to disconnect Gmail.");

  await recordAuditEntry({
    actorId: session.id,
    actorName: session.name,
    action: "Gmail Disconnected",
    recordType: "email_provider_connection",
    recordId: "gmail",
    recordLabel: "gmail",
    field: "status",
    previousValue: "connected",
    newValue: "disconnected",
  });

  return getEmailConnection();
}

export async function connectMockProvider() {
  const session = getSession();
  return mockSetEmailConnection(
    {
      provider: "mock",
      status: "connected",
      accountEmail: "mock-inbox@seadock.local",
      connectedAt: new Date().toISOString(),
      lastError: null,
    },
    session.name,
    "Gmail Connected",
  );
}

export async function testEmailConnection(): Promise<{
  ok: boolean;
  accountEmail?: string | null;
  error?: string;
}> {
  const { getEmailProvider } = await import("@/services/email/email-provider");
  const provider = await getEmailProvider();
  if (!provider.testConnection) {
    return { ok: false, error: "Provider does not support connection tests." };
  }
  try {
    return await provider.testConnection();
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Connection test failed.",
    };
  }
}
