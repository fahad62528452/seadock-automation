import type { EmailDetectionLabel, InboundEmailMessage, PoDetectionResult } from "@/types/email";

const PO_SUBJECT = /\b(p\.?\s*o\.?|purchase\s*order|order\s*no|po[-_\s]?\d+)\b/i;
const PO_BODY = /\b(purchase\s+order|po\s*number|ordered\s+quantity|delivery\s+date|line\s*item)\b/i;

/**
 * Provider-neutral PO candidate detection.
 * Detection alone never creates an approved Customer PO.
 */
export function detectPurchaseOrderCandidate(message: InboundEmailMessage): PoDetectionResult {
  const signals: string[] = [];
  let score = 0;

  if (message.subject && PO_SUBJECT.test(message.subject)) {
    score += 40;
    signals.push("subject_contains_po_terms");
  }
  if (message.bodyText && PO_BODY.test(message.bodyText)) {
    score += 25;
    signals.push("body_contains_po_terms");
  }
  if (message.hasAttachments || (message.attachments?.length ?? 0) > 0) {
    score += 20;
    signals.push("has_attachments");
  }
  if (message.snippet && PO_BODY.test(message.snippet)) {
    score += 10;
    signals.push("snippet_contains_po_terms");
  }
  if (/\b(urgent|asap|priority)\b/i.test(`${message.subject ?? ""} ${message.bodyText ?? ""}`)) {
    score += 5;
    signals.push("urgency_language");
  }

  score = Math.min(100, score);

  let label: EmailDetectionLabel;
  if (score >= 55) label = "likely_po";
  else if (score >= 25) label = "needs_review";
  else label = "not_po";

  return { label, score, signals };
}
