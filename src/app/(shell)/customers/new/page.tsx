import type { Metadata } from "next";
import { createCustomerAction } from "@/app/(shell)/customer-orders/actions";
import { CustomerForm } from "@/components/customer-orders/customer-form";
import { PageHeader } from "@/components/ui/form";
import { Panel } from "@/components/ui/panel";

export const metadata: Metadata = {
  title: "Create Customer",
};

export default function NewCustomerPage() {
  return (
    <div>
      <PageHeader title="Create Customer" description="Add an operational customer master record." />
      <Panel>
        <div className="p-4">
          <CustomerForm action={createCustomerAction} submitLabel="Create Customer" />
        </div>
      </Panel>
    </div>
  );
}
