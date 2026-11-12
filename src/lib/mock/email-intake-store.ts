import type {
  AttachmentExtractionStatus,
  ConfirmEmailPoInput,
  EmailActionRequiredReason,
  EmailConnectionStatus,
  EmailConnectionView,
  EmailDetectionLabel,
  EmailInboxDashboardStats,
  EmailPoCandidateDetail,
  EmailPoCandidateListItem,
  EmailPoCandidateReviewStatus,
  EmailProcessingStatus,
  EmailProviderId,
  EmailSyncSummary,
  InboundEmailMessage,
  PurchaseOrderExtractionResult,
} from "@/types/email";

type MockConnection = {
  provider: EmailProviderId;
  status: EmailConnectionStatus;
  accountEmail: string | null;
  lastSyncAt: string | null;
  lastSyncResult: EmailSyncSummary | null;
  lastError: string | null;
  connectedAt: string | null;
  refreshToken: string | null;
  accessToken: string | null;
  accessTokenExpiresAt: string | null;
};

type MockEmail = {
  id: string;
  provider: EmailProviderId;
  externalMessageId: string;
  sender: string | null;
  recipient: string | null;
  subject: string | null;
  receivedAt: string | null;
  threadId: string | null;
  snippet: string | null;
  bodyText: string | null;
  hasAttachments: boolean;
  processingStatus: EmailProcessingStatus;
  detectionLabel: EmailDetectionLabel | null;
  detectionScore: number | null;
  linkedCustomerPoId: string | null;
  processedAt: string | null;
  errorMessage: string | null;
  actionRequiredReason: string | null;
};

type MockAttachment = {
  id: string;
  emailMessageId: string;
  externalAttachmentId: string | null;
  filename: string;
  mimeType: string | null;
  sizeBytes: number | null;
  extractionStatus: AttachmentExtractionStatus;
  extractionError: string | null;
};

type MockCandidate = {
  id: string;
  emailMessageId: string;
  reviewStatus: EmailPoCandidateReviewStatus;
  detectionLabel: EmailDetectionLabel | null;
  detectionScore: number | null;
  customerMatchStatus: "matched" | "multiple_matches" | "no_match" | null;
  matchedCustomerId: string | null;
  matchedCustomerName: string | null;
  matchedCustomerCode: string | null;
  extractedPayload: PurchaseOrderExtractionResult | null;
  editedPayload: Record<string, unknown> | null;
  warnings: string[];
  actionRequiredReasons: EmailActionRequiredReason[];
  linkedCustomerPoId: string | null;
  ignoredReason: string | null;
};

type MockAudit = {
  id: string;
  actorName: string;
  action: string;
  entityType: string;
  entityId: string;
  entityLabel: string;
  field: string | null;
  previousValue: string | null;
  newValue: string | null;
  timestamp: string;
};

type Store = {
  connection: MockConnection;
  emails: MockEmail[];
  attachments: MockAttachment[];
  candidates: MockCandidate[];
  audits: MockAudit[];
};

const globalStore = globalThis as typeof globalThis & { __seadockEmailIntakeStore?: Store };

function createId(prefix: string) {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

function nowIso() {
  return new Date().toISOString();
}

function getStore(): Store {
  if (!globalStore.__seadockEmailIntakeStore) {
    globalStore.__seadockEmailIntakeStore = {
      connection: {
        provider: "mock",
        status: "connected",
        accountEmail: "mock-inbox@seadock.local",
        lastSyncAt: null,
        lastSyncResult: null,
        lastError: null,
        connectedAt: nowIso(),
        refreshToken: "mock-refresh",
        accessToken: "mock-access",
        accessTokenExpiresAt: null,
      },
      emails: [],
      attachments: [],
      candidates: [],
      audits: [],
    };
  }
  return globalStore.__seadockEmailIntakeStore;
}

function pushAudit(
  store: Store,
  input: {
    actorName: string;
    action: string;
    entityType: string;
    entityId: string;
    entityLabel: string;
    field?: string | null;
    previousValue?: string | null;
    newValue?: string | null;
  },
) {
  store.audits.unshift({
    id: createId("audit"),
    actorName: input.actorName,
    action: input.action,
    entityType: input.entityType,
    entityId: input.entityId,
    entityLabel: input.entityLabel,
    field: input.field ?? null,
    previousValue: input.previousValue ?? null,
    newValue: input.newValue ?? null,
    timestamp: nowIso(),
  });
}

export function mockGetEmailConnection(): EmailConnectionView {
  const connection = getStore().connection;
  return {
    provider: connection.provider,
    status: connection.status,
    accountEmail: connection.accountEmail,
    lastSyncAt: connection.lastSyncAt,
    lastSyncResult: connection.lastSyncResult,
    lastError: connection.lastError,
    connectedAt: connection.connectedAt,
  };
}

export function mockSetEmailConnection(
  input: Partial<MockConnection>,
  actorName: string,
  action: string,
) {
  const store = getStore();
  store.connection = { ...store.connection, ...input };
  pushAudit(store, {
    actorName,
    action,
    entityType: "email_provider_connection",
    entityId: store.connection.provider,
    entityLabel: store.connection.accountEmail ?? store.connection.provider,
    field: "status",
    newValue: store.connection.status,
  });
  return mockGetEmailConnection();
}

export function mockFindEmailByExternal(provider: string, externalMessageId: string) {
  return getStore().emails.find(
    (row) => row.provider === provider && row.externalMessageId === externalMessageId,
  );
}

export function mockInsertInboundEmail(
  message: InboundEmailMessage,
  detection: { label: EmailDetectionLabel; score: number },
  actorName: string,
) {
  const store = getStore();
  const existing = mockFindEmailByExternal(message.provider, message.externalMessageId);
  if (existing) return { email: existing, created: false };

  const email: MockEmail = {
    id: createId("email"),
    provider: message.provider,
    externalMessageId: message.externalMessageId,
    sender: message.sender ?? null,
    recipient: message.recipient ?? null,
    subject: message.subject ?? null,
    receivedAt: message.receivedAt ?? null,
    threadId: message.threadId ?? null,
    snippet: message.snippet ?? null,
    bodyText: message.bodyText ?? null,
    hasAttachments: Boolean(message.hasAttachments || message.attachments?.length),
    processingStatus: "received",
    detectionLabel: detection.label,
    detectionScore: detection.score,
    linkedCustomerPoId: null,
    processedAt: null,
    errorMessage: null,
    actionRequiredReason: null,
  };
  store.emails.unshift(email);

  for (const attachment of message.attachments ?? []) {
    const unsupported =
      !attachment.contentText &&
      !(attachment.mimeType ?? "").startsWith("text/") &&
      !attachment.filename.toLowerCase().endsWith(".csv") &&
      !attachment.filename.toLowerCase().endsWith(".txt");
    store.attachments.push({
      id: createId("att"),
      emailMessageId: email.id,
      externalAttachmentId: attachment.externalAttachmentId,
      filename: attachment.filename,
      mimeType: attachment.mimeType,
      sizeBytes: attachment.sizeBytes,
      extractionStatus: unsupported ? "unsupported" : attachment.contentText ? "extracted" : "pending",
      extractionError: unsupported ? "Unsupported attachment extraction." : null,
    });
  }

  pushAudit(store, {
    actorName,
    action: "Email Message Received",
    entityType: "email_message",
    entityId: email.id,
    entityLabel: email.subject ?? email.externalMessageId,
    field: "processing_status",
    newValue: "received",
  });

  return { email, created: true };
}

export function mockUpsertCandidate(input: {
  emailMessageId: string;
  reviewStatus: EmailPoCandidateReviewStatus;
  detectionLabel: EmailDetectionLabel | null;
  detectionScore: number | null;
  customerMatchStatus: MockCandidate["customerMatchStatus"];
  matchedCustomerId: string | null;
  matchedCustomerName: string | null;
  matchedCustomerCode: string | null;
  extractedPayload: PurchaseOrderExtractionResult | null;
  warnings: string[];
  actionRequiredReasons: EmailActionRequiredReason[];
  actorName: string;
}) {
  const store = getStore();
  const existing = store.candidates.find((row) => row.emailMessageId === input.emailMessageId);
  if (existing) {
    Object.assign(existing, {
      reviewStatus: input.reviewStatus,
      detectionLabel: input.detectionLabel,
      detectionScore: input.detectionScore,
      customerMatchStatus: input.customerMatchStatus,
      matchedCustomerId: input.matchedCustomerId,
      matchedCustomerName: input.matchedCustomerName,
      matchedCustomerCode: input.matchedCustomerCode,
      extractedPayload: input.extractedPayload,
      warnings: input.warnings,
      actionRequiredReasons: input.actionRequiredReasons,
    });
    return existing;
  }

  const candidate: MockCandidate = {
    id: createId("cand"),
    emailMessageId: input.emailMessageId,
    reviewStatus: input.reviewStatus,
    detectionLabel: input.detectionLabel,
    detectionScore: input.detectionScore,
    customerMatchStatus: input.customerMatchStatus,
    matchedCustomerId: input.matchedCustomerId,
    matchedCustomerName: input.matchedCustomerName,
    matchedCustomerCode: input.matchedCustomerCode,
    extractedPayload: input.extractedPayload,
    editedPayload: null,
    warnings: input.warnings,
    actionRequiredReasons: input.actionRequiredReasons,
    linkedCustomerPoId: null,
    ignoredReason: null,
  };
  store.candidates.unshift(candidate);

  pushAudit(store, {
    actorName: input.actorName,
    action: "PO Candidate Detected",
    entityType: "email_po_candidate",
    entityId: candidate.id,
    entityLabel: input.extractedPayload?.poNumber.value ?? candidate.id,
    field: "review_status",
    newValue: candidate.reviewStatus,
  });

  return candidate;
}

export function mockUpdateEmailStatus(
  emailId: string,
  status: EmailProcessingStatus,
  extras?: Partial<MockEmail>,
) {
  const email = getStore().emails.find((row) => row.id === emailId);
  if (!email) return;
  email.processingStatus = status;
  Object.assign(email, extras ?? {});
}

export function mockSaveSyncResult(summary: EmailSyncSummary, actorName: string) {
  const store = getStore();
  store.connection.lastSyncAt = nowIso();
  store.connection.lastSyncResult = summary;
  store.connection.lastError = null;
  pushAudit(store, {
    actorName,
    action: "Email Sync Completed",
    entityType: "email_provider_connection",
    entityId: store.connection.provider,
    entityLabel: store.connection.accountEmail ?? store.connection.provider,
    field: "last_sync_result",
    newValue: JSON.stringify(summary),
  });
}

export function mockListPoCandidates(): EmailPoCandidateListItem[] {
  const store = getStore();
  return store.candidates
    .map((candidate) => {
      const email = store.emails.find((row) => row.id === candidate.emailMessageId);
      return {
        id: candidate.id,
        emailMessageId: candidate.emailMessageId,
        receivedAt: email?.receivedAt ?? null,
        sender: email?.sender ?? null,
        subject: email?.subject ?? null,
        detectionLabel: candidate.detectionLabel,
        customerName: candidate.matchedCustomerName,
        reviewStatus: candidate.reviewStatus,
        priority: candidate.extractedPayload?.priority.value ?? null,
        poNumber: candidate.extractedPayload?.poNumber.value ?? null,
        actionRequiredReasons: candidate.actionRequiredReasons,
      };
    })
    .sort((a, b) => (b.receivedAt ?? "").localeCompare(a.receivedAt ?? ""));
}

export function mockGetPoCandidate(id: string): EmailPoCandidateDetail | null {
  const store = getStore();
  const candidate = store.candidates.find((row) => row.id === id);
  if (!candidate) return null;
  const email = store.emails.find((row) => row.id === candidate.emailMessageId);
  if (!email) return null;
  const attachments = store.attachments.filter((row) => row.emailMessageId === email.id);

  return {
    id: candidate.id,
    emailMessageId: email.id,
    reviewStatus: candidate.reviewStatus,
    detectionLabel: candidate.detectionLabel,
    detectionScore: candidate.detectionScore,
    customerMatchStatus: candidate.customerMatchStatus,
    matchedCustomerId: candidate.matchedCustomerId,
    matchedCustomerName: candidate.matchedCustomerName,
    matchedCustomerCode: candidate.matchedCustomerCode,
    extractedPayload: candidate.extractedPayload,
    editedPayload: candidate.editedPayload,
    warnings: candidate.warnings,
    actionRequiredReasons: candidate.actionRequiredReasons,
    linkedCustomerPoId: candidate.linkedCustomerPoId,
    email: {
      provider: email.provider,
      externalMessageId: email.externalMessageId,
      sender: email.sender,
      recipient: email.recipient,
      subject: email.subject,
      receivedAt: email.receivedAt,
      threadId: email.threadId,
      snippet: email.snippet,
      bodyText: email.bodyText,
      processingStatus: email.processingStatus,
    },
    attachments: attachments.map((attachment) => ({
      id: attachment.id,
      filename: attachment.filename,
      mimeType: attachment.mimeType,
      sizeBytes: attachment.sizeBytes,
      extractionStatus: attachment.extractionStatus,
      extractionError: attachment.extractionError,
    })),
    duplicatePoId: null,
    duplicatePoNumber: null,
  };
}

export function mockIgnoreCandidate(id: string, reason: string, actorName: string) {
  const store = getStore();
  const candidate = store.candidates.find((row) => row.id === id);
  if (!candidate) throw new Error("PO candidate not found.");
  candidate.reviewStatus = "ignored";
  candidate.ignoredReason = reason;
  mockUpdateEmailStatus(candidate.emailMessageId, "ignored");
  pushAudit(store, {
    actorName,
    action: "Email PO Ignored",
    entityType: "email_po_candidate",
    entityId: candidate.id,
    entityLabel: candidate.extractedPayload?.poNumber.value ?? candidate.id,
    field: "review_status",
    newValue: "ignored",
  });
}

export function mockMarkCandidateActionRequired(
  id: string,
  reasons: EmailActionRequiredReason[],
  actorName: string,
) {
  const store = getStore();
  const candidate = store.candidates.find((row) => row.id === id);
  if (!candidate) throw new Error("PO candidate not found.");
  candidate.reviewStatus = "needs_review";
  candidate.actionRequiredReasons = reasons;
  mockUpdateEmailStatus(candidate.emailMessageId, "action_required", {
    actionRequiredReason: reasons.join(", "),
  });
  pushAudit(store, {
    actorName,
    action: "PO Marked Action Required",
    entityType: "email_po_candidate",
    entityId: candidate.id,
    entityLabel: candidate.extractedPayload?.poNumber.value ?? candidate.id,
    field: "action_required_reasons",
    newValue: reasons.join(", "),
  });
}

export function mockConfirmCandidate(
  id: string,
  customerPoId: string,
  input: ConfirmEmailPoInput,
  actorName: string,
) {
  const store = getStore();
  const candidate = store.candidates.find((row) => row.id === id);
  if (!candidate) throw new Error("PO candidate not found.");
  candidate.reviewStatus = "confirmed";
  candidate.linkedCustomerPoId = customerPoId;
  candidate.editedPayload = input as unknown as Record<string, unknown>;
  mockUpdateEmailStatus(candidate.emailMessageId, "processed", {
    linkedCustomerPoId: customerPoId,
    processedAt: nowIso(),
  });
  pushAudit(store, {
    actorName,
    action: "Customer PO Created From Email",
    entityType: "email_po_candidate",
    entityId: candidate.id,
    entityLabel: input.poNumber,
    field: "linked_customer_po_id",
    newValue: customerPoId,
  });
}

export function mockEmailInboxStats(): EmailInboxDashboardStats {
  const store = getStore();
  return {
    newPoEmails: store.candidates.filter((row) => row.reviewStatus === "new").length,
    awaitingReview: store.candidates.filter((row) =>
      ["needs_review", "ready_to_confirm", "new"].includes(row.reviewStatus),
    ).length,
    actionRequired: store.candidates.filter((row) => row.actionRequiredReasons.length > 0 && row.reviewStatus !== "confirmed" && row.reviewStatus !== "ignored").length,
    extractionErrors: store.candidates.filter((row) => row.reviewStatus === "failed").length,
  };
}

export function mockGetEmailAudits(limit = 20) {
  return getStore().audits.slice(0, limit);
}
