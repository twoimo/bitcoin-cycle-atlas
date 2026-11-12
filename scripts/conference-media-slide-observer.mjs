// Serialize this function into the page with Runtime.evaluate. It has no
// imported runtime dependencies and only observes the real player/image.
export function armConferenceSlideObservation({expected, mode = 'transition'}) {
  if (!expected || !Number.isInteger(expected.page) || expected.page < 1
      || typeof expected.file !== 'string' || !expected.file
      || !['entry', 'baseline', 'transition'].includes(mode)) throw new Error('Invalid slide observation');
  window.__conferenceSlideObserver?.cancel();
  const token = (window.__conferenceSlideObservationToken || 0) + 1;
  window.__conferenceSlideObservationToken = token;
  window.__conferenceSlideMeasurement = null;
  const expectedSrc = new URL('./conference/' + expected.file, document.baseURI).href;
  const armedAt = performance.now(), frames = new Set(), generations = new WeakMap();
  let active = true, started = null, trusted = null, decodeAttempts = 0;
  let staleDecodeRejections = 0, staleDecodeCompletions = 0, paintRechecks = 0;

  const mutations = records => {
    for (const record of records) {
      // Track the affected element, rather than unrelated DOM activity. Even
      // A -> B -> A source changes must invalidate the earlier decode promise.
      if (record.type === 'attributes') generations.set(record.target, (generations.get(record.target) || 0) + 1);
    }
  };
  const observer = new MutationObserver(mutations);
  observer.observe(document, {subtree:true, attributes:true,
    attributeFilter:['src', 'srcset', 'sizes']});
  const read = () => {
    mutations(observer.takeRecords());
    const player = document.querySelector('.conference-player');
    const image = player?.querySelector('.conference-slide-image');
    const attribute = image?.getAttribute('src') || '';
    let requestedSrc = '';
    try { if (attribute) requestedSrc = new URL(attribute, document.baseURI).href; } catch { /* Invalid current sources cannot match. */ }
    return {player, image, page:player?.dataset.page || '', deck:player?.dataset.deck || '',
      eventTime:Number(player?.dataset.time), attribute, requestedSrc, currentSrc:image?.currentSrc || '',
      imageGeneration:image ? generations.get(image) || 0 : -1,
      complete:image?.complete === true, hidden:!image || image.hidden,
      width:image?.naturalWidth || 0, height:image?.naturalHeight || 0};
  };
  const selected = value => value.page === String(expected.page)
    && (!expected.deckId || value.deck === expected.deckId);
  const ownsRequest = value => selected(value) && value.requestedSrc === expectedSrc && value.currentSrc === expectedSrc;
  const currentIdentity = (before, after) => before.player === after.player && before.image === after.image
    && before.page === after.page && before.deck === after.deck
    && before.attribute === after.attribute && before.requestedSrc === after.requestedSrc
    && before.currentSrc === after.currentSrc && before.imageGeneration === after.imageGeneration;
  const visible = value => ownsRequest(value) && value.complete && !value.hidden && value.width > 0 && value.height > 0;
  const initial = read();
  // An entry can already select the first page while its image is still
  // loading. Sending ] then would skip that page. The baseline waits for its
  // actual image; it never invents a zero-millisecond transition receipt.
  const selectedMode = mode === 'entry' ? (selected(initial) ? 'baseline' : 'transition') : mode;
  const isOwner = () => active && window.__conferenceSlideObservationToken === token;
  const schedule = callback => {
    if (!isOwner()) return;
    const id = requestAnimationFrame(() => { frames.delete(id); if (isOwner()) void callback(); });
    frames.add(id);
  };
  const cleanup = () => {
    active = false;
    window.removeEventListener('keydown', start, true);
    observer.disconnect();
    for (const id of frames) cancelAnimationFrame(id);
    frames.clear();
  };
  const publish = (value, error) => {
    if (!isOwner()) return;
    const now = performance.now();
    window.__conferenceSlideMeasurement = {
      token, mode:selectedMode, page:expected.page, file:expected.file, deck:value.deck,
      trusted, milliseconds:selectedMode === 'transition' ? now - started : null,
      observationMilliseconds:now - armedAt, inputStartedAt:started,
      currentSrc:value.currentSrc, requestedSrc:value.requestedSrc, srcAttribute:value.attribute,
      width:value.width, height:value.height, eventTime:value.eventTime,
      decodeAttempts, staleDecodeRejections, staleDecodeCompletions, paintRechecks,
      decoded:!error, ...(error ? {error:String(error)} : {}),
    };
    cleanup();
  };
  const observe = async () => {
    if (!isOwner()) return;
    let candidate = read();
    // src names the pending request; currentSrc may still name the old image.
    // Both must identify this step before decode() can belong to it.
    if (!ownsRequest(candidate) || !candidate.complete || candidate.hidden) { schedule(observe); return; }
    // The HTML image update algorithm can finish in a microtask after src is
    // assigned. Re-read after that checkpoint before owning the decode call.
    await Promise.resolve();
    if (!isOwner()) return;
    const before = read();
    if (!currentIdentity(candidate, before) || !ownsRequest(before) || !before.complete || before.hidden) { schedule(observe); return; }
    candidate = before; decodeAttempts++;
    try { await candidate.image.decode(); }
    catch (error) {
      if (!isOwner()) return;
      const after = read();
      if (!currentIdentity(candidate, after) || !ownsRequest(after) || !after.complete) {
        staleDecodeRejections++; schedule(observe); return;
      }
      // No changed request identity: the selected current image really failed.
      // Do not suppress EncodingError merely because a separate file decoder
      // accepted the same WebP, or blindly retry a stable current failure.
      publish(after, error); return;
    }
    if (!isOwner()) return;
    let after = read();
    if (!currentIdentity(candidate, after) || !visible(after)) {
      staleDecodeCompletions++; schedule(observe); return;
    }
    schedule(() => {
      after = read();
      if (!currentIdentity(candidate, after) || !visible(after)) { paintRechecks++; schedule(observe); return; }
      schedule(() => {
        after = read();
        if (!currentIdentity(candidate, after) || !visible(after)) { paintRechecks++; schedule(observe); return; }
        publish(after);
      });
    });
  };
  function start(event) {
    if (event.key !== ']' || !isOwner() || started !== null) return;
    window.removeEventListener('keydown', start, true);
    started = performance.now(); trusted = event.isTrusted;
    // Capture is on window, before the player's document handler changes src.
    schedule(observe);
  }
  window.__conferenceSlideObserver = {token, cancel:cleanup};
  if (selectedMode === 'baseline') schedule(observe);
  else window.addEventListener('keydown', start, true);
  return {token, mode:selectedMode, entry:{page:initial.page, deck:initial.deck, eventTime:initial.eventTime,
    requestedSrc:initial.requestedSrc, currentSrc:initial.currentSrc, complete:initial.complete,
    width:initial.width, height:initial.height, hidden:initial.hidden}};
}
