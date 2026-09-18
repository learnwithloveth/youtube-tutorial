'use client';

import { motion } from 'motion/react';
import { BellRing, Check, Loader2, MonitorDown, RotateCw, ShieldAlert } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';

import { usePush, type PushState } from '@/shared/firebase/use-push';
import { cn } from '@/shared/lib/cn';
import { useScrollLock } from '@/shared/lib/hooks';

import { CONSOLE_APP } from '../../_lib/console-app';
import {
  promptInstall,
  useApplePlatform,
  useConsoleWindow,
  useInstallOffer,
  useInstalledHere,
} from '../_lib/console-install';

/**
 * The console is not usable until it is installed and its notifications are on.
 *
 * ── Why this is enforced rather than suggested ────────────────────────────────
 * An operator is the alerting channel. A withdrawal waiting for approval, a KYC
 * submission, a customer on the support queue — none of it reaches anyone unless
 * an operator's device is set up to be reached, and a console left in a browser
 * tab with notifications off is a console nobody is watching. Both halves matter,
 * and neither substitutes for the other: installing gives the notifications a
 * switch of their own in the operating system (see `_lib/console-app.ts`), and
 * granting permission is what actually delivers them.
 *
 * So this covers the whole console — mounted in `(admin)/layout.tsx`, above every
 * route under it — and has no dismiss. There is nothing to read behind it.
 *
 * ── Checked in the background, and only then shown ────────────────────────────
 * Neither answer is available during render. The display mode is known on the
 * first client render, but `beforeinstallprompt` arrives whenever the browser
 * decides, and the push state resolves through `isSupported()` and a permission
 * read. Rendering the demand before those settle would flash it at an operator
 * who has already done both, so nothing appears for {@link SETTLE_MS}.
 *
 * The checks keep running afterwards, so the gate opens by itself: turn
 * notifications on and it goes, without a reload.
 *
 * ── What it does not claim to know ────────────────────────────────────────────
 * A page can see that it *is* the installed app. It cannot see, from a tab, that
 * the app exists somewhere — Chrome simply stops offering, and Firefox and Safari
 * never offer. So an operator in a tab is asked to open the app, with the install
 * button beside it when the browser offers one; the gate does not guess which of
 * the two they need.
 *
 * This is deliberately a wall for an operator on a browser that cannot install a
 * web app or cannot take a push subscription. The instruction there is to open the
 * console in Chrome or Edge, which is the honest answer.
 */

/** Long enough for the install offer and the push state to settle. */
const SETTLE_MS = 1_500;

export function ConsoleReadinessGate({ operatorId }: { operatorId: string }) {
  const where = useConsoleWindow();
  const offered = useInstallOffer();
  const installedHere = useInstalledHere();
  const { state, error, enable } = usePush(operatorId, CONSOLE_APP.scope);

  const [settled, setSettled] = useState(false);
  useEffect(() => {
    const timer = window.setTimeout(() => setSettled(true), SETTLE_MS);
    return () => window.clearTimeout(timer);
  }, []);

  const installed = where === 'app';
  // `unconfigured` is a deployment with no push service at all — there is no
  // switch for an operator to find, so it is not demanded of them. It is also the
  // state before the check resolves, which is what `settled` is for; if it
  // resolves later the gate appears then.
  const demandable = state !== 'unconfigured';
  const notified = state === 'granted';
  const blocking = settled && (!installed || (demandable && !notified));

  useScrollLock(blocking);

  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const node = panel.current;
    if (!blocking || node === null) return;

    node.focus();
    // Keyboard focus is kept inside: the console behind this is not to be
    // operated, and a tab away from the dialog would reach it.
    const contain = (event: FocusEvent) => {
      if (!node.contains(event.target as Node | null)) node.focus();
    };
    document.addEventListener('focusin', contain);
    return () => document.removeEventListener('focusin', contain);
  }, [blocking]);

  if (!blocking) return null;

  return (
    <div
      className="fixed inset-0 z-[110] grid place-items-center overflow-y-auto bg-bg-sunken/90 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="console-readiness-title"
    >
      <motion.div
        ref={panel}
        tabIndex={-1}
        initial={{ opacity: 0, y: 10, scale: 0.99 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
        className="w-full max-w-lg rounded-xl border border-line bg-bg-elev shadow-float outline-none"
      >
        <header className="flex gap-3.5 border-b border-line px-6 py-5">
          <span className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-full border border-warn/40 text-warn">
            <ShieldAlert className="size-[18px]" />
          </span>
          <div className="min-w-0">
            <h2 id="console-readiness-title" className="text-base font-medium text-fg">
              Finish setting up this device
            </h2>
            <p className="mt-1 text-sm leading-relaxed text-fg-muted">
              Approvals and support wait on an operator. The console stays locked on
              this device until it can reach you.
            </p>
          </div>
        </header>

        <ol className="divide-y divide-line">
          <Step
            index={1}
            done={installed}
            icon={<MonitorDown className="size-4" />}
            title="Install the console as an app"
            body="Installed, the console runs in a window of its own and its notifications get their own switch in your operating system — separate from the browser's."
          >
            <InstallAction installed={installed} offered={offered} installedHere={installedHere} />
          </Step>

          {/*
            Not gated behind step 1 any more.

            It used to be, on the reasoning that permission granted inside the
            installed app is what files the notifications under the console rather
            than under the browser. That is still true, and the body below still
            says so — but it is a reason to prefer an order, not a reason to take
            the switch away. An operator on a phone who cannot install yet, or who
            simply wants the prompt now, was left looking at a disabled step with
            nothing to press.
          */}
          <Step
            index={2}
            done={notified}
            icon={<BellRing className="size-4" />}
            title="Turn on system notifications"
            body="Alerts reach you while the console is closed. Best turned on inside the installed app, so your operating system files them under the console rather than the browser."
          >
            <NotificationAction state={state} error={error} onEnable={() => void enable()} />
          </Step>
        </ol>

        <footer className="border-t border-line px-6 py-3.5 text-2xs leading-relaxed text-fg-subtle">
          This check runs continuously. The console unlocks itself the moment both
          steps are done — no reload needed.
        </footer>
      </motion.div>
    </div>
  );
}

function Step({
  index,
  done,
  icon,
  title,
  body,
  children,
}: {
  index: number;
  done: boolean;
  icon: ReactNode;
  title: string;
  body: string;
  children: ReactNode;
}) {
  return (
    <li className="flex gap-3.5 px-6 py-5">
      <span
        aria-hidden
        className={cn(
          'mt-0.5 grid size-8 shrink-0 place-items-center rounded-full border text-xs font-medium',
          done ? 'border-up/40 text-up' : 'border-line text-fg-subtle',
        )}
      >
        {done ? <Check className="size-4" /> : icon}
      </span>
      <div className="min-w-0 flex-1">
        <h3 className="text-sm font-medium text-fg">
          <span className="text-fg-subtle">{index}.</span> {title}
        </h3>
        <p className="mt-1 text-xs leading-relaxed text-fg-muted">{body}</p>
        <div className="mt-3 text-xs">
          {done ? (
            <span className="inline-flex items-center gap-1.5 text-up">
              <Check className="size-3.5" />
              Done on this device
            </span>
          ) : (
            children
          )}
        </div>
      </div>
    </li>
  );
}

function InstallAction({
  installed,
  offered,
  installedHere,
}: {
  installed: boolean;
  offered: boolean;
  installedHere: boolean;
}) {
  if (installed) return null;

  if (installedHere) {
    return (
      <p className="leading-relaxed text-fg-muted">
        Installed. Carry on in the Console window that just opened — this tab can be
        closed.
      </p>
    );
  }

  if (offered) {
    return (
      <button type="button" onClick={promptInstall} className={PRIMARY}>
        <MonitorDown className="size-3.5" />
        Install the console
      </button>
    );
  }

  // No offer is not proof of anything: the app may already exist, or the browser
  // may never install one. Both readings are given, rather than picking one.
  return (
    <p className="leading-relaxed text-fg-muted">
      This browser is not offering to install. If the console is already installed,
      open it from your applications and continue there. Otherwise open the console
      in Chrome or Edge and use the install icon in the address bar — on iPhone or
      iPad, Share → Add to Home Screen.
    </p>
  );
}

/**
 * The switch, and what to say when there is nothing to switch.
 *
 * The button asks the operating system directly — `Notification.requestPermission`
 * by way of `usePush().enable` — so it raises the real system prompt wherever it
 * is pressed: Android's, Windows', macOS', or iOS's inside a Home Screen app. It
 * is always offered, never gated behind the install step, because a prompt an
 * operator can reach is worth more than a tidy order.
 *
 * What differs by platform is only the sentence shown when the browser admits it
 * cannot take a subscription at all. On Android and desktop that means the wrong
 * browser; on iPhone and iPad it means the console is not on the Home Screen yet,
 * and "use Chrome" would be advice that cannot work there — every iOS browser is
 * the same engine, and none of them take web push from a tab.
 */
function NotificationAction({
  state,
  error,
  onEnable,
}: {
  state: PushState;
  error: string | null;
  onEnable: () => void;
}) {
  const apple = useApplePlatform();

  return (
    <>
      {state === 'denied' ? (
        <p className="leading-relaxed text-fg-muted">
          Notifications are blocked for this site.{' '}
          {apple
            ? 'Allow them in Settings → Notifications → Console on this device, then check again.'
            : 'Allow them in this browser’s site settings — the padlock or icon beside the address, then Notifications — and reload.'}
        </p>
      ) : state === 'unsupported' ? (
        <p className="leading-relaxed text-fg-muted">
          {apple
            ? 'iPhone and iPad only deliver notifications to an app on the Home Screen. Tap Share → Add to Home Screen, open the console from there, and this switch will work.'
            : 'This browser cannot receive push notifications. Open the console in Chrome or Edge.'}
        </p>
      ) : (
        <button
          type="button"
          onClick={onEnable}
          disabled={state === 'working'}
          className={cn(PRIMARY, 'disabled:opacity-40')}
        >
          {state === 'working' ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <BellRing className="size-3.5" />
          )}
          Turn on notifications
        </button>
      )}

      {state === 'denied' || state === 'unsupported' ? (
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="ml-0 mt-2 inline-flex items-center gap-1.5 font-medium text-brand-soft transition-colors hover:text-fg"
        >
          <RotateCw className="size-3.5" />
          Check again
        </button>
      ) : null}

      {error !== null ? (
        <p role="alert" className="mt-2 leading-relaxed text-down">
          {error}
        </p>
      ) : null}
    </>
  );
}

const PRIMARY =
  'inline-flex items-center gap-2 rounded-full bg-brand px-4 py-2 text-xs font-medium text-on-brand transition-opacity hover:opacity-90';
