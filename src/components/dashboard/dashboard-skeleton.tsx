export function DashboardSkeleton() {
  return (
    <div className="space-y-5" aria-busy="true" aria-label="Loading dashboard">
      <div className="h-4 w-72 rounded bg-border" />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {Array.from({ length: 6 }, (_, index) => (
          <div key={index} className="h-[88px] animate-pulse rounded-md border border-border bg-surface" />
        ))}
      </div>
      <div className="h-72 animate-pulse rounded-md border border-border bg-surface" />
      <div className="h-64 animate-pulse rounded-md border border-border bg-surface" />
    </div>
  );
}
