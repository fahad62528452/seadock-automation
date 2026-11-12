export function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div className="px-6 py-12 text-center">
      <p className="text-[14px] font-medium text-ink">{title}</p>
      <p className="mx-auto mt-1 max-w-lg text-[13px] leading-5 text-ink-muted">{description}</p>
    </div>
  );
}
