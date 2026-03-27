/**
 * Citations — Data sources, methodology, and modal content.
 */

const Citations = (() => {

  const SOURCES = [
    { id: 'epica-co2', variable: 'CO₂', shortName: 'Lüthi et al. 2008',
      fullName: 'High-resolution CO₂ record 650,000–800,000 years before present',
      journal: 'Nature', year: 2008, doi: '10.1038/nature06949', timeRange: '800,000 – 22,000 BP' },
    { id: 'epica-ch4', variable: 'CH₄', shortName: 'Loulergue et al. 2008',
      fullName: 'Orbital and millennial-scale features of atmospheric CH₄ over the past 800,000 years',
      journal: 'Nature', year: 2008, doi: '10.1038/nature06950', timeRange: '800,000 – 22,000 BP' },
    { id: 'epica-temp', variable: 'Temperature', shortName: 'Jouzel et al. 2007',
      fullName: 'Orbital and millennial Antarctic climate variability over the past 800,000 years',
      journal: 'Science', year: 2007, doi: '10.1126/science.1141038', timeRange: '800,000 – 0 BP' },
    { id: 'mauna-loa', variable: 'CO₂ (modern)', shortName: 'Keeling / Scripps',
      fullName: 'Atmospheric CO₂ concentrations (Mauna Loa Observatory)',
      journal: 'Scripps CO₂ Program', year: 2026, doi: null, timeRange: '1958 – 2026' },
    { id: 'gistemp', variable: 'Temp (modern)', shortName: 'GISTEMP v4',
      fullName: 'GISS Surface Temperature Analysis v4',
      journal: 'NASA GISS', year: 2026, doi: '10.1029/2018JD029522', timeRange: '1880 – 2026' },
    { id: 'laskar', variable: 'Insolation', shortName: 'Laskar et al. 2004',
      fullName: 'A long-term numerical solution for the insolation quantities of the Earth',
      journal: 'Astronomy & Astrophysics', year: 2004, doi: '10.1051/0004-6361:20041335', timeRange: '800,000 – 0 BP' },
  ];

  const CITE_TEXT = 'Climate Attractor (2026). Interactive visualization of 800,000 years of Earth climate data. https://climate-attractor.vercel.app';

  function init() {
    populateModal();
    console.log('[Citations] modal populated');
  }

  function populateModal() {
    const card = document.querySelector('#methodology-modal .modal-card');
    if (!card) return;

    // build sources table
    const rows = SOURCES.map(s => {
      const doiLink = s.doi
        ? `<a href="https://doi.org/${s.doi}" target="_blank" rel="noopener" style="color:var(--color-accent)">${s.doi}</a>`
        : '—';
      return `<tr><td>${s.variable}</td><td>${s.shortName}</td><td>${s.timeRange}</td><td>${doiLink}</td></tr>`;
    }).join('');

    card.innerHTML = `
      <button class="modal-close" id="modal-close-btn" aria-label="Close">✕</button>
      <h2>Methodology</h2>

      <div class="modal-section">
        <h3>Overview</h3>
        <p>Climate Attractor visualises Earth's climate state as a trajectory through a multi-dimensional phase space.
        Each point is a 1,000-year averaged snapshot of CO₂, CH₄, temperature anomaly, sea-level, and orbital insolation.
        An "attractor" is the set of states a dynamical system naturally visits. The modern breakout
        shows Earth leaving its 800,000-year attractor for the first time.</p>
      </div>

      <div class="modal-section">
        <h3>Data Sources</h3>
        <table style="width:100%;border-collapse:collapse;font-size:11px;font-family:var(--font-mono);">
          <thead><tr style="border-bottom:1px solid var(--color-border);color:var(--color-text-tertiary);">
            <th style="text-align:left;padding:6px 8px;">Variable</th>
            <th style="text-align:left;padding:6px 8px;">Source</th>
            <th style="text-align:left;padding:6px 8px;">Period</th>
            <th style="text-align:left;padding:6px 8px;">DOI</th>
          </tr></thead>
          <tbody style="color:var(--color-text-secondary);">${rows}</tbody>
        </table>
      </div>

      <div class="modal-section">
        <h3>Processing Pipeline</h3>
        <p>Raw NOAA files → pandas parsing → AICC2012 timescale → 1,000-year linear interpolation grid → modern splice at 1850 CE.</p>
        <pre style="background:rgba(255,255,255,0.03);padding:12px;border-radius:4px;font-size:11px;overflow-x:auto;"><code>time_axis = np.arange(0, 801000, 1000)  # years BP
f = interp1d(age_bp, co2, bounds_error=False, fill_value=np.nan)
co2_interp = f(time_axis)</code></pre>
      </div>

      <div class="modal-section">
        <h3>Dimensionality Reduction</h3>
        <p>t-SNE (perplexity 30, 500 iter, ε=100, euclidean) and UMAP (15 neighbors, min_dist 0.1, 200 epochs)
        are computed client-side from the 5-variable state vector after min-max normalisation.</p>
      </div>

      <div class="modal-section">
        <h3>Uncertainty</h3>
        <p>AICC2012 age models carry ±500–1500 yr uncertainty in older sections. CO₂ ±1–3 ppm, CH₄ ±10 ppb,
        temperature ±0.5 °C. Sea level is synthesised (ΔT × 15 m/°C) — real data (Hibbert et al.) planned for v2.</p>
      </div>

      <div class="modal-section">
        <h3>How to Cite</h3>
        <pre id="cite-block" style="background:rgba(255,255,255,0.03);padding:12px;border-radius:4px;font-size:11px;cursor:pointer;user-select:all;">${CITE_TEXT}</pre>
        <button id="btn-copy-cite" style="margin-top:8px;background:transparent;border:1px solid var(--color-border);
          color:var(--color-text-tertiary);font-family:var(--font-mono);font-size:10px;padding:4px 12px;
          border-radius:3px;cursor:pointer;">Copy citation</button>
      </div>

      <div class="modal-section">
        <h3>Download Data</h3>
        <a href="/data/processed/climate_800k.json" download style="display:inline-block;background:transparent;
          border:1px solid var(--color-border);color:var(--color-accent);font-family:var(--font-mono);font-size:11px;
          padding:8px 16px;border-radius:4px;text-decoration:none;transition:border-color 0.3s;">
          ↓ Download processed dataset (JSON)</a>
        <div style="margin-top:6px;font-size:10px;color:var(--color-text-tertiary);font-family:var(--font-mono);">
          800,000 years · 5 variables · 1,000-year grid · 185 KB</div>
      </div>
<div style="margin-top:24px; padding-top:24px;
            border-top:1px solid var(--color-border);">
  <div style="display:flex; align-items:center;
              justify-content:space-between;
              padding:16px;
              background:var(--color-surface);
              border:1px solid var(--color-border);
              border-radius:8px;">
    <div>
      <span style="display:block; font-family:var(--font-mono);
                   font-size:13px; font-weight:500;
                   color:var(--color-text-primary);">
        Dhruva P Gowda
      </span>
      <span style="display:block; font-family:var(--font-mono);
                   font-size:11px; color:var(--color-text-tertiary);
                   margin-top:4px;">
        Design, data pipeline, visualization
      </span>
    </div>
    <a href="https://github.com/dhruva137"
       target="_blank"
       rel="noopener noreferrer"
       style="display:inline-flex; align-items:center; gap:8px;
              font-family:var(--font-mono); font-size:12px;
              color:var(--color-text-secondary);
              text-decoration:none;
              border:1px solid var(--color-border);
              padding:8px 14px; border-radius:6px;
              transition:all 150ms ease;">
      github.com/dhruva137
    </a>
  </div>
</div>
    `;

    // re-wire close button
    document.getElementById('modal-close-btn').addEventListener('click', () => {
      document.getElementById('methodology-modal').classList.remove('open');
    });

    // copy citation
    const copyBtn = document.getElementById('btn-copy-cite');
    if (copyBtn) {
      copyBtn.addEventListener('click', () => {
        navigator.clipboard.writeText(CITE_TEXT).then(() => {
          copyBtn.textContent = '✓ Copied';
          setTimeout(() => { copyBtn.textContent = 'Copy citation'; }, 2000);
        });
      });
    }
  }

  return Object.freeze({ init, SOURCES });
})();
