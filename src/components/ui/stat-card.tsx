import Link from "next/link";

export function StatCard({
  label,
  value,
  detail,
  href,
}: {
  label: string;
  value: string;
  detail: string;
  href?: string;
}) {
  const content = (
    <>
      <h3 className="text-[12px] font-medium text-ink-muted">{label}</h3>
      <p className="mt-1 text-[20px] font-semibold tracking-tight text-ink tabular-nums">{value}</p>
      <p className="mt-1 text-[12px] leading-4 text-ink-secondary">{detail}</p>
    </>
  );

  if (href) {
    return (
      <Link
        href={href}
        className="rounded-md border border-border bg-surface px-3.5 py-3 transition-colors hover:border-border-strong hover:bg-surface-muted"
      >
        {content}
      </Link>
    );
  }

  return <article className="rounded-md border border-border bg-surface px-3.5 py-3">{content}</article>;
}
