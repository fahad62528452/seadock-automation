"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Icon } from "@/components/icons";
import { cn } from "@/lib/cn";
import {
  isNavHrefActive,
  navigationSections,
  sectionContainsPath,
  type NavItem,
  type NavSection,
} from "@/lib/navigation";

function NavAnchor({
  item,
  pathname,
  search,
  onNavigate,
}: {
  item: NavItem;
  pathname: string;
  search: string;
  onNavigate?: () => void;
}) {
  const href = item.href ?? "/";
  const hrefPath = href.split("?")[0] ?? href;
  const hrefQuery = href.includes("?") ? href.slice(href.indexOf("?") + 1) : "";

  let active = false;
  if (hrefQuery) {
    active = pathname === hrefPath && search === hrefQuery;
  } else if (hrefPath === "/fulfilment") {
    // Fulfilment board (no bucket) — not active when a dispatch filter is applied
    active =
      (pathname === "/fulfilment" || pathname.startsWith("/fulfilment/")) &&
      !search.includes("bucket=ready_to_dispatch");
  } else {
    active = isNavHrefActive(href, pathname);
  }

  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      onClick={onNavigate}
      className={cn(
        "flex items-center gap-2 rounded-md px-2.5 py-[6px] text-[13px] text-ink-secondary hover:bg-surface-muted hover:text-ink",
        active && "bg-primary-subtle font-medium text-primary-text hover:bg-primary-subtle hover:text-primary-text",
      )}
    >
      {item.icon ? <Icon name={item.icon} className="size-3.5 shrink-0 opacity-80" /> : null}
      <span className="truncate">{item.label}</span>
    </Link>
  );
}

function SectionBlock({
  section,
  pathname,
  search,
  defaultOpen,
  onNavigate,
}: {
  section: NavSection;
  pathname: string;
  search: string;
  defaultOpen: boolean;
  onNavigate?: () => void;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const isOverview = section.id === "overview";

  if (isOverview) {
    return (
      <div className="space-y-0.5">
        <p className="px-2.5 pb-1 pt-1 text-[11px] font-semibold tracking-wide text-ink-muted uppercase">
          {section.label}
        </p>
        <ul className="space-y-0.5">
          {section.items.map((item) => (
            <li key={item.href ?? item.label}>
              <NavAnchor item={item} pathname={pathname} search={search} onNavigate={onNavigate} />
            </li>
          ))}
        </ul>
      </div>
    );
  }

  return (
    <div>
      <button
        type="button"
        className="flex w-full items-center justify-between rounded-md px-2.5 py-1.5 text-left hover:bg-surface-muted"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <span className="text-[11px] font-semibold tracking-wide text-ink-muted uppercase">{section.label}</span>
        <span className={cn("text-[10px] text-ink-muted transition-transform", open && "rotate-90")} aria-hidden>
          ▸
        </span>
      </button>
      {open ? (
        <ul className="mt-0.5 space-y-0.5">
          {section.items.map((item) => (
            <li key={`${item.label}-${item.href}`}>
              <NavAnchor item={item} pathname={pathname} search={search} onNavigate={onNavigate} />
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

export function Sidebar({ pathname, onNavigate }: { pathname: string; onNavigate?: () => void }) {
  const searchParams = useSearchParams();
  const search = searchParams.toString();

  const sections = useMemo(() => navigationSections, []);

  return (
    <div className="flex h-full w-[var(--sidebar-width)] flex-col border-r border-border bg-surface">
      <div className="flex h-[var(--topbar-height)] items-center gap-2.5 border-b border-border px-4">
        <svg viewBox="0 0 32 32" className="size-7 shrink-0" aria-hidden="true">
          <rect width="32" height="32" rx="6" fill="#1858c7" />
          <path
            d="M6.5 13.2c2.2-2.6 4.1-2.6 6.1 0s3.9 2.6 6.1 0 3.9-2.6 6.1 0"
            fill="none"
            stroke="white"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
          <path
            d="M6.5 19c2.2-2.6 4.1-2.6 6.1 0s3.9 2.6 6.1 0 3.9-2.6 6.1 0"
            fill="none"
            stroke="white"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
        </svg>
        <div className="min-w-0">
          <span className="block text-[14px] font-semibold tracking-tight text-ink">SeaDock</span>
          <span className="block text-[11px] leading-3 text-ink-muted">Operations</span>
        </div>
      </div>
      <nav aria-label="Primary" className="flex-1 overflow-y-auto px-2 py-2">
        <div className="space-y-2">
          {sections.map((section) => (
            <SectionBlock
              key={section.id}
              section={section}
              pathname={pathname}
              search={search}
              defaultOpen={sectionContainsPath(section, pathname) || section.id === "overview"}
              onNavigate={onNavigate}
            />
          ))}
        </div>
      </nav>
    </div>
  );
}
