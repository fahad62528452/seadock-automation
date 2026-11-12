import type { IconName } from "@/lib/icon-names";
import { hasPermission, type Permission } from "@/lib/permissions";
import type { Role } from "@/types/auth";

export interface NavItem {
  label: string;
  permission: Permission;
  icon?: IconName;
  href?: string;
  description?: string;
  emptyTitle?: string;
  dividerBefore?: boolean;
  children?: NavItem[];
}

export const navigation: readonly NavItem[] = [
  {
    label: "Dashboard",
    href: "/",
    icon: "dashboard",
    permission: "dashboard.view",
    emptyTitle: "No dashboard data",
    description: "Operational snapshot for the current day.",
  },
  {
    label: "Purchases",
    icon: "purchases",
    permission: "purchases.view",
    children: [
      {
        label: "Vendors",
        href: "/purchases/vendors",
        permission: "purchases.view",
        emptyTitle: "No vendors yet",
        description: "Supplier master records linked to purchase orders and receiving.",
      },
      {
        label: "Purchase Orders",
        href: "/purchases/orders",
        permission: "purchases.view",
        emptyTitle: "No purchase orders yet",
        description: "Vendor purchase orders tracked through receiving and batch creation.",
      },
      {
        label: "Goods Received",
        href: "/purchases/goods-received",
        permission: "purchases.view",
        emptyTitle: "No goods receipts yet",
        description: "Receiving, incoming QAQC, and parent batch creation for each lot.",
      },
    ],
  },
  {
    label: "Inventory",
    icon: "inventory",
    permission: "inventory.view",
    children: [
      {
        label: "Inventory Overview",
        href: "/inventory",
        permission: "inventory.view",
        emptyTitle: "No inventory summary yet",
        description: "Fresh, frozen, and processed stock will be summarized here from batch balances.",
      },
      {
        label: "Batches",
        href: "/inventory/batches",
        permission: "inventory.view",
        emptyTitle: "No batches yet",
        description: "Parent batch identities created after incoming QAQC, used throughout the lifecycle.",
      },
      {
        label: "Raw Inventory",
        href: "/inventory/raw",
        permission: "inventory.view",
        emptyTitle: "No raw inventory yet",
        description: "Unprocessed parent-batch raw stock balances.",
      },
      {
        label: "Processed Inventory",
        href: "/inventory/processed",
        permission: "inventory.view",
        emptyTitle: "No processed inventory yet",
        description: "Yield stock after processing runs.",
      },
      {
        label: "Fresh Inventory",
        href: "/inventory/fresh",
        permission: "inventory.view",
        emptyTitle: "No fresh inventory yet",
        description: "Batches currently held as fresh stock will appear here.",
      },
      {
        label: "Frozen Inventory",
        href: "/inventory/frozen",
        permission: "inventory.view",
        emptyTitle: "No frozen inventory yet",
        description: "Batches currently held as frozen stock will appear here.",
      },
      {
        label: "Wastage",
        href: "/inventory/wastage",
        permission: "inventory.view",
        emptyTitle: "No wastage inventory yet",
        description: "Wastage balances recorded from processing runs.",
      },
      {
        label: "Inventory Movements",
        href: "/inventory/movements",
        permission: "inventory.view",
        emptyTitle: "No inventory movements yet",
        description: "Receipts, transfers, processing, and dispatches will be recorded against their batch.",
      },
    ],
  },
  {
    label: "Processing",
    icon: "processing",
    permission: "processing.view",
    href: "/processing",
    emptyTitle: "No processing runs yet",
    description: "Processing runs convert parent-batch raw inventory into processed yield and wastage.",
    children: [
      {
        label: "Processing Runs",
        href: "/processing",
        permission: "processing.view",
        emptyTitle: "No processing runs yet",
        description: "Production runs recorded against the source parent batch.",
      },
      {
        label: "New Processing Run",
        href: "/processing/new",
        permission: "processing.manage",
        emptyTitle: "Create a processing run",
        description: "Start processing from an eligible parent batch with available raw inventory.",
      },
    ],
  },
  {
    label: "Customer Orders",
    icon: "orders",
    permission: "customer_orders.view",
    children: [
      {
        label: "Customer POs",
        href: "/customer-orders",
        permission: "customer_orders.view",
        emptyTitle: "No customer purchase orders yet",
        description: "Customer purchase orders for intake, review, and future fulfilment preparation.",
      },
      {
        label: "Email PO Inbox",
        href: "/customer-orders/inbox",
        permission: "customer_orders.email_review",
        emptyTitle: "No email PO candidates",
        description: "Incoming email purchase-order candidates awaiting human review and confirmation.",
      },
      {
        label: "Customers",
        href: "/customers",
        permission: "customer_orders.view",
        emptyTitle: "No customers yet",
        description: "Operational customer master records used on customer purchase orders.",
      },
      {
        label: "Fulfilment Operations",
        href: "/fulfilment",
        permission: "customer_orders.view",
        emptyTitle: "No fulfilment work in the queue",
        description:
          "Warehouse board for allocation follow-up, final QAQC, dispatch, and completed fulfilments across customer POs.",
      },
      {
        label: "Pending Fulfilment",
        href: "/orders/pending",
        permission: "orders.view",
        emptyTitle: "Nothing pending fulfilment",
        description: "Redirects to the Fulfilment Operations board for open work (excludes completed).",
      },
      {
        label: "Fulfilled Orders",
        href: "/orders/fulfilled",
        permission: "orders.view",
        emptyTitle: "No fulfilled orders yet",
        description: "Redirects to the completed section on the Fulfilment Operations board.",
      },
    ],
  },
  {
    label: "QAQC",
    icon: "qaqc",
    permission: "qaqc.view",
    children: [
      {
        label: "Incoming QAQC",
        href: "/qaqc/incoming",
        permission: "qaqc.view",
        emptyTitle: "No incoming QAQC records yet",
        description: "Quality checks on goods received will be recorded against the receipt and its batch.",
      },
      {
        label: "Final QAQC",
        href: "/qaqc/final",
        permission: "qaqc.view",
        emptyTitle: "No final QAQC queue items",
        description: "Awaiting and blocked final QAQC fulfilments from the warehouse operations board.",
      },
    ],
  },
  {
    label: "Email / PO Inbox",
    href: "/customer-orders/inbox",
    icon: "inbox",
    permission: "customer_orders.email_review",
    dividerBefore: true,
    emptyTitle: "No email PO candidates",
    description: "Incoming email purchase-order candidates awaiting human review and confirmation.",
  },
  {
    label: "Reports",
    href: "/reports",
    icon: "reports",
    permission: "reports.view",
    emptyTitle: "No reports yet",
    description: "Operational reports will be added in a later step.",
  },
  {
    label: "Users & Roles",
    href: "/users",
    icon: "users",
    permission: "users.view",
    emptyTitle: "No user accounts yet",
    description: "Accounts will be managed here after authentication is connected.",
  },
  {
    label: "Email Settings",
    href: "/settings/email",
    icon: "inbox",
    permission: "email.view",
    emptyTitle: "Email provider not connected",
    description: "Connect Gmail or the mock provider for customer PO email intake.",
  },
  {
    label: "Audit History",
    href: "/audit",
    icon: "audit",
    permission: "audit.view",
    emptyTitle: "No audit history yet",
    description: "Changes to operational records will be listed here once audit storage is connected.",
  },
];

export interface NavPage {
  label: string;
  href: string;
  description: string;
  emptyTitle: string;
}

export function flattenNavigation(items: readonly NavItem[] = navigation): NavItem[] {
  return items.flatMap((item) => (item.children ? [item, ...flattenNavigation(item.children)] : [item]));
}

export function getNavItem(href: string): NavPage {
  const item = flattenNavigation().find((entry) => entry.href === href);
  if (!item?.href || !item.description || !item.emptyTitle) {
    throw new Error(`Navigation item ${href} is missing page copy.`);
  }

  return {
    label: item.label,
    href: item.href,
    description: item.description,
    emptyTitle: item.emptyTitle,
  };
}

export function visibleNavigation(role: Role, items: readonly NavItem[] = navigation): NavItem[] {
  return items.flatMap((item) => {
    if (item.children) {
      const children = visibleNavigation(role, item.children);
      if (children.length === 0) return [];
      return [{ ...item, children }];
    }

    if (item.href && hasPermission(role, item.permission)) return [item];
    return [];
  });
}

export function describeAccess(role: Role): string {
  return visibleNavigation(role)
    .map((item) => {
      if (!item.children?.length) return item.label;
      return `${item.label} (${item.children.map((child) => child.label).join(", ")})`;
    })
    .join("; ");
}

export interface Breadcrumb {
  title: string;
  crumbs: string[];
}

export function findBreadcrumb(pathname: string): Breadcrumb {
  for (const item of navigation) {
    if (item.href === pathname) {
      return { title: item.label, crumbs: [item.label] };
    }

    const child = item.children?.find((entry) => entry.href === pathname);
    if (child) {
      return { title: child.label, crumbs: [item.label, child.label] };
    }
  }

  return { title: "SeaDock", crumbs: ["SeaDock"] };
}
