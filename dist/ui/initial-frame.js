/** Coalesced real work, with a first-boot timer fallback when animation frames stall.
 * This never acknowledges readiness: the caller must still render actual content.
 */
export function queueInitialFrame(action, { initial = false, requestFrame = requestAnimationFrame, cancelFrame = cancelAnimationFrame, setTimer = setTimeout, clearTimer = clearTimeout } = {}) {
  if (typeof action !== 'function') throw new TypeError('A render action is required');
  let active = true, frame = null, timer = null;
  const clear = () => { if (frame !== null) cancelFrame(frame); if (timer !== null) clearTimer(timer); };
  const run = () => { if (!active) return; active = false; clear(); action(); };
  frame = requestFrame(run);
  if (initial && active) timer = setTimer(run, 80);
  return () => { active = false; clear(); };
}
