'use client';

import { useRef } from 'react';
import { Loader2, Plus, SendHorizontal, X } from 'lucide-react';

import { MAX_MESSAGE_LENGTH } from '@/modules/support';
import { cn } from '@/shared/lib/cn';

/**
 * The message composer: attach, type, send.
 *
 * ── One component, two surfaces ────────────────────────────────────────────────
 * The customer's widget and the operator's console had separate composers, and
 * they had already drifted: one grew with its content and took images, the other
 * was a fixed two-row box that could only send text. That is not a cosmetic
 * difference — an agent could not answer a screenshot with a screenshot.
 *
 * ── The box sizes itself with no JavaScript ────────────────────────────────────
 * A grid with one cell holding two stacked things: an invisible copy of the text,
 * and the textarea. The copy wraps identically, so the cell is always exactly as
 * tall as the content needs, and the textarea stretches to fill it.
 *
 * This replaced measuring `scrollHeight` in an effect and writing a pixel height
 * back. That version could disagree with the browser about how tall a line is and
 * left the box stuck several lines deep with a scrollbar over one sentence.
 * Nothing here measures anything: the browser lays the text out once and the box is
 * that size, correct on the first paint and under SSR, with no effect and no
 * reflow.
 *
 * ── The send button never moves ────────────────────────────────────────────────
 * It disables rather than being swapped for something else. A control that is
 * sometimes send and sometimes a camera makes the target under your thumb depend
 * on whether the box happens to be empty.
 */

export interface ComposerAttachment {
  readonly id: string;
  /** An object URL over the local file — see why in the widget. */
  readonly preview: string;
  readonly name: string;
}

export function ChatComposer({
  value,
  onChange,
  onSend,
  onAttach,
  attachment,
  onClearAttachment,
  uploading = false,
  sending = false,
  placeholder = 'Message',
}: {
  value: string;
  onChange: (next: string) => void;
  onSend: () => void;
  onAttach: (file: File) => void;
  attachment: ComposerAttachment | null;
  onClearAttachment: () => void;
  uploading?: boolean;
  sending?: boolean;
  placeholder?: string;
}) {
  const fileRef = useRef<HTMLInputElement>(null);

  // An image on its own is a message: somebody who screenshots the error has said
  // something, and demanding a caption would be a field between them and the point.
  const hasContent = value.trim().length > 0 || attachment !== null;

  return (
    <>
      {attachment !== null ? (
        <div className="flex items-center gap-2 border-t border-line bg-surface px-3 py-2">
          {/* eslint-disable-next-line @next/next/no-img-element --
              an object URL has no remote origin for next/image to optimise. */}
          <img
            src={attachment.preview}
            alt=""
            className="size-11 shrink-0 rounded-lg object-cover"
          />
          <span className="min-w-0 flex-1 truncate text-2xs text-fg-muted">
            {attachment.name}
          </span>
          <button
            type="button"
            onClick={onClearAttachment}
            className="grid size-7 shrink-0 place-items-center rounded-full text-fg-muted transition-colors hover:bg-surface-hover hover:text-fg"
          >
            <X className="size-3.5" />
            <span className="sr-only">Remove image</span>
          </button>
        </div>
      ) : null}

      <div className="flex items-end gap-1.5 border-t border-line bg-surface px-2 py-2">
        <input
          ref={fileRef}
          type="file"
          // A hint to the picker, not a control: the server decides from the bytes.
          accept="image/png,image/jpeg,image/webp"
          className="sr-only"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) onAttach(file);
            // Cleared so picking the same file twice in a row still fires `change`.
            event.target.value = '';
          }}
        />

        <CircleButton
          label="Attach an image"
          onClick={() => fileRef.current?.click()}
          disabled={uploading || attachment !== null}
        >
          {uploading ? <Loader2 className="size-5 animate-spin" /> : <Plus className="size-5" />}
        </CircleButton>

        <label className="relative grid max-h-28 min-h-9 flex-1 self-center overflow-y-auto rounded-2xl border border-line bg-bg-elev transition-colors focus-within:border-brand-soft">
          <span className="sr-only">{placeholder}</span>

          <span
            aria-hidden
            // Every property that affects wrapping has to match the textarea below
            // it, or the two disagree and the box is the wrong height by a line.
            // The trailing space is what keeps a newline at the end reserving one.
            className="invisible col-start-1 row-start-1 whitespace-pre-wrap break-words px-3.5 py-2 text-sm leading-snug"
          >
            {value + ' '}
          </span>

          <textarea
            value={value}
            rows={1}
            onChange={(event) => onChange(event.target.value.slice(0, MAX_MESSAGE_LENGTH))}
            onKeyDown={(event) => {
              // Enter sends, Shift+Enter is a newline — the convention everyone
              // already has in their fingers from every other chat.
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                onSend();
              }
            }}
            placeholder={placeholder}
            className="col-start-1 row-start-1 resize-none overflow-hidden whitespace-pre-wrap break-words border-0 bg-transparent px-3.5 py-2 text-sm leading-snug text-fg outline-none placeholder:text-fg-subtle"
          />
        </label>

        <CircleButton label="Send" onClick={onSend} disabled={!hasContent || sending} filled>
          {sending ? (
            <Loader2 className="size-5 animate-spin" />
          ) : (
            <SendHorizontal className="size-5" />
          )}
        </CircleButton>
      </div>
    </>
  );
}

function CircleButton({
  label,
  onClick,
  disabled,
  filled,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  filled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className={cn(
        'grid size-9 shrink-0 place-items-center rounded-full transition-colors',
        filled
          ? 'bg-brand text-on-brand hover:bg-brand-deep'
          : 'text-fg-muted hover:bg-surface-hover hover:text-fg',
        'disabled:pointer-events-none disabled:opacity-40',
      )}
    >
      {children}
    </button>
  );
}
