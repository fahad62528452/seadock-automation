import Link from "next/link";
import { Shell } from "@/components/layout/shell";

export default function NotFound() {
  return (
    <Shell>
      <section className="rounded-md border border-border bg-surface px-6 py-12 text-center">
        <h2 className="text-[15px] font-semibold text-ink">Page not found</h2>
        <p className="mx-auto mt-1 max-w-md text-[13px] text-ink-muted">That address is not part of SeaDock.</p>
        <Link
          href="/"
          className="mt-4 inline-flex h-9 items-center rounded-md bg-primary px-3 text-[13px] font-medium text-white hover:bg-primary-hover"
        >
          Back to dashboard
        </Link>
      </section>
    </Shell>
  );
}
