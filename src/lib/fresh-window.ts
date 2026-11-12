const FRESH_WINDOW_MS = 2 * 24 * 60 * 60 * 1000;
const APPROACHING_MS = 12 * 60 * 60 * 1000;

export type FreshWindowStatus = "fresh" | "approaching_deadline" | "expired_ready_for_frozen";

export function getFreshUntil(receivedAt: string): string {
  const received = new Date(receivedAt);
  return new Date(received.getTime() + FRESH_WINDOW_MS).toISOString();
}

export function getFreshWindowStatus(receivedAt: string, now = new Date()): FreshWindowStatus {
  const freshUntil = new Date(getFreshUntil(receivedAt)).getTime();
  const current = now.getTime();

  if (current >= freshUntil) return "expired_ready_for_frozen";
  if (freshUntil - current <= APPROACHING_MS) return "approaching_deadline";
  return "fresh";
}

export function freshWindowLabel(status: FreshWindowStatus): string {
  switch (status) {
    case "fresh":
      return "Fresh";
    case "approaching_deadline":
      return "Approaching Deadline";
    case "expired_ready_for_frozen":
      return "Expired / Ready for Frozen";
  }
}
