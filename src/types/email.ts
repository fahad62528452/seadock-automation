/**
 * Provider-neutral email integration + PO extraction/review boundary.
 * Gmail is implemented in Step 6. Microsoft Graph / OCR / AI remain future work.
 */

export type EmailProviderId = "gmail" | "microsoft365" | "imap" | "other" | "mock";

export type EmailProcessingStatus =
  | "received"
  | "processing"
  | "processed"
  | "ignored"
  | "failed"
  | "action_required";

export type EmailDetectionLabel = "likely_po" | "not_po" | "needs_review";

export type EmailPoCandidateReviewStatus =
  | "new"
  | "needs_review"
  | "ready_to_confirm"
  | "confirmed"
  | "ignored"
  | "failed";

export type CustomerMatchStatus = "matched" | "multiple_matches" | "no_match";

export type EmailConnectionStatus =
  | "not_connected"
  | "connected"
  | "connection_error"
  | "disconnected";

export type EmailActionRequiredReason =
  | "customer_not_found"
  | "duplicate_po"
  | "missing_po_number"
  | "missing_customer"
  | "missing_quantity"
  | "missing_delivery_date"
  | "unsupported_attachment"
  | "extraction_failed"
  | "ambiguous_extraction"
  | "manual_review_required";

export type AttachmentExtractionStatus =
  | "pending"
  | "unsupported"
  | "extracted"
  | "failed"
  | "skipped";

/** Legacy inbox list shape kept for compatibility. */
export type InboundEmailStatus =
  | "received"
  | "extracted"
  | "validated"
  | "awaiting_verification"
  | "verified"
  | "rejected";

export interface EmailAttachmentMeta {
  externalAttachmentId: string | null;
  filename: string;
  mimeType: string | null;
  sizeBytes: number | null;
  contentText?: string | null;
}

export interface InboundEmailMessage {
  externalMessageId: string;
  provider: EmailProviderId;
  sender: string | null;
  recipient?: string | null;
  subject: string | null;
  receivedAt: string | null;
  threadId?: string | null;
  snippet?: string | null;
  bodyText?: string | null;
  hasAttachments?: boolean;
  attachments?: EmailAttachmentMeta[];
}

export interface InboundEmail {
  id: string;
  from: string;
  subject: string;
  receivedAt: string;
  status: InboundEmailStatus;
}

export interface ListMessagesInput {
  since?: string;
  limit?: number;
  pageToken?: string;
  query?: string;
}

export interface ListMessagesResult {
  messages: InboundEmailMessage[];
  nextPageToken?: string | null;
}

/**
 * Replaceable email provider adapter.
 */
export interface EmailProvider {
  readonly id: EmailProviderId;
  listMessages(input?: ListMessagesInput): Promise<ListMessagesResult>;
  getMessage(externalMessageId: string): Promise<InboundEmailMessage | null>;
  markProcessed(
    externalMessageId: string,
    result: { ignored?: boolean; errorMessage?: string },
  ): Promise<void>;
  testConnection?(): Promise<{ ok: boolean; accountEmail?: string | null; error?: string }>;
}

export interface ExtractedPurchaseOrderLine {
  description: string;
  productName?: string | null;
  species?: string | null;
  productCode?: string | null;
  quantity: number | null;
  unit: string | null;
  specifications?: string | null;
  requiredDeliveryDate?: string | null;
  notes?: string | null;
}

/** Draft produced after inbox ingestion. Verification still creates the customer PO. */
export interface ExtractedPurchaseOrderDraft {
  emailId: string;
  customerName: string | null;
  poNumber: string | null;
  lines: ExtractedPurchaseOrderLine[];
}

export interface EmailIngestionService {
  listInbox(): Promise<InboundEmail[]>;
  ingest(messageId: string): Promise<ExtractedPurchaseOrderDraft>;
}

export interface PurchaseOrderExtractionInput {
  emailMessageId: string;
  externalMessageId: string;
  sender: string | null;
  subject: string | null;
  bodyText: string | null;
  attachments: EmailAttachmentMeta[];
  matchedCustomerId?: string | null;
}

export interface ExtractedField<T> {
  value: T;
  confidence: number;
  source: "subject" | "body" | "attachment" | "manual" | "inferred";
  warning?: string | null;
}

export interface PurchaseOrderExtractionResult {
  sourceMessageId: string;
  sourceAttachmentId: string | null;
  poNumber: ExtractedField<string | null>;
  customerName: ExtractedField<string | null>;
  poDate: ExtractedField<string | null>;
  requiredDeliveryDate: ExtractedField<string | null>;
  priority: ExtractedField<"normal" | "high" | "urgent">;
  lineItems: Array<{
    productName: ExtractedField<string | null>;
    species: ExtractedField<string | null>;
    productCode: ExtractedField<string | null>;
    quantity: ExtractedField<number | null>;
    unit: ExtractedField<string | null>;
    specifications: ExtractedField<string | null>;
    requiredDeliveryDate: ExtractedField<string | null>;
    notes: ExtractedField<string | null>;
  }>;
  confidence: number;
  warnings: string[];
  errors: string[];
  actionRequiredReasons: EmailActionRequiredReason[];
}

export interface PurchaseOrderExtractor {
  readonly id: string;
  extract(input: PurchaseOrderExtractionInput): Promise<PurchaseOrderExtractionResult>;
}

export interface PoDetectionResult {
  label: EmailDetectionLabel;
  score: number;
  signals: string[];
}

export interface CustomerMatchResult {
  status: CustomerMatchStatus;
  customerId: string | null;
  customerIds: string[];
  reason?: string;
}

export interface EmailConnectionView {
  provider: EmailProviderId;
  status: EmailConnectionStatus;
  accountEmail: string | null;
  lastSyncAt: string | null;
  lastSyncResult: EmailSyncSummary | null;
  lastError: string | null;
  connectedAt: string | null;
}

export interface EmailSyncSummary {
  messagesChecked: number;
  newMessages: number;
  poCandidates: number;
  actionRequired: number;
  ignored: number;
  failed: number;
  duplicatesSkipped: number;
}

export interface EmailPoCandidateListItem {
  id: string;
  emailMessageId: string;
  receivedAt: string | null;
  sender: string | null;
  subject: string | null;
  detectionLabel: EmailDetectionLabel | null;
  customerName: string | null;
  reviewStatus: EmailPoCandidateReviewStatus;
  priority: string | null;
  poNumber: string | null;
  actionRequiredReasons: EmailActionRequiredReason[];
}

export interface EmailPoCandidateDetail {
  id: string;
  emailMessageId: string;
  reviewStatus: EmailPoCandidateReviewStatus;
  detectionLabel: EmailDetectionLabel | null;
  detectionScore: number | null;
  customerMatchStatus: CustomerMatchStatus | null;
  matchedCustomerId: string | null;
  matchedCustomerName: string | null;
  matchedCustomerCode: string | null;
  extractedPayload: PurchaseOrderExtractionResult | null;
  editedPayload: Record<string, unknown> | null;
  warnings: string[];
  actionRequiredReasons: EmailActionRequiredReason[];
  linkedCustomerPoId: string | null;
  email: {
    provider: EmailProviderId;
    externalMessageId: string;
    sender: string | null;
    recipient: string | null;
    subject: string | null;
    receivedAt: string | null;
    threadId: string | null;
    snippet: string | null;
    bodyText: string | null;
    processingStatus: EmailProcessingStatus;
  };
  attachments: Array<{
    id: string;
    filename: string;
    mimeType: string | null;
    sizeBytes: number | null;
    extractionStatus: AttachmentExtractionStatus;
    extractionError: string | null;
  }>;
  duplicatePoId: string | null;
  duplicatePoNumber: string | null;
}

export interface EmailInboxDashboardStats {
  newPoEmails: number;
  awaitingReview: number;
  actionRequired: number;
  extractionErrors: number;
}

export interface ConfirmEmailPoInput {
  customerId: string;
  poNumber: string;
  poDate: string;
  receivedAt: string;
  requiredDeliveryDate: string;
  priority: "normal" | "high" | "urgent";
  notes: string;
  items: Array<{
    productName: string;
    species: string;
    productCode: string;
    quantity: number;
    unit: string;
    requiredDeliveryDate: string;
    specifications: string;
    notes: string;
  }>;
}
