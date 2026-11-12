import type { Metadata } from "next";
import { ReceivingForm } from "@/components/procurement/receiving-form";
import { Alert, PageHeader } from "@/components/ui/form";
import { Panel } from "@/components/ui/panel";
import { completeReceivingAction } from "@/app/(shell)/purchases/actions";
import { requirePermission } from "@/lib/authz";
import { hasPermission, PERMISSIONS } from "@/lib/permissions";
import { getSession } from "@/services/auth/get-session";
import { getPurchaseOrder, listOpenPurchaseOrders } from "@/services/procurement/procurement-service";

export const metadata: Metadata = {
  title: "Receive Goods",
};

export default async function NewGoodsReceiptPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  requirePermission(PERMISSIONS.purchasesManage);
  requirePermission(PERMISSIONS.qaqcManage);

  const params = searchParams ? await searchParams : {};
  const preferredPoId = typeof params.po === "string" ? params.po : undefined;
  const openOrders = await listOpenPurchaseOrders();

  if (preferredPoId && !openOrders.some((order) => order.id === preferredPoId)) {
    const preferred = await getPurchaseOrder(preferredPoId);
    if (preferred && ["issued", "partially_received", "confirmed", "awaiting_verification"].includes(preferred.status)) {
      openOrders.unshift(preferred);
    }
  }

  const ordered = preferredPoId
    ? [...openOrders].sort((a, b) => Number(b.id === preferredPoId) - Number(a.id === preferredPoId))
    : openOrders;

  const session = getSession();
  const canOverride = ["super_admin", "manager", "warehouse_manager"].includes(session.role);

  return (
    <div>
      <PageHeader
        title="Receive Goods"
        description="Capture receiving details, complete incoming QAQC, and create the parent batch in one operation."
      />
      <Panel>
        <div className="p-4">
          {ordered.length === 0 ? (
            <Alert tone="error">No open purchase orders are available for receiving.</Alert>
          ) : (
            <ReceivingForm action={completeReceivingAction} purchaseOrders={ordered} canOverride={canOverride && hasPermission(session.role, PERMISSIONS.purchasesManage)} />
          )}
        </div>
      </Panel>
    </div>
  );
}
