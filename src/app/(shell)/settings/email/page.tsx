import type { Metadata } from "next";
import { Can } from "@/components/auth/can";
import { Alert, Button, PageHeader, StatusBadge } from "@/components/ui/form";
import { Panel } from "@/components/ui/panel";
import { formatTimestamp } from "@/lib/format";
import { getNavItem } from "@/lib/navigation";
import { PERMISSIONS } from "@/lib/permissions";
import { getPersistenceMode } from "@/services/db/client";
import {
  canConfigureGmail,
  getEmailConnection,
} from "@/services/email/connection-service";
import {
  connectGmailAction,
  disconnectGmailAction,
  syncEmailInboxAction,
  testEmailConnectionAction,
} from "./actions";
import { EmailSettingsActions } from "@/components/email/email-settings-actions";

const page = getNavItem("/settings/email");

export const metadata: Metadata = {
  title: page.label,
};

const STATUS_LABELS = {
  not_connected: "Not Connected",
  connected: "Connected",
  connection_error: "Connection Error",
  disconnected: "Disconnected",
} as const;

export default async function EmailSettingsPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = searchParams ? await searchParams : {};
  const connection = await getEmailConnection();
  const mode = getPersistenceMode();
  const gmailReady = canConfigureGmail();

  return (
    <div>
      <PageHeader
        title="Email Integration"
        description="Connect a mailbox for customer PO intake. Tokens stay server-side; extracted POs still require human confirmation."
      />

      {params.connected ? (
        <div className="mb-4">
          <Alert tone="success">Email provider connected successfully.</Alert>
        </div>
      ) : null}
      {params.error ? (
        <div className="mb-4">
          <Alert tone="error">
            {params.error === "oauth_not_configured"
              ? "Gmail OAuth is not configured. Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI, and EMAIL_CREDENTIALS_ENCRYPTION_KEY."
              : params.error === "invalid_oauth_state"
                ? "OAuth state validation failed. Try connecting again."
                : params.error === "oauth_exchange_failed"
                  ? "Unable to complete Gmail OAuth. Check credentials and try again."
                  : "Email connection failed."}
          </Alert>
        </div>
      ) : null}

      <Panel title="Provider connection">
        <dl className="grid gap-3 p-4 text-[13px] md:grid-cols-2">
          <div>
            <dt className="text-ink-muted">Email Provider</dt>
            <dd className="font-medium text-ink">{connection.provider === "mock" ? "Mock" : "Gmail"}</dd>
          </div>
          <div>
            <dt className="text-ink-muted">Connection Status</dt>
            <dd>
              <StatusBadge>{STATUS_LABELS[connection.status]}</StatusBadge>
            </dd>
          </div>
          <div>
            <dt className="text-ink-muted">Connected Account</dt>
            <dd className="font-medium text-ink">{connection.accountEmail ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-ink-muted">Last Successful Sync</dt>
            <dd className="text-ink">{connection.lastSyncAt ? formatTimestamp(connection.lastSyncAt) : "—"}</dd>
          </div>
          <div className="md:col-span-2">
            <dt className="text-ink-muted">Last Sync Result</dt>
            <dd className="text-ink">
              {connection.lastSyncResult
                ? `Checked ${connection.lastSyncResult.messagesChecked} · New ${connection.lastSyncResult.newMessages} · PO candidates ${connection.lastSyncResult.poCandidates} · Action required ${connection.lastSyncResult.actionRequired} · Ignored ${connection.lastSyncResult.ignored}`
                : "—"}
            </dd>
          </div>
          {connection.lastError ? (
            <div className="md:col-span-2">
              <dt className="text-ink-muted">Last Error</dt>
              <dd className="text-warning">{connection.lastError}</dd>
            </div>
          ) : null}
          <div className="md:col-span-2 text-[12px] text-ink-muted">
            Data source: {mode}. OAuth secrets and refresh tokens are never shown in this UI.
            {!gmailReady && mode === "supabase"
              ? " Configure GOOGLE_* and EMAIL_CREDENTIALS_ENCRYPTION_KEY to connect Gmail."
              : null}
          </div>
        </dl>

        <div className="flex flex-wrap gap-2 border-t border-border p-4">
          <Can permission={PERMISSIONS.emailManage}>
            <form action={connectGmailAction}>
              <Button type="submit">
                {mode === "mock" ? "Connect Mock Inbox" : "Connect Gmail"}
              </Button>
            </form>
          </Can>
          <Can permission={PERMISSIONS.emailView}>
            <EmailSettingsActions
              canManage={true}
              disconnectAction={disconnectGmailAction}
              testAction={testEmailConnectionAction}
              syncAction={syncEmailInboxAction}
            />
          </Can>
        </div>
      </Panel>
    </div>
  );
}
