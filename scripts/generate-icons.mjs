#!/usr/bin/env node
/**
 * Generates the full PWA icon set (manifest icons, maskable icons, and the
 * Next.js App Router icon/apple-icon routes) from the brand logo
 * (public/RashiLogo.svg — the full lockup: leaf mark + "RASHI" wordmark +
 * "nail art studio academy." tagline, same as the site header).
 *
 * The source is wide (1018x499, ~2:1), so it's letterboxed onto square
 * canvases via sharp's `fit: "contain"` rather than cropped — the icon
 * shows the whole brand lockup, just padded top/bottom to fit a square
 * slot, matching how the logo already renders everywhere else on the site.
 *
 * Two "masters" are rendered at high resolution and then resized down to
 * every listed size — this keeps every output pixel-consistent instead of
 * re-rasterizing the source SVG at each size independently:
 *
 *  - "any" master: transparent background, logo fills ~92% of the canvas
 *    width. Used for the general-purpose manifest icons and the Next.js
 *    icon.png route.
 *  - "maskable" master: opaque #FEF8FC background, logo scaled so its
 *    bounding-box corners stay inside the ~80%-diameter safe-zone circle
 *    OS icon masks (circle/squircle/rounded-square) guarantee against
 *    clipping. Used for maskable manifest icons and the apple-icon.png
 *    route (iOS paints transparent regions black, so apple-icon.png must
 *    always be composited on an opaque background).
 */
import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const ROOT = process.cwd();
const LOGO_SRC = path.join(ROOT, "public", "RashiLogo.svg");
const ICONS_DIR = path.join(ROOT, "public", "icons");
const APP_DIR = path.join(ROOT, "src", "app");

const SIZES = [72, 96, 128, 144, 152, 192, 384, 512];
const MASTER_SIZE = 1600;
const BRAND_BG = "#FEF8FC";

async function readLogoSvg() {
  return readFile(LOGO_SRC);
}

// Letterboxes the source SVG onto a `size`x`size` canvas: the artwork is
// scaled (preserving aspect ratio) to fill `fillRatio` of the canvas, then
// padded to the full square with `background` (or transparent).
async function renderMaster({ svgBuffer, size, background, fillRatio }) {
  const bg = background ? sharpColor(background) : { r: 0, g: 0, b: 0, alpha: 0 };
  const innerSize = Math.round(size * fillRatio);
  let fitted = sharp(svgBuffer, { density: 384 }).resize(innerSize, innerSize, {
    fit: "contain",
    background: bg,
  });
  // `resize`'s `background` only paints the letterbox bars it adds — the
  // logo's own internal whitespace stays transparent. For an opaque master
  // that transparency must be flattened away too, or it shows through as a
  // visible white rectangle wherever the logo has empty space.
  if (background) fitted = fitted.flatten({ background: bg });
  const fittedBuffer = await fitted.toBuffer();
  const padLeft = Math.round((size - innerSize) / 2);
  const padRight = size - innerSize - padLeft;
  return sharp(fittedBuffer)
    .extend({ top: padLeft, bottom: padRight, left: padLeft, right: padRight, background: bg })
    .png()
    .toBuffer();
}

function sharpColor(hex) {
  const n = parseInt(hex.replace("#", ""), 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255, alpha: 1 };
}

async function fanOut(masterBuffer, prefix) {
  await Promise.all(
    SIZES.map(async (size) => {
      const outPath = path.join(ICONS_DIR, `${prefix}-${size}.png`);
      await sharp(masterBuffer).resize(size, size, { fit: "contain" }).png().toFile(outPath);
    })
  );
}

async function main() {
  await mkdir(ICONS_DIR, { recursive: true });

  const svgBuffer = await readLogoSvg();

  // "any" purpose master — transparent background, logo fills most of the
  // canvas width (no safe-zone constraint since this purpose isn't masked).
  const anyMaster = await renderMaster({ svgBuffer, size: MASTER_SIZE, background: null, fillRatio: 0.92 });
  await fanOut(anyMaster, "icon-any");

  // "maskable" purpose master — opaque background, logo kept inside the
  // ~80%-diameter safe-zone circle. For a ~2:1 wide logo, fillRatio must be
  // low enough that the bounding-box corners stay inside that circle:
  // corner distance = fillRatio * canvas * sqrt((0.5)^2 + (0.5*499/1018)^2)
  // ≈ fillRatio * canvas * 0.557, which must be ≤ 0.4 * canvas → fillRatio ≲ 0.72.
  const maskableMaster = await renderMaster({
    svgBuffer,
    size: MASTER_SIZE,
    background: BRAND_BG,
    fillRatio: 0.68,
  });
  await fanOut(maskableMaster, "icon-maskable");

  // Next.js App Router file-convention icons.
  await sharp(anyMaster).resize(512, 512).png().toFile(path.join(APP_DIR, "icon.png"));

  // apple-icon.png must NEVER be transparent — iOS paints transparent
  // regions black. Render at the recommended 180x180 apple-touch-icon size,
  // same safe-zone-respecting fill ratio as the maskable master; renderMaster
  // already flattens against BRAND_BG whenever a background is passed.
  const appleMaster = await renderMaster({ svgBuffer, size: 180, background: BRAND_BG, fillRatio: 0.68 });
  await sharp(appleMaster).png().toFile(path.join(APP_DIR, "apple-icon.png"));

  console.log(`Generated ${SIZES.length * 2} manifest icons in ${ICONS_DIR}`);
  console.log(`Generated ${path.join(APP_DIR, "icon.png")}`);
  console.log(`Generated ${path.join(APP_DIR, "apple-icon.png")}`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
