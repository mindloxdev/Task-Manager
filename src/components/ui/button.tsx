"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";

import { cn } from "@/lib/utils";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "accent" | "link";
export type ButtonSize = "sm" | "md" | "lg" | "icon";

const VARIANTS: Record<ButtonVariant, string> = {
  primary: "bg-primary text-primary-fg hover:bg-primary-hover border border-transparent",
  secondary: "bg-surface text-fg border border-border hover:bg-surface-2 hover:border-border-strong",
  ghost: "bg-transparent text-fg-muted border border-transparent hover:bg-surface-2 hover:text-fg",
  danger: "bg-transparent text-overdue border border-overdue/40 hover:bg-overdue-bg",
  accent: "bg-accent text-accent-fg hover:bg-accent-hover border border-transparent",
  link: "bg-transparent text-primary underline-offset-4 hover:underline border border-transparent px-0",
};

const SIZES: Record<ButtonSize, string> = {
  // Comfortable hit areas: at least 36px tall, 44px on the primary call to action.
  sm: "h-9 px-2.5 text-xs gap-1.5",
  md: "h-10 px-3.5 text-sm gap-2",
  lg: "h-11 px-5 text-sm gap-2",
  icon: "size-10 justify-center",
};

const BASE =
  "inline-flex items-center justify-center rounded-md font-semibold transition-colors duration-150 " +
  "disabled:pointer-events-none disabled:opacity-50 whitespace-nowrap select-none";

type CommonProps = {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  children?: ReactNode;
  className?: string;
};

export function Button({
  variant = "secondary",
  size = "md",
  loading = false,
  className,
  children,
  disabled,
  ...rest
}: CommonProps & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      className={cn(BASE, VARIANTS[variant], SIZES[size], className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading ? <Loader2 className="size-3.5 animate-spin" aria-hidden="true" /> : null}
      {children}
    </button>
  );
}

export function ButtonLink({
  href,
  variant = "secondary",
  size = "md",
  className,
  children,
  prefetch,
}: CommonProps & { href: string; prefetch?: boolean }) {
  return (
    <Link href={href} prefetch={prefetch} className={cn(BASE, VARIANTS[variant], SIZES[size], className)}>
      {children}
    </Link>
  );
}
