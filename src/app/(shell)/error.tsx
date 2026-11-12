"use client";

import { useEffect } from "react";

export default function ShellError({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <section className="rounded-md border border-border bg-surface px-6 py-12 text-center">
      <h2 className="text-[15px] font-semibold text-ink">This page could not be loaded</h2>
      <p className="mx-auto mt-1 max-w-md text-[13px] text-ink-muted">
        The data for this view failed to load. You can try again.
      </p>
      <button
        type="button"
        onClick={() => retry()}
        className="mt-4 h-9 rounded-md bg-primary px-3 text-[13px] font-medium text-white hover:bg-primary-hover"
      >
        Try again
      </button>
    </section>
  );
}
