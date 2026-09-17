import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';

/**
 * Draws the console's app icons from `public/logo.png`, into `public/icons/`.
 *
 * ── Why a generator ───────────────────────────────────────────────────────────
 * Installing a web app needs a 192px and a 512px icon, and the logo is 64px. The
 * sizes are committed as files, served like any other static asset, and re-drawn
 * with `pnpm icons:generate` whenever the logo changes — an icon left behind by a
 * logo change is what an installed app shows until somebody notices.
 *
 * ── Why sharp is borrowed from Next ───────────────────────────────────────────
 * Next.js installs sharp for image optimisation, so it is already on disk. A
 * direct dependency would add a second copy to keep in step for a script that runs
 * once per logo.
 */

interface Image {
  resize(width: number, height: number, options: { kernel: 'lanczos3' }): Image;
  composite(layers: { input: Buffer; gravity: 'center' }[]): Image;
  png(options?: { compressionLevel: number; palette: boolean; quality: number; effort: number }): Image;
  toBuffer(): Promise<Buffer>;
  toFile(path: string): Promise<unknown>;
}

type Sharp = (
  input:
    | string
    | { create: { width: number; height: number; channels: 4; background: Colour } },
) => Image;

interface Colour {
  r: number;
  g: number;
  b: number;
  alpha: number;
}

const root = process.cwd();
const fromNext = createRequire(createRequire(join(root, 'package.json')).resolve('next/package.json'));
const sharp = fromNext('sharp') as Sharp;

const LOGO = join(root, 'public', 'logo.png');
const OUT = join(root, 'public', 'icons');

/** The logo's own corner colour, so an inset icon shows no seam around it. */
const BACKGROUND: Colour = { r: 0, g: 2, b: 0, alpha: 1 };

/**
 * Palette PNGs: the logo is a handful of flat colours, and a palette keeps the
 * files about a third the size of full colour with no visible difference.
 */
const PNG = { compressionLevel: 9, palette: true, quality: 100, effort: 10 };

async function fullBleed(size: number, file: string): Promise<void> {
  await sharp(LOGO).resize(size, size, { kernel: 'lanczos3' }).png(PNG).toFile(join(OUT, file));
}

/**
 * For a platform that crops icons to its own shape. Only a centred circle 80%
 * across is guaranteed to survive the crop, so the logo is drawn inside it.
 */
async function inset(size: number, file: string): Promise<void> {
  const inner = Math.round(size * 0.8);
  const logo = await sharp(LOGO).resize(inner, inner, { kernel: 'lanczos3' }).png().toBuffer();

  await sharp({ create: { width: size, height: size, channels: 4, background: BACKGROUND } })
    .composite([{ input: logo, gravity: 'center' }])
    .png(PNG)
    .toFile(join(OUT, file));
}

async function main(): Promise<void> {
  mkdirSync(OUT, { recursive: true });

  await fullBleed(192, 'icon-192.png');
  await fullBleed(512, 'icon-512.png');
  await inset(512, 'icon-maskable-512.png');
  // iOS rounds the corners itself and ignores transparency; the logo is already a
  // full square, so it is used as it is.
  await fullBleed(180, 'apple-touch-icon.png');

  console.log(`Wrote icons to ${OUT}`);
}

void main();
