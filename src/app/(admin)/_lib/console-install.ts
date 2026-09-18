'use client';

import { useSyncExternalStore } from 'react';

/**
 * Whether the console is installed as an app, and whether it can be installed
 * from here — the two browser facts the console has to ask about, kept in one
 * place because two components ask: the button in the top bar, and the gate that
 * will not let an operator work until the answer is yes.
 *
 * ── Why the events are caught outside React ───────────────────────────────────
 * `beforeinstallprompt` fires once per page load, whenever the browser has decided
 * the page qualifies, which can be before any component mounts. A listener added
 * when the module loads hears it either way, and components read what it heard.
 *
 * ── What can and cannot be known ──────────────────────────────────────────────
 * A page can see that it is *running inside* the installed app — the display mode
 * says so. It cannot see that an app is installed while it is being viewed in an
 * ordinary tab: Chrome stops offering to install one that already exists, and
 * offers nothing at all in Firefox or Safari, so "no offer" means *unknown*, not
 * "installed". Nothing here fills that gap in; the UI says what it knows and
 * tells the operator the rest.
 */

interface InstallPromptEvent extends Event {
  prompt(): Promise<unknown>;
}

/** Where this page is being viewed. */
export type ConsoleWindow = 'app' | 'browser';

/* ── The browser's offer to install ──────────────────────────────────────────── */

let offered: InstallPromptEvent | null = null;
/** Set by `appinstalled`: this browser installed the console during this visit. */
let installedHere = false;

const listeners = new Set<() => void>();

function announce(): void {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (event) => {
    offered = event as InstallPromptEvent;
    announce();
  });
  window.addEventListener('appinstalled', () => {
    offered = null;
    installedHere = true;
    announce();
  });
}

/** True while the browser is willing to open its install dialog for this page. */
export function useInstallOffer(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => offered !== null,
    () => false,
  );
}

/**
 * True once the browser has reported installing the console during this visit.
 *
 * Only ever true in the tab the install was started from — the app opens in a
 * window of its own, which is where the work carries on.
 */
export function useInstalledHere(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => installedHere,
    () => false,
  );
}

/**
 * Opens the browser's install dialog.
 *
 * Call it straight from a click: the browser opens the dialog only during a user
 * gesture. An event can prompt once, so the offer is given up afterwards — the
 * browser offers again on a later page load if this one is dismissed.
 */
export function promptInstall(): void {
  const event = offered;
  if (event === null) return;

  void event.prompt().catch(() => undefined);
  offered = null;
  announce();
}

/* ── Where the page is running ───────────────────────────────────────────────── */

/**
 * The display modes that mean "not a browser tab".
 *
 * `standalone` is what the console's manifest asks for. The others are here
 * because a platform may grant a different one — Chrome's window-controls-overlay
 * when the operator turns it on, `minimal-ui` on some Android launchers — and an
 * operator working in an installed window should not be told to install it.
 */
const APP_DISPLAY_MODES = [
  '(display-mode: standalone)',
  '(display-mode: minimal-ui)',
  '(display-mode: window-controls-overlay)',
  '(display-mode: fullscreen)',
] as const;

function queries(): MediaQueryList[] {
  return APP_DISPLAY_MODES.map((query) => window.matchMedia(query));
}

function subscribeToDisplayMode(listener: () => void): () => void {
  const lists = queries();
  for (const list of lists) list.addEventListener('change', listener);
  return () => {
    for (const list of lists) list.removeEventListener('change', listener);
  };
}

function currentWindow(): ConsoleWindow {
  // iOS has no display-mode for a Home Screen app; Safari answers this instead.
  const ios = (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return ios || queries().some((list) => list.matches) ? 'app' : 'browser';
}

/**
 * Whether this page is the installed app or an ordinary tab.
 *
 * `app` on the server, so nothing that depends on this renders during hydration:
 * the real answer arrives on the first client render, a moment later.
 */
export function useConsoleWindow(): ConsoleWindow {
  return useSyncExternalStore(
    subscribeToDisplayMode,
    currentWindow,
    () => 'app' as const,
  );
}
