#!/usr/bin/env node
// Regenerates assets/stack.svg — the "Stack" card.
//
// This replaces fourteen img.shields.io badges with one self-hosted asset, for
// the same reason assets/langs.svg is generated rather than pulled from a card
// service: fourteen third-party requests can rate-limit, go down, or simply
// render at fourteen slightly different heights. It also matches the type and
// palette of langs.svg instead of sitting next to it in a different style.
//
// Dot colours are each project's own brand colour, adjusted only where the
// real one is illegible on a near-black card (Flask and Next.js are black or
// white; pandas' navy #150458 disappears entirely).

const fs = require('fs');

const COLUMNS = [
  ['LANGUAGES', [
    ['Python',      '#3776AB'],
    ['TypeScript',  '#3178C6'],
    ['JavaScript',  '#F7DF1E'],
    ['PHP',         '#8892BF'],
    ['R',           '#276DC3'],
  ]],
  ['BACKEND', [
    ['Laravel',     '#FF2D20'],
    ['Flask',       '#D8D5EA'],
    ['Node.js',     '#43A047'],
  ]],
  ['FRONTEND', [
    ['Next.js',     '#D8D5EA'],
    ['Tailwind',    '#38BDF8'],
  ]],
  ['DATA & TOOLING', [
    ['pandas',      '#E70488'],
    ['Jupyter',     '#F37626'],
    ['Git',         '#F05032'],
    ['GitHub Actions', '#2088FF'],
  ]],
];

const W = 760;
const PAD = 30;
const COL_W = (W - PAD * 2) / COLUMNS.length;
const ROW_H = 24;
const ROW_TOP = 84;
const MONO = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';

const rows = Math.max(...COLUMNS.map(([, items]) => items.length));
const H = ROW_TOP + (rows - 1) * ROW_H + 26;

const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

let body = '';
let delay = 0.20;
COLUMNS.forEach(([heading, items], ci) => {
  const x = PAD + ci * COL_W;
  body += `\n  <text x="${x}" y="58" font-family="${MONO}" font-size="10" letter-spacing="1.6" fill="#6E6A8C">${esc(heading)}</text>`;
  items.forEach(([name, color], ri) => {
    const y = ROW_TOP + ri * ROW_H;
    delay += 0.035;
    body += `\n  <g opacity="0">`
          + `<animate attributeName="opacity" values="0;1" dur="0.45s" begin="${delay.toFixed(2)}s" fill="freeze"/>`
          + `<circle cx="${x + 4}" cy="${y - 4}" r="4.5" fill="${color}"/>`
          + `<text x="${x + 17}" y="${y}" font-family="${MONO}" font-size="12" fill="#CECBF6">${esc(name)}</text>`
          + `</g>`;
  });
});

const aria = COLUMNS.map(([h, items]) => `${h.toLowerCase()}: ${items.map(i => i[0]).join(', ')}`).join('; ');

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${esc(aria)}">
  <title>EsmeAbha — stack</title>
  <rect width="100%" height="100%" rx="10" fill="#0A0A0F"/>
  <rect x="0.5" y="0.5" width="${W - 1}" height="${H - 1}" rx="10" fill="none" stroke="#7F77DD" stroke-opacity="0.25"/>
  <text x="${PAD}" y="26" font-family="${MONO}" font-size="12" letter-spacing="2" fill="#CECBF6">WHAT I BUILD WITH</text>
  <line x1="${PAD}" y1="38" x2="${W - PAD}" y2="38" stroke="#7F77DD" stroke-opacity="0.16"/>${body}
</svg>
`;

const out = process.argv[2] || 'assets/stack.svg';
fs.writeFileSync(out, svg);
console.log(`${out}: ${W}x${H}, ${COLUMNS.reduce((n, c) => n + c[1].length, 0)} entries`);
