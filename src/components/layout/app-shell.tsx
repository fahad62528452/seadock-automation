"use client";

import { useEffect, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { Sidebar } from "@/components/layout/sidebar";
import { TopBar, type ShellUser } from "@/components/layout/top-bar";
import type { NotificationPreview } from "@/types/dashboard";

export function AppShell({
  user,
  notifications,
  children,
}: {
  user: ShellUser;
  notifications: NotificationPreview[];
  children: ReactNode;
}) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [navPath, setNavPath] = useState(pathname);

  if (navPath !== pathname) {
    setNavPath(pathname);
    setMobileOpen(false);
  }

  useEffect(() => {
    if (!mobileOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [mobileOpen]);

  return (
    <div className="flex h-screen overflow-hidden bg-background text-ink">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:top-3 focus:left-3 focus:z-50 focus:rounded-md focus:bg-surface focus:px-3 focus:py-2 focus:text-sm focus:shadow-sm"
      >
        Skip to content
      </a>

      <div className="hidden h-full shrink-0 border-r border-border lg:block">
        <Sidebar pathname={pathname} />
      </div>

      {mobileOpen ? (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button type="button" className="absolute inset-0 bg-black/40" aria-label="Close navigation" onClick={() => setMobileOpen(false)} />
          <div className="relative h-full w-[var(--sidebar-width)] shadow-lg">
            <Sidebar pathname={pathname} onNavigate={() => setMobileOpen(false)} />
          </div>
        </div>
      ) : null}

      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar
          pathname={pathname}
          user={user}
          notifications={notifications}
          onOpenNavigation={() => setMobileOpen(true)}
        />
        <main id="main" tabIndex={-1} className="flex-1 overflow-y-auto px-4 py-5 outline-none sm:px-6">
          {children}
        </main>
      </div>
    </div>
  );
}
