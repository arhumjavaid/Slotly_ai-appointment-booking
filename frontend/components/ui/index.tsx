'use client';

import type {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from 'react';
import { forwardRef } from 'react';
import { cn } from '@/lib/format';

/*
 * Small, unopinionated primitives shared across the app. They exist so spacing,
 * focus treatment and disabled states stay identical everywhere rather than
 * being re-invented per screen.
 */

const BUTTON_VARIANTS = {
  primary: 'bg-navy text-white shadow-card hover:bg-navy-hover disabled:bg-line-strong disabled:text-ink-3 disabled:shadow-none',
  secondary: 'bg-surface text-ink border border-line-strong shadow-card hover:bg-paper disabled:text-ink-3 disabled:shadow-none',
  ghost: 'text-ink-2 hover:bg-paper hover:text-ink',
  danger: 'bg-surface text-danger border border-line-strong hover:bg-danger-soft',
} as const;

const BUTTON_SIZES = {
  sm: 'h-8 px-3 text-[13px]',
  md: 'h-10 px-4 text-sm',
  lg: 'h-11 px-5 text-sm',
} as const;

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: keyof typeof BUTTON_VARIANTS;
  size?: keyof typeof BUTTON_SIZES;
  loading?: boolean;
}

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled,
  className,
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      // A loading button stays disabled so a slow request cannot be double-sent.
      disabled={disabled || loading}
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors',
        'disabled:cursor-not-allowed',
        BUTTON_VARIANTS[variant],
        BUTTON_SIZES[size],
        className,
      )}
      {...props}
    >
      {loading && <Spinner className={variant === 'primary' ? 'text-white' : 'text-ink-3'} />}
      {children}
    </button>
  );
}

export function Spinner({ className }: { className?: string }) {
  return (
    <svg
      className={cn('h-3.5 w-3.5 animate-spin', className)}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" opacity="0.25" />
      <path
        d="M12 2a10 10 0 0 1 10 10"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
}

interface FieldProps {
  label: string;
  htmlFor: string;
  error?: string;
  hint?: string;
  children: ReactNode;
}

export function Field({ label, htmlFor, error, hint, children }: FieldProps) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="block text-[13px] font-medium text-ink">
        {label}
      </label>
      {children}
      {error ? (
        <p id={`${htmlFor}-error`} role="alert" className="text-[13px] text-danger">
          {error}
        </p>
      ) : hint ? (
        <p className="text-[13px] text-ink-3">{hint}</p>
      ) : null}
    </div>
  );
}

const CONTROL_BASE =
  'w-full rounded-lg border bg-surface px-3 text-sm text-ink placeholder:text-ink-3 ' +
  'transition-[color,border-color,box-shadow] focus:border-navy focus:outline-none ' +
  'focus:ring-2 focus:ring-navy/15 disabled:bg-paper disabled:text-ink-3';

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }>(
  function Input({ className, invalid, ...props }, ref) {
    return (
      <input
        ref={ref}
        aria-invalid={invalid || undefined}
        className={cn(CONTROL_BASE, 'h-11', invalid ? 'border-danger' : 'border-line-strong', className)}
        {...props}
      />
    );
  },
);

export const Select = forwardRef<
  HTMLSelectElement,
  SelectHTMLAttributes<HTMLSelectElement> & { invalid?: boolean }
>(function Select({ className, invalid, children, ...props }, ref) {
  return (
    <select
      ref={ref}
      aria-invalid={invalid || undefined}
      className={cn(CONTROL_BASE, 'h-11', invalid ? 'border-danger' : 'border-line-strong', className)}
      {...props}
    >
      {children}
    </select>
  );
});

export const Textarea = forwardRef<
  HTMLTextAreaElement,
  TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean }
>(function Textarea({ className, invalid, ...props }, ref) {
  return (
    <textarea
      ref={ref}
      aria-invalid={invalid || undefined}
      className={cn(
        CONTROL_BASE,
        'py-2.5 leading-relaxed',
        invalid ? 'border-danger' : 'border-line-strong',
        className,
      )}
      {...props}
    />
  );
});

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div className={cn('rounded-xl border border-line bg-surface shadow-card', className)}>
      {children}
    </div>
  );
}

export function Alert({
  tone = 'error',
  title,
  children,
  action,
}: {
  tone?: 'error' | 'success' | 'info';
  title?: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  const tones = {
    error: 'bg-danger-soft text-danger border-danger/20',
    success: 'bg-ok-soft text-ok border-ok/20',
    info: 'bg-accent-soft text-accent border-accent/20',
  } as const;

  return (
    <div role={tone === 'error' ? 'alert' : 'status'} className={cn('rounded-lg border p-3', tones[tone])}>
      {title && <p className="text-sm font-medium">{title}</p>}
      <div className={cn('text-[13px]', title && 'mt-0.5')}>{children}</div>
      {action && <div className="mt-2.5">{action}</div>}
    </div>
  );
}

export function Badge({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium tracking-wide',
        className,
      )}
    >
      {children}
    </span>
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center px-6 py-14 text-center">
      <p className="text-sm font-medium text-ink">{title}</p>
      <p className="mt-1 max-w-sm text-[13px] text-ink-2">{description}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
