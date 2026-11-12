// Pure assertions for native heading observations. No DOM, browser startup,
// filesystem writes or manufactured geometry belongs to this contract.
const validRect = rect => Boolean(rect && ['left', 'top', 'right', 'bottom', 'width', 'height'].every(key => Number.isFinite(rect[key]))
  && rect.right >= rect.left && rect.bottom >= rect.top && rect.width >= 0 && rect.height >= 0);
const inBox = (a, b) => Boolean(validRect(a) && validRect(b)
  && a.left >= b.left - .01 && a.top >= b.top - .01 && a.right <= b.right + .01 && a.bottom <= b.bottom + .01);

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
  const areas = {
    headingSymbolButton:pageHeadingIntersectionArea(state.heading, state.symbolButton),
    headingSymbolLabel:pageHeadingIntersectionArea(state.heading, state.symbolLabel),
    glyphSymbolButton:glyphs.reduce((area, glyph) => area + pageHeadingIntersectionArea(glyph, state.symbolButton), 0),
    glyphSymbolLabel:glyphs.reduce((area, glyph) => area + pageHeadingIntersectionArea(glyph, state.symbolLabel), 0),
    headingSymbolGlyphs:glyphs.reduce((total, glyph) => total
      + symbolGlyphs.reduce((area, symbol) => area + pageHeadingIntersectionArea(glyph, symbol), 0), 0),
    labelPlot:pageHeadingIntersectionArea(state.labelRow?.rect, plot),
    headingPlot:pageHeadingIntersectionArea(state.heading, plot),
    glyphPlot:glyphs.reduce((area, glyph) => area + pageHeadingIntersectionArea(glyph, plot), 0),
  };
  // Compare deliberately paints its fixed title inside the toolbar. Only the
  // separate outlook label must have zero area against that entire toolbar.
  if (state.placement?.kind === 'label') Object.assign(areas, {
    labelToolbar:pageHeadingIntersectionArea(state.labelRow?.rect, state.geometry?.toolbar),
    headingToolbar:pageHeadingIntersectionArea(state.heading, state.geometry?.toolbar),
    glyphToolbar:glyphs.reduce((area, glyph) => area + pageHeadingIntersectionArea(glyph, state.geometry?.toolbar), 0),
  });
  return areas;
}

export function validatePageHeadingState(state, previous, expectedTitle) {
  const failures = [], check = (condition, message) => { if (!condition) failures.push(message); };
  const conference = expectedTitle === '컨퍼런스 복습', comparison = expectedTitle === '사이클 비교';
  const label = state.placement?.kind === 'label';
  check(state.h1Count === 1 && state.paintedH1Count === 1 && state.painted, `h1 total=${state.h1Count}, painted=${state.paintedH1Count}`);
  check(state.title === expectedTitle, `unexpected title ${state.title}`);
  check(state.describedBy === 'atlas-page-description' && state.descriptionCount === 1 && state.description.length > 15, 'description connection missing');
  check(state.headingInViewport && state.glyphsInViewport, 'heading/glyphs outside viewport');
  if (!conference) {
    check(comparison ? state.placement?.kind === 'compare' : label, comparison ? 'compare heading placement changed' : 'price heading must own a normal-flow label row');
    if (label) {
      const row = state.labelRow, glyphs = state.glyphs || [];
      check(row?.painted && row.inViewport && inBox(state.heading, row.rect)
        && glyphs.length > 0 && glyphs.every(glyph => inBox(glyph, row.rect)), 'heading/glyphs outside visible label row');
      check(row?.position === 'static' && row.order === '-1', 'label row must remain in normal layout flow');
      check(validRect(row?.rect) && Math.abs(row.rect.height - 22) <= .01, 'label row must retain its 22px height');
      check(state.fontSize === '12px' && state.lineHeight === '14px', 'label heading type must remain 12px/14px');
      check(validRect(state.geometry?.toolbar), 'label toolbar geometry missing');
      check(validRect(state.symbolButton) && validRect(state.symbolLabel) && state.symbolGlyphs?.length > 0
        && state.symbolGlyphs.every(validRect), 'symbol button/label/glyph geometry missing');
    } else {
      check(state.headingInToolbar && state.glyphsInToolbar, 'heading/glyphs outside visible toolbar');
      check(state.placement?.delta && Math.abs(state.placement.delta.left) <= .01 && Math.abs(state.placement.delta.top) <= .01,
        `stale anchor coordinates: ${JSON.stringify(state.placement?.delta)}`);
    }
    check(validRect(state.heading) && state.glyphs?.length > 0 && state.glyphs.every(validRect) && validRect(state.geometry?.plot), 'heading/glyph/plot geometry missing');
    const areas = pageHeadingOverlapAreas(state);
    for (const [name, area] of Object.entries(areas)) check(area === 0, `${name} overlap area ${area}px²`);
  }
  check(state.paintIssues.length === 0, `heading paint: ${state.paintIssues.join('; ')}`);
  check(state.color !== 'transparent' && !/rgba\([^)]*,\s*0\)/.test(state.color || ''), 'transparent heading text');
  check((conference ? state.inDashboardHeader : state.followsToolbar) && state.outsidePlot, 'heading lost shell ownership');
  check(state.overflow === 0, `horizontal overflow ${state.overflow}px`);
  check(state.duplicateTitles.length === 0, `duplicate titles: ${state.duplicateTitles.join(', ')}`);
  check(state.overlayCollisions.length === 0 && !state.symbolCollision, `text overlap: ${state.overlayCollisions.join(', ')} symbol=${state.symbolCollision}`);
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
