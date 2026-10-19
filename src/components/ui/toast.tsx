"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from "lucide-react";

import { cn } from "@/lib/utils";

export type ToastTone = "success" | "error" | "info" | "warning";

export type Toast = {
  id: number;
  tone: ToastTone;
  title: string;
  description?: string;
};

type ToastContextValue = {
  toast: (input: { tone?: ToastTone; title: string; description?: string }) => void;
  dismiss: (id: number) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

const TONE_STYLES: Record<ToastTone, { icon: typeof Info; className: string; label: string }> = {
  success: { icon: CheckCircle2, className: "text-track", label: "Success" },
  error: { icon: XCircle, className: "text-overdue", label: "Error" },
  warning: { icon: AlertTriangle, className: "text-risk", label: "Warning" },
  info: { icon: Info, className: "text-primary", label: "Information" },
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((item) => item.id !== id));
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
  }, []);

  const toast = useCallback(
    ({ tone = "info", title, description }: { tone?: ToastTone; title: string; description?: string }) => {
      const id = nextId.current++;
      setToasts((current) => [...current.slice(-3), { id, tone, title, description }]);
      // Errors stay longer, because they usually need reading twice.
      const timer = setTimeout(() => dismiss(id), tone === "error" ? 8000 : 4500);
      timers.current.set(id, timer);
    },
    [dismiss],
  );

  useEffect(() => {
    const pending = timers.current;
    return () => {
      for (const timer of pending.values()) clearTimeout(timer);
      pending.clear();
    };
  }, []);

  const value = useMemo(() => ({ toast, dismiss }), [toast, dismiss]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex flex-col items-center gap-2 p-4 sm:inset-x-auto sm:right-0 sm:items-end"
        role="region"
        aria-label="Notifications"
      >
        {toasts.map((item) => {
          const tone = TONE_STYLES[item.tone];
          const Icon = tone.icon;
          return (
            <div
              key={item.id}
              role="status"
              aria-live={item.tone === "error" ? "assertive" : "polite"}
              className="rise pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-lg border border-border bg-surface p-3 shadow-[var(--shadow-lg)]"
            >
              <Icon className={cn("mt-0.5 size-4 shrink-0", tone.className)} aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-fg">
                  <span className="sr-only">{tone.label}: </span>
                  {item.title}
                </p>
                {item.description ? <p className="mt-0.5 text-xs text-fg-muted">{item.description}</p> : null}
              </div>
              <button
                type="button"
                onClick={() => dismiss(item.id)}
                className="rounded p-1 text-fg-subtle transition-colors hover:bg-surface-2 hover:text-fg"
                aria-label="Dismiss notification"
              >
                <X className="size-3.5" aria-hidden="true" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) throw new Error("useToast must be used inside <ToastProvider>.");
  return context;
}
