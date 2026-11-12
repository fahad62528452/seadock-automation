const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;

const numberFormat = new Intl.NumberFormat("en-US");

export function formatCount(value: number): string {
  return numberFormat.format(value);
}

export function formatKg(value: number): string {
  return `${numberFormat.format(value)} kg`;
}

/** Stable calendar format for operational timestamps. */
export function formatTimestamp(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;

  const day = String(date.getUTCDate()).padStart(2, "0");
  const month = MONTHS[date.getUTCMonth()];
  const year = date.getUTCFullYear();
  const hours24 = date.getUTCHours();
  const suffix = hours24 >= 12 ? "PM" : "AM";
  const hours12 = hours24 % 12 || 12;
  const minutes = String(date.getUTCMinutes()).padStart(2, "0");

  return `${day} ${month} ${year}, ${hours12}:${minutes} ${suffix}`;
}

export function initials(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}
