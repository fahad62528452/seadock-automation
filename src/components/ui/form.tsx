import { cn } from "@/lib/cn";
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";

export type BadgeTone = "neutral" | "info" | "success" | "warning" | "danger";

/**
 * Content-area chrome under the shell TopBar.
 * Prefer omitting `title` on presentation pages (TopBar already shows the page title).
 */
export function PageHeader({
  title,
  description,
  actions,
}: {
  title?: string;
  description?: string;
  actions?: ReactNode;
}) {
  if (!title && !description && !actions) return null;

  return (
    <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
      {title || description ? (
        <div className="min-w-0">
          {title ? <h2 className="text-[15px] font-semibold text-ink">{title}</h2> : null}
          {description ? (
            <p className={cn("text-[12px] leading-4 text-ink-muted", title && "mt-0.5")}>{description}</p>
          ) : null}
        </div>
      ) : (
        <div className="min-w-0" />
      )}
      {actions ? <div className="flex flex-shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

/** Actions + optional description without repeating the TopBar title. */
export function PageActions({ description, actions }: { description?: string; actions?: ReactNode }) {
  return <PageHeader description={description} actions={actions} />;
}

export function Button({
  variant = "primary",
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
}) {
  return (
    <button
      className={cn(
        "inline-flex h-8 items-center justify-center rounded-md px-3 text-[13px] font-medium disabled:cursor-not-allowed disabled:opacity-50",
        variant === "primary" && "bg-primary text-white hover:bg-primary-hover",
        variant === "secondary" && "border border-border bg-surface text-ink hover:bg-surface-muted",
        variant === "ghost" && "text-ink-secondary hover:bg-surface-muted hover:text-ink",
        variant === "danger" && "border border-border bg-surface text-warning hover:bg-surface-muted",
        className,
      )}
      {...props}
    />
  );
}

export function FormField({
  label,
  htmlFor,
  required,
  error,
  hint,
  children,
}: {
  label: string;
  htmlFor: string;
  required?: boolean;
  error?: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="block text-[12px] font-medium text-ink">
        {label}
        {required ? <span className="text-warning"> *</span> : null}
      </label>
      {children}
      {hint && !error ? <p className="text-[12px] text-ink-muted">{hint}</p> : null}
      {error ? (
        <p className="text-[12px] text-warning" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

const controlClass =
  "h-8 w-full rounded-md border border-border bg-surface px-2.5 text-[13px] text-ink outline-none placeholder:text-ink-muted focus:border-primary disabled:bg-surface-muted";

export function FormInput({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(controlClass, className)} {...props} />;
}

export function FormSelect({ className, children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={cn(controlClass, className)} {...props}>
      {children}
    </select>
  );
}

export function FormArea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cn(
        "min-h-20 w-full rounded-md border border-border bg-surface px-2.5 py-2 text-[13px] text-ink outline-none placeholder:text-ink-muted focus:border-primary",
        className,
      )}
      {...props}
    />
  );
}

export function Alert({
  tone = "info",
  children,
}: {
  tone?: "info" | "success" | "error";
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        "rounded-md border px-3 py-2 text-[13px]",
        tone === "info" && "border-border bg-surface-muted text-ink-secondary",
        tone === "success" && "border-primary/30 bg-primary-subtle text-primary-text",
        tone === "error" && "border-warning/30 bg-[#fff7ed] text-warning",
      )}
      role={tone === "error" ? "alert" : "status"}
    >
      {children}
    </div>
  );
}

const badgeToneClass: Record<BadgeTone, string> = {
  neutral: "border-border bg-surface-muted text-ink-secondary",
  info: "border-primary/20 bg-primary-subtle text-primary-text",
  success: "border-success/25 bg-success-subtle text-success",
  warning: "border-warning/25 bg-warning-subtle text-warning",
  danger: "border-danger/25 bg-danger-subtle text-danger",
};

export function StatusBadge({ children, tone = "neutral" }: { children: ReactNode; tone?: BadgeTone }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded px-1.5 py-0.5 text-[11px] font-medium leading-4",
        "border",
        badgeToneClass[tone],
      )}
    >
      {children}
    </span>
  );
}
