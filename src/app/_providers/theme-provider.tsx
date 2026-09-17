'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from 'react';

import { THEME_STORAGE_KEY, type ThemeMode } from './theme-storage';

export type { ThemeMode };
export { THEME_STORAGE_KEY };

interface ThemeContextValue {
  mode: ThemeMode;
  resolved: 'dark' | 'light';
  setMode: (mode: ThemeMode) => void;
  toggle: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

/**
 * A tiny store for the persisted theme choice.
 *
 * `localStorage` is an external store, and React's API for one is
 * `useSyncExternalStore`. Reading it in an effect and calling `setState` would
 * schedule a second render on every mount and trip React 19's
 * set-state-in-effect rule; subscribing reads it once, correctly, and the
 * server snapshot keeps hydration honest.
 *
 * The custom event is what makes two provider instances (or a change made in
 * another tab, via `storage`) stay in step.
 */
const THEME_CHANGE_EVENT = 'novex:theme-change';

function subscribeToMode(onChange: () => void): () => void {
  window.addEventListener(THEME_CHANGE_EVENT, onChange);
  window.addEventListener('storage', onChange);
  return () => {
    window.removeEventListener(THEME_CHANGE_EVENT, onChange);
    window.removeEventListener('storage', onChange);
  };
}

function readStoredMode(): ThemeMode {
  try {
    const raw = localStorage.getItem(THEME_STORAGE_KEY);
    if (raw === 'dark' || raw === 'light' || raw === 'system') return raw;
  } catch {
    /* storage throws in private mode and sandboxed frames — fall through */
  }
  return 'dark';
}

function subscribeToSystem(onChange: () => void): () => void {
  const mql = window.matchMedia('(prefers-color-scheme: dark)');
  mql.addEventListener('change', onChange);
  return () => mql.removeEventListener('change', onChange);
}

/**
 * Theme state.
 *
 * The provider deliberately does *not* decide the initial class on the document
 * — the blocking script in the root layout has already done that before first
 * paint. If this component chose the theme instead, the server would have had
 * to guess, and the page would flash the wrong background while React hydrated.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const mode = useSyncExternalStore(subscribeToMode, readStoredMode, () => 'dark' as ThemeMode);
  const systemDark = useSyncExternalStore(
    subscribeToSystem,
    () => window.matchMedia('(prefers-color-scheme: dark)').matches,
    () => true,
  );

  const resolved: 'dark' | 'light' = mode === 'system' ? (systemDark ? 'dark' : 'light') : mode;

  useEffect(() => {
    applyTheme(resolved);
  }, [resolved]);

  const setMode = useCallback((next: ThemeMode) => {
    try {
      localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      /* non-fatal */
    }
    window.dispatchEvent(new Event(THEME_CHANGE_EVENT));
  }, []);

  const toggle = useCallback(
    () => setMode(resolved === 'dark' ? 'light' : 'dark'),
    [resolved, setMode],
  );

  const value = useMemo(
    () => ({ mode, resolved, setMode, toggle }),
    [mode, resolved, setMode, toggle],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) throw new Error('useTheme must be used within <ThemeProvider>');
  return context;
}

function applyTheme(resolved: 'dark' | 'light'): void {
  const root = document.documentElement;
  root.classList.toggle('dark', resolved === 'dark');
  root.classList.toggle('light', resolved === 'light');
  root.style.colorScheme = resolved;
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', resolved === 'dark' ? '#04120d' : '#f5faf7');
}
