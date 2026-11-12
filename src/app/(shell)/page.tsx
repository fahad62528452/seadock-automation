import type { Metadata } from "next";
import { Suspense } from "react";
import { DashboardSkeleton } from "@/components/dashboard/dashboard-skeleton";
import { DashboardView } from "@/components/dashboard/dashboard-view";
import { getDashboardSummary } from "@/services/dashboard/get-dashboard";

export const metadata: Metadata = {
  title: "Dashboard",
};

export default function DashboardPage() {
  return (
    <Suspense fallback={<DashboardSkeleton />}>
      <DashboardContent />
    </Suspense>
  );
}

async function DashboardContent() {
  const summary = await getDashboardSummary();
  return <DashboardView summary={summary} />;
}
