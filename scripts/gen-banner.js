#!/usr/bin/env node
// Regenerates assets/banner.svg — a faithful bake of the particles.js network
// running on esmeabha.github.io (see assets/js/app.js on that site).
//
// The site's config, reproduced here:
//   particles.number.value        80
//   particles.opacity.value       0.5
//   particles.size.value          5      (random)
//   particles.line_linked.distance 150
//   particles.line_linked.opacity  0.4
//   particles.move.speed           6
//
// A README cannot run JavaScript — GitHub serves this through its camo proxy
// as an <img> under `Content-Security-Policy: default-src 'none'; sandbox`.
// So the motion is precomputed here and baked into SMIL, and onhover:repulse /
// onclick:push are simply not expressible in a README.
//
// Looping: every particle travels in a straight line and bounces inside its
// own box, exactly as particles.js does. A box of length L traversed at speed
// s has period 2L/s, so choosing s = 2*L*k/LOOP for integer k makes every
// period divide the loop and the whole field returns to its opening frame at
// t=LOOP. No crossfade, no visible seam.

const fs = require('fs');

const W = 1280, H = 340;
const N = 64;              // particles (80 on the site; trimmed for file size)
const LINK = 150;          // line_linked.distance
const LOOP = 24;           // seconds
const SAMPLES = 18;        // opacity keyframes per link
const MAX_LINKS = 88;     // cap, to hold the file near 100 KB; see the log line

// deterministic PRNG — the banner must not churn on every regeneration
let seed = 0x5eed1e;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
const rng = (a, b) => a + rnd() * (b - a);
const pick = a => a[Math.floor(rnd() * a.length)];
// "0.2500" -> ".25"; keyTimes lists are the single biggest cost in the file.
// Whole numbers must survive intact — a final keyTime of "1" rendered as
// anything else puts the list out of range and kills the animation outright.
const trim = v => {
  let s = v.toFixed(4);
  if (s.includes('.')) s = s.replace(/0+$/, '').replace(/\.$/, '');
  return s.replace(/^0(?=\.)/, '');
};

// ---------------------------------------------------------------- particles

// One axis of motion: bounce between lo and hi, period an exact divisor of
// LOOP. Returns the SMIL keyframes for the triangle wave.
function axis(lo, hi, start, dir, k) {
  const L = hi - lo;
  const s = (2 * L * k) / LOOP;          // speed that closes the loop
  const times = [0], vals = [start];
  let t = 0, p = start, d = dir;
  // first leg is a partial one, from `start` to whichever wall it faces
  for (let guard = 0; guard < 64; guard++) {
    const wall = d > 0 ? hi : lo;
    const dt = Math.abs(wall - p) / s;
    if (t + dt >= LOOP - 1e-9) break;
    t += dt; p = wall; d = -d;
    times.push(t); vals.push(p);
  }
  times.push(LOOP); vals.push(start);    // closes exactly, by construction
  return {
    speed: s,
    turns: times,                        // kink times, for adaptive sampling
    values: vals.map(v => v.toFixed(0)).join(';'),
    keyTimes: times.map(v => trim(v / LOOP)).join(';'),
    at: time => {                        // sample, for the link distances
      const per = (2 * L) / s;
      let u = (((time * s) + (dir > 0 ? p0off(start, lo) : (2 * L) - p0off(start, lo))) % (2 * L));
      return u <= L ? lo + u : lo + (2 * L - u);
    },
  };
  function p0off(v, l) { return v - l; }
}

// Each particle bounces inside its own box, so speeds vary between them
// instead of every dot moving in lockstep. Boxes are anchored to a jittered
// grid and kept modest in size: with large boxes the field drifts into clumps
// and leaves bald patches, whereas the live site stays evenly covered.
const COLS = 8, ROWS = 4, PER_CELL = N / (COLS * ROWS);
const parts = [];
for (let cy = 0; cy < ROWS; cy++) {
  for (let cx = 0; cx < COLS; cx++) {
    for (let n = 0; n < PER_CELL; n++) {
      const homeX = ((cx + 0.5) / COLS) * W + rng(-70, 70);
      const homeY = ((cy + 0.5) / ROWS) * H + rng(-26, 26);
      const bw = rng(190, 330), bh = rng(60, 130);
      const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
      const lox = clamp(homeX - bw / 2, 10, W - 10 - bw);
      const loy = clamp(homeY - bh / 2, 10, H - 10 - bh);
      const x = axis(lox, lox + bw, rng(lox, lox + bw), pick([1, -1]), pick([1, 2, 2, 3]));
      const y = axis(loy, loy + bh, rng(loy, loy + bh), pick([1, -1]), pick([1, 2, 3, 4]));
      parts.push({ x, y, r: rng(1.1, 3.4), o: rng(0.32, 0.62) });
    }
  }
}

// ------------------------------------------------------------------- links

// line_linked.opacity 0.4, faded by distance the way particles.js does
const opacityAt = (A, B, t) => {
  const d = Math.hypot(A.x.at(t) - B.x.at(t), A.y.at(t) - B.y.at(t));
  return d >= LINK ? 0 : 0.4 * (1 - d / LINK);
};

// A uniform grid gets the fades wrong: a link that crosses the 150px threshold
// between two samples switches on or off at the wrong moment, and every bounce
// puts a kink in the distance curve that linear interpolation cuts across. So
// sample at the kinks and at the exact threshold crossings, then drop whatever
// keyframes linear interpolation would have reproduced anyway.
function opacityCurve(A, B) {
  const set = new Set([0, LOOP]);
  for (const ax of [A.x, A.y, B.x, B.y]) for (const t of ax.turns) set.add(t);
  const DENSE = 192;   // sampled densely, then thinned by RDP below
  for (let i = 0; i <= DENSE; i++) set.add((i / DENSE) * LOOP);
  let ts = [...set].filter(t => t >= 0 && t <= LOOP).sort((p, q) => p - q);

  // bisect for the moments the pair passes through exactly LINK apart
  const dist = t => Math.hypot(A.x.at(t) - B.x.at(t), A.y.at(t) - B.y.at(t));
  const cross = [];
  for (let i = 0; i < ts.length - 1; i++) {
    let l = ts[i], r = ts[i + 1];
    if ((dist(l) - LINK) * (dist(r) - LINK) >= 0) continue;
    for (let it = 0; it < 40; it++) {
      const m = (l + r) / 2;
      if ((dist(l) - LINK) * (dist(m) - LINK) <= 0) r = m; else l = m;
    }
    cross.push(l, r);
  }
  ts = [...new Set([...ts, ...cross])].sort((p, q) => p - q);

  const pts = ts.map(t => [t, opacityAt(A, B, t)]);

  // Douglas-Peucker, measuring every candidate against the ORIGINAL curve.
  // (A greedy multi-pass filter compounds its own error and drifts well past
  // the tolerance; this bounds it.)
  const TOL = 0.008;
  const keep = new Uint8Array(pts.length);
  keep[0] = keep[pts.length - 1] = 1;
  (function rdp(lo, hi) {
    if (hi - lo < 2) return;
    const [t0, v0] = pts[lo], [t1, v1] = pts[hi];
    let worst = -1, at = -1;
    for (let i = lo + 1; i < hi; i++) {
      const f = (pts[i][0] - t0) / ((t1 - t0) || 1);
      const e = Math.abs(v0 + (v1 - v0) * f - pts[i][1]);
      if (e > worst) { worst = e; at = i; }
    }
    if (worst <= TOL) return;
    keep[at] = 1;
    rdp(lo, at); rdp(at, hi);
  })(0, pts.length - 1);

  return pts.filter((_, i) => keep[i]);
}

const cand = [];
for (let a = 0; a < N; a++) {
  for (let b = a + 1; b < N; b++) {
    // cheap uniform prefilter, so the expensive curve runs only on real links
    let weight = 0;
    for (let s = 0; s <= SAMPLES; s++) weight += opacityAt(parts[a], parts[b], (s / SAMPLES) * LOOP);
    if (weight <= 0.35) continue;
    cand.push({ a, b, pts: opacityCurve(parts[a], parts[b]), weight });
  }
}
cand.sort((p, q) => q.weight - p.weight);
const links = cand.slice(0, MAX_LINKS);

// --------------------------------------------------------------------- svg

// calcMode="linear" is the default for <animate>, so it is left off to save bytes
const anim = (attr, ax) =>
  `<animate attributeName="${attr}" values="${ax.values}" keyTimes="${ax.keyTimes}" dur="${LOOP}s" repeatCount="indefinite"/>`;

let mesh = '';
for (const l of links) {
  const A = parts[l.a], B = parts[l.b];
  const kt = l.pts.map(p => trim(p[0] / LOOP)).join(';');
  const ov = l.pts.map(p => trim(p[1])).join(';');
  mesh += `<line>${anim('x1', A.x)}${anim('y1', A.y)}${anim('x2', B.x)}${anim('y2', B.y)}`
        + `<animate attributeName="stroke-opacity" values="${ov}" keyTimes="${kt}" dur="${LOOP}s" repeatCount="indefinite"/></line>\n  `;
}

let dots = '';
for (const p of parts) {
  dots += `<circle r="${p.r.toFixed(2)}" fill-opacity="${p.o.toFixed(2)}">${anim('cx', p.x)}${anim('cy', p.y)}</circle>\n  `;
}

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}"
     role="img" aria-label="Esme Abha - backend engineer, AI tooling, automation">
  <title>Esme Abha — backend engineer · ai tooling · automation</title>

  <!-- Generated by scripts/gen-banner.js — edit that, not this file.
       A bake of the particles.js network from esmeabha.github.io: ${N} particles,
       links under ${LINK}px, opacity 0.5 / 0.4, straight-line motion with bounce,
       looping seamlessly every ${LOOP}s. The cursor interactions (repulse on
       hover, push on click) exist only on the live site — a README image gets
       no JavaScript and no pointer events. -->

  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#0d0c16"/>
      <stop offset="55%" stop-color="#06060b"/>
      <stop offset="100%" stop-color="#000000"/>
    </linearGradient>
    <radialGradient id="vig" cx="50%" cy="48%" r="62%">
      <stop offset="0%"   stop-color="#000" stop-opacity="0"/>
      <stop offset="66%"  stop-color="#000" stop-opacity="0"/>
      <stop offset="100%" stop-color="#000" stop-opacity="0.82"/>
    </radialGradient>
  </defs>

  <rect width="${W}" height="${H}" fill="url(#bg)"/>

  <g stroke="#7F77DD" stroke-width="1">
  ${mesh.trim()}
  </g>

  <g fill="#CECBF6">
  ${dots.trim()}
  </g>

  <rect width="${W}" height="${H}" fill="url(#vig)"/>

  <text x="640" y="252" text-anchor="middle"
        font-family="Segoe UI, Helvetica Neue, Arial, sans-serif"
        font-size="54" font-weight="300" fill="#ffffff" letter-spacing="20" opacity="0">
    Esme Abha
    <animate attributeName="opacity" values="0;1" dur="1.1s" begin="0.15s" fill="freeze"/>
  </text>

  <g opacity="0">
    <animate attributeName="opacity" values="0;1" dur="0.9s" begin="0.8s" fill="freeze"/>
    <text x="640" y="290" text-anchor="middle"
          font-family="ui-monospace, SFMono-Regular, Menlo, Consolas, monospace"
          font-size="13" letter-spacing="4.5" fill="#8F8AB8">backend engineer · ai tooling · automation</text>
  </g>
</svg>
`;

const out = process.argv[2] || 'assets/banner.svg';
fs.writeFileSync(out, svg);
console.log(`${out}: ${(svg.length / 1024).toFixed(1)} KB, ${N} particles, ` +
            `${links.length}/${cand.length} links kept, ${LOOP}s loop`);
