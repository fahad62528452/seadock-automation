import type { Metadata } from "next";
import Link from "next/link";
import { createCustomerPoAction } from "@/app/(shell)/customer-orders/actions";
import { CustomerPoForm } from "@/components/customer-orders/customer-po-form";
import { Alert, PageHeader } from "@/components/ui/form";
import { Panel } from "@/components/ui/panel";
import { listCustomers } from "@/services/customer-orders/customer-order-service";

export const metadata: Metadata = {
  title: "Create Customer PO",
};

export default async function NewCustomerPoPage() {
  const customers = await listCustomers();

  return (
    <div>
      <PageHeader
        title="Create Customer Purchase Order"
        description="Manual customer PO intake. Email-sourced POs will use the same core model later."
        actions={
          <Link
            href="/customers/new"
            className="inline-flex h-9 items-center rounded-md border border-border bg-surface px-3 text-[13px] font-medium text-ink hover:bg-surface-muted"
          >
            New Customer
          </Link>
        }
      />
      {!customers.length ? (
        <Alert tone="info">
          Create a customer first, then return here to raise a purchase order.{" "}
          <Link href="/customers/new" className="text-primary-text hover:underline">
            Create customer
          </Link>
        </Alert>
      ) : (
        <Panel>
          <div className="p-4">
            <CustomerPoForm action={createCustomerPoAction} customers={customers} />
          </div>
        </Panel>
      )}
    </div>
  );
}
