// ../../../Users/twoimo/Documents/projects/bitcoin-cycle-atlas/node_modules/@funnest/charts-viz/dist/index.js
function linearScale(domain, range) {
  const [d0, d1] = domain;
  const [r0, r1] = range;
  const span = d1 - d0;
  const scale = ((v) => span === 0 ? (r0 + r1) / 2 : r0 + (v - d0) / span * (r1 - r0));
  scale.invert = (p) => r1 === r0 ? d0 : d0 + (p - r0) / (r1 - r0) * span;
  Object.assign(scale, { kind: "linear", domain: [d0, d1], range: [r0, r1] });
  return scale;
}
function logScale(domain, range) {
  const d0 = Math.max(Number.MIN_VALUE, domain[0]);
  const d1 = Math.max(d0, domain[1]);
  const inner = linearScale([Math.log10(d0), Math.log10(d1)], range);
  const scale = ((v) => inner(Math.log10(Math.max(v, d0))));
  scale.invert = (p) => 10 ** inner.invert(p);
  Object.assign(scale, { kind: "log", domain: [d0, d1], range: [range[0], range[1]] });
  return scale;
}
function bandScale(count, range, padding = 0.2) {
  const [r0, r1] = range;
  const n = Math.max(1, count);
  const step = (r1 - r0) / n;
  const pad = clamp(padding, 0, 0.95);
  const bandwidth = step * (1 - pad);
  const scale = ((i) => r0 + i * step + (step - bandwidth) / 2);
  scale.center = (i) => r0 + i * step + step / 2;
  scale.invert = (p) => clamp(Math.floor((p - r0) / step), 0, n - 1);
  Object.assign(scale, { kind: "band", count: n, range: [r0, r1], bandwidth, step });
  return scale;
}
var clamp = (v, lo, hi) => v < lo ? lo : v > hi ? hi : v;
var STEPS = [1, 2, 2.5, 5, 10];
var round = (v) => Number.parseFloat(v.toPrecision(12));
function niceStep(min, max, count = 5) {
  const span = Math.abs(max - min);
  if (!Number.isFinite(span) || span === 0) return 1;
  const raw = span / Math.max(1, count);
  const mag = 10 ** Math.floor(Math.log10(raw));
  const norm = raw / mag;
  const step = STEPS.find((s) => s >= norm - 1e-9) ?? 10;
  return round(step * mag);
}
function ticks(min, max, count = 5) {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return [];
  if (min === max) return [min];
  const lo = Math.min(min, max);
  const hi = Math.max(min, max);
  const step = niceStep(lo, hi, count);
  const out = [];
  const first = Math.ceil(lo / step - 1e-9);
  for (let k = first; k * step <= hi + step * 1e-9; k++) out.push(round(k * step));
  return out;
}
function logTicks(min, max, count = 5) {
  if (!(min > 0) || !(max > min)) return ticks(min, max, count);
  const lo = Math.floor(Math.log10(min));
  const hi = Math.ceil(Math.log10(max));
  if (hi - lo <= 1) return ticks(min, max, count);
  const pick = (mults) => {
    const out = [];
    for (let e = lo; e <= hi; e++) for (const m of mults) {
      const v = round(m * 10 ** e);
      if (v >= min * (1 - 1e-9) && v <= max * (1 + 1e-9)) out.push(v);
    }
    return out;
  };
  const dense = pick([1, 2, 5]);
  return dense.length <= count * 2 ? dense : pick([1]);
}
var f = (n) => (Math.round(n * 100) / 100).toString();
function linePath(points, curve = "linear") {
  const n = points.length;
  if (n === 0) return "";
  const p0 = points[0];
  let d = `M${f(p0.x)},${f(p0.y)}`;
  if (n === 1) return d;
  switch (curve) {
    case "monotone":
      return d + monotoneSegments(points);
    case "step":
      for (let i = 1; i < n; i++) {
        const a = points[i - 1];
        const b = points[i];
        d += `H${f((a.x + b.x) / 2)}V${f(b.y)}H${f(b.x)}`;
      }
      return d;
    case "stepAfter":
      for (let i = 1; i < n; i++) d += `H${f(points[i].x)}V${f(points[i].y)}`;
      return d;
    case "stepBefore":
      for (let i = 1; i < n; i++) d += `V${f(points[i].y)}H${f(points[i].x)}`;
      return d;
    default:
      for (let i = 1; i < n; i++) d += `L${f(points[i].x)},${f(points[i].y)}`;
      return d;
  }
}
function areaPath(top, baseline, curve = "linear") {
  if (top.length === 0) return "";
  const upper = linePath(top, curve);
  if (typeof baseline === "number") {
    const last = top[top.length - 1];
    const first = top[0];
    return `${upper}L${f(last.x)},${f(baseline)}L${f(first.x)},${f(baseline)}Z`;
  }
  const lower = linePath([...baseline].reverse(), curve).replace(/^M/, "L");
  return `${upper}${lower}Z`;
}
function segments(values) {
  const out = [];
  let cur = null;
  values.forEach((v, i) => {
    if (v === null || v === void 0 || typeof v === "number" && !Number.isFinite(v)) {
      cur = null;
      return;
    }
    if (!cur) {
      cur = { start: i, values: [] };
      out.push(cur);
    }
    cur.values.push(v);
  });
  return out;
}
function barPath(x, width, baseY, valueY, radius = 0, roundBase = false) {
  const top = Math.min(baseY, valueY);
  const bottom = Math.max(baseY, valueY);
  const h = bottom - top;
  const x1 = x + width;
  const r = Math.max(0, Math.min(radius, width / 2, roundBase ? h / 2 : h));
  if (r === 0) return `M${f(x)},${f(top)}H${f(x1)}V${f(bottom)}H${f(x)}Z`;
  const up = valueY <= baseY;
  const rTop = up || roundBase ? r : 0;
  const rBottom = !up || roundBase ? r : 0;
  return `M${f(x)},${f(top + rTop)}` + (rTop ? `Q${f(x)},${f(top)} ${f(x + rTop)},${f(top)}` : "") + `H${f(x1 - rTop)}` + (rTop ? `Q${f(x1)},${f(top)} ${f(x1)},${f(top + rTop)}` : "") + `V${f(bottom - rBottom)}` + (rBottom ? `Q${f(x1)},${f(bottom)} ${f(x1 - rBottom)},${f(bottom)}` : "") + `H${f(x + rBottom)}` + (rBottom ? `Q${f(x)},${f(bottom)} ${f(x)},${f(bottom - rBottom)}` : "") + "Z";
}
function monotoneSegments(p) {
  const n = p.length;
  const dx = [];
  const slope = [];
  for (let i = 0; i < n - 1; i++) {
    const h = p[i + 1].x - p[i].x;
    dx.push(h);
    slope.push(h === 0 ? 0 : (p[i + 1].y - p[i].y) / h);
  }
  const t = new Array(n).fill(0);
  t[0] = slope[0];
  t[n - 1] = slope[n - 2];
  for (let i = 1; i < n - 1; i++) {
    const s0 = slope[i - 1];
    const s1 = slope[i];
    if (s0 * s1 <= 0) continue;
    const h0 = dx[i - 1];
    const h1 = dx[i];
    const w1 = 2 * h1 + h0;
    const w2 = h1 + 2 * h0;
    t[i] = (w1 + w2) / (w1 / s0 + w2 / s1);
  }
  let d = "";
  for (let i = 0; i < n - 1; i++) {
    const a = p[i];
    const b = p[i + 1];
    const h = dx[i] / 3;
    d += `C${f(a.x + h)},${f(a.y + t[i] * h)} ${f(b.x - h)},${f(b.y - t[i + 1] * h)} ${f(b.x)},${f(b.y)}`;
  }
  return d;
}
var TAU = Math.PI * 2;
export {
  areaPath,
  bandScale,
  barPath,
  linePath,
  linearScale,
  logScale,
  logTicks,
  segments,
  ticks
};
