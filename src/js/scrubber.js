/**
 * Scrubber — Time slider, playback engine, timeline ticks, and display updates.
 */

const Scrubber = (() => {
  // ── DOM refs ──────────────────────────────────────────────────
  let slider, timeDisplay, eraLabel, eraDot, eraNavLabel;
  let btnPlay, btnReset, btnSlower, btnFaster, speedDisp;
  let valCo2, valTemp, valCh4, valSea, valSol;
  let ticksContainer;

  // ── playback state ────────────────────────────────────────────
  let frameCount = 0;
  let rafId = null;

  // frames-per-step at each speed (targeting ~60s for full 800 steps at 1x)
  // At 60fps: 60fps * 60s / 800steps ≈ 4.5 → 5 frames/step at 1x
  const FRAMES_PER_STEP = { 1: 5, 2: 3, 4: 2, 8: 1, 16: 1 };

  // ── timeline event markers ────────────────────────────────────
  const TICK_EVENTS = [
    { ageBP: 800000, label: '800 Ka',              highlight: false },
    { ageBP: 420000, label: 'Penultimate glacial',  highlight: false },
    { ageBP: 130000, label: 'Last interglacial',    highlight: false },
    { ageBP:  21000, label: 'Last glacial max',     highlight: false },
    { ageBP:  11700, label: 'Holocene',             highlight: false },
    { ageBP:    100, label: 'Industrial',           highlight: true  },
    { ageBP:      0, label: 'Now',                  highlight: true  },
  ];

  // ═════════════════════════════════════════════════════════════
  //  INIT
  // ═════════════════════════════════════════════════════════════
  function init() {
    // grab DOM
    slider       = document.getElementById('time-slider');
    timeDisplay  = document.getElementById('time-display');
    eraLabel     = document.getElementById('era-label');
    eraDot       = document.getElementById('era-dot');
    eraNavLabel  = document.getElementById('era-nav-label');
    btnPlay      = document.getElementById('btn-play');
    btnReset     = document.getElementById('btn-reset');
    btnSlower    = document.getElementById('btn-slower');
    btnFaster    = document.getElementById('btn-faster');
    speedDisp    = document.getElementById('speed-display');
    valCo2       = document.getElementById('val-co2');
    valTemp      = document.getElementById('val-temp');
    valCh4       = document.getElementById('val-ch4');
    valSea       = document.getElementById('val-sea');
    valSol       = document.getElementById('val-sol');
    ticksContainer = document.getElementById('timeline-ticks');

    const data = State.get('data');
    if (!data) return;

    // ── configure slider ────────────────────────────────────────
    slider.min   = 0;
    slider.max   = data.length - 1;
    slider.value = 0;
    slider.step  = 1;

    // ── events ──────────────────────────────────────────────────
    slider.addEventListener('input', () => {
      State.set('currentIndex', parseInt(slider.value, 10));
    });

    btnPlay.addEventListener('click', togglePlay);
    btnReset.addEventListener('click', resetPlayback);
    btnSlower.addEventListener('click', slower);
    btnFaster.addEventListener('click', faster);

    // ── subscribe to state ──────────────────────────────────────
    State.subscribe('currentIndex', updateDisplay);

    // ── initial display + ticks ─────────────────────────────────
    updateDisplay();
    renderTicks(data);
    updateSpeedDisplay();

    console.log('[Scrubber] initialised');
  }

  // ═════════════════════════════════════════════════════════════
  //  DISPLAY UPDATE
  // ═════════════════════════════════════════════════════════════
  function updateDisplay() {
    const pt = State.getCurrentPoint();
    if (!pt) return;

    // ── time display ────────────────────────────────────────────
    const ce = pt.year_ce;
    let timeStr;
    if (ce <= 0) {
      timeStr = Math.abs(pt.age_bp).toLocaleString() + ' BP';
    } else if (ce < 1800) {
      timeStr = ce + ' CE';
    } else {
      const co2 = pt.co2_ppm;
      timeStr = ce + ' CE' + (co2 !== null ? '  (' + co2.toFixed(1) + ' ppm)' : '');
    }
    timeDisplay.textContent = timeStr;

    // ── era label + dot ─────────────────────────────────────────
    const era = pt.era;
    const eraName = era.charAt(0).toUpperCase() + era.slice(1);

    eraLabel.textContent = eraName;
    eraLabel.className = era;

    eraDot.className = 'era-dot ' + era;
    eraNavLabel.textContent = eraName;

    // ── info panel values ───────────────────────────────────────
    valCo2.textContent  = fmtVal(pt.co2_ppm,      1, 'ppm');
    valTemp.textContent = fmtTemp(pt.temp_anomaly);
    valCh4.textContent  = fmtVal(pt.ch4_ppb,      0, 'ppb');
    valSea.textContent  = fmtVal(pt.sea_level_m,   1, 'm');
    valSol.textContent  = fmtVal(pt.insolation,    1, 'W/m²');

    // ── slider position ─────────────────────────────────────────
    slider.value = State.get('currentIndex');

    // ── document title ──────────────────────────────────────────
    document.title = 'Climate Attractor · ' + timeStr;
  }

  function fmtVal(v, decimals, unit) {
    if (v === null || v === undefined || (typeof v === 'number' && isNaN(v))) {
      return '— ' + unit;
    }
    return v.toFixed(decimals) + ' ' + unit;
  }

  function fmtTemp(v) {
    if (v === null || v === undefined || (typeof v === 'number' && isNaN(v))) {
      return '— °C';
    }
    return (v > 0 ? '+' : '') + v.toFixed(2) + ' °C';
  }

  // ═════════════════════════════════════════════════════════════
  //  PLAYBACK
  // ═════════════════════════════════════════════════════════════
  function togglePlay() {
    const playing = !State.get('isPlaying');
    State.set('isPlaying', playing);
    btnPlay.textContent = playing ? '⏸' : '▶';
    if (playing) startLoop();
    else stopLoop();
  }

  function resetPlayback() {
    State.set('isPlaying', false);
    btnPlay.textContent = '▶';
    stopLoop();
    State.set('currentIndex', 0);
  }

  function slower() {
    const s = State.get('playSpeed');
    State.set('playSpeed', Math.max(1, s / 2));
    updateSpeedDisplay();
  }

  function faster() {
    const s = State.get('playSpeed');
    State.set('playSpeed', Math.min(16, s * 2));
    updateSpeedDisplay();
  }

  function updateSpeedDisplay() {
    speedDisp.textContent = State.get('playSpeed') + 'x';
  }

  // ── animation loop ────────────────────────────────────────────
  function startLoop() {
    frameCount = 0;
    function step() {
      if (!State.get('isPlaying')) return;

      frameCount++;
      const speed = State.get('playSpeed');
      const fpStep = FRAMES_PER_STEP[speed] || 1;

      if (frameCount >= fpStep) {
        frameCount = 0;
        const idx  = State.get('currentIndex');
        const data = State.get('data');
        if (data && idx < data.length - 1) {
          State.set('currentIndex', idx + 1);
        } else {
          // reached end
          State.set('isPlaying', false);
          btnPlay.textContent = '▶';
          return;
        }
      }
      rafId = requestAnimationFrame(step);
    }
    rafId = requestAnimationFrame(step);
  }

  function stopLoop() {
    if (rafId) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
  }

  // ═════════════════════════════════════════════════════════════
  //  TIMELINE TICKS
  // ═════════════════════════════════════════════════════════════
  function renderTicks(data) {
    if (!ticksContainer || !data || data.length === 0) return;
    ticksContainer.innerHTML = '';

    TICK_EVENTS.forEach(ev => {
      // find closest index
      let bestIdx = 0;
      let bestDist = Infinity;
      for (let i = 0; i < data.length; i++) {
        const dist = Math.abs(data[i].age_bp - ev.ageBP);
        if (dist < bestDist) { bestDist = dist; bestIdx = i; }
      }
      const pct = (bestIdx / (data.length - 1)) * 100;

      const mark = document.createElement('div');
      mark.className = 'tick-mark' + (ev.highlight ? ' highlight' : '');
      mark.style.left = pct + '%';

      const line = document.createElement('div');
      line.className = 'tick-line';

      const label = document.createElement('div');
      label.className = 'tick-label';
      label.textContent = ev.label;

      mark.appendChild(line);
      mark.appendChild(label);
      ticksContainer.appendChild(mark);
    });
  }

  // ── public API for keyboard shortcuts ─────────────────────────
  function advance(steps) {
    const data = State.get('data');
    if (!data) return;
    const idx = State.get('currentIndex');
    State.set('currentIndex', Math.min(data.length - 1, Math.max(0, idx + steps)));
  }

  function setSpeed(s) {
    State.set('playSpeed', s);
    updateSpeedDisplay();
  }

  return Object.freeze({ init, togglePlay, resetPlayback, advance, setSpeed });
})();
