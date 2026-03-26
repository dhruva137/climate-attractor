/**
 * ThreeView — 3D orbit of CO₂ × Temp × CH₄ using Three.js r128.
 */

const ThreeView = (() => {
  let container, renderer, scene, camera;
  let sceneGroup, markerSphere, pulseRing, cometLine;
  let pointCloud, histTube, modernTube;
  let labels = [];
  let normalizedPts = [];
  let data = null;

  // orbit controls (manual)
  let isDragging = false, userInteracted = false;
  let lastMX = 0, lastMY = 0;
  let targetRotY = 0.5, targetRotX = 0.3;
  let startTime = 0;
  let hudEl = null;

  const DOMAINS = {
    co2:  [170, 430],
    temp: [-10, 3],
    ch4:  [300, 2000],
  };

  function mapRange(v, inMin, inMax, outMin, outMax) {
    return outMin + (v - inMin) / (inMax - inMin) * (outMax - outMin);
  }

  // ═══════════════════════════════════════════════════════════
  //  INIT
  // ═══════════════════════════════════════════════════════════
  function init(containerEl) {
    container = containerEl;

    // renderer
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(container.clientWidth, container.clientHeight);
    container.appendChild(renderer.domElement);

    // scene + camera
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(45, container.clientWidth / container.clientHeight, 0.1, 1000);
    camera.position.set(2.5, 1.5, 2.5);
    camera.lookAt(0, 0, 0);

    // lights
    scene.add(new THREE.AmbientLight(0xffffff, 0.1));
    const pl = new THREE.PointLight(0xffffff, 0.2);
    pl.position.set(3, 3, 3);
    scene.add(pl);

    // parent group for rotation
    sceneGroup = new THREE.Group();
    scene.add(sceneGroup);

    // HUD overlay
    hudEl = document.createElement('div');
    hudEl.style.cssText = 'position:absolute;top:16px;left:16px;font-family:var(--font-mono);' +
      'font-size:10px;color:#505068;z-index:5;pointer-events:none;line-height:1.8;transition:opacity 1s;';
    hudEl.innerHTML = 'Drag to rotate · Scroll to zoom · Double-click to reset<br>' +
      '<span id="three-coords"></span>';
    container.appendChild(hudEl);

    // input handlers
    const cvs = renderer.domElement;
    cvs.addEventListener('mousedown', onDown);
    cvs.addEventListener('mousemove', onMove);
    cvs.addEventListener('mouseup', onUp);
    cvs.addEventListener('mouseleave', onUp);
    cvs.addEventListener('wheel', onWheel, { passive: false });
    cvs.addEventListener('dblclick', resetView);
    cvs.addEventListener('touchstart', e => { onDown(e.touches[0]); }, { passive: true });
    cvs.addEventListener('touchmove', e => { onMove(e.touches[0]); }, { passive: true });
    cvs.addEventListener('touchend', onUp);

    // resize
    new ResizeObserver(() => onResize()).observe(container);

    // state subscriptions
    State.subscribe('data', d => { data = d; buildGeometry(); });
    State.subscribe('currentIndex', () => update());

    data = State.get('data');
    if (data) buildGeometry();

    startTime = performance.now();
    animate();
    console.log('[ThreeView] initialised');
  }

  // ═══════════════════════════════════════════════════════════
  //  NORMALIZE DATA
  // ═══════════════════════════════════════════════════════════
  function normalizeData() {
    normalizedPts = [];
    if (!data) return;
    for (let i = 0; i < data.length; i++) {
      const d = data[i];
      if (d.co2_ppm === null || d.temp_anomaly === null || d.ch4_ppb === null) continue;
      normalizedPts.push({
        x: mapRange(d.co2_ppm, ...DOMAINS.co2, -1.5, 1.5),
        y: mapRange(d.temp_anomaly, ...DOMAINS.temp, -1.5, 1.5),
        z: mapRange(d.ch4_ppb, ...DOMAINS.ch4, -1.5, 1.5),
        era: d.era,
        index: i,
      });
    }
  }

  // ═══════════════════════════════════════════════════════════
  //  BUILD GEOMETRY
  // ═══════════════════════════════════════════════════════════
  function buildGeometry() {
    // clear previous
    while (sceneGroup.children.length) sceneGroup.remove(sceneGroup.children[0]);
    labels = [];

    normalizeData();
    if (normalizedPts.length < 3) return;

    buildAxes();
    buildGridPlanes();
    buildPointCloud();
    buildTubes();
    buildMarker();

    update();
  }

  function buildAxes() {
    const axDefs = [
      { dir: [1, 0, 0], color: 0x4fc3f7, label: 'CO₂' },
      { dir: [0, 1, 0], color: 0x4ade80, label: '°C' },
      { dir: [0, 0, 1], color: 0x818cf8, label: 'CH₄' },
    ];
    axDefs.forEach(a => {
      const geo = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(-1.8 * a.dir[0], -1.8 * a.dir[1], -1.8 * a.dir[2]),
        new THREE.Vector3(1.8 * a.dir[0], 1.8 * a.dir[1], 1.8 * a.dir[2]),
      ]);
      const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: a.color, opacity: 0.4, transparent: true }));
      sceneGroup.add(line);

      // label sprite
      const canvas = document.createElement('canvas');
      canvas.width = 128; canvas.height = 32;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#' + a.color.toString(16).padStart(6, '0');
      ctx.font = '500 20px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(a.label, 64, 22);
      const tex = new THREE.CanvasTexture(canvas);
      const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true }));
      spr.position.set(2.0 * a.dir[0], 2.0 * a.dir[1], 2.0 * a.dir[2]);
      spr.scale.set(0.5, 0.125, 1);
      sceneGroup.add(spr);
      labels.push(spr);
    });
  }

  function buildGridPlanes() {
    const gridMat = new THREE.LineBasicMaterial({ color: 0xffffff, opacity: 0.03, transparent: true });
    [-1, 0, 1].forEach(v => {
      // XZ lines at various Y
      const g1 = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(-1.5, v * 0.5, -1.5), new THREE.Vector3(1.5, v * 0.5, -1.5),
        new THREE.Vector3(1.5, v * 0.5, 1.5), new THREE.Vector3(-1.5, v * 0.5, 1.5),
        new THREE.Vector3(-1.5, v * 0.5, -1.5),
      ]);
      sceneGroup.add(new THREE.Line(g1, gridMat));
    });
  }

  function buildPointCloud() {
    const positions = new Float32Array(normalizedPts.length * 3);
    const colors = new Float32Array(normalizedPts.length * 3);
    const sizes = new Float32Array(normalizedPts.length);

    const eraColors = {
      paleoclimate: [0.51, 0.47, 0.97],
      holocene: [0.29, 0.87, 0.50],
      modern: [1.0, 0.27, 0.27],
    };

    normalizedPts.forEach((p, i) => {
      positions[i * 3] = p.x;
      positions[i * 3 + 1] = p.y;
      positions[i * 3 + 2] = p.z;
      const c = eraColors[p.era] || eraColors.paleoclimate;
      colors[i * 3] = c[0]; colors[i * 3 + 1] = c[1]; colors[i * 3 + 2] = c[2];
      sizes[i] = p.era === 'modern' ? 3.0 : 2.0;
    });

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.setAttribute('size', new THREE.BufferAttribute(sizes, 1));

    const mat = new THREE.ShaderMaterial({
      vertexShader: `
        attribute float size;
        varying vec3 vColor;
        void main() {
          vColor = color;
          vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = size * (80.0 / -mvPos.z);
          gl_Position = projectionMatrix * mvPos;
        }
      `,
      fragmentShader: `
        varying vec3 vColor;
        void main() {
          float d = length(gl_PointCoord - vec2(0.5));
          if (d > 0.5) discard;
          float alpha = smoothstep(0.5, 0.3, d);
          gl_FragColor = vec4(vColor, alpha);
        }
      `,
      transparent: true,
      vertexColors: true,
      depthWrite: false,
    });

    pointCloud = new THREE.Points(geo, mat);
    sceneGroup.add(pointCloud);
  }

  function buildTubes() {
    // historical tube
    const histPts = normalizedPts.filter(p => p.era !== 'modern')
      .map(p => new THREE.Vector3(p.x, p.y, p.z));
    if (histPts.length > 3) {
      const curve = new THREE.CatmullRomCurve3(histPts, false, 'catmullrom', 0.3);
      const tubeGeo = new THREE.TubeGeometry(curve, Math.min(histPts.length * 2, 2000), 0.004, 5, false);
      histTube = new THREE.Mesh(tubeGeo, new THREE.MeshBasicMaterial({
        color: 0x818cf8, opacity: 0.35, transparent: true,
      }));
      sceneGroup.add(histTube);
    }

    // modern tube
    const modPts = normalizedPts.filter(p => p.era === 'modern')
      .map(p => new THREE.Vector3(p.x, p.y, p.z));
    if (modPts.length > 1) {
      const curve = new THREE.CatmullRomCurve3(modPts, false, 'catmullrom', 0.3);
      const tubeGeo = new THREE.TubeGeometry(curve, modPts.length * 3, 0.006, 6, false);
      modernTube = new THREE.Mesh(tubeGeo, new THREE.MeshBasicMaterial({
        color: 0xff4444, opacity: 0.9, transparent: true,
      }));
      sceneGroup.add(modernTube);
      // glow tube
      const glowGeo = new THREE.TubeGeometry(curve, modPts.length * 3, 0.015, 6, false);
      const glow = new THREE.Mesh(glowGeo, new THREE.MeshBasicMaterial({
        color: 0xff4444, opacity: 0.04, transparent: true, depthWrite: false,
      }));
      sceneGroup.add(glow);
    }
  }

  function buildMarker() {
    markerSphere = new THREE.Mesh(
      new THREE.SphereGeometry(0.03, 16, 16),
      new THREE.MeshBasicMaterial({ color: 0xffffff })
    );
    sceneGroup.add(markerSphere);

    // pulse ring
    pulseRing = new THREE.Mesh(
      new THREE.RingGeometry(0.04, 0.06, 32),
      new THREE.MeshBasicMaterial({ color: 0xff4444, transparent: true, opacity: 0.6, side: THREE.DoubleSide })
    );
    sceneGroup.add(pulseRing);

    // comet tail line
    const lineGeo = new THREE.BufferGeometry();
    lineGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(30 * 3), 3));
    cometLine = new THREE.Line(lineGeo, new THREE.LineBasicMaterial({
      color: 0xffffff, opacity: 0.5, transparent: true,
    }));
    sceneGroup.add(cometLine);
  }

  // ═══════════════════════════════════════════════════════════
  //  UPDATE
  // ═══════════════════════════════════════════════════════════
  function update() {
    if (!normalizedPts.length || !markerSphere) return;
    const idx = State.get('currentIndex');

    // find matching normalized point
    let nIdx = 0;
    for (let i = 0; i < normalizedPts.length; i++) {
      if (normalizedPts[i].index <= idx) nIdx = i;
    }
    const pt = normalizedPts[nIdx];
    if (!pt) return;

    markerSphere.position.set(pt.x, pt.y, pt.z);
    pulseRing.position.copy(markerSphere.position);
    pulseRing.visible = pt.era === 'modern';

    // comet tail
    const tailLen = 30;
    const start = Math.max(0, nIdx - tailLen);
    const positions = cometLine.geometry.attributes.position.array;
    for (let i = 0; i < tailLen; i++) {
      const j = Math.min(start + i, normalizedPts.length - 1);
      const tp = normalizedPts[j];
      positions[i * 3] = tp.x;
      positions[i * 3 + 1] = tp.y;
      positions[i * 3 + 2] = tp.z;
    }
    cometLine.geometry.attributes.position.needsUpdate = true;
    cometLine.geometry.setDrawRange(0, Math.min(tailLen, nIdx - start + 1));

    // progressive tube reveal
    if (histTube) {
      const frac = nIdx / normalizedPts.length;
      const total = histTube.geometry.index ? histTube.geometry.index.count : histTube.geometry.attributes.position.count;
      histTube.geometry.setDrawRange(0, Math.floor(frac * total));
    }

    // update HUD coords
    const coordsEl = document.getElementById('three-coords');
    if (coordsEl && data[idx]) {
      const d = data[idx];
      coordsEl.textContent = `CO₂: ${d.co2_ppm !== null ? d.co2_ppm.toFixed(0) : '—'} ppm · ` +
        `Temp: ${d.temp_anomaly !== null ? d.temp_anomaly.toFixed(1) : '—'} °C · ` +
        `CH₄: ${d.ch4_ppb !== null ? d.ch4_ppb.toFixed(0) : '—'} ppb`;
    }
  }

  // ═══════════════════════════════════════════════════════════
  //  ANIMATION LOOP
  // ═══════════════════════════════════════════════════════════
  function animate() {
    requestAnimationFrame(animate);

    // damped rotation
    sceneGroup.rotation.y += (targetRotY - sceneGroup.rotation.y) * 0.05;
    sceneGroup.rotation.x += (targetRotX - sceneGroup.rotation.x) * 0.05;

    // auto-rotate
    if (!isDragging && !userInteracted) {
      targetRotY += 0.002;
    }

    // billboard labels
    labels.forEach(l => l.quaternion.copy(camera.quaternion));

    // pulse ring
    if (pulseRing && pulseRing.visible) {
      const elapsed = (performance.now() - startTime) / 1000;
      const s = 1 + (Math.sin(elapsed * 2) + 1) * 0.5;
      pulseRing.scale.set(s, s, 1);
      pulseRing.material.opacity = 0.6 * (1 - (s - 1));
      pulseRing.lookAt(camera.position);
    }

    renderer.render(scene, camera);
  }

  // ═══════════════════════════════════════════════════════════
  //  INPUT
  // ═══════════════════════════════════════════════════════════
  function onDown(e) {
    isDragging = true;
    lastMX = e.clientX || e.pageX;
    lastMY = e.clientY || e.pageY;
  }
  function onMove(e) {
    if (!isDragging) return;
    const mx = e.clientX || e.pageX;
    const my = e.clientY || e.pageY;
    targetRotY += (mx - lastMX) * 0.01;
    targetRotX += (my - lastMY) * 0.01;
    targetRotX = Math.max(-Math.PI / 3, Math.min(Math.PI / 3, targetRotX));
    lastMX = mx; lastMY = my;
    userInteracted = true;
  }
  function onUp() { isDragging = false; }

  function onWheel(e) {
    e.preventDefault();
    const factor = 1 + e.deltaY * 0.001;
    camera.position.multiplyScalar(factor);
    const d = camera.position.length();
    if (d < 1.5) camera.position.setLength(1.5);
    if (d > 8) camera.position.setLength(8);
  }

  function resetView() {
    targetRotY = 0.5; targetRotX = 0.3;
    camera.position.set(2.5, 1.5, 2.5);
    camera.lookAt(0, 0, 0);
    userInteracted = false;
  }

  function onResize() {
    if (!container || !renderer) return;
    const w = container.clientWidth, h = container.clientHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
  }

  return Object.freeze({ init });
})();
