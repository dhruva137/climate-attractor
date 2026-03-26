/**
 * dataLoader — Fetches and prepares climate_800k.json for the app.
 *
 * Loads data, filters unusable rows, sorts chronologically,
 * computes display-friendly year labels, and stores in State.
 */

async function loadClimateData() {
  const DATA_URL = '/data/processed/climate_800k.json';
  const container = document.getElementById('viz-canvas-container');

  // ── show loading if slow ──────────────────────────────────────
  let loadingEl = null;
  const loadingTimer = setTimeout(() => {
    loadingEl = document.createElement('div');
    loadingEl.className = 'loading-overlay';
    loadingEl.textContent = 'LOADING DATA…';
    if (container) container.appendChild(loadingEl);
  }, 200);

  try {
    const resp = await fetch(DATA_URL);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const payload = await resp.json();

    let data = payload.data;
    if (!data || !Array.isArray(data)) {
      throw new Error('Invalid JSON structure — expected "data" array');
    }

    // ── filter: drop rows with null co2 (unusable for phase portrait)
    data = data.filter(d => d.co2_ppm !== null && d.co2_ppm !== undefined);

    // ── sort by age_bp descending → oldest first, present last
    // (age_bp 800000 = oldest, 0 = present)
    data.sort((a, b) => b.age_bp - a.age_bp);

    // ── compute display fields ──────────────────────────────────
    data.forEach(d => {
      // age_bp is years Before Present (1950).  year_ce is already in JSON.
      const ce = d.year_ce;
      if (d.age_bp >= 1000) {
        d.displayYear = `${d.age_bp.toLocaleString()} BP`;
      } else if (ce < 0) {
        d.displayYear = `${Math.abs(ce)} BCE`;
      } else {
        d.displayYear = `${ce} CE`;
      }
    });

    // ── store ───────────────────────────────────────────────────
    State.set('data', data);
    State.set('currentIndex', data.length - 1); // start at present

    console.log(`[dataLoader] ${data.length} points loaded (${data[0].displayYear} → ${data[data.length - 1].displayYear})`);
    return data;

  } catch (err) {
    console.error('[dataLoader]', err);
    // show error in UI
    if (container) {
      container.innerHTML = `
        <div class="error-message">
          <strong>⚠ Data not found</strong><br><br>
          Could not load <code>${DATA_URL}</code>.<br><br>
          Make sure you've run the data pipeline first:<br>
          <code>python scripts/process_data.py</code><br><br>
          Then serve the app from the project root:<br>
          <code>npx -y serve .</code>
        </div>`;
    }
    return null;

  } finally {
    clearTimeout(loadingTimer);
    if (loadingEl && loadingEl.parentNode) {
      loadingEl.parentNode.removeChild(loadingEl);
    }
  }
}
