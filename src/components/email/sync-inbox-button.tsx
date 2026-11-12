"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/form";
import type { InboxActionState } from "@/app/(shell)/customer-orders/inbox/actions";

export function SyncInboxButton({
  syncAction,
}: {
  syncAction: () => Promise<InboxActionState>;
}) {
  const [message, setMessage] = useState<string | null>(null);
  const [ok, setOk] = useState(true);
  const [pending, startTransition] = useTransition();

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await syncAction();
            setOk(result.ok);
            setMessage(result.message ?? null);
          })
        }
      >
        {pending ? "Syncing…" : "Sync Now"}
      </Button>
      {message ? (
        <p className={`max-w-sm text-right text-[11px] ${ok ? "text-ink-muted" : "text-warning"}`}>
          {message}
        </p>
      ) : null}
    </div>
  );
}
