// node_modules/@funnest/charts/dist/index.js
var Emitter = class {
  listeners = /* @__PURE__ */ new Map();
  on(event, listener) {
    let set = this.listeners.get(event);
    if (!set) this.listeners.set(event, set = /* @__PURE__ */ new Set());
    set.add(listener);
    return () => set.delete(listener);
  }
  emit(event, payload) {
    const set = this.listeners.get(event);
    if (!set) return;
    for (const listener of set) listener(payload);
  }
  has(event) {
    return (this.listeners.get(event)?.size ?? 0) > 0;
  }
  clear() {
    this.listeners.clear();
  }
};
var LONG_PRESS_MS = 400;
var MOVE_SLOP = 8;
var DOUBLE_TAP_MS = 300;
var DOUBLE_TAP_SLOP = 24;
var VELOCITY_WINDOW_MS = 100;
var KINETIC_MIN_VELOCITY = 0.15;
var KINETIC_STOP_VELOCITY = 0.02;
var KINETIC_FRICTION = 0.995;
var WHEEL_ZOOM_SPEED = 15e-4;
var PINCH_WHEEL_ZOOM_SPEED = 0.01;
var AXIS_DRAG_SPEED = 4e-3;
var dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
var Interaction = class {
  constructor(host, el) {
    this.host = host;
    this.el = el;
    el.style.touchAction = "pan-y";
    el.style.cursor = "crosshair";
    this.listen("pointerdown", this.onPointerDown);
    this.listen("pointermove", this.onPointerMove);
    this.listen("pointerup", this.onPointerUp);
    this.listen("pointercancel", this.onPointerCancel);
    this.listen("pointerleave", this.onPointerLeave);
    this.listen("wheel", this.onWheel, { passive: false });
    this.listen("dblclick", this.onDoubleClick);
    this.listen("touchmove", this.onTouchMove, { passive: false });
    this.listen("contextmenu", this.onContextMenu);
  }
  host;
  el;
  pointers = /* @__PURE__ */ new Map();
  mode = "idle";
  touch = false;
  moved = false;
  start = { x: 0, y: 0 };
  last = { x: 0, y: 0 };
  region = { area: "none", pane: null };
  longPressTimer;
  samples = [];
  kineticFrame = 0;
  pinchDistance = 0;
  pinchMid = { x: 0, y: 0 };
  lastTap = { t: 0, x: 0, y: 0 };
  cleanups = [];
  destroy() {
    this.stopKinetic();
    clearTimeout(this.longPressTimer);
    for (const cleanup of this.cleanups) cleanup();
    this.cleanups.length = 0;
  }
  listen(type, handler, options) {
    const bound = handler.bind(this);
    this.el.addEventListener(type, bound, options);
    this.cleanups.push(() => this.el.removeEventListener(type, bound, options));
  }
  local(e) {
    const rect = this.el.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }
  // ── Pointer lifecycle ────────────────────────────────────────────────
  onPointerDown(e) {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    this.stopKinetic();
    const p = this.local(e);
    this.pointers.set(e.pointerId, p);
    this.el.setPointerCapture?.(e.pointerId);
    this.touch = e.pointerType !== "mouse";
    if (this.pointers.size === 2) {
      this.beginPinch();
      return;
    }
    if (this.pointers.size > 2) return;
    this.start = p;
    this.last = p;
    this.moved = false;
    this.samples = [{ t: performance.now(), x: p.x }];
    this.region = this.host.hitTest(p.x, p.y);
    switch (this.region.area) {
      case "priceAxis":
        this.mode = "priceScale";
        break;
      case "timeAxis":
        this.mode = "timeScale";
        break;
      case "paneBorder":
        this.mode = "paneResize";
        break;
      case "plot": {
        if (this.host.toolActive()) {
          this.mode = "draw";
          this.host.drawAt(p.x, p.y);
          if (!this.touch) this.host.setCrosshair(p.x, p.y, "mouse");
          break;
        }
        const hit = this.host.hitObject(p.x, p.y, this.touch);
        if (hit) {
          this.mode = "object";
          this.host.objectDown(hit, p.x, p.y);
          break;
        }
        this.host.clearSelection();
        if (this.touch) {
          this.mode = "pending";
          this.longPressTimer = setTimeout(() => this.onLongPress(), LONG_PRESS_MS);
        } else {
          this.mode = "pan";
          this.el.style.cursor = "grabbing";
        }
        break;
      }
      default:
        this.mode = "idle";
    }
  }
  onLongPress() {
    if (this.mode !== "pending") return;
    this.mode = "crosshair";
    this.host.setCrosshair(this.last.x, this.last.y, "touch");
    navigator.vibrate?.(8);
  }
  onPointerMove(e) {
    const p = this.local(e);
    if (!this.pointers.has(e.pointerId)) {
      if (e.pointerType === "mouse" && this.mode === "idle") this.hover(p);
      return;
    }
    this.pointers.set(e.pointerId, p);
    if (!this.moved && dist(p, this.start) > MOVE_SLOP) this.moved = true;
    switch (this.mode) {
      case "pinch":
        this.updatePinch();
        return;
      case "draw":
        this.host.drawPreview(p.x, p.y);
        if (!this.touch) this.host.setCrosshair(p.x, p.y, "mouse");
        break;
      case "object":
        this.host.objectMove(p.x, p.y);
        break;
      case "pending":
        if (!this.moved) return;
        clearTimeout(this.longPressTimer);
        this.mode = "pan";
        this.pan(p);
        break;
      case "pan":
        this.pan(p);
        if (!this.touch) this.host.setCrosshair(p.x, p.y, "mouse");
        break;
      case "crosshair":
        this.host.setCrosshair(p.x, p.y, "touch");
        break;
      case "priceScale":
        if (this.region.pane) this.host.scalePrice(this.region.pane, Math.exp((p.y - this.last.y) * AXIS_DRAG_SPEED));
        break;
      case "timeScale":
        this.host.zoomTime(this.host.plotWidth(), Math.exp((p.x - this.last.x) * AXIS_DRAG_SPEED));
        break;
      case "paneResize":
        if (this.region.border) this.host.resizePane(this.region.border, p.y - this.last.y);
        break;
    }
    this.last = p;
  }
  onPointerUp(e) {
    if (!this.pointers.has(e.pointerId)) return;
    const p = this.local(e);
    this.pointers.delete(e.pointerId);
    clearTimeout(this.longPressTimer);
    if (this.mode === "pinch") {
      this.endPinch();
      return;
    }
    if (this.mode === "draw") this.host.drawRelease(p.x, p.y, this.moved);
    if (this.mode === "object") this.host.objectUp(this.moved);
    const tapModes = ["pending", "priceScale", "timeScale", "paneResize"];
    if (this.touch && !this.moved && tapModes.includes(this.mode)) this.handleTap(p);
    if (this.mode === "pan") this.startKinetic();
    if (this.mode === "crosshair") this.host.clearCrosshair();
    this.mode = "idle";
    if (!this.touch) this.hover(p);
  }
  onPointerCancel(e) {
    this.pointers.delete(e.pointerId);
    clearTimeout(this.longPressTimer);
    if (this.mode === "pinch" && this.pointers.size > 0) {
      this.endPinch();
      return;
    }
    if (this.mode === "object") this.host.objectUp(this.moved);
    if (this.mode === "crosshair" || this.touch) this.host.clearCrosshair();
    this.mode = "idle";
  }
  onPointerLeave(e) {
    if (e.pointerType === "mouse" && this.mode === "idle") {
      this.host.clearCrosshair();
      this.host.hoverObject(null);
    }
  }
  hover(p) {
    const region = this.host.hitTest(p.x, p.y);
    let cursor = region.area === "priceAxis" ? "ns-resize" : region.area === "timeAxis" ? "ew-resize" : region.area === "paneBorder" ? "row-resize" : "crosshair";
    let hovered = null;
    if (region.area === "plot") {
      if (this.host.toolActive()) {
        this.host.drawPreview(p.x, p.y);
      } else {
        const hit = this.host.hitObject(p.x, p.y, false);
        hovered = hit;
        if (hit?.kind === "order") cursor = hit.part === "cancel" ? "pointer" : "ns-resize";
        else if (hit?.kind === "execution") cursor = "pointer";
        else if (hit) cursor = hit.part === "body" ? "move" : "grab";
      }
    }
    this.host.hoverObject(hovered);
    this.el.style.cursor = cursor;
    if (region.area === "plot") this.host.setCrosshair(p.x, p.y, "mouse");
    else this.host.clearCrosshair();
  }
  pan(p) {
    this.host.panTime(p.x - this.last.x);
    if (this.region.pane) this.host.panPrice(this.region.pane, p.y - this.last.y);
    const t = performance.now();
    this.samples.push({ t, x: p.x });
    while (this.samples.length > 2 && t - this.samples[0].t > VELOCITY_WINDOW_MS) this.samples.shift();
  }
  handleTap(p) {
    const t = performance.now();
    const isDouble = t - this.lastTap.t < DOUBLE_TAP_MS && dist(p, this.lastTap) < DOUBLE_TAP_SLOP;
    if (isDouble) {
      this.lastTap.t = 0;
      if (this.region.area === "priceAxis" && this.region.pane) this.host.resetPriceScale(this.region.pane);
      else if (this.region.area === "paneBorder") this.host.resetPaneSizes();
      else this.host.resetView();
    } else {
      this.lastTap = { t, x: p.x, y: p.y };
    }
  }
  // ── Pinch ───────────────────────────────────────────────────────────
  pinchPoints() {
    const [a, b] = [...this.pointers.values()];
    return [a, b];
  }
  beginPinch() {
    clearTimeout(this.longPressTimer);
    this.host.clearCrosshair();
    this.mode = "pinch";
    const [a, b] = this.pinchPoints();
    this.pinchDistance = dist(a, b);
    this.pinchMid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  }
  updatePinch() {
    if (this.pointers.size < 2) return;
    const [a, b] = this.pinchPoints();
    const d = dist(a, b);
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    if (this.pinchDistance > 0 && d > 0) this.host.zoomTime(mid.x, d / this.pinchDistance);
    this.host.panTime(mid.x - this.pinchMid.x);
    this.pinchDistance = d;
    this.pinchMid = mid;
  }
  endPinch() {
    const remaining = [...this.pointers.values()][0];
    if (remaining) {
      this.mode = "pan";
      this.moved = true;
      this.last = remaining;
      this.region = this.host.hitTest(remaining.x, remaining.y);
      this.samples = [];
    } else {
      this.mode = "idle";
    }
  }
  // ── Inertia ─────────────────────────────────────────────────────────
  startKinetic() {
    const first = this.samples[0];
    const last = this.samples[this.samples.length - 1];
    if (!first || !last || last.t - first.t <= 0 || performance.now() - last.t > 50) return;
    let velocity = (last.x - first.x) / (last.t - first.t);
    if (Math.abs(velocity) < KINETIC_MIN_VELOCITY) return;
    let prev = performance.now();
    const step = (now) => {
      const dt = Math.min(32, now - prev);
      prev = now;
      this.host.panTime(velocity * dt);
      velocity *= KINETIC_FRICTION ** dt;
      this.kineticFrame = Math.abs(velocity) > KINETIC_STOP_VELOCITY ? requestAnimationFrame(step) : 0;
    };
    this.kineticFrame = requestAnimationFrame(step);
  }
  stopKinetic() {
    if (this.kineticFrame) cancelAnimationFrame(this.kineticFrame);
    this.kineticFrame = 0;
  }
  // ── Wheel / misc ────────────────────────────────────────────────────
  onWheel(e) {
    e.preventDefault();
    this.stopKinetic();
    const p = this.local(e);
    const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? this.el.clientHeight : 1;
    let dx = e.deltaX * unit;
    const dy = e.deltaY * unit;
    const region = this.host.hitTest(p.x, p.y);
    if (region.area === "priceAxis" && region.pane) {
      this.host.scalePrice(region.pane, Math.exp(dy * 2e-3));
      return;
    }
    if (e.ctrlKey) {
      this.host.zoomTime(p.x, Math.exp(-dy * PINCH_WHEEL_ZOOM_SPEED));
      return;
    }
    if (e.shiftKey && dx === 0) dx = dy;
    if (Math.abs(dx) > Math.abs(dy) || e.shiftKey) this.host.panTime(-dx);
    else this.host.zoomTime(Math.min(p.x, this.host.plotWidth()), Math.exp(-dy * WHEEL_ZOOM_SPEED));
  }
  onDoubleClick(e) {
    if (this.touch) return;
    const p = this.local(e);
    const region = this.host.hitTest(p.x, p.y);
    if (region.area === "priceAxis" && region.pane) this.host.resetPriceScale(region.pane);
    else if (region.area === "paneBorder") this.host.resetPaneSizes();
    else if (region.area !== "none") this.host.resetView();
  }
  onTouchMove(e) {
    if (this.mode !== "idle" && this.mode !== "pending") e.preventDefault();
  }
  onContextMenu(e) {
    if (this.touch) {
      e.preventDefault();
      return;
    }
    const p = this.local(e);
    if (this.host.contextMenu(p.x, p.y)) e.preventDefault();
  }
};
function normalize(bars) {
  let sorted = true;
  for (let i = 1; i < bars.length; i++) {
    if (bars[i].time <= bars[i - 1].time) {
      sorted = false;
      break;
    }
  }
  if (sorted) return bars.slice();
  const copy = bars.slice().sort((a, b) => a.time - b.time);
  const out = [];
  for (const bar of copy) {
    if (out.length > 0 && out[out.length - 1].time === bar.time) out[out.length - 1] = bar;
    else out.push(bar);
  }
  return out;
}
var BarStore = class {
  items = [];
  get bars() {
    return this.items;
  }
  get length() {
    return this.items.length;
  }
  at(index) {
    return this.items[index];
  }
  first() {
    return this.items[0];
  }
  last() {
    return this.items[this.items.length - 1];
  }
  set(bars) {
    this.items = normalize(bars);
  }
  /** Adds older bars in front. Bars not strictly older than the current first bar are dropped. Returns the count added. */
  prepend(bars) {
    const first = this.first();
    const older = normalize(first ? bars.filter((b) => b.time < first.time) : bars);
    if (older.length > 0) this.items = older.concat(this.items);
    return older.length;
  }
  /**
   * Newer than the last bar → append. Same time as any existing bar → update in place
   * (late/out-of-order WebSocket messages can still correct a closed bar).
   * Older time that doesn't exist → ignored (use `merge` to fill gaps).
   */
  upsert(bar) {
    const last = this.last();
    if (!last || bar.time > last.time) {
      this.items.push(bar);
      return "append";
    }
    const index = bar.time === last.time ? this.items.length - 1 : this.indexOfTime(bar.time);
    if (index < 0) return "ignored";
    this.items[index] = bar;
    return "update";
  }
  /**
   * Merges a batch that may overlap, extend, or fill gaps in the series
   * (e.g. bars re-fetched after a WebSocket reconnect). Incoming bars win on equal time.
   */
  merge(bars) {
    if (bars.length === 0) return;
    this.items = normalize(this.items.concat(bars));
  }
  /** Index of the bar containing `time` (largest bar.time <= time); -1 if before the first bar. */
  indexAtOrBefore(time) {
    let lo = 0;
    let hi = this.items.length - 1;
    let found = -1;
    while (lo <= hi) {
      const mid = lo + hi >> 1;
      if (this.items[mid].time <= time) {
        found = mid;
        lo = mid + 1;
      } else hi = mid - 1;
    }
    return found;
  }
  /**
   * Fractional index for any timestamp: interpolated between bars, extrapolated
   * beyond either end using `interval` (ms per bar). Lets drawings anchor to time.
   */
  indexFloatOfTime(time, interval) {
    const n = this.items.length;
    if (n === 0) return Number.NaN;
    const first = this.items[0];
    const last = this.items[n - 1];
    if (time <= first.time) return (time - first.time) / interval;
    if (time >= last.time) return n - 1 + (time - last.time) / interval;
    const i = this.indexAtOrBefore(time);
    const t0 = this.items[i].time;
    const t1 = this.items[i + 1].time;
    return i + (time - t0) / (t1 - t0);
  }
  /** Inverse of `indexFloatOfTime`. */
  timeOfIndexFloat(index, interval) {
    const n = this.items.length;
    if (n === 0) return Number.NaN;
    if (index <= 0) return this.items[0].time + index * interval;
    if (index >= n - 1) return this.items[n - 1].time + (index - (n - 1)) * interval;
    const i = Math.floor(index);
    const t0 = this.items[i].time;
    return t0 + (index - i) * (this.items[i + 1].time - t0);
  }
  /** Binary search for an exact timestamp; -1 when absent. */
  indexOfTime(time) {
    let lo = 0;
    let hi = this.items.length - 1;
    while (lo <= hi) {
      const mid = lo + hi >> 1;
      const t = this.items[mid].time;
      if (t === time) return mid;
      if (t < time) lo = mid + 1;
      else hi = mid - 1;
    }
    return -1;
  }
};
function decimalsOf(value) {
  if (!Number.isFinite(value) || Number.isInteger(value)) return 0;
  const [mantissa = "", exp] = value.toExponential().split("e");
  const fraction = mantissa.split(".")[1]?.length ?? 0;
  return Math.max(0, fraction - Number(exp));
}
function resolveTickSize(tickSize, price) {
  return typeof tickSize === "function" ? tickSize(price) : tickSize;
}
function roundToTick(price, tickSize) {
  const tick = resolveTickSize(tickSize, price);
  if (!(tick > 0)) return price;
  const decimals = decimalsOf(tick);
  const scale = 10 ** decimals;
  const scaledTick = Math.round(tick * scale);
  const scaledPrice = Number((price * scale).toPrecision(15));
  return Math.round(scaledPrice / scaledTick) * scaledTick / scale;
}
function formatPrice(price, precision, { thousandsSeparator = true } = {}) {
  if (!Number.isFinite(price)) return "";
  const fixed = Math.abs(price).toFixed(precision);
  const [int = "0", frac] = fixed.split(".");
  const intPart = thousandsSeparator ? int.replace(/\B(?=(\d{3})+(?!\d))/g, ",") : int;
  const sign = price < 0 && Number(fixed) !== 0 ? "-" : "";
  return sign + (frac ? `${intPart}.${frac}` : intPart);
}
var COMPACT_UNITS = {
  ko: [
    [1e12, "\uC870"],
    [1e8, "\uC5B5"],
    [1e4, "\uB9CC"]
  ],
  en: [
    [1e9, "B"],
    [1e6, "M"],
    [1e3, "K"]
  ]
};
function formatCompact(value, locale = "ko") {
  if (!Number.isFinite(value)) return "";
  const abs = Math.abs(value);
  for (const [unit, suffix] of COMPACT_UNITS[locale]) {
    if (abs >= unit) {
      const scaled = value / unit;
      const digits = Math.abs(scaled) < 10 ? 2 : Math.abs(scaled) < 100 ? 1 : 0;
      return trimFractionZeros(formatPrice(scaled, digits)) + suffix;
    }
  }
  return trimFractionZeros(formatPrice(value, abs < 10 && !Number.isInteger(value) ? 2 : 0));
}
function trimFractionZeros(s) {
  return s.includes(".") ? s.replace(/\.?0+$/, "") : s;
}
var PriceScale = class {
  constructor(margins) {
    this.margins = margins;
  }
  margins;
  height = 0;
  mode = "normal";
  /** Pixels reserved at the top for overlays (e.g. a legend); margins apply below it. */
  insetTop = 0;
  autoScale = true;
  lo = 0;
  hi = 1;
  get min() {
    return this.lo;
  }
  get max() {
    return this.hi;
  }
  setRange(min, max) {
    if (!Number.isFinite(min) || !Number.isFinite(max)) return;
    if (max < min) [min, max] = [max, min];
    if (this.mode === "log" && min <= 0) min = max > 0 ? max / 1e3 : LOG_FLOOR;
    if (max - min < 1e-12) {
      const pad = Math.abs(max) * 0.01 || 1;
      min -= pad;
      max += pad;
    }
    this.lo = min;
    this.hi = max;
  }
  /** Height left after the inset (never less than half the pane, so tiny panes still show data). */
  get available() {
    return Math.max(this.height / 2, this.height - this.insetTop);
  }
  get innerTop() {
    return this.height - this.available + this.available * this.margins.top;
  }
  get innerHeight() {
    return Math.max(1, this.available * (1 - this.margins.top - this.margins.bottom));
  }
  /** Price → the space the axis is linear in (log prices in log mode). */
  toAxis(price) {
    return this.mode === "log" ? Math.log(Math.max(price, LOG_FLOOR)) : price;
  }
  fromAxis(v) {
    return this.mode === "log" ? Math.exp(v) : v;
  }
  priceToY(price) {
    const lo = this.toAxis(this.lo);
    const hi = this.toAxis(this.hi);
    return this.innerTop + (hi - this.toAxis(price)) / (hi - lo) * this.innerHeight;
  }
  yToPrice(y) {
    const lo = this.toAxis(this.lo);
    const hi = this.toAxis(this.hi);
    return this.fromAxis(hi - (y - this.innerTop) / this.innerHeight * (hi - lo));
  }
  /** Sets the range in axis space (log prices in log mode). */
  setAxisRange(lo, hi) {
    this.setRange(this.fromAxis(lo), this.fromAxis(hi));
  }
  /** Scales around the center. factor > 1 shows a wider price range. Disables auto-scale. */
  zoom(factor) {
    const lo = this.toAxis(this.lo);
    const hi = this.toAxis(this.hi);
    const center = (lo + hi) / 2;
    const half = (hi - lo) / 2 * factor;
    this.setAxisRange(center - half, center + half);
    this.autoScale = false;
  }
  /** Moves the content by `dy` pixels (positive = content moves down). Disables auto-scale. */
  pan(dy) {
    const lo = this.toAxis(this.lo);
    const hi = this.toAxis(this.hi);
    const delta = dy / this.innerHeight * (hi - lo);
    this.setAxisRange(lo + delta, hi + delta);
    this.autoScale = false;
  }
};
var LOG_FLOOR = 1e-12;
var NICE_MULTIPLIERS = [1, 2, 2.5, 5, 10];
function logTicks(scale, spacing, minStep = 0) {
  const ticks = [];
  for (let y = scale.height - spacing / 2; y > 0; y -= spacing) {
    const raw = scale.yToPrice(y);
    if (!(raw > 0)) continue;
    const local = scale.yToPrice(y - spacing) - raw;
    const mag = 10 ** Math.floor(Math.log10(local));
    let step = NICE_MULTIPLIERS.map((m) => m * mag).find((s) => s >= local * 0.75) ?? 10 * mag;
    if (minStep > 0) step = Math.max(minStep, Math.round(step / minStep) * minStep);
    const best = Number((Math.round(raw / step) * step).toPrecision(12));
    if (!(best > 0)) continue;
    const prev = ticks[ticks.length - 1];
    if (prev === void 0 || Math.abs(scale.priceToY(best) - scale.priceToY(prev)) >= spacing * 0.6) ticks.push(best);
  }
  return ticks;
}
function niceTicks(min, max, maxCount, minStep = 0) {
  if (!(max > min) || maxCount < 1) return [];
  const rough = (max - min) / maxCount;
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const fits = (step2) => minStep <= 0 || Math.abs(step2 / minStep - Math.round(step2 / minStep)) < 1e-6;
  let step = Number.NaN;
  for (let mag = magnitude; Number.isNaN(step); mag *= 10) {
    for (const m of NICE_MULTIPLIERS) {
      const candidate = m * mag;
      if (candidate >= rough && candidate >= minStep && fits(candidate)) {
        step = candidate;
        break;
      }
    }
  }
  if (step > rough * 1.6) {
    for (const m of [...NICE_MULTIPLIERS].reverse()) {
      const candidate = m * magnitude;
      if (candidate < step && candidate >= rough * 0.75 && candidate >= minStep && fits(candidate)) {
        step = candidate;
        break;
      }
    }
  }
  step = Number(step.toPrecision(12));
  const decimals = decimalsOf(step);
  const ticks = [];
  const first = Math.ceil(min / step - 1e-9);
  const last = Math.floor(max / step + 1e-9);
  for (let k = first; k <= last && ticks.length < 1e3; k++) {
    ticks.push(Number((k * step).toFixed(decimals)));
  }
  return ticks;
}
function browserLocale() {
  const nav = typeof navigator === "undefined" ? void 0 : navigator;
  const first = nav?.languages?.[0] ?? nav?.language ?? "";
  return /^ko\b/i.test(first) ? "ko" : "en";
}
var WEEKDAY_INDEX = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
var WEEKDAYS = {
  ko: ["\uC77C", "\uC6D4", "\uD654", "\uC218", "\uBAA9", "\uAE08", "\uD1A0"],
  en: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
};
var MONTHS_EN = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
var CACHE_LIMIT = 1e4;
var pad2 = (n) => n < 10 ? `0${n}` : String(n);
function defaultTimeZone() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
}
var TimeFormatter = class {
  constructor(timeZone, locale) {
    this.timeZone = timeZone;
    this.locale = locale;
    this.dtf = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      weekday: "short",
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      minute: "numeric",
      second: "numeric"
    });
  }
  timeZone;
  locale;
  dtf;
  cache = /* @__PURE__ */ new Map();
  parts(time) {
    const cached = this.cache.get(time);
    if (cached) return cached;
    const p = { year: 0, month: 0, day: 0, hour: 0, minute: 0, second: 0, weekday: 0 };
    for (const { type, value } of this.dtf.formatToParts(time)) {
      switch (type) {
        case "year":
          p.year = Number(value);
          break;
        case "month":
          p.month = Number(value);
          break;
        case "day":
          p.day = Number(value);
          break;
        case "hour":
          p.hour = Number(value) % 24;
          break;
        case "minute":
          p.minute = Number(value);
          break;
        case "second":
          p.second = Number(value);
          break;
        case "weekday":
          p.weekday = WEEKDAY_INDEX[value] ?? 0;
          break;
      }
    }
    if (this.cache.size >= CACHE_LIMIT) this.cache.clear();
    this.cache.set(time, p);
    return p;
  }
  /** Full label for the crosshair, e.g. "2026.11.09 (월) 14:30". */
  crosshairLabel(time, intraday) {
    const p = this.parts(time);
    const sep = this.locale === "ko" ? "." : "-";
    const date = `${p.year}${sep}${pad2(p.month)}${sep}${pad2(p.day)} (${WEEKDAYS[this.locale][p.weekday]})`;
    return intraday ? `${date} ${pad2(p.hour)}:${pad2(p.minute)}` : date;
  }
  tickLabel(p, weight) {
    const ko = this.locale === "ko";
    if (weight >= TickWeight.Year) return ko ? `${p.year}\uB144` : String(p.year);
    if (weight >= TickWeight.Month) return ko ? `${p.month}\uC6D4` : MONTHS_EN[p.month - 1];
    if (weight >= TickWeight.Day) return ko ? `${p.day}\uC77C` : String(p.day);
    return `${pad2(p.hour)}:${pad2(p.minute)}`;
  }
};
var TickWeight = {
  Year: 60,
  Month: 50,
  Day: 40,
  Hour: 30,
  Minute30: 25,
  Minute15: 22,
  Minute5: 20,
  Minute: 10,
  None: 0
};
function boundaryWeight(prev, cur) {
  if (!prev) return TickWeight.Minute;
  if (cur.year !== prev.year) return TickWeight.Year;
  if (cur.month !== prev.month) return TickWeight.Month;
  if (cur.day !== prev.day) return TickWeight.Day;
  if (cur.hour !== prev.hour) return TickWeight.Hour;
  if (cur.minute !== prev.minute) {
    if (cur.minute % 30 === 0) return TickWeight.Minute30;
    if (cur.minute % 15 === 0) return TickWeight.Minute15;
    if (cur.minute % 5 === 0) return TickWeight.Minute5;
    return TickWeight.Minute;
  }
  return TickWeight.None;
}
function computeTimeTicks(bars, timeScale, formatter, minGap) {
  const { from, to } = timeScale.visibleRange();
  if (to < from) return [];
  const candidates = [];
  let prev = from > 0 ? formatter.parts(bars[from - 1].time) : null;
  for (let i = from; i <= to; i++) {
    const parts = formatter.parts(bars[i].time);
    const weight = boundaryWeight(prev, parts);
    if (weight > TickWeight.None) candidates.push({ index: i, weight, parts });
    prev = parts;
  }
  candidates.sort((a, b) => b.weight - a.weight || a.index - b.index);
  const edge = minGap / 3;
  const picked = [];
  for (const c of candidates) {
    const x = timeScale.indexToX(c.index);
    if (x < edge || x > timeScale.width - edge) continue;
    if (picked.some((t) => Math.abs(t.x - x) < minGap)) continue;
    picked.push({ index: c.index, x, label: formatter.tickLabel(c.parts, c.weight) });
  }
  return picked.sort((a, b) => a.index - b.index);
}
var DEFAULT_TIME_SCALE_OPTIONS = {
  barSpacing: 8,
  minBarSpacing: 0.5,
  maxBarSpacing: 60,
  rightOffset: 5
};
var clamp = (v, min, max) => Math.min(max, Math.max(min, v));
var TimeScale = class {
  constructor(options = DEFAULT_TIME_SCALE_OPTIONS) {
    this.options = options;
    this.barSpacing = options.barSpacing;
    this.rightOffset = options.rightOffset;
  }
  options;
  width = 0;
  barCount = 0;
  barSpacing;
  rightOffset;
  /** Logical (fractional) bar index at the right edge. */
  get rightIndex() {
    return this.barCount - 1 + this.rightOffset;
  }
  /** Center x of bar `index`. */
  indexToX(index) {
    return this.width - (this.rightIndex - index + 0.5) * this.barSpacing;
  }
  xToIndexFloat(x) {
    return this.rightIndex - (this.width - x) / this.barSpacing + 0.5;
  }
  xToIndex(x) {
    return Math.round(this.xToIndexFloat(x));
  }
  /** Visible bar indices clamped to existing data. `to < from` when nothing is visible. */
  visibleRange() {
    if (this.barCount === 0 || this.width <= 0) return { from: 0, to: -1 };
    return {
      from: Math.max(0, Math.round(this.xToIndexFloat(0))),
      to: Math.min(this.barCount - 1, Math.round(this.xToIndexFloat(this.width)))
    };
  }
  pan(dx) {
    this.rightOffset -= dx / this.barSpacing;
    this.clamp();
  }
  /** Zooms by `factor` keeping the bar under `anchorX` fixed. */
  zoom(anchorX, factor) {
    const anchorIndex = this.xToIndexFloat(anchorX);
    this.barSpacing = clamp(this.barSpacing * factor, this.options.minBarSpacing, this.options.maxBarSpacing);
    const rightIndex = anchorIndex + (this.width - anchorX) / this.barSpacing - 0.5;
    this.rightOffset = rightIndex - (this.barCount - 1);
    this.clamp();
  }
  reset() {
    this.barSpacing = this.options.barSpacing;
    this.rightOffset = this.options.rightOffset;
    this.clamp();
  }
  fitContent() {
    if (this.barCount === 0 || this.width <= 0) return;
    this.barSpacing = clamp(
      this.width / (this.barCount + this.options.rightOffset),
      this.options.minBarSpacing,
      this.options.maxBarSpacing
    );
    this.rightOffset = this.options.rightOffset;
    this.clamp();
  }
  /** Keeps at least a couple of bars on screen. */
  clamp() {
    this.barSpacing = clamp(this.barSpacing, this.options.minBarSpacing, this.options.maxBarSpacing);
    if (this.barCount === 0 || this.width <= 0) return;
    const minBars = Math.min(this.barCount, 2);
    const minOffset = minBars - this.barCount;
    const maxOffset = Math.max(minOffset, this.width / this.barSpacing - minBars);
    this.rightOffset = clamp(this.rightOffset, minOffset, maxOffset);
  }
};
var counter = 0;
var newId = (prefix) => `${prefix}_${Date.now().toString(36)}${(counter++).toString(36)}`;
function sma(src2, period) {
  const out = new Float64Array(src2.length).fill(Number.NaN);
  if (period < 1) return out;
  let sum = 0;
  let valid = 0;
  for (let i = 0; i < src2.length; i++) {
    const v = src2[i];
    if (Number.isNaN(v)) {
      sum = 0;
      valid = 0;
      continue;
    }
    sum += v;
    valid++;
    if (valid > period) sum -= src2[i - period];
    if (valid >= period) out[i] = sum / period;
  }
  return out;
}
function ema(src2, period) {
  const out = new Float64Array(src2.length).fill(Number.NaN);
  if (period < 1) return out;
  const k = 2 / (period + 1);
  let prev = Number.NaN;
  let seedSum = 0;
  let seedCount = 0;
  for (let i = 0; i < src2.length; i++) {
    const v = src2[i];
    if (Number.isNaN(v)) continue;
    if (Number.isNaN(prev)) {
      seedSum += v;
      seedCount++;
      if (seedCount === period) out[i] = prev = seedSum / period;
      continue;
    }
    out[i] = prev = v * k + prev * (1 - k);
  }
  return out;
}
function stdev(src2, period) {
  const out = new Float64Array(src2.length).fill(Number.NaN);
  const mean = sma(src2, period);
  for (let i = period - 1; i < src2.length; i++) {
    const m = mean[i];
    if (Number.isNaN(m)) continue;
    let acc = 0;
    for (let j = i - period + 1; j <= i; j++) acc += (src2[j] - m) ** 2;
    out[i] = Math.sqrt(acc / period);
  }
  return out;
}
function bollinger(src2, period, mult) {
  const middle = sma(src2, period);
  const sd = stdev(src2, period);
  const upper = new Float64Array(src2.length);
  const lower = new Float64Array(src2.length);
  for (let i = 0; i < src2.length; i++) {
    upper[i] = middle[i] + mult * sd[i];
    lower[i] = middle[i] - mult * sd[i];
  }
  return { middle, upper, lower };
}
function rsi(src2, period) {
  const out = new Float64Array(src2.length).fill(Number.NaN);
  if (period < 1 || src2.length <= period) return out;
  let gain = 0;
  let loss = 0;
  for (let i = 1; i <= period; i++) {
    const d = src2[i] - src2[i - 1];
    if (d > 0) gain += d;
    else loss -= d;
  }
  gain /= period;
  loss /= period;
  const value = () => loss === 0 ? gain === 0 ? 50 : 100 : 100 - 100 / (1 + gain / loss);
  out[period] = value();
  for (let i = period + 1; i < src2.length; i++) {
    const d = src2[i] - src2[i - 1];
    gain = (gain * (period - 1) + Math.max(d, 0)) / period;
    loss = (loss * (period - 1) + Math.max(-d, 0)) / period;
    out[i] = value();
  }
  return out;
}
function macd(src2, fast, slow, signal) {
  const fastEma = ema(src2, fast);
  const slowEma = ema(src2, slow);
  const line2 = new Float64Array(src2.length);
  for (let i = 0; i < src2.length; i++) line2[i] = fastEma[i] - slowEma[i];
  const signalLine = ema(line2, signal);
  const histogram = new Float64Array(src2.length);
  for (let i = 0; i < src2.length; i++) histogram[i] = line2[i] - signalLine[i];
  return { macd: line2, signal: signalLine, histogram };
}
var SERIES_COLORS = ["#12B886", "#FF9F0A", "#7048E8", "#8B95A1", "#F06595", "#15AABF", "#3182F6", "#795548"];
function priceSource(bars, source = "close") {
  switch (source) {
    case "open":
      return Float64Array.from(bars, (b) => b.open);
    case "high":
      return Float64Array.from(bars, (b) => b.high);
    case "low":
      return Float64Array.from(bars, (b) => b.low);
    case "hl2":
      return Float64Array.from(bars, (b) => (b.high + b.low) / 2);
    case "hlc3":
      return Float64Array.from(bars, (b) => (b.high + b.low + b.close) / 3);
    case "ohlc4":
      return Float64Array.from(bars, (b) => (b.open + b.high + b.low + b.close) / 4);
    default:
      return Float64Array.from(bars, (b) => b.close);
  }
}
var num = (p, key) => Number(p[key]);
var src = (p) => typeof p.source === "string" ? p.source : "close";
var SOURCE_SHORT = { close: "", open: "O", high: "H", low: "L", hl2: "HL2", hlc3: "HLC3", ohlc4: "OHLC4" };
function maLines(p) {
  const raw = Array.isArray(p.lines) ? p.lines : Array.isArray(p.periods) ? p.periods.map((period) => ({ period, source: "close" })) : [];
  return raw.map((l) => ({ period: Math.round(Number(l.period)), source: l.source ?? "close" })).filter((l) => Number.isFinite(l.period) && l.period > 0);
}
var line = (key, label, values, color) => ({
  key,
  label,
  values,
  color,
  width: 1,
  visible: true,
  kind: "line"
});
function movingAverages(bars, p, prefix, fn, colors) {
  const cache = /* @__PURE__ */ new Map();
  return {
    series: maLines(p).map((l, i) => {
      let values = cache.get(l.source);
      if (!values) cache.set(l.source, values = priceSource(bars, l.source));
      const suffix = SOURCE_SHORT[l.source] ? `(${SOURCE_SHORT[l.source]})` : "";
      return line(`l${i}`, `${prefix}${l.period}${suffix}`, fn(values, l.period), colors[i % colors.length]);
    }),
    precision: null
  };
}
var PARAM = (ko, en) => ({ ko, en });
var SOURCE_PARAM = { key: "source", label: PARAM("\uAC00\uACA9 \uAE30\uC900", "Source"), kind: "source" };
var INDICATORS = {
  ma: {
    type: "ma",
    name: { ko: "\uC774\uB3D9\uD3C9\uADE0\uC120", en: "Moving Average" },
    description: { ko: "\uB2E8\uC21C \uC774\uB3D9\uD3C9\uADE0 (5\xB720\xB760\xB7120)", en: "Simple moving averages" },
    overlay: true,
    params: [{ key: "lines", label: PARAM("\uAE30\uAC04", "Period"), kind: "lines", min: 1, max: 1e3 }],
    defaults: {
      lines: [5, 20, 60, 120].map((period) => ({ period, source: "close" }))
    },
    title: (p) => `MA ${maLines(p).map((l) => l.period).join("\xB7")}`,
    compute: (bars, p) => movingAverages(bars, p, "MA", sma, SERIES_COLORS)
  },
  ema: {
    type: "ema",
    name: { ko: "\uC9C0\uC218\uC774\uB3D9\uD3C9\uADE0", en: "Exponential MA" },
    description: { ko: "\uCD5C\uADFC \uAC00\uACA9\uC5D0 \uAC00\uC911\uCE58\uB97C \uB454 \uC774\uB3D9\uD3C9\uADE0", en: "Moving average weighted to recent prices" },
    overlay: true,
    params: [{ key: "lines", label: PARAM("\uAE30\uAC04", "Period"), kind: "lines", min: 1, max: 1e3 }],
    defaults: { lines: [12, 26].map((period) => ({ period, source: "close" })) },
    title: (p) => `EMA ${maLines(p).map((l) => l.period).join("\xB7")}`,
    compute: (bars, p) => movingAverages(bars, p, "EMA", ema, ["#3182F6", "#F06595", "#15AABF", "#FF9F0A"])
  },
  bb: {
    type: "bb",
    name: { ko: "\uBCFC\uB9B0\uC800\uBC34\uB4DC", en: "Bollinger Bands" },
    description: { ko: "\uC774\uB3D9\uD3C9\uADE0 \xB1 \uD45C\uC900\uD3B8\uCC28 \uBC34\uB4DC", en: "Moving average \xB1 standard deviations" },
    overlay: true,
    params: [
      { key: "period", label: PARAM("\uAE30\uAC04", "Period"), kind: "number", min: 2, max: 500 },
      { key: "mult", label: PARAM("\uC2B9\uC218", "Multiplier"), kind: "number", min: 0.1, max: 10, step: 0.1 },
      SOURCE_PARAM
    ],
    defaults: { period: 20, mult: 2, source: "close" },
    title: (p) => `BB ${num(p, "period")} ${num(p, "mult")}`,
    compute: (bars, p) => {
      const { middle, upper, lower } = bollinger(priceSource(bars, src(p)), num(p, "period"), num(p, "mult"));
      const color = "#3182F6";
      return {
        series: [
          line("upper", "Upper", upper, color),
          line("middle", "Basis", middle, "#FF9F0A"),
          line("lower", "Lower", lower, color)
        ],
        fill: { upper: "upper", lower: "lower", color },
        precision: null
      };
    }
  },
  rsi: {
    type: "rsi",
    name: { ko: "RSI", en: "RSI" },
    description: { ko: "\uC0C1\uB300\uAC15\uB3C4\uC9C0\uC218 (\uACFC\uB9E4\uC218 70 / \uACFC\uB9E4\uB3C4 30)", en: "Relative Strength Index (70 / 30)" },
    overlay: false,
    params: [{ key: "period", label: PARAM("\uAE30\uAC04", "Period"), kind: "number", min: 2, max: 200 }, SOURCE_PARAM],
    defaults: { period: 14, source: "close" },
    title: (p) => `RSI ${num(p, "period")}`,
    compute: (bars, p) => ({
      series: [line("rsi", "RSI", rsi(priceSource(bars, src(p)), num(p, "period")), "#7048E8")],
      levels: [30, 70],
      range: [0, 100],
      precision: 2
    })
  },
  macd: {
    type: "macd",
    name: { ko: "MACD", en: "MACD" },
    description: { ko: "\uB2E8\uAE30\xB7\uC7A5\uAE30 \uC9C0\uC218\uC774\uB3D9\uD3C9\uADE0\uC758 \uCC28\uC774\uC640 \uC2DC\uADF8\uB110", en: "Fast/slow EMA spread with a signal line" },
    overlay: false,
    params: [
      { key: "fast", label: PARAM("\uB2E8\uAE30", "Fast"), kind: "number", min: 1, max: 200 },
      { key: "slow", label: PARAM("\uC7A5\uAE30", "Slow"), kind: "number", min: 1, max: 400 },
      { key: "signal", label: PARAM("\uC2DC\uADF8\uB110", "Signal"), kind: "number", min: 1, max: 200 },
      SOURCE_PARAM
    ],
    defaults: { fast: 12, slow: 26, signal: 9, source: "close" },
    title: (p) => `MACD ${num(p, "fast")} ${num(p, "slow")} ${num(p, "signal")}`,
    compute: (bars, p) => {
      const m = macd(priceSource(bars, src(p)), num(p, "fast"), num(p, "slow"), num(p, "signal"));
      return {
        series: [
          line("macd", "MACD", m.macd, "#3182F6"),
          line("signal", "Signal", m.signal, "#FF9F0A"),
          // Histograms are always painted beneath lines regardless of order here.
          { ...line("hist", "Hist", m.histogram, ""), kind: "histogram" }
        ],
        precision: null
      };
    }
  }
};
var clone = (c) => JSON.parse(JSON.stringify(c));
function indicatorRegistry(extra = []) {
  const registry = new Map(Object.entries(INDICATORS));
  for (const def of extra) registry.set(def.type, def);
  return registry;
}
var IndicatorManager = class {
  constructor(registry = indicatorRegistry()) {
    this.registry = registry;
  }
  registry;
  list = [];
  cache = /* @__PURE__ */ new Map();
  def(type) {
    const def = this.registry.get(type);
    if (!def) throw new Error(`funnest-charts: unknown indicator "${type}"`);
    return def;
  }
  normalize(c) {
    const def = this.def(c.type);
    const params = { ...def.defaults, ...c.params };
    if ((c.type === "ma" || c.type === "ema") && !Array.isArray(c.params.lines) && Array.isArray(c.params.periods)) {
      params.lines = maLines({ periods: c.params.periods });
    }
    delete params.periods;
    return { id: c.id || newId(c.type), type: c.type, params, visible: c.visible ?? true, styles: c.styles ?? {} };
  }
  add(type, params) {
    const config = this.normalize({ id: newId(type), type, params: params ?? {} });
    this.list.push(config);
    return config.id;
  }
  remove(id) {
    const before = this.list.length;
    this.list = this.list.filter((c) => c.id !== id);
    this.cache.delete(id);
    return this.list.length !== before;
  }
  update(id, patch) {
    const cfg = this.list.find((c) => c.id === id);
    if (!cfg) return false;
    if (patch.params) cfg.params = { ...cfg.params, ...patch.params };
    if (patch.styles) cfg.styles = { ...patch.styles };
    if (patch.visible !== void 0) cfg.visible = patch.visible;
    return true;
  }
  /** Unknown types (e.g. a plugin this chart wasn't given) are dropped. */
  set(configs) {
    this.list = configs.filter((c) => this.registry.has(c.type)).map((c) => this.normalize(clone(c)));
    this.cache.clear();
  }
  snapshot() {
    return this.list.map(clone);
  }
  get overlays() {
    return this.list.filter((c) => this.def(c.type).overlay);
  }
  get panes() {
    return this.list.filter((c) => !this.def(c.type).overlay);
  }
  /** Computed series with user styles applied; recomputed only when data or settings change. */
  output(cfg, bars, dataVersion) {
    const key = `${dataVersion}|${JSON.stringify(cfg.params)}|${JSON.stringify(cfg.styles)}`;
    const hit = this.cache.get(cfg.id);
    if (hit?.key === key) return hit.output;
    const raw = this.def(cfg.type).compute(bars, cfg.params);
    const output = {
      ...raw,
      series: raw.series.map((s) => {
        const style = cfg.styles?.[s.key];
        return {
          ...s,
          color: style?.color ?? s.color,
          width: style?.width ?? s.width,
          visible: style?.visible ?? s.visible
        };
      })
    };
    this.cache.set(cfg.id, { key, output });
    return output;
  }
};
var DASHES = { solid: [], dashed: [6, 4], dotted: [1.5, 3] };
var FIB_LEVELS = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1];
var FIB_COLORS = ["#8B95A1", "#F04452", "#FF9F0A", "#12B886", "#3182F6", "#7048E8", "#8B95A1"];
var HANDLE_RADIUS = 5;
function distToSegment(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / len2));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}
var p0 = (g) => g.points[0];
var p1 = (g) => g.points[1] ?? g.points[0];
var BUILTIN_DRAWINGS = [
  {
    type: "trendline",
    name: { ko: "\uCD94\uC138\uC120", en: "Trend line" },
    group: "line",
    clicks: 2,
    distance: (g, x, y) => distToSegment(x, y, ...p0(g), ...p1(g)),
    render: (_d, { painter, color, ...g }) => painter.line(...p0(g), ...p1(g), color, g.width(2), g.dash())
  },
  {
    type: "horizontal",
    name: { ko: "\uC218\uD3C9\uC120", en: "Horizontal line" },
    group: "level",
    clicks: 1,
    // The anchor's time doesn't matter; keep the handle inside the plot.
    handles: (g) => [[Math.min(g.coords.plotWidth - 24, Math.max(24, p0(g)[0])), p0(g)[1]]],
    distance: (g, _x, y) => Math.abs(y - p0(g)[1]),
    render: (d, { painter, color, coords, badge, ...g }) => {
      const y = p0(g)[1];
      const dash = g.dash();
      if (g.width(1) === 1 && !dash.length) painter.hLine(y, 0, coords.plotWidth, color);
      else painter.line(0, y, coords.plotWidth, y, color, g.width(1), dash);
      badge(y, coords.formatPrice(d.points[0].price), color);
    }
  },
  {
    type: "fibonacci",
    name: { ko: "\uD53C\uBCF4\uB098\uCE58 \uB418\uB3CC\uB9BC", en: "Fib retracement" },
    group: "fib",
    section: { ko: "\uD53C\uBCF4\uB098\uCE58", en: "Fibonacci" },
    clicks: 2,
    colors: FIB_LEVELS.map((level, i) => ({ key: String(level), name: { ko: String(level), en: String(level) }, color: FIB_COLORS[i] })),
    distance: (g, x, y) => {
      const [x1, y1] = p0(g);
      const [x2, y2] = p1(g);
      let best = distToSegment(x, y, x1, y1, x2, y2);
      if (x >= Math.min(x1, x2) && x <= Math.max(x1, x2)) {
        for (const level of FIB_LEVELS) best = Math.min(best, Math.abs(y - (y2 + (y1 - y2) * level)));
      }
      return best;
    },
    render: (d, { painter: p, coords: c, palette, ...g }) => {
      const [x1, y1] = p0(g);
      const [x2, y2] = p1(g);
      const left = Math.min(x1, x2);
      const right = Math.max(x1, x2, left + 1);
      const a = d.points[0].price;
      const b = d.points[1].price;
      const { ctx } = p;
      FIB_LEVELS.forEach((level, i) => {
        const price = b + (a - b) * level;
        const y = c.priceToY(price);
        const levelColor = d.style?.colors?.[String(level)] ?? d.color ?? FIB_COLORS[i];
        if (i > 0) {
          const prevY = c.priceToY(b + (a - b) * FIB_LEVELS[i - 1]);
          ctx.save();
          ctx.globalAlpha = 0.07;
          ctx.fillStyle = levelColor;
          ctx.fillRect(left, Math.min(y, prevY), right - left, Math.abs(y - prevY));
          ctx.restore();
        }
        p.hLine(y, left, right, levelColor);
        p.text(`${level} (${c.formatPrice(price)})`, left + 4, y - 7, levelColor, "left", "middle");
      });
      p.line(x1, y1, x2, y2, palette.textSecondary, 1, [4, 4]);
    }
  }
];
function drawingRegistry(extra = []) {
  const registry = new Map(BUILTIN_DRAWINGS.map((d) => [d.type, d]));
  for (const def of extra) registry.set(def.type, def);
  return registry;
}
var DrawingManager = class {
  constructor(onChange, registry = drawingRegistry()) {
    this.onChange = onChange;
    this.registry = registry;
  }
  onChange;
  registry;
  drawings = [];
  tool = null;
  selectedId = null;
  draft = null;
  freehandLast = null;
  drag = null;
  get selected() {
    return this.drawings.find((d) => d.id === this.selectedId) ?? null;
  }
  setTool(tool) {
    if (tool && !this.registry.has(tool)) throw new Error(`funnest-charts: unknown drawing tool "${tool}"`);
    this.tool = tool;
    this.draft = null;
    if (tool) this.selectedId = null;
    this.onChange("tool");
  }
  select(id) {
    if (id === this.selectedId) return;
    this.selectedId = id;
    this.onChange("selection");
  }
  /** Drawings of unknown types are kept (and saved) but not shown. */
  set(drawings) {
    this.drawings = drawings.map((d) => ({ ...d, points: d.points.map((p) => ({ ...p })) }));
    if (!this.selected) this.selectedId = null;
    this.onChange("commit");
  }
  update(id, patch) {
    const d = this.drawings.find((x) => x.id === id);
    if (!d) return;
    Object.assign(d, patch);
    this.onChange("commit");
  }
  remove(id) {
    const before = this.drawings.length;
    this.drawings = this.drawings.filter((d) => d.id !== id);
    if (this.selectedId === id) this.selectedId = null;
    if (this.drawings.length !== before) this.onChange("commit");
  }
  clear() {
    this.drawings = [];
    this.selectedId = null;
    this.draft = null;
    this.onChange("commit");
  }
  /** Esc: abort an in-progress drawing, else drop the tool, else deselect. */
  cancel() {
    if (this.draft || this.tool) this.setTool(null);
    else this.select(null);
  }
  // ── Creation ──────────────────────────────────────────────────────
  expand(def, placed, c) {
    const full = Array.from({ length: def.clicks }, (_, i) => ({ ...placed[i] ?? placed[placed.length - 1] }));
    return def.create ? def.create(full, c) : full;
  }
  createAt(c, x, y) {
    const def = this.tool ? this.registry.get(this.tool) : void 0;
    if (!def) return;
    const point = c.pointAt(x, y);
    if (def.freehand) {
      if (this.draft) return this.finish();
      this.draft = { drawing: { id: newId("d"), type: def.type, points: [point] }, placed: [point] };
      this.freehandLast = [x, y];
      this.onChange("preview");
      return;
    }
    if (!this.draft) {
      const placed = [point];
      this.draft = { drawing: { id: newId("d"), type: def.type, points: this.expand(def, placed, c) }, placed };
      if (def.clicks <= 1) this.finish();
      else this.onChange("preview");
      return;
    }
    this.draft.placed.push(point);
    this.draft.drawing.points = this.expand(def, this.draft.placed, c);
    if (this.draft.placed.length >= def.clicks) this.finish();
  }
  /** Moves the not-yet-placed points (live preview while hovering or dragging). */
  previewAt(c, x, y) {
    const draft = this.draft;
    const def = draft && this.registry.get(draft.drawing.type);
    if (!draft || !def) return;
    if (def.freehand) {
      const last = this.freehandLast;
      if (last && Math.hypot(x - last[0], y - last[1]) < 3) return;
      if (draft.drawing.points.length >= 4e3) return;
      this.freehandLast = [x, y];
      draft.drawing.points.push(c.pointAt(x, y));
      this.onChange("preview");
      return;
    }
    draft.drawing.points = this.expand(def, [...draft.placed, c.pointAt(x, y)], c);
    this.onChange("preview");
  }
  /** Pointer released: a drag since the first point places the next one (drag-to-draw). */
  releaseAt(c, x, y, moved) {
    const def = this.draft && this.registry.get(this.draft.drawing.type);
    if (def?.freehand) {
      if (moved && this.draft.drawing.points.length > 1) this.finish();
      return;
    }
    if (this.draft && moved) this.createAt(c, x, y);
  }
  finish() {
    const drawing = this.draft.drawing;
    this.draft = null;
    this.drawings.push(drawing);
    this.selectedId = drawing.id;
    this.tool = null;
    this.onChange("tool");
    this.onChange("commit");
  }
  // ── Editing ───────────────────────────────────────────────────────
  geometry(c, d) {
    return { coords: c, points: d.points.map((p) => [c.timeToX(p.time), c.priceToY(p.price)]) };
  }
  handles(c, d) {
    const def = this.registry.get(d.type);
    const g = this.geometry(c, d);
    return def?.handles ? def.handles(g) : def?.freehand ? [] : g.points;
  }
  hitTest(c, x, y, tolerance) {
    const selected = this.selected;
    if (selected && this.registry.has(selected.type)) {
      const handle = this.handles(c, selected).findIndex(([px, py]) => Math.hypot(px - x, py - y) <= HANDLE_RADIUS + tolerance);
      if (handle >= 0) return { kind: "drawing", id: selected.id, part: handle };
    }
    for (let i = this.drawings.length - 1; i >= 0; i--) {
      const d = this.drawings[i];
      const def = this.registry.get(d.type);
      if (def && def.distance(this.geometry(c, d), x, y) <= tolerance) return { kind: "drawing", id: d.id, part: "body" };
    }
    return null;
  }
  beginDrag(c, id, part, x, y) {
    const d = this.drawings.find((x2) => x2.id === id);
    if (!d) return;
    this.select(id);
    if (d.style?.locked) return;
    this.drag = { id, part, x, y, origin: this.geometry(c, d).points };
  }
  dragTo(c, x, y) {
    const drag = this.drag;
    const d = drag && this.drawings.find((x2) => x2.id === drag.id);
    if (!drag || !d) return;
    if (typeof drag.part === "number") {
      d.points[drag.part] = c.pointAt(x, y);
      const def = this.registry.get(d.type);
      if (def?.constrain) d.points = def.constrain(d.points, drag.part);
    } else {
      const dx = x - drag.x;
      const dy = y - drag.y;
      d.points = drag.origin.map(([ox, oy]) => c.pointAt(ox + dx, oy + dy));
    }
    this.onChange("preview");
  }
  endDrag(moved) {
    if (this.drag && moved) this.onChange("commit");
    this.drag = null;
  }
  // ── Rendering ─────────────────────────────────────────────────────
  render(rc, badges, bars = [], barIndexAt = () => -1) {
    const all = this.draft ? [...this.drawings, this.draft.drawing] : this.drawings;
    const c = rc.coords;
    for (const d of all) {
      const def = this.registry.get(d.type);
      if (!def) continue;
      const color = d.color ?? rc.palette.accent;
      const style = d.style ?? {};
      rc.painter.ctx.save();
      try {
        def.render(d, {
          ...this.geometry(c, d),
          painter: rc.painter,
          palette: rc.palette,
          color,
          style,
          colorOf: (key) => style.colors?.[key] ?? d.color ?? def.colors?.find((c2) => c2.key === key)?.color ?? color,
          width: (fallback) => Math.min(8, Math.max(0.5, style.width ?? fallback)),
          dash: (fallback = []) => style.dash ? DASHES[style.dash] : [...fallback],
          bars,
          barIndexAt,
          badge: (y, text, bg, fg = "#FFFFFF") => badges.push({ y, text, bg, fg })
        });
      } finally {
        rc.painter.ctx.restore();
      }
      if (d.id === this.selectedId && !style.locked || d === this.draft?.drawing) {
        for (const [px, py] of this.handles(c, d)) rc.painter.circle(px, py, HANDLE_RADIUS, rc.palette.background, color);
      }
    }
  }
};
var Painter = class {
  constructor(ctx, dpr) {
    this.ctx = ctx;
    this.dpr = dpr;
  }
  ctx;
  dpr;
  /** Thickness of a "1px" hairline: one whole device pixel (or more on high-DPR screens). */
  get hairline() {
    return Math.max(1, Math.floor(this.dpr)) / this.dpr;
  }
  snap(v) {
    return Math.floor(v * this.dpr) / this.dpr;
  }
  hLine(y, x1, x2, color, dash) {
    const { ctx } = this;
    const y0 = this.snap(y);
    const t = this.hairline;
    ctx.fillStyle = color;
    if (!dash) {
      ctx.fillRect(x1, y0, x2 - x1, t);
      return;
    }
    const [on, off] = dash;
    for (let x = x1; x < x2; x += on + off) ctx.fillRect(this.snap(x), y0, Math.min(on, x2 - x), t);
  }
  vLine(x, y1, y2, color, dash) {
    const { ctx } = this;
    const x0 = this.snap(x);
    const t = this.hairline;
    ctx.fillStyle = color;
    if (!dash) {
      ctx.fillRect(x0, y1, t, y2 - y1);
      return;
    }
    const [on, off] = dash;
    for (let y = y1; y < y2; y += on + off) ctx.fillRect(x0, this.snap(y), t, Math.min(on, y2 - y));
  }
  text(str, x, y, color, align = "left", baseline = "middle") {
    const { ctx } = this;
    ctx.fillStyle = color;
    ctx.textAlign = align;
    ctx.textBaseline = baseline;
    ctx.fillText(str, x, y);
  }
  roundRect(x, y, w, h, r, color) {
    const { ctx } = this;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.roundRect(this.snap(x), this.snap(y), this.snap(w), this.snap(h), r);
    ctx.fill();
  }
  measure(str) {
    return this.ctx.measureText(str).width;
  }
  /** Anti-aliased line for arbitrary angles (trendlines). */
  line(x1, y1, x2, y2, color, width = 1, dash) {
    const { ctx } = this;
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.lineCap = "round";
    if (dash) ctx.setLineDash(dash);
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
    ctx.restore();
  }
  circle(x, y, r, fill, stroke, strokeWidth = 1.5) {
    const { ctx } = this;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = fill;
    ctx.fill();
    if (stroke) {
      ctx.strokeStyle = stroke;
      ctx.lineWidth = strokeWidth;
      ctx.stroke();
    }
  }
  /**
   * A row of joined label segments ("pill") centered vertically on `y`.
   * Returns each segment's rect for hit testing (e.g. an order's cancel button).
   */
  /** Width `pill` will take for these segments. */
  pillWidth(segments) {
    return segments.reduce((w, seg) => w + Math.ceil(this.measure(seg.text)) + (seg.padding ?? 8) * 2, 0);
  }
  pill(segments, x, y, height = 20, radius = 4) {
    const { ctx } = this;
    const rects = [];
    let cx = x;
    const top = y - height / 2;
    ctx.textBaseline = "middle";
    ctx.textAlign = "left";
    segments.forEach((seg, i) => {
      const w = Math.ceil(this.measure(seg.text)) + (seg.padding ?? 8) * 2;
      const r = [i === 0 ? radius : 0, i === segments.length - 1 ? radius : 0];
      ctx.fillStyle = seg.bg;
      ctx.beginPath();
      ctx.roundRect(cx, top, w, height, [r[0], r[1], r[1], r[0]]);
      ctx.fill();
      ctx.fillStyle = seg.fg;
      ctx.fillText(seg.text, cx + (seg.padding ?? 8), y);
      rects.push({ x: cx, y: top, w, h: height });
      cx += w;
    });
    return rects;
  }
};
var inRect = (r, x, y, pad = 0) => x >= r.x - pad && x <= r.x + r.w + pad && y >= r.y - pad && y <= r.y + r.h + pad;
var DEFAULT_TRADING_LABEL_OPTIONS = {
  side: true,
  price: false,
  quantity: true,
  pnl: true,
  buttons: true,
  align: "left",
  fullWidth: true
};
var LABEL_X = 12;
var LABEL_HEIGHT = 20;
var LABEL_GAP = 6;
var ORDER_DASH = [6, 4];
var ALERT_DASH = [2, 3];
var TradingLayer = class {
  constructor(onChange) {
    this.onChange = onChange;
  }
  onChange;
  positions = /* @__PURE__ */ new Map();
  /** Order lines and alert lines (same dragging and × behavior). */
  orders = /* @__PURE__ */ new Map();
  executions = [];
  labelRects = /* @__PURE__ */ new Map();
  drag = null;
  groups = [];
  labelOptions = { ...DEFAULT_TRADING_LABEL_OPTIONS };
  get labelSettings() {
    return { ...this.labelOptions };
  }
  setLabelOptions(patch) {
    this.labelOptions = { ...this.labelOptions, ...patch };
    this.onChange();
  }
  addPosition(options) {
    const id = newId("pos");
    this.positions.set(id, { ...options });
    this.onChange();
    return this.handle(id, this.positions);
  }
  addOrder(options) {
    const id = newId("ord");
    this.orders.set(id, { ...options });
    this.onChange();
    return this.handle(id, this.orders);
  }
  addAlert(options) {
    const id = newId("alert");
    this.orders.set(id, { ...options, quantity: 0, side: "buy", alert: true });
    this.onChange();
    return this.handle(id, this.orders);
  }
  setExecutions(markers) {
    this.executions = markers.slice();
    this.onChange();
  }
  handle(id, map) {
    return {
      id,
      update: (patch) => {
        const current = map.get(id);
        if (!current) return;
        map.set(id, { ...current, ...patch });
        this.onChange();
      },
      remove: () => {
        if (map.delete(id)) this.onChange();
      }
    };
  }
  get executionList() {
    return this.executions;
  }
  executionGroup(key) {
    return this.groups.find((g) => g.key === key);
  }
  // ── Interaction ───────────────────────────────────────────────────
  hitTest(priceToY, x, y, tolerance) {
    for (const g of this.groups) {
      if (Math.abs(g.x - x) <= 6 + tolerance / 2 && Math.abs(g.y - y) <= 6 + tolerance / 2) return { kind: "execution", key: g.key };
    }
    for (const [id, order] of this.orders) {
      const rects = this.labelRects.get(id);
      if (rects?.cancel && inRect(rects.cancel, x, y, tolerance / 2)) return { kind: "order", id, part: "cancel" };
      if (!order.onMove) continue;
      const lineY = priceToY(this.drag?.id === id ? this.drag.price : order.price);
      if (rects && inRect(rects.label, x, y, tolerance / 2) || Math.abs(y - lineY) <= tolerance) {
        return { kind: "order", id, part: "line" };
      }
    }
    return null;
  }
  beginDrag(id) {
    const order = this.orders.get(id);
    if (order?.onMove) this.drag = { id, price: order.price };
  }
  dragTo(price) {
    if (!this.drag) return;
    this.drag.price = price;
    this.onChange();
  }
  endDrag() {
    const drag = this.drag;
    this.drag = null;
    const order = drag && this.orders.get(drag.id);
    if (!drag || !order || drag.price === order.price) {
      this.onChange();
      return;
    }
    const previous = order.price;
    order.price = drag.price;
    this.onChange();
    const revert = () => {
      const current = this.orders.get(drag.id);
      if (current && current.price === drag.price) {
        current.price = previous;
        this.onChange();
      }
    };
    try {
      Promise.resolve(order.onMove?.(drag.price)).then((ok) => ok === false && revert(), revert);
    } catch {
      revert();
    }
  }
  cancel(id) {
    this.orders.get(id)?.onCancel?.();
  }
  // ── Rendering ─────────────────────────────────────────────────────
  render({ painter: p, coords: c, palette }, bars, barIndexAt, indexToX, labels, badges) {
    this.labelRects.clear();
    const last = bars[bars.length - 1];
    const visible = (y) => y >= 0 && y <= c.height;
    const byKey = /* @__PURE__ */ new Map();
    for (const e of this.executions) {
      const index = barIndexAt(e.time);
      const bar = bars[index];
      if (!bar) continue;
      const liquidation = e.kind === "liquidation";
      const key = `${bar.time}:${liquidation ? "liq" : e.side}`;
      let g = byKey.get(key);
      if (!g) {
        const buy = e.side === "buy";
        g = {
          key,
          side: e.side,
          kind: liquidation ? "liquidation" : "fill",
          count: 0,
          quantity: 0,
          averagePrice: 0,
          time: e.time,
          x: indexToX(index),
          y: liquidation ? c.priceToY(e.price) : buy ? c.priceToY(bar.low) + 10 : c.priceToY(bar.high) - 10,
          weighted: 0,
          weight: 0
        };
        byKey.set(key, g);
      }
      const q = e.quantity ?? 1;
      g.count++;
      g.quantity += e.quantity ?? 0;
      g.weighted += e.price * q;
      g.weight += q;
      g.time = Math.min(g.time, e.time);
    }
    this.groups = [...byKey.values()].map(({ weighted, weight, ...g }) => ({ ...g, averagePrice: weighted / weight }));
    const { ctx } = p;
    for (const g of this.groups) {
      if (g.x < -10 || g.x > c.plotWidth + 10) continue;
      if (g.kind === "liquidation") {
        ctx.beginPath();
        ctx.arc(g.x, g.y, 8, 0, Math.PI * 2);
        ctx.fillStyle = palette.down;
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(g.x + 1.5, g.y - 5.5);
        ctx.lineTo(g.x - 3.5, g.y + 1);
        ctx.lineTo(g.x - 0.2, g.y + 1);
        ctx.lineTo(g.x - 1.5, g.y + 5.5);
        ctx.lineTo(g.x + 3.5, g.y - 1);
        ctx.lineTo(g.x + 0.2, g.y - 1);
        ctx.closePath();
        ctx.fillStyle = "#FFFFFF";
        ctx.fill();
        continue;
      }
      const buy = g.side === "buy";
      ctx.beginPath();
      ctx.moveTo(g.x, buy ? g.y - 5 : g.y + 5);
      ctx.lineTo(g.x - 5, buy ? g.y + 4 : g.y - 4);
      ctx.lineTo(g.x + 5, buy ? g.y + 4 : g.y - 4);
      ctx.closePath();
      ctx.fillStyle = buy ? palette.up : palette.down;
      ctx.fill();
      if (g.count > 1) p.text(String(g.count), g.x + 7, g.y, buy ? palette.up : palette.down, "left", "middle");
    }
    const opts = this.labelOptions;
    const placed = [];
    const placeX = (width, y) => {
      const toLeft = opts.align === "right";
      let x = opts.align === "left" ? LABEL_X : toLeft ? c.plotWidth - width - LABEL_X : (c.plotWidth - width) / 2;
      for (let moved = true; moved; ) {
        moved = false;
        for (const r of placed) {
          const overlapsY = Math.abs(r.y + LABEL_HEIGHT / 2 - y) < LABEL_HEIGHT + 2;
          if (overlapsY && x < r.x + r.w + LABEL_GAP && x + width > r.x - LABEL_GAP) {
            x = toLeft ? r.x - width - LABEL_GAP : r.x + r.w + LABEL_GAP;
            moved = true;
          }
        }
      }
      placed.push({ x, y: y - LABEL_HEIGHT / 2, w: width, h: LABEL_HEIGHT });
      return x;
    };
    const drawLine = (y, color, segments, dash) => {
      if (segments.length === 0) {
        p.hLine(y, 0, c.plotWidth, color, dash);
        return null;
      }
      const x = placeX(p.pillWidth(segments), y);
      const from = opts.fullWidth ? 0 : Math.min(x + p.pillWidth(segments), c.plotWidth);
      p.hLine(y, from, c.plotWidth, color, dash);
      return p.pill(segments, x, y, LABEL_HEIGHT);
    };
    for (const pos of this.positions.values()) {
      const y = c.priceToY(pos.price);
      badges.push({ y, text: c.formatPrice(pos.price), bg: palette.text, fg: palette.background });
      if (!visible(y)) continue;
      const main = [opts.side ? pos.label ?? labels.position : "", opts.price ? c.formatPrice(pos.price) : "", opts.quantity ? String(pos.quantity) : ""].filter(Boolean).join(" \xB7 ");
      const segments = main ? [{ text: main, bg: palette.text, fg: palette.background }] : [];
      if (last && opts.pnl) {
        const pnl = (last.close - pos.price) * pos.quantity * (pos.side === "long" ? 1 : -1);
        const pct = pos.price ? (last.close - pos.price) / pos.price * 100 * (pos.side === "long" ? 1 : -1) : 0;
        const sign = pnl > 0 ? "+" : "";
        segments.push({
          text: `${sign}${c.formatPrice(pnl)} (${sign}${pct.toFixed(2)}%)`,
          bg: pnl >= 0 ? palette.up : palette.down,
          fg: "#FFFFFF"
        });
      }
      drawLine(y, palette.text, segments);
    }
    for (const [id, order] of this.orders) {
      const price = this.drag?.id === id ? this.drag.price : order.price;
      const y = c.priceToY(price);
      const color = order.alert ? palette.textSecondary : order.side === "buy" ? palette.up : palette.down;
      badges.push({ y, text: c.formatPrice(price), bg: color, fg: "#FFFFFF" });
      if (!visible(y)) continue;
      const main = (order.alert ? [order.label ?? labels.alert, opts.price ? c.formatPrice(price) : ""] : [opts.side ? order.side === "buy" ? labels.buy : labels.sell : "", order.label, opts.price ? c.formatPrice(price) : "", opts.quantity ? String(order.quantity) : ""]).filter(Boolean).join(" ");
      const cancellable = !!order.onCancel && opts.buttons;
      const segments = [{ text: main || c.formatPrice(price), bg: color, fg: "#FFFFFF" }];
      if (cancellable) segments.push({ text: "\xD7", bg: color, fg: "#FFFFFF", padding: 7 });
      const rects = drawLine(y, color, segments, order.alert ? ALERT_DASH : ORDER_DASH);
      if (cancellable && rects[1]) p.vLine(rects[1].x, y - 6, y + 6, "rgba(255,255,255,0.4)");
      this.labelRects.set(id, {
        label: { x: rects[0].x, y: rects[0].y, w: rects.reduce((w, r) => w + r.w, 0), h: LABEL_HEIGHT },
        cancel: cancellable ? rects[1] : null
      });
    }
  }
};
function snapToOhlc(bar, y, priceToY) {
  let best = bar.close;
  let bestDistance = Infinity;
  for (const price of [bar.open, bar.high, bar.low, bar.close]) {
    const d = Math.abs(priceToY(price) - y);
    if (d < bestDistance) {
      bestDistance = d;
      best = price;
    }
  }
  return best;
}
var FOLLOW = { upColor: null, downColor: null, background: null, gridColor: null, textColor: null };
var CHART_THEMES = [
  { id: "default", name: { ko: "\uAE30\uBCF8", en: "Default" }, colors: FOLLOW },
  { id: "global", name: { ko: "\uCD08\uB85D\xB7\uBE68\uAC15", en: "Green \xB7 Red" }, colors: { ...FOLLOW, upColor: "#26A69A", downColor: "#EF5350" } },
  {
    id: "midnight",
    name: { ko: "\uBBF8\uB4DC\uB098\uC787", en: "Midnight" },
    colors: { upColor: "#2EBD85", downColor: "#F6465D", background: "#0E1117", gridColor: "#1A1F29", textColor: "#C9D1D9" }
  },
  {
    id: "navy",
    name: { ko: "\uB525 \uB124\uC774\uBE44", en: "Deep navy" },
    colors: { upColor: "#FF5A5F", downColor: "#4C8DFF", background: "#0F1A2E", gridColor: "#1B2A44", textColor: "#C8D3E6" }
  },
  {
    id: "mono",
    name: { ko: "\uBAA8\uB178", en: "Mono" },
    colors: { upColor: "#E4E4E7", downColor: "#6B6B75", background: "#121214", gridColor: "#1F1F23", textColor: "#D4D4D8" }
  },
  {
    id: "paper",
    name: { ko: "\uD398\uC774\uD37C", en: "Paper" },
    colors: { upColor: "#F04452", downColor: "#3182F6", background: "#FFFFFF", gridColor: "#F0F2F5", textColor: "#333D4B" }
  },
  {
    id: "sepia",
    name: { ko: "\uC138\uD53C\uC544", en: "Sepia" },
    colors: { upColor: "#C2410C", downColor: "#2F6690", background: "#F6F0E4", gridColor: "#E9DFCB", textColor: "#4A3F33" }
  }
];
var DEFAULT_CHART_SETTINGS = {
  highLowMarkers: true,
  lastPriceLine: true,
  gridHorizontal: true,
  gridVertical: true,
  volume: true,
  navigationButtons: true,
  priceScale: "normal",
  countdown: true,
  upColor: null,
  downColor: null,
  background: null,
  gridColor: null,
  textColor: null
};
var CHART_TYPES = ["candles", "line", "area"];
function parseChartState(input) {
  const s = input;
  if (!s || typeof s !== "object" || s.version !== 1) throw new Error("funnest-charts: unsupported chart state (expected version 1)");
  return {
    version: 1,
    symbol: typeof s.symbol === "string" ? s.symbol : null,
    resolution: typeof s.resolution === "string" ? s.resolution : null,
    chartType: CHART_TYPES.includes(s.chartType) ? s.chartType : "candles",
    settings: { ...DEFAULT_CHART_SETTINGS, ...s.settings ?? {} },
    indicators: Array.isArray(s.indicators) ? s.indicators : [],
    drawings: s.drawings && typeof s.drawings === "object" ? s.drawings : {},
    paneWeights: s.paneWeights && typeof s.paneWeights === "object" ? Object.fromEntries(Object.entries(s.paneWeights).filter(([, w]) => typeof w === "number" && w > 0)) : {},
    compares: Array.isArray(s.compares) ? s.compares.filter((x) => typeof x === "string") : [],
    view: {
      barSpacing: Number(s.view?.barSpacing) || 8,
      rightOffset: Number.isFinite(Number(s.view?.rightOffset)) ? Number(s.view?.rightOffset) : 5
    }
  };
}
var executionKey = (e) => e.id ?? `${e.time}|${e.side}|${e.price}|${e.quantity ?? ""}`;
var TradingSync = class {
  constructor(layer, onError) {
    this.layer = layer;
    this.onError = onError;
  }
  layer;
  onError;
  adapter = null;
  token = 0;
  symbol = null;
  unsubscribe = null;
  positions = [];
  orders = /* @__PURE__ */ new Map();
  executions = /* @__PURE__ */ new Map();
  loadedFrom = Infinity;
  /** (Re)loads everything for a symbol whose bars start at `from`. */
  async load(symbol, from) {
    const token = ++this.token;
    this.reset();
    this.symbol = symbol;
    const a = this.adapter;
    if (!a) return;
    try {
      const [positions, orders, executions] = await Promise.all([
        a.getPositions ? a.getPositions(symbol) : Promise.resolve([]),
        a.getOrders ? a.getOrders(symbol) : Promise.resolve([]),
        a.getExecutions ? a.getExecutions(symbol, { from, to: Date.now() }) : Promise.resolve([])
      ]);
      if (token !== this.token) return;
      this.loadedFrom = from;
      this.setPositions(positions);
      this.setOrders(orders);
      this.addExecutions(executions);
      this.unsubscribe = a.subscribe?.(symbol, {
        onExecution: (e) => token === this.token && this.addExecutions([e]),
        onPositions: (p) => token === this.token && this.setPositions(p),
        onOrders: (o) => token === this.token && this.setOrders(o)
      }) ?? null;
    } catch (error) {
      if (token === this.token) this.onError(error);
    }
  }
  /** Fetches fills for newly loaded older history (bars now start at `from`). */
  async loadOlder(from) {
    const a = this.adapter;
    const symbol = this.symbol;
    if (!a?.getExecutions || !symbol || from >= this.loadedFrom) return;
    const token = this.token;
    const to = this.loadedFrom - 1;
    this.loadedFrom = from;
    try {
      const older = await a.getExecutions(symbol, { from, to });
      if (token === this.token) this.addExecutions(older);
    } catch (error) {
      this.onError(error);
    }
  }
  reset() {
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.positions.forEach((h) => h.remove());
    this.positions = [];
    this.orders.forEach(({ handle }) => handle.remove());
    this.orders.clear();
    this.executions.clear();
    this.loadedFrom = Infinity;
    this.layer.setExecutions([]);
  }
  /** Drops the adapter's lines and stops updates (e.g. adapter removed, chart destroyed). */
  detach() {
    this.token++;
    this.reset();
  }
  setPositions(list) {
    this.positions.forEach((h) => h.remove());
    this.positions = list.map((p) => this.layer.addPosition({ ...p }));
  }
  setOrders(list) {
    const seen = /* @__PURE__ */ new Set();
    for (const info of list) {
      seen.add(info.id);
      const existing = this.orders.get(info.id);
      if (existing) {
        existing.info = info;
        existing.handle.update({ price: info.price, quantity: info.quantity, side: info.side, ...info.label ? { label: info.label } : {} });
      } else {
        const entry = { info, handle: this.layer.addOrder(this.orderOptions(info)) };
        this.orders.set(info.id, entry);
      }
    }
    for (const [id, { handle }] of this.orders) {
      if (seen.has(id)) continue;
      handle.remove();
      this.orders.delete(id);
    }
  }
  orderOptions(info) {
    const a = this.adapter;
    const opts = { price: info.price, quantity: info.quantity, side: info.side };
    if (info.label) opts.label = info.label;
    const current = () => this.orders.get(info.id)?.info ?? info;
    if (a.modifyOrder) {
      opts.onMove = async (price) => {
        const ok = await a.modifyOrder(current(), price);
        const entry = this.orders.get(info.id);
        if (ok !== false && entry) entry.info = { ...entry.info, price };
        return ok;
      };
    }
    if (a.cancelOrder) {
      opts.onCancel = () => {
        Promise.resolve(a.cancelOrder(current())).then(() => {
          if (a.subscribe) return;
          this.orders.get(info.id)?.handle.remove();
          this.orders.delete(info.id);
        }).catch(this.onError);
      };
    }
    return opts;
  }
  addExecutions(list) {
    if (list.length === 0) return;
    for (const e of list) this.executions.set(executionKey(e), e);
    this.layer.setExecutions([...this.executions.values()]);
  }
};
var CanvasLayer = class {
  canvas;
  ctx;
  width = 0;
  height = 0;
  dpr = 1;
  constructor(parent) {
    this.canvas = document.createElement("canvas");
    Object.assign(this.canvas.style, { position: "absolute", left: "0", top: "0", display: "block" });
    parent.appendChild(this.canvas);
    const ctx = this.canvas.getContext("2d");
    if (!ctx) throw new Error("funnest-charts: Canvas 2D is not supported");
    this.ctx = ctx;
  }
  resize(width, height, dpr) {
    this.width = width;
    this.height = height;
    this.dpr = dpr;
    this.canvas.width = Math.max(1, Math.round(width * dpr));
    this.canvas.height = Math.max(1, Math.round(height * dpr));
    this.canvas.style.width = `${width}px`;
    this.canvas.style.height = `${height}px`;
  }
  /** Resets the transform to CSS pixels and clears. */
  begin() {
    const { ctx } = this;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.width, this.height);
    return ctx;
  }
  destroy() {
    this.canvas.remove();
  }
};
var ColorResolver = class {
  constructor(probe) {
    this.probe = probe;
  }
  probe;
  cache = /* @__PURE__ */ new Map();
  color(value) {
    if (!value.includes("var(")) return value;
    return this.lookup(`c:${value}`, () => {
      this.probe.style.color = "";
      this.probe.style.color = value;
      return getComputedStyle(this.probe).color;
    });
  }
  fontFamily(value) {
    if (!value.includes("var(")) return value;
    return this.lookup(`f:${value}`, () => {
      this.probe.style.fontFamily = "";
      this.probe.style.fontFamily = value;
      return getComputedStyle(this.probe).fontFamily;
    });
  }
  clear() {
    this.cache.clear();
  }
  lookup(key, compute) {
    let v = this.cache.get(key);
    if (v === void 0) {
      v = compute();
      this.cache.set(key, v);
    }
    return v;
  }
};
var VOLUME_ALPHA = 0.35;
var BADGE_HEIGHT = 20;
var DASH = [4, 4];
var DOT = [2, 3];
function barGeometry(barSpacing, dpr) {
  const spacing = barSpacing * dpr;
  const wick = Math.max(1, Math.floor(dpr));
  let body = Math.floor(spacing * 0.72);
  if (spacing >= 3) body = Math.min(body, Math.floor(spacing) - 1);
  body = Math.max(wick, body);
  if ((body - wick) % 2 !== 0) body -= 1;
  return { wick, body };
}
function drawCandles(ctx, dpr, m, pane) {
  const { bars, timeScale, frame } = m;
  const { from, to } = frame.range;
  const { wick, body } = barGeometry(timeScale.barSpacing, dpr);
  const half = wick >> 1;
  const inset = (body - wick) / 2;
  const s = pane.scale;
  const y = (price) => Math.round((pane.top + s.priceToY(price)) * dpr);
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  for (const up of [true, false]) {
    ctx.beginPath();
    for (let i = from; i <= to; i++) {
      const bar = bars[i];
      if (bar.close >= bar.open !== up) continue;
      const left = Math.round(timeScale.indexToX(i) * dpr) - half;
      const yHigh = y(bar.high);
      const yLow = y(bar.low);
      ctx.rect(left, yHigh, wick, Math.max(1, yLow - yHigh));
      if (body > wick) {
        const yOpen = y(bar.open);
        const yClose = y(bar.close);
        const top = Math.min(yOpen, yClose);
        ctx.rect(left - inset, top, body, Math.max(1, Math.max(yOpen, yClose) - top));
      }
    }
    ctx.fillStyle = up ? frame.palette.up : frame.palette.down;
    ctx.fill();
  }
  ctx.restore();
}
function drawLineSeries(ctx, m, pane, area) {
  const { bars, timeScale, frame } = m;
  const from = Math.max(0, frame.range.from - 1);
  const to = Math.min(bars.length - 1, frame.range.to + 1);
  if (to < from) return;
  const color = frame.palette.accent;
  ctx.save();
  ctx.beginPath();
  for (let i = from; i <= to; i++) {
    const x = timeScale.indexToX(i);
    const y = pane.top + pane.scale.priceToY(bars[i].close);
    if (i === from) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.lineJoin = "round";
  ctx.lineWidth = 2;
  ctx.strokeStyle = color;
  ctx.stroke();
  if (area) {
    const bottom = pane.top + pane.height;
    ctx.lineTo(timeScale.indexToX(to), bottom);
    ctx.lineTo(timeScale.indexToX(from), bottom);
    ctx.closePath();
    const gradient = ctx.createLinearGradient(0, pane.top, 0, bottom);
    gradient.addColorStop(0, color);
    gradient.addColorStop(1, "transparent");
    ctx.globalAlpha = 0.18;
    ctx.fillStyle = gradient;
    ctx.fill();
  }
  ctx.restore();
}
function drawIndicator(ctx, p, m, pane, output) {
  const { timeScale, frame } = m;
  const pal = frame.palette;
  const n = m.bars.length;
  if (frame.range.to < frame.range.from) return;
  const span = (shift) => {
    const lastX = Math.ceil(timeScale.xToIndexFloat(frame.plotWidth)) + 1;
    return [Math.max(0, frame.range.from - 1 - shift), Math.min(n - 1, (shift > 0 ? lastX : frame.range.to + 1) - shift)];
  };
  const [from, to] = span(0);
  const yOf = (v) => pane.top + pane.scale.priceToY(v);
  const byKey = (key) => output.series.find((s) => s.key === key);
  for (const level of output.levels ?? []) p.hLine(yOf(level), 0, frame.plotWidth, pal.textSecondary, [3, 4]);
  if (output.fill) {
    const upperSeries = byKey(output.fill.upper);
    const lower = byKey(output.fill.lower)?.values;
    if (upperSeries && lower) {
      const upper = upperSeries.values;
      const shift = upperSeries.shift ?? 0;
      const [f0, f1] = span(shift);
      const { color, downColor } = output.fill;
      const sideOf = (j) => downColor && lower[j] > upper[j] ? 1 : 0;
      const valid = (j) => !Number.isNaN(upper[j]) && !Number.isNaN(lower[j]);
      ctx.save();
      ctx.globalAlpha = 0.07;
      let i = f0;
      while (i <= f1) {
        while (i <= f1 && !valid(i)) i++;
        const start = i;
        const side = valid(i) ? sideOf(i) : 0;
        while (i <= f1 && valid(i) && sideOf(i) === side) i++;
        const end = i <= f1 && valid(i) ? i + 1 : i;
        if (end - start < 2) continue;
        ctx.fillStyle = side ? downColor : color;
        ctx.beginPath();
        for (let j = start; j < end; j++) ctx.lineTo(timeScale.indexToX(j + shift), yOf(upper[j]));
        for (let j = end - 1; j >= start; j--) ctx.lineTo(timeScale.indexToX(j + shift), yOf(lower[j]));
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();
    }
  }
  for (const series of output.series) {
    if (series.kind !== "histogram") continue;
    const { wick, body } = barGeometry(timeScale.barSpacing, layerDpr(ctx));
    const dpr = layerDpr(ctx);
    const zero = Math.round(yOf(0) * dpr);
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 0.6;
    for (const positive of [true, false]) {
      ctx.beginPath();
      for (let i = from; i <= to; i++) {
        const v = series.values[i];
        if (Number.isNaN(v) || v >= 0 !== positive) continue;
        const left = Math.round(timeScale.indexToX(i) * dpr) - (wick >> 1) - (body - wick) / 2;
        const y = Math.round(yOf(v) * dpr);
        ctx.rect(left, Math.min(y, zero), body, Math.max(1, Math.abs(zero - y)));
      }
      ctx.fillStyle = positive ? pal.up : pal.down;
      ctx.fill();
    }
    ctx.restore();
  }
  ctx.save();
  ctx.lineJoin = "round";
  for (const series of output.series) {
    if (series.kind !== "line") continue;
    ctx.lineWidth = series.width;
    ctx.beginPath();
    let pen = false;
    const shift = series.shift ?? 0;
    const [s0, s1] = span(shift);
    for (let i = s0; i <= s1; i++) {
      const v = series.values[i];
      if (Number.isNaN(v)) {
        pen = false;
        continue;
      }
      const x = timeScale.indexToX(i + shift);
      if (pen) ctx.lineTo(x, yOf(v));
      else ctx.moveTo(x, yOf(v));
      pen = true;
    }
    ctx.strokeStyle = series.color;
    ctx.stroke();
  }
  ctx.restore();
}
var layerDpr = (ctx) => ctx.getTransform().a || 1;
function drawVolume(ctx, dpr, m, pane) {
  const { bars, timeScale, frame } = m;
  const { from, to } = frame.range;
  const { wick, body } = barGeometry(timeScale.barSpacing, dpr);
  const half = wick >> 1;
  const inset = (body - wick) / 2;
  const bottom = Math.round((pane.top + pane.height) * dpr);
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = VOLUME_ALPHA;
  for (const up of [true, false]) {
    ctx.beginPath();
    for (let i = from; i <= to; i++) {
      const bar = bars[i];
      if (!bar.volume || bar.close >= bar.open !== up) continue;
      const left = Math.round(timeScale.indexToX(i) * dpr) - half - inset;
      const top = Math.round((pane.top + pane.scale.priceToY(bar.volume)) * dpr);
      ctx.rect(left, top, body, Math.max(1, bottom - top));
    }
    ctx.fillStyle = up ? frame.palette.up : frame.palette.down;
    ctx.fill();
  }
  ctx.restore();
}
function drawHighLow(p, m, pane) {
  const { frame, bars, timeScale } = m;
  if (!frame.highLow) return;
  const marks = [
    { index: frame.highLow.highIndex, price: bars[frame.highLow.highIndex].high, label: m.labels.high },
    { index: frame.highLow.lowIndex, price: bars[frame.highLow.lowIndex].low, label: m.labels.low }
  ];
  for (const mark of marks) {
    const x = timeScale.indexToX(mark.index);
    const y = pane.top + Math.min(pane.height - 8, Math.max(8, pane.scale.priceToY(mark.price)));
    const toLeft = x > frame.plotWidth / 2;
    const dir = toLeft ? -1 : 1;
    const text = `${mark.label} ${m.formatPrice(mark.price)}`;
    p.hLine(y, Math.min(x, x + dir * 12), Math.max(x, x + dir * 12), frame.palette.textSecondary);
    p.text(text, x + dir * 16, y, frame.palette.textSecondary, toLeft ? "right" : "left");
  }
}
function drawMain(layer, m) {
  const ctx = layer.begin();
  const p = new Painter(ctx, layer.dpr);
  const f = m.frame;
  const pal = f.palette;
  const [main, volume] = f.panes;
  ctx.fillStyle = pal.background;
  ctx.fillRect(0, 0, f.width, f.height);
  ctx.font = f.font;
  const gridH = f.settings.gridHorizontal;
  for (const price of gridH ? f.priceTicks : []) {
    const y = main.scale.priceToY(price);
    if (y > 0 && y < main.height) p.hLine(y, 0, f.plotWidth, pal.grid);
  }
  const [t0, t1] = f.priceTicks;
  if (gridH && volume && volume.kind === "volume" && t0 !== void 0 && t1 !== void 0) {
    const step = Math.abs(main.scale.priceToY(t1) - main.scale.priceToY(t0));
    if (step >= 8) {
      const phase = main.scale.priceToY(t0);
      let y = phase + Math.ceil((volume.top - phase) / step) * step;
      if (y <= volume.top) y += step;
      const bottom = volume.top + volume.height;
      for (; y < bottom; y += step) if (y - volume.top > 10 && bottom - y > 10) p.hLine(y, 0, f.plotWidth, pal.grid);
    }
  }
  if (f.settings.gridVertical) for (const tick of f.timeTicks) p.vLine(tick.x, 0, f.panesHeight, pal.grid);
  const o = m.objects;
  const rc = { painter: p, coords: o.coords, palette: pal };
  const runOverlay = (overlay) => {
    ctx.save();
    try {
      overlay.render(rc);
    } catch (error) {
      console.error("[fnc] overlay", error);
    }
    ctx.restore();
  };
  if (o.overlays.some((x) => x.layer === "below")) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, main.top, f.plotWidth, main.height);
    ctx.clip();
    for (const overlay of o.overlays) if (overlay.layer === "below") runOverlay(overlay);
    ctx.restore();
  }
  const hasBars = f.range.to >= f.range.from;
  if (hasBars) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, main.top, f.plotWidth, main.height);
    ctx.clip();
    if (m.chartType === "candles") drawCandles(ctx, layer.dpr, m, main);
    else drawLineSeries(ctx, m, main, m.chartType === "area");
    for (const overlay of f.overlays) drawIndicator(ctx, p, m, main, overlay);
    if (f.settings.highLowMarkers) drawHighLow(p, m, main);
    ctx.restore();
    if (volume && volume.kind === "volume" && volume.height > 0) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, volume.top, f.plotWidth, volume.height);
      ctx.clip();
      drawVolume(ctx, layer.dpr, m, volume);
      ctx.restore();
    }
  }
  for (const pane of f.panes) {
    if (pane.kind !== "indicator" || !pane.indicator) continue;
    for (const v of gridH ? pane.ticks : []) {
      const y = pane.top + pane.scale.priceToY(v);
      if (y > pane.top && y < pane.top + pane.height) p.hLine(y, 0, f.plotWidth, pal.grid);
    }
    if (!hasBars) continue;
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, pane.top, f.plotWidth, pane.height);
    ctx.clip();
    drawIndicator(ctx, p, m, pane, pane.indicator);
    ctx.restore();
  }
  const badges = [];
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, main.top, f.plotWidth, main.height);
  ctx.clip();
  for (const overlay of o.overlays) if (overlay.layer !== "below") runOverlay(overlay);
  o.trading.render(rc, m.bars, o.barIndexAt, (i) => m.timeScale.indexToX(i), o.tradingLabels, badges);
  o.drawings.render(rc, badges, m.bars, o.barIndexAt);
  ctx.restore();
  const last = f.settings.lastPriceLine ? m.bars[m.bars.length - 1] : void 0;
  const lastColor = last && last.close >= last.open ? pal.up : pal.down;
  const lastY = last ? main.scale.priceToY(last.close) : NaN;
  if (last && lastY >= 0 && lastY <= main.height) p.hLine(lastY, 0, f.plotWidth, lastColor, DOT);
  for (const pane of f.panes) if (pane.kind !== "main") p.hLine(pane.top, 0, f.plotWidth, pal.border);
  p.vLine(f.plotWidth, 0, f.panesHeight, pal.border);
  p.hLine(f.panesHeight, 0, f.width, pal.border);
  const labelX = f.plotWidth + 8;
  for (const price of f.priceTicks) {
    const y = main.scale.priceToY(price);
    if (y < 8 || y > main.height - 8) continue;
    if (last && y > lastY - BADGE_HEIGHT && y < lastY + (f.countdown ? BADGE_HEIGHT * 2 - 4 : BADGE_HEIGHT)) continue;
    p.text((main.tickFormat ?? m.formatPrice)(price), labelX, y, pal.textSecondary);
  }
  for (const pane of f.panes) {
    if (pane.kind !== "indicator") continue;
    for (const v of pane.ticks) {
      const y = pane.top + pane.scale.priceToY(v);
      if (y < pane.top + 8 || y > pane.top + pane.height - 8) continue;
      p.text((pane.tickFormat ?? pane.format)(v), labelX, y, pal.textSecondary);
    }
  }
  for (const badge of badges) {
    const y = Math.min(main.height - BADGE_HEIGHT / 2, Math.max(BADGE_HEIGHT / 2, badge.y));
    p.roundRect(f.plotWidth + 2, y - BADGE_HEIGHT / 2, f.width - f.plotWidth - 4, BADGE_HEIGHT, 4, badge.bg);
    p.text(badge.text, labelX, y, badge.fg);
  }
  if (last && lastY >= 0 && lastY <= main.height) {
    const h = f.countdown ? BADGE_HEIGHT * 2 - 4 : BADGE_HEIGHT;
    const y = Math.min(main.height - h + BADGE_HEIGHT / 2, Math.max(BADGE_HEIGHT / 2, lastY));
    p.roundRect(f.plotWidth + 2, y - BADGE_HEIGHT / 2, f.width - f.plotWidth - 4, h, 4, lastColor);
    p.text(main.format(last.close), labelX, y, "#FFFFFF");
    if (f.countdown) {
      p.ctx.save();
      p.ctx.globalAlpha = 0.85;
      p.text(f.countdown, labelX, y + BADGE_HEIGHT - 4, "#FFFFFF");
      p.ctx.restore();
    }
  }
  const timeY = f.panesHeight + f.timeAxisHeight / 2;
  for (const tick of f.timeTicks) {
    const w = p.measure(tick.label);
    if (tick.x - w / 2 < 0 || tick.x + w / 2 > f.plotWidth) continue;
    p.text(tick.label, tick.x, timeY, pal.textSecondary, "center");
  }
}
function drawTooltip(p, f, tip) {
  const { ctx } = p;
  const pal = f.palette;
  const lineHeight = 18;
  const pad = 10;
  const w = Math.ceil(Math.max(...tip.lines.map((l) => p.measure(l)))) + pad * 2;
  const h = tip.lines.length * lineHeight + pad * 2 - 4;
  let y = tip.side === "buy" ? tip.y + 12 : tip.y - 12 - h;
  if (y < 4) y = tip.y + 12;
  if (y + h > f.panesHeight - 4) y = tip.y - 12 - h;
  const x = Math.min(f.plotWidth - w - 4, Math.max(4, tip.x - w / 2));
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.16)";
  ctx.shadowBlur = 16;
  ctx.shadowOffsetY = 4;
  p.roundRect(x, y, w, h, 8, pal.background);
  ctx.restore();
  tip.lines.forEach((line2, i) => {
    const color = i === 0 ? tip.side === "buy" ? pal.up : pal.down : i === tip.lines.length - 1 ? pal.textSecondary : pal.text;
    p.text(line2, x + pad, y + pad + i * lineHeight + 7, color);
  });
}
function drawOverlay(layer, m, ch, tooltip = null) {
  const ctx = layer.begin();
  const p = new Painter(ctx, layer.dpr);
  const f = m.frame;
  const pal = f.palette;
  ctx.font = f.font;
  if (tooltip) drawTooltip(p, f, tooltip);
  if (!ch) return;
  if (m.replaySelecting) {
    ctx.save();
    ctx.globalAlpha = 0.12;
    ctx.fillStyle = pal.text;
    ctx.fillRect(ch.x, 0, f.plotWidth - ch.x, f.panesHeight);
    ctx.restore();
  }
  p.vLine(ch.x, 0, f.panesHeight, pal.crosshair, DASH);
  if (ch.source !== "sync") drawCrosshairValue(p, m, ch);
  const timeLabel = m.formatCrosshairTime(ch.time);
  const w = p.measure(timeLabel) + 16;
  const cx = Math.min(f.plotWidth - w / 2, Math.max(w / 2, ch.x));
  p.roundRect(cx - w / 2, f.panesHeight + 4, w, f.timeAxisHeight - 8, 4, pal.text);
  p.text(timeLabel, cx, f.panesHeight + f.timeAxisHeight / 2, pal.background, "center");
}
function drawCrosshairValue(p, m, ch) {
  const f = m.frame;
  const pal = f.palette;
  const ctx = p.ctx;
  p.hLine(ch.y, 0, f.plotWidth, pal.crosshair, DASH);
  if (ch.source === "touch") {
    ctx.beginPath();
    ctx.arc(ch.x, ch.y, 5, 0, Math.PI * 2);
    ctx.fillStyle = pal.background;
    ctx.fill();
    ctx.beginPath();
    ctx.arc(ch.x, ch.y, 3.5, 0, Math.PI * 2);
    ctx.fillStyle = ch.bar.close >= ch.bar.open ? pal.up : pal.down;
    ctx.fill();
  }
  const pane = f.panes.find((x) => x.id === ch.pane);
  const valueLabel = pane ? pane.format(ch.value) : m.formatPrice(ch.value);
  const by = Math.min(f.panesHeight - BADGE_HEIGHT / 2, Math.max(BADGE_HEIGHT / 2, ch.y));
  p.roundRect(f.plotWidth + 2, by - BADGE_HEIGHT / 2, f.width - f.plotWidth - 4, BADGE_HEIGHT, 4, pal.text);
  p.text(valueLabel, f.plotWidth + 8, by, pal.background);
}
var MINUTE = 6e4;
var DAY_MS = 864e5;
function resolutionToMs(resolution) {
  const match = /^(\d*)([SDWM]?)$/i.exec(resolution.trim());
  if (!match) throw new Error(`funnest-charts: invalid resolution "${resolution}"`);
  const n = match[1] ? Number(match[1]) : 1;
  switch ((match[2] ?? "").toUpperCase()) {
    case "S":
      return n * 1e3;
    case "D":
      return n * DAY_MS;
    case "W":
      return n * 7 * DAY_MS;
    case "M":
      return n * 30 * DAY_MS;
    default:
      return n * MINUTE;
  }
}
function isIntradayResolution(resolution) {
  return resolutionToMs(resolution) < DAY_MS;
}
var offsetFormatters = /* @__PURE__ */ new Map();
function timeZoneOffset(time, timeZone) {
  if (timeZone === "UTC") return 0;
  let dtf = offsetFormatters.get(timeZone);
  if (!dtf) {
    dtf = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      minute: "numeric",
      second: "numeric"
    });
    offsetFormatters.set(timeZone, dtf);
  }
  const p = {};
  for (const { type, value } of dtf.formatToParts(time)) p[type] = Number(value);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour % 24, p.minute, p.second);
  return Math.round((asUtc - Math.floor(time / 1e3) * 1e3) / 6e4) * 6e4;
}
var DAY = 864e5;
var MINUTE2 = 6e4;
function sessionStatus(session, timeZone, now = Date.now()) {
  if (session.trim().toLowerCase() === "24x7") return { open: true, nextChange: null };
  const match = /^(\d{2})(\d{2})-(\d{2})(\d{2})(?::([1-7]+))?$/.exec(session.trim());
  if (!match) return { open: true, nextChange: null };
  const openMin = Number(match[1]) * 60 + Number(match[2]);
  const closeMin = Number(match[3]) * 60 + Number(match[4]);
  const days = new Set((match[5] ?? "12345").split("").map(Number));
  const offset = timeZoneOffset(now, timeZone);
  const localMidnight = Math.floor((now + offset) / DAY) * DAY;
  for (let d = -1; d <= 8; d++) {
    const dayStart = localMidnight + d * DAY;
    const isoWeekday = (new Date(dayStart).getUTCDay() + 6) % 7 + 1;
    if (!days.has(isoWeekday)) continue;
    const open = dayStart + openMin * MINUTE2 - offset;
    const close = dayStart + closeMin * MINUTE2 - offset;
    if (now < open) return { open: false, nextChange: open };
    if (now < close) return { open: true, nextChange: close };
  }
  return { open: false, nextChange: null };
}
var FONT_STACK = "Pretendard, -apple-system, BlinkMacSystemFont, 'Apple SD Gothic Neo', 'Segoe UI', Roboto, sans-serif";
var DIRECTION_COLORS = {
  kr: { up: "#F04452", down: "#3182F6" },
  global: { up: "#12B886", down: "#F04452" }
};
var lightTheme = {
  background: "#FFFFFF",
  surface: "#F2F4F6",
  text: "#191F28",
  textSecondary: "#8B95A1",
  grid: "#F2F4F6",
  border: "#E5E8EB",
  crosshair: "#8B95A1",
  ...DIRECTION_COLORS.kr,
  accent: "#3182F6",
  fontFamily: FONT_STACK,
  fontSize: 12,
  radius: 8
};
var darkTheme = {
  ...lightTheme,
  background: "#17171C",
  surface: "#202027",
  text: "#E4E4E5",
  textSecondary: "#7E7E87",
  grid: "#202027",
  border: "#2C2C35",
  crosshair: "#7E7E87"
};
var TIME_AXIS_HEIGHT = 28;
var MIN_PRICE_AXIS_WIDTH = 56;
var PANE_WEIGHT = { main: 4, volume: 1, indicator: 1.3 };
var MIN_PANE_HEIGHT = 32;
var PANE_BORDER_GRAB = 4;
var HISTORY_TRIGGER_BARS = 20;
var TIME_LABEL_MIN_GAP = 72;
var PRICE_TICK_SPACING = 48;
var LABELS = {
  ko: { high: "\uCD5C\uACE0", low: "\uCD5C\uC800" },
  en: { high: "High", low: "Low" }
};
var TRADING_LABELS = {
  ko: { buy: "\uB9E4\uC218", sell: "\uB9E4\uB3C4", position: "\uD3C9\uADE0\uB2E8\uAC00", alert: "\uC54C\uB9BC" },
  en: { buy: "Buy", sell: "Sell", position: "Avg", alert: "Alert" }
};
var HIT_TOLERANCE = { mouse: 5, touch: 14 };
var COMPARE_COLORS = ["#F06595", "#15AABF", "#FF9F0A", "#7048E8", "#12B886"];
var MAX_COMPARES = COMPARE_COLORS.length;
var HISTORY_LIMIT = 100;
function formatCountdown(ms) {
  const total = Math.max(0, Math.floor(ms / 1e3));
  const d = Math.floor(total / 86400);
  const h = Math.floor(total % 86400 / 3600);
  const m = Math.floor(total % 3600 / 60);
  const s = total % 60;
  const two = (n) => String(n).padStart(2, "0");
  if (d > 0) return `${d}d ${two(h)}:${two(m)}`;
  return h > 0 ? `${h}:${two(m)}:${two(s)}` : `${two(m)}:${two(s)}`;
}
function formatPercent(v, decimals) {
  const rounded = Number(v.toFixed(decimals));
  return `${rounded > 0 ? "+" : ""}${rounded.toFixed(decimals)}%`;
}
function firstFinite(values, from) {
  for (let i = Math.max(0, from); i < values.length; i++) if (!Number.isNaN(values[i])) return values[i];
  return Number.NaN;
}
var TOOLTIP_LABELS = {
  ko: { buy: "\uB9E4\uC218", sell: "\uB9E4\uB3C4", liquidation: "\uCCAD\uC0B0", fills: (n) => `${n}\uAC74`, price: "\uCCB4\uACB0\uAC00", avg: "\uD3C9\uADE0\uAC00", qty: "\uC218\uB7C9" },
  en: { buy: "Buy", sell: "Sell", liquidation: "Liquidation", fills: (n) => `${n} fills`, price: "Price", avg: "Avg", qty: "Qty" }
};
function fallbackResolution(requested, supported) {
  if (!supported?.length || supported.includes(requested)) return requested;
  const target = resolutionToMs(requested);
  const sorted = [...supported].sort((a, b) => resolutionToMs(a) - resolutionToMs(b));
  return [...sorted].reverse().find((r) => resolutionToMs(r) <= target) ?? sorted[0];
}
function createChart(container, options = {}) {
  return new Chart(container, options);
}
var Chart = class {
  timeScale;
  root;
  mainLayer;
  overlayLayer;
  store = new BarStore();
  mainScale = new PriceScale({ top: 0.08, bottom: 0.08 });
  volumeScale = new PriceScale({ top: 0.2, bottom: 0 });
  indicators;
  indicatorScales = /* @__PURE__ */ new Map();
  emitter = new Emitter();
  colors;
  interaction;
  cleanups = [];
  drawings;
  overlays = [];
  legendExtras = [];
  legendSeq = 0;
  trading;
  tradingSync;
  tooltipKey = null;
  chartType = "candles";
  magnet = false;
  objectDrag = null;
  theme;
  locale;
  formatter;
  pricePrecision;
  tickSize;
  settingsValue;
  /** Drawings of symbols other than the current one (the current set lives in DrawingManager). */
  drawingsBySymbol = /* @__PURE__ */ new Map();
  stateQueued = false;
  datafeed;
  historyBatchSize;
  size = { width: 0, height: 0, dpr: 1 };
  priceAxisWidth = MIN_PRICE_AXIS_WIDTH;
  frame = null;
  crosshair = null;
  /** Time (UTC ms) of a crosshair mirrored from a linked chart; see setSyncedCrosshair(). */
  syncedTime = null;
  lastCrosshairKey = "";
  lastRangeKey = "";
  lastLayoutKey = "";
  dataVersion = 0;
  emittedDataVersion = -1;
  rafId = 0;
  mainDirty = true;
  destroyed = false;
  symbol = null;
  resolution = null;
  loadToken = 0;
  unsubscribeBars = null;
  unsubscribeQuotes = null;
  latestQuote = null;
  /** Symbol the quote stream belongs to; kept across interval changes of the same symbol. */
  quoteSymbol = null;
  quoteToken = 0;
  connectionState = null;
  displayTimezone;
  loadingHistory = false;
  /**
   * Bumped by every data replacement (setData) and history request: a page answers only if it
   * is still the latest request for the bars on screen. (The load token alone isn't enough — a
   * page requested while setSymbol() awaits carries the new token but the old symbol's bars.)
   */
  historyRequest = 0;
  /** setSymbol() is between its request and setData(). */
  symbolLoading = false;
  /**
   * What the latest setSymbol() asked for, until it lands (or fails). load() and save() go by it
   * rather than what's still on screen: a layout switched away and back before a slow symbol
   * arrives must not keep — or save — the one it was leaving.
   */
  requested = null;
  noMoreHistory = false;
  historyRequestedFor = Number.NaN;
  countdownLabel = null;
  /** Undo/redo of drawings + indicators, as JSON snapshots. */
  history = { undo: [], redo: [], current: "", applying: false };
  compares = /* @__PURE__ */ new Map();
  compareVersion = 0;
  /** Base bar index of the % axis and compare lines (the first visible bar). */
  percentBaseIndex = 0;
  replayState = null;
  replaySelecting = false;
  /** Pane height weights the user set by dragging borders (unset panes use PANE_WEIGHT). */
  paneWeights = /* @__PURE__ */ new Map();
  paneWeightTotal = 1;
  constructor(container, options = {}) {
    this.theme = { ...lightTheme, ...options.theme };
    this.locale = options.locale ?? browserLocale();
    this.formatter = new TimeFormatter(options.timezone ?? defaultTimeZone(), this.locale);
    this.pricePrecision = options.pricePrecision ?? 2;
    this.tickSize = options.tickSize ?? 0;
    this.settingsValue = { ...DEFAULT_CHART_SETTINGS, ...options.settings };
    if (options.volume !== void 0) this.settingsValue.volume = options.volume;
    this.datafeed = options.datafeed;
    this.historyBatchSize = options.historyBatchSize ?? 300;
    this.displayTimezone = options.displayTimezone;
    if (options.displayTimezone) this.formatter = new TimeFormatter(options.displayTimezone, this.locale);
    this.timeScale = new TimeScale({ ...DEFAULT_TIME_SCALE_OPTIONS, ...options.timeScale });
    this.root = document.createElement("div");
    this.root.className = "fnc-chart";
    Object.assign(this.root.style, {
      position: "relative",
      width: "100%",
      height: "100%",
      overflow: "hidden",
      userSelect: "none"
    });
    this.root.style.setProperty("-webkit-user-select", "none");
    this.root.style.setProperty("-webkit-touch-callout", "none");
    this.root.style.setProperty("-webkit-tap-highlight-color", "transparent");
    const probe = document.createElement("span");
    probe.style.display = "none";
    this.root.appendChild(probe);
    container.appendChild(this.root);
    this.colors = new ColorResolver(probe);
    this.indicators = new IndicatorManager(indicatorRegistry(options.indicatorDefinitions));
    this.drawings = new DrawingManager((change) => {
      this.invalidate();
      if (change === "commit") {
        this.emitter.emit("drawingsChange", this.getDrawings());
        this.stateChanged();
        this.recordHistory();
      }
      if (change === "tool") this.emitter.emit("drawingToolChange", this.drawings.tool);
      if (change !== "preview") {
        const d = this.drawings.selected;
        this.emitter.emit("selectionChange", d ? { ...d, points: d.points.map((p) => ({ ...p })) } : null);
      }
    }, drawingRegistry(options.drawingDefinitions));
    this.history.current = this.historySnapshot();
    this.trading = new TradingLayer(() => this.invalidate());
    this.tradingSync = new TradingSync(this.trading, (error) => this.emitter.emit("error", error));
    this.tradingSync.adapter = options.trading ?? null;
    this.mainLayer = new CanvasLayer(this.root);
    this.overlayLayer = new CanvasLayer(this.root);
    this.interaction = new Interaction(this.createInteractionHost(), this.overlayLayer.canvas);
    this.observeSize();
    this.observeThemeVariables();
    this.observeKeyboard();
    this.observeCountdown();
  }
  // ── Public API ──────────────────────────────────────────────────────
  /** Replaces all bars and scrolls to the latest. */
  setData(bars) {
    this.endReplay(false);
    this.store.set(bars);
    this.timeScale.barCount = this.store.length;
    this.timeScale.rightOffset = this.timeScale.options.rightOffset;
    this.mainScale.autoScale = true;
    this.volumeScale.autoScale = true;
    this.noMoreHistory = false;
    this.historyRequestedFor = Number.NaN;
    this.historyRequest++;
    this.loadingHistory = false;
    this.dataVersion++;
    this.invalidate();
  }
  /** Realtime tick: same time as the last bar updates it, a newer time appends a bar. */
  update(bar) {
    const replay = this.replayState;
    if (replay && (replay.future.length > 0 || bar.time > (this.store.last()?.time ?? -Infinity))) {
      const tail = replay.future[replay.future.length - 1];
      if (tail && tail.time === bar.time) replay.future[replay.future.length - 1] = bar;
      else if (!tail || bar.time > tail.time) replay.future.push(bar);
      return;
    }
    const result = this.store.upsert(bar);
    if (result === "ignored") return;
    if (result === "append") {
      this.timeScale.barCount = this.store.length;
      if (this.timeScale.rightOffset < 0) this.timeScale.rightOffset -= 1;
    }
    this.dataVersion++;
    this.invalidate();
  }
  /** Adds older bars (history paging). The view stays where it is. */
  prependData(bars, options = {}) {
    this.store.prepend(bars);
    this.timeScale.barCount = this.store.length;
    if (options.noMoreData) this.noMoreHistory = true;
    this.dataVersion++;
    this.invalidate();
  }
  get bars() {
    return this.store.bars;
  }
  get symbolInfo() {
    return this.symbol;
  }
  /** Loads a symbol through the datafeed, then follows realtime updates. */
  async setSymbol(symbol, resolution) {
    const feed = this.datafeed;
    if (!feed) throw new Error("funnest-charts: setSymbol() requires the `datafeed` option");
    const token = ++this.loadToken;
    this.requested = { symbol, resolution };
    this.endReplay(false);
    this.unsubscribeBars?.();
    this.unsubscribeBars = null;
    const keepQuotes = this.unsubscribeQuotes !== null && this.quoteSymbol === symbol;
    if (!keepQuotes) {
      this.quoteToken++;
      this.unsubscribeQuotes?.();
      this.unsubscribeQuotes = null;
      this.latestQuote = null;
      this.quoteSymbol = null;
    }
    this.emitter.emit("loadingChange", true);
    this.symbolLoading = true;
    let info;
    let result;
    try {
      info = await feed.resolveSymbol(symbol);
      if (token !== this.loadToken) return;
      resolution = fallbackResolution(resolution, info.supportedResolutions);
      const to = Date.now();
      result = await feed.getBars(info, resolution, {
        from: to - resolutionToMs(resolution) * this.historyBatchSize,
        to,
        countBack: this.historyBatchSize
      });
      if (token !== this.loadToken) return;
    } finally {
      if (token === this.loadToken) {
        this.symbolLoading = false;
        this.requested = null;
        this.emitter.emit("loadingChange", false);
      }
    }
    const previous = this.symbol?.symbol ?? "";
    if (previous !== info.symbol) {
      const current = this.getDrawings();
      if (current.length) this.drawingsBySymbol.set(previous, current);
      this.restoreDrawingsFor(info.symbol);
    }
    this.symbol = info;
    this.resolution = resolution;
    this.formatter = new TimeFormatter(this.displayTimezone ?? info.timezone, this.locale);
    this.pricePrecision = info.pricePrecision;
    this.tickSize = info.tickSize;
    this.setData(result.bars);
    this.noMoreHistory = result.noMoreData;
    void this.tradingSync.load(info, result.bars[0]?.time ?? Date.now());
    this.unsubscribeBars = feed.subscribeBars(
      info,
      resolution,
      (bar) => {
        if (token === this.loadToken) this.update(bar);
      },
      () => {
        if (token === this.loadToken) void this.resync(token);
      },
      (state) => {
        if (token !== this.loadToken) return;
        this.connectionState = state;
        this.emitter.emit("connectionChange", state);
      }
    );
    if (!keepQuotes) {
      const quoteToken = ++this.quoteToken;
      this.quoteSymbol = symbol;
      this.unsubscribeQuotes = feed.subscribeQuotes?.(info, (quote) => {
        if (quoteToken !== this.quoteToken) return;
        this.latestQuote = { ...this.latestQuote, ...quote };
        this.emitter.emit("quoteChange", this.latestQuote);
      }) ?? null;
    }
    for (const entry of this.compares.values()) void this.reloadCompare(entry);
    this.emitter.emit("symbolChange", info);
    this.stateChanged();
  }
  /** Latest market statistics (merged across partial updates), if the datafeed provides them. */
  get quote() {
    return this.latestQuote;
  }
  /** Realtime connection state, if the datafeed reports it. */
  get connection() {
    return this.connectionState;
  }
  get currentResolution() {
    return this.resolution;
  }
  /** Reloads the current symbol at another resolution. */
  setResolution(resolution) {
    if (!this.symbol) throw new Error("funnest-charts: setResolution() needs a symbol loaded via setSymbol()");
    return this.setSymbol(this.symbol.symbol, resolution);
  }
  /** Plot geometry, for positioning overlays. */
  get layout() {
    const f = this.frame;
    return {
      width: this.size.width,
      height: this.size.height,
      plotWidth: f?.plotWidth ?? 0,
      panesHeight: f?.panesHeight ?? 0,
      timeAxisHeight: TIME_AXIS_HEIGHT,
      panes: (f?.panes ?? []).map((p) => ({ id: p.id, kind: p.kind, top: p.top, height: p.height }))
    };
  }
  /**
   * Reserves `px` at the top of the price pane so overlays (like a legend) never cover
   * the candles. Auto-scaled data is laid out below the inset.
   */
  setTopInset(px) {
    const value = Math.max(0, Math.round(px));
    if (value === this.mainScale.insetTop) return;
    this.mainScale.insetTop = value;
    this.invalidate();
  }
  /** factor > 1 zooms in. Anchored to the latest bar when it's on screen, otherwise to the center. */
  zoom(factor) {
    const anchor = this.isAtRealtime() ? this.timeScale.width : this.timeScale.width / 2;
    this.timeScale.zoom(anchor, factor);
    this.invalidate();
  }
  /** Scrolls by a number of bars; positive moves toward newer bars. */
  scrollBars(bars) {
    this.timeScale.pan(-bars * this.timeScale.barSpacing);
    this.invalidate();
  }
  /** True when the newest bar is visible. */
  isAtRealtime() {
    return this.store.length === 0 || this.timeScale.visibleRange().to >= this.store.length - 1;
  }
  /**
   * Mirrors another chart's crosshair: a vertical line at `time` (UTC ms) on the bar that
   * contains it, with the time badge but no price line. `crosshairMove` fires with
   * `source: 'sync'`, so legends follow along. A pointer on this chart takes precedence.
   * Pass null to clear.
   */
  setSyncedCrosshair(time) {
    if (time === this.syncedTime) return;
    this.syncedTime = time;
    this.invalidate(false);
  }
  /**
   * The time span (UTC ms) between the plot's left and right edges. Edges past the data
   * (the empty space right of the last bar) are extrapolated by the bar interval.
   */
  getVisibleTimeRange() {
    const ts = this.timeScale;
    if (this.store.length === 0 || ts.width <= 0) return null;
    return { from: this.indexToTime(ts.xToIndexFloat(0)), to: this.indexToTime(ts.xToIndexFloat(ts.width)) };
  }
  /** Scrolls and zooms so the plot spans `from`…`to` (UTC ms), e.g. to match a linked chart. */
  setVisibleTimeRange(range) {
    const ts = this.timeScale;
    if (this.store.length === 0 || ts.width <= 0 || !(range.to > range.from)) return;
    const from = this.timeToIndex(range.from);
    const to = this.timeToIndex(range.to);
    if (!(to > from)) return;
    ts.barSpacing = ts.width / (to - from);
    ts.rightOffset = to - 0.5 - (this.store.length - 1);
    ts.clamp();
    this.invalidate();
  }
  /** Fractional bar index → time, interpolating between bars and extrapolating past either end. */
  indexToTime(index) {
    const bars = this.store.bars;
    const last = bars.length - 1;
    const step = this.barInterval();
    if (index <= 0) return bars[0].time + index * step;
    if (index >= last) return bars[last].time + (index - last) * step;
    const i = Math.floor(index);
    const a = bars[i].time;
    return a + (bars[i + 1].time - a) * (index - i);
  }
  /** Inverse of indexToTime(). */
  timeToIndex(time) {
    const bars = this.store.bars;
    const last = bars.length - 1;
    const step = this.barInterval();
    if (time <= bars[0].time) return (time - bars[0].time) / step;
    if (time >= bars[last].time) return last + (time - bars[last].time) / step;
    const i = this.store.indexAtOrBefore(time);
    const a = bars[i].time;
    const b = bars[i + 1].time;
    return i + (b > a ? (time - a) / (b - a) : 0);
  }
  /** Snapshot of the chart (without the crosshair) at device resolution. */
  takeScreenshot() {
    if (this.rafId || this.mainDirty) this.render();
    const src2 = this.mainLayer.canvas;
    const out = document.createElement("canvas");
    out.width = src2.width;
    out.height = src2.height;
    out.getContext("2d")?.drawImage(src2, 0, 0);
    return out;
  }
  /**
   * Re-fetches the latest window and merges it in, keeping the view. Datafeeds trigger this
   * via the `onResetCache` callback of subscribeBars after a WebSocket reconnect, so bars
   * missed while disconnected are filled in.
   */
  async resync(token) {
    const feed = this.datafeed;
    if (!feed || !this.symbol || !this.resolution || this.replayState) return;
    try {
      const to = Date.now();
      const result = await feed.getBars(this.symbol, this.resolution, {
        from: to - resolutionToMs(this.resolution) * this.historyBatchSize,
        to,
        countBack: this.historyBatchSize
      });
      if (token !== this.loadToken) return;
      const lastBefore = this.store.last()?.time ?? -Infinity;
      const before = this.store.length;
      this.store.merge(result.bars);
      if (this.timeScale.rightOffset < 0) {
        const appended = result.bars.filter((b) => b.time > lastBefore).length;
        this.timeScale.rightOffset -= Math.min(appended, this.store.length - before);
      }
      this.timeScale.barCount = this.store.length;
      this.dataVersion++;
      this.invalidate();
    } catch (error) {
      this.emitter.emit("error", error);
    }
  }
  // ── Chart type ─────────────────────────────────────────────────────
  get type() {
    return this.chartType;
  }
  setChartType(type) {
    if (type === this.chartType) return;
    this.chartType = type;
    this.invalidate();
    this.emitter.emit("chartTypeChange", type);
    this.stateChanged();
  }
  // ── Settings & state ───────────────────────────────────────────────
  get settings() {
    return { ...this.settingsValue };
  }
  setSettings(patch) {
    this.settingsValue = { ...this.settingsValue, ...patch };
    this.invalidate();
    this.emitter.emit("settingsChange", this.settings);
    this.stateChanged();
  }
  /** Serializable snapshot of the layout. Pair with `load()`; see `stateChange` for autosave. */
  save() {
    const drawings = Object.fromEntries(this.drawingsBySymbol);
    drawings[this.symbol?.symbol ?? ""] = this.getDrawings();
    return {
      version: 1,
      // A symbol still loading is the one this chart is on (see `requested`).
      symbol: this.requested?.symbol ?? this.symbol?.symbol ?? null,
      resolution: this.requested?.resolution ?? this.resolution,
      chartType: this.chartType,
      settings: this.settings,
      indicators: this.getIndicators(),
      drawings: JSON.parse(JSON.stringify(drawings)),
      view: { barSpacing: this.timeScale.barSpacing, rightOffset: this.timeScale.rightOffset },
      compares: [...this.compares.keys()],
      paneWeights: Object.fromEntries(this.paneWeights)
    };
  }
  /**
   * Restores a layout from `save()` (or JSON from storage — it's validated). Loads the saved
   * symbol/interval through the datafeed first unless `{ symbol: false }`.
   */
  async load(input, options = {}) {
    const state = parseChartState(input);
    this.drawingsBySymbol.clear();
    for (const [symbol, list] of Object.entries(state.drawings)) this.drawingsBySymbol.set(symbol, list);
    this.restoreDrawingsFor(this.symbol?.symbol ?? "");
    const wantSymbol = options.symbol !== false && this.datafeed && state.symbol;
    const target = this.requested ?? { symbol: this.symbol?.symbol, resolution: this.resolution };
    if (wantSymbol && (state.symbol !== target.symbol || state.resolution !== target.resolution)) {
      await this.setSymbol(state.symbol, state.resolution ?? this.resolution ?? "1D");
    }
    this.settingsValue = state.settings;
    this.emitter.emit("settingsChange", this.settings);
    this.setChartType(state.chartType);
    this.setIndicators(state.indicators);
    this.timeScale.barSpacing = state.view.barSpacing;
    this.timeScale.rightOffset = state.view.rightOffset;
    this.timeScale.clamp();
    this.paneWeights.clear();
    for (const [id, w] of Object.entries(state.paneWeights ?? {})) if (w > 0) this.paneWeights.set(id, w);
    const compares = state.compares ?? [];
    for (const symbol of [...this.compares.keys()]) if (!compares.includes(symbol)) this.removeCompare(symbol);
    if (this.datafeed) for (const symbol of compares) void this.addCompare(symbol);
    this.resetHistory();
    this.invalidate();
    this.stateChanged();
  }
  /** Swaps the active drawing set to `symbol`'s. */
  restoreDrawingsFor(symbol) {
    const list = this.drawingsBySymbol.get(symbol) ?? [];
    this.drawingsBySymbol.delete(symbol);
    this.drawings.set(list);
    this.resetHistory();
  }
  stateChanged() {
    if (this.stateQueued) return;
    this.stateQueued = true;
    queueMicrotask(() => {
      this.stateQueued = false;
      if (!this.destroyed) this.emitter.emit("stateChange", void 0);
    });
  }
  // ── Drawings ───────────────────────────────────────────────────────
  /** Arms a drawing tool (null = cursor). It disarms itself after one drawing is placed. */
  setDrawingTool(tool) {
    this.drawings.setTool(tool);
  }
  get drawingTool() {
    return this.drawings.tool;
  }
  /** Magnet mode: drawing points snap to the nearest open/high/low/close of the bar. */
  setMagnet(on) {
    if (on === this.magnet) return;
    this.magnet = on;
    this.emitter.emit("magnetChange", on);
  }
  get magnetEnabled() {
    return this.magnet;
  }
  getDrawings() {
    return this.drawings.drawings.map((d) => ({ ...d, points: d.points.map((p) => ({ ...p })) }));
  }
  /** Restores drawings (e.g. from storage). */
  setDrawings(drawings) {
    this.drawings.set(drawings);
  }
  updateDrawing(id, patch) {
    this.drawings.update(id, patch);
  }
  /** Adds a drawing (e.g. a horizontal line at a price) and selects it. Returns its id. */
  addDrawing(drawing) {
    const id = `d_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    this.drawings.set([...this.drawings.drawings, { ...drawing, id, points: drawing.points.map((p) => ({ ...p })) }]);
    this.drawings.select(id);
    return id;
  }
  removeDrawing(id) {
    this.drawings.remove(id);
  }
  clearDrawings() {
    this.drawings.clear();
  }
  get selectedDrawing() {
    return this.drawings.selected;
  }
  selectDrawing(id) {
    this.drawings.select(id);
  }
  // ── Indicators ─────────────────────────────────────────────────────
  /** Adds an indicator (overlays draw on the candles, others get their own pane). Returns its id. */
  addIndicator(type, params) {
    const id = this.indicators.add(type, params);
    this.indicatorsChanged();
    return id;
  }
  removeIndicator(id) {
    if (!this.indicators.remove(id)) return;
    this.indicatorScales.delete(id);
    this.paneWeights.delete(id);
    this.indicatorsChanged();
  }
  /** Changes params, per-series styles (color/width/visible) and/or overall visibility. */
  updateIndicator(id, patch) {
    if (this.indicators.update(id, patch)) this.indicatorsChanged();
  }
  setIndicatorVisible(id, visible) {
    this.updateIndicator(id, { visible });
  }
  getIndicators() {
    return this.indicators.snapshot();
  }
  /** Restores indicators (e.g. from storage). */
  setIndicators(configs) {
    this.indicators.set(configs);
    this.indicatorScales.clear();
    this.indicatorsChanged();
  }
  /** Formatted indicator values at a bar index (default: the last bar), for legends. */
  indicatorLegend(index = this.store.length - 1) {
    return this.indicators.list.map((cfg) => {
      const def = this.indicators.def(cfg.type);
      const output = this.indicators.output(cfg, this.store.bars, this.dataVersion);
      const precision = output.precision ?? this.pricePrecision;
      return {
        id: cfg.id,
        type: cfg.type,
        title: def.title(cfg.params),
        overlay: def.overlay,
        visible: cfg.visible !== false,
        values: output.series.filter((series) => series.visible).map((series) => {
          const v = series.values[index - (series.shift ?? 0)];
          return {
            key: series.key,
            label: series.label,
            value: v === void 0 || Number.isNaN(v) ? "\u2014" : formatPrice(v, precision),
            color: series.kind === "histogram" ? v !== void 0 && v < 0 ? this.theme.down : this.theme.up : series.color
          };
        })
      };
    });
  }
  indicatorsChanged() {
    this.invalidate();
    this.emitter.emit("indicatorsChange", this.getIndicators());
    this.stateChanged();
    this.recordHistory();
  }
  /** Built-in and custom indicators this chart can add. */
  indicatorDefinitions() {
    return [...this.indicators.registry.values()];
  }
  indicatorDefinition(type) {
    return this.indicators.registry.get(type);
  }
  /** Built-in and custom drawing tools, in drawing-bar order. */
  drawingDefinitions() {
    return [...this.drawings.registry.values()];
  }
  // ── Pane sizes ─────────────────────────────────────────────────────
  /**
   * Moves the border above pane `index` (1 = between the price pane and the next one) by `dy` px.
   * The two neighbouring panes trade height; the rest keep theirs. Users do this by dragging.
   */
  resizePane(index, dy) {
    const panes = this.frame?.panes;
    const above = panes?.[index - 1];
    const below = panes?.[index];
    if (!panes || !above || !below || !this.frame) return;
    const pair = above.height + below.height;
    const top = Math.min(pair - MIN_PANE_HEIGHT, Math.max(MIN_PANE_HEIGHT, above.height + dy));
    const unit = this.paneWeightTotal / Math.max(1, this.frame.panesHeight);
    for (const p of panes) this.paneWeights.set(p.id, p.height * unit);
    this.paneWeights.set(above.id, top * unit);
    this.paneWeights.set(below.id, (pair - top) * unit);
    this.invalidate();
    this.stateChanged();
  }
  /** Back to the default pane heights. */
  resetPaneSizes() {
    if (this.paneWeights.size === 0) return;
    this.paneWeights.clear();
    this.invalidate();
    this.stateChanged();
  }
  // ── Undo / redo ────────────────────────────────────────────────────
  get canUndo() {
    return this.history.undo.length > 0;
  }
  get canRedo() {
    return this.history.redo.length > 0;
  }
  /** Reverts the last drawing or indicator change. */
  undo() {
    const previous = this.history.undo.pop();
    if (previous === void 0) return;
    this.history.redo.push(this.history.current);
    this.applyHistory(previous);
  }
  redo() {
    const next = this.history.redo.pop();
    if (next === void 0) return;
    this.history.undo.push(this.history.current);
    this.applyHistory(next);
  }
  historySnapshot() {
    return JSON.stringify([this.drawings.drawings, this.indicators.list]);
  }
  recordHistory() {
    const h = this.history;
    if (h.applying) return;
    const next = this.historySnapshot();
    if (next === h.current) return;
    h.undo.push(h.current);
    if (h.undo.length > HISTORY_LIMIT) h.undo.shift();
    h.redo = [];
    h.current = next;
    this.emitHistory();
  }
  resetHistory() {
    this.history.undo = [];
    this.history.redo = [];
    this.history.current = this.historySnapshot();
    this.emitHistory();
  }
  applyHistory(snapshot) {
    const [drawings, indicators] = JSON.parse(snapshot);
    this.history.applying = true;
    try {
      this.drawings.set(drawings);
      this.setIndicators(indicators);
    } finally {
      this.history.applying = false;
    }
    this.history.current = snapshot;
    this.emitHistory();
  }
  emitHistory() {
    this.emitter.emit("historyChange", { canUndo: this.canUndo, canRedo: this.canRedo });
  }
  // ── Compare ────────────────────────────────────────────────────────
  /**
   * Overlays another symbol's closes as a line, rebased to the first visible bar. The price
   * axis switches to % while any symbol is compared. Needs the `datafeed` option.
   */
  async addCompare(symbol) {
    if (!this.datafeed) throw new Error("funnest-charts: addCompare() requires the `datafeed` option");
    if (this.compares.has(symbol) || this.compares.size >= MAX_COMPARES || symbol === this.symbol?.symbol) return;
    const used = new Set([...this.compares.values()].map((e) => e.color));
    const entry = {
      symbol,
      info: null,
      store: new BarStore(),
      color: COMPARE_COLORS.find((c) => !used.has(c)) ?? COMPARE_COLORS[0],
      unsubscribe: null,
      loadingOlder: false,
      noMoreOlder: false,
      aligned: null
    };
    this.compares.set(symbol, entry);
    this.comparesChanged();
    await this.reloadCompare(entry);
  }
  removeCompare(symbol) {
    const entry = this.compares.get(symbol);
    if (!entry) return;
    entry.unsubscribe?.();
    this.compares.delete(symbol);
    this.comparesChanged();
  }
  getCompares() {
    return [...this.compares.values()].map((e) => ({
      symbol: e.symbol,
      name: e.info?.name ?? e.symbol,
      color: e.color,
      ready: e.store.length > 0
    }));
  }
  /** Each compared symbol's % change from the first visible bar, at `index` (default: the last bar). */
  compareLegend(index = this.store.length - 1) {
    return this.getCompares().map((info) => {
      const values = this.alignedCompare(this.compares.get(info.symbol));
      const base = firstFinite(values, this.percentBaseIndex);
      const v = values[index];
      return { ...info, value: v === void 0 || Number.isNaN(v) || !base ? "\u2014" : formatPercent((v / base - 1) * 100, 2) };
    });
  }
  comparesChanged() {
    this.compareVersion++;
    this.invalidate();
    this.emitter.emit("comparesChange", this.getCompares());
    this.stateChanged();
  }
  /** (Re)loads a compared symbol's bars at the current resolution, back to the main series' first bar. */
  async reloadCompare(entry) {
    const feed = this.datafeed;
    const resolution = this.resolution;
    if (!feed || !resolution) return;
    const token = this.loadToken;
    const current = () => this.compares.get(entry.symbol) === entry && token === this.loadToken;
    entry.unsubscribe?.();
    entry.unsubscribe = null;
    try {
      const info = entry.info ?? await feed.resolveSymbol(entry.symbol);
      if (!current()) return;
      entry.info = info;
      const to = Date.now();
      const from = this.store.first()?.time ?? to - resolutionToMs(resolution) * this.historyBatchSize;
      const result = await feed.getBars(info, resolution, {
        from,
        to,
        countBack: Math.max(this.historyBatchSize, this.store.length + 1)
      });
      if (!current()) return;
      entry.store.set(result.bars);
      entry.noMoreOlder = result.noMoreData;
      entry.unsubscribe = feed.subscribeBars(
        info,
        resolution,
        (bar) => {
          if (!current()) return;
          entry.store.upsert(bar);
          this.compareVersion++;
          this.invalidate();
        },
        () => {
        }
      );
      this.comparesChanged();
      void this.loadOlderCompare(entry);
    } catch (error) {
      if (!current()) return;
      this.removeCompare(entry.symbol);
      this.emitter.emit("error", error);
    }
  }
  /** Pages a compared symbol's history back until it covers the main series' first bar. */
  async loadOlderCompare(entry) {
    const feed = this.datafeed;
    const first = entry.store.first();
    const mainFirst = this.store.first();
    if (!feed || !entry.info || !this.resolution || !first || !mainFirst) return;
    if (entry.loadingOlder || entry.noMoreOlder || first.time <= mainFirst.time) return;
    const token = this.loadToken;
    entry.loadingOlder = true;
    try {
      const to = first.time - 1;
      const result = await feed.getBars(entry.info, this.resolution, { from: mainFirst.time, to, countBack: this.historyBatchSize });
      if (this.compares.get(entry.symbol) !== entry || token !== this.loadToken) return;
      entry.store.prepend(result.bars);
      entry.noMoreOlder = result.noMoreData || result.bars.length === 0;
      this.compareVersion++;
      this.invalidate();
    } catch (error) {
      this.emitter.emit("error", error);
    } finally {
      entry.loadingOlder = false;
    }
  }
  /** Compare closes at each main bar (the compare bar at or before its time). */
  alignedCompare(entry) {
    const key = `${this.dataVersion}:${this.compareVersion}`;
    if (entry.aligned?.key === key) return entry.aligned.values;
    const bars = this.store.bars;
    const other = entry.store.bars;
    const values = new Float64Array(bars.length).fill(Number.NaN);
    let j = -1;
    for (let i = 0; i < bars.length; i++) {
      const t = bars[i].time;
      while (j + 1 < other.length && other[j + 1].time <= t) j++;
      if (j >= 0) values[i] = other[j].close;
    }
    entry.aligned = { key, values };
    return values;
  }
  /** Compare lines in main-price space, each rebased so its first visible value sits on the main close there. */
  compareOverlays(baseIndex) {
    const mainBase = this.store.bars[baseIndex]?.close;
    if (mainBase === void 0) return [];
    const out = [];
    for (const entry of this.compares.values()) {
      if (entry.store.length === 0) continue;
      const aligned = this.alignedCompare(entry);
      const base = firstFinite(aligned, baseIndex);
      if (!base) continue;
      out.push({
        series: [
          {
            key: entry.symbol,
            label: entry.info?.name ?? entry.symbol,
            values: aligned.map((v) => mainBase * v / base),
            color: entry.color,
            width: 2,
            visible: true,
            kind: "line"
          }
        ],
        precision: null
      });
    }
    return out;
  }
  // ── Replay ─────────────────────────────────────────────────────────
  get replay() {
    const r = this.replayState;
    return {
      selecting: this.replaySelecting,
      active: r !== null,
      playing: r?.timer != null,
      remaining: r?.future.length ?? 0,
      interval: r?.interval ?? 1e3
    };
  }
  /** Arms start picking: the next click on the chart starts a replay from that bar. Esc cancels. */
  setReplaySelecting(on) {
    if (on === this.replaySelecting) return;
    if (on && this.drawings.tool) this.drawings.setTool(null);
    this.replaySelecting = on;
    this.invalidate(false);
    this.emitReplay();
  }
  /** Hides every bar after `time` (UTC ms); reveal them with replayStep/replayPlay. */
  startReplay(time) {
    const all = this.replayState ? [...this.store.bars, ...this.replayState.future] : [...this.store.bars];
    let cut = -1;
    while (cut + 1 < all.length && all[cut + 1].time <= time) cut++;
    cut = Math.max(0, cut);
    if (cut >= all.length - 1) return;
    const interval = this.replayState?.interval ?? 1e3;
    this.stopReplayTimer();
    this.replaySelecting = false;
    this.replayState = { future: all.slice(cut + 1), timer: null, interval };
    this.store.set(all.slice(0, cut + 1));
    this.timeScale.barCount = this.store.length;
    this.timeScale.rightOffset = Math.max(this.timeScale.options.rightOffset, 10);
    this.timeScale.clamp();
    this.mainScale.autoScale = true;
    this.dataVersion++;
    this.invalidate();
    this.emitReplay();
  }
  /** Reveals the next `count` hidden bars. */
  replayStep(count = 1) {
    const r = this.replayState;
    if (!r) return;
    for (let k = 0; k < count && r.future.length > 0; k++) {
      this.store.upsert(r.future.shift());
      if (this.timeScale.rightOffset < 0) this.timeScale.rightOffset -= 1;
    }
    this.timeScale.barCount = this.store.length;
    this.dataVersion++;
    if (r.future.length === 0) this.stopReplayTimer();
    this.invalidate();
    this.emitReplay();
  }
  /** Plays one bar every `interval` ms (default: the last speed used, initially 1000). */
  replayPlay(interval) {
    const r = this.replayState;
    if (!r || r.future.length === 0) return;
    if (interval !== void 0) r.interval = Math.max(16, interval);
    if (r.timer) clearInterval(r.timer);
    r.timer = setInterval(() => this.replayStep(), r.interval);
    this.emitReplay();
  }
  /** Changes the playback speed (ms per bar), also while playing. */
  setReplayInterval(interval) {
    const r = this.replayState;
    if (!r) return;
    r.interval = Math.max(16, interval);
    if (r.timer) {
      clearInterval(r.timer);
      r.timer = setInterval(() => this.replayStep(), r.interval);
    }
    this.emitReplay();
  }
  replayPause() {
    this.stopReplayTimer();
    this.emitReplay();
  }
  /** Leaves replay and shows every bar again (including live ones that arrived meanwhile). */
  stopReplay() {
    this.endReplay(true);
  }
  endReplay(restore) {
    const r = this.replayState;
    const wasSelecting = this.replaySelecting;
    this.replaySelecting = false;
    if (!r) {
      if (wasSelecting) {
        this.invalidate(false);
        this.emitReplay();
      }
      return;
    }
    this.stopReplayTimer();
    this.replayState = null;
    if (restore) {
      for (const bar of r.future) this.store.upsert(bar);
      this.timeScale.barCount = this.store.length;
      this.timeScale.rightOffset = this.timeScale.options.rightOffset;
      this.timeScale.clamp();
      this.dataVersion++;
      this.invalidate();
    }
    this.emitReplay();
  }
  stopReplayTimer() {
    const r = this.replayState;
    if (r?.timer) clearInterval(r.timer);
    if (r) r.timer = null;
  }
  emitReplay() {
    this.emitter.emit("replayChange", this.replay);
  }
  indicatorScale(id) {
    let scale = this.indicatorScales.get(id);
    if (!scale) this.indicatorScales.set(id, scale = new PriceScale({ top: 0.24, bottom: 0.08 }));
    return scale;
  }
  // ── Trading ────────────────────────────────────────────────────────
  /**
   * Connects the user's account (fills, positions, orders). The chart loads them for the
   * current symbol, pages older fills with history and applies live updates. Pass null to detach.
   */
  setTradingAdapter(adapter) {
    this.tradingSync.adapter = adapter;
    if (adapter && this.symbol) void this.tradingSync.load(this.symbol, this.store.first()?.time ?? Date.now());
    else this.tradingSync.detach();
  }
  /** Average-price line with live P&L against the last price. */
  addPositionLine(options) {
    return this.trading.addPosition(options);
  }
  /** Pending order line. Pass `onMove` to make it draggable and `onCancel` for an × button. */
  addOrderLine(options) {
    return this.trading.addOrder(options);
  }
  /** Price alert line (dotted, gray, "알림" label). Pass `onMove` to make it draggable and `onCancel` for an ×. */
  addAlertLine(options) {
    return this.trading.addAlert(options);
  }
  /**
   * Adds a row to the legend for something the app draws (see LegendItemOptions). `update()`
   * changes its name or state; `remove()` takes the row away (the app removes its drawing).
   */
  addLegendItem(options) {
    const item = { ...options, id: `legend-${++this.legendSeq}`, visible: options.visible ?? true };
    this.legendExtras = [...this.legendExtras, item];
    this.emitter.emit("legendItemsChange", this.legendExtras);
    return {
      update: (patch) => {
        this.legendExtras = this.legendExtras.map((x) => x.id === item.id ? { ...x, ...patch, visible: patch.visible ?? x.visible } : x);
        this.emitter.emit("legendItemsChange", this.legendExtras);
      },
      remove: () => {
        if (!this.legendExtras.some((x) => x.id === item.id)) return;
        this.legendExtras = this.legendExtras.filter((x) => x.id !== item.id);
        this.emitter.emit("legendItemsChange", this.legendExtras);
      }
    };
  }
  /** The app's legend rows, in the order they were added. */
  get legendItems() {
    return this.legendExtras;
  }
  /** The legend's 👁 on an app row: tells the app (onToggle) and remembers the state. */
  setLegendItemVisible(id, visible) {
    const item = this.legendExtras.find((x) => x.id === id);
    if (!item || item.visible === visible) return;
    this.legendExtras = this.legendExtras.map((x) => x.id === id ? { ...x, visible } : x);
    item.onToggle?.(visible);
    this.emitter.emit("legendItemsChange", this.legendExtras);
  }
  /**
   * Paints `overlay` on the price pane every frame (see ChartOverlay). `redraw()` asks for a
   * new frame after its data changed; `remove()` takes it off.
   */
  addOverlay(overlay) {
    this.overlays.push(overlay);
    this.invalidate();
    return {
      redraw: () => this.invalidate(),
      remove: () => {
        const i = this.overlays.indexOf(overlay);
        if (i >= 0) this.overlays.splice(i, 1);
        this.invalidate();
      }
    };
  }
  /** Fill markers (▲ buy under the bar, ▼ sell above; ⚡ at the price for liquidations). Replaces the previous set. */
  setExecutions(markers) {
    this.trading.setExecutions(markers);
  }
  /** What position/order/alert line labels show and where (direction, price, size, P&L, ×, alignment, line width). */
  setTradingLabels(patch) {
    this.trading.setLabelOptions(patch);
  }
  get tradingLabels() {
    return this.trading.labelSettings;
  }
  setTheme(theme) {
    this.theme = { ...this.theme, ...theme };
    this.colors.clear();
    this.invalidate();
  }
  /** Re-reads CSS variables used by the theme (call after changing them outside of class/style attributes). */
  refreshTheme() {
    this.colors.clear();
    this.invalidate();
  }
  setLocale(locale) {
    this.locale = locale;
    this.formatter = new TimeFormatter(this.formatter.timeZone, locale);
    this.invalidate();
  }
  setTimezone(timeZone) {
    this.formatter = new TimeFormatter(this.displayTimezone ?? timeZone, this.locale);
    this.invalidate();
  }
  setPriceFormat(format) {
    if (format.precision !== void 0) this.pricePrecision = format.precision;
    if (format.tickSize !== void 0) this.tickSize = format.tickSize;
    this.invalidate();
  }
  setVolumeVisible(visible) {
    this.setSettings({ volume: visible });
  }
  fitContent() {
    this.timeScale.fitContent();
    this.mainScale.autoScale = true;
    this.invalidate();
  }
  scrollToRealtime() {
    this.timeScale.rightOffset = this.timeScale.options.rightOffset;
    this.timeScale.clamp();
    this.invalidate();
  }
  resetView() {
    this.timeScale.reset();
    this.mainScale.autoScale = true;
    this.volumeScale.autoScale = true;
    for (const scale of this.indicatorScales.values()) scale.autoScale = true;
    this.invalidate();
  }
  on(event, listener) {
    return this.emitter.on(event, listener);
  }
  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    this.loadToken++;
    this.unsubscribeBars?.();
    this.unsubscribeQuotes?.();
    for (const entry of this.compares.values()) entry.unsubscribe?.();
    this.stopReplayTimer();
    this.tradingSync.detach();
    if (this.rafId) cancelAnimationFrame(this.rafId);
    this.interaction.destroy();
    for (const cleanup of this.cleanups) cleanup();
    this.emitter.clear();
    this.root.remove();
  }
  // ── Scheduling & rendering ─────────────────────────────────────────
  /** Coalesces any number of changes into one paint per animation frame. */
  invalidate(main = true) {
    if (this.destroyed) return;
    if (main) this.mainDirty = true;
    if (!this.rafId) this.rafId = requestAnimationFrame(() => this.render());
  }
  render() {
    this.rafId = 0;
    if (this.destroyed || this.size.width <= 0 || this.size.height <= 0) return;
    if (this.mainDirty || !this.frame) {
      this.mainDirty = false;
      this.frame = this.computeFrame();
      drawMain(this.mainLayer, this.renderModel(this.frame));
      this.afterFrame();
    }
    const crosshair = this.resolveCrosshair(this.frame);
    drawOverlay(this.overlayLayer, this.renderModel(this.frame), crosshair, this.executionTooltip());
    this.emitCrosshair(crosshair);
  }
  renderModel(frame) {
    return {
      frame,
      bars: this.store.bars,
      timeScale: this.timeScale,
      formatPrice: (p) => formatPrice(p, this.pricePrecision),
      formatVolume: (v) => formatCompact(v, this.locale),
      formatCrosshairTime: (t) => this.formatter.crosshairLabel(t, this.isIntraday()),
      labels: LABELS[this.locale],
      chartType: this.chartType,
      replaySelecting: this.replaySelecting,
      objects: {
        coords: this.paneCoords(),
        overlays: this.overlays,
        drawings: this.drawings,
        trading: this.trading,
        tradingLabels: TRADING_LABELS[this.locale],
        barIndexAt: (time) => this.store.indexAtOrBefore(time)
      }
    };
  }
  /** Approximate ms per bar: the resolution when known, else the smallest recent gap. */
  barInterval() {
    if (this.resolution) return resolutionToMs(this.resolution);
    const bars = this.store.bars;
    let gap = Infinity;
    for (let i = Math.max(1, bars.length - 20); i < bars.length; i++) gap = Math.min(gap, bars[i].time - bars[i - 1].time);
    return Number.isFinite(gap) && gap > 0 ? gap : 6e4;
  }
  paneCoords() {
    const interval = this.barInterval();
    const ts = this.timeScale;
    const scale = this.mainScale;
    return {
      plotWidth: ts.width,
      height: scale.height,
      timeToX: (time) => ts.indexToX(this.store.indexFloatOfTime(time, interval)),
      timeToIndex: (time) => this.store.indexFloatOfTime(time, interval),
      pointAt: (x, y) => {
        const index = Math.round(ts.xToIndexFloat(x));
        const bar = this.magnet ? this.store.at(index) : void 0;
        return {
          time: this.store.timeOfIndexFloat(index, interval),
          // Magnet: stick to the nearest OHLC of the bar under the pointer (no bar → free).
          price: bar ? snapToOhlc(bar, y, (p) => scale.priceToY(p)) : roundToTick(scale.yToPrice(y), this.tickSize)
        };
      },
      priceToY: (p) => scale.priceToY(p),
      yToPrice: (y) => scale.yToPrice(y),
      snapPrice: (p) => roundToTick(p, this.tickSize),
      // Drawing and order badges follow the axis (a % axis labels them in %).
      formatPrice: this.mainScale.mode === "percent" ? this.mainValueFormat() : (p) => formatPrice(p, this.pricePrecision)
    };
  }
  computeFrame() {
    const { width, height } = this.size;
    const bars = this.store.bars;
    const panesHeight = Math.max(0, height - TIME_AXIS_HEIGHT);
    this.timeScale.barCount = this.store.length;
    const indicatorPanes = this.indicators.panes;
    const weightOf = (id, kind) => this.paneWeights.get(id) ?? PANE_WEIGHT[kind];
    const weights = [["main", weightOf("main", "main")]];
    if (this.settingsValue.volume) weights.push(["volume", weightOf("volume", "volume")]);
    for (const c of indicatorPanes) weights.push([c.id, weightOf(c.id, "indicator")]);
    const totalWeight = weights.reduce((sum, [, w]) => sum + w, 0);
    this.paneWeightTotal = totalWeight;
    const heightOf = new Map(weights.map(([id, w]) => [id, Math.max(MIN_PANE_HEIGHT, Math.round(panesHeight * w / totalWeight))]));
    const volumeHeight = heightOf.get("volume") ?? 0;
    const indicatorHeights = indicatorPanes.map((c) => heightOf.get(c.id));
    const mainHeight = Math.max(MIN_PANE_HEIGHT, panesHeight - volumeHeight - indicatorHeights.reduce((a, b) => a + b, 0));
    this.mainScale.height = mainHeight;
    this.volumeScale.height = volumeHeight;
    const drawable = (config) => {
      const { fill, ...out } = this.indicators.output(config, bars, this.dataVersion);
      if (config.visible === false) return { ...out, series: [] };
      const series = out.series.filter((x) => x.visible);
      const shown = (key) => series.some((x) => x.key === key);
      return fill && shown(fill.upper) && shown(fill.lower) ? { ...out, series, fill } : { ...out, series };
    };
    const overlays = this.indicators.overlays.map((config) => ({ config, output: drawable(config) }));
    const mode = this.compares.size > 0 ? "percent" : this.settingsValue.priceScale;
    if (this.mainScale.mode !== mode) {
      this.mainScale.mode = mode;
      this.mainScale.autoScale = true;
    }
    let compareOverlays = [];
    this.countdownLabel = this.countdownText();
    const subPanes = indicatorPanes.map((config) => {
      const scale = this.indicatorScale(config.id);
      scale.height = heightOf.get(config.id);
      return { config, scale, output: drawable(config) };
    });
    const indicatorFormat = (output) => {
      const precision = output.precision ?? this.pricePrecision;
      return (v) => formatPrice(v, precision);
    };
    const tickFormat = (ticks, output) => {
      const step = ticks.length > 1 ? Math.abs(ticks[1] - ticks[0]) : 1;
      const decimals = Math.min(output.precision ?? this.pricePrecision, decimalsOf(step));
      return (v) => formatPrice(v, decimals);
    };
    const fontFamily = this.colors.fontFamily(this.theme.fontFamily);
    const font = `${this.theme.fontSize}px ${fontFamily}`;
    const ctx = this.mainLayer.ctx;
    ctx.font = font;
    let range = { from: 0, to: -1 };
    let highLow = null;
    let priceTicks = [];
    let subTicks = [];
    for (let pass = 0; pass < 3; pass++) {
      this.timeScale.width = Math.max(0, width - this.priceAxisWidth);
      this.timeScale.clamp();
      range = this.timeScale.visibleRange();
      this.percentBaseIndex = Math.max(0, range.from);
      compareOverlays = this.compareOverlays(this.percentBaseIndex);
      highLow = this.autoScale(range, [...overlays.map((o) => o.output), ...compareOverlays]);
      for (const pane of subPanes) this.autoScaleIndicator(pane.scale, pane.output, range);
      priceTicks = this.mainTicks(mainHeight);
      subTicks = subPanes.map((p) => {
        const [lo, hi] = p.output.range ?? [p.scale.yToPrice(p.scale.height), p.scale.yToPrice(0)];
        return niceTicks(lo, hi, Math.max(1, Math.floor(p.scale.height / 36)));
      });
      let labelWidth = 0;
      const measure = (text) => labelWidth = Math.max(labelWidth, ctx.measureText(text).width);
      const last = this.store.last();
      const tickLabel = this.mainTickFormat(priceTicks);
      for (const v of priceTicks) measure(tickLabel(v));
      if (last) measure(this.mainValueFormat()(last.close));
      if (this.countdownLabel) measure(this.countdownLabel);
      subPanes.forEach((p, i) => subTicks[i].forEach((v) => measure(tickFormat(subTicks[i], p.output)(v))));
      const needed = Math.max(MIN_PRICE_AXIS_WIDTH, Math.ceil((labelWidth + 20) / 8) * 8);
      if (needed === this.priceAxisWidth) break;
      this.priceAxisWidth = needed;
    }
    const plotWidth = this.timeScale.width;
    const panes = [
      {
        id: "main",
        kind: "main",
        top: 0,
        height: mainHeight,
        scale: this.mainScale,
        ticks: priceTicks,
        format: this.mainValueFormat(),
        tickFormat: this.mainTickFormat(priceTicks)
      }
    ];
    let top = mainHeight;
    if (volumeHeight > 0) {
      panes.push({
        id: "volume",
        kind: "volume",
        top,
        height: volumeHeight,
        scale: this.volumeScale,
        ticks: [],
        format: (v) => formatCompact(Math.max(0, v), this.locale)
      });
      top += volumeHeight;
    }
    subPanes.forEach((p, i) => {
      panes.push({
        id: p.config.id,
        kind: "indicator",
        top,
        height: p.scale.height,
        scale: p.scale,
        ticks: subTicks[i],
        format: indicatorFormat(p.output),
        tickFormat: tickFormat(subTicks[i], p.output),
        indicator: p.output
      });
      top += p.scale.height;
    });
    return {
      width,
      height,
      plotWidth,
      panesHeight,
      timeAxisHeight: TIME_AXIS_HEIGHT,
      panes,
      range,
      priceTicks,
      timeTicks: computeTimeTicks(this.store.bars, this.timeScale, this.formatter, TIME_LABEL_MIN_GAP),
      highLow,
      settings: this.settingsValue,
      overlays: [...overlays.map((o) => o.output), ...compareOverlays],
      palette: this.resolvePalette(),
      font,
      radius: this.theme.radius,
      countdown: this.countdownLabel
    };
  }
  /** Price-pane tick values for the current axis mode. */
  mainTicks(height) {
    const s = this.mainScale;
    const lo = s.yToPrice(height);
    const hi = s.yToPrice(0);
    const count = Math.max(2, Math.floor(height / PRICE_TICK_SPACING));
    const minStep = resolveTickSize(this.tickSize, (lo + hi) / 2);
    if (s.mode === "log") return logTicks(s, PRICE_TICK_SPACING, minStep);
    if (s.mode === "percent") {
      const base = this.percentBase();
      const pct = (p) => (p / base - 1) * 100;
      return niceTicks(pct(lo), pct(hi), count).map((t) => base * (1 + t / 100));
    }
    return niceTicks(lo, hi, count, minStep);
  }
  percentBase() {
    return this.store.at(this.percentBaseIndex)?.close || 1;
  }
  /** Price-axis tick labels: prices, or "+2.5%" on a % axis (decimals follow the step). */
  mainTickFormat(ticks) {
    if (this.mainScale.mode !== "percent") return (v) => formatPrice(v, this.pricePrecision);
    const base = this.percentBase();
    const step = ticks.length > 1 ? Math.abs(ticks[1] - ticks[0]) / base * 100 : 1;
    const decimals = Math.min(2, decimalsOf(Number(step.toPrecision(6))));
    return (v) => formatPercent((v / base - 1) * 100, decimals);
  }
  /** Crosshair and last-price label of the price pane. */
  mainValueFormat() {
    if (this.mainScale.mode !== "percent") return (v) => formatPrice(roundToTick(v, this.tickSize), this.pricePrecision);
    const base = this.percentBase();
    return (v) => formatPercent((v / base - 1) * 100, 2);
  }
  /** Time left in the last bar, when it's still forming (null otherwise). */
  countdownText(now = Date.now()) {
    const s = this.settingsValue;
    const last = this.store.last();
    const info = this.symbol;
    if (!s.countdown || !s.lastPriceLine || this.replayState || !this.resolution || !info || !last) return null;
    let end = null;
    if (isIntradayResolution(this.resolution)) {
      end = last.time + resolutionToMs(this.resolution);
    } else if (resolutionToMs(this.resolution) === DAY_MS) {
      if (info.session.trim().toLowerCase() === "24x7") end = last.time + DAY_MS;
      else {
        const status = sessionStatus(info.session, info.timezone, now);
        end = status.open && now - last.time < DAY_MS ? status.nextChange : null;
      }
    }
    return end !== null && end > now ? formatCountdown(end - now) : null;
  }
  /** Auto-scales the price pane to visible candles and overlay indicators; returns the candle extremes. */
  autoScale(range, overlays) {
    const bars = this.store.bars;
    let high = -Infinity;
    let low = Infinity;
    let highIndex = -1;
    let lowIndex = -1;
    let maxVolume = 0;
    for (let i = range.from; i <= range.to; i++) {
      const bar = bars[i];
      if (bar.high > high) {
        high = bar.high;
        highIndex = i;
      }
      if (bar.low < low) {
        low = bar.low;
        lowIndex = i;
      }
      if (bar.volume && bar.volume > maxVolume) maxVolume = bar.volume;
    }
    if (this.mainScale.autoScale && highIndex >= 0) {
      let min = low;
      let max = high;
      for (const output of overlays) {
        for (const series of output.series) {
          const shift = series.shift ?? 0;
          for (let i = range.from; i <= range.to; i++) {
            const v = series.values[i - shift];
            if (v < min) min = v;
            if (v > max) max = v;
          }
        }
      }
      this.mainScale.setRange(min, max);
    }
    if (this.volumeScale.autoScale) this.volumeScale.setRange(0, maxVolume || 1);
    return highIndex >= 0 ? { highIndex, lowIndex } : null;
  }
  autoScaleIndicator(scale, output, range) {
    if (!scale.autoScale) return;
    if (output.range) {
      scale.setRange(output.range[0], output.range[1]);
      return;
    }
    let min = Infinity;
    let max = -Infinity;
    for (const series of output.series) {
      if (series.kind === "histogram") {
        min = Math.min(min, 0);
        max = Math.max(max, 0);
      }
      const shift = series.shift ?? 0;
      for (let i = range.from; i <= range.to; i++) {
        const v = series.values[i - shift];
        if (v < min) min = v;
        if (v > max) max = v;
      }
    }
    if (Number.isFinite(min) && Number.isFinite(max)) scale.setRange(min, max);
    else scale.setRange(0, 1);
  }
  resolvePalette() {
    const t = this.theme;
    const s = this.settingsValue;
    const c = (v) => this.colors.color(v);
    const muted = s.textColor && /^#[0-9a-f]{6}$/i.test(s.textColor) ? `${s.textColor}99` : null;
    return {
      background: c(s.background ?? t.background),
      text: c(s.textColor ?? t.text),
      textSecondary: c(muted ?? t.textSecondary),
      grid: c(s.gridColor ?? t.grid),
      border: c(s.gridColor ?? t.border),
      crosshair: c(muted ?? t.crosshair),
      up: c(this.settingsValue.upColor ?? t.up),
      down: c(this.settingsValue.downColor ?? t.down),
      accent: c(t.accent)
    };
  }
  isIntraday() {
    if (this.resolution) return isIntradayResolution(this.resolution);
    const bars = this.store.bars;
    let minGap = Infinity;
    for (let i = 1; i < Math.min(bars.length, 20); i++) minGap = Math.min(minGap, bars[i].time - bars[i - 1].time);
    return minGap < DAY_MS;
  }
  afterFrame() {
    const layout = this.layout;
    const layoutKey = `${layout.width}:${layout.height}:${layout.plotWidth}:${layout.panesHeight}:${layout.panes.map((p) => `${p.id}@${p.top}`).join(",")}`;
    if (layoutKey !== this.lastLayoutKey) {
      this.lastLayoutKey = layoutKey;
      this.emitter.emit("layoutChange", layout);
    }
    if (this.dataVersion !== this.emittedDataVersion) {
      this.emittedDataVersion = this.dataVersion;
      this.emitter.emit("dataChange", { last: this.store.last() });
    }
    const range = this.timeScale.visibleRange();
    const key = `${range.from}:${range.to}`;
    if (key !== this.lastRangeKey) {
      this.lastRangeKey = key;
      this.emitter.emit("visibleRangeChange", range);
    }
    if (this.store.length > 0 && this.timeScale.xToIndexFloat(0) < HISTORY_TRIGGER_BARS) this.requestHistory();
  }
  requestHistory() {
    const oldest = this.store.first();
    if (!oldest || this.loadingHistory || this.noMoreHistory || oldest.time === this.historyRequestedFor) return;
    if (this.symbolLoading) return;
    this.historyRequestedFor = oldest.time;
    const feed = this.datafeed;
    if (!feed || !this.symbol || !this.resolution) {
      this.emitter.emit("needHistory", { oldestTime: oldest.time });
      return;
    }
    const token = this.loadToken;
    const request = ++this.historyRequest;
    const current = () => token === this.loadToken && request === this.historyRequest;
    this.loadingHistory = true;
    const to = oldest.time - 1;
    feed.getBars(this.symbol, this.resolution, {
      from: to - resolutionToMs(this.resolution) * this.historyBatchSize,
      to,
      countBack: this.historyBatchSize
    }).then((result) => {
      if (!current()) return;
      this.prependData(result.bars, { noMoreData: result.noMoreData || result.bars.length === 0 });
      const first = this.store.first();
      if (first) void this.tradingSync.loadOlder(first.time);
      for (const entry of this.compares.values()) void this.loadOlderCompare(entry);
    }).catch((error) => this.emitter.emit("error", error)).finally(() => {
      if (current()) this.loadingHistory = false;
    });
  }
  // ── Crosshair ──────────────────────────────────────────────────────
  resolveCrosshair(frame) {
    const ch = this.crosshair;
    const bars = this.store.bars;
    if (bars.length === 0) return null;
    const outside = ch?.source === "mouse" && (ch.x < 0 || ch.x > frame.plotWidth || ch.y < 0 || ch.y > frame.panesHeight);
    if (!ch || outside) return this.syncedTime === null ? null : this.resolveSyncedCrosshair(this.syncedTime);
    const index = Math.min(bars.length - 1, Math.max(0, this.timeScale.xToIndex(ch.x)));
    const bar = bars[index];
    const x = this.timeScale.indexToX(index);
    const y = ch.source === "touch" ? this.mainScale.priceToY(bar.close) : ch.y;
    const pane = this.paneAt(frame, y);
    const raw = pane.scale.yToPrice(y - pane.top);
    const value = pane.kind === "main" ? roundToTick(raw, this.tickSize) : raw;
    return { index, time: bar.time, bar, value, pane: pane.id, x, y, source: ch.source };
  }
  /** The bar containing `time`, as a crosshair without a price (nothing when it's off the data). */
  resolveSyncedCrosshair(time) {
    const bars = this.store.bars;
    const last = bars[bars.length - 1];
    if (time < bars[0].time || time >= last.time + this.barInterval()) return null;
    const index = this.store.indexAtOrBefore(time);
    const bar = bars[index];
    if (!bar) return null;
    const x = this.timeScale.indexToX(index);
    if (x < 0 || x > this.timeScale.width) return null;
    return { index, time: bar.time, bar, value: bar.close, pane: "main", x, y: -1, source: "sync" };
  }
  paneAt(frame, y) {
    return frame.panes.find((p) => y >= p.top && y < p.top + p.height) ?? frame.panes[frame.panes.length - 1];
  }
  setTooltip(key) {
    if (key === this.tooltipKey) return;
    this.tooltipKey = key;
    this.invalidate(false);
  }
  executionTooltip() {
    const g = this.tooltipKey ? this.trading.executionGroup(this.tooltipKey) : void 0;
    if (!g) return null;
    const t = TOOLTIP_LABELS[this.locale];
    const side = g.kind === "liquidation" ? t.liquidation : g.side === "buy" ? t.buy : t.sell;
    const lines = [
      g.count > 1 ? `${side} ${t.fills(g.count)}` : side,
      `${g.count > 1 ? t.avg : t.price} ${formatPrice(roundToTick(g.averagePrice, this.tickSize), this.pricePrecision)}`
    ];
    if (g.quantity > 0) lines.push(`${t.qty} ${Number(g.quantity.toFixed(8))}`);
    lines.push(this.formatter.crosshairLabel(g.time, true));
    return { x: g.x, y: g.y, side: g.kind === "liquidation" ? "sell" : g.side, lines };
  }
  emitCrosshair(info) {
    const key = info ? `${info.index}|${info.value}|${info.bar.close}|${info.bar.volume ?? ""}` : "";
    if (key === this.lastCrosshairKey) return;
    this.lastCrosshairKey = key;
    this.emitter.emit("crosshairMove", info);
  }
  // ── Interaction host ───────────────────────────────────────────────
  paneScale(pane) {
    if (pane === "main") return this.mainScale;
    if (pane === "volume") return this.volumeScale;
    return this.indicatorScales.get(pane) ?? this.mainScale;
  }
  createInteractionHost() {
    return {
      hitTest: (x, y) => {
        const f = this.frame;
        if (!f) return { area: "none", pane: null };
        if (y >= f.panesHeight) return { area: x < f.plotWidth ? "timeAxis" : "none", pane: null };
        const border = f.panes.findIndex((p, i) => i > 0 && Math.abs(y - p.top) <= PANE_BORDER_GRAB);
        if (border > 0) return { area: "paneBorder", pane: f.panes[border].id, border };
        return { area: x >= f.plotWidth ? "priceAxis" : "plot", pane: this.paneAt(f, y).id };
      },
      plotWidth: () => this.timeScale.width,
      setCrosshair: (x, y, source) => {
        this.crosshair = { x, y, source };
        this.invalidate(false);
      },
      clearCrosshair: () => {
        if (!this.crosshair) return;
        this.crosshair = null;
        this.invalidate(false);
      },
      panTime: (dx) => {
        this.timeScale.pan(dx);
        this.invalidate();
      },
      zoomTime: (anchorX, factor) => {
        this.timeScale.zoom(anchorX, factor);
        this.invalidate();
      },
      panPrice: (pane, dy) => {
        const scale = this.paneScale(pane);
        if (scale.autoScale || pane !== "main") return;
        scale.pan(dy);
        this.invalidate();
      },
      scalePrice: (pane, factor) => {
        this.paneScale(pane).zoom(factor);
        this.invalidate();
      },
      resetPriceScale: (pane) => {
        this.paneScale(pane).autoScale = true;
        this.invalidate();
      },
      resetView: () => this.resetView(),
      resizePane: (index, dy) => this.resizePane(index, dy),
      contextMenu: (x, y) => {
        const f = this.frame;
        if (!this.emitter.has("contextMenu") || !f || x > f.plotWidth || y > f.panesHeight) return false;
        const pane = this.paneAt(f, y);
        const index = this.timeScale.xToIndex(x);
        const bar = this.store.at(index);
        this.emitter.emit("contextMenu", {
          x,
          y,
          pane: pane.id,
          price: pane.kind === "main" ? roundToTick(this.mainScale.yToPrice(y), this.tickSize) : null,
          time: bar?.time ?? null
        });
        return true;
      },
      resetPaneSizes: () => this.resetPaneSizes(),
      toolActive: () => (this.drawings.tool !== null || this.replaySelecting) && this.store.length > 0,
      hitObject: (x, y, touch) => {
        if (y > this.mainScale.height) return null;
        const tolerance = touch ? HIT_TOLERANCE.touch : HIT_TOLERANCE.mouse;
        return this.trading.hitTest((p) => this.mainScale.priceToY(p), x, y, tolerance) ?? this.drawings.hitTest(this.paneCoords(), x, y, tolerance);
      },
      drawAt: (x, y) => {
        if (this.replaySelecting) {
          const bars = this.store.bars;
          this.startReplay(bars[Math.min(bars.length - 1, Math.max(0, this.timeScale.xToIndex(x)))].time);
          return;
        }
        this.drawings.createAt(this.paneCoords(), x, y);
      },
      drawPreview: (x, y) => {
        if (!this.replaySelecting) this.drawings.previewAt(this.paneCoords(), x, y);
      },
      drawRelease: (x, y, moved) => {
        if (!this.replaySelecting) this.drawings.releaseAt(this.paneCoords(), x, y, moved);
      },
      objectDown: (hit, x, y) => {
        this.objectDrag = hit;
        if (hit.kind === "drawing") this.drawings.beginDrag(this.paneCoords(), hit.id, hit.part, x, y);
        else if (hit.kind === "execution") this.setTooltip(hit.key);
        else if (hit.part === "line") this.trading.beginDrag(hit.id);
      },
      objectMove: (x, y) => {
        const hit = this.objectDrag;
        if (!hit) return;
        if (hit.kind === "drawing") this.drawings.dragTo(this.paneCoords(), x, y);
        else if (hit.kind === "order" && hit.part === "line") {
          this.trading.dragTo(roundToTick(this.mainScale.yToPrice(y), this.tickSize));
        }
      },
      objectUp: (moved) => {
        const hit = this.objectDrag;
        this.objectDrag = null;
        if (!hit) return;
        if (hit.kind === "drawing") this.drawings.endDrag(moved);
        else if (hit.kind === "order" && hit.part === "line") this.trading.endDrag();
        else if (hit.kind === "order" && !moved) this.trading.cancel(hit.id);
      },
      hoverObject: (hit) => this.setTooltip(hit?.kind === "execution" ? hit.key : null),
      clearSelection: () => {
        this.drawings.select(null);
        this.setTooltip(null);
      }
    };
  }
  /** Esc cancels a drawing in progress or deselects; Delete/Backspace removes the selected drawing. */
  observeKeyboard() {
    const onKeyDown = (e) => {
      const target = e.target;
      if (target && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))) return;
      if (e.key === "Escape" && this.replaySelecting) {
        this.setReplaySelecting(false);
      } else if (e.key === "Escape" && (this.drawings.tool || this.drawings.selectedId)) {
        this.drawings.cancel();
      } else if ((e.key === "Delete" || e.key === "Backspace") && this.drawings.selectedId) {
        e.preventDefault();
        this.drawings.remove(this.drawings.selectedId);
      }
    };
    document.addEventListener("keydown", onKeyDown);
    this.cleanups.push(() => document.removeEventListener("keydown", onKeyDown));
  }
  // ── Environment observers ──────────────────────────────────────────
  /** Repaints when the bar-close countdown ticks over (once a second, only while it shows or changes). */
  observeCountdown() {
    const timer = setInterval(() => {
      if (this.destroyed || document.hidden) return;
      if (this.countdownText() !== this.countdownLabel) this.invalidate();
    }, 1e3);
    this.cleanups.push(() => clearInterval(timer));
  }
  observeSize() {
    const apply = (width, height) => {
      const dpr = window.devicePixelRatio || 1;
      if (width === this.size.width && height === this.size.height && dpr === this.size.dpr) return;
      this.size = { width, height, dpr };
      this.mainLayer.resize(width, height, dpr);
      this.overlayLayer.resize(width, height, dpr);
      this.invalidate();
    };
    const ro = new ResizeObserver((entries) => {
      const rect2 = entries[entries.length - 1]?.contentRect;
      if (rect2) apply(Math.floor(rect2.width), Math.floor(rect2.height));
    });
    ro.observe(this.root);
    this.cleanups.push(() => ro.disconnect());
    let mq = null;
    const onDprChange = () => {
      apply(this.size.width, this.size.height);
      watchDpr();
    };
    const watchDpr = () => {
      mq?.removeEventListener("change", onDprChange);
      mq = matchMedia(`(resolution: ${window.devicePixelRatio || 1}dppx)`);
      mq.addEventListener("change", onDprChange);
    };
    watchDpr();
    this.cleanups.push(() => mq?.removeEventListener("change", onDprChange));
    const rect = this.root.getBoundingClientRect();
    apply(Math.floor(rect.width), Math.floor(rect.height));
  }
  /** Theme values using `var(--x)` follow the host page's dark-mode / theme switches automatically. */
  observeThemeVariables() {
    const onChange = () => {
      const t = this.theme;
      if (!Object.values(t).some((v) => typeof v === "string" && v.includes("var("))) return;
      this.refreshTheme();
    };
    const mo = new MutationObserver(onChange);
    for (const el of [document.documentElement, document.body]) {
      if (el) mo.observe(el, { attributes: true, attributeFilter: ["class", "style", "data-theme"] });
    }
    const mq = matchMedia("(prefers-color-scheme: dark)");
    mq.addEventListener("change", onChange);
    this.cleanups.push(() => {
      mo.disconnect();
      mq.removeEventListener("change", onChange);
    });
  }
};

// src/charts/src/charts/funnest-chart-runtime.js
var BAR_FIELDS = ["time", "open", "high", "low", "close"];
var TIME_SCALE_BUDGET = Object.freeze({ minBarSpacing: 0.5, maxBarSpacing: 64, maxBars: 6e3 });
var NATIVE_TIME_LABEL_MIN_GAP = 72;
function sourceInterval(bars) {
  let interval = Infinity;
  for (let index = Math.max(1, bars.length - 20); index < bars.length; index++) interval = Math.min(interval, bars[index].time - bars[index - 1].time);
  return Number.isFinite(interval) && interval > 0 ? interval : 6e4;
}
function calendarPartsAt(time, timezone) {
  const values = Object.fromEntries(new Intl.DateTimeFormat("en-US-u-ca-gregory-nu-latn", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(time)).map((part) => [part.type, part.value]));
  return { year: Number(values.year), month: Number(values.month), day: Number(values.day) };
}
function zonedMonthStart(year, month, timezone) {
  const target = Date.UTC(year, month - 1, 1), formatter = new Intl.DateTimeFormat("en-US-u-ca-gregory-nu-latn", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" });
  let epoch = target;
  for (let pass = 0; pass < 5; pass++) {
    const parts = Object.fromEntries(formatter.formatToParts(new Date(epoch)).map((part) => [part.type, part.value]));
    const projected = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute), Number(parts.second));
    const correction = target - projected;
    if (!correction) break;
    epoch += correction;
  }
  const check = calendarPartsAt(epoch, timezone);
  if (check.year !== year || check.month !== month || check.day !== 1) throw new RangeError(`Cannot resolve ${year}-${String(month).padStart(2, "0")}-01 in ${timezone}`);
  return epoch;
}
function futureMonthLabel(year, month) {
  return `${year}-${String(month).padStart(2, "0")}`;
}
function futureDayLabel(time, timezone, locale) {
  const { year, month, day } = calendarPartsAt(time, timezone), sep = locale === "ko" ? "." : "-";
  return `${year}${sep}${String(month).padStart(2, "0")}${sep}${String(day).padStart(2, "0")}`;
}
function sourceIndexAtTime(bars, time, interval) {
  if (!bars.length) return NaN;
  const last = bars.length - 1;
  if (time <= bars[0].time) return (time - bars[0].time) / interval;
  if (time >= bars[last].time) return last + (time - bars[last].time) / interval;
  let low = 0, high = last;
  while (low + 1 < high) {
    const middle = low + high >> 1;
    if (bars[middle].time <= time) low = middle;
    else high = middle;
  }
  const left = bars[low].time, right = bars[high].time;
  return low + (right > left ? (time - left) / (right - left) : 0);
}
function sourceRangeSpan(bars, range) {
  if (!bars.length || !range || !Number.isFinite(range.from) || !Number.isFinite(range.to) || !(range.to > range.from)) return 0;
  const interval = sourceInterval(bars);
  return Math.max(1, sourceIndexAtTime(bars, range.to, interval) - sourceIndexAtTime(bars, range.from, interval));
}
var DEFAULT_THEME = Object.freeze({
  background: "var(--bg, #17171c)",
  surface: "var(--surface-raised, #202027)",
  text: "var(--text, #e4e4e5)",
  textSecondary: "var(--muted, #7e7e87)",
  grid: "var(--border, #2c2c35)",
  border: "var(--border, #2c2c35)",
  // Native last-price badges use white text; keep both direction colors at >=4.5:1.
  crosshair: "var(--muted, #7e7e87)",
  up: "#d53544",
  down: "#2e71d4",
  accent: "var(--accent-ink, #74a7ee)",
  fontFamily: "var(--font, sans-serif)",
  fontSize: 12,
  radius: 0
});
function validateFunnestBars(bars) {
  if (!Array.isArray(bars)) throw new TypeError("Funnest chart data must be an array of observed bars");
  let previous = -Infinity;
  return bars.map((bar, index) => {
    if (!bar || BAR_FIELDS.some((key) => !Number.isFinite(bar[key]))) throw new TypeError(`Invalid OHLC bar at index ${index}`);
    if (!Number.isSafeInteger(bar.time) || bar.time <= previous) throw new RangeError(`Bar times must be strictly increasing UTC milliseconds (index ${index})`);
    if (bar.high < Math.max(bar.open, bar.close, bar.low) || bar.low > Math.min(bar.open, bar.close, bar.high)) throw new RangeError(`Invalid OHLC envelope at index ${index}`);
    if (bar.volume !== void 0 && (!Number.isFinite(bar.volume) || bar.volume < 0)) throw new RangeError(`Invalid volume at index ${index}`);
    previous = bar.time;
    return bar;
  });
}
function mapCloseOnlyToFunnestLine(points) {
  if (!Array.isArray(points)) throw new TypeError("Close-only series must be an array");
  let previous = -Infinity;
  const observations = points.map((point, index) => {
    if (!point || !Number.isSafeInteger(point.time) || point.time <= previous || !Number.isFinite(point.close)) throw new TypeError(`Invalid close-only observation at index ${index}`);
    previous = point.time;
    return { time: point.time, close: point.close };
  });
  const lineGeometry = observations.map(({ time, close }) => ({ time, open: close, high: close, low: close, close }));
  return { observations, lineGeometry };
}
var invertedScaleMethods = /* @__PURE__ */ new WeakMap();
var invertedCharts = /* @__PURE__ */ new WeakSet();
function setFunnestPriceScaleInverted(chart, inverted) {
  const scale = chart?.mainScale;
  if (!scale || typeof scale.priceToY !== "function" || typeof scale.yToPrice !== "function" || typeof scale.pan !== "function") throw new TypeError("Pinned Funnest main price scale is unavailable");
  const previous = invertedScaleMethods.get(scale);
  if (!inverted) {
    if (previous) {
      scale.priceToY = previous.priceToY;
      scale.yToPrice = previous.yToPrice;
      scale.pan = previous.pan;
      invertedScaleMethods.delete(scale);
      chart.invalidate?.();
    }
    invertedCharts.delete(chart);
    return false;
  }
  if (previous) {
    invertedCharts.add(chart);
    return true;
  }
  const priceToY = scale.priceToY.bind(scale), yToPrice = scale.yToPrice.bind(scale), pan = scale.pan.bind(scale);
  const reflect = (y) => {
    const height = Number(scale.height) || 0, available = Math.max(height / 2, height - (Number(scale.insetTop) || 0));
    const top = height - available + available * scale.margins.top;
    const innerHeight = Math.max(1, available * (1 - scale.margins.top - scale.margins.bottom));
    return top + innerHeight - y;
  };
  scale.priceToY = (price) => reflect(priceToY(price));
  scale.yToPrice = (y) => yToPrice(reflect(y));
  scale.pan = (delta) => pan(-delta);
  invertedScaleMethods.set(scale, { priceToY, yToPrice, pan });
  invertedCharts.add(chart);
  chart.invalidate?.();
  return true;
}
function setFunnestPriceExtrema(chart, domain) {
  const scale = chart?.mainScale;
  if (!scale || typeof scale.setRange !== "function" || typeof chart.invalidate !== "function" || typeof scale.autoScale !== "boolean") {
    throw new TypeError("Funnest 0.6.22 manual price-scale extension is unavailable");
  }
  if (domain === null || domain === void 0) {
    scale.autoScale = true;
    chart.invalidate();
    return;
  }
  const { min, max } = domain;
  if (!Number.isFinite(min) || !Number.isFinite(max) || !(max > min)) throw new RangeError("A finite increasing forecast-aware price domain is required");
  scale.autoScale = false;
  scale.setRange(min, max);
  chart.invalidate();
}
function holdFunnestPriceAxisWidth(chart, viewerOwnsViewport) {
  if (!chart || typeof chart.priceAxisWidth !== "number") throw new TypeError("Funnest 0.6.22 price-axis width field is unavailable");
  if (typeof viewerOwnsViewport !== "function") throw new TypeError("A viewport-ownership predicate is required");
  let held = chart.priceAxisWidth;
  Object.defineProperty(chart, "priceAxisWidth", { configurable: true, enumerable: true, get: () => held, set(next) {
    held = viewerOwnsViewport() ? Math.max(held, next) : next;
  } });
}
function inspectAtlasFunnestChart({ chart, host, source = {}, state = "unknown", sourceMode = "ohlc", observations = [], crosshair = null, crosshairEventSequence = 0 } = {}) {
  if (!chart || !host?.querySelectorAll) throw new TypeError("Funnest chart and mounted host are required for inspection");
  const canvases = [...host.querySelectorAll("canvas")].map((canvas) => {
    const width = Number(canvas.width) || 0, height = Number(canvas.height) || 0;
    let readable = false, opaquePixels = 0, sampledColors = 0;
    try {
      const data = canvas.getContext("2d")?.getImageData(0, 0, width, height).data;
      if (data && width && height) {
        readable = true;
        const colors = /* @__PURE__ */ new Set(), step = Math.max(4, Math.floor(data.length / 2e4 / 4) * 4);
        for (let i = 0; i < data.length; i += step) {
          if (data[i + 3] > 0) opaquePixels++;
          colors.add(`${data[i]},${data[i + 1]},${data[i + 2]},${data[i + 3]}`);
        }
        sampledColors = colors.size;
      }
    } catch {
    }
    return { width, height, visible: Boolean(canvas.isConnected && width && height && (typeof canvas.checkVisibility !== "function" || canvas.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true }))), readable, opaquePixels, sampledColors };
  });
  const bars = [...chart.bars || []].map((bar) => ({ time: bar.time, open: bar.open, high: bar.high, low: bar.low, close: bar.close, ...bar.volume === void 0 ? {} : { volume: bar.volume } }));
  const range = chart.getVisibleTimeRange?.() ?? null, layout = chart.layout ?? null;
  const visibleCanvases = canvases.filter((canvas) => canvas.visible);
  const painted = state === "ready" && bars.length > 0 && Number(layout?.plotWidth) > 0 && Number(layout?.panesHeight) > 0 && visibleCanvases.some((canvas) => canvas.readable && canvas.opaquePixels > 0 && canvas.sampledColors > 1);
  const legacy = [...host.parentElement?.querySelectorAll?.("svg") || []].filter((svg) => !host.contains(svg));
  const legacyPriceNodes = legacy.reduce((total, svg) => total + svg.querySelectorAll(".market-close-line,.market-candle,.market-forecast-line,.price-line,.candle").length, 0);
  return structuredClone({
    engine: "funnest",
    version: "0.6.22",
    state,
    painted,
    source,
    sourceMode,
    symbol: host.dataset.symbol || null,
    currency: host.dataset.currency || null,
    timeUnit: "UTC milliseconds",
    chartType: chart.type ?? null,
    settings: chart.settings ?? null,
    observations: sourceMode === "close-only" ? observations.map((point) => ({ time: point.time, close: point.close })) : bars,
    engineBars: bars,
    crosshair,
    crosshairEventSequence,
    internalLineGeometry: sourceMode === "close-only" ? bars : null,
    range,
    layout,
    inverted: invertedCharts.has(chart),
    futureDateTicks: host.getAtlasFunnestFutureDateTicks?.() ?? [],
    canvases,
    legacy: { svgCount: legacy.length, priceNodes: legacyPriceNodes }
  });
}
function exposeAtlasFunnestSnapshot(host, readSnapshot) {
  if (!host || typeof readSnapshot !== "function") throw new TypeError("A chart host and snapshot reader are required");
  const read = () => structuredClone(readSnapshot());
  Object.defineProperty(host, "getAtlasFunnestSnapshot", { configurable: true, enumerable: false, writable: false, value: read });
  return () => {
    if (Object.getOwnPropertyDescriptor(host, "getAtlasFunnestSnapshot")?.value === read) delete host.getAtlasFunnestSnapshot;
  };
}
function mountAtlasFunnestChart(container, options = {}) {
  if (!container?.ownerDocument || !container.isConnected) throw new TypeError("A connected chart host is required");
  const {
    bars = [],
    symbol = "BTCUSD",
    currency = "USD",
    timezone = "Asia/Seoul",
    locale = "ko",
    precision = 2,
    tickSize = 0,
    chartType = "candles",
    scale = "normal",
    invertScale = false,
    theme = {},
    range = null,
    source = {},
    sourceMode = "ohlc",
    volumeByTime = null,
    volumeSource = null,
    accessibleName = `${symbol} \uC2E4\uC81C \uAD00\uCE21 \uAC00\uACA9 \uCC28\uD2B8`,
    onCrosshair = () => {
    },
    onViewport = () => {
    },
    onError = () => {
    },
    volume = true
  } = options;
  if (!["candles", "line", "area"].includes(chartType)) throw new RangeError(`Unsupported Funnest chart type: ${chartType}`);
  if (!["ohlc", "close-only"].includes(sourceMode) || sourceMode === "close-only" && chartType !== "line") throw new RangeError("Close-only market sources require line mode and cannot be presented as OHLC candles");
  if (!["normal", "log", "percent"].includes(scale)) throw new RangeError(`Unsupported Funnest scale: ${scale}`);
  if (typeof onCrosshair !== "function" || typeof onViewport !== "function" || typeof onError !== "function") throw new TypeError("Chart event callbacks must be functions");
  const host = container.ownerDocument.createElement("div");
  host.className = "atlas-funnest-canvas";
  host.dataset.atlasChartEngine = "funnest";
  host.setAttribute("role", "group");
  host.setAttribute("aria-label", accessibleName);
  host.dataset.currency = currency;
  host.dataset.symbol = symbol;
  host.tabIndex = 0;
  Object.assign(host.style, { position: "absolute", inset: "0", minWidth: "0", minHeight: "0" });
  container.appendChild(host);
  const status = container.ownerDocument.createElement("span");
  status.className = "atlas-funnest-status";
  status.setAttribute("role", "status");
  status.setAttribute("aria-live", "polite");
  status.style.cssText = "position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0";
  container.appendChild(status);
  const showVolume = Boolean(volume && (sourceMode === "ohlc" || volumeByTime !== null));
  const chart = createChart(host, {
    locale,
    displayTimezone: timezone,
    pricePrecision: precision,
    tickSize,
    volume: showVolume,
    theme: { ...DEFAULT_THEME, ...theme },
    settings: { volume: showVolume, lastPriceLine: true, priceScale: scale },
    timeScale: { minBarSpacing: TIME_SCALE_BUDGET.minBarSpacing, maxBarSpacing: TIME_SCALE_BUDGET.maxBarSpacing }
  });
  if (chart.mainScale && typeof chart.mainScale.mode === "string") chart.mainScale.mode = scale;
  const cleanups = [];
  let destroyed = false, readyPromise = null, observations = [], currentBars = [], pendingRange = range, ownedRange = range, retainedRange = range, retainedMaxSpan = 0, retainedFitException = Boolean(range), initialRangeOwned = Boolean(range), userRange = false, futureDateTicks = [], announceTimer = 0, currentInverted = Boolean(invertScale), lastCrosshair = null, crosshairEventSequence = 0;
  const volumeMap = /* @__PURE__ */ new Map();
  if (volumeByTime !== null) {
    if (!Array.isArray(volumeByTime)) throw new TypeError("Observed volume must be a time-keyed array");
    let previous = -Infinity;
    for (const row of volumeByTime) {
      if (!row || !Number.isSafeInteger(row.time) || row.time <= previous || !Number.isFinite(row.volume) || row.volume < 0) throw new TypeError("Observed volume needs strictly ordered UTC-millisecond times and nonnegative values");
      volumeMap.set(row.time, row.volume);
      previous = row.time;
    }
  }
  const mapData = (input) => {
    if (sourceMode === "close-only") {
      const mapped = mapCloseOnlyToFunnestLine(input);
      observations = mapped.observations;
      currentBars = mapped.lineGeometry.map((bar) => volumeMap.has(bar.time) ? { ...bar, volume: volumeMap.get(bar.time) } : bar);
    } else {
      observations = [];
      currentBars = validateFunnestBars(input);
    }
  };
  const configureRetainedRangeSpacing = (targetRange, plotWidth = chart.timeScale?.width) => {
    const width = Number(plotWidth);
    if (!(width > 0) || !chart.timeScale?.options) return;
    const ordinaryFloor = Math.max(TIME_SCALE_BUDGET.minBarSpacing, width / (TIME_SCALE_BUDGET.maxBars - 1));
    if (!retainedFitException || !targetRange) {
      chart.timeScale.options.minBarSpacing = ordinaryFloor;
      return;
    }
    const span = Math.max(retainedMaxSpan, sourceRangeSpan(currentBars, targetRange));
    if (!Number.isFinite(span) || !(span > 0)) {
      chart.timeScale.options.minBarSpacing = ordinaryFloor;
      return;
    }
    chart.timeScale.options.minBarSpacing = Math.min(TIME_SCALE_BUDGET.minBarSpacing, width / span);
  };
  holdFunnestPriceAxisWidth(chart, () => !initialRangeOwned);
  mapData(bars);
  chart.setData(currentBars);
  chart.setChartType(chartType);
  retainedMaxSpan = sourceRangeSpan(currentBars, retainedRange);
  setFunnestPriceScaleInverted(chart, invertScale);
  const futureDateRail = container.ownerDocument.createElement("div");
  futureDateRail.className = "atlas-funnest-future-date-rail";
  futureDateRail.dataset.atlasFunnestFutureDateRail = "true";
  futureDateRail.setAttribute("role", "group");
  futureDateRail.dataset.timezone = timezone;
  futureDateRail.setAttribute("aria-label", `\uAD00\uCE21 \uBD09 \uC774\uD6C4 \uB2EC\uB825 \uB0A0\uC9DC (${timezone})`);
  futureDateRail.style.cssText = "position:absolute;left:0;top:0;height:0;width:0;overflow:hidden;pointer-events:none;z-index:2;";
  host.appendChild(futureDateRail);
  const nativeCanvases = [...host.querySelectorAll(".fnc-chart > canvas")];
  const originalCanvasZ = nativeCanvases.map((canvas) => canvas.style.zIndex);
  if (nativeCanvases.length === 2) {
    nativeCanvases[0].style.zIndex = "1";
    nativeCanvases[1].style.zIndex = "3";
  }
  cleanups.push(() => nativeCanvases.forEach((canvas, index) => {
    canvas.style.zIndex = originalCanvasZ[index];
  }));
  const clearFutureDateTicks = () => {
    futureDateTicks = [];
    futureDateRail.replaceChildren();
  };
  const readFutureDateTicks = () => futureDateTicks.map((tick) => ({ time: tick.time, label: tick.label, x: tick.x }));
  Object.defineProperty(host, "getAtlasFunnestFutureDateTicks", { configurable: true, enumerable: false, writable: false, value: readFutureDateTicks });
  const futureDateOverlay = chart.addOverlay({
    layer: "above",
    render({ coords, painter }) {
      if (destroyed || !currentBars.length) {
        clearFutureDateTicks();
        return;
      }
      const layout = chart.layout, plotWidth = Math.min(Number(coords?.plotWidth), Number(layout?.plotWidth));
      const axisHeight = Number(layout?.timeAxisHeight), axisTop = Number(layout?.panesHeight);
      if (!(plotWidth > 0 && axisHeight > 0 && axisTop >= 0) || typeof coords?.timeToX !== "function" || typeof painter?.measure !== "function") {
        clearFutureDateTicks();
        return;
      }
      futureDateRail.style.top = `${axisTop}px`;
      futureDateRail.style.height = `${axisHeight}px`;
      futureDateRail.style.width = `${plotWidth}px`;
      futureDateRail.style.fontSize = `${Number(chart.theme?.fontSize) || 12}px`;
      futureDateRail.style.fontFamily = chart.theme?.fontFamily || "sans-serif";
      futureDateRail.style.color = chart.theme?.textSecondary || "var(--muted, #7e7e87)";
      const visible = chart.getVisibleTimeRange?.(), lastObserved = currentBars.at(-1)?.time;
      const interval = sourceInterval(currentBars);
      if (!visible || !Number.isFinite(lastObserved) || visible.to <= lastObserved + interval) {
        clearFutureDateTicks();
        return;
      }
      const observedX = coords.timeToX(lastObserved), candidates = [];
      const firstFuture = Math.max(lastObserved + interval, visible.from);
      const firstDate = calendarPartsAt(firstFuture, timezone);
      let year = firstDate.year, month = firstDate.month;
      let time = zonedMonthStart(year, month, timezone);
      if (time < firstFuture) {
        month++;
        if (month > 12) {
          month = 1;
          year++;
        }
        time = zonedMonthStart(year, month, timezone);
      }
      for (let count = 0; time <= visible.to && count < 8e3; count++) {
        if (time >= visible.from && time > lastObserved) candidates.push({ time, label: futureMonthLabel(year, month) });
        month++;
        if (month > 12) {
          month = 1;
          year++;
        }
        time = zonedMonthStart(year, month, timezone);
      }
      const accepted = [];
      for (const candidate of candidates) {
        const x = coords.timeToX(candidate.time), width = painter.measure(candidate.label);
        if (![x, width, observedX].every(Number.isFinite) || x - width / 2 < 0 || x + width / 2 > plotWidth || x - observedX < NATIVE_TIME_LABEL_MIN_GAP) continue;
        const previous = accepted.at(-1);
        if (previous && x - previous.x < Math.max(NATIVE_TIME_LABEL_MIN_GAP, (width + previous.width) / 2 + 4)) continue;
        accepted.push({ ...candidate, x, width });
      }
      if (!accepted.length) {
        let day = Math.ceil(firstFuture / 864e5) * 864e5;
        const label = futureDayLabel(day, timezone, locale), x = coords.timeToX(day), width = painter.measure(label);
        if (day <= visible.to && day > lastObserved && [x, width, observedX].every(Number.isFinite) && x - width / 2 >= 0 && x + width / 2 <= plotWidth && x - observedX >= NATIVE_TIME_LABEL_MIN_GAP) accepted.push({ time: day, label, x, width });
      }
      const keyed = new Map([...futureDateRail.children].map((node) => [node.dataset.utcDate, node]));
      const nodes = accepted.map(({ time: time2, label, x }) => {
        const key = new Date(time2).toISOString().slice(0, 10);
        const node = keyed.get(key) || container.ownerDocument.createElement("span");
        node.dataset.utcDate = key;
        node.textContent = label;
        node.style.cssText = `position:absolute;left:${x}px;top:50%;transform:translate(-50%,-50%);white-space:nowrap;font:inherit;color:inherit;pointer-events:none;`;
        return node;
      });
      futureDateRail.replaceChildren(...nodes);
      futureDateTicks = accepted.map(({ time: time2, label, x }) => Object.freeze({ time: time2, label, x }));
    }
  });
  cleanups.push(() => {
    clearFutureDateTicks();
    futureDateOverlay?.remove?.();
    if (Object.getOwnPropertyDescriptor(host, "getAtlasFunnestFutureDateTicks")?.value === readFutureDateTicks) delete host.getAtlasFunnestFutureDateTicks;
    futureDateRail.remove();
  });
  cleanups.push(chart.on("layoutChange", (layout) => {
    if (destroyed || !(layout.plotWidth > 0 && layout.panesHeight > 0)) return;
    const spacingRange = initialRangeOwned && ownedRange ? ownedRange : retainedRange || pendingRange;
    configureRetainedRangeSpacing(spacingRange, Number(chart.timeScale?.width) || Number(layout.plotWidth));
    const targetRange = initialRangeOwned && ownedRange ? ownedRange : pendingRange;
    if (!targetRange) return;
    const current = chart.getVisibleTimeRange?.();
    const tolerance = Math.max(1, sourceInterval(currentBars) * 1e-7);
    if (!current || Math.abs(current.from - targetRange.from) > tolerance || Math.abs(current.to - targetRange.to) > tolerance) {
      chart.setVisibleTimeRange(targetRange);
      pendingRange = null;
    }
  }));
  cleanups.push(chart.on("crosshairMove", (detail) => {
    if (destroyed) return;
    crosshairEventSequence++;
    lastCrosshair = detail ? {
      index: detail.index,
      time: detail.time,
      x: detail.x,
      y: detail.y,
      value: detail.value,
      pane: detail.pane,
      source: detail.source,
      bar: detail.bar ? sourceMode === "close-only" ? { time: detail.bar.time, close: detail.bar.close } : { ...detail.bar } : null
    } : null;
    const readout = sourceMode === "close-only" && detail?.bar ? { time: detail.bar.time, bar: { time: detail.bar.time, close: detail.bar.close }, value: detail.bar.close, sourceMode: "close-only" } : detail;
    onCrosshair(readout);
    clearTimeout(announceTimer);
    if (readout?.bar) announceTimer = setTimeout(() => {
      if (destroyed) return;
      const bar = readout.bar, time = new Date(bar.time).toISOString().replace("T", " ").slice(0, 16);
      status.textContent = sourceMode === "close-only" ? `${time} \xB7 \uAD00\uCE21 \uC885\uAC00 ${bar.close}` : `${time} \xB7 O ${bar.open} \xB7 H ${bar.high} \xB7 L ${bar.low} \xB7 C ${bar.close}${bar.volume === void 0 ? "" : ` \xB7 \uAC70\uB798\uB7C9 ${bar.volume}`}`;
    }, 180);
  }));
  cleanups.push(chart.on("visibleRangeChange", (detail) => {
    if (destroyed) return;
    const actual = chart.getVisibleTimeRange?.();
    if (actual && Number.isFinite(actual.from) && Number.isFinite(actual.to) && actual.to > actual.from) {
      if (!initialRangeOwned) retainedRange = actual;
      retainedMaxSpan = Math.max(retainedMaxSpan, sourceRangeSpan(currentBars, initialRangeOwned && ownedRange ? ownedRange : actual));
    }
    onViewport(detail);
  }));
  cleanups.push(chart.on("error", (error) => {
    if (!destroyed) {
      host.dataset.state = "error";
      status.textContent = "\uCC28\uD2B8 \uC5D4\uC9C4 \uC624\uB958 \xB7 \uAC00\uACA9 \uC790\uB8CC\uB97C \uD45C\uC2DC\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.";
      onError(error);
    }
  }));
  cleanups.push(chart.on("dataChange", () => {
    if (!destroyed) {
      clearFutureDateTicks();
      futureDateOverlay.redraw?.();
      host.dataset.state = currentBars.length ? "ready" : "empty";
      status.textContent = currentBars.length ? `${currentBars.length}\uAC1C ${sourceMode === "close-only" ? "\uC2E4\uC81C \uAD00\uCE21 \uC885\uAC00" : "\uC2E4\uC81C \uAD00\uCE21 \uBD09"} \xB7 ${new Date(currentBars.at(-1).time).toISOString()}` : "\uD45C\uC2DC\uD560 \uC2E4\uC81C \uAD00\uCE21 \uAC00\uACA9 \uC790\uB8CC\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4.";
    }
  }));
  host.dataset.state = currentBars.length ? "loading" : "empty";
  if (!currentBars.length) status.textContent = "\uD45C\uC2DC\uD560 \uC2E4\uC81C \uAD00\uCE21 \uAC00\uACA9 \uC790\uB8CC\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4.";
  const onKeyDown = (event) => {
    if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || event.isComposing || /^(INPUT|TEXTAREA|SELECT)$/.test(event.target?.tagName)) return;
    if (!currentBars.length) return;
    if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      event.preventDefault();
      releaseInitialRange();
      chart.scrollBars(event.key === "ArrowLeft" ? -Math.max(1, Math.round(currentBars.length * 0.02)) : Math.max(1, Math.round(currentBars.length * 0.02)));
    } else if (event.key === "+" || event.key === "=") {
      event.preventDefault();
      releaseInitialRange();
      chart.zoom(1.2);
    } else if (event.key === "-" || event.key === "_") {
      event.preventDefault();
      releaseInitialRange();
      chart.zoom(1 / 1.2);
    } else if (event.key === "Home") {
      event.preventDefault();
      releaseInitialRange();
      chart.setVisibleTimeRange({ from: currentBars[0].time, to: currentBars.at(-1).time });
    } else if (event.key === "End") {
      event.preventDefault();
      releaseInitialRange();
      chart.scrollToRealtime();
    }
  };
  host.addEventListener("keydown", onKeyDown);
  const releaseInitialRange = () => {
    initialRangeOwned = false;
    pendingRange = null;
    userRange = true;
  };
  container.addEventListener("pointerdown", releaseInitialRange, true);
  container.addEventListener("wheel", releaseInitialRange, { capture: true, passive: true });
  cleanups.push(() => {
    container.removeEventListener("pointerdown", releaseInitialRange, true);
    container.removeEventListener("wheel", releaseInitialRange, true);
  });
  if (typeof chart.timeScale?.zoom !== "function" || typeof chart.invalidate !== "function") throw new TypeError("Funnest 0.6.22 time-scale zoom is unavailable");
  let axisDrag = null;
  const onAxisPointerDown = (event) => {
    if (axisDrag || destroyed || event.button !== 0 || event.isPrimary === false) return;
    const rect = host.getBoundingClientRect(), layout = chart.layout;
    if (!(rect.width > 0 && rect.height > 0 && layout?.width > 0 && layout.height > 0 && layout.plotWidth > 0)) return;
    const perPixel = layout.width / rect.width, x = (event.clientX - rect.left) * perPixel, y = (event.clientY - rect.top) * layout.height / rect.height;
    if (!(x >= 0 && x < layout.plotWidth && y >= layout.panesHeight && y <= layout.height)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    axisDrag = { pointerId: event.pointerId, clientX: event.clientX, anchorX: x, perPixel, barSpacing: chart.timeScale.barSpacing, rightOffset: chart.timeScale.rightOffset };
    event.target?.setPointerCapture?.(event.pointerId);
  };
  const onAxisPointerMove = (event) => {
    if (!axisDrag || event.pointerId !== axisDrag.pointerId) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const travel = Math.min(2, Math.max(-2, (event.clientX - axisDrag.clientX) * axisDrag.perPixel / chart.timeScale.width));
    chart.timeScale.barSpacing = axisDrag.barSpacing;
    chart.timeScale.rightOffset = axisDrag.rightOffset;
    chart.timeScale.zoom(axisDrag.anchorX, Math.exp(-2 * travel));
    chart.invalidate();
  };
  const onAxisPointerEnd = (event) => {
    if (!axisDrag || event.pointerId !== axisDrag.pointerId) return;
    event.stopImmediatePropagation();
    axisDrag = null;
  };
  const axisDragListeners = [["pointerdown", onAxisPointerDown], ["pointermove", onAxisPointerMove], ["pointerup", onAxisPointerEnd], ["pointercancel", onAxisPointerEnd]];
  for (const [type, handler] of axisDragListeners) host.addEventListener(type, handler, true);
  cleanups.push(() => {
    for (const [type, handler] of axisDragListeners) host.removeEventListener(type, handler, true);
  });
  const api = {
    engine: "funnest",
    chart,
    host,
    get state() {
      return host.dataset.state || "loading";
    },
    userOwnsRange() {
      return userRange;
    },
    ready() {
      if (!currentBars.length) return Promise.resolve({ painted: false, status: "empty", bars: 0 });
      if (readyPromise) return readyPromise;
      readyPromise = new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error("Funnest chart did not paint within 5 seconds")), 5e3);
        const check = () => requestAnimationFrame(() => requestAnimationFrame(() => {
          if (destroyed) {
            clearTimeout(timeout);
            reject(new Error("Funnest chart was destroyed before paint"));
            return;
          }
          const canvas = host.querySelector("canvas");
          const layout = chart.layout;
          if (canvas?.width > 0 && canvas?.height > 0 && layout.plotWidth > 0 && layout.panesHeight > 0 && host.getBoundingClientRect().width > 0 && host.getBoundingClientRect().height > 0 && currentBars.length > 0 && chart.bars.length === currentBars.length) {
            try {
              const image = canvas.getContext("2d")?.getImageData(0, 0, canvas.width, canvas.height).data;
              let first = null, varied = false;
              for (let i = 0; image && i < image.length; i += 4 * Math.max(1, Math.floor(image.length / 16e3))) {
                const pixel = `${image[i]},${image[i + 1]},${image[i + 2]},${image[i + 3]}`;
                if (first === null) first = pixel;
                else if (pixel !== first) {
                  varied = true;
                  break;
                }
              }
              if (varied) {
                clearTimeout(timeout);
                host.dataset.state = "ready";
                status.textContent = `${currentBars.length}\uAC1C \uC2E4\uC81C \uAD00\uCE21 \uBD09 \xB7 Funnest \uCC28\uD2B8 \uC900\uBE44 \uC644\uB8CC`;
                resolve({ painted: true, status: "ready", bars: chart.bars.length, canvas: { width: canvas.width, height: canvas.height } });
                return;
              }
            } catch (error) {
              clearTimeout(timeout);
              reject(error);
              return;
            }
          }
          if (typeof requestAnimationFrame === "function") check();
        }));
        check();
      });
      return readyPromise;
    },
    setData(nextBars, { preserveRange = true } = {}) {
      const previousRange = preserveRange ? chart.getVisibleTimeRange() : null;
      lastCrosshair = null;
      clearFutureDateTicks();
      mapData(nextBars);
      retainedMaxSpan = sourceRangeSpan(currentBars, initialRangeOwned && ownedRange ? ownedRange : retainedRange);
      host.dataset.state = currentBars.length ? "loading" : "empty";
      if (!currentBars.length) status.textContent = "\uD45C\uC2DC\uD560 \uC2E4\uC81C \uAD00\uCE21 \uAC00\uACA9 \uC790\uB8CC\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4.";
      chart.setData(currentBars);
      if (previousRange) requestAnimationFrame(() => chart.setVisibleTimeRange(previousRange));
      readyPromise = null;
    },
    setRange(nextRange) {
      if (!nextRange || !(nextRange.to > nextRange.from)) return false;
      ownedRange = nextRange;
      retainedRange = nextRange;
      retainedMaxSpan = sourceRangeSpan(currentBars, nextRange);
      retainedFitException = true;
      initialRangeOwned = true;
      userRange = false;
      pendingRange = null;
      configureRetainedRangeSpacing(nextRange);
      chart.setVisibleTimeRange(nextRange);
      return true;
    },
    setChartType(nextType) {
      if (!["candles", "line", "area"].includes(nextType)) throw new RangeError("Unsupported Funnest chart type");
      if (sourceMode === "close-only" && nextType !== "line") throw new RangeError("Close-only sources cannot be presented as candles or area OHLC");
      chart.setChartType(nextType);
    },
    setScale(nextScale) {
      if (!["normal", "log", "percent"].includes(nextScale)) throw new RangeError("Unsupported Funnest scale");
      chart.setSettings({ priceScale: nextScale });
    },
    setInverted(nextInverted) {
      currentInverted = Boolean(nextInverted);
      return setFunnestPriceScaleInverted(chart, currentInverted);
    },
    setPriceExtrema(domain) {
      setFunnestPriceExtrema(chart, domain);
    },
    inspect() {
      return inspectAtlasFunnestChart({ chart, host, source: { ...source, volumeSource: volumeSource || null }, sourceMode, observations, crosshair: lastCrosshair, crosshairEventSequence, state: host.dataset.state || "unknown" });
    },
    setDrawingTool(tool) {
      chart.setDrawingTool(tool);
    },
    setMagnet(on) {
      chart.setMagnet(Boolean(on));
    },
    setTheme(nextTheme) {
      chart.setTheme({ ...DEFAULT_THEME, ...nextTheme });
    },
    addOverlay(overlay) {
      return chart.addOverlay(overlay);
    },
    getBars() {
      return sourceMode === "close-only" ? observations.map((point) => ({ ...point })) : currentBars.map((bar) => ({ ...bar }));
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      clearTimeout(announceTimer);
      host.removeEventListener("keydown", onKeyDown);
      for (const cleanup of cleanups) cleanup?.();
      chart.destroy();
      host.remove();
      status.remove();
    }
  };
  cleanups.push(exposeAtlasFunnestSnapshot(host, () => api.inspect()));
  return api;
}
export {
  DEFAULT_THEME as ATLAS_FUNNEST_THEME,
  exposeAtlasFunnestSnapshot,
  holdFunnestPriceAxisWidth,
  inspectAtlasFunnestChart,
  mapCloseOnlyToFunnestLine,
  mountAtlasFunnestChart,
  setFunnestPriceExtrema,
  setFunnestPriceScaleInverted,
  validateFunnestBars
};
