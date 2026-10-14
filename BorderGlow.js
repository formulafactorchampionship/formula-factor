import React, { useRef, useCallback, useEffect } from 'https://esm.sh/react@18';

function parseHSL(hslStr) {
  const match = hslStr.match(/([\d.]+)\s*([\d.]+)%?\s*([\d.]+)%?/);
  if (!match) return { h: 40, s: 80, l: 80 };
  return { h: parseFloat(match[1]), s: parseFloat(match[2]), l: parseFloat(match[3]) };
}

function buildGlowVars(glowColor, intensity) {
  const { h, s, l } = parseHSL(glowColor);
  const base = `${h}deg ${s}% ${l}%`;
  const opacities = [100, 60, 50, 40, 30, 20, 10];
  const keys = ['', '-60', '-50', '-40', '-30', '-20', '-10'];
  const vars = {};
  for (let i = 0; i < opacities.length; i++) {
    vars[`--glow-color${keys[i]}`] = `hsl(${base} / ${Math.min(opacities[i] * intensity, 100)}%)`;
  }
  return vars;
}

const GRADIENT_POSITIONS = ['80% 55%', '69% 34%', '8% 6%', '41% 38%', '86% 85%', '82% 18%', '51% 4%'];
const GRADIENT_KEYS = ['--gradient-one', '--gradient-two', '--gradient-three', '--gradient-four', '--gradient-five', '--gradient-six', '--gradient-seven'];
const COLOR_MAP = [0, 1, 2, 0, 1, 2, 1];

function buildGradientVars(colors) {
  const vars = {};
  for (let i = 0; i < 7; i++) {
    const c = colors[Math.min(COLOR_MAP[i], colors.length - 1)];
    vars[GRADIENT_KEYS[i]] = `radial-gradient(at ${GRADIENT_POSITIONS[i]}, ${c} 0px, transparent 50%)`;
  }
  vars['--gradient-base'] = `linear-gradient(${colors[0]} 0 100%)`;
  return vars;
}

function isLightColor(color) {
  const value = color.trim().replace('#', '');
  if (!/^[\da-f]{3}([\da-f]{3})?$/i.test(value)) return false;
  const hex = value.length === 3 ? value.split('').map(char => char + char).join('') : value;
  const red = parseInt(hex.slice(0, 2), 16);
  const green = parseInt(hex.slice(2, 4), 16);
  const blue = parseInt(hex.slice(4, 6), 16);
  return red * 0.2126 + green * 0.7152 + blue * 0.0722 > 180;
}

function easeOutCubic(x) { return 1 - Math.pow(1 - x, 3); }
function easeInCubic(x) { return x * x * x; }

function animateValue({ start = 0, end = 100, duration = 1000, delay = 0, ease = easeOutCubic, onUpdate, onEnd }) {
  const t0 = performance.now() + delay;
  function tick() {
    const elapsed = performance.now() - t0;
    const t = Math.min(elapsed / duration, 1);
    onUpdate(start + (end - start) * ease(t));
    if (t < 1) requestAnimationFrame(tick);
    else if (onEnd) onEnd();
  }
  setTimeout(() => requestAnimationFrame(tick), delay);
}

const BorderGlow = ({
  children,
  className = '',
  edgeSensitivity = 30,
  glowColor = '40 80 80',
  backgroundColor = '#120F17',
  borderRadius = 28,
  glowRadius = 40,
  glowIntensity = 1.0,
  coneSpread = 25,
  animated = false,
  colors = ['#c084fc', '#f472b6', '#38bdf8'],
  fillOpacity = 0.5,
}) => {
  const cardRef = useRef(null);

  const getCenterOfElement = useCallback((el) => {
    const { width, height } = el.getBoundingClientRect();
    return [width / 2, height / 2];
  }, []);

  const getEdgeProximity = useCallback((el, x, y) => {
    const [cx, cy] = getCenterOfElement(el);
    const dx = x - cx;
    const dy = y - cy;
    let kx = Infinity;
    let ky = Infinity;
    if (dx !== 0) kx = cx / Math.abs(dx);
    if (dy !== 0) ky = cy / Math.abs(dy);
    return Math.min(Math.max(1 / Math.min(kx, ky), 0), 1);
  }, [getCenterOfElement]);

  const getCursorAngle = useCallback((el, x, y) => {
    const [cx, cy] = getCenterOfElement(el);
    const dx = x - cx;
    const dy = y - cy;
    if (dx === 0 && dy === 0) return 0;
    const radians = Math.atan2(dy, dx);
    let degrees = radians * (180 / Math.PI) + 90;
    if (degrees < 0) degrees += 360;
    return degrees;
  }, [getCenterOfElement]);

  const handlePointerMove = useCallback((e) => {
    const card = cardRef.current;
    if (!card) return;

    const rect = card.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const edge = getEdgeProximity(card, x, y);
    const angle = getCursorAngle(card, x, y);

    card.style.setProperty('--edge-proximity', `${(edge * 100).toFixed(3)}`);
    card.style.setProperty('--cursor-angle', `${angle.toFixed(3)}deg`);
  }, [getEdgeProximity, getCursorAngle]);

  useEffect(() => {
    if (!animated || !cardRef.current) return;
    const card = cardRef.current;
    const angleStart = 110;
    const angleEnd = 465;
    card.classList.add('sweep-active');
    card.style.setProperty('--cursor-angle', `${angleStart}deg`);

    animateValue({ duration: 500, onUpdate: v => card.style.setProperty('--edge-proximity', v) });
    animateValue({ ease: easeInCubic, duration: 1500, end: 50, onUpdate: v => {
      card.style.setProperty('--cursor-angle', `${(angleEnd - angleStart) * (v / 100) + angleStart}deg`);
    }});
    animateValue({ ease: easeOutCubic, delay: 1500, duration: 2250, start: 50, end: 100, onUpdate: v => {
      card.style.setProperty('--cursor-angle', `${(angleEnd - angleStart) * (v / 100) + angleStart}deg`);
    }});
    animateValue({ ease: easeInCubic, delay: 2500, duration: 1500, start: 100, end: 0,
      onUpdate: v => card.style.setProperty('--edge-proximity', v),
      onEnd: () => card.classList.remove('sweep-active'),
    });
  }, [animated]);

  const glowVars = buildGlowVars(glowColor, glowIntensity);
  const lightSurface = isLightColor(backgroundColor);

  return React.createElement(
    'div',
    {
      ref: cardRef,
      onPointerMove: handlePointerMove,
      className: `border-glow-card${lightSurface ? ' border-glow-card--light' : ''} ${className}`,
      style: {
        '--card-bg': backgroundColor,
        '--edge-sensitivity': edgeSensitivity,
        '--border-radius': `${borderRadius}px`,
        '--glow-padding': `${glowRadius}px`,
        '--cone-spread': coneSpread,
        '--fill-opacity': fillOpacity,
        ...glowVars,
        ...buildGradientVars(colors),
      }
    },
    React.createElement('span', { className: 'edge-light' }),
    React.createElement(
      'div',
      { className: 'border-glow-inner' },
      children
    )
  );
};

export default BorderGlow;

/**
 * Requirement 1: Native, ultra-lightweight DOM implementation for Calendar cards.
 * Eliminates 16 React root instances, mounting directly via Vanilla DOM and a single requestAnimationFrame throttled pointermove listener.
 */
export function initCalendarBorderGlow() {
  const gridView = document.getElementById("calendarGridView");
  if (gridView && (gridView.style.display === "none" || window.getComputedStyle(gridView).display === "none")) {
    return;
  }
  const calendarCards = document.querySelectorAll('#calendarGridView .calendar-card, .calendar-grid .calendar-card');
  if (!calendarCards.length) return;

  // Single global pointermove listener for all calendar cards to avoid listeners and layout thrashing
  if (!window._ffcBorderGlowInitialized) {
    window._ffcBorderGlowInitialized = true;
    let ticking = false;
    let lastEvent = null;

    window.addEventListener('pointermove', (e) => {
      lastEvent = e;
      if (!ticking) {
        ticking = true;
        requestAnimationFrame(() => {
          ticking = false;
          if (!lastEvent) return;
          const cards = document.querySelectorAll('.calendar-card[data-border-glow-mounted="true"]');
          cards.forEach(card => {
            const rect = card.getBoundingClientRect();
            // Only update if pointer is close or hovering
            if (
              lastEvent.clientX >= rect.left - 80 &&
              lastEvent.clientX <= rect.right + 80 &&
              lastEvent.clientY >= rect.top - 80 &&
              lastEvent.clientY <= rect.bottom + 80
            ) {
              const x = lastEvent.clientX - rect.left;
              const y = lastEvent.clientY - rect.top;
              const w = rect.width;
              const h = rect.height;
              const cx = w / 2;
              const cy = h / 2;
              const dx = x - cx;
              const dy = y - cy;
              let kx = Infinity;
              let ky = Infinity;
              if (dx !== 0) kx = cx / Math.abs(dx);
              if (dy !== 0) ky = cy / Math.abs(dy);
              const edge = Math.min(Math.max(1 / Math.min(kx, ky), 0), 1);

              let degrees = 0;
              if (dx !== 0 || dy !== 0) {
                const radians = Math.atan2(dy, dx);
                degrees = radians * (180 / Math.PI) + 90;
                if (degrees < 0) degrees += 360;
              }

              card.style.setProperty('--edge-proximity', `${(edge * 100).toFixed(2)}`);
              card.style.setProperty('--cursor-angle', `${degrees.toFixed(2)}deg`);
            }
          });
        });
      }
    }, { passive: true });
  }

  calendarCards.forEach((card) => {
    if (card.dataset.borderGlowMounted === "true") return;
    card.dataset.borderGlowMounted = "true";

    const isNext = card.classList.contains('next');
    const isTest = card.classList.contains('test-card');

    const cardColors = isNext 
      ? ['#d6b45c', '#e10600', '#f59e0b'] 
      : isTest 
      ? ['#64748b', '#94a3b8', '#cbd5e1']
      : ['#d6b45c', '#e10600', '#38bdf8'];

    const glowColor = isNext ? '43 70 65' : '43 55 50';
    const backgroundColor = isNext ? '#111827' : '#0a0f1a';
    const intensity = isNext ? 1.25 : 0.95;
    const edgeSensitivity = isNext ? 20 : 30;

    // Apply native CSS variables directly to the card element
    card.classList.add('border-glow-card', 'calendar-border-glow-wrap');
    card.style.setProperty('--card-bg', backgroundColor);
    card.style.setProperty('--edge-sensitivity', edgeSensitivity);
    card.style.setProperty('--border-radius', '14px');
    card.style.setProperty('--glow-padding', '36px');
    card.style.setProperty('--cone-spread', '28');
    card.style.setProperty('--fill-opacity', isNext ? '0.45' : '0.25');

    // Glow vars
    const glowVars = buildGlowVars(glowColor, intensity);
    for (const [k, v] of Object.entries(glowVars)) {
      card.style.setProperty(k, v);
    }
    const gradVars = buildGradientVars(cardColors);
    for (const [k, v] of Object.entries(gradVars)) {
      card.style.setProperty(k, v);
    }

    // Wrap inner contents safely without recreating React roots
    const innerHTML = card.innerHTML;
    card.innerHTML = '';

    const edgeLight = document.createElement('span');
    edgeLight.className = 'edge-light';
    card.appendChild(edgeLight);

    const innerDiv = document.createElement('div');
    innerDiv.className = 'border-glow-inner calendar-card-inner-wrapper';
    innerDiv.innerHTML = innerHTML;
    card.appendChild(innerDiv);
  });
}
