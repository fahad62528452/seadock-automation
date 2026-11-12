import type { InventoryType } from "@/types/database";
import type { InventoryListFilters, LifecycleState } from "@/types/inventory";

export function parseInventorySearchParams(
  params: Record<string, string | string[] | undefined>,
  defaults: InventoryListFilters = {},
) {
  const search = typeof params.q === "string" ? params.q : "";
  const type = typeof params.type === "string" ? params.type : "";
  const lifecycle = typeof params.lifecycle === "string" ? params.lifecycle : "";

  const filters: InventoryListFilters = { ...defaults };
  if (search) filters.search = search;
  if (type) filters.inventoryType = type as InventoryType;
  if (lifecycle) filters.lifecycle = lifecycle as LifecycleState;

  return { search, type, lifecycle, filters };
}
