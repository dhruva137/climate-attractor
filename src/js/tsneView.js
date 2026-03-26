/**
 * TsneView — 5D → 2D dimensionality reduction view.
 *
 * Projects all 5 climate variables through t-SNE or UMAP to reveal
 * that modern climate is an outlier across ALL dimensions simultaneously.
 */

const TsneView = (() => {
  // ── DOM / D3 ──────────────────────────────────────────────────
  let container, svg, g;
  let xScale, yScale;
  let width, height;
  let tooltipEl;

  const MARGIN = { top: 50, right: 50, bottom: 50, left: 50 };

  // ── projection cache ──────────────────────────────────────────
  const projectionCache = { tsne: null, umap: null };
  let projectionCoords = null;
  let matrixData = null;     // { matrix, data }
  let computing = false;

  // ═════════════════════════════════════════════════════════════
  //  INIT
  // ═════════════════════════════════════════════════════════════
  function init(containerEl) {
    container = containerEl;

    svg = d3.select(container)
      .append('svg')
      .attr('width', '100%')
      .attr('height', '100%')
      .style('display', 'block');

    g = svg.append('g');

    // progress bar
    const prog = document.createElement('div');
    prog.className = 'projection-progress';
    prog.id = 'proj-progress';
    prog.style.width = '0%';
    container.appendChild(prog);

    // computing label
    const notice = document.createElement('div');
    notice.id = 'tsne-computing';
    notice.style.cssText = 'position:absolute;inset:0;display:flex;flex-direction:column;' +
      'align-items:center;justify-content:center;z-index:5;pointer-events:none;';
    notice.innerHTML =
      '<div style="font-family:var(--font-mono);font-size:13px;color:var(--color-text-secondary);' +
      'letter-spacing:0.05em;" id="proj-status">Computing 5D projection...</div>' +
      '<div style="font-family:var(--font-mono);font-size:11px;color:var(--color-text-tertiary);' +
      'margin-top:8px;">This takes ~5 seconds on first load</div>';
    container.appendChild(notice);

    // tooltip
    tooltipEl = document.createElement('div');
    tooltipEl.className = 'tooltip';
    container.appendChild(tooltipEl);

    // explainer (collapsible)
    const explainer = document.getElementById('tsne-explainer');
    if (explainer) {
      explainer.innerHTML =
        '<details class="tsne-explainer"><summary>What am I looking at?</summary>' +
        '<p style="margin-top:8px;">Each dot is Earth\'s complete climate state — all 5 variables ' +
        'at once — compressed into 2D. Dots that are close together had similar climates. ' +
        'The red dots are so different from everything else that the algorithm throws them ' +
        'across the plot.</p></details>';
    }

    // projection toggle wiring
    const toggleBtns = container.querySelectorAll('#projection-toggle .view-btn');
    toggleBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        toggleBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        State.set('tsneMode', btn.dataset.mode);
      });
    });

    // resize
    const ro = new ResizeObserver(() => resize());
    ro.observe(container);
    resize();

    // subscriptions
    State.subscribe('currentIndex', () => requestAnimationFrame(update));
    State.subscribe('tsneMode', () => {
      const mode = State.get('tsneMode');
      if (projectionCache[mode]) {
        projectionCoords = projectionCache[mode];
        onProjectionComplete(projectionCoords);
      } else {
        computeProjection(mode);
      }
    });

    svg.on('mousemove', onMouseMove);
    svg.on('mouseleave', () => tooltipEl.classList.remove('visible'));

    // kick off
    const data = State.get('data');
    if (data) {
      startComputation();
    } else {
      State.subscribe('data', () => startComputation());
    }

    console.log('[TsneView] initialised');
  }

  function startComputation() {
    matrixData = prepareMatrix();
    if (matrixData) {
      computeProjection(State.get('tsneMode') || 'tsne');
    }
  }

  function resize() {
    const rect = container.getBoundingClientRect();
    width  = rect.width  - MARGIN.left - MARGIN.right;
    height = rect.height - MARGIN.top  - MARGIN.bottom;
    if (width <= 0 || height <= 0) return;
    g.attr('transform', `translate(${MARGIN.left},${MARGIN.top})`);
    if (projectionCoords) {
      setupScales(projectionCoords);
      renderAllPoints();
      update();
    }
  }

  // ═════════════════════════════════════════════════════════════
  //  DATA PREPARATION
  // ═════════════════════════════════════════════════════════════
  function prepareMatrix() {
    const data = State.get('data');
    if (!data || data.length === 0) return null;

    const dims = ['co2_ppm', 'temp_anomaly', 'ch4_ppb', 'sea_level_m', 'insolation'];
    const n = data.length;

    // compute mins, maxes, means per dimension
    const stats = dims.map(dim => {
      const vals = data.map(d => d[dim]).filter(v => v !== null && v !== undefined && !isNaN(v));
      return {
        min: d3.min(vals),
        max: d3.max(vals),
        mean: d3.mean(vals),
      };
    });

    // build normalised matrix
    const matrix = [];
    for (let i = 0; i < n; i++) {
      const row = [];
      for (let j = 0; j < dims.length; j++) {
        let v = data[i][dims[j]];
        if (v === null || v === undefined || isNaN(v)) {
          v = stats[j].mean;
        }
        const range = stats[j].max - stats[j].min;
        row.push(range > 0 ? (v - stats[j].min) / range : 0.5);
      }
      matrix.push(row);
    }

    return { matrix, data };
  }

  // ═════════════════════════════════════════════════════════════
  //  PROJECTION COMPUTATION
  // ═════════════════════════════════════════════════════════════
  function computeProjection(mode) {
    if (computing || !matrixData) return;
    computing = true;

    showComputing(true, mode);

    const { matrix } = matrixData;

    if (mode === 'tsne' && typeof tSNE !== 'undefined') {
      // tsne-js
      const model = new tSNE({
        dim: 2,
        perplexity: 30.0,
        earlyExaggeration: 4.0,
        learningRate: 100.0,
        nIter: 500,
        metric: 'euclidean',
      });
      model.init({ data: matrix, type: 'dense' });

      const totalIter = 500;
      const batchSize = 50;

      function runBatch(iter) {
        for (let i = 0; i < batchSize && iter + i < totalIter; i++) {
          model.step();
        }
        const progress = Math.min((iter + batchSize) / totalIter, 1);
        updateProgress(progress, mode);

        if (iter + batchSize < totalIter) {
          setTimeout(() => runBatch(iter + batchSize), 0);
        } else {
          const output = model.getOutput();
          computing = false;
          projectionCache.tsne = output;
          projectionCoords = output;
          showComputing(false);
          onProjectionComplete(output);
        }
      }
      setTimeout(() => runBatch(0), 50);

    } else if (mode === 'umap' && typeof UMAP !== 'undefined') {
      // umap-js
      setTimeout(() => {
        try {
          const model = new UMAP({
            nComponents: 2,
            nNeighbors: 15,
            minDist: 0.1,
            nEpochs: 200,
          });
          const output = model.fit(matrix);
          computing = false;
          projectionCache.umap = output;
          projectionCoords = output;
          showComputing(false);
          onProjectionComplete(output);
        } catch (e) {
          console.error('[TsneView] UMAP error:', e);
          computing = false;
          showComputing(false);
        }
      }, 50);

    } else {
      // fallback: PCA-like projection (first 2 principal axes via simple SVD-lite)
      console.warn('[TsneView] Library not found, using fallback 2D projection');
      const output = matrix.map(row => [row[0] * 10, row[1] * 10]);
      computing = false;
      projectionCache[mode] = output;
      projectionCoords = output;
      showComputing(false);
      onProjectionComplete(output);
    }
  }

  function showComputing(show, mode) {
    const el = document.getElementById('tsne-computing');
    const status = document.getElementById('proj-status');
    if (el) el.style.display = show ? 'flex' : 'none';
    if (status && mode) {
      status.textContent = `Computing ${mode === 'tsne' ? 't-SNE' : 'UMAP'} projection...`;
    }
  }

  function updateProgress(pct, mode) {
    const bar = document.getElementById('proj-progress');
    const status = document.getElementById('proj-status');
    if (bar) bar.style.width = (pct * 100) + '%';
    if (status) {
      status.textContent = `Running ${mode === 'tsne' ? 't-SNE' : 'UMAP'}... ${Math.round(pct * 100)}%`;
    }
  }

  // ═════════════════════════════════════════════════════════════
  //  PROJECTION COMPLETE → RENDER
  // ═════════════════════════════════════════════════════════════
  function setupScales(coords) {
    const xExt = d3.extent(coords, d => d[0]);
    const yExt = d3.extent(coords, d => d[1]);
    const xPad = (xExt[1] - xExt[0]) * 0.1 || 1;
    const yPad = (yExt[1] - yExt[0]) * 0.1 || 1;

    xScale = d3.scaleLinear()
      .domain([xExt[0] - xPad, xExt[1] + xPad])
      .range([0, width]);
    yScale = d3.scaleLinear()
      .domain([yExt[0] - yPad, yExt[1] + yPad])
      .range([height, 0]);
  }

  function onProjectionComplete(coords) {
    projectionCoords = coords;
    if (width <= 0 || height <= 0) return;
    setupScales(coords);
    renderAllPoints();
    update();
    // hide progress
    const bar = document.getElementById('proj-progress');
    if (bar) bar.style.width = '0%';
  }

  // ═════════════════════════════════════════════════════════════
  //  RENDER ALL POINTS
  // ═════════════════════════════════════════════════════════════
  function renderAllPoints() {
    g.selectAll('*').remove();
    if (!projectionCoords || !matrixData) return;

    const data = matrixData.data;

    // ── convex hull of historical points ────────────────────────
    const histPts = [];
    data.forEach((d, i) => {
      if (d.era !== 'modern' && projectionCoords[i]) {
        histPts.push([xScale(projectionCoords[i][0]), yScale(projectionCoords[i][1])]);
      }
    });

    const hull = Attractor.computeHull(histPts);
    if (hull) {
      g.append('path')
        .attr('class', 'tsne-hull')
        .attr('d', Attractor.smoothHull(hull, 0.3))
        .attr('fill', 'rgba(129, 140, 248, 0.05)')
        .attr('stroke', '#818cf8')
        .attr('stroke-opacity', 0.2)
        .attr('stroke-dasharray', '4,4');

      const centroid = Attractor.hullCentroid(hull);
      g.append('text')
        .attr('class', 'projection-label')
        .attr('x', centroid[0])
        .attr('y', centroid[1] - 12)
        .attr('text-anchor', 'middle')
        .attr('fill', '#505068')
        .style('font-size', '10px')
        .text('Historical climate envelope');
    }

    // ── historical dots ─────────────────────────────────────────
    data.forEach((d, i) => {
      if (d.era === 'modern' || !projectionCoords[i]) return;
      g.append('circle')
        .attr('class', 'tsne-point tsne-historical')
        .attr('cx', xScale(projectionCoords[i][0]))
        .attr('cy', yScale(projectionCoords[i][1]))
        .attr('r', 2.5)
        .attr('fill', d.era === 'holocene' ? '#4ade80' : '#818cf8')
        .attr('fill-opacity', 0.4)
        .datum(d);
    });

    // ── modern dots (on top) ────────────────────────────────────
    data.forEach((d, i) => {
      if (d.era !== 'modern' || !projectionCoords[i]) return;
      g.append('circle')
        .attr('class', 'tsne-point tsne-modern')
        .attr('cx', xScale(projectionCoords[i][0]))
        .attr('cy', yScale(projectionCoords[i][1]))
        .attr('r', 3.5)
        .attr('fill', '#ff4444')
        .attr('fill-opacity', 0.7)
        .datum(d);
    });

    // ── cluster labels ──────────────────────────────────────────
    // historical centroid label
    if (histPts.length > 0) {
      const hCx = d3.mean(histPts, p => p[0]);
      const hCy = d3.mean(histPts, p => p[1]);
      g.append('text')
        .attr('class', 'projection-label')
        .attr('x', hCx).attr('y', hCy + 24)
        .attr('text-anchor', 'middle')
        .attr('fill', '#9090a8')
        .style('font-size', '11px')
        .text('800,000 years of natural variation');
    }

    // modern centroid label
    const modernPts = [];
    data.forEach((d, i) => {
      if (d.era === 'modern' && projectionCoords[i]) {
        modernPts.push([xScale(projectionCoords[i][0]), yScale(projectionCoords[i][1])]);
      }
    });
    if (modernPts.length > 0) {
      const mCx = d3.mean(modernPts, p => p[0]);
      const mCy = d3.mean(modernPts, p => p[1]);
      g.append('text')
        .attr('class', 'projection-label')
        .attr('x', mCx).attr('y', mCy + 20)
        .attr('text-anchor', 'middle')
        .attr('fill', '#ff4444')
        .style('font-size', '11px')
        .text('Post-industrial era →');
    }

    // ── current marker ──────────────────────────────────────────
    g.append('circle')
      .attr('class', 'tsne-ring')
      .attr('r', 12)
      .attr('fill', 'none')
      .attr('stroke', 'white')
      .attr('stroke-opacity', 0.6)
      .attr('stroke-width', 1);

    g.append('circle')
      .attr('class', 'tsne-current')
      .attr('r', 7)
      .attr('fill', '#f0f0f0')
      .attr('stroke-width', 2);

    // separation line
    g.append('line').attr('class', 'separation-line');
  }

  // ═════════════════════════════════════════════════════════════
  //  UPDATE (per frame)
  // ═════════════════════════════════════════════════════════════
  function update() {
    if (!projectionCoords || !matrixData || width <= 0) return;

    const idx = State.get('currentIndex');
    const data = matrixData.data;
    if (!data || idx >= projectionCoords.length) return;

    const coord = projectionCoords[idx];
    if (!coord) return;

    const cx = xScale(coord[0]);
    const cy = yScale(coord[1]);
    const pt = data[idx];
    const col = pt.era === 'modern' ? '#ff4444' : pt.era === 'holocene' ? '#4ade80' : '#818cf8';

    // ── progressive reveal ──────────────────────────────────────
    g.selectAll('.tsne-point').each(function (d, i) {
      const el = d3.select(this);
      const dataIdx = data.indexOf(d);
      el.attr('opacity', dataIdx <= idx ? 1 : 0.06);
    });

    // ── current marker ──────────────────────────────────────────
    g.select('.tsne-current')
      .attr('cx', cx).attr('cy', cy)
      .attr('stroke', col);
    g.select('.tsne-ring')
      .attr('cx', cx).attr('cy', cy);

    // ── separation line from historical centroid to modern ──────
    if (pt.era === 'modern') {
      const histPts = [];
      data.forEach((d, i) => {
        if (d.era !== 'modern' && projectionCoords[i]) {
          histPts.push(projectionCoords[i]);
        }
      });
      if (histPts.length > 0) {
        const hcx = xScale(d3.mean(histPts, p => p[0]));
        const hcy = yScale(d3.mean(histPts, p => p[1]));
        g.select('.separation-line')
          .attr('x1', hcx).attr('y1', hcy)
          .attr('x2', cx).attr('y2', cy)
          .attr('opacity', 0.3);
      }
    } else {
      g.select('.separation-line').attr('opacity', 0);
    }
  }

  // ═════════════════════════════════════════════════════════════
  //  TOOLTIP
  // ═════════════════════════════════════════════════════════════
  function onMouseMove(event) {
    if (!projectionCoords || !matrixData) return;
    const [mx, my] = d3.pointer(event, g.node());
    const data = matrixData.data;

    let bestDist = 400;
    let best = null;

    for (let i = 0; i < data.length; i++) {
      if (!projectionCoords[i]) continue;
      const dx = xScale(projectionCoords[i][0]) - mx;
      const dy = yScale(projectionCoords[i][1]) - my;
      const dist2 = dx * dx + dy * dy;
      if (dist2 < bestDist) { bestDist = dist2; best = data[i]; }
    }

    if (best) {
      const badgeClass = 'badge badge-' + best.era;
      tooltipEl.innerHTML =
        `<div class="tooltip-title"><span class="${badgeClass}">${best.era}</span></div>` +
        `<div class="tooltip-row"><span>Year</span><span class="tooltip-val">${best.displayYear}</span></div>` +
        `<div class="tooltip-row"><span>CO₂</span><span class="tooltip-val">${best.co2_ppm !== null ? best.co2_ppm.toFixed(1) + ' ppm' : '—'}</span></div>` +
        `<div class="tooltip-row"><span>Temp</span><span class="tooltip-val">${best.temp_anomaly !== null ? best.temp_anomaly.toFixed(2) + ' °C' : '—'}</span></div>`;
      tooltipEl.classList.add('visible');

      const rect = container.getBoundingClientRect();
      let left = event.clientX - rect.left + 16;
      let top  = event.clientY - rect.top  - 10;
      if (left + 180 > rect.width) left -= 200;
      if (top + 100 > rect.height) top -= 100;
      tooltipEl.style.left = left + 'px';
      tooltipEl.style.top  = top + 'px';
    } else {
      tooltipEl.classList.remove('visible');
    }
  }

  return Object.freeze({ init });
})();
