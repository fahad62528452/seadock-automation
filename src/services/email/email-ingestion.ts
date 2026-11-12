import {
  ingestEmail,
  listInbox,
} from "@/services/email/email-intake-service";
import type { EmailIngestionService, ExtractedPurchaseOrderDraft } from "@/types/email";

/**
 * Provider-neutral ingestion boundary used by older callers.
 * Step 6 sync/review flow lives in email-intake-service.
 */
export { listInbox, ingestEmail };

async function ingestCompat(messageId: string): Promise<ExtractedPurchaseOrderDraft> {
  await ingestEmail(messageId);
  return {
    emailId: messageId,
    customerName: null,
    poNumber: null,
    lines: [],
  };
}

export const emailIngestionService: EmailIngestionService = {
  listInbox,
  ingest: ingestCompat,
};
