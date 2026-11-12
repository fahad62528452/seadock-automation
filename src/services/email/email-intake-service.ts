import "server-only";

import { listCustomers } from "@/services/customer-orders/customer-order-service";
import { createCustomerPurchaseOrder } from "@/services/customer-orders/customer-order-service";
import { getSession } from "@/services/auth/get-session";
import { recordAuditEntry } from "@/services/audit/audit-service";
import { matchCustomerFromSender } from "@/services/email/customer-matcher";
import { getEmailConnection } from "@/services/email/connection-service";
import {
  mockConfirmCandidate,
  mockEmailInboxStats,
  mockFindEmailByExternal,
  mockGetPoCandidate,
  mockIgnoreCandidate,
  mockInsertInboundEmail,
  mockListPoCandidates,
  mockMarkCandidateActionRequired,
  mockSaveSyncResult,
  mockUpdateEmailStatus,
  mockUpsertCandidate,
} from "@/lib/mock/email-intake-store";
import { detectPurchaseOrderCandidate } from "@/services/email/po-detector";
import { getDefaultPurchaseOrderExtractor } from "@/services/email/extractors/heuristic-extractor";
import { getEmailProvider } from "@/services/email/email-provider";
import { getDatabaseClient, getPersistenceMode } from "@/services/db/client";
import type { Json } from "@/types/database";
import type {
  ConfirmEmailPoInput,
  EmailActionRequiredReason,
  EmailInboxDashboardStats,
  EmailPoCandidateDetail,
  EmailPoCandidateListItem,
  EmailSyncSummary,
  InboundEmailMessage,
  PurchaseOrderExtractionResult,
} from "@/types/email";

function asJson(value: unknown): Json {
  return value as Json;
}

type NestedRow = { [key: string]: unknown };

async function getClient(preferAdmin = true) {
  const database = await getDatabaseClient({ preferAdmin });
  if (!database) throw new Error("Supabase is not configured.");
  return database.client;
}

function uniqueReasons(reasons: EmailActionRequiredReason[]) {
  return Array.from(new Set(reasons));
}

async function processMessage(
  message: InboundEmailMessage,
  actorName: string,
): Promise<{
  created: boolean;
  candidateCreated: boolean;
  actionRequired: boolean;
  ignored: boolean;
  failed: boolean;
}> {
  const detection = detectPurchaseOrderCandidate(message);
  const customers = await listCustomers();
  const customerMatch = matchCustomerFromSender(
    message.sender,
    customers.map((customer) => ({ id: customer.id, email: customer.email, name: customer.name })),
  );

  if (getPersistenceMode() === "mock") {
    const inserted = mockInsertInboundEmail(message, detection, actorName);
    if (!inserted.created) {
      return { created: false, candidateCreated: false, actionRequired: false, ignored: false, failed: false };
    }

    if (detection.label === "not_po") {
      mockUpdateEmailStatus(inserted.email.id, "ignored");
      return { created: true, candidateCreated: false, actionRequired: false, ignored: true, failed: false };
    }

    const extractor = getDefaultPurchaseOrderExtractor();
    let extraction: PurchaseOrderExtractionResult;
    try {
      extraction = await extractor.extract({
        emailMessageId: inserted.email.id,
        externalMessageId: message.externalMessageId,
        sender: message.sender ?? null,
        subject: message.subject ?? null,
        bodyText: message.bodyText ?? null,
        attachments: message.attachments ?? [],
        matchedCustomerId: customerMatch.customerId,
      });
    } catch {
      mockUpdateEmailStatus(inserted.email.id, "failed", {
        errorMessage: "PO extraction failed.",
      });
      mockUpsertCandidate({
        emailMessageId: inserted.email.id,
        reviewStatus: "failed",
        detectionLabel: detection.label,
        detectionScore: detection.score,
        customerMatchStatus: customerMatch.status,
        matchedCustomerId: customerMatch.customerId,
        matchedCustomerName: customers.find((row) => row.id === customerMatch.customerId)?.name ?? null,
        matchedCustomerCode: customers.find((row) => row.id === customerMatch.customerId)?.customerCode ?? null,
        extractedPayload: null,
        warnings: ["PO extraction failed."],
        actionRequiredReasons: ["extraction_failed"],
        actorName,
      });
      return { created: true, candidateCreated: true, actionRequired: true, ignored: false, failed: true };
    }

    const reasons = uniqueReasons([
      ...extraction.actionRequiredReasons,
      ...(customerMatch.status === "no_match" ? (["customer_not_found"] as const) : []),
      ...(customerMatch.status === "multiple_matches" ? (["ambiguous_extraction"] as const) : []),
    ]);

    if (customerMatch.status !== "matched") {
      extraction.warnings.push("Customer could not be confidently identified.");
    }

    // Duplicate check against seed/existing customer POs happens at confirm time;
    // flag early when PO number matches seed PO-1001 for known customer.
    if (
      customerMatch.customerId &&
      extraction.poNumber.value &&
      extraction.poNumber.value.toUpperCase() === "PO-1001"
    ) {
      reasons.push("duplicate_po");
      extraction.warnings.push("Possible duplicate PO: PO-1001");
    }

    const reviewStatus =
      extraction.errors.length || reasons.includes("extraction_failed")
        ? "failed"
        : reasons.length
          ? "needs_review"
          : extraction.confidence >= 70
            ? "ready_to_confirm"
            : "needs_review";

    mockUpsertCandidate({
      emailMessageId: inserted.email.id,
      reviewStatus,
      detectionLabel: detection.label,
      detectionScore: detection.score,
      customerMatchStatus: customerMatch.status,
      matchedCustomerId: customerMatch.customerId,
      matchedCustomerName: customers.find((row) => row.id === customerMatch.customerId)?.name ?? null,
      matchedCustomerCode: customers.find((row) => row.id === customerMatch.customerId)?.customerCode ?? null,
      extractedPayload: extraction,
      warnings: extraction.warnings,
      actionRequiredReasons: reasons,
      actorName,
    });

    mockUpdateEmailStatus(
      inserted.email.id,
      reviewStatus === "failed" || reasons.length ? "action_required" : "processing",
      reasons.length ? { actionRequiredReason: reasons.join(", ") } : undefined,
    );

    return {
      created: true,
      candidateCreated: true,
      actionRequired: reasons.length > 0 || reviewStatus === "failed",
      ignored: false,
      failed: reviewStatus === "failed",
    };
  }

  // Supabase path
  const client = await getClient(true);
  const { data: existing } = await client
    .from("email_messages")
    .select("id")
    .eq("provider", message.provider)
    .eq("external_message_id", message.externalMessageId)
    .maybeSingle();

  if (existing) {
    return { created: false, candidateCreated: false, actionRequired: false, ignored: false, failed: false };
  }

  const { data: emailRow, error: emailError } = await client
    .from("email_messages")
    .insert({
      provider: message.provider,
      external_message_id: message.externalMessageId,
      sender: message.sender,
      recipient: message.recipient ?? null,
      subject: message.subject,
      received_at: message.receivedAt,
      thread_id: message.threadId ?? null,
      snippet: message.snippet ?? null,
      body_text: message.bodyText ?? null,
      has_attachments: Boolean(message.hasAttachments || message.attachments?.length),
      processing_status: detection.label === "not_po" ? "ignored" : "received",
      detection_label: detection.label,
      detection_score: detection.score,
    })
    .select("*")
    .single();

  if (emailError || !emailRow) {
    throw new Error("Unable to store email message.");
  }

  await recordAuditEntry({
    actorId: getSession().id,
    actorName,
    action: "Email Message Received",
    recordType: "email_message",
    recordId: emailRow.id,
    recordLabel: emailRow.subject ?? emailRow.external_message_id,
    field: "processing_status",
    previousValue: null,
    newValue: emailRow.processing_status,
  });

  for (const attachment of message.attachments ?? []) {
    const unsupported =
      !attachment.contentText &&
      !(attachment.mimeType ?? "").startsWith("text/") &&
      !attachment.filename.toLowerCase().endsWith(".csv") &&
      !attachment.filename.toLowerCase().endsWith(".txt");
    await client.from("email_attachments").insert({
      email_message_id: emailRow.id,
      external_attachment_id: attachment.externalAttachmentId,
      filename: attachment.filename,
      mime_type: attachment.mimeType,
      size_bytes: attachment.sizeBytes,
      extraction_status: unsupported ? "unsupported" : attachment.contentText ? "extracted" : "pending",
      extraction_error: unsupported ? "Unsupported attachment extraction." : null,
    });
  }

  if (detection.label === "not_po") {
    return { created: true, candidateCreated: false, actionRequired: false, ignored: true, failed: false };
  }

  await recordAuditEntry({
    actorId: getSession().id,
    actorName,
    action: "PO Candidate Detected",
    recordType: "email_message",
    recordId: emailRow.id,
    recordLabel: emailRow.subject ?? emailRow.external_message_id,
    field: "detection_label",
    previousValue: null,
    newValue: detection.label,
  });

  const extractor = getDefaultPurchaseOrderExtractor();
  let extraction: PurchaseOrderExtractionResult;
  try {
    await recordAuditEntry({
      actorId: getSession().id,
      actorName,
      action: "PO Extraction Started",
      recordType: "email_message",
      recordId: emailRow.id,
      recordLabel: emailRow.subject ?? emailRow.external_message_id,
      field: null,
      previousValue: null,
      newValue: null,
    });
    extraction = await extractor.extract({
      emailMessageId: emailRow.id,
      externalMessageId: message.externalMessageId,
      sender: message.sender ?? null,
      subject: message.subject ?? null,
      bodyText: message.bodyText ?? null,
      attachments: message.attachments ?? [],
      matchedCustomerId: customerMatch.customerId,
    });
    await recordAuditEntry({
      actorId: getSession().id,
      actorName,
      action: "PO Extraction Completed",
      recordType: "email_message",
      recordId: emailRow.id,
      recordLabel: extraction.poNumber.value ?? emailRow.external_message_id,
      field: "confidence",
      previousValue: null,
      newValue: String(extraction.confidence),
    });
  } catch (error) {
    await client
      .from("email_messages")
      .update({ processing_status: "failed", error_message: "PO extraction failed." })
      .eq("id", emailRow.id);
    await client.from("email_po_candidates").insert({
      email_message_id: emailRow.id,
      review_status: "failed",
      detection_label: detection.label,
      detection_score: detection.score,
      customer_match_status: customerMatch.status,
      matched_customer_id: customerMatch.customerId,
      extracted_payload: {},
      warnings: ["PO extraction failed."],
      action_required_reasons: ["extraction_failed"],
    });
    await recordAuditEntry({
      actorId: getSession().id,
      actorName,
      action: "PO Extraction Failed",
      recordType: "email_message",
      recordId: emailRow.id,
      recordLabel: emailRow.subject ?? emailRow.external_message_id,
      field: "error_message",
      previousValue: null,
      newValue: error instanceof Error ? error.message : "extraction_failed",
    });
    return { created: true, candidateCreated: true, actionRequired: true, ignored: false, failed: true };
  }

  const reasons = uniqueReasons([
    ...extraction.actionRequiredReasons,
    ...(customerMatch.status === "no_match" ? (["customer_not_found"] as const) : []),
    ...(customerMatch.status === "multiple_matches" ? (["ambiguous_extraction"] as const) : []),
  ]);

  if (customerMatch.customerId && extraction.poNumber.value) {
    const { data: duplicate } = await client
      .from("customer_purchase_orders")
      .select("id, po_number")
      .eq("customer_id", customerMatch.customerId)
      .ilike("po_number", extraction.poNumber.value)
      .maybeSingle();
    if (duplicate) {
      reasons.push("duplicate_po");
      extraction.warnings.push(`Possible duplicate PO: ${duplicate.po_number}`);
      await recordAuditEntry({
        actorId: getSession().id,
        actorName,
        action: "Duplicate PO Detected",
        recordType: "email_message",
        recordId: emailRow.id,
        recordLabel: duplicate.po_number,
        field: "po_number",
        previousValue: null,
        newValue: duplicate.po_number,
      });
    }
  }

  const reviewStatus =
    extraction.errors.length || reasons.includes("extraction_failed")
      ? "failed"
      : reasons.length
        ? "needs_review"
        : extraction.confidence >= 70
          ? "ready_to_confirm"
          : "needs_review";

  await client.from("email_po_candidates").insert({
    email_message_id: emailRow.id,
    review_status: reviewStatus,
    detection_label: detection.label,
    detection_score: detection.score,
    customer_match_status: customerMatch.status,
    matched_customer_id: customerMatch.customerId,
    extracted_payload: asJson(extraction),
    warnings: extraction.warnings,
    action_required_reasons: reasons,
  });

  await client
    .from("email_messages")
    .update({
      processing_status: reviewStatus === "failed" || reasons.length ? "action_required" : "processing",
      action_required_reason: reasons.length ? reasons.join(", ") : null,
    })
    .eq("id", emailRow.id);

  return {
    created: true,
    candidateCreated: true,
    actionRequired: reasons.length > 0 || reviewStatus === "failed",
    ignored: false,
    failed: reviewStatus === "failed",
  };
}

export async function syncEmailInbox(): Promise<EmailSyncSummary> {
  const session = getSession();
  await recordAuditEntry({
    actorId: session.id,
    actorName: session.name,
    action: "Email Sync Started",
    recordType: "email_provider_connection",
    recordId: getPersistenceMode() === "mock" ? "mock" : "gmail",
    recordLabel: "email sync",
    field: null,
    previousValue: null,
    newValue: null,
  });

  const provider = await getEmailProvider();
  const listed = await provider.listMessages({ limit: 50, query: "in:inbox" });

  const summary: EmailSyncSummary = {
    messagesChecked: listed.messages.length,
    newMessages: 0,
    poCandidates: 0,
    actionRequired: 0,
    ignored: 0,
    failed: 0,
    duplicatesSkipped: 0,
  };

  for (const message of listed.messages) {
    if (getPersistenceMode() === "mock" && mockFindEmailByExternal(message.provider, message.externalMessageId)) {
      summary.duplicatesSkipped += 1;
      continue;
    }
    const result = await processMessage(message, session.name);
    if (!result.created) summary.duplicatesSkipped += 1;
    if (result.created) summary.newMessages += 1;
    if (result.candidateCreated) summary.poCandidates += 1;
    if (result.actionRequired) summary.actionRequired += 1;
    if (result.ignored) summary.ignored += 1;
    if (result.failed) summary.failed += 1;
  }

  if (getPersistenceMode() === "mock") {
    mockSaveSyncResult(summary, session.name);
  } else {
    const client = await getClient(true);
    await client
      .from("email_provider_connections")
      .update({
        last_sync_at: new Date().toISOString(),
        last_sync_result: asJson(summary),
        last_error: null,
      })
      .eq("provider", "gmail");
    await recordAuditEntry({
      actorId: session.id,
      actorName: session.name,
      action: "Email Sync Completed",
      recordType: "email_provider_connection",
      recordId: "gmail",
      recordLabel: (await getEmailConnection()).accountEmail ?? "gmail",
      field: "last_sync_result",
      previousValue: null,
      newValue: JSON.stringify(summary),
    });
  }

  return summary;
}

export async function listEmailPoCandidates(): Promise<EmailPoCandidateListItem[]> {
  if (getPersistenceMode() === "mock") return mockListPoCandidates();

  const client = await getClient();
  const { data, error } = await client
    .from("email_po_candidates")
    .select(
      "id, email_message_id, review_status, detection_label, action_required_reasons, matched_customer_id, extracted_payload, email_messages(sender, subject, received_at), customers:matched_customer_id(name)",
    )
    .order("created_at", { ascending: false });

  if (error) throw new Error("Unable to load email PO candidates.");

  return ((data ?? []) as NestedRow[]).map((row) => {
    const email = Array.isArray(row.email_messages) ? row.email_messages[0] : row.email_messages;
    const customer = Array.isArray(row.customers) ? row.customers[0] : row.customers;
    const payload = row.extracted_payload as PurchaseOrderExtractionResult | null;
    return {
      id: row.id as string,
      emailMessageId: row.email_message_id as string,
      receivedAt: (email?.received_at as string | null | undefined) ?? null,
      sender: (email?.sender as string | null | undefined) ?? null,
      subject: (email?.subject as string | null | undefined) ?? null,
      detectionLabel: (row.detection_label as EmailPoCandidateListItem["detectionLabel"]) ?? null,
      customerName: (customer?.name as string | undefined) ?? null,
      reviewStatus: row.review_status as EmailPoCandidateListItem["reviewStatus"],
      priority: payload?.priority?.value ?? null,
      poNumber: payload?.poNumber?.value ?? null,
      actionRequiredReasons: (row.action_required_reasons as EmailActionRequiredReason[]) ?? [],
    };
  });
}

export async function getEmailPoCandidate(id: string): Promise<EmailPoCandidateDetail | null> {
  if (getPersistenceMode() === "mock") {
    const detail = mockGetPoCandidate(id);
    if (!detail) return null;
    if (detail.extractedPayload?.poNumber.value?.toUpperCase() === "PO-1001" && detail.matchedCustomerId) {
      detail.duplicatePoNumber = "PO-1001";
      detail.warnings = Array.from(new Set([...detail.warnings, "Possible duplicate PO: PO-1001"]));
      if (!detail.actionRequiredReasons.includes("duplicate_po")) {
        detail.actionRequiredReasons = [...detail.actionRequiredReasons, "duplicate_po"];
      }
    }
    return detail;
  }

  const client = await getClient();
  const { data, error } = await client
    .from("email_po_candidates")
    .select("*, email_messages(*), customers:matched_customer_id(id, name, customer_code)")
    .eq("id", id)
    .maybeSingle();

  if (error) throw new Error("Unable to load PO candidate.");
  if (!data) return null;

  const row = data as NestedRow;
  const email = Array.isArray(row.email_messages) ? row.email_messages[0] : row.email_messages;
  const customer = Array.isArray(row.customers) ? row.customers[0] : row.customers;
  const { data: attachmentRows } = await client
    .from("email_attachments")
    .select("*")
    .eq("email_message_id", row.email_message_id as string);
  const nestedAttachments = attachmentRows ?? [];
  const payload = (row.extracted_payload as PurchaseOrderExtractionResult | null) ?? null;

  let duplicatePoId: string | null = null;
  let duplicatePoNumber: string | null = null;
  if (row.matched_customer_id && payload?.poNumber?.value) {
    const { data: duplicate } = await client
      .from("customer_purchase_orders")
      .select("id, po_number")
      .eq("customer_id", row.matched_customer_id as string)
      .ilike("po_number", payload.poNumber.value)
      .maybeSingle();
    if (duplicate) {
      duplicatePoId = duplicate.id;
      duplicatePoNumber = duplicate.po_number;
    }
  }

  return {
    id: row.id as string,
    emailMessageId: row.email_message_id as string,
    reviewStatus: row.review_status as EmailPoCandidateDetail["reviewStatus"],
    detectionLabel: (row.detection_label as EmailPoCandidateDetail["detectionLabel"]) ?? null,
    detectionScore: row.detection_score == null ? null : Number(row.detection_score),
    customerMatchStatus: (row.customer_match_status as EmailPoCandidateDetail["customerMatchStatus"]) ?? null,
    matchedCustomerId: (row.matched_customer_id as string | null) ?? null,
    matchedCustomerName: (customer?.name as string | undefined) ?? null,
    matchedCustomerCode: (customer?.customer_code as string | undefined) ?? null,
    extractedPayload: payload,
    editedPayload: (row.edited_payload as Record<string, unknown> | null) ?? null,
    warnings: Array.isArray(row.warnings) ? (row.warnings as string[]) : [],
    actionRequiredReasons: (row.action_required_reasons as EmailActionRequiredReason[]) ?? [],
    linkedCustomerPoId: (row.linked_customer_po_id as string | null) ?? null,
    email: {
      provider: email?.provider as EmailPoCandidateDetail["email"]["provider"],
      externalMessageId: email?.external_message_id as string,
      sender: (email?.sender as string | null) ?? null,
      recipient: (email?.recipient as string | null) ?? null,
      subject: (email?.subject as string | null) ?? null,
      receivedAt: (email?.received_at as string | null) ?? null,
      threadId: (email?.thread_id as string | null) ?? null,
      snippet: (email?.snippet as string | null) ?? null,
      bodyText: (email?.body_text as string | null) ?? null,
      processingStatus: email?.processing_status as EmailPoCandidateDetail["email"]["processingStatus"],
    },
    attachments: ((nestedAttachments ?? []) as NestedRow[]).map((attachment) => ({
      id: attachment.id as string,
      filename: attachment.filename as string,
      mimeType: (attachment.mime_type as string | null) ?? null,
      sizeBytes: attachment.size_bytes == null ? null : Number(attachment.size_bytes),
      extractionStatus: attachment.extraction_status as EmailPoCandidateDetail["attachments"][number]["extractionStatus"],
      extractionError: (attachment.extraction_error as string | null) ?? null,
    })),
    duplicatePoId,
    duplicatePoNumber,
  };
}

export async function ignoreEmailPoCandidate(id: string, reason: string) {
  const session = getSession();
  if (getPersistenceMode() === "mock") {
    mockIgnoreCandidate(id, reason, session.name);
    return;
  }

  const client = await getClient(true);
  const candidate = await getEmailPoCandidate(id);
  if (!candidate) throw new Error("PO candidate not found.");

  await client
    .from("email_po_candidates")
    .update({ review_status: "ignored", ignored_reason: reason })
    .eq("id", id);
  await client
    .from("email_messages")
    .update({ processing_status: "ignored" })
    .eq("id", candidate.emailMessageId);

  await recordAuditEntry({
    actorId: session.id,
    actorName: session.name,
    action: "Email PO Ignored",
    recordType: "email_po_candidate",
    recordId: id,
    recordLabel: candidate.extractedPayload?.poNumber.value ?? id,
    field: "review_status",
    previousValue: candidate.reviewStatus,
    newValue: "ignored",
  });
}

export async function markEmailPoCandidateActionRequired(
  id: string,
  reasons: EmailActionRequiredReason[],
) {
  const session = getSession();
  if (getPersistenceMode() === "mock") {
    mockMarkCandidateActionRequired(id, reasons, session.name);
    return;
  }

  const client = await getClient(true);
  const candidate = await getEmailPoCandidate(id);
  if (!candidate) throw new Error("PO candidate not found.");

  await client
    .from("email_po_candidates")
    .update({
      review_status: "needs_review",
      action_required_reasons: reasons,
    })
    .eq("id", id);
  await client
    .from("email_messages")
    .update({
      processing_status: "action_required",
      action_required_reason: reasons.join(", "),
    })
    .eq("id", candidate.emailMessageId);

  await recordAuditEntry({
    actorId: session.id,
    actorName: session.name,
    action: "PO Marked Action Required",
    recordType: "email_po_candidate",
    recordId: id,
    recordLabel: candidate.extractedPayload?.poNumber.value ?? id,
    field: "action_required_reasons",
    previousValue: null,
    newValue: reasons.join(", "),
  });
}

export async function retryEmailPoExtraction(id: string) {
  const session = getSession();
  const candidate = await getEmailPoCandidate(id);
  if (!candidate) throw new Error("PO candidate not found.");
  if (candidate.reviewStatus === "confirmed") {
    throw new Error("Confirmed candidates cannot be re-extracted.");
  }

  const provider = await getEmailProvider();
  const fresh = await provider.getMessage(candidate.email.externalMessageId);
  const message: InboundEmailMessage = fresh ?? {
    externalMessageId: candidate.email.externalMessageId,
    provider: candidate.email.provider,
    sender: candidate.email.sender,
    recipient: candidate.email.recipient,
    subject: candidate.email.subject,
    receivedAt: candidate.email.receivedAt,
    threadId: candidate.email.threadId,
    snippet: candidate.email.snippet,
    bodyText: candidate.email.bodyText,
    hasAttachments: candidate.attachments.length > 0,
    attachments: candidate.attachments.map((attachment) => ({
      externalAttachmentId: attachment.id,
      filename: attachment.filename,
      mimeType: attachment.mimeType,
      sizeBytes: attachment.sizeBytes,
      contentText: null,
    })),
  };

  const customers = await listCustomers();
  const customerMatch = matchCustomerFromSender(
    message.sender,
    customers.map((customer) => ({ id: customer.id, email: customer.email, name: customer.name })),
  );
  const detection = detectPurchaseOrderCandidate(message);
  const extractor = getDefaultPurchaseOrderExtractor();
  const extraction = await extractor.extract({
    emailMessageId: candidate.emailMessageId,
    externalMessageId: message.externalMessageId,
    sender: message.sender ?? null,
    subject: message.subject ?? null,
    bodyText: message.bodyText ?? null,
    attachments: message.attachments ?? [],
    matchedCustomerId: customerMatch.customerId,
  });
  const reasons = uniqueReasons([
    ...extraction.actionRequiredReasons,
    ...(customerMatch.status === "no_match" ? (["customer_not_found"] as const) : []),
    ...(customerMatch.status === "multiple_matches" ? (["ambiguous_extraction"] as const) : []),
  ]);
  const reviewStatus =
    extraction.errors.length || reasons.includes("extraction_failed")
      ? "failed"
      : reasons.length
        ? "needs_review"
        : extraction.confidence >= 70
          ? "ready_to_confirm"
          : "needs_review";

  if (getPersistenceMode() === "mock") {
    mockUpsertCandidate({
      emailMessageId: candidate.emailMessageId,
      reviewStatus,
      detectionLabel: detection.label,
      detectionScore: detection.score,
      customerMatchStatus: customerMatch.status,
      matchedCustomerId: customerMatch.customerId,
      matchedCustomerName: customers.find((row) => row.id === customerMatch.customerId)?.name ?? null,
      matchedCustomerCode: customers.find((row) => row.id === customerMatch.customerId)?.customerCode ?? null,
      extractedPayload: extraction,
      warnings: extraction.warnings,
      actionRequiredReasons: reasons,
      actorName: session.name,
    });
  } else {
    const client = await getClient(true);
    await client
      .from("email_po_candidates")
      .update({
        review_status: reviewStatus,
        detection_label: detection.label,
        detection_score: detection.score,
        customer_match_status: customerMatch.status,
        matched_customer_id: customerMatch.customerId,
        extracted_payload: asJson(extraction),
        warnings: extraction.warnings,
        action_required_reasons: reasons,
      })
      .eq("id", id);
    await client
      .from("email_messages")
      .update({
        processing_status: reviewStatus === "failed" || reasons.length ? "action_required" : "processing",
        action_required_reason: reasons.length ? reasons.join(", ") : null,
        detection_label: detection.label,
        detection_score: detection.score,
      })
      .eq("id", candidate.emailMessageId);
  }

  await recordAuditEntry({
    actorId: session.id,
    actorName: session.name,
    action: "PO Extraction Completed",
    recordType: "email_po_candidate",
    recordId: id,
    recordLabel: extraction.poNumber.value ?? id,
    field: "review_status",
    previousValue: candidate.reviewStatus,
    newValue: reviewStatus,
  });
}

export async function confirmEmailPoCandidate(id: string, input: ConfirmEmailPoInput) {
  const session = getSession();
  const candidate = await getEmailPoCandidate(id);
  if (!candidate) throw new Error("PO candidate not found.");
  if (candidate.reviewStatus === "confirmed") {
    throw new Error("This email PO candidate is already confirmed.");
  }
  if (candidate.duplicatePoId || candidate.duplicatePoNumber) {
    throw new Error(
      `Possible duplicate PO ${candidate.duplicatePoNumber}. Resolve the existing PO before confirming.`,
    );
  }
  if (!input.customerId) throw new Error("Customer is required before confirming.");
  if (!input.poNumber.trim()) throw new Error("PO number is required before confirming.");
  if (!input.items.length || input.items.some((item) => !(item.quantity > 0))) {
    throw new Error("Valid line quantities are required before confirming.");
  }

  const created = await createCustomerPurchaseOrder({
    customerId: input.customerId,
    poNumber: input.poNumber,
    poDate: input.poDate,
    receivedAt: input.receivedAt,
    requiredDeliveryDate: input.requiredDeliveryDate,
    priority: input.priority,
    notes: input.notes || `Created from email ${candidate.email.externalMessageId}`,
    source: "email",
    items: input.items,
  });

  if (!created.ok) {
    throw new Error(created.error);
  }

  if (getPersistenceMode() === "mock") {
    mockConfirmCandidate(id, created.data.customerPurchaseOrderId, input, session.name);
  } else {
    const client = await getClient(true);
    await client
      .from("email_po_candidates")
      .update({
        review_status: "confirmed",
        linked_customer_po_id: created.data.customerPurchaseOrderId,
        edited_payload: asJson(input),
        confirmed_at: new Date().toISOString(),
        confirmed_by: null,
      })
      .eq("id", id);
    await client
      .from("email_messages")
      .update({
        processing_status: "processed",
        linked_customer_po_id: created.data.customerPurchaseOrderId,
        processed_at: new Date().toISOString(),
      })
      .eq("id", candidate.emailMessageId);

    await recordAuditEntry({
      actorId: session.id,
      actorName: session.name,
      action: "Customer PO Created From Email",
      recordType: "email_po_candidate",
      recordId: id,
      recordLabel: input.poNumber,
      field: "linked_customer_po_id",
      previousValue: null,
      newValue: created.data.customerPurchaseOrderId,
    });
  }

  return created.data;
}

export async function getEmailInboxDashboardStats(): Promise<EmailInboxDashboardStats> {
  if (getPersistenceMode() === "mock") return mockEmailInboxStats();

  const client = await getClient();
  const { data, error } = await client
    .from("email_po_candidates")
    .select("review_status, action_required_reasons");
  if (error) throw new Error("Unable to load email inbox stats.");

  const rows = (data ?? []) as NestedRow[];
  return {
    newPoEmails: rows.filter((row) => row.review_status === "new").length,
    awaitingReview: rows.filter((row) =>
      ["new", "needs_review", "ready_to_confirm"].includes(String(row.review_status)),
    ).length,
    actionRequired: rows.filter(
      (row) =>
        Array.isArray(row.action_required_reasons) &&
        (row.action_required_reasons as unknown[]).length > 0 &&
        !["confirmed", "ignored"].includes(String(row.review_status)),
    ).length,
    extractionErrors: rows.filter((row) => row.review_status === "failed").length,
  };
}

/** Compatibility wrappers for Step 5 ingestion service shape. */
export async function listInbox() {
  const candidates = await listEmailPoCandidates();
  return candidates.map((candidate) => ({
    id: candidate.id,
    from: candidate.sender ?? "",
    subject: candidate.subject ?? "",
    receivedAt: candidate.receivedAt ?? new Date(0).toISOString(),
    status: "received" as const,
  }));
}

export async function ingestEmail(messageId: string) {
  void messageId;
  throw new Error("Use Sync Now and the email PO review workflow instead of direct ingest.");
}
