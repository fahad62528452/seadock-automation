"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { Icon } from "@/components/icons";
import { initials } from "@/lib/format";
import { findBreadcrumb } from "@/lib/navigation";
import type { NotificationPreview } from "@/types/dashboard";

export interface ShellUser {
  name: string;
  email: string;
  role: string;
}

export function TopBar({
  pathname,
  user,
  notifications,
  onOpenNavigation,
}: {
  pathname: string;
  user: ShellUser;
  notifications: NotificationPreview[];
  onOpenNavigation: () => void;
}) {
  const breadcrumb = findBreadcrumb(pathname);
  const [openMenu, setOpenMenu] = useState<"notifications" | "account" | null>(null);
  const [menuPath, setMenuPath] = useState(pathname);
  const notificationsId = useId();
  const accountId = useId();
  const rootRef = useRef<HTMLElement>(null);
  const showBreadcrumb = breadcrumb.crumbs.length > 1;

  if (menuPath !== pathname) {
    setMenuPath(pathname);
    setOpenMenu(null);
  }

  useEffect(() => {
    if (!openMenu) return;

    function onPointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpenMenu(null);
      }
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpenMenu(null);
    }

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [openMenu]);

  return (
    <header
      ref={rootRef}
      className="z-20 grid shrink-0 grid-cols-[auto_minmax(0,1fr)_auto_auto] items-center gap-2 border-b border-border bg-surface px-3 py-2 lg:h-[var(--topbar-height)] lg:grid-cols-[minmax(0,1fr)_14rem_auto_auto] lg:gap-3 lg:px-4 lg:py-0"
    >
      <button
        type="button"
        className="col-start-1 row-start-1 grid size-8 place-items-center rounded-md text-ink-secondary hover:bg-surface-muted lg:hidden"
        aria-label="Open navigation"
        onClick={onOpenNavigation}
      >
        <Icon name="menu" />
      </button>

      <div className="col-start-2 row-start-1 min-w-0 lg:col-start-1">
        {showBreadcrumb ? (
          <nav aria-label="Breadcrumb" className="truncate text-[11px] leading-3 text-ink-muted">
            {breadcrumb.crumbs.map((crumb, index) => {
              const last = index === breadcrumb.crumbs.length - 1;
              return (
                <span key={`${crumb}-${index}`}>
                  {index > 0 ? <span className="px-1 text-border-strong">/</span> : null}
                  <span className={last ? "text-ink-secondary" : undefined} aria-current={last ? "page" : undefined}>
                    {crumb}
                  </span>
                </span>
              );
            })}
          </nav>
        ) : null}
        <h1 className="truncate text-[14px] font-semibold leading-5 text-ink">{breadcrumb.title}</h1>
      </div>

      <form
        role="search"
        className="relative col-span-4 row-start-2 lg:col-span-1 lg:col-start-2 lg:row-start-1"
        onSubmit={(event) => event.preventDefault()}
      >
        <label htmlFor="global-search" className="sr-only">
          Search records
        </label>
        <Icon
          name="search"
          className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-ink-muted"
        />
        <input
          id="global-search"
          type="search"
          name="q"
          placeholder="Search"
          autoComplete="off"
          aria-describedby="search-hint"
          className="h-8 w-full rounded-md border border-border bg-surface-muted pr-3 pl-8 text-[13px] text-ink outline-none placeholder:text-ink-muted focus:border-primary focus:bg-surface"
        />
        <span id="search-hint" className="sr-only">
          Search will be connected in a later step.
        </span>
      </form>

      <div className="relative">
        <button
          type="button"
          className="relative grid size-8 place-items-center rounded-md text-ink-secondary hover:bg-surface-muted"
          aria-label={
            notifications.length > 0 ? `Notifications, ${notifications.length} pending` : "Notifications"
          }
          aria-expanded={openMenu === "notifications"}
          aria-controls={notificationsId}
          onClick={() => setOpenMenu((current) => (current === "notifications" ? null : "notifications"))}
        >
          <Icon name="bell" />
          {notifications.length > 0 ? (
            <span className="absolute top-0.5 right-0.5 grid min-w-3.5 place-items-center rounded-full bg-primary px-0.5 text-[9px] leading-3.5 font-semibold text-white">
              {notifications.length}
            </span>
          ) : null}
        </button>
        {openMenu === "notifications" ? (
          <div
            id={notificationsId}
            className="absolute right-0 z-30 mt-1 w-[min(20rem,calc(100vw-1.5rem))] rounded-md border border-border bg-surface shadow-sm"
          >
            <p className="border-b border-border px-3 py-2 text-[12px] font-semibold text-ink">Notifications</p>
            {notifications.length === 0 ? (
              <p className="px-3 py-6 text-center text-[13px] text-ink-muted">No notifications</p>
            ) : (
              <ul>
                {notifications.map((item) => (
                  <li key={item.id} className="border-b border-border last:border-b-0">
                    <Link
                      href={item.href}
                      className="block px-3 py-2 hover:bg-surface-muted"
                      onClick={() => setOpenMenu(null)}
                    >
                      <span className="block text-[13px] font-medium text-ink">{item.title}</span>
                      <span className="mt-0.5 block text-[11px] leading-4 text-ink-muted">{item.detail}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : null}
      </div>

      <div className="relative">
        <button
          type="button"
          className="flex items-center gap-2 rounded-md py-0.5 pr-1.5 pl-1 hover:bg-surface-muted"
          aria-label={`Account menu for ${user.name}, ${user.role}`}
          aria-expanded={openMenu === "account"}
          aria-controls={accountId}
          onClick={() => setOpenMenu((current) => (current === "account" ? null : "account"))}
        >
          <span className="grid size-7 place-items-center rounded-full bg-primary-subtle text-[11px] font-semibold text-primary-text">
            {initials(user.name)}
          </span>
          <span className="hidden text-left sm:block">
            <span className="block text-[12px] leading-4 font-medium text-ink">{user.name}</span>
            <span className="block text-[10px] leading-3 text-ink-muted">{user.role}</span>
          </span>
        </button>
        {openMenu === "account" ? (
          <div id={accountId} className="absolute right-0 z-30 mt-1 w-64 rounded-md border border-border bg-surface p-3 shadow-sm">
            <p className="text-[13px] font-medium text-ink">{user.name}</p>
            <p className="text-[12px] text-ink-secondary">{user.role}</p>
            <p className="mt-0.5 text-[12px] text-ink-muted">{user.email}</p>
            <p className="mt-3 border-t border-border pt-3 text-[12px] leading-5 text-ink-muted">
              Account actions will be available when authentication is connected.
            </p>
          </div>
        ) : null}
      </div>
    </header>
  );
}
