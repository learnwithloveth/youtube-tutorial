'use client';

import { forwardRef, useId, useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import type {
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from 'react';

import { cn } from '@/shared/lib/cn';

/**
 * Form controls.
 *
 * Client Components because `useId` generates the label/control association and
 * because these are the inputs of interactive forms. The `id` is generated
 * rather than hand-written so that rendering the same field twice on a page —
 * a footer newsletter box and one in the hero, say — cannot produce two elements
 * with the same id and break the label association for both.
 */

const CONTROL =
  'w-full rounded-md border border-line bg-bg-elev/60 px-4 text-sm text-fg placeholder:text-fg-subtle ' +
  'backdrop-blur-md outline-none transition-all duration-300 ease-[var(--ease-out-expo)] ' +
  'hover:border-line-strong focus:border-brand-soft focus:ring-4 focus:ring-[color-mix(in_oklab,var(--brand)_22%,transparent)]';

interface FieldShellProps {
  label: string;
  hint?: string;
  error?: string;
  htmlFor: string;
  children: ReactNode;
  className?: string;
}

export function FieldShell({ label, hint, error, htmlFor, children, className }: FieldShellProps) {
  return (
    <div className={cn('space-y-2', className)}>
      <label htmlFor={htmlFor} className="block text-sm font-medium text-fg">
        {label}
      </label>
      {children}
      {error ? (
        <p className="text-xs text-down" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className="text-xs text-fg-subtle">{hint}</p>
      ) : null}
    </div>
  );
}

export interface TextFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  hint?: string;
  error?: string;
  adornment?: ReactNode;
  wrapperClassName?: string;
}

export const TextField = forwardRef<HTMLInputElement, TextFieldProps>(function TextField(
  { label, hint, error, adornment, className, wrapperClassName, id, ...rest },
  ref,
) {
  const generated = useId();
  const inputId = id ?? generated;

  return (
    <FieldShell
      label={label}
      hint={hint}
      error={error}
      htmlFor={inputId}
      className={wrapperClassName}
    >
      <div className="relative">
        <input
          ref={ref}
          id={inputId}
          aria-invalid={Boolean(error)}
          className={cn(CONTROL, 'h-12', adornment && 'pr-12', className)}
          {...rest}
        />
        {adornment ? (
          <span className="absolute inset-y-0 right-3 flex items-center text-fg-subtle">
            {adornment}
          </span>
        ) : null}
      </div>
    </FieldShell>
  );
});

/**
 * A password box with a reveal toggle.
 *
 * ── Why a component and not three more copies of the same eight lines ─────────
 * The eye lived inline in the sign-up, sign-in and reset forms, spelled the same
 * way each time. Adding it to the three boxes in Settings would have made six,
 * and the sixth is where the label stops saying "Show password" and the icon
 * stops being the same size as the others.
 *
 * ── Why it is worth having at all ─────────────────────────────────────────────
 * A password nobody can read is a password typed wrong, and the place that hurts
 * most is exactly this form: three boxes, one of which has to match another, with
 * a mistake reported only after a round trip. Revealing is the person's own
 * choice about their own screen.
 *
 * ── `type` is what changes, not the value ─────────────────────────────────────
 * The input stays uncontrolled, so this works the same inside a Server Action
 * form — where the value is read from the submitted FormData and never lives in
 * React state — as it does in a controlled one.
 */
export type PasswordFieldProps = Omit<TextFieldProps, 'type' | 'adornment'>;

export const PasswordField = forwardRef<HTMLInputElement, PasswordFieldProps>(
  function PasswordField(props, ref) {
    const [visible, setVisible] = useState(false);

    return (
      <TextField
        ref={ref}
        {...props}
        type={visible ? 'text' : 'password'}
        adornment={
          <button
            type="button"
            // Never a submit button: this sits inside a form, and the default type
            // would send it on every click of the eye.
            onClick={() => setVisible((shown) => !shown)}
            aria-label={visible ? 'Hide password' : 'Show password'}
            aria-pressed={visible}
            className="transition-colors hover:text-fg"
          >
            {visible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
          </button>
        }
      />
    );
  },
);

export interface SelectFieldProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label: string;
  hint?: string;
  options: { value: string; label: string }[];
}

export function SelectField({ label, hint, options, className, id, ...rest }: SelectFieldProps) {
  const generated = useId();
  const selectId = id ?? generated;

  return (
    <FieldShell label={label} hint={hint} htmlFor={selectId}>
      <select id={selectId} className={cn(CONTROL, 'h-12 appearance-none', className)} {...rest}>
        {options.map((option) => (
          <option key={option.value} value={option.value} className="bg-bg-elev text-fg">
            {option.label}
          </option>
        ))}
      </select>
    </FieldShell>
  );
}

export interface TextAreaFieldProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label: string;
  hint?: string;
}

export function TextAreaField({ label, hint, className, id, ...rest }: TextAreaFieldProps) {
  const generated = useId();
  const areaId = id ?? generated;

  return (
    <FieldShell label={label} hint={hint} htmlFor={areaId}>
      <textarea
        id={areaId}
        className={cn(CONTROL, 'min-h-32 py-3 leading-relaxed', className)}
        {...rest}
      />
    </FieldShell>
  );
}
