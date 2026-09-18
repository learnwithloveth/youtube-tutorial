import { mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';

/**
 * Draws every icon the site and the console need from `public/logo.png`.
 *
 * ── Why a generator ───────────────────────────────────────────────────────────
 * Installing a web app needs a 192px and a 512px icon, a browser tab needs a
 * favicon, and the logo is one file. The outputs are committed and served as
 * static assets; re-run with `pnpm icons:generate` after the logo changes. An icon
 * left behind by a logo change is what a tab and an installed app go on showing
 * until somebody notices.
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
const FAVICON = join(root, 'src', 'app', 'favicon.ico');

/** The logo's own corner colour, so an inset icon shows no seam around it. */
const BACKGROUND: Colour = { r: 0, g: 2, b: 0, alpha: 1 };

/**
 * Palette PNGs: the logo is a handful of flat colours, and a palette keeps the
 * files about a third the size of full colour with no visible difference.
 */
const PNG = { compressionLevel: 9, palette: true, quality: 100, effort: 10 };

function scaled(size: number): Image {
  return sharp(LOGO).resize(size, size, { kernel: 'lanczos3' }).png(PNG);
}

async function fullBleed(size: number, file: string): Promise<void> {
  await scaled(size).toFile(join(OUT, file));
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

/**
 * A `.ico` is a small container: a six-byte header, a sixteen-byte entry per
 * image, then the images themselves — here PNGs, which every browser since IE11
 * reads, rather than the older bitmap-with-mask form.
 *
 * Three sizes because three places read them at different scales: the tab at 16,
 * a pinned tab or high-density display at 32, and a desktop shortcut at 48.
 */
function ico(images: { size: number; png: Buffer }[]): Buffer {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // 1 = icon
  header.writeUInt16LE(images.length, 4);

  let offset = header.length + images.length * 16;
  const entries = images.map((image) => {
    const entry = Buffer.alloc(16);
    entry.writeUInt8(image.size, 0); // width, where 0 would mean 256
    entry.writeUInt8(image.size, 1); // height
    entry.writeUInt8(0, 2); // colours in the palette: 0, it is a PNG
    entry.writeUInt8(0, 3); // reserved
    entry.writeUInt16LE(1, 4); // colour planes
    entry.writeUInt16LE(32, 6); // bits per pixel
    entry.writeUInt32LE(image.png.length, 8);
    entry.writeUInt32LE(offset, 12);
    offset += image.png.length;
    return entry;
  });

  return Buffer.concat([header, ...entries, ...images.map((image) => image.png)]);
}

async function favicon(): Promise<void> {
  const sizes = [16, 32, 48];
  const images = await Promise.all(
    sizes.map(async (size) => ({
      size,
      // Full colour, not the palette used everywhere else here: the ICO decoder in
      // Turbopack's image pipeline refuses an indexed PNG inside an icon — "the
      // PNG is not in RGBA format" — and fails the build. At these sizes the
      // difference is a couple of kilobytes.
      png: await sharp(LOGO)
        .resize(size, size, { kernel: 'lanczos3' })
        .png({ compressionLevel: 9, palette: false, quality: 100, effort: 10 })
        .toBuffer(),
    })),
  );

  writeFileSync(FAVICON, ico(images));
}

async function main(): Promise<void> {
  mkdirSync(OUT, { recursive: true });

  // The console's app icons — see `(admin)/admin.webmanifest/route.ts`.
  await fullBleed(192, 'icon-192.png');
  await fullBleed(512, 'icon-512.png');
  await inset(512, 'icon-maskable-512.png');
  // iOS rounds the corners itself and ignores transparency; the logo is already a
  // full square, so it is used as it is.
  await fullBleed(180, 'apple-touch-icon.png');

  // The browser tab, for every page on the site.
  await favicon();

  console.log(`Wrote app icons to ${OUT}`);
  console.log(`Wrote ${FAVICON}`);
}

void main();
