import type { CustomerMatchResult } from "@/types/email";

export interface MatchableCustomer {
  id: string;
  email: string | null;
  name: string;
}

function extractEmail(sender: string | null): string | null {
  if (!sender) return null;
  const angle = sender.match(/<([^>]+)>/);
  const raw = (angle?.[1] ?? sender).trim().toLowerCase();
  return raw.includes("@") ? raw : null;
}

function domainOf(email: string): string {
  return email.split("@")[1] ?? "";
}

/**
 * Conservative customer matching. Never invents customers.
 * Domains alone do not force a match when multiple customers share them.
 */
export function matchCustomerFromSender(
  sender: string | null,
  customers: MatchableCustomer[],
): CustomerMatchResult {
  const email = extractEmail(sender);
  if (!email) {
    return { status: "no_match", customerId: null, customerIds: [], reason: "Sender email missing." };
  }

  const exact = customers.filter((customer) => customer.email?.trim().toLowerCase() === email);
  if (exact.length === 1) {
    return { status: "matched", customerId: exact[0].id, customerIds: [exact[0].id] };
  }
  if (exact.length > 1) {
    return {
      status: "multiple_matches",
      customerId: null,
      customerIds: exact.map((row) => row.id),
      reason: "Multiple customers share this email.",
    };
  }

  const domain = domainOf(email);
  if (!domain) {
    return { status: "no_match", customerId: null, customerIds: [] };
  }

  const byDomain = customers.filter((customer) => {
    const customerEmail = customer.email?.trim().toLowerCase();
    return customerEmail ? domainOf(customerEmail) === domain : false;
  });

  if (byDomain.length === 1) {
    return { status: "matched", customerId: byDomain[0].id, customerIds: [byDomain[0].id] };
  }
  if (byDomain.length > 1) {
    return {
      status: "multiple_matches",
      customerId: null,
      customerIds: byDomain.map((row) => row.id),
      reason: "Multiple customers share this email domain.",
    };
  }

  return {
    status: "no_match",
    customerId: null,
    customerIds: [],
    reason: "Customer could not be confidently identified.",
  };
}
