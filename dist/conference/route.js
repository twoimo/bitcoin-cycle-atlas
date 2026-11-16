// The outer page owns the lazy player lifetime. A late import/fetch may finish
// after navigation; only the current visit may report readiness or keep audio.
export function createConferenceRoute({host, timelineUrl, onReady = () => {}, onError = () => {}, loadPlayer = () => import('./player.js?v=1.0.0')}) {
  let active = false, destroyed = false, epoch = 0, controller = null, pending = null;
  function leave() {
    active = false;
    epoch += 1;
    controller?.destroy();
    controller = null;
    pending = null;
  }
  function setActive(next) {
    if (destroyed) return Promise.resolve();
    if (!next) { if (active || controller || pending) leave(); return Promise.resolve(); }
    active = true;
    if (controller) { controller.syncFromUrl(); return pending || Promise.resolve(); }
    if (pending) return pending;
    const visit = epoch;
    pending = Promise.resolve().then(loadPlayer).then(async ({mountConferencePlayer}) => {
      if (!active || destroyed || visit !== epoch) return;
      const player = mountConferencePlayer(host, {timelineUrl});
      controller = player;
      await player.load();
      if (active && !destroyed && visit === epoch) onReady();
    }).catch(error => {
      if (!active || destroyed || visit !== epoch) return;
      controller?.destroy();
      controller = null;
      pending = null;
      onError(error);
    });
    return pending;
  }
  return {setActive, destroy() { if (!destroyed) { leave(); destroyed = true; } }};
}
