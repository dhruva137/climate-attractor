/**
 * State — Single source of truth for the Climate Attractor app.
 *
 * Plain JS module pattern. No frameworks.
 * Usage:
 *   State.set('currentIndex', 42);
 *   State.subscribe('currentIndex', idx => console.log(idx));
 *   State.get('data');
 *   State.getCurrentPoint();
 */
const State = (() => {
  // ── internal store ────────────────────────────────────────────
  const _store = {
    data:             null,   // Array — full processed JSON data
    currentIndex:     0,      // index into data
    isPlaying:        false,
    playSpeed:        1,      // 1 | 2 | 4
    activeView:       'phase', // 'phase' | 'tsne' | '3d'
    tsneMode:         'tsne', // 'tsne' | 'umap'
    animationFrameId: null,
  };

  // ── subscribers: key → Set<callback> ──────────────────────────
  const _subs = {};

  // ── public API ────────────────────────────────────────────────
  function get(key) {
    return _store[key];
  }

  function set(key, value) {
    _store[key] = value;
    notify(key);
  }

  function subscribe(key, callback) {
    if (!_subs[key]) _subs[key] = new Set();
    _subs[key].add(callback);
    // return unsubscribe handle
    return () => _subs[key].delete(callback);
  }

  function notify(key) {
    if (_subs[key]) {
      _subs[key].forEach(cb => {
        try { cb(_store[key]); }
        catch (e) { console.error(`[State] subscriber error on "${key}":`, e); }
      });
    }
  }

  function getCurrentPoint() {
    const d = _store.data;
    if (!d || d.length === 0) return null;
    return d[_store.currentIndex] || null;
  }

  function getEra() {
    const pt = getCurrentPoint();
    return pt ? pt.era : null;
  }

  function getProgress() {
    const d = _store.data;
    if (!d || d.length === 0) return 0;
    return _store.currentIndex / (d.length - 1);
  }

  return Object.freeze({
    get,
    set,
    subscribe,
    notify,
    getCurrentPoint,
    getEra,
    getProgress,
  });
})();
