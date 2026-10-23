#!/usr/bin/env node
/**
 * tools/icons.mjs — favicon set + default share image (npm run icons).
 * The mark: a survey pin standing on the lagoon line (DESIGN §1), ink on salt.
 * Writes public/favicon.svg, public/favicon-32.png, public/apple-touch-icon.png,
 * public/icon-512.png and public/og-default.png (1200×630, outlined wordmark — no fonts needed).
 * Needs src/assets/wordmark.ts (npm run wordmark) and sharp (installed with Astro).
 */
import { writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { wordmark, hotelLine } from '../src/assets/wordmark.ts';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const pub = (f) => resolve(root, 'public', f);
const SALT = '#EDEAE0', INK = '#0E2B29', POUCH = '#E2592A';

// 32-unit grid. Square corners (the world has no rounded panels).
const mark = (bg = INK, fg = SALT) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
<rect width="32" height="32" fill="${bg}"/>
<path d="M3 23.5h26" stroke="${fg}" stroke-width="2"/>
<path d="M7 27.5h18" stroke="${fg}" stroke-width="1.25" opacity=".7"/>
<path d="M16 18.5v5" stroke="${fg}" stroke-width="2"/>
<circle cx="16" cy="12" r="6.25" fill="${bg}" stroke="${fg}" stroke-width="2.5"/>
<circle cx="16" cy="12" r="2.6" fill="${POUCH}"/>
</svg>`;

const svg = mark();
writeFileSync(pub('favicon.svg'), svg);
await sharp(Buffer.from(svg), { density: 300 }).resize(32, 32).png().toFile(pub('favicon-32.png'));
// apple-touch: iOS rounds the corners itself; give the mark breathing room.
const touch = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-4 -4 40 40"><rect x="-4" y="-4" width="40" height="40" fill="${INK}"/>${svg.replace(/^<svg[^>]*>|<\/svg>$/g, '')}</svg>`;
await sharp(Buffer.from(touch), { density: 600 }).resize(180, 180).png().toFile(pub('apple-touch-icon.png'));
await sharp(Buffer.from(touch), { density: 1200 }).resize(512, 512).png().toFile(pub('icon-512.png'));

// Share image: chart paper, double rule, wordmark, hotel line, coastline hint.
const W = 1200, H = 630, M = 72;
const wmW = W - M * 2, wmScale = wmW / wordmark.width, wmH = wordmark.height * wmScale;
const [vx, vy] = wordmark.viewBox.split(' ').map(Number);
const hlScale = (wmW * 0.42) / hotelLine.width;
const [hx, hy] = hotelLine.viewBox.split(' ').map(Number);
const og = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
<rect width="${W}" height="${H}" fill="${SALT}"/>
<rect x="${M}" y="${M - 24}" width="${wmW}" height="6" fill="${INK}"/>
<rect x="${M}" y="${M - 12}" width="${wmW}" height="2" fill="${INK}"/>
<g transform="translate(${M} ${M + 40}) scale(${wmScale}) translate(${-vx} ${-vy})" fill="${INK}">${wordmark.paths.map((d) => `<path d="${d}"/>`).join('')}</g>
<g transform="translate(${M} ${M + 40 + wmH + 48}) scale(${hlScale}) translate(${-hx} ${-hy})" fill="${INK}">${hotelLine.paths.map((d) => `<path d="${d}"/>`).join('')}</g>
<path d="M${M} ${H - 70} C ${W * 0.3} ${H - 110}, ${W * 0.55} ${H - 40}, ${W - M} ${H - 86}" fill="none" stroke="${INK}" stroke-width="2"/>
<path d="M${M + 30} ${H - 52} C ${W * 0.32} ${H - 90}, ${W * 0.55} ${H - 24}, ${W - M - 30} ${H - 66}" fill="none" stroke="${INK}" stroke-width="1" opacity=".5"/>
<circle cx="${W - M - 210}" cy="${H - 150}" r="13" fill="${SALT}" stroke="${INK}" stroke-width="4"/>
<circle cx="${W - M - 210}" cy="${H - 150}" r="5" fill="${POUCH}"/>
<path d="M${W - M - 210} ${H - 136}v40" stroke="${INK}" stroke-width="3"/>
</svg>`;
await sharp(Buffer.from(og)).png({ compressionLevel: 9 }).toFile(pub('og-default.png'));
console.log('icons: favicon.svg, favicon-32.png, apple-touch-icon.png, icon-512.png, og-default.png');
