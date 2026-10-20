"use client";

import { useCallback, useEffect, useId, useRef, type ReactNode } from "react";
import { X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Accessible dialog.
 *
 * Focus moves in on open and returns to the trigger on close, Escape and the
 * backdrop both dismiss, and focus is trapped while the dialog is open.
 */
export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = "md",
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  size?: "sm" | "md" | "lg";
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);
  // Callers pass a fresh onClose on every render (an inline arrow). Reading it
  // through a ref keeps the effect below tied to `open` alone; otherwise every
  // keystroke in the dialog re-ran it and yanked focus back to the first button.
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });
  const titleId = useId();
  const descriptionId = useId();

  const focusables = useCallback((): HTMLElement[] => {
    if (!panelRef.current) return [];
    return Array.from(
      panelRef.current.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ),
    ).filter((element) => element.offsetParent !== null);
  }, []);

  useEffect(() => {
    if (!open) return;
    previouslyFocused.current = document.activeElement as HTMLElement | null;
    const timer = window.setTimeout(() => {
      // Start in the first field, not on the close button.
      const candidates = focusables();
      const field = candidates.find((element) => element.matches("input, select, textarea"));
      (field ?? candidates[0] ?? panelRef.current)?.focus();
    }, 20);

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab") return;
      const candidates = focusables();
      if (candidates.length === 0) return;
      const first = candidates[0];
      const last = candidates[candidates.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";

    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = overflow;
      previouslyFocused.current?.focus();
    };
  }, [open, focusables]);

  if (!open) return null;

  const width = { sm: "max-w-md", md: "max-w-xl", lg: "max-w-3xl" }[size];

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4">
      <div
        className="fade absolute inset-0 bg-black/45"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        tabIndex={-1}
        className={cn(
          "rise relative flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-xl border border-border bg-surface shadow-[var(--shadow-lg)] sm:rounded-xl",
          width,
        )}
      >
        <div className="flex items-start justify-between gap-4 border-b border-border px-4 py-3">
          <div className="min-w-0">
            <h2 id={titleId} className="text-sm font-semibold text-fg">
              {title}
            </h2>
            {description ? (
              <p id={descriptionId} className="mt-0.5 text-xs text-fg-muted">
                {description}
              </p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="-mr-1 rounded-md p-1.5 text-fg-subtle transition-colors hover:bg-surface-2 hover:text-fg"
            aria-label="Close dialog"
          >
            <X className="size-4" aria-hidden="true" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">{children}</div>
        {footer ? <div className="flex flex-wrap justify-end gap-2 border-t border-border px-4 py-3">{footer}</div> : null}
      </div>
    </div>
  );
}

/** Confirmation dialog for anything that is awkward to undo. */
export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel = "Confirm",
  tone = "primary",
  loading = false,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: ReactNode;
  confirmLabel?: string;
  tone?: "primary" | "danger";
  loading?: boolean;
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button variant={tone === "danger" ? "danger" : "primary"} onClick={onConfirm} loading={loading}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="text-sm text-fg-muted">{message}</div>
    </Modal>
  );
}
