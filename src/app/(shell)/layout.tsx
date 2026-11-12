import { Shell } from "@/components/layout/shell";

/** Shell uses client pathname for nav highlighting; allow request-time rendering. */
export const instant = false;

export default function ShellLayout({ children }: LayoutProps<"/">) {
  return <Shell>{children}</Shell>;
}
