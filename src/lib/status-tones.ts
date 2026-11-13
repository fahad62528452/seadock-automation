import type { BadgeTone } from "@/components/ui/form";

/** Map common operational status strings to badge tones (visual only). */
export function toneForStatusLabel(label: string): BadgeTone {
  const value = label.toLowerCase();
  if (
    value.includes("fail") ||
    value.includes("cancel") ||
    value.includes("reject") ||
    value.includes("block") ||
    value.includes("error")
  ) {
    return "danger";
  }
  if (
    value.includes("urgent") ||
    value.includes("action required") ||
    value.includes("pending") ||
    value.includes("await") ||
    value.includes("conditional") ||
    value.includes("partial") ||
    value.includes("expir") ||
    value.includes("due")
  ) {
    return "warning";
  }
  if (
    value.includes("pass") ||
    value.includes("approv") ||
    value.includes("complete") ||
    value.includes("dispatch") ||
    value.includes("fulfil") ||
    value.includes("ready") ||
    value.includes("accept")
  ) {
    return "success";
  }
  if (value.includes("review") || value.includes("draft") || value.includes("allocat") || value.includes("process")) {
    return "info";
  }
  return "neutral";
}
