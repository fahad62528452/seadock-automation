import type {
  EmailProvider,
  InboundEmailMessage,
  ListMessagesInput,
  ListMessagesResult,
} from "@/types/email";

/**
 * Deterministic mock mailbox for development without Gmail credentials.
 */
const MOCK_MESSAGES: InboundEmailMessage[] = [
  {
    externalMessageId: "mock-po-email-001",
    provider: "mock",
    sender: "buyer@example-seafood.test",
    recipient: "orders@seadock.local",
    subject: "Purchase Order PO-1001",
    receivedAt: "2026-11-12T09:00:00.000Z",
    threadId: "thread-po-1001",
    snippet: "Please supply Indian Mackerel and Prawns",
    bodyText: [
      "Customer: Example Seafood Buyer",
      "PO Number: PO-1001",
      "PO Date: 2026-11-12",
      "Required Delivery: 2026-11-14",
      "Priority: High",
      "",
      "Indian Mackerel - 1200 kg",
      "Prawns - 800 kg",
    ].join("\n"),
    hasAttachments: false,
    attachments: [],
  },
  {
    externalMessageId: "mock-non-po-002",
    provider: "mock",
    sender: "newsletter@market.test",
    recipient: "orders@seadock.local",
    subject: "Weekly seafood market update",
    receivedAt: "2026-11-12T09:10:00.000Z",
    threadId: "thread-news",
    snippet: "Prices moved slightly this week",
    bodyText: "This is a newsletter, not a purchase order.",
    hasAttachments: false,
    attachments: [],
  },
  {
    externalMessageId: "mock-unknown-customer-003",
    provider: "mock",
    sender: "unknown.buyer@elsewhere.test",
    recipient: "orders@seadock.local",
    subject: "PO-2200 Purchase Order",
    receivedAt: "2026-11-12T09:20:00.000Z",
    threadId: "thread-2200",
    snippet: "New PO attached conceptually",
    bodyText: [
      "PO Number: PO-2200",
      "Required Delivery: 2026-11-16",
      "Tuna - 500 kg",
    ].join("\n"),
    hasAttachments: false,
    attachments: [],
  },
  {
    externalMessageId: "mock-duplicate-po-004",
    provider: "mock",
    sender: "buyer@example-seafood.test",
    recipient: "orders@seadock.local",
    subject: "PO-1001 again",
    receivedAt: "2026-11-12T09:30:00.000Z",
    threadId: "thread-po-1001-dup",
    snippet: "Resending PO-1001",
    bodyText: [
      "PO Number: PO-1001",
      "Required Delivery: 2026-11-14",
      "Indian Mackerel - 1200 kg",
    ].join("\n"),
    hasAttachments: false,
    attachments: [],
  },
  {
    externalMessageId: "mock-missing-qty-005",
    provider: "mock",
    sender: "buyer@example-seafood.test",
    recipient: "orders@seadock.local",
    subject: "Purchase Order PO-3300",
    receivedAt: "2026-11-12T09:40:00.000Z",
    threadId: "thread-3300",
    snippet: "Need prawns urgently",
    bodyText: [
      "PO Number: PO-3300",
      "Required Delivery: 2026-11-15",
      "Prawns urgently please",
    ].join("\n"),
    hasAttachments: false,
    attachments: [],
  },
  {
    externalMessageId: "mock-pdf-attachment-006",
    provider: "mock",
    sender: "buyer@example-seafood.test",
    recipient: "orders@seadock.local",
    subject: "PO-4400 attached",
    receivedAt: "2026-11-12T09:50:00.000Z",
    threadId: "thread-4400",
    snippet: "Please find PO PDF",
    bodyText: "PO Number: PO-4400\nSee attached PDF for line items.",
    hasAttachments: true,
    attachments: [
      {
        externalAttachmentId: "att-pdf-4400",
        filename: "PO-4400.pdf",
        mimeType: "application/pdf",
        sizeBytes: 245760,
        contentText: null,
      },
    ],
  },
  {
    externalMessageId: "mock-unsupported-007",
    provider: "mock",
    sender: "buyer@example-seafood.test",
    recipient: "orders@seadock.local",
    subject: "PO-5500 scan",
    receivedAt: "2026-11-12T10:00:00.000Z",
    threadId: "thread-5500",
    snippet: "Scanned image only",
    bodyText: "PO Number: PO-5500",
    hasAttachments: true,
    attachments: [
      {
        externalAttachmentId: "att-img-5500",
        filename: "po-scan.png",
        mimeType: "image/png",
        sizeBytes: 512000,
        contentText: null,
      },
    ],
  },
  {
    externalMessageId: "mock-extraction-fail-008",
    provider: "mock",
    sender: "buyer@example-seafood.test",
    recipient: "orders@seadock.local",
    subject: "Purchase Order with no extractable content",
    receivedAt: "2026-11-12T10:10:00.000Z",
    threadId: "thread-fail",
    snippet: "PO email missing body text",
    bodyText: "",
    hasAttachments: false,
    attachments: [],
  },
  {
    externalMessageId: "mock-ready-po-009",
    provider: "mock",
    sender: "buyer@example-seafood.test",
    recipient: "orders@seadock.local",
    subject: "Purchase Order PO-6600",
    receivedAt: "2026-11-12T10:20:00.000Z",
    threadId: "thread-6600",
    snippet: "Complete PO ready for review",
    bodyText: [
      "Customer: Example Seafood Buyer",
      "PO Number: PO-6600",
      "PO Date: 2026-11-12",
      "Required Delivery: 2026-11-18",
      "Priority: Normal",
      "",
      "Indian Mackerel - 500 kg",
    ].join("\n"),
    hasAttachments: false,
    attachments: [],
  },
];

export class MockEmailProvider implements EmailProvider {
  readonly id = "mock" as const;

  async listMessages(input: ListMessagesInput = {}): Promise<ListMessagesResult> {
    const limit = input.limit ?? 50;
    return { messages: MOCK_MESSAGES.slice(0, limit), nextPageToken: null };
  }

  async getMessage(externalMessageId: string): Promise<InboundEmailMessage | null> {
    return MOCK_MESSAGES.find((message) => message.externalMessageId === externalMessageId) ?? null;
  }

  async markProcessed(): Promise<void> {
    // No external side effects in mock mode.
  }

  async testConnection() {
    return { ok: true, accountEmail: "mock-inbox@seadock.local" };
  }
}

export function getMockMailboxMessages(): InboundEmailMessage[] {
  return MOCK_MESSAGES;
}
