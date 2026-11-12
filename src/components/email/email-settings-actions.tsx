"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/form";
import type { EmailActionState } from "@/app/(shell)/settings/email/actions";

export function EmailSettingsActions({
  disconnectAction,
  testAction,
  syncAction,
}: {
  canManage: boolean;
  disconnectAction: () => Promise<EmailActionState>;
  testAction: () => Promise<EmailActionState>;
  syncAction: () => Promise<EmailActionState>;
}) {
  const [message, setMessage] = useState<string | null>(null);
  const [ok, setOk] = useState(true);
  const [pending, startTransition] = useTransition();

  function run(action: () => Promise<EmailActionState>) {
    startTransition(async () => {
      const result = await action();
      setOk(result.ok);
      setMessage(result.message ?? (result.ok ? "Done." : "Action failed."));
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="secondary" disabled={pending} onClick={() => run(testAction)}>
          Test Connection
        </Button>
        <Button type="button" variant="secondary" disabled={pending} onClick={() => run(syncAction)}>
          Sync Now
        </Button>
        <Button type="button" variant="danger" disabled={pending} onClick={() => run(disconnectAction)}>
          Disconnect
        </Button>
      </div>
      {message ? (
        <p className={`text-[12px] ${ok ? "text-ink-secondary" : "text-warning"}`} role="status">
          {message}
        </p>
      ) : null}
    </div>
  );
}
