'use client';

import { useCallback, useEffect, useState } from 'react';

import { MAX_ATTACHMENT_BYTES } from '@/modules/support';

import type { ComposerAttachment } from './chat-composer';

/**
 * Picking an image and getting it stored, before the message that references it.
 *
 * ── Uploaded on pick, not on send ──────────────────────────────────────────────
 * The slow part then happens while somebody is still typing their caption, and a
 * file that is going to be refused is refused before they have written one. The
 * row is stored unattached and claimed by the message — see `postMessage`.
 *
 * ── The preview is the local file ──────────────────────────────────────────────
 * An object URL over the `File`, not the copy on the server. Fetching it back to
 * draw a thumbnail of something already on the machine is a round trip nobody
 * should wait through — and the revoke on unmount is what keeps a widget opened
 * and closed all day from accumulating one per image.
 */
export function useAttachment(): {
  attachment: ComposerAttachment | null;
  setAttachment: (next: ComposerAttachment | null) => void;
  uploading: boolean;
  error: string | null;
  clearError: () => void;
  attach: (file: File) => Promise<void>;
} {
  const [attachment, setAttachment] = useState<ComposerAttachment | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(
    () => () => {
      if (attachment !== null) URL.revokeObjectURL(attachment.preview);
    },
    [attachment],
  );

  const attach = useCallback(async (file: File) => {
    // Checked here as well as on the server: refusing a large photograph before it
    // crosses the network is the difference between an instant message and a long
    // wait for a rejection.
    if (file.size > MAX_ATTACHMENT_BYTES) {
      setError('That image is larger than 2MB. A screenshot is usually well under it.');
      return;
    }

    setUploading(true);
    setError(null);
    try {
      const form = new FormData();
      form.append('file', file);

      const response = await fetch('/api/support/attachments', { method: 'POST', body: form });
      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as { error?: string };
        setError(payload.error ?? 'That image could not be uploaded.');
        return;
      }

      const { attachmentId } = (await response.json()) as { attachmentId: string };
      setAttachment({ id: attachmentId, preview: URL.createObjectURL(file), name: file.name });
    } catch {
      setError('That image could not be uploaded. Check your connection.');
    } finally {
      setUploading(false);
    }
  }, []);

  const clearError = useCallback(() => setError(null), []);

  return { attachment, setAttachment, uploading, error, clearError, attach };
}
