import type {
  PurchaseOrderExtractionInput,
  PurchaseOrderExtractionResult,
  PurchaseOrderExtractor,
} from "@/types/email";

function field<T>(
  value: T,
  confidence: number,
  source: "subject" | "body" | "attachment" | "manual" | "inferred",
  warning?: string | null,
) {
  return { value, confidence, source, warning: warning ?? null };
}

function findPoNumber(text: string): string | null {
  const match =
    text.match(/\bPO[-_\s]?([A-Z0-9][-A-Z0-9/]{2,})\b/i) ||
    text.match(/\bPurchase\s+Order\s*(?:No\.?|Number|#)?\s*[:#]?\s*([A-Z0-9][-A-Z0-9/]{2,})\b/i);
  return match?.[1] ? `PO-${match[1].replace(/^PO[-_]?/i, "")}` : null;
}

function findDate(text: string, label: RegExp): string | null {
  const section = text.match(label);
  if (!section) return null;
  const nearby = text.slice(section.index ?? 0, (section.index ?? 0) + 80);
  const iso = nearby.match(/\b(20\d{2}-\d{2}-\d{2})\b/);
  if (iso) return iso[1];
  const slash = nearby.match(/\b(\d{1,2})[\/\-](\d{1,2})[\/\-](20\d{2})\b/);
  if (slash) {
    return `${slash[3]}-${slash[1].padStart(2, "0")}-${slash[2].padStart(2, "0")}`;
  }
  return null;
}

function findLines(text: string) {
  const lines: Array<{
    productName: string | null;
    quantity: number | null;
    unit: string | null;
  }> = [];
  const pattern =
    /^[\-\*]?\s*(.+?)\s+[-–]?\s*(\d+(?:\.\d+)?)\s*(kg|mt|box|crate|piece|pcs)\b/gim;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    lines.push({
      productName: match[1].trim(),
      quantity: Number(match[2]),
      unit: match[3].toLowerCase() === "pcs" ? "piece" : match[3].toLowerCase(),
    });
  }
  return lines;
}

/**
 * Heuristic text extractor only.
 * No OCR API and no AI API in Step 6.
 */
export class HeuristicPurchaseOrderExtractor implements PurchaseOrderExtractor {
  readonly id = "heuristic-text";

  async extract(input: PurchaseOrderExtractionInput): Promise<PurchaseOrderExtractionResult> {
    const attachmentTexts = input.attachments
      .filter((attachment) => attachment.contentText)
      .map((attachment) => attachment.contentText as string);
    const combined = [input.subject ?? "", input.bodyText ?? "", ...attachmentTexts].join("\n");
    const warnings: string[] = [];
    const errors: string[] = [];
    const actionRequiredReasons: PurchaseOrderExtractionResult["actionRequiredReasons"] = [];

    const unsupported = input.attachments.filter((attachment) => {
      const mime = (attachment.mimeType ?? "").toLowerCase();
      const name = attachment.filename.toLowerCase();
      const textLike =
        mime.startsWith("text/") ||
        mime.includes("csv") ||
        name.endsWith(".txt") ||
        name.endsWith(".csv");
      return !textLike && !attachment.contentText;
    });

    if (unsupported.length) {
      warnings.push("Unsupported attachment extraction.");
      actionRequiredReasons.push("unsupported_attachment");
    }

    const poNumber = findPoNumber(combined);
    if (!poNumber) {
      warnings.push("PO number missing or unclear.");
      actionRequiredReasons.push("missing_po_number");
    }

    const poDate = findDate(combined, /PO\s*Date|Order\s*Date/i);
    const requiredDeliveryDate = findDate(combined, /Required\s*Delivery|Delivery\s*Date|Needed\s*By/i);
    if (!requiredDeliveryDate) {
      warnings.push("Delivery date missing.");
      actionRequiredReasons.push("missing_delivery_date");
    }

    const parsedLines = findLines(combined);
    if (!parsedLines.length) {
      warnings.push("Quantity / line items unclear.");
      actionRequiredReasons.push("missing_quantity");
      actionRequiredReasons.push("ambiguous_extraction");
    } else if (parsedLines.some((line) => !(line.quantity && line.quantity > 0))) {
      warnings.push("One or more quantities are missing.");
      actionRequiredReasons.push("missing_quantity");
    }

    const priorityText = combined.match(/\b(urgent|high\s*priority|asap)\b/i);
    const priority = priorityText
      ? /urgent|asap/i.test(priorityText[0])
        ? "urgent"
        : "high"
      : "normal";

    const customerNameMatch = combined.match(/Customer\s*[:\-]\s*(.+)$/im);
    const customerName = customerNameMatch?.[1]?.trim() ?? null;

    const confidence = Math.max(
      20,
      90 -
        actionRequiredReasons.length * 12 -
        unsupported.length * 10 +
        (poNumber ? 5 : 0) +
        (parsedLines.length ? 5 : 0),
    );

    if (!combined.trim()) {
      errors.push("No extractable text content.");
      actionRequiredReasons.push("extraction_failed");
    }

    return {
      sourceMessageId: input.externalMessageId,
      sourceAttachmentId: input.attachments[0]?.externalAttachmentId ?? null,
      poNumber: field(poNumber, poNumber ? 80 : 20, "body", poNumber ? null : "Verify PO number"),
      customerName: field(customerName, customerName ? 60 : 20, "body", customerName ? null : "Verify customer"),
      poDate: field(poDate, poDate ? 70 : 30, "body"),
      requiredDeliveryDate: field(
        requiredDeliveryDate,
        requiredDeliveryDate ? 70 : 25,
        "body",
        requiredDeliveryDate ? null : "Required",
      ),
      priority: field(priority as "normal" | "high" | "urgent", 55, "inferred"),
      lineItems: (parsedLines.length
        ? parsedLines
        : [{ productName: null, quantity: null, unit: "kg" }]
      ).map((line) => ({
        productName: field(line.productName, line.productName ? 70 : 20, "body", line.productName ? null : "Verify product"),
        species: field(line.productName, line.productName ? 60 : 20, "inferred"),
        productCode: field(null, 10, "body"),
        quantity: field(line.quantity, line.quantity ? 75 : 20, "body", line.quantity ? null : "Verify quantity"),
        unit: field(line.unit ?? "kg", 70, "body"),
        specifications: field(null, 10, "body"),
        requiredDeliveryDate: field(requiredDeliveryDate, requiredDeliveryDate ? 50 : 20, "inferred"),
        notes: field(null, 10, "body"),
      })),
      confidence,
      warnings: Array.from(new Set(warnings)),
      errors,
      actionRequiredReasons: Array.from(new Set(actionRequiredReasons)),
    };
  }
}

export function getDefaultPurchaseOrderExtractor(): PurchaseOrderExtractor {
  return new HeuristicPurchaseOrderExtractor();
}
