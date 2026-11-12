import { cn } from "@/lib/cn";
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        <h2 className="text-[16px] font-semibold text-ink">{title}</h2>
        {description ? <p className="mt-0.5 text-[13px] text-ink-muted">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
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
        "inline-flex h-9 items-center justify-center rounded-md px-3 text-[13px] font-medium disabled:cursor-not-allowed disabled:opacity-50",
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
  "h-9 w-full rounded-md border border-border bg-surface px-3 text-[13px] text-ink outline-none placeholder:text-ink-muted focus:border-primary disabled:bg-surface-muted";

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
        "min-h-20 w-full rounded-md border border-border bg-surface px-3 py-2 text-[13px] text-ink outline-none placeholder:text-ink-muted focus:border-primary",
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

export function StatusBadge({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex rounded border border-border bg-surface-muted px-1.5 py-0.5 text-[11px] font-medium text-ink-secondary">
      {children}
    </span>
  );
}
