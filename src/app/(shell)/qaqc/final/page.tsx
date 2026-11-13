import type { Metadata } from "next";
import { connection } from "next/server";
import { PageActions } from "@/components/ui/form";
import { OperationalFulfilmentBoardView } from "@/components/fulfilment/operational-board";
import { getNavItem } from "@/lib/navigation";
import { listOperationalFulfilments } from "@/services/fulfillment/fulfillment-service";

const nav = getNavItem("/qaqc/final");

export const metadata: Metadata = {
  title: nav.label,
};

export default async function FinalQaqcOperationsPage() {
  await connection();
  const board = await listOperationalFulfilments();

  return (
    <div className="space-y-3">
      <PageActions description={nav.description} />
      <OperationalFulfilmentBoardView
        board={board}
        buckets={["awaiting_final_qaqc", "blocked_qaqc"]}
      />
    </div>
  );
}
