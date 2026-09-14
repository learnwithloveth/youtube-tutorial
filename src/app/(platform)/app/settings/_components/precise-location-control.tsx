'use client';

import { useEffect, useState } from 'react';
import { Crosshair, Globe, LoaderCircle, MapPin, ShieldOff } from 'lucide-react';

import { Button } from '@/shared/ui/primitives/button';
import { Badge } from '@/shared/ui/primitives/badge';
import { cn } from '@/shared/lib/cn';

import { PRECISE_LOCATION_KEY } from '../../../../_providers/presence-storage';

/**
 * The one place precise location is ever asked for.
 *
 * ── Why a control and not a prompt on page load ────────────────────────────────
 * A geolocation prompt can be answered once. A visitor who denies it — and an
 * unexplained dialog on arrival is denied almost every time — has denied it
 * permanently, and there is no second chance to explain. Chrome and Safari both
 * suppress the prompt entirely without a user gesture, so the drive-by version
 * does not even reliably appear.
 *
 * So the ask lives behind a button, next to a sentence saying what it is for and
 * what happens either way. The account keeps working identically if it is refused:
 * the coarse, connection-derived location is already there and needs nothing from
 * the visitor.
 *
 * ── The browser is the authority ───────────────────────────────────────────────
 * The flag written here records our own intent to use the permission; it can never
 * grant one. State is read back from the Permissions API so that revoking access in
 * the browser's own UI is reflected here, rather than this panel claiming precise
 * location is on while the browser refuses every call.
 */

type Grant = 'unknown' | 'granted' | 'prompt' | 'denied' | 'unsupported';

export function PreciseLocationControl() {
  const [grant, setGrant] = useState<Grant>('unknown');
  const [enabled, setEnabled] = useState(false);
  const [asking, setAsking] = useState(false);

  /**
   * Reads the browser's answer once, then follows it.
   *
   * Every `setState` below happens in a callback rather than in the effect body,
   * which is not a lint technicality: the state here mirrors an external system —
   * a permission the browser owns and can change without us — and the effect's job
   * is to subscribe to it, not to compute an initial render from it. `unsupported`
   * and `prompt` go through the same promise for exactly that reason, so there is
   * one path in and one place the state is written.
   */
  useEffect(() => {
    let cancelled = false;
    let status: PermissionStatus | null = null;

    const sync = () => {
      if (!cancelled && status) setGrant(status.state as Grant);
    };

    void readPermission().then((result) => {
      if (cancelled) return;

      setEnabled(readFlag());

      if (result.kind === 'watchable') {
        status = result.status;
        status.addEventListener('change', sync);
        sync();
      } else {
        setGrant(result.grant);
      }
    });

    return () => {
      cancelled = true;
      status?.removeEventListener('change', sync);
    };
  }, []);

  const ask = () => {
    setAsking(true);
    // The prompt is raised by this call, inside the click handler, which is the
    // gesture browsers require before they will show it at all.
    navigator.geolocation.getCurrentPosition(
      () => {
        writeFlag(true);
        setEnabled(true);
        setGrant('granted');
        setAsking(false);
      },
      (error) => {
        // PERMISSION_DENIED is 1. The other codes mean the browser could not get a
        // position right now, which is not a refusal and should not be recorded as
        // one — the permission may still be granted.
        if (error.code === error.PERMISSION_DENIED) setGrant('denied');
        setAsking(false);
      },
      { enableHighAccuracy: false, maximumAge: 300_000, timeout: 15_000 },
    );
  };

  const turnOff = () => {
    writeFlag(false);
    setEnabled(false);
  };

  const on = enabled && grant === 'granted';

  return (
    <div className="flex flex-wrap items-start justify-between gap-4 py-3.5">
      <div className="min-w-0 max-w-xl">
        <p className="flex items-center gap-2 text-sm text-fg">
          <MapPin className="size-4 text-brand-soft" />
          Precise location
        </p>
        <p className="mt-1 text-xs leading-relaxed text-fg-subtle">
          Share your device&rsquo;s location so sign-ins from an unfamiliar place are
          easier for our security team to tell apart from your own. Optional — with it
          off we still see the approximate area your connection comes from, which is
          what every website sees.
        </p>

        {grant === 'denied' ? (
          <p className="mt-2 flex items-start gap-1.5 text-xs text-warn">
            <ShieldOff className="mt-0.5 size-3.5 shrink-0" />
            <span>
              Location is blocked for this site in your browser. Re-enable it from the
              icon in the address bar — we cannot ask again from here.
            </span>
          </p>
        ) : null}

        {grant === 'unsupported' ? (
          <p className="mt-2 flex items-start gap-1.5 text-xs text-fg-subtle">
            <Globe className="mt-0.5 size-3.5 shrink-0" />
            <span>This browser does not offer location. Nothing else changes.</span>
          </p>
        ) : null}
      </div>

      <div className="flex shrink-0 items-center gap-2">
        {on ? (
          <>
            <Badge tone="up">
              <Crosshair className="size-3" />
              On
            </Badge>
            <Button variant="ghost" size="sm" onClick={turnOff}>
              Turn off
            </Button>
          </>
        ) : (
          <Button
            variant="outline"
            size="sm"
            onClick={ask}
            disabled={asking || grant === 'denied' || grant === 'unsupported'}
            className={cn(asking && 'pointer-events-none')}
          >
            {asking ? (
              <>
                <LoaderCircle className="size-3.5 animate-spin" />
                Waiting for your browser
              </>
            ) : (
              'Share precise location'
            )}
          </Button>
        )}
      </div>
    </div>
  );
}

type PermissionReading =
  | { readonly kind: 'watchable'; readonly status: PermissionStatus }
  | { readonly kind: 'fixed'; readonly grant: Grant };

/**
 * Asks the browser what it has already decided about geolocation.
 *
 * Always a promise, even for the two answers that are known synchronously, so the
 * caller has one path to handle rather than three. `prompt` is the honest reading
 * where the Permissions API is missing: the browser has not refused, it simply
 * cannot be asked without asking the person.
 */
async function readPermission(): Promise<PermissionReading> {
  if (typeof navigator === 'undefined' || !('geolocation' in navigator)) {
    return { kind: 'fixed', grant: 'unsupported' };
  }
  if (!navigator.permissions?.query) {
    return { kind: 'fixed', grant: 'prompt' };
  }

  try {
    return { kind: 'watchable', status: await navigator.permissions.query({ name: 'geolocation' }) };
  } catch {
    // Some browsers reject the geolocation descriptor outright rather than
    // reporting it as unsupported.
    return { kind: 'fixed', grant: 'prompt' };
  }
}

function readFlag(): boolean {
  try {
    return window.localStorage.getItem(PRECISE_LOCATION_KEY) === 'on';
  } catch {
    return false;
  }
}

function writeFlag(on: boolean): void {
  try {
    if (on) window.localStorage.setItem(PRECISE_LOCATION_KEY, 'on');
    else window.localStorage.removeItem(PRECISE_LOCATION_KEY);
  } catch {
    /* private window or blocked storage — the permission itself still holds */
  }
}
