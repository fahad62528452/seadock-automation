import type { Metadata } from "next";
import { PageActions } from "@/components/ui/form";
import { OperationalFulfilmentBoardView } from "@/components/fulfilment/operational-board";
import { getNavItem } from "@/lib/navigation";
import { listOperationalFulfilments } from "@/services/fulfillment/fulfillment-service";
import type { OperationalFulfilmentBucket } from "@/types/fulfillment";

const nav = getNavItem("/fulfilment");

export const metadata: Metadata = {
  title: nav.label,
};

const BUCKET_SET = new Set<OperationalFulfilmentBucket>([
  "ready_for_fulfilment",
  "awaiting_final_qaqc",
  "blocked_qaqc",
  "ready_to_dispatch",
  "completed",
]);

/**
 * Dynamic via `searchParams` (bucket filter) — a Request-time API under Cache Components.
 * `connection()` is not needed: the board reads stored dates / mock store / Supabase only;
 * it does not use request-time clocks or session APIs on this path.
 */
export default async function FulfilmentOperationsPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = searchParams ? await searchParams : {};
  const bucketRaw = typeof query.bucket === "string" ? query.bucket : "";
  const board = await listOperationalFulfilments();

  const activeBucket =
    bucketRaw && BUCKET_SET.has(bucketRaw as OperationalFulfilmentBucket)
      ? (bucketRaw as OperationalFulfilmentBucket)
      : null;

  const buckets = activeBucket ? ([activeBucket] as OperationalFulfilmentBucket[]) : undefined;

  return (
    <div className="space-y-3">
      <PageActions description={nav.description} />
      <OperationalFulfilmentBoardView board={board} buckets={buckets} activeBucket={activeBucket} />
    </div>
  );
}
