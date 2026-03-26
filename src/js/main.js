/**
 * main.js — Bootstrap, view router, keyboard shortcuts,
 * hero canvas init, intersection observer, and final wiring.
 */

(function () {
  'use strict';

  // ── view management ───────────────────────────────────────────
  const VIEW_IDS = {
    phase: 'phase-portrait-panel',
    tsne:  'tsne-panel',
    '3d':  'three-panel',
  };
  const VIEW_ORDER = ['phase', 'tsne', '3d'];
  const initializedViews = new Set();

  function showView(viewName) {
    // panels
    document.querySelectorAll('.viz-panel').forEach(p => p.classList.remove('active'));
    const panelId = VIEW_IDS[viewName];
    if (panelId) {
      const panel = document.getElementById(panelId);
      if (panel) panel.classList.add('active');
    }
    // buttons
    document.querySelectorAll('#viz-nav .view-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.view === viewName);
    });
    State.set('activeView', viewName);

    // lazy init chart modules on first show
    if (!initializedViews.has(viewName)) {
      initializedViews.add(viewName);
      switch (viewName) {
        case 'phase':
          PhasePortrait.init(document.getElementById('phase-portrait-panel'));
          break;
        case 'tsne':
          TsneView.init(document.getElementById('tsne-panel'));
          break;
        case '3d':
          ThreeView.init(document.getElementById('three-panel'));
          break;
      }
    }
  }

  // ── methodology modal ────────────────────────────────────────
  function initModal() {
    const modal    = document.getElementById('methodology-modal');
    const openBtn  = document.getElementById('btn-methodology');
    if (!modal || !openBtn) return;

    openBtn.addEventListener('click', () => modal.classList.add('open'));

    // close button may be re-created by Citations.init, use delegation
    modal.addEventListener('click', e => {
      if (e.target === modal || e.target.classList.contains('modal-close')) {
        modal.classList.remove('open');
      }
    });
  }

  // ── CTA scroll ───────────────────────────────────────────────
  function initCTA() {
    const cta = document.getElementById('cta-explore');
    if (!cta) return;
    cta.addEventListener('click', e => {
      e.preventDefault();
      document.getElementById('viz-app').scrollIntoView({ behavior: 'smooth' });
      // auto-start playback after a moment
      setTimeout(() => {
        if (!Scrubber.isPlaying()) Scrubber.togglePlay();
      }, 800);
    });
  }

  // ── keyboard shortcuts ───────────────────────────────────────
  function initKeyboard() {
    document.addEventListener('keydown', e => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

      const modal = document.getElementById('methodology-modal');
      switch (e.key) {
        case ' ':
          e.preventDefault();
          Scrubber.togglePlay();
          break;
        case 'ArrowRight':
          e.preventDefault();
          Scrubber.advance(10);
          break;
        case 'ArrowLeft':
          e.preventDefault();
          Scrubber.advance(-10);
          break;
        case '1': Scrubber.setSpeed(1); break;
        case '2': Scrubber.setSpeed(2); break;
        case '4': Scrubber.setSpeed(4); break;
        case 'Escape':
          if (modal && modal.classList.contains('open')) {
            modal.classList.remove('open');
          }
          break;
        case 'v':
        case 'V': {
          const cur = State.get('activeView');
          const idx = VIEW_ORDER.indexOf(cur);
          const next = VIEW_ORDER[(idx + 1) % VIEW_ORDER.length];
          showView(next);
          break;
        }
        case 'h':
        case 'H':
          document.getElementById('landing').scrollIntoView({ behavior: 'smooth' });
          break;
      }
    });
  }

  // ── loading overlay ──────────────────────────────────────────
  function createLoadingOverlay() {
    const el = document.createElement('div');
    el.id = 'loading-overlay';
    el.innerHTML = '<span>Loading climate data<span class="loading-dot-anim"></span></span>';
    document.body.appendChild(el);
    return el;
  }

  function removeLoadingOverlay(el) {
    if (!el) return;
    el.style.opacity = '0';
    setTimeout(() => {
      if (el.parentNode) el.parentNode.removeChild(el);
    }, 450);
  }

  // ═════════════════════════════════════════════════════════════
  //  BOOT
  // ═════════════════════════════════════════════════════════════
  async function boot() {
    // hero canvas — runs immediately, no data needed
    if (typeof initHeroCanvas === 'function') initHeroCanvas();

    // loading overlay
    const overlay = createLoadingOverlay();

    // wire non-data-dependent UI
    initCTA();
    initModal();
    initKeyboard();

    // wire view buttons
    document.querySelectorAll('#viz-nav .view-btn').forEach(btn => {
      btn.addEventListener('click', () => showView(btn.dataset.view));
    });

    // load data
    const data = await loadClimateData();

    if (data) {
      // init scrubber (needs data in State)
      Scrubber.init();
      showView('phase');

      // init annotations + citations
      if (typeof Annotations !== 'undefined') Annotations.init();
      if (typeof Citations !== 'undefined') Citations.init();

      const first = data[0];
      const last  = data[data.length - 1];
      console.log(
        `%cClimate Attractor loaded.%c\n  Data points: ${data.length}\n  Time range : ${first.displayYear} → ${last.displayYear}`,
        'color:#4fc3f7;font-weight:bold', 'color:inherit'
      );

      removeLoadingOverlay(overlay);
    } else {
      const overlayEl = document.getElementById('loading-overlay');
      if (overlayEl) {
        overlayEl.innerHTML = `
          <div class="error-message">
            <strong>⚠ Failed to load data</strong><br><br>
            Run <code>python scripts/process_data.py</code> first,<br>
            then <code>npx -y serve .</code> from project root.
          </div>`;
      }
    }
  }

  // ── fire on DOM ready ────────────────────────────────────────
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
