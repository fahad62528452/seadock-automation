import { freezeEligibleInventoryAction } from "@/app/(shell)/inventory/actions";

export function FreezeInventoryForm({ returnTo }: { returnTo: string }) {
  return (
    <form action={freezeEligibleInventoryAction}>
      <input type="hidden" name="returnTo" value={returnTo} />
      <button
        type="submit"
        className="inline-flex h-9 items-center rounded-md bg-primary px-3 text-[13px] font-medium text-white hover:bg-primary-hover"
      >
        Freeze eligible stock
      </button>
    </form>
  );
}
