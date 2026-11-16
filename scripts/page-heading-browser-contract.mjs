// Pure assertions for native heading observations. No DOM, browser startup,
// filesystem writes or manufactured geometry belongs to this contract.
const validRect = rect => Boolean(rect && ['left', 'top', 'right', 'bottom', 'width', 'height'].every(key => Number.isFinite(rect[key]))
  && rect.right >= rect.left && rect.bottom >= rect.top && rect.width >= 0 && rect.height >= 0);

/** Exact positive-area overlap. Touching edges share no painted area. */
export function pageHeadingIntersectionArea(a, b) {
  if (!a || !b) return 0;
  if (!validRect(a) || !validRect(b)) return NaN;
  return Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left))
    * Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
}

/** Recompute from raw rectangles, never trust a precomputed overlap flag. */
export function pageHeadingOverlapAreas(state) {
  const glyphs = state.glyphs || [], symbolGlyphs = state.symbolGlyphs || [], plot = state.geometry?.plot;
  return {
    headingSymbolButton:pageHeadingIntersectionArea(state.heading, state.symbolButton),
    headingSymbolLabel:pageHeadingIntersectionArea(state.heading, state.symbolLabel),
    glyphSymbolButton:glyphs.reduce((area, glyph) => area + pageHeadingIntersectionArea(glyph, state.symbolButton), 0),
    glyphSymbolLabel:glyphs.reduce((area, glyph) => area + pageHeadingIntersectionArea(glyph, state.symbolLabel), 0),
    headingSymbolGlyphs:glyphs.reduce((total, glyph) => total
      + symbolGlyphs.reduce((area, symbol) => area + pageHeadingIntersectionArea(glyph, symbol), 0), 0),
    headingPlot:pageHeadingIntersectionArea(state.heading, plot),
    glyphPlot:glyphs.reduce((area, glyph) => area + pageHeadingIntersectionArea(glyph, plot), 0),
  };
}

export function validatePageHeadingState(state, previous, expectedTitle) {
  const failures = [], check = (condition, message) => { if (!condition) failures.push(message); };
  const comparison = expectedTitle === '사이클 비교', price = !comparison;
  const label = state.placement?.kind === 'label';
  check(state.h1Count === 1 && state.paintedH1Count === (price ? 0 : 1) && state.painted === !price,
    `h1 total=${state.h1Count}, painted=${state.paintedH1Count}, expected painted=${price ? 0 : 1}`);
  check(state.title === expectedTitle, `unexpected title ${state.title}`);
  check(state.describedBy === 'atlas-page-description' && state.descriptionCount === 1 && state.description.length > 15, 'description connection missing');
  if (price) check(label, 'price heading must keep its visually hidden label placement');
  if (comparison) check(state.placement?.kind === 'compare', 'compare heading placement changed');
  if (label) {
    const row = state.labelRow;
    check(validRect(state.heading) && state.heading.width <= 1 && state.heading.height <= 1, 'hidden heading must not paint a visible box');
    check(row?.position === 'absolute' && validRect(row.rect) && row.rect.width <= 1 && row.rect.height <= 1, 'hidden label must take no layout flow');
    check(state.hiddenBy?.length === 0, `hidden heading left the accessibility tree: ${state.hiddenBy?.join(', ')}`);
    check(state.symbolPainted && validRect(state.symbolButton) && validRect(state.symbolLabel) && state.symbolGlyphs?.length > 0
      && state.symbolGlyphs.every(validRect), 'toolbar instrument identity is not painted');
  } else {
    check(state.headingInViewport && state.glyphsInViewport, 'heading/glyphs outside viewport');
    check(state.headingInToolbar && state.glyphsInToolbar, 'heading/glyphs outside visible toolbar');
    check(state.placement?.delta && Math.abs(state.placement.delta.left) <= .01 && Math.abs(state.placement.delta.top) <= .01,
      `stale anchor coordinates: ${JSON.stringify(state.placement?.delta)}`);
    check(validRect(state.heading) && state.glyphs?.length > 0 && state.glyphs.every(validRect) && validRect(state.geometry?.plot), 'heading/glyph/plot geometry missing');
    for (const [name, area] of Object.entries(pageHeadingOverlapAreas(state))) check(area === 0, `${name} overlap area ${area}px²`);
    check(state.hiddenBy?.length === 0 && state.paintIssues.length === 0,
      `heading paint: ${[...(state.hiddenBy || []).map(owner => `hidden ancestor: ${owner}`), ...state.paintIssues].join('; ')}`);
    check(state.color !== 'transparent' && !/rgba\([^)]*,\s*0\)/.test(state.color || ''), 'transparent heading text');
    check(state.overlayCollisions.length === 0 && !state.symbolCollision, `text overlap: ${state.overlayCollisions.join(', ')} symbol=${state.symbolCollision}`);
  }
  check(state.followsToolbar && state.outsidePlot, 'heading lost shell ownership');
  check(state.overflow === 0, `horizontal overflow ${state.overflow}px`);
  check(state.duplicateTitles.length === 0, `duplicate titles: ${state.duplicateTitles.join(', ')}`);
  check(state.symbolGlyphsInToolbar, 'symbol glyphs outside visible toolbar');
  if (previous) {
    check(state.description === previous.description, 'page description changed');
    for (const [name, current] of Object.entries(state.geometry)) {
      const before = previous.geometry[name];
      if (!current || !before) { check(current === before, `${name} visibility changed`); continue; }
      for (const field of ['left', 'top', 'width', 'height']) check(Math.abs(current[field] - before[field]) <= .01, `${name}.${field} ${before[field]} -> ${current[field]}`);
    }
  }
  return failures;
}
