'use client';

import { MonitorDown } from 'lucide-react';

import { cn } from '@/shared/lib/cn';

import { promptInstall, useInstallOffer } from '../_lib/console-install';

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
 * from its Share menu instead. `_lib/console-install.ts` catches the event and
 * explains why it is caught outside React.
 *
 * This is the quiet way in. `ConsoleReadinessGate` is the insistent one.
 */
export function InstallConsoleButton({ className }: { className?: string }) {
  const available = useInstallOffer();
  if (!available) return null;

  return (
    <button
      type="button"
      onClick={promptInstall}
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
