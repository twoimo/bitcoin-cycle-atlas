import assert from 'node:assert/strict';

// Device metrics change the page viewport, not the browser window's native
// input envelope. On macOS the default headless client was 756 x 469 while a
// 320 x 900 page was rendered; closing a dialog exposed that smaller envelope
// to native scrolling. Size the isolated window before creating any test page.
export const headlessWindowSize = Object.freeze({width:2048,height:1600});
export const headlessWindowArgument = `--window-size=${headlessWindowSize.width},${headlessWindowSize.height}`;

// Call on the fresh about:blank target, BEFORE applying device emulation.
// Never repair or resize the page after an input failure to make it pass.
export async function verifyHeadlessWindowEnvelope(cdp, viewport) {
  for (const name of ['width','height']) assert.ok(Number.isFinite(viewport[name]) && viewport[name]>0, 'Invalid test viewport '+name);
  const window=await cdp.send('Browser.getWindowForTarget');
  const metrics=await cdp.send('Page.getLayoutMetrics');
  const client={width:metrics.cssLayoutViewport?.clientWidth,height:metrics.cssLayoutViewport?.clientHeight};
  for (const name of ['width','height']) {
    assert.ok(Number.isFinite(client[name]) && client[name]>0,'Missing native browser client '+name);
    assert.ok(client[name]>=viewport[name],`Native browser client ${name} ${client[name]} cannot cover emulated ${viewport[name]}`);
  }
  return {windowId:window.windowId,bounds:window.bounds,client,requestedViewport:{width:viewport.width,height:viewport.height},verifiedBeforeEmulation:true};
}
