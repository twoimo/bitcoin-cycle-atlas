import assert from 'node:assert/strict';

// Executed in the page by the existing native runner. Only rendered geometry and
// hit testing are read; this function never changes a scroll position or style.
export function readNativeHorizontalScrollOwner(ownerSelector) {
  const owner = document.querySelector(ownerSelector);
  if (!owner) throw new Error('Missing native horizontal scroll owner ' + ownerSelector);
  const rectangle = node => {
    const box = node.getBoundingClientRect();
    return {left:box.left + node.clientLeft, right:box.left + node.clientLeft + node.clientWidth,
      top:box.top + node.clientTop, bottom:box.top + node.clientTop + node.clientHeight};
  };
  const css = getComputedStyle(owner), box = owner.getBoundingClientRect();
  const clip = rectangle(owner);
  clip.left = Math.max(0, clip.left);clip.right = Math.min(innerWidth, clip.right);
  clip.top = Math.max(0, clip.top);clip.bottom = Math.min(innerHeight, clip.bottom);
  for (let node = owner.parentElement; node; node = node.parentElement) {
    const style = getComputedStyle(node), bounds = rectangle(node);
    if (/^(auto|scroll|hidden|clip)$/.test(style.overflowX)) {
      clip.left = Math.max(clip.left, bounds.left);clip.right = Math.min(clip.right, bounds.right);
    }
    if (/^(auto|scroll|hidden|clip)$/.test(style.overflowY)) {
      clip.top = Math.max(clip.top, bounds.top);clip.bottom = Math.min(clip.bottom, bounds.bottom);
    }
  }
  const identify = node => node ? (node.id ? '#' + node.id : node.tagName.toLowerCase() + (node.classList.length ? '.' + [...node.classList].join('.') : '')) : null;
  const nearestOwner = hit => {
    for (let node = hit; node; node = node.parentElement) {
      if (/^(auto|scroll)$/.test(getComputedStyle(node).overflowX) && node.scrollWidth > node.clientWidth) return node;
    }
    return null;
  };
  const visible = !owner.closest('[hidden],[inert]') && css.display !== 'none' && css.visibility !== 'hidden'
    && box.width > 0 && box.height > 0 && clip.right > clip.left && clip.bottom > clip.top;
  const hits = [];
  if (visible) {
    const y = (clip.top + clip.bottom) / 2;
    for (let x = clip.left + 1; x < clip.right; x += 4) {
      const hit = document.elementFromPoint(x, y), nearest = nearestOwner(hit);
      hits.push({x,y,owned:Boolean(hit && owner.contains(hit) && nearest === owner),
        hit:identify(hit),nearestOwner:identify(nearest)});
    }
  }
  return {selector:ownerSelector,visible,clip,box:{left:box.left,right:box.right,top:box.top,bottom:box.bottom,width:box.width,height:box.height},
    overflowX:css.overflowX,touchAction:css.touchAction,scrollLeft:owner.scrollLeft,
    clientWidth:owner.clientWidth,scrollWidth:owner.scrollWidth,maximum:Math.max(0,owner.scrollWidth-owner.clientWidth),hits};
}

// direction is the intended scroll direction: +1 exposes content on the right.
// The touch itself moves in the opposite direction, starting in this owner's
// actual hit region rather than an independently scrolling descendant.
export function planNativeHorizontalScrollGesture(state, direction, {maxDistance=144,inset=24}={}) {
  assert.ok(direction === 1 || direction === -1, 'Native horizontal gesture needs an explicit scroll direction');
  assert.ok(state.visible && /^(auto|scroll)$/.test(state.overflowX), 'Native horizontal scroll owner is not visible and scrollable: ' + state.selector);
  assert.ok(state.maximum > 0, 'Native horizontal scroll owner must actually overflow: ' + state.selector);
  assert.ok(direction === 1 ? state.scrollLeft < state.maximum : state.scrollLeft > 0, 'Native horizontal gesture starts at its directional boundary: ' + state.selector);
  assert.ok(Number.isFinite(maxDistance) && maxDistance >= 44 && Number.isFinite(inset) && inset >= 0, 'Native horizontal gesture needs a full touch travel');
  const left = state.clip.left + inset, right = state.clip.right - inset;
  const candidates = state.hits.filter(hit => hit.owned && hit.x >= left && hit.x <= right)
    .sort((a,b) => direction * (b.x-a.x));
  for (const hit of candidates) {
    const distance = Math.min(maxDistance, direction === 1 ? hit.x-left : right-hit.x);
    if (distance < 44) continue;
    return {x:hit.x,y:hit.y,endX:hit.x-direction*distance,distance,direction,
      owner:state.selector,hit:hit.hit,nearestOwner:hit.nearestOwner,clip:{...state.clip}};
  }
  throw new Error('No exposed native horizontal owner hit has sufficient swipe space: ' + state.selector + ' ' + JSON.stringify({clip:state.clip,ownedHits:state.hits.filter(hit=>hit.owned).length}));
}

// Wheel input needs an owned hit point, not the travel area of a touch gesture.
// The caller retains its existing measured delta and direction.
export function planNativeHorizontalScrollWheel(state,direction) {
  assert.ok(direction===1||direction===-1,'Native horizontal wheel needs an explicit scroll direction');
  assert.ok(state.visible&&/^(auto|scroll)$/.test(state.overflowX),'Native horizontal scroll owner is not visible and scrollable: '+state.selector);
  assert.ok(state.maximum>0,'Native horizontal scroll owner must actually overflow: '+state.selector);
  assert.ok(direction===1?state.scrollLeft<state.maximum:state.scrollLeft>0,'Native horizontal wheel starts at its directional boundary: '+state.selector);
  const center=(state.clip.left+state.clip.right)/2;
  const hit=state.hits.filter(hit=>hit.owned&&hit.x>=state.clip.left&&hit.x<state.clip.right).sort((a,b)=>Math.abs(a.x-center)-Math.abs(b.x-center))[0];
  assert.ok(hit,'No exposed native horizontal owner hit for wheel input: '+state.selector);
  return {x:hit.x,y:hit.y,direction,owner:state.selector,hit:hit.hit,nearestOwner:hit.nearestOwner,clip:{...state.clip}};
}
