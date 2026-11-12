export type PendingActionStatus =
  | "po_awaiting_verification"
  | "incoming_qaqc_pending"
  | "processing_pending"
  | "final_qaqc_pending"
  | "dispatch_pending";

export type StatusTone = "warning" | "info" | "neutral";

export interface DashboardCard {
  id: string;
  label: string;
  value: string;
  detail: string;
  href?: string;
}

export interface PendingAction {
  id: string;
  status: PendingActionStatus;
  reference: string;
  detail: string;
  since: string;
  href: string;
}

export interface PendingActionView {
  id: string;
  statusLabel: string;
  tone: StatusTone;
  reference: string;
  detail: string;
  since: string;
  href: string;
}

export interface ActivityView {
  id: string;
  time: string;
  user: string;
  action: string;
  record: string;
}

export interface NotificationPreview {
  id: string;
  title: string;
  detail: string;
  href: string;
}

export interface DashboardSummary {
  cards: DashboardCard[];
  pendingActions: PendingActionView[];
  recentActivity: ActivityView[];
}
