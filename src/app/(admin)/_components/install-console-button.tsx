'use client';

import { MonitorDown } from 'lucide-react';
import { useSyncExternalStore } from 'react';

import { cn } from '@/shared/lib/cn';

/**
 * Installs the console as an app, when the browser offers to.
 *
 * ── Why a button, when the address bar has one ────────────────────────────────
 * Chrome and Edge show an install icon in the address bar, but it is small and
 * unlabelled, and nothing on the page says it exists. Installing is what gives an
 * operator's notifications a switch of their own in the operating system — see
 * `_lib/console-app.ts` — so it is offered where an operator will see it.
 *
 * ── Shown only while installing is possible ───────────────────────────────────
 * The browser announces it with `beforeinstallprompt`: Chromium browsers only, and
 * never once the console is installed or inside the installed app. Firefox and
 * Safari never send it, so they never show the button; Safari on iOS installs
 * from its Share menu instead.
 *
 * ── Why the event is caught outside React ─────────────────────────────────────
 * It fires once per page load, whenever the browser has decided the page
 * qualifies, which can be before this component mounts. A listener added when the
 * module loads hears it either way, and the component reads what it heard.
 */

interface InstallPromptEvent extends Event {
  prompt(): Promise<unknown>;
}

let offered: InstallPromptEvent | null = null;
const listeners = new Set<() => void>();

function publish(event: InstallPromptEvent | null): void {
  offered = event;
  for (const listener of listeners) listener();
}

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (event) => publish(event as InstallPromptEvent));
  window.addEventListener('appinstalled', () => publish(null));
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function install(): void {
  const event = offered;
  if (event === null) return;

  // Straight from the click, because the browser opens its dialog only during a
  // user gesture. An event can prompt once, so the button goes until the browser
  // offers again — on a later page load, if this one is dismissed.
  void event.prompt().catch(() => undefined);
  publish(null);
}

export function InstallConsoleButton({ className }: { className?: string }) {
  const available = useSyncExternalStore(
    subscribe,
    () => offered !== null,
    () => false,
  );
  if (!available) return null;

  return (
    <button
      type="button"
      onClick={install}
      aria-label="Install the console as an app"
      title="Install the console as an app"
      className={cn(
        'grid size-10 shrink-0 place-items-center rounded-full border border-line text-fg-muted',
        'transition-colors duration-300 hover:border-line-strong hover:text-fg',
        className,
      )}
    >
      <MonitorDown className="size-[18px]" />
    </button>
  );
}
