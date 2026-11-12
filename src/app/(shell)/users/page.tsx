import type { Metadata } from "next";
import { Can } from "@/components/auth/can";
import { DataTable } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { Panel } from "@/components/ui/panel";
import { describeAccess } from "@/lib/navigation";
import { PERMISSIONS, ROLE_LABELS } from "@/lib/permissions";
import { ROLE_ORDER, type Role } from "@/types/auth";

export const metadata: Metadata = {
  title: "Users & Roles",
};

export default function UsersPage() {
  return (
    <div className="space-y-5">
      <p className="text-[12px] text-ink-muted">
        Access is defined in one place. Screen checks will use this map after authentication is connected.
      </p>
      <Panel title="Roles">
        <DataTable<Role>
          caption="Roles and access"
          columns={[
            {
              id: "role",
              header: "Role",
              className: "whitespace-nowrap font-medium",
              cell: (role) => ROLE_LABELS[role],
            },
            {
              id: "access",
              header: "Access",
              className: "whitespace-normal",
              cell: (role) => <span className="text-ink-secondary">{describeAccess(role)}</span>,
            },
          ]}
          rows={[...ROLE_ORDER]}
          getRowKey={(role) => role}
          emptyTitle="No roles defined"
          emptyDescription="Roles will be listed here."
        />
      </Panel>
      <Panel title="Accounts">
        <Can
          permission={PERMISSIONS.usersManage}
          fallback={
            <EmptyState
              title="No user accounts yet"
              description="Your role can review access. Creating accounts will be available to Super Admin after authentication is connected."
            />
          }
        >
          <EmptyState
            title="No user accounts yet"
            description="Accounts will be managed here after authentication is connected."
          />
        </Can>
      </Panel>
    </div>
  );
}
