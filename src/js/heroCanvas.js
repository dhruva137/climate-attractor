/**
 * heroCanvas — Live attractor animation on the landing page.
 * Runs BEFORE data loads using synthetic orbital data.
 */

function initHeroCanvas() {
  const canvas = document.getElementById('hero-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  let width, height;
  let animId = null;
  let mouseX = 0, mouseY = 0;
  const isMobile = window.innerWidth < 768;

  // ── generate synthetic orbit ─────────────────────────────────
  const N = isMobile ? 400 : 800;
  const orbit = [];
  for (let i = 0; i < N; i++) {
    const t = i / N;
    const cycle = Math.sin(t * Math.PI * 16);
    const saw = (t * 8 % 1) < 0.8
      ? (t * 8 % 1) * -1.25
      : ((t * 8 % 1) - 0.8) * 5 - 1;
    const co2 = 220 + cycle * 40 + saw * 15 + (Math.random() - 0.5) * 5;
    const temp = -4 + cycle * 4 + saw * 1.5 + (Math.random() - 0.5) * 0.5;
    orbit.push({ co2, temp, modern: false });
  }
  // modern spike
  for (let i = 0; i < 20; i++) {
    const f = i / 19;
    orbit.push({
      co2: 280 + f * 142,
      temp: 0 + f * 1.3 + f * f * 0.5,
      modern: true,
    });
  }

  // normalise to screen coords
  const co2Min = 170, co2Max = 430, tempMin = -10, tempMax = 4;

  function mapX(co2) {
    return ((co2 - co2Min) / (co2Max - co2Min)) * width * 0.7 + width * 0.15;
  }
  function mapY(temp) {
    return height - (((temp - tempMin) / (tempMax - tempMin)) * height * 0.7 + height * 0.15);
  }

  function resize() {
    width = window.innerWidth;
    height = window.innerHeight;
    canvas.width = width * Math.min(window.devicePixelRatio, 2);
    canvas.height = height * Math.min(window.devicePixelRatio, 2);
    canvas.style.width = width + 'px';
    canvas.style.height = height + 'px';
    ctx.scale(Math.min(window.devicePixelRatio, 2), Math.min(window.devicePixelRatio, 2));
  }

  resize();
  window.addEventListener('resize', resize);

  // parallax
  document.getElementById('landing').addEventListener('mousemove', e => {
    mouseX = e.clientX; mouseY = e.clientY;
  });

  // ── animation heads ──────────────────────────────────────────
  const heads = [
    { pos: 0, speed: 0.35, trail: [] },
    { pos: N * 0.33, speed: 0.4, trail: [] },
    { pos: N * 0.66, speed: 0.45, trail: [] },
  ];
  const TRAIL_LEN = isMobile ? 40 : 80;
  let frame = 0;

  function draw() {
    animId = requestAnimationFrame(draw);
    frame++;

    const offX = (mouseX - width / 2) * 0.02;
    const offY = (mouseY - height / 2) * 0.02;
    const scale = 0.85 + Math.sin(frame * 0.003) * 0.05;

    // motion blur fade
    ctx.fillStyle = 'rgba(8,8,14,0.12)';
    ctx.fillRect(0, 0, width, height);

    ctx.save();
    ctx.translate(offX, offY);

    // dim full orbit
    ctx.beginPath();
    for (let i = 0; i < orbit.length; i++) {
      const p = orbit[i];
      const x = mapX(p.co2) * scale + width * (1 - scale) / 2;
      const y = mapY(p.temp) * scale + height * (1 - scale) / 2;
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.strokeStyle = 'rgba(129,140,248,0.04)';
    ctx.lineWidth = 1;
    ctx.stroke();

    // animated heads
    heads.forEach(h => {
      h.pos += h.speed;
      if (h.pos >= orbit.length) h.pos -= orbit.length;

      const idx = Math.floor(h.pos) % orbit.length;
      const p = orbit[idx];
      const x = mapX(p.co2) * scale + width * (1 - scale) / 2;
      const y = mapY(p.temp) * scale + height * (1 - scale) / 2;

      h.trail.push({ x, y, modern: p.modern });
      if (h.trail.length > TRAIL_LEN) h.trail.shift();

      // draw trail
      for (let j = 0; j < h.trail.length; j++) {
        const tp = h.trail[j];
        const alpha = (j / h.trail.length) * 0.6;
        const radius = (j / h.trail.length) * 2;
        ctx.beginPath();
        ctx.arc(tp.x, tp.y, Math.max(radius, 0.5), 0, Math.PI * 2);
        ctx.fillStyle = tp.modern
          ? `rgba(255,68,68,${alpha})`
          : `rgba(129,140,248,${alpha})`;
        ctx.fill();
      }

      // bright head
      ctx.beginPath();
      ctx.arc(x, y, 3, 0, Math.PI * 2);
      ctx.fillStyle = p.modern ? 'rgba(255,68,68,0.9)' : 'rgba(200,200,240,0.9)';
      ctx.fill();

      // glow rings
      for (let r = 1; r <= 3; r++) {
        ctx.beginPath();
        ctx.arc(x, y, 3 + r * 3, 0, Math.PI * 2);
        ctx.strokeStyle = p.modern
          ? `rgba(255,68,68,${0.15 / r})`
          : `rgba(129,140,248,${0.12 / r})`;
        ctx.lineWidth = 0.8;
        ctx.stroke();
      }
    });

    // modern breakout line
    ctx.beginPath();
    let started = false;
    for (let i = N; i < orbit.length; i++) {
      const p = orbit[i];
      const x = mapX(p.co2) * scale + width * (1 - scale) / 2;
      const y = mapY(p.temp) * scale + height * (1 - scale) / 2;
      if (!started) { ctx.moveTo(x, y); started = true; }
      else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = 'rgba(255,68,68,0.5)';
    ctx.lineWidth = 2;
    ctx.stroke();

    // pulsing dot at modern tip
    const tip = orbit[orbit.length - 1];
    const tx = mapX(tip.co2) * scale + width * (1 - scale) / 2;
    const ty = mapY(tip.temp) * scale + height * (1 - scale) / 2;
    const pulse = 3 + Math.sin(frame * 0.05) * 2;
    ctx.beginPath();
    ctx.arc(tx, ty, pulse, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(255,68,68,${0.5 + Math.sin(frame * 0.05) * 0.3})`;
    ctx.fill();

    ctx.restore();
  }

  // visibility control
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      if (animId) cancelAnimationFrame(animId);
    } else {
      draw();
    }
  });

  draw();
  console.log('[HeroCanvas] started');
}
