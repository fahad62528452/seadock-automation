import "server-only";

import { getGmailOAuthConfig } from "@/services/email/credentials";

const GMAIL_SCOPES = [
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/userinfo.email",
].join(" ");

export function isGmailOAuthConfigured(): boolean {
  return Boolean(getGmailOAuthConfig());
}

export function buildGmailAuthUrl(state: string): string {
  const config = getGmailOAuthConfig();
  if (!config) {
    throw new Error("Gmail OAuth is not configured. Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and GOOGLE_REDIRECT_URI.");
  }

  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    response_type: "code",
    access_type: "offline",
    prompt: "consent",
    scope: GMAIL_SCOPES,
    state,
  });

  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

export async function exchangeGmailCode(code: string): Promise<{
  accessToken: string;
  refreshToken: string | null;
  expiresIn: number;
  scope: string;
  tokenType: string;
}> {
  const config = getGmailOAuthConfig();
  if (!config) throw new Error("Gmail OAuth is not configured.");

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: config.clientId,
      client_secret: config.clientSecret,
      redirect_uri: config.redirectUri,
      grant_type: "authorization_code",
    }),
  });

  const payload = (await response.json()) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    scope?: string;
    token_type?: string;
    error?: string;
    error_description?: string;
  };

  if (!response.ok || !payload.access_token) {
    throw new Error(payload.error_description || payload.error || "Unable to exchange Gmail authorization code.");
  }

  return {
    accessToken: payload.access_token,
    refreshToken: payload.refresh_token ?? null,
    expiresIn: payload.expires_in ?? 3600,
    scope: payload.scope ?? "",
    tokenType: payload.token_type ?? "Bearer",
  };
}

export async function refreshGmailAccessToken(refreshToken: string): Promise<{
  accessToken: string;
  expiresIn: number;
  scope?: string;
}> {
  const config = getGmailOAuthConfig();
  if (!config) throw new Error("Gmail OAuth is not configured.");

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: config.clientId,
      client_secret: config.clientSecret,
      grant_type: "refresh_token",
    }),
  });

  const payload = (await response.json()) as {
    access_token?: string;
    expires_in?: number;
    scope?: string;
    error?: string;
    error_description?: string;
  };

  if (!response.ok || !payload.access_token) {
    throw new Error(payload.error_description || payload.error || "Unable to refresh Gmail access token.");
  }

  return {
    accessToken: payload.access_token,
    expiresIn: payload.expires_in ?? 3600,
    scope: payload.scope,
  };
}

export async function fetchGmailAccountEmail(accessToken: string): Promise<string | null> {
  const response = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) return null;
  const payload = (await response.json()) as { email?: string };
  return payload.email ?? null;
}
