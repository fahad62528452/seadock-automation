import type { Metadata } from "next";
import { ModulePage } from "@/components/layout/module-page";
import { getNavItem } from "@/lib/navigation";

const page = getNavItem("/qaqc/incoming");

export const metadata: Metadata = {
  title: page.label,
};

export default function Page() {
  return <ModulePage title={page.emptyTitle} description={page.description} />;
}
