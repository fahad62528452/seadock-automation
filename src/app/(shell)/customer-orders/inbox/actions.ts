"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requirePermission, toUserMessage } from "@/lib/authz";
import { PERMISSIONS } from "@/lib/permissions";
import {
  confirmEmailPoCandidate,
  ignoreEmailPoCandidate,
  markEmailPoCandidateActionRequired,
  retryEmailPoExtraction,
  syncEmailInbox,
} from "@/services/email/email-intake-service";
import type { ConfirmEmailPoInput, EmailActionRequiredReason } from "@/types/email";

export type InboxActionState = {
  ok: boolean;
  message?: string;
  fieldErrors?: Record<string, string>;
};

function formString(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

export async function syncInboxAction(): Promise<InboxActionState> {
  try {
    requirePermission(PERMISSIONS.emailManage);
    const summary = await syncEmailInbox();
    revalidatePath("/customer-orders/inbox");
    revalidatePath("/settings/email");
    revalidatePath("/");
    return {
      ok: true,
      message: `Sync completed · checked ${summary.messagesChecked}, new ${summary.newMessages}, candidates ${summary.poCandidates}.`,
    };
  } catch (error) {
    return { ok: false, message: toUserMessage(error, "Sync failed.") };
  }
}

export async function ignoreCandidateAction(
  candidateId: string,
  _prev: InboxActionState,
  formData: FormData,
): Promise<InboxActionState> {
  try {
    requirePermission(PERMISSIONS.customerOrdersEmailReview);
    const reason = formString(formData, "reason") || "Ignored by operator";
    await ignoreEmailPoCandidate(candidateId, reason);
  } catch (error) {
    return { ok: false, message: toUserMessage(error, "Unable to ignore candidate.") };
  }
  revalidatePath("/customer-orders/inbox");
  revalidatePath(`/customer-orders/inbox/${candidateId}`);
  redirect("/customer-orders/inbox?ignored=1");
}

export async function markActionRequiredAction(
  candidateId: string,
  _prev: InboxActionState,
  formData: FormData,
): Promise<InboxActionState> {
  try {
    requirePermission(PERMISSIONS.customerOrdersEmailReview);
    const reason = (formString(formData, "reason") || "manual_review_required") as EmailActionRequiredReason;
    await markEmailPoCandidateActionRequired(candidateId, [reason]);
  } catch (error) {
    return { ok: false, message: toUserMessage(error, "Unable to mark action required.") };
  }
  revalidatePath("/customer-orders/inbox");
  revalidatePath(`/customer-orders/inbox/${candidateId}`);
  return { ok: true, message: "Marked action required." };
}

export async function retryExtractionAction(candidateId: string): Promise<InboxActionState> {
  try {
    requirePermission(PERMISSIONS.customerOrdersEmailReview);
    await retryEmailPoExtraction(candidateId);
    revalidatePath(`/customer-orders/inbox/${candidateId}`);
    revalidatePath("/customer-orders/inbox");
    return { ok: true, message: "Extraction retried." };
  } catch (error) {
    return { ok: false, message: toUserMessage(error, "Retry extraction failed.") };
  }
}

export async function confirmCandidateAction(
  candidateId: string,
  _prev: InboxActionState,
  formData: FormData,
): Promise<InboxActionState> {
  let poId = "";
  try {
    requirePermission(PERMISSIONS.customerOrdersEmailReview);
    const itemCount = Number(formString(formData, "itemCount") || "0");
    const input: ConfirmEmailPoInput = {
      customerId: formString(formData, "customerId"),
      poNumber: formString(formData, "poNumber"),
      poDate: formString(formData, "poDate"),
      receivedAt: formString(formData, "receivedAt"),
      requiredDeliveryDate: formString(formData, "requiredDeliveryDate"),
      priority: (formString(formData, "priority") || "normal") as ConfirmEmailPoInput["priority"],
      notes: formString(formData, "notes"),
      items: Array.from({ length: itemCount }, (_, index) => ({
        productName: formString(formData, `items.${index}.productName`),
        species: formString(formData, `items.${index}.species`),
        productCode: formString(formData, `items.${index}.productCode`),
        quantity: Number(formString(formData, `items.${index}.quantity`) || "0"),
        unit: formString(formData, `items.${index}.unit`) || "kg",
        requiredDeliveryDate: formString(formData, `items.${index}.requiredDeliveryDate`),
        specifications: formString(formData, `items.${index}.specifications`),
        notes: formString(formData, `items.${index}.notes`),
      })),
    };
    const created = await confirmEmailPoCandidate(candidateId, input);
    poId = created.customerPurchaseOrderId;
  } catch (error) {
    return { ok: false, message: toUserMessage(error, "Unable to confirm customer PO.") };
  }

  revalidatePath("/customer-orders/inbox");
  revalidatePath("/customer-orders");
  revalidatePath("/");
  redirect(`/customer-orders/${poId}?created=1`);
}
