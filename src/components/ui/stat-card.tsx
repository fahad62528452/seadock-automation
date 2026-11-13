import Link from "next/link";
import { cn } from "@/lib/cn";

export function StatCard({
  label,
  value,
  detail,
  href,
  emphasis = false,
}: {
  label: string;
  value: string;
  detail?: string;
  href?: string;
  emphasis?: boolean;
}) {
  const content = (
    <>
      <p className="text-[20px] font-semibold tracking-tight text-ink tabular-nums leading-6">{value}</p>
      <h3 className="mt-1 text-[12px] font-medium text-ink-secondary">{label}</h3>
      {detail ? <p className="mt-0.5 text-[11px] leading-4 text-ink-muted">{detail}</p> : null}
    </>
  );

  const className = cn(
    "block rounded-md border bg-surface px-3 py-2.5 transition-colors",
    emphasis ? "border-primary/30 bg-primary-subtle/40" : "border-border",
    href && "hover:border-border-strong hover:bg-surface-muted",
  );

  if (href) {
    return (
      <Link href={href} className={className}>
        {content}
      </Link>
    );
  }

  return <article className={className}>{content}</article>;
}
