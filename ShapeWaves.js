import React, { useEffect, useRef, useState } from 'https://esm.sh/react@18';
import { createRoot } from 'https://esm.sh/react-dom@18/client';

function createSimplexNoise() {
  const F3 = 1.0 / 3.0;
  const G3 = 1.0 / 6.0;
  const p = new Uint8Array(256);
  for (let i = 0; i < 256; i++) p[i] = Math.floor(Math.random() * 256);
  const perm = new Uint8Array(512);
  const permMod12 = new Uint8Array(512);
  for (let i = 0; i < 512; i++) {
    perm[i] = p[i & 255];
    permMod12[i] = perm[i] % 12;
  }
  const grad3 = [
    [1,1,0],[-1,1,0],[1,-1,0],[-1,-1,0],
    [1,0,1],[-1,0,1],[1,0,-1],[-1,0,-1],
    [0,1,1],[0,-1,1],[0,1,-1],[0,-1,-1]
  ];

  return function noise3D(xin, yin, zin) {
    let n0, n1, n2, n3;
    const s = (xin + yin + zin) * F3;
    const i = Math.floor(xin + s);
    const j = Math.floor(yin + s);
    const k = Math.floor(zin + s);
    const t = (i + j + k) * G3;
    const X0 = i - t, Y0 = j - t, Z0 = k - t;
    const x0 = xin - X0, y0 = yin - Y0, z0 = zin - Z0;
    let i1, j1, k1, i2, j2, k2;
    if (x0 >= y0) {
      if (y0 >= z0) { i1=1; j1=0; k1=0; i2=1; j2=1; k2=0; }
      else if (x0 >= z0) { i1=1; j1=0; k1=0; i2=1; j2=0; k2=1; }
      else { i1=0; j1=0; k1=1; i2=1; j2=0; k2=1; }
    } else {
      if (y0 < z0) { i1=0; j1=0; k1=1; i2=0; j2=1; k2=1; }
      else if (x0 < z0) { i1=0; j1=1; k1=0; i2=0; j2=1; k2=1; }
      else { i1=0; j1=1; k1=0; i2=1; j2=1; k2=0; }
    }
    const x1 = x0 - i1 + G3, y1 = y0 - j1 + G3, z1 = z0 - k1 + G3;
    const x2 = x0 - i2 + 2*G3, y2 = y0 - j2 + 2*G3, z2 = z0 - k2 + 2*G3;
    const x3 = x0 - 1 + 3*G3, y3 = y0 - 1 + 3*G3, z3 = z0 - 1 + 3*G3;
    const ii = i & 255, jj = j & 255, kk = k & 255;

    let t0 = 0.6 - x0*x0 - y0*y0 - z0*z0;
    if (t0 < 0) n0 = 0;
    else { t0 *= t0; const g0 = grad3[permMod12[ii + perm[jj + perm[kk]]]]; n0 = t0 * t0 * (g0[0]*x0 + g0[1]*y0 + g0[2]*z0); }

    let t1 = 0.6 - x1*x1 - y1*y1 - z1*z1;
    if (t1 < 0) n1 = 0;
    else { t1 *= t1; const g1 = grad3[permMod12[ii + i1 + perm[jj + j1 + perm[kk + k1]]]]; n1 = t1 * t1 * (g1[0]*x1 + g1[1]*y1 + g1[2]*z1); }

    let t2 = 0.6 - x2*x2 - y2*y2 - z2*z2;
    if (t2 < 0) n2 = 0;
    else { t2 *= t2; const g2 = grad3[permMod12[ii + i2 + perm[jj + j2 + perm[kk + k2]]]]; n2 = t2 * t2 * (g2[0]*x2 + g2[1]*y2 + g2[2]*z2); }

    let t3 = 0.6 - x3*x3 - y3*y3 - z3*z3;
    if (t3 < 0) n3 = 0;
    else { t3 *= t3; const g3Val = grad3[permMod12[ii + 1 + perm[jj + 1 + perm[kk + 1]]]]; n3 = t3 * t3 * (g3Val[0]*x3 + g3Val[1]*y3 + g3Val[2]*z3); }

    return 32.0 * (n0 + n1 + n2 + n3);
  };
}

const noise3D = createSimplexNoise();

function parseHexColor(hex, fallback) {
  const match = /^#?([\da-f]{3}|[\da-f]{6})$/i.exec(hex || '') || /^#?([\da-f]{6})$/i.exec(fallback);
  let str = match[1];
  if (str.length === 3) str = str.replace(/./g, c => c + c);
  return [
    parseInt(str.slice(0, 2), 16),
    parseInt(str.slice(2, 4), 16),
    parseInt(str.slice(4, 6), 16)
  ];
}

export default function ShapeWaves({
  shapes = 'mixed',
  cellSize = 14,
  dotSize = 0.75,
  color = '#2a364f',
  hoverColor = '#d6b45c',
  backgroundColor = '#06080d',
  speed = 0.8,
  scale = 1.2,
  contrast = 1.1,
  brightness = 0.35,
  interactive = true,
  splashRadius = 45,
  splashStrength = 0.5,
  className = ''
}) {
  const canvasRef = useRef(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId = 0;
    let width = 0;
    let height = 0;
    let cols = 1;
    let rows = 1;
    let cellPx = cellSize;
    let time = 0;
    let lastTime = performance.now();

    let heights = new Float32Array(1);
    let previousHeights = new Float32Array(1);
    let charges = new Float32Array(1);

    const baseRGB = parseHexColor(color, '#2a364f');
    const hoverRGB = parseHexColor(hoverColor, '#d6b45c');

    function resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = canvas.parentElement ? canvas.parentElement.clientWidth : window.innerWidth;
      height = canvas.parentElement ? canvas.parentElement.clientHeight : window.innerHeight;
      canvas.width = Math.max(1, Math.round(width * dpr));
      canvas.height = Math.max(1, Math.round(height * dpr));
      canvas.style.width = width + 'px';
      canvas.style.height = height + 'px';

      cellPx = Math.max(8, cellSize);
      cols = Math.max(1, Math.ceil(width / cellPx));
      rows = Math.max(1, Math.ceil(height / cellPx));

      heights = new Float32Array(cols * rows);
      previousHeights = new Float32Array(cols * rows);
      charges = new Float32Array(cols * rows);

      ctx.scale(dpr, dpr);
      setReady(true);
    }

    function splash(clientX, clientY, strength) {
      if (!interactive) return;
      const sigma = Math.max(0.5, (splashRadius / cellPx) * 0.5);
      const reach = Math.ceil(sigma * 2.5);
      const centerCol = clientX / cellPx;
      const centerRow = clientY / cellPx;

      const minRow = Math.max(0, Math.floor(centerRow - reach));
      const maxRow = Math.min(rows - 1, Math.ceil(centerRow + reach));
      const minCol = Math.max(0, Math.floor(centerCol - reach));
      const maxCol = Math.min(cols - 1, Math.ceil(centerCol + reach));

      for (let r = minRow; r <= maxRow; r++) {
        const dy = r - centerRow;
        for (let c = minCol; c <= maxCol; c++) {
          const dx = c - centerCol;
          const bump = strength * Math.exp(-(dx * dx + dy * dy) / (2 * sigma * sigma));
          const idx = r * cols + c;
          heights[idx] = Math.min(1.2, heights[idx] + bump);
        }
      }
    }

    function handlePointerMove(e) {
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      if (x >= 0 && y >= 0 && x <= width && y <= height) {
        splash(x, y, splashStrength);
      }
    }

    function updateRipples() {
      const lastCol = cols - 1;
      const lastRow = rows - 1;
      const waveSpeed = 0.40;
      const waveFriction = 0.94;
      const waveDecay = 0.970;

      for (let r = 0; r < rows; r++) {
        const up = (r === 0 ? r : r - 1) * cols;
        const down = (r === lastRow ? r : r + 1) * cols;
        const base = r * cols;
        for (let c = 0; c < cols; c++) {
          const idx = base + c;
          const left = base + (c === 0 ? c : c - 1);
          const right = base + (c === lastCol ? c : c + 1);
          const h = heights[idx];
          const laplacian = heights[left] + heights[right] + heights[up + c] + heights[down + c] - 4 * h;
          const vel = (h - previousHeights[idx]) * waveFriction;
          const next = (h + vel + waveSpeed * laplacian) * waveDecay;
          previousHeights[idx] = next;
          charges[idx] = Math.min(1, Math.max(0, next));
        }
      }
      const tmp = heights;
      heights = previousHeights;
      previousHeights = tmp;
    }

    function drawShape(r, c, x, y, size, shapeType, curColor) {
      ctx.fillStyle = curColor;
      const half = size / 2;

      if (shapeType === 0) {
        // Square
        ctx.fillRect(x - half, y - half, size, size);
      } else if (shapeType === 1) {
        // Circle
        ctx.beginPath();
        ctx.arc(x, y, half, 0, Math.PI * 2);
        ctx.fill();
      } else {
        // Triangle
        ctx.beginPath();
        ctx.moveTo(x, y - half);
        ctx.lineTo(x + half, y + half);
        ctx.lineTo(x - half, y + half);
        ctx.closePath();
        ctx.fill();
      }
    }

    function render(now) {
      const delta = Math.min(0.1, (now - lastTime) / 1000);
      lastTime = now;
      time += delta * 0.15 * speed;

      updateRipples();

      ctx.clearRect(0, 0, width, height);
      if (backgroundColor && backgroundColor !== 'transparent') {
        ctx.fillStyle = backgroundColor;
        ctx.fillRect(0, 0, width, height);
      }

      const noiseScale = 0.003 * scale;

      for (let r = 0; r < rows; r++) {
        const cy = (r + 0.5) * cellPx;
        for (let c = 0; c < cols; c++) {
          const cx = (c + 0.5) * cellPx;
          const idx = r * cols + c;

          const n = noise3D(cx * noiseScale + 12.98, cy * noiseScale + 78.23, time);
          const tone = Math.min(1, Math.max(0, (n * 0.5 + 0.5 - (brightness - 0.5) * 0.4) * contrast + 0.5));
          const band = Math.floor(Math.min(tone, 0.999) * 3);

          const charge = charges[idx];
          const stepped = (band + Math.floor(Math.min(charge, 0.999) * 3)) % 3;

          let shapeType = 2 - stepped; // 0 square, 1 circle, 2 triangle
          if (shapes === 'squares') shapeType = 0;
          else if (shapes === 'circles') shapeType = 1;
          else if (shapes === 'triangles') shapeType = 2;

          const sizeFactor = dotSize * (0.35 + tone * 0.4 + charge * 0.5);
          const currentSize = Math.max(1, cellPx * sizeFactor * 0.5);

          const blend = Math.min(1, tone * 0.2 + charge * 0.85);
          const red = Math.round(baseRGB[0] + (hoverRGB[0] - baseRGB[0]) * blend);
          const green = Math.round(baseRGB[1] + (hoverRGB[1] - baseRGB[1]) * blend);
          const blue = Math.round(baseRGB[2] + (hoverRGB[2] - baseRGB[2]) * blend);
          const alpha = Math.min(0.8, 0.25 + tone * 0.3 + charge * 0.42);

          drawShape(r, c, cx, cy, currentSize, shapeType, `rgba(${red},${green},${blue},${alpha})`);
        }
      }

      animId = requestAnimationFrame(render);
    }

    resize();
    window.addEventListener('resize', resize);
    window.addEventListener('pointermove', handlePointerMove, { passive: true });
    animId = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', resize);
      window.removeEventListener('pointermove', handlePointerMove);
    };
  }, [cellSize, dotSize, color, hoverColor, backgroundColor, speed, scale, contrast, brightness, interactive, splashRadius, splashStrength, shapes]);

  return React.createElement(
    'div',
    {
      className: `shape-waves ${className}`,
      'data-ready': ready,
      style: { backgroundColor, width: '100%', height: '100%' },
      'aria-hidden': 'true'
    },
    React.createElement('canvas', {
      ref: canvasRef,
      className: 'shape-waves__canvas'
    })
  );
}

export function initShapeWavesBackground(containerId) {
  const targetIds = containerId ? [containerId] : ['hero-shape-waves-bg', 'fantasy-shape-waves-bg'];

  targetIds.forEach(id => {
    const container = document.getElementById(id);
    if (!container) return;

    // Avoid double mounting
    if (container.dataset.mounted === "true") return;
    container.dataset.mounted = "true";

    const root = createRoot(container);
    root.render(
      React.createElement(ShapeWaves, {
        shapes: 'circles',
        cellSize: 15,
        dotSize: 0.65,
        color: '#2b3952',
        hoverColor: '#eac85e',
        backgroundColor: 'transparent',
        speed: 0.7,
        scale: 1.1,
        contrast: 1.0,
        brightness: 0.25,
        interactive: true,
        splashRadius: 48,
        splashStrength: 0.55
      })
    );
  });
}
