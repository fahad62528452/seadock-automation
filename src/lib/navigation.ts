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

export interface NavSection {
  id: string;
  label: string;
  items: readonly NavItem[];
}

/** Sidebar IA for Step 11A — presentation-oriented ERP hierarchy. */
export const navigationSections: readonly NavSection[] = [
  {
    id: "overview",
    label: "Overview",
    items: [
      {
        label: "Dashboard",
        href: "/",
        icon: "dashboard",
        permission: "dashboard.view",
        emptyTitle: "No dashboard data",
        description: "Operational attention for customer POs, allocation, QAQC, and dispatch.",
      },
    ],
  },
  {
    id: "procurement",
    label: "Procurement",
    items: [
      {
        label: "Vendors",
        href: "/purchases/vendors",
        icon: "purchases",
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
    id: "inventory",
    label: "Inventory",
    items: [
      {
        label: "Inventory",
        href: "/inventory",
        icon: "inventory",
        permission: "inventory.view",
        emptyTitle: "No inventory summary yet",
        description: "Stock balances by type with available, reserved, and total quantities.",
      },
      {
        label: "Batches",
        href: "/inventory/batches",
        permission: "inventory.view",
        emptyTitle: "No batches yet",
        description: "Parent batch identities used throughout receiving, processing, and fulfilment.",
      },
      {
        label: "Fresh",
        href: "/inventory/fresh",
        permission: "inventory.view",
        emptyTitle: "No fresh inventory yet",
        description: "Raw and processed stock still inside the fresh window.",
      },
      {
        label: "Frozen",
        href: "/inventory/frozen",
        permission: "inventory.view",
        emptyTitle: "No frozen inventory yet",
        description: "Stock reclassified as frozen.",
      },
      {
        label: "Wastage",
        href: "/inventory/wastage",
        permission: "inventory.view",
        emptyTitle: "No wastage inventory yet",
        description: "Wastage balances recorded from processing runs.",
      },
      {
        label: "Movements",
        href: "/inventory/movements",
        permission: "inventory.view",
        emptyTitle: "No inventory movements yet",
        description: "Receipts, processing, reservations, freezes, and dispatches by batch.",
      },
    ],
  },
  {
    id: "production",
    label: "Production",
    items: [
      {
        label: "Processing",
        href: "/processing",
        icon: "processing",
        permission: "processing.view",
        emptyTitle: "No processing runs yet",
        description: "Convert parent-batch raw inventory into processed yield and wastage.",
      },
      {
        label: "Processing QAQC",
        href: "/processing/qaqc",
        permission: "processing.view",
        emptyTitle: "No processing QAQC yet",
        description: "Quality checks recorded on processing runs.",
      },
    ],
  },
  {
    id: "sales",
    label: "Sales & Fulfilment",
    items: [
      {
        label: "Customer POs",
        href: "/customer-orders",
        icon: "orders",
        permission: "customer_orders.view",
        emptyTitle: "No customer purchase orders yet",
        description: "Receive, approve, allocate, fulfil, and dispatch customer demand.",
      },
      {
        label: "Fulfilment",
        href: "/fulfilment",
        permission: "customer_orders.view",
        emptyTitle: "No fulfilment work in the queue",
        description: "Warehouse board for fulfilment, final QAQC, and dispatch.",
      },
      {
        label: "Final QAQC",
        href: "/qaqc/final",
        icon: "qaqc",
        permission: "qaqc.view",
        emptyTitle: "No final QAQC queue items",
        description: "Fulfilments awaiting or blocked on final quality checks.",
      },
      {
        label: "Dispatch",
        href: "/fulfilment?bucket=ready_to_dispatch",
        permission: "customer_orders.view",
        emptyTitle: "Nothing ready to dispatch",
        description: "Fulfilments that passed final QAQC and are ready to leave the warehouse.",
      },
    ],
  },
  {
    id: "administration",
    label: "Administration",
    items: [
      {
        label: "Users & Roles",
        href: "/users",
        icon: "users",
        permission: "users.view",
        emptyTitle: "No user accounts yet",
        description: "Accounts will be managed here after authentication is connected.",
      },
      {
        label: "Audit History",
        href: "/audit",
        icon: "audit",
        permission: "audit.view",
        emptyTitle: "No audit history yet",
        description: "Changes to operational records once audit storage is connected.",
      },
      {
        label: "Email / PO Inbox",
        href: "/customer-orders/inbox",
        icon: "inbox",
        permission: "customer_orders.email_review",
        emptyTitle: "No email PO candidates",
        description: "Incoming email purchase-order candidates awaiting review.",
      },
      {
        label: "Settings",
        href: "/settings/email",
        permission: "email.view",
        emptyTitle: "Email provider not connected",
        description: "Connect Gmail or the mock provider for customer PO email intake.",
      },
    ],
  },
];

/** Flat sidebar-compatible list (sections flattened) for helpers that expect NavItem[]. */
export const navigation: readonly NavItem[] = navigationSections.flatMap((section) =>
  section.items.map((item) => ({ ...item })),
);

/**
 * Extra page copy for routes reachable outside the sidebar (tabs, redirects, legacy links).
 * Kept so getNavItem() continues to resolve.
 */
const orphanPages: readonly NavItem[] = [
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
    label: "Incoming QAQC",
    href: "/qaqc/incoming",
    permission: "qaqc.view",
    emptyTitle: "No incoming QAQC records yet",
    description: "Quality checks on goods received against the receipt and its batch.",
  },
  {
    label: "Customers",
    href: "/customers",
    permission: "customer_orders.view",
    emptyTitle: "No customers yet",
    description: "Operational customer master records used on customer purchase orders.",
  },
  {
    label: "Reports",
    href: "/reports",
    permission: "reports.view",
    emptyTitle: "No reports yet",
    description: "Operational reports will be added in a later step.",
  },
  {
    label: "New Processing Run",
    href: "/processing/new",
    permission: "processing.manage",
    emptyTitle: "Create a processing run",
    description: "Start processing from an eligible parent batch with available raw inventory.",
  },
  {
    label: "Email Settings",
    href: "/settings/email",
    permission: "email.view",
    emptyTitle: "Email provider not connected",
    description: "Connect Gmail or the mock provider for customer PO email intake.",
  },
  {
    label: "Fulfilment",
    href: "/fulfilment",
    permission: "customer_orders.view",
    emptyTitle: "No fulfilment work in the queue",
    description: "Warehouse board for fulfilment, final QAQC, and dispatch.",
  },
];

export interface NavPage {
  label: string;
  href: string;
  description: string;
  emptyTitle: string;
}

function allNavItems(): NavItem[] {
  return [...flattenNavigation(navigation), ...orphanPages];
}

export function flattenNavigation(items: readonly NavItem[] = navigation): NavItem[] {
  return items.flatMap((item) => (item.children ? [item, ...flattenNavigation(item.children)] : [item]));
}

export function getNavItem(href: string): NavPage {
  const normalized = href.split("?")[0] ?? href;
  const item = allNavItems().find((entry) => entry.href?.split("?")[0] === normalized);
  if (!item?.href || !item.description || !item.emptyTitle) {
    throw new Error(`Navigation item ${href} is missing page copy.`);
  }

  return {
    label: item.label,
    href: item.href.split("?")[0] ?? item.href,
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

export function visibleNavigationSections(role: Role): NavSection[] {
  return navigationSections
    .map((section) => ({
      ...section,
      items: visibleNavigation(role, section.items),
    }))
    .filter((section) => section.items.length > 0);
}

export function describeAccess(role: Role): string {
  return visibleNavigationSections(role)
    .map((section) => `${section.label} (${section.items.map((item) => item.label).join(", ")})`)
    .join("; ");
}

export interface Breadcrumb {
  title: string;
  crumbs: string[];
}

function pathWithoutQuery(pathname: string): string {
  return pathname.split("?")[0] ?? pathname;
}

function navHrefPath(href: string): string {
  return href.split("?")[0] ?? href;
}

/** Match exact path first, then longest prefix for detail routes. */
export function findBreadcrumb(pathname: string): Breadcrumb {
  const path = pathWithoutQuery(pathname);

  for (const section of navigationSections) {
    for (const item of section.items) {
      if (!item.href) continue;
      if (navHrefPath(item.href) === path) {
        return { title: item.label, crumbs: [section.label, item.label] };
      }
    }
  }

  let best: { sectionLabel: string; item: NavItem; hrefPath: string } | null = null;
  for (const section of navigationSections) {
    for (const item of section.items) {
      if (!item.href) continue;
      const hrefPath = navHrefPath(item.href);
      if (hrefPath === "/") continue;
      if (path === hrefPath || path.startsWith(`${hrefPath}/`)) {
        if (!best || hrefPath.length > best.hrefPath.length) {
          best = { sectionLabel: section.label, item, hrefPath };
        }
      }
    }
  }

  if (best) {
    const detailSegment = path.slice(best.hrefPath.length).replace(/^\//, "").split("/")[0];
    if (detailSegment && path !== best.hrefPath) {
      return {
        title: detailSegment,
        crumbs: [best.sectionLabel, best.item.label, detailSegment],
      };
    }
    return { title: best.item.label, crumbs: [best.sectionLabel, best.item.label] };
  }

  for (const orphan of orphanPages) {
    if (!orphan.href) continue;
    const hrefPath = navHrefPath(orphan.href);
    if (path === hrefPath || (hrefPath !== "/" && path.startsWith(`${hrefPath}/`))) {
      return { title: orphan.label, crumbs: [orphan.label] };
    }
  }

  return { title: "SeaDock", crumbs: ["SeaDock"] };
}

/** Whether a section contains the active path (for default-expanded sidebar groups). */
export function sectionContainsPath(section: NavSection, pathname: string): boolean {
  const path = pathWithoutQuery(pathname);
  return section.items.some((item) => {
    if (!item.href) return false;
    const hrefPath = navHrefPath(item.href);
    if (hrefPath === "/") return path === "/";
    return path === hrefPath || path.startsWith(`${hrefPath}/`);
  });
}

export function isNavHrefActive(href: string, pathname: string): boolean {
  const path = pathWithoutQuery(pathname);
  const hrefPath = navHrefPath(href);
  if (hrefPath === "/") return path === "/";
  if (href.includes("?")) {
    // Query-bearing links (e.g. Dispatch) only active on exact board filter intent via path match of fulfilment
    return path === hrefPath;
  }
  return path === hrefPath || path.startsWith(`${hrefPath}/`);
}
