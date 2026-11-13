import type { InventoryType } from "@/types/database";
import type { LifecycleState } from "@/types/inventory";

const INVENTORY_TYPES: InventoryType[] = ["raw", "processed", "frozen", "wastage"];
const LIFECYCLE_STATES: LifecycleState[] = ["fresh", "frozen", "wastage"];

const controlClass =
  "mt-1 h-8 w-full rounded-md border border-border bg-surface px-2.5 text-[13px]";

export function InventoryFilters({
  search = "",
  inventoryType = "",
  lifecycle = "",
  lockInventoryType,
  lockLifecycle,
}: {
  search?: string;
  inventoryType?: string;
  lifecycle?: string;
  lockInventoryType?: InventoryType;
  lockLifecycle?: LifecycleState;
}) {
  const typeValue = lockInventoryType ?? inventoryType;
  const lifecycleValue = lockLifecycle ?? lifecycle;

  return (
    <form className="flex flex-col gap-2 border-b border-border px-3 py-2.5 md:flex-row md:flex-wrap md:items-end sm:px-4">
      <label className="min-w-[12rem] flex-1 text-[11px] font-medium text-ink-muted">
        Search
        <input
          name="q"
          defaultValue={search}
          placeholder="Batch, product, or item id"
          className={controlClass}
        />
      </label>
      {lockInventoryType ? (
        <input type="hidden" name="type" value={lockInventoryType} />
      ) : (
        <label className="text-[11px] font-medium text-ink-muted">
          Type
          <select name="type" defaultValue={typeValue} className={controlClass}>
            <option value="">All</option>
            {INVENTORY_TYPES.map((type) => (
              <option key={type} value={type}>
                {type.charAt(0).toUpperCase() + type.slice(1)}
              </option>
            ))}
          </select>
        </label>
      )}
      {lockLifecycle ? (
        <input type="hidden" name="lifecycle" value={lockLifecycle} />
      ) : (
        <label className="text-[11px] font-medium text-ink-muted">
          Lifecycle
          <select name="lifecycle" defaultValue={lifecycleValue} className={controlClass}>
            <option value="">All</option>
            {LIFECYCLE_STATES.map((state) => (
              <option key={state} value={state}>
                {state.charAt(0).toUpperCase() + state.slice(1)}
              </option>
            ))}
          </select>
        </label>
      )}
      <button
        type="submit"
        className="inline-flex h-8 items-center rounded-md border border-border bg-surface px-3 text-[13px] font-medium text-ink hover:bg-surface-muted"
      >
        Apply
      </button>
    </form>
  );
}
