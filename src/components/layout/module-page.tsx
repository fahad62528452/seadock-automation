import { EmptyState } from "@/components/ui/empty-state";

export function ModulePage({ title, description }: { title: string; description: string }) {
  return (
    <section className="rounded-md border border-border bg-surface">
      <EmptyState title={title} description={description} />
    </section>
  );
}
