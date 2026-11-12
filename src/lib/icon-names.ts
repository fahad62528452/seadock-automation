export const ICON_NAMES = [
  "dashboard",
  "purchases",
  "inventory",
  "processing",
  "orders",
  "qaqc",
  "inbox",
  "reports",
  "users",
  "audit",
  "search",
  "bell",
  "menu",
  "close",
] as const;

export type IconName = (typeof ICON_NAMES)[number];
