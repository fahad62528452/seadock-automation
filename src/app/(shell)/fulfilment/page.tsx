import type { Metadata } from "next";
import { connection } from "next/server";
import { PageHeader } from "@/components/ui/form";
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

export default async function FulfilmentOperationsPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  await connection();
  const query = searchParams ? await searchParams : {};
  const bucketRaw = typeof query.bucket === "string" ? query.bucket : "";
  const board = await listOperationalFulfilments();

  const buckets =
    bucketRaw && BUCKET_SET.has(bucketRaw as OperationalFulfilmentBucket)
      ? ([bucketRaw] as OperationalFulfilmentBucket[])
      : undefined;

  return (
    <div className="space-y-4">
      <PageHeader title={nav.label} description={nav.description} />
      <OperationalFulfilmentBoardView board={board} buckets={buckets} />
    </div>
  );
}
