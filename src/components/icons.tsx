import type { ReactNode } from "react";
import type { IconName } from "@/lib/icon-names";

const paths: Record<IconName, ReactNode> = {
  dashboard: (
    <>
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
    </>
  ),
  purchases: (
    <>
      <path d="M8 7V6a4 4 0 0 1 8 0v1" />
      <rect x="4" y="7" width="16" height="13" rx="1.5" />
      <path d="M9 12h6" />
    </>
  ),
  inventory: (
    <>
      <path d="M12 3 4 7.5 12 12l8-4.5L12 3Z" />
      <path d="M4 12.5 12 17l8-4.5" />
      <path d="M4 16.5 12 21l8-4.5" />
    </>
  ),
  processing: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 3.5v2.2M12 18.3v2.2M3.5 12h2.2M18.3 12h2.2M6 6l1.6 1.6M16.4 16.4 18 18M18 6l-1.6 1.6M7.6 16.4 6 18" />
    </>
  ),
  orders: (
    <>
      <path d="M7 3.5h7l4 4V20a1.5 1.5 0 0 1-1.5 1.5h-9.5A1.5 1.5 0 0 1 5.5 20V5A1.5 1.5 0 0 1 7 3.5Z" />
      <path d="M14 3.5V8h4.5M8.5 12h7M8.5 16h5" />
    </>
  ),
  qaqc: (
    <>
      <circle cx="12" cy="12" r="8" />
      <path d="m8.5 12.2 2.3 2.3 4.7-5" />
    </>
  ),
  inbox: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="1.5" />
      <path d="m4 7 8 6 8-6" />
    </>
  ),
  reports: (
    <>
      <path d="M4 19.5h16" />
      <path d="M7 16.5v-4M12 16.5V8M17 16.5v-6" />
    </>
  ),
  users: (
    <>
      <circle cx="9" cy="9" r="3" />
      <path d="M4.5 18.5c.6-2.4 2.4-3.8 4.5-3.8s3.9 1.4 4.5 3.8" />
      <circle cx="16.5" cy="9.5" r="2.2" />
      <path d="M16 14.8c1.6.2 2.9 1.2 3.5 3.2" />
    </>
  ),
  audit: (
    <>
      <circle cx="12" cy="12" r="8" />
      <path d="M12 8v4.2l2.8 1.6" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="6" />
      <path d="m16 16 4 4" />
    </>
  ),
  bell: (
    <>
      <path d="M6 16.5h12l-1.2-2.1V11a4.8 4.8 0 0 0-9.6 0v3.4L6 16.5Z" />
      <path d="M10 18.2a2 2 0 0 0 4 0" />
    </>
  ),
  menu: (
    <>
      <path d="M4 7h16M4 12h16M4 17h16" />
    </>
  ),
  close: (
    <>
      <path d="M6 6l12 12M18 6 6 18" />
    </>
  ),
};

export function Icon({ name, className = "size-4" }: { name: IconName; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {paths[name]}
    </svg>
  );
}
