import Link from "next/link";
import { cn } from "@/lib/cn";

const TABS = [
  { href: "/inventory", label: "All", match: (path: string) => path === "/inventory" },
  { href: "/inventory/raw", label: "Raw", match: (path: string) => path.startsWith("/inventory/raw") },
  { href: "/inventory/processed", label: "Processed", match: (path: string) => path.startsWith("/inventory/processed") },
  { href: "/inventory/fresh", label: "Fresh", match: (path: string) => path.startsWith("/inventory/fresh") },
  { href: "/inventory/frozen", label: "Frozen", match: (path: string) => path.startsWith("/inventory/frozen") },
  { href: "/inventory/wastage", label: "Wastage", match: (path: string) => path.startsWith("/inventory/wastage") },
  { href: "/inventory/batches", label: "Batches", match: (path: string) => path.startsWith("/inventory/batches") },
  { href: "/inventory/movements", label: "Movements", match: (path: string) => path.startsWith("/inventory/movements") },
] as const;

export function InventoryModuleTabs({ pathname }: { pathname: string }) {
  return (
    <nav aria-label="Inventory views" className="mb-3 flex gap-1 overflow-x-auto border-b border-border">
      {TABS.map((tab) => {
        const active = tab.match(pathname);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "-mb-px shrink-0 border-b-2 px-3 py-2 text-[12px] font-medium whitespace-nowrap",
              active
                ? "border-primary text-primary-text"
                : "border-transparent text-ink-muted hover:text-ink",
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
