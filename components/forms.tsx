"use client";

import { useActionState, useEffect, useRef, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import type { ActionResult } from "@/app/actions";
import { cx } from "./ui";

type Action = (prev: ActionResult | null, fd: FormData) => Promise<ActionResult>;

export function SubmitButton({
  children,
  variant = "primary",
  className,
  title,
  name,
  value,
}: {
  children: ReactNode;
  variant?: "primary" | "ghost" | "danger" | "success" | "warn";
  className?: string;
  title?: string;
  name?: string;
  value?: string;
}) {
  const { pending } = useFormStatus();
  const v = {
    primary: "bg-sky-500 text-white hover:bg-sky-400 shadow-lg shadow-sky-500/20",
    ghost: "bg-white/5 text-slate-200 ring-1 ring-white/10 hover:bg-white/10",
    danger: "bg-rose-500/15 text-rose-300 ring-1 ring-rose-500/30 hover:bg-rose-500/25",
    success: "bg-emerald-500 text-white hover:bg-emerald-400 shadow-lg shadow-emerald-500/20",
    warn: "bg-amber-500/15 text-amber-200 ring-1 ring-amber-500/30 hover:bg-amber-500/25",
  }[variant];
  return (
    <button type="submit" name={name} value={value} disabled={pending} title={title} className={cx("inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition disabled:cursor-wait disabled:opacity-60", v, className)}>
      {pending && <span className="h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />}
      {children}
    </button>
  );
}

export function ActionForm({
  action,
  children,
  className,
  resetOnSuccess,
  confirmText,
  messageClassName,
}: {
  action: Action;
  children: ReactNode;
  className?: string;
  resetOnSuccess?: boolean;
  confirmText?: string;
  messageClassName?: string;
}) {
  const [state, formAction] = useActionState(action, null);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state?.ok && resetOnSuccess) ref.current?.reset();
  }, [state, resetOnSuccess]);
  return (
    <form
      ref={ref}
      action={formAction}
      className={className}
      onSubmit={(e) => {
        if (confirmText && !window.confirm(confirmText)) e.preventDefault();
      }}
    >
      {children}
      {state && (
        <p role="status" className={cx("mt-2 text-xs", state.ok ? "text-emerald-300" : "text-rose-300", messageClassName)}>
          {state.message}
        </p>
      )}
    </form>
  );
}
