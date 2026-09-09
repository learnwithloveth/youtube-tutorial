/**
 * The theme's storage key and mode type.
 *
 * Deliberately a plain module with no `'use client'` directive, because both
 * sides of the boundary need the literal value: the blocking script that runs
 * before paint is rendered on the *server*, and the provider that reads and
 * writes the key runs on the *client*.
 *
 * Importing it from the provider instead was a real bug. A value imported from
 * a `'use client'` module into server code is a client *reference*, not the
 * value — so the generated script read `localStorage.getItem(undefined)` and
 * silently never restored anyone's theme.
 */

export const THEME_STORAGE_KEY = 'novex.theme';

export type ThemeMode = 'dark' | 'light' | 'system';
