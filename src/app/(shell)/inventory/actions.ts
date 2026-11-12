"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requirePermission, toUserMessage } from "@/lib/authz";
import { PERMISSIONS } from "@/lib/permissions";
import { freezeEligibleInventory } from "@/services/inventory/inventory-service";

function formString(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

export async function freezeEligibleInventoryAction(formData: FormData): Promise<void> {
  const returnTo = formString(formData, "returnTo") || "/inventory";

  try {
    const session = requirePermission(PERMISSIONS.inventoryManage);
    await freezeEligibleInventory(session.name, session.id);
    revalidatePath("/inventory");
    revalidatePath("/inventory/fresh");
    revalidatePath("/inventory/frozen");
    revalidatePath("/inventory/raw");
    revalidatePath("/inventory/processed");
    revalidatePath("/inventory/wastage");
    revalidatePath("/inventory/movements");
    revalidatePath("/inventory/batches");
    revalidatePath("/");
  } catch (error) {
    const message = encodeURIComponent(toUserMessage(error, "Unable to freeze inventory."));
    redirect(`${returnTo}?error=${message}`);
  }

  const separator = returnTo.includes("?") ? "&" : "?";
  redirect(`${returnTo}${separator}frozen=1`);
}
