import { THEME_STORAGE_KEY } from './theme-storage';

/**
 * Applies the reader's theme before the browser paints.
 *
 * This is the one place a blocking inline script is the right answer. The theme
 * lives in `localStorage`, which the server cannot read, so any server-rendered
 * HTML has to commit to *some* theme. Correcting it in an effect means the first
 * frame is painted with the wrong background and then repainted — the flash of
 * the wrong theme that every dark-mode site with this bug exhibits on reload.
 *
 * Running synchronously in `<head>`, before <body> exists, means the class is on
 * `<html>` by the time the first pixel is drawn. It is a few hundred bytes and
 * it is why the toggle feels instant rather than apologetic.
 *
 * `suppressHydrationWarning` on <html> in the layout is the necessary companion:
 * this script mutates the element the server rendered, and React would otherwise
 * report the class it did not write.
 */

const SCRIPT = `
(function () {
  try {
    var stored = localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)});
    var mode = stored === 'dark' || stored === 'light' || stored === 'system' ? stored : 'dark';
    var resolved = mode === 'system'
      ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
      : mode;
    var root = document.documentElement;
    root.classList.add(resolved);
    root.classList.remove(resolved === 'dark' ? 'light' : 'dark');
    root.style.colorScheme = resolved;
  } catch (error) {
    // Storage can throw in private mode. The stylesheet's default is dark, so
    // doing nothing here still produces a correct page.
  }
})();
`;

export function ThemeScript() {
  return <script dangerouslySetInnerHTML={{ __html: SCRIPT }} />;
}
