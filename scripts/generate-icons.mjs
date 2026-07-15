#!/usr/bin/env node
/**
 * Generates the full PWA icon set (manifest icons, maskable icons, and the
 * Next.js App Router icon/apple-icon routes) from a single hand-cropped
 * logo mark (scripts/assets/logo-mark.svg).
 *
 * Two "masters" are rendered at high resolution and then resized down to
 * every listed size — this keeps every output pixel-consistent instead of
 * re-rasterizing the source SVG at each size independently:
 *
 *  - "any" master: transparent background, mark fills ~90% of the canvas.
 *    Used for the general-purpose manifest icons and the Next.js
 *    icon.png route.
 *  - "maskable" master: opaque #FEF8FC background, mark fills ~80% of the
 *    canvas so it survives OS icon masking (circle/squircle/rounded-square)
 *    without the artwork being clipped. Used for maskable manifest icons
 *    and the apple-icon.png route (iOS paints transparent regions black,
 *    so apple-icon.png must always be composited on an opaque background).
 */
import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const ROOT = process.cwd();
const LOGO_SRC = path.join(ROOT, "scripts", "assets", "logo-mark.svg");
const ICONS_DIR = path.join(ROOT, "public", "icons");
const APP_DIR = path.join(ROOT, "src", "app");

const SIZES = [72, 96, 128, 144, 152, 192, 384, 512];
const MASTER_SIZE = 1024;
const BRAND_BG = "#FEF8FC";
const MARK_BOX = 530; // logo-mark.svg viewBox is "-10 -10 530 530"
const MARK_BOX_ORIGIN = -10;

async function readMarkPaths() {
  const svg = await readFile(LOGO_SRC, "utf8");
  const paths = svg.match(/<path[\s\S]*?\/>/g);
  if (!paths || paths.length === 0) {
    throw new Error(`No <path> elements found in ${LOGO_SRC}`);
  }
  return paths.join("\n");
}

function markGroup(paths, canvasSize, fillRatio) {
  const scale = (canvasSize * fillRatio) / MARK_BOX;
  const offset = (canvasSize - canvasSize * fillRatio) / 2;
  const translate = offset - MARK_BOX_ORIGIN * scale;
  return `<g transform="translate(${translate} ${translate}) scale(${scale})">\n${paths}\n</g>`;
}

function buildSvg({ paths, size, background, fillRatio }) {
  const bgRect = background
    ? `<rect width="${size}" height="${size}" fill="${background}"/>`
    : "";
  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
${bgRect}
${markGroup(paths, size, fillRatio)}
</svg>`;
}

async function renderMaster({ paths, background, fillRatio }) {
  const svg = buildSvg({ paths, size: MASTER_SIZE, background, fillRatio });
  return sharp(Buffer.from(svg)).png().toBuffer();
}

async function fanOut(masterBuffer, prefix) {
  await Promise.all(
    SIZES.map(async (size) => {
      const outPath = path.join(ICONS_DIR, `${prefix}-${size}.png`);
      await sharp(masterBuffer)
        .resize(size, size, { fit: "contain" })
        .png()
        .toFile(outPath);
    })
  );
}

async function main() {
  await mkdir(ICONS_DIR, { recursive: true });

  const paths = await readMarkPaths();

  // "any" purpose master — transparent background.
  const anyMaster = await renderMaster({ paths, background: null, fillRatio: 0.9 });
  await fanOut(anyMaster, "icon-any");

  // "maskable" purpose master — opaque background, 80% safe zone.
  const maskableMaster = await renderMaster({
    paths,
    background: BRAND_BG,
    fillRatio: 0.8,
  });
  await fanOut(maskableMaster, "icon-maskable");

  // Next.js App Router file-convention icons.
  await sharp(anyMaster)
    .resize(512, 512)
    .png()
    .toFile(path.join(APP_DIR, "icon.png"));

  // apple-icon.png must NEVER be transparent — iOS paints transparent
  // regions black. Render straight onto an opaque canvas at the
  // recommended 180x180 apple-touch-icon size.
  const appleSvg = buildSvg({ paths, size: 180, background: BRAND_BG, fillRatio: 0.72 });
  await sharp(Buffer.from(appleSvg))
    // Apple touch icons must be fully opaque with no alpha channel at all —
    // iOS renders any transparency as solid black, so flatten() bakes the
    // brand background in and strips the alpha channel rather than just
    // relying on every pixel happening to be alpha=255.
    .flatten({ background: BRAND_BG })
    .png()
    .toFile(path.join(APP_DIR, "apple-icon.png"));

  console.log(`Generated ${SIZES.length * 2} manifest icons in ${ICONS_DIR}`);
  console.log(`Generated ${path.join(APP_DIR, "icon.png")}`);
  console.log(`Generated ${path.join(APP_DIR, "apple-icon.png")}`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
