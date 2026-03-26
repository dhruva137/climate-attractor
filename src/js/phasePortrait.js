/**
 * PhasePortrait — D3.js CO₂ vs Temperature phase portrait with attractor hull.
 *
 * The hero visualisation: shows the climate attractor forming over 800 kyr
 * then breaking out in the modern era.
 */

const PhasePortrait = (() => {
  // ── DOM / D3 refs ─────────────────────────────────────────────
  let container, svg, g;
  let xScale, yScale, xAxis, yAxis;
  let width, height;

  // ── layers (SVG groups, ordered back→front) ───────────────────
  let gGrid, gRef, gHull, gHistTrail, gActiveTrail, gModernTrail;
  let gAnnotations, gMarker, gTooltip;

  // ── cached generators ─────────────────────────────────────────
  let lineGen;

  // ── state ─────────────────────────────────────────────────────
  let lastHullIndex = -10;
  let cachedHull = null;
  let tooltipEl = null;
  let data = null;

  const MARGIN = { top: 40, right: 40, bottom: 60, left: 70 };
  const X_DOMAIN = [170, 430];
  const Y_DOMAIN = [-10.5, 4];

  // ── annotation definitions ────────────────────────────────────
  const ANNOTATIONS = [
    { id: 'lgm',      ageBP: 21000,  label: 'Last Glacial Maximum',  dx: 10,  dy: -14 },
    { id: 'lig',      ageBP: 125000, label: 'Last Interglacial',     dx: 10,  dy: 14  },
    { id: 'indust',   ageBP: 100,    label: 'Industrial Revolution', dx: -10, dy: -14 },
    { id: 'youhere',  ageBP: 0,      label: 'You are here',          dx: -10, dy: -14 },
  ];

  // ═════════════════════════════════════════════════════════════
  //  INIT
  // ═════════════════════════════════════════════════════════════
  function init(containerEl) {
    container = containerEl;

    // SVG
    svg = d3.select(container)
      .append('svg')
      .attr('width', '100%')
      .attr('height', '100%')
      .style('display', 'block');

    g = svg.append('g');

    // layer ordering (back to front)
    gGrid        = g.append('g').attr('class', 'layer-grid');
    gRef         = g.append('g').attr('class', 'layer-ref');
    gHull        = g.append('g').attr('class', 'layer-hull');
    gHistTrail   = g.append('g').attr('class', 'layer-hist');
    gActiveTrail = g.append('g').attr('class', 'layer-active');
    gModernTrail = g.append('g').attr('class', 'layer-modern');
    gAnnotations = g.append('g').attr('class', 'layer-annotations');
    gMarker      = g.append('g').attr('class', 'layer-marker');

    // persistent elements
    gHull.append('path').attr('class', 'hull-path');
    gHull.append('text').attr('class', 'hull-label');
    gHistTrail.append('path').attr('class', 'hist-path');
    gActiveTrail.append('path').attr('class', 'active-path');
    gModernTrail.append('path').attr('class', 'modern-path');
    gMarker.append('circle').attr('class', 'current-marker');
    gMarker.append('circle').attr('class', 'pulse-ring');

    // tooltip
    tooltipEl = document.createElement('div');
    tooltipEl.className = 'tooltip';
    container.appendChild(tooltipEl);

    // annotation stubs
    ANNOTATIONS.forEach(a => {
      const ag = gAnnotations.append('g')
        .attr('class', 'phase-annotation')
        .attr('id', 'anno-' + a.id);
      ag.append('line').attr('class', 'anno-leader');
      ag.append('text').attr('class', 'anno-text').text(a.label);
    });

    // scales
    xScale = d3.scaleLinear().domain(X_DOMAIN);
    yScale = d3.scaleLinear().domain(Y_DOMAIN);

    // line generator
    lineGen = d3.line()
      .defined(d => d.co2_ppm !== null && d.temp_anomaly !== null)
      .x(d => xScale(d.co2_ppm))
      .y(d => yScale(d.temp_anomaly));

    // resize observer
    const ro = new ResizeObserver(() => resize());
    ro.observe(container);
    resize();

    // ── subscribe to state ──────────────────────────────────────
    State.subscribe('currentIndex', () => {
      requestAnimationFrame(render);
    });

    State.subscribe('data', d => {
      data = d;
      resize();
    });

    data = State.get('data');

    // tooltip interaction
    svg.on('mousemove', onMouseMove);
    svg.on('mouseleave', () => { tooltipEl.classList.remove('visible'); });

    console.log('[PhasePortrait] initialised');
  }

  // ═════════════════════════════════════════════════════════════
  //  RESIZE
  // ═════════════════════════════════════════════════════════════
  function resize() {
    const rect = container.getBoundingClientRect();
    width  = rect.width  - MARGIN.left - MARGIN.right;
    height = rect.height - MARGIN.top  - MARGIN.bottom;
    if (width <= 0 || height <= 0) return;

    g.attr('transform', `translate(${MARGIN.left},${MARGIN.top})`);
    xScale.range([0, width]);
    yScale.range([height, 0]);

    drawAxes();
    drawRefLines();
    render();
  }

  // ═════════════════════════════════════════════════════════════
  //  AXES
  // ═════════════════════════════════════════════════════════════
  function drawAxes() {
    gGrid.selectAll('.x-axis,.y-axis,.axis-label').remove();

    // x grid + axis
    gGrid.append('g')
      .attr('class', 'x-axis')
      .attr('transform', `translate(0,${height})`)
      .call(d3.axisBottom(xScale).ticks(8).tickSize(-height))
      .call(g => {
        g.selectAll('.tick line')
          .attr('stroke', 'rgba(255,255,255,0.06)');
        g.selectAll('.tick text')
          .attr('fill', '#505068')
          .style('font-family', 'var(--font-mono)')
          .style('font-size', '11px');
        g.select('.domain').remove();
      });

    // y grid + axis
    gGrid.append('g')
      .attr('class', 'y-axis')
      .call(d3.axisLeft(yScale).ticks(6).tickSize(-width))
      .call(g => {
        g.selectAll('.tick line')
          .attr('stroke', 'rgba(255,255,255,0.06)');
        g.selectAll('.tick text')
          .attr('fill', '#505068')
          .style('font-family', 'var(--font-mono)')
          .style('font-size', '11px');
        g.select('.domain').remove();
      });

    // axis labels
    gGrid.append('text')
      .attr('class', 'axis-label')
      .attr('x', width / 2)
      .attr('y', height + 46)
      .attr('text-anchor', 'middle')
      .attr('fill', '#505068')
      .style('font-family', 'var(--font-mono)')
      .style('font-size', '11px')
      .text('CO₂ (ppm)');

    gGrid.append('text')
      .attr('class', 'axis-label')
      .attr('x', -height / 2)
      .attr('y', -50)
      .attr('text-anchor', 'middle')
      .attr('transform', 'rotate(-90)')
      .attr('fill', '#505068')
      .style('font-family', 'var(--font-mono)')
      .style('font-size', '11px')
      .text('Temperature Anomaly (°C)');
  }

  // ═════════════════════════════════════════════════════════════
  //  REFERENCE LINES
  // ═════════════════════════════════════════════════════════════
  function drawRefLines() {
    gRef.selectAll('*').remove();

    // CO₂ = 280 vertical
    const x280 = xScale(280);
    gRef.append('line')
      .attr('x1', x280).attr('x2', x280)
      .attr('y1', 0).attr('y2', height)
      .attr('stroke', '#505068').attr('stroke-opacity', 0.4)
      .attr('stroke-dasharray', '4,4');
    gRef.append('text')
      .attr('x', x280 + 6).attr('y', 14)
      .attr('fill', '#505068').attr('fill-opacity', 0.5)
      .style('font-family', 'var(--font-mono)')
      .style('font-size', '9px')
      .text('Pre-industrial (280 ppm)');

    // Temp = 0 horizontal
    const y0 = yScale(0);
    gRef.append('line')
      .attr('x1', 0).attr('x2', width)
      .attr('y1', y0).attr('y2', y0)
      .attr('stroke', '#505068').attr('stroke-opacity', 0.4)
      .attr('stroke-dasharray', '4,4');
    gRef.append('text')
      .attr('x', width - 4).attr('y', y0 - 6)
      .attr('text-anchor', 'end')
      .attr('fill', '#505068').attr('fill-opacity', 0.5)
      .style('font-family', 'var(--font-mono)')
      .style('font-size', '9px')
      .text('1950 baseline');
  }

  // ═════════════════════════════════════════════════════════════
  //  RENDER (called every frame)
  // ═════════════════════════════════════════════════════════════
  function render() {
    if (!data || data.length === 0 || width <= 0) return;

    const idx = State.get('currentIndex');
    const slice = data.slice(0, idx + 1);

    // ── classify into eras ──────────────────────────────────────
    const paleo   = slice.filter(d => d.era === 'paleoclimate');
    const holo    = slice.filter(d => d.era === 'holocene');
    const modern  = slice.filter(d => d.era === 'modern');
    const nonMod  = slice.filter(d => d.era !== 'modern');

    const current = data[idx];
    if (!current) return;

    // ── LAYER 1: historical ghost trail ─────────────────────────
    gHistTrail.select('.hist-path')
      .attr('d', lineGen(nonMod))
      .attr('fill', 'none')
      .attr('stroke', '#818cf8')
      .attr('stroke-opacity', 0.15)
      .attr('stroke-width', 1);

    // ── LAYER 2: convex hull ────────────────────────────────────
    if (paleo.length >= 3 && Math.abs(idx - lastHullIndex) >= 5) {
      const hullPts = paleo
        .filter(d => d.co2_ppm !== null && d.temp_anomaly !== null)
        .map(d => [xScale(d.co2_ppm), yScale(d.temp_anomaly)]);
      cachedHull = Attractor.computeHull(hullPts);
      lastHullIndex = idx;
    }

    if (cachedHull) {
      gHull.select('.hull-path')
        .attr('d', Attractor.smoothHull(cachedHull, 0.3))
        .attr('fill', 'rgba(79,195,247,0.06)')
        .attr('stroke', '#4fc3f7')
        .attr('stroke-opacity', 0.3)
        .attr('stroke-width', 1)
        .attr('stroke-dasharray', '4,4');

      const centroid = Attractor.hullCentroid(cachedHull);
      gHull.select('.hull-label')
        .attr('x', centroid[0])
        .attr('y', centroid[1])
        .attr('text-anchor', 'middle')
        .attr('fill', '#505068')
        .attr('fill-opacity', 0.5)
        .style('font-family', 'var(--font-mono)')
        .style('font-size', '10px')
        .text('Natural variability');
    }

    // ── LAYER 3: active trail (last 50 points) ──────────────────
    const trailStart = Math.max(0, idx - 50);
    const trail = data.slice(trailStart, idx + 1);

    gActiveTrail.select('.active-path')
      .attr('d', lineGen(trail))
      .attr('fill', 'none')
      .attr('stroke', eraColor(current.era))
      .attr('stroke-opacity', 0.7)
      .attr('stroke-width', 2)
      .attr('stroke-linecap', 'round');

    // ── MODERN trail (full red breakout line) ────────────────────
    if (modern.length > 0) {
      gModernTrail.select('.modern-path')
        .attr('d', lineGen(modern))
        .attr('fill', 'none')
        .attr('stroke', '#ff4444')
        .attr('stroke-opacity', 0.9)
        .attr('stroke-width', 2.5)
        .attr('stroke-linecap', 'round')
        .attr('class', 'modern-path trail-modern');
    } else {
      gModernTrail.select('.modern-path').attr('d', null);
    }

    // ── CURRENT POINT marker ────────────────────────────────────
    if (current.co2_ppm !== null && current.temp_anomaly !== null) {
      const cx = xScale(current.co2_ppm);
      const cy = yScale(current.temp_anomaly);
      const isModern = current.era === 'modern';
      const col = eraColor(current.era);

      gMarker.select('.current-marker')
        .attr('cx', cx).attr('cy', cy)
        .attr('r', 5)
        .attr('fill', '#f0f0f0')
        .attr('stroke', col)
        .attr('stroke-width', 2);

      // pulse ring (modern only)
      gMarker.select('.pulse-ring')
        .attr('cx', cx).attr('cy', cy)
        .attr('r', isModern ? 5 : 0)
        .attr('fill', 'none')
        .attr('stroke', '#ff4444')
        .attr('stroke-width', 1.5)
        .attr('class', isModern ? 'pulse-ring current-point-modern' : 'pulse-ring');
    }

    // ── ANNOTATIONS ─────────────────────────────────────────────
    updateAnnotations(idx, data);
  }

  // ═════════════════════════════════════════════════════════════
  //  ANNOTATIONS
  // ═════════════════════════════════════════════════════════════
  function updateAnnotations(idx, allData) {
    ANNOTATIONS.forEach(a => {
      const annoG = gAnnotations.select('#anno-' + a.id);

      // find the data point closest to this annotation's ageBP
      let pt = null;
      for (let i = 0; i <= idx && i < allData.length; i++) {
        if (Math.abs(allData[i].age_bp - a.ageBP) < 1500) {
          pt = allData[i];
          break;
        }
      }

      // "you are here" only shows when at the last point
      if (a.id === 'youhere') {
        pt = (idx >= allData.length - 3) ? allData[idx] : null;
      }

      if (pt && pt.co2_ppm !== null && pt.temp_anomaly !== null) {
        const px = xScale(pt.co2_ppm);
        const py = yScale(pt.temp_anomaly);

        annoG.classed('visible', true);

        annoG.select('.anno-leader')
          .attr('x1', px).attr('y1', py)
          .attr('x2', px + a.dx * 3).attr('y2', py + a.dy)
          .attr('stroke', '#505068').attr('stroke-opacity', 0.5)
          .attr('stroke-width', 0.5);

        annoG.select('.anno-text')
          .attr('x', px + a.dx * 3 + (a.dx > 0 ? 4 : -4))
          .attr('y', py + a.dy + 3)
          .attr('text-anchor', a.dx > 0 ? 'start' : 'end');
      } else {
        annoG.classed('visible', false);
      }
    });
  }

  // ═════════════════════════════════════════════════════════════
  //  TOOLTIP
  // ═════════════════════════════════════════════════════════════
  function onMouseMove(event) {
    if (!data) return;
    const [mx, my] = d3.pointer(event, g.node());
    const idx = State.get('currentIndex');

    let bestDist = 400; // 20px squared
    let best = null;

    const slice = data.slice(0, idx + 1);
    for (let i = 0; i < slice.length; i++) {
      const d = slice[i];
      if (d.co2_ppm === null || d.temp_anomaly === null) continue;
      const dx = xScale(d.co2_ppm) - mx;
      const dy = yScale(d.temp_anomaly) - my;
      const dist2 = dx * dx + dy * dy;
      if (dist2 < bestDist) { bestDist = dist2; best = d; }
    }

    if (best) {
      const era = best.era;
      const badgeClass = 'badge badge-' + era;
      tooltipEl.innerHTML = `
        <div class="tooltip-title">
          <span class="${badgeClass}">${era}</span>
        </div>
        <div class="tooltip-row"><span>Year</span><span class="tooltip-val">${best.displayYear}</span></div>
        <div class="tooltip-row"><span>CO₂</span><span class="tooltip-val">${best.co2_ppm !== null ? best.co2_ppm.toFixed(1) + ' ppm' : '—'}</span></div>
        <div class="tooltip-row"><span>Temp</span><span class="tooltip-val">${best.temp_anomaly !== null ? best.temp_anomaly.toFixed(2) + ' °C' : '—'}</span></div>
      `;
      tooltipEl.classList.add('visible');

      // position near cursor, keep in viewport
      const rect = container.getBoundingClientRect();
      let left = event.clientX - rect.left + 16;
      let top  = event.clientY - rect.top  - 10;
      if (left + 180 > rect.width) left = left - 200;
      if (top + 100 > rect.height) top = top - 100;
      tooltipEl.style.left = left + 'px';
      tooltipEl.style.top  = top + 'px';
    } else {
      tooltipEl.classList.remove('visible');
    }
  }

  // ── helpers ───────────────────────────────────────────────────
  function eraColor(era) {
    switch (era) {
      case 'modern':   return '#ff4444';
      case 'holocene': return '#4ade80';
      default:         return '#818cf8';
    }
  }

  return Object.freeze({ init });
})();
