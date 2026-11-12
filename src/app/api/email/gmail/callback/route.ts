import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/authz";
import { PERMISSIONS } from "@/lib/permissions";
import { completeGmailOAuth } from "@/services/email/connection-service";
import { GMAIL_OAUTH_STATE_COOKIE } from "@/services/email/oauth-constants";

function redirectToSettings(request: Request, query: string) {
  const url = new URL("/settings/email", request.url);
  url.search = query;
  return NextResponse.redirect(url);
}

export async function GET(request: Request) {
  try {
    requirePermission(PERMISSIONS.emailManage);
  } catch {
    return redirectToSettings(request, "error=unauthorized");
  }

  const incoming = new URL(request.url);
  const code = incoming.searchParams.get("code");
  const state = incoming.searchParams.get("state");
  const oauthError = incoming.searchParams.get("error");

  if (oauthError) {
    return redirectToSettings(request, `error=${encodeURIComponent(oauthError)}`);
  }

  const cookieStore = await cookies();
  const expectedState = cookieStore.get(GMAIL_OAUTH_STATE_COOKIE)?.value;
  cookieStore.delete(GMAIL_OAUTH_STATE_COOKIE);

  if (!code || !state || !expectedState || state !== expectedState) {
    return redirectToSettings(request, "error=invalid_oauth_state");
  }

  try {
    await completeGmailOAuth(code);
    return redirectToSettings(request, "connected=1");
  } catch {
    return redirectToSettings(request, "error=oauth_exchange_failed");
  }
}
