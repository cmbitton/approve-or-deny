// Renders the 1200x630 link-preview image for one plate.
//
// The image is an SVG drawn to match the game's plate (src/styles.css: .plate, .plate-text),
// rendered by resvg with the fonts in scripts/share/fonts (no system fonts), then
// palette-quantized by sharp. Text is measured with opentype.js, so line breaks,
// truncation and plate fitting are decided here, not left to the renderer.
//
// The verdict never appears: the preview is a question, the answer is the reason to click.

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Resvg } from '@resvg/resvg-js';
import opentype from 'opentype.js';
import sharp from 'sharp';

/** Bump when the artwork changes, so cached images are re-rendered. */
export const CARD_VERSION = 1;

export const WIDTH = 1200;
export const HEIGHT = 630;

const FONT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), 'fonts');
const FONT_FILES = {
  plate: resolve(FONT_DIR, 'BarlowCondensed-Bold.ttf'),
  body: resolve(FONT_DIR, 'Barlow-SemiBold.ttf'),
};
const load = (file: string) => {
  const buf = readFileSync(file);
  return opentype.parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
};
const fonts = { plate: load(FONT_FILES.plate), body: load(FONT_FILES.body) };

// Theme tokens, copied from src/styles.css.
const C = {
  bg: '#24262a',
  text: '#f3f2ee',
  muted: '#a9acb2',
  accent: '#f5c518',
  navy: '#1b2a57',
  plateBg: '#fbfbf7',
  bolt: '#b9bcc4',
  heart: '#c8202f',
  emboss: '#cfd3dc',
};

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Width of `text` in px, including CSS-style letter-spacing after every character. */
function measure(font: opentype.Font, text: string, size: number, spacing = 0): number {
  return font.getAdvanceWidth(text, size, { kerning: true }) + spacing * [...text].length;
}

/** Drops characters the font has no glyph for (an emoji, for instance) rather than drawing boxes. */
function printable(font: opentype.Font, text: string): string {
  return [...text].filter((ch) => /\s/.test(ch) || font.charToGlyphIndex(ch) > 0).join('').replace(/\s+/g, ' ').trim();
}

/** Greedy word wrap. A single word wider than the line is broken by character. */
export function wrap(font: opentype.Font, text: string, size: number, maxWidth: number): string[] {
  const lines: string[] = [];
  let line = '';
  for (const word of text.split(' ')) {
    const next = line ? `${line} ${word}` : word;
    if (measure(font, next, size) <= maxWidth) {
      line = next;
      continue;
    }
    if (line) lines.push(line);
    line = word;
    while (measure(font, line, size) > maxWidth) {
      let cut = line.length - 1;
      while (cut > 1 && measure(font, line.slice(0, cut), size) > maxWidth) cut--;
      lines.push(line.slice(0, cut));
      line = line.slice(cut);
    }
  }
  if (line) lines.push(line);
  return lines;
}

/** Cuts lines to `max`, ending the last kept line on a word boundary with an ellipsis that fits. */
export function clamp(font: opentype.Font, lines: string[], max: number, size: number, maxWidth: number): string[] {
  if (lines.length <= max) return lines;
  const kept = lines.slice(0, max);
  let last = `${kept[max - 1]} ${lines[max]}`;
  while (last && measure(font, `${last}…`, size) > maxWidth) {
    const space = last.lastIndexOf(' ');
    last = space > 0 ? last.slice(0, space) : last.slice(0, -1);
  }
  kept[max - 1] = `${last.replace(/[\s,.;:!?\-–—]+$/, '')}…`;
  return kept;
}

interface Fitted {
  size: number;
  lines: string[];
}

/** Largest type size at which the explanation fits the box; truncated at the smallest size. */
export function fitExplanation(text: string, maxWidth: number, maxHeight: number): Fitted {
  const clean = printable(fonts.body, text);
  const quoted = `“${clean}”`;
  for (const size of [56, 50, 44, 39, 35]) {
    const lines = wrap(fonts.body, quoted, size, maxWidth);
    if (lines.length * size * LINE <= maxHeight) return { size, lines };
  }
  const size = 35;
  const max = Math.floor(maxHeight / (size * LINE));
  const lines = clamp(fonts.body, wrap(fonts.body, quoted, size, maxWidth), max, size, maxWidth);
  // The closing quote is lost to truncation; put it back after the ellipsis.
  if (!lines.at(-1)!.endsWith('”')) lines[lines.length - 1] += '”';
  return { size, lines };
}

const LINE = 1.22;

// ---------- Plate ----------

// Plate symbols, as in src/plate.ts. Drawn as shapes: the fonts have no glyphs for them.
type Segment = { kind: 'text'; text: string } | { kind: 'sym'; name: 'hand' | 'heart' | 'star' };
const SYMBOL_NAMES: Record<string, 'hand' | 'heart' | 'star'> = { '#': 'hand', $: 'heart', '&': 'star' };

function segments(plate: string): Segment[] {
  const out: Segment[] = [];
  for (const ch of plate) {
    const name = SYMBOL_NAMES[ch];
    if (name) out.push({ kind: 'sym', name });
    else if (out.at(-1)?.kind === 'text') (out.at(-1) as { text: string }).text += ch;
    else out.push({ kind: 'text', text: ch });
  }
  return out;
}

const SYM_SCALE = 0.72; // .sym { font-size: 0.72em }

/** SVG markup for a symbol in a 1x1 box, origin top-left. */
function symbolSvg(name: 'hand' | 'heart' | 'star'): string {
  switch (name) {
    case 'heart':
      return `<path d="M.5 .92 C.18 .7 0 .5 0 .3 A.24 .24 0 0 1 .5 .2 A.24 .24 0 0 1 1 .3 C1 .5 .82 .7 .5 .92Z" fill="${C.heart}"/>`;
    case 'star': {
      const pts = Array.from({ length: 10 }, (_, i) => {
        const r = i % 2 ? 0.2 : 0.5;
        const a = (Math.PI / 5) * i - Math.PI / 2;
        return `${(0.5 + r * Math.cos(a)).toFixed(3)} ${(0.53 + r * Math.sin(a)).toFixed(3)}`;
      });
      return `<path d="M${pts.join(' L')}Z" fill="${C.navy}"/>`;
    }
    case 'hand': {
      // Raised open hand: four fingers, a thumb and a palm, painted over each other.
      const finger = (x: number, top: number) => `<rect x="${x}" y="${top}" width=".12" height="${0.62 - top}" rx=".06"/>`;
      return `<g fill="${C.navy}">${finger(0.27, 0.12)}${finger(0.4, 0.04)}${finger(0.53, 0.07)}${finger(0.66, 0.17)}
        <rect x=".08" y=".42" width=".12" height=".34" rx=".06" transform="rotate(-38 .14 .76)"/>
        <rect x=".24" y=".42" width=".54" height=".5" rx=".2"/></g>`;
    }
  }
}

/** The plate, drawn at (x, y) with width w (height w/2). Sizes follow the CSS in cqi units. */
function plateSvg(plate: string, x: number, y: number, w: number): string {
  const h = w / 2;
  const cq = w / 100; // 1cqi
  const rx = 7 * cq;
  const ry = Math.min(14 * cq, h / 2);

  // Fit the text like fitPlate(): 31cqi, shrunk to 86% of the plate width.
  const spacingEm = 0.03;
  const segs = segments(plate);
  const widthAt = (size: number) =>
    segs.reduce(
      (sum, s) =>
        sum +
        (s.kind === 'text' ? measure(fonts.plate, s.text, size, size * spacingEm) : size * SYM_SCALE + size * spacingEm),
      0,
    );
  let size = 31 * cq;
  const available = w * 0.86;
  if (widthAt(size) > available) size *= available / widthAt(size);

  // Vertical layout of the CSS grid (1fr auto 1fr) around a 1em line box.
  const cx = x + w / 2;
  const cy = y + h / 2;
  const capHeight = (fonts.plate.tables.os2?.sCapHeight ?? 700) / fonts.plate.unitsPerEm;
  const baseline = cy + (capHeight * size) / 2;
  const rowEdge = (h - size + 2 * cq) / 2; // height of the top and bottom rows
  const topLabel = 6.5 * cq;
  const bottomLabel = 5 * cq;

  let cursor = cx - widthAt(size) / 2;
  const glyphs: string[] = [];
  const shadow: string[] = [];
  for (const s of segs) {
    if (s.kind === 'text') {
      const attrs = `x="${cursor.toFixed(1)}" font-family="Barlow Condensed" font-weight="700" font-size="${size.toFixed(1)}" letter-spacing="${(size * spacingEm).toFixed(2)}" xml:space="preserve"`;
      shadow.push(`<text ${attrs} y="${(baseline + 0.6 * cq).toFixed(1)}" fill="${C.emboss}">${esc(s.text)}</text>`);
      glyphs.push(`<text ${attrs} y="${baseline.toFixed(1)}" fill="${C.navy}">${esc(s.text)}</text>`);
      cursor += measure(fonts.plate, s.text, size, size * spacingEm);
    } else {
      const box = size * SYM_SCALE;
      const top = baseline - capHeight * size * 0.5 - box / 2;
      glyphs.push(`<g transform="translate(${cursor.toFixed(1)} ${top.toFixed(1)}) scale(${box.toFixed(1)})">${symbolSvg(s.name)}</g>`);
      cursor += box + size * spacingEm;
    }
  }

  const label = (text: string, fs: number, by: number) =>
    `<text x="${(cx + 0.15 * fs).toFixed(1)}" y="${by.toFixed(1)}" text-anchor="middle" font-family="Barlow Condensed" font-weight="700" font-size="${fs.toFixed(1)}" letter-spacing="${(0.3 * fs).toFixed(1)}" fill="${C.navy}" fill-opacity="0.7">${text}</text>`;
  const bolt = (px: number, py: number) => `<circle cx="${(x + px * w).toFixed(1)}" cy="${(y + py * h).toFixed(1)}" r="${(1.5 * cq).toFixed(1)}" fill="${C.bolt}"/>`;
  const inset = (d: number, stroke: string, sw: number) =>
    `<rect x="${(x + d).toFixed(1)}" y="${(y + d).toFixed(1)}" width="${(w - 2 * d).toFixed(1)}" height="${(h - 2 * d).toFixed(1)}" rx="${Math.max(rx - d, 0).toFixed(1)}" ry="${Math.max(ry - d, 0).toFixed(1)}" fill="none" stroke="${stroke}" stroke-width="${sw.toFixed(1)}"/>`;

  return `
  <g filter="url(#plate-shadow)">
    <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx.toFixed(1)}" ry="${ry.toFixed(1)}" fill="url(#plate-fill)"/>
  </g>
  ${inset(0.6 * cq, C.navy, 1.2 * cq)}
  ${inset(1.5 * cq, '#ffffff', 0.6 * cq)}
  ${bolt(0.09, 0.18)}${bolt(0.91, 0.18)}${bolt(0.09, 0.82)}${bolt(0.91, 0.82)}
  ${label('PERSONALIZED', topLabel, y + rowEdge - 0.6 * cq)}
  ${shadow.join('')}
  ${glyphs.join('')}
  ${label('UNDER REVIEW', bottomLabel, y + h - rowEdge + bottomLabel * 0.95 + 0.4 * cq)}`;
}

// ---------- Card ----------

export interface CardInput {
  plate: string;
  meaning: string;
  shortUrl: string;
}

export function cardSvg({ plate, meaning, shortUrl }: CardInput): string {
  const pad = 64;
  const plateW = 560;
  const plateX = pad;
  const plateY = 150;
  const colX = plateX + plateW + 56;
  const colW = WIDTH - pad - colX;
  const boxTop = 150;
  const boxH = 260;

  const fit = fitExplanation(meaning, colW, boxH - 44);
  const lineH = fit.size * LINE;
  const blockH = 44 + fit.lines.length * lineH;
  const blockTop = plateY + plateW / 4 - blockH / 2; // centered on the plate
  const labelY = Math.max(blockTop, boxTop - 20) + 20;
  const firstBaseline = labelY + 26 + fit.size * 0.95;

  const explanation = fit.lines
    .map((line, i) => `<tspan x="${colX}" y="${(firstBaseline + i * lineH).toFixed(1)}">${esc(line)}</tspan>`)
    .join('');

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">
  <defs>
    <linearGradient id="plate-fill" x1="0.45" y1="0" x2="0.55" y2="1">
      <stop offset="0" stop-color="#ffffff"/>
      <stop offset="0.55" stop-color="${C.plateBg}"/>
      <stop offset="1" stop-color="#e6e6df"/>
    </linearGradient>
    <filter id="plate-shadow" x="-20%" y="-20%" width="140%" height="160%">
      <feDropShadow dx="0" dy="18" stdDeviation="18" flood-color="#000" flood-opacity="0.5"/>
    </filter>
  </defs>
  <rect width="${WIDTH}" height="${HEIGHT}" fill="${C.bg}"/>

  <text x="${pad}" y="92" font-family="Barlow Condensed" font-weight="700" font-size="46" letter-spacing="1" fill="${C.text}">APPROVED <tspan fill="${C.accent}" font-size="38">or</tspan> DENIED</text>
  <text x="${WIDTH - pad}" y="90" text-anchor="end" font-family="Barlow" font-weight="600" font-size="24" fill="${C.muted}">${esc(shortUrl)}</text>

  ${plateSvg(plate, plateX, plateY, plateW)}

  <text x="${colX}" y="${labelY.toFixed(1)}" font-family="Barlow" font-weight="600" font-size="22" letter-spacing="2.4" fill="${C.muted}">APPLICANT SAYS:</text>
  <text font-family="Barlow" font-weight="600" font-size="${fit.size}" fill="${C.text}">${explanation}</text>

  <rect x="${pad}" y="494" width="${WIDTH - 2 * pad}" height="2" fill="#3a3d42"/>
  <text x="${pad}" y="574" font-family="Barlow Condensed" font-weight="700" font-size="62" fill="${C.accent}">Would you approve this?</text>
  <text x="${WIDTH - pad}" y="570" text-anchor="end" font-family="Barlow Condensed" font-weight="700" font-size="30" letter-spacing="3" fill="${C.muted}">APPROVE · DENY</text>
</svg>`;
}

/** Renders the card to an optimized PNG. */
export async function renderCard(input: CardInput): Promise<Buffer> {
  const png = new Resvg(cardSvg(input), {
    font: { fontFiles: [FONT_FILES.plate, FONT_FILES.body], loadSystemFonts: false, defaultFontFamily: 'Barlow' },
  })
    .render()
    .asPng();
  // Flat artwork: a small palette with light dithering keeps gradients smooth and files small.
  return sharp(png).png({ palette: true, colors: 64, dither: 0.6, effort: 10, compressionLevel: 9 }).toBuffer();
}
