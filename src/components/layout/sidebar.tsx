"use client";

import Link from "next/link";
import { Icon } from "@/components/icons";
import { cn } from "@/lib/cn";
import { navigation, type NavItem } from "@/lib/navigation";

function NavAnchor({
  item,
  pathname,
  nested = false,
  onNavigate,
}: {
  item: NavItem;
  pathname: string;
  nested?: boolean;
  onNavigate?: () => void;
}) {
  const href = item.href ?? "/";
  const active = pathname === href;

  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      onClick={onNavigate}
      className={cn(
        "flex items-center gap-2 rounded-md py-[7px] text-[13px] text-ink-secondary hover:bg-surface-muted hover:text-ink",
        nested ? "pl-8 pr-2.5" : "px-2.5",
        active && "bg-primary-subtle font-medium text-primary-text hover:bg-primary-subtle hover:text-primary-text",
      )}
    >
      {item.icon ? <Icon name={item.icon} className="size-4 shrink-0" /> : null}
      <span className="truncate">{item.label}</span>
    </Link>
  );
}

export function Sidebar({ pathname, onNavigate }: { pathname: string; onNavigate?: () => void }) {
  return (
    <div className="flex h-full w-[var(--sidebar-width)] flex-col bg-surface">
      <div className="flex h-[var(--topbar-height)] items-center gap-2.5 border-b border-border px-4">
        <svg viewBox="0 0 32 32" className="size-8 shrink-0" aria-hidden="true">
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
        <span className="text-[15px] font-semibold tracking-tight text-ink">SeaDock</span>
      </div>
      <nav aria-label="Primary" className="flex-1 overflow-y-auto px-2 py-3">
        <ul className="space-y-0.5">
          {navigation.map((item) => (
            <li key={item.label} className={item.dividerBefore ? "mt-3 border-t border-border pt-3" : undefined}>
              {item.children ? (
                <div>
                  <div className="flex items-center gap-2 px-2.5 pb-1 pt-2 text-[12px] font-semibold text-ink">
                    {item.icon ? <Icon name={item.icon} className="size-4 text-ink-secondary" /> : null}
                    {item.label}
                  </div>
                  <ul>
                    {item.children.map((child) => (
                      <li key={child.href}>
                        <NavAnchor item={child} pathname={pathname} nested onNavigate={onNavigate} />
                      </li>
                    ))}
                  </ul>
                </div>
              ) : (
                <NavAnchor item={item} pathname={pathname} onNavigate={onNavigate} />
              )}
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}
