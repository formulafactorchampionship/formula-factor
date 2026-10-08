import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'https://esm.sh/react@18';
import { createRoot } from 'https://esm.sh/react-dom@18/client';

// Curated motorsport / simracing action photography (F1, cockpits, circuits)
// STRICT: NO news cover images (/news_uploads) are included here
const MOTORSPORT_FALLBACK_ITEMS = [
  { image: 'https://images.unsplash.com/photo-1568605117036-5fe5e7bab0b7?auto=format&fit=crop&w=640&q=85', title: 'Monza Speed' },
  { image: 'https://images.unsplash.com/photo-1511919884226-fd3cad34687c?auto=format&fit=crop&w=640&q=85', title: 'Paddock Simracing' },
  { image: 'https://images.unsplash.com/photo-1580273916550-e323be2ae537?auto=format&fit=crop&w=640&q=85', title: 'Simracing Cockpit' },
  { image: 'https://images.unsplash.com/photo-1541348263662-e0c8de4259ba?auto=format&fit=crop&w=640&q=85', title: 'Curva Peraltada' },
  { image: 'https://images.unsplash.com/photo-1574781330855-d0db8cc6a79c?auto=format&fit=crop&w=640&q=85', title: 'Boxes y Pit Lane' },
  { image: 'https://images.unsplash.com/photo-1508974239320-0a029497e820?auto=format&fit=crop&w=640&q=85', title: 'Salida de Gran Premio' },
  { image: 'https://images.unsplash.com/photo-1532974297617-c0f05fe48bff?auto=format&fit=crop&w=640&q=85', title: 'Línea de Meta' },
  { image: 'https://images.unsplash.com/photo-1617814076367-b759c7d7e738?auto=format&fit=crop&w=640&q=85', title: 'Telemetría y Vuelta Rápida' },
  { image: 'https://images.unsplash.com/photo-1503376780353-7e6692767b70?auto=format&fit=crop&w=640&q=85', title: 'Competición FFC' },
  { image: 'https://images.unsplash.com/photo-1600705722908-bab1e61c0b4d?auto=format&fit=crop&w=640&q=85', title: 'Cámara Onboard' },
  { image: 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?auto=format&fit=crop&w=640&q=85', title: 'Frenada a Fondo' },
  { image: 'https://images.unsplash.com/photo-1552519507-da3b142c6e3d?auto=format&fit=crop&w=640&q=85', title: 'Parrilla de Salida' },
  { image: 'https://images.unsplash.com/photo-1502877338535-766e1452684a?auto=format&fit=crop&w=640&q=85', title: 'Asfalto y Goma' },
  { image: 'https://images.unsplash.com/photo-1492144534655-ae79c964c9d7?auto=format&fit=crop&w=640&q=85', title: 'GT3 en Curva' },
  { image: 'https://images.unsplash.com/photo-1517524008697-84bbe3c3fd98?auto=format&fit=crop&w=640&q=85', title: 'Podio y Celebración' }
];

const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export const DriftWall = ({
  items = MOTORSPORT_FALLBACK_ITEMS,
  columns = 8,
  tileWidth = 190,
  tileHeight = 118,
  gap = 14,
  radius = 12,
  tilt = 14,
  turn = -12,
  roll = 0,
  perspective = 1300,
  depth = 100,
  speed = 3,
  direction = 'down',
  variance = 0.35,
  parallax = 0.45,
  pauseOnHover = false,
  lift = 55,
  fade = 0.15,
  dim = 0.70,
  grayscale = false,
  overlayColor = '#05020c',
  className = '',
  style
}) => {
  const containerRef = useRef(null);
  const planeRef = useRef(null);
  const trackRefs = useRef([]);
  const rafRef = useRef(null);

  const offsetsRef = useRef([]);
  const velocitiesRef = useRef([]);
  const hoveredColRef = useRef(-1);
  const wallHoveredRef = useRef(false);
  const pointerRef = useRef({ x: 0, y: 0 });
  const pointerDampedRef = useRef({ x: 0, y: 0 });
  const lastTsRef = useRef(null);

  const [containerHeight, setContainerHeight] = useState(650);
  const [activeId, setActiveId] = useState(null);
  const activeIdRef = useRef(null);
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    setReduced(prefersReducedMotion());
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const onChange = e => setReduced(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  const displayItems = useMemo(() => {
    return items && items.length > 0 ? items : MOTORSPORT_FALLBACK_ITEMS;
  }, [items]);

  // Completely randomize each column independently so there is NO predictable pattern or repeated rows
  const columnItems = useMemo(() => {
    if (!displayItems || displayItems.length === 0) return [];
    
    // Determine how many distinct items per column to create plenty of continuous variety
    const itemsPerCol = Math.max(8, Math.ceil(displayItems.length / Math.max(1, columns)) * 3);
    
    return Array.from({ length: columns }, (_, colIdx) => {
      const colList = [];
      while (colList.length < itemsPerCol) {
        // Independently shuffle pool for this specific column
        const shuffled = shuffleArray(displayItems);
        // Avoid consecutive duplicate photos
        shuffled.forEach(item => {
          if (colList.length === 0 || colList[colList.length - 1].image !== item.image) {
            colList.push(item);
          }
        });
      }
      return colList;
    });
  }, [displayItems, columns]);

  const columnMeta = useMemo(() => {
    const unit = tileHeight + gap;
    return columnItems.map(col => {
      const copyHeight = Math.max(unit, col.length * unit);
      // Buffer copies above and below ensure the conveyor belt is 100% seamless without jumps
      const bufferCopies = 3;
      const visibleCopies = Math.max(3, Math.ceil((containerHeight * 2.2) / copyHeight));
      const totalCopies = visibleCopies + bufferCopies * 2;
      return {
        copyHeight,
        totalCopies,
        bufferCopies,
        centerOffset: bufferCopies * copyHeight
      };
    });
  }, [columnItems, tileHeight, gap, containerHeight]);

  useLayoutEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver(([entry]) => {
      const h = entry.contentRect.height;
      if (h && Math.abs(h - containerHeight) > 10) {
        setContainerHeight(h);
      }
    });
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, [containerHeight]);

  // Columns alternate directions: one moves down (positive), the next moves up (negative)
  const baseVelocities = useMemo(() => {
    const mainSign = direction === 'up' ? -1 : 1;
    return columnItems.map((_, c) => {
      // Alternating direction: one column goes down, adjacent column goes up
      const altSign = (c % 2 === 0) ? 1 : -1;
      const pseudo = ((c * 0.6180339887 + 0.35) % 1);
      const factor = variance > 0 ? (0.9 + 0.2 * pseudo) : 1;
      return mainSign * altSign * speed * factor;
    });
  }, [columnItems, speed, direction, variance]);

  useEffect(() => {
    if (!offsetsRef.current || offsetsRef.current.length !== columnMeta.length) {
      // Natural staggered starting offsets for each column
      offsetsRef.current = columnMeta.map((meta, c) => meta.copyHeight * (((c * 0.381966) % 1)));
      velocitiesRef.current = columnMeta.map((_, c) => baseVelocities[c] ?? ((c % 2 === 0 ? 1 : -1) * speed));
    }
  }, [columnMeta, baseVelocities, speed]);

  const applyPlaneTransform = useCallback(
    (px, py) => {
      const plane = planeRef.current;
      if (!plane) return;
      plane.style.transform =
        `translate(-50%, -50%) scale(1.28) ` +
        `rotateX(${tilt + py}deg) rotateY(${turn + px}deg) rotateZ(${roll}deg) ` +
        `translateZ(${-depth}px)`;
    },
    [tilt, turn, roll, depth]
  );

  useEffect(() => {
    const animate = ts => {
      if (lastTsRef.current === null) lastTsRef.current = ts;
      const dt = Math.min(0.05, Math.max(0, ts - lastTsRef.current) / 1000);
      lastTsRef.current = ts;

      const maxTilt = parallax * 8;
      const targetX = pointerRef.current.x * maxTilt;
      const targetY = -pointerRef.current.y * maxTilt;
      const damp = 1 - Math.exp(-dt / 0.12);
      pointerDampedRef.current.x += (targetX - pointerDampedRef.current.x) * damp;
      pointerDampedRef.current.y += (targetY - pointerDampedRef.current.y) * damp;
      applyPlaneTransform(pointerDampedRef.current.x, pointerDampedRef.current.y);

      if (!reduced) {
        for (let c = 0; c < trackRefs.current.length; c++) {
          const meta = columnMeta[c];
          if (!meta) continue;
          const paused = wallHoveredRef.current && pauseOnHover;
          const factor = paused ? 0 : 1;
          const defaultColTarget = (c % 2 === 0 ? 1 : -1) * speed;
          const target = (baseVelocities[c] ?? defaultColTarget) * factor;

          const ease = 1 - Math.exp(-dt / 0.25);
          const currentV = velocitiesRef.current[c] ?? target;
          velocitiesRef.current[c] = currentV + (target - currentV) * ease;

          // Pure seamless infinite conveyor loop in both directions
          let next = (offsetsRef.current[c] ?? 0) + velocitiesRef.current[c] * dt;
          next = ((next % meta.copyHeight) + meta.copyHeight) % meta.copyHeight;
          offsetsRef.current[c] = next;

          const el = trackRefs.current[c];
          if (el) {
            const translateY = -meta.centerOffset + next;
            el.style.transform = `translate3d(0, ${translateY}px, 0)`;
          }
        }
      } else {
        for (let c = 0; c < trackRefs.current.length; c++) {
          const el = trackRefs.current[c];
          const meta = columnMeta[c];
          if (el && meta) {
            const translateY = -meta.centerOffset + (offsetsRef.current[c] ?? 0);
            el.style.transform = `translate3d(0, ${translateY}px, 0)`;
          }
        }
      }

      rafRef.current = requestAnimationFrame(animate);
    };

    rafRef.current = requestAnimationFrame(animate);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      lastTsRef.current = null;
    };
  }, [baseVelocities, columnMeta, pauseOnHover, parallax, reduced, applyPlaneTransform, speed]);

  const activate = useCallback((id, index) => {
    activeIdRef.current = id;
    hoveredColRef.current = index;
    setActiveId(id);
  }, []);
  const release = useCallback(() => {
    activeIdRef.current = null;
    hoveredColRef.current = -1;
    setActiveId(null);
  }, []);

  const handlePointerMove = useCallback(
    e => {
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;
      if (parallax > 0 && !reduced) {
        pointerRef.current = {
          x: (e.clientX - rect.left) / rect.width - 0.5,
          y: (e.clientY - rect.top) / rect.height - 0.5
        };
      }
      const hit = document.elementFromPoint(e.clientX, e.clientY);
      const tile = hit && hit.closest ? hit.closest('[data-tile-id]') : null;
      if (!tile) return;
      const id = tile.dataset.tileId;
      if (id === activeIdRef.current) return;
      activeIdRef.current = id;
      hoveredColRef.current = Number(tile.dataset.col);
      setActiveId(id);
    },
    [parallax, reduced]
  );

  const handlePointerLeaveWall = useCallback(() => {
    wallHoveredRef.current = false;
    pointerRef.current = { x: 0, y: 0 };
    release();
  }, [release]);

  const cssVars = useMemo(
    () => ({
      '--dw-tile-w': `${tileWidth}px`,
      '--dw-tile-h': `${tileHeight}px`,
      '--dw-gap': `${gap}px`,
      '--dw-radius': `${radius}px`,
      '--dw-perspective': `${perspective}px`,
      '--dw-lift': `${lift}px`,
      '--dw-dim': dim,
      '--dw-gray': grayscale ? 1 : 0,
      '--dw-overlay': overlayColor,
      '--dw-edge': `${Math.max(0, (1 - fade) * 100)}%`,
      ...style
    }),
    [tileWidth, tileHeight, gap, radius, perspective, lift, dim, grayscale, overlayColor, fade, style]
  );

  const renderTile = (item, id, colIndex) => {
    const inner = React.createElement(
      'span',
      { className: 'drift-wall__inner' },
      React.createElement('img', {
        src: item.image,
        alt: item.title || '',
        loading: 'eager',
        decoding: 'async',
        draggable: false
      }),
      React.createElement('span', {
        className: 'drift-wall__overlay',
        'aria-hidden': 'true'
      })
    );

    const commonProps = {
      className: `drift-wall__tile${activeId === id ? ' is-active' : ''}`,
      'data-tile-id': id,
      'data-col': colIndex,
      onFocus: () => activate(id, colIndex),
      onBlur: release
    };

    if (item.href) {
      return React.createElement(
        'a',
        {
          key: id,
          href: item.href,
          target: '_blank',
          rel: 'noreferrer noopener',
          ...commonProps
        },
        inner
      );
    }

    return React.createElement(
      'div',
      {
        key: id,
        tabIndex: 0,
        role: 'button',
        'aria-label': item.title || 'tile',
        ...commonProps
      },
      inner
    );
  };

  const rootClass = ['drift-wall', reduced ? 'drift-wall--reduced' : '', className].filter(Boolean).join(' ');

  return React.createElement(
    'div',
    {
      ref: containerRef,
      className: rootClass,
      style: cssVars,
      onPointerMove: handlePointerMove,
      onPointerEnter: () => {
        wallHoveredRef.current = true;
      },
      onPointerLeave: handlePointerLeaveWall,
      role: 'group',
      'aria-label': 'Drifting wall of tiles'
    },
    React.createElement(
      'div',
      {
        ref: planeRef,
        className: 'drift-wall__plane'
      },
      columnItems.map((col, c) => {
        const meta = columnMeta[c];
        const copies = Array.from({ length: meta.totalCopies });
        return React.createElement(
          'div',
          {
            className: 'drift-wall__col',
            key: `col-${c}`
          },
          React.createElement(
            'div',
            {
              className: 'drift-wall__track',
              ref: el => {
                trackRefs.current[c] = el;
              }
            },
            copies.map((_, copyIndex) =>
              col.map((item, itemIndex) =>
                renderTile(item, `${c}-${copyIndex}-${itemIndex}`, c)
              )
            )
          )
        );
      })
    )
  );
};

export default DriftWall;

// Helper to shuffle an array deterministically once
function shuffleArray(arr) {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

// Global active root reference
let driftWallRoot = null;
let currentWallContainer = null;
let isWallInitialized = false;
let currentLoadedSignature = '';

// Determine optimal column count based on viewport width to completely cover the hero
export function getRecommendedColumns() {
  if (typeof window === 'undefined') return 8;
  const w = window.innerWidth;
  if (w >= 1800) return 10;
  if (w >= 1440) return 9;
  if (w >= 1100) return 8;
  if (w >= 768) return 6;
  return 4;
}

export async function fetchUploadedPhotosForWall() {
  const publishedPhotos = [];

  // 1. Fetch race photos from server endpoint (photos_db.json & synced Firestore)
  try {
    const res = await fetch('/api/carreras/fotos');
    if (res.ok) {
      const data = await res.json();
      if (data && Array.isArray(data.photos) && data.photos.length > 0) {
        data.photos.forEach(p => {
          if (p.status === 'rejected') return;
          const url = p.photoUrl || p.imageUrl || p.url;
          // STRICT RULE: Only race/gallery photos, absolutely NO news images
          if (url && !url.includes('/news_uploads/') && !url.includes('news_')) {
            if (!publishedPhotos.some(existing => existing.image === url)) {
              publishedPhotos.push({
                image: url,
                title: p.caption || (p.author ? `Foto por ${p.author}` : 'FFC Simracing'),
                href: undefined
              });
            }
          }
        });
      }
    }
  } catch (err) {
    console.warn('Could not fetch race photos for DriftWall:', err);
  }

  // 2. Fetch from /api/gallery/random-wall-photos
  try {
    const res = await fetch('/api/gallery/random-wall-photos');
    if (res.ok) {
      const data = await res.json();
      if (data && Array.isArray(data.items) && data.items.length > 0) {
        data.items.forEach(p => {
          const url = p.image || p.url;
          // STRICT RULE: Only race/gallery photos, absolutely NO news images
          if (url && !url.includes('/news_uploads/') && !url.includes('news_')) {
            if (!publishedPhotos.some(existing => existing.image === url)) {
              publishedPhotos.push({
                image: url,
                title: p.title || 'Foto FFC Simracing',
                href: undefined
              });
            }
          }
        });
      }
    }
  } catch (err) {}

  // 3. Also check if localStorage or window.currentPhotos has published race photos
  try {
    const localRaw = typeof localStorage !== 'undefined' ? localStorage.getItem("ffc_local_photos") : null;
    const localParsed = localRaw ? JSON.parse(localRaw) : [];
    const pool = [
      ...(Array.isArray(window?.currentPhotos) ? window.currentPhotos : []),
      ...(Array.isArray(localParsed) ? localParsed : [])
    ];
    pool.forEach(p => {
      if (!p || p.status === 'rejected') return;
      const url = p.photoUrl || p.imageUrl || p.url;
      // STRICT RULE: Only race/gallery photos, absolutely NO news images
      if (url && !url.includes('/news_uploads/') && !url.includes('news_')) {
        if (!publishedPhotos.some(existing => existing.image === url)) {
          publishedPhotos.push({
            image: url,
            title: p.caption || (p.author ? `Foto por ${p.author}` : 'FFC Simracing'),
            href: undefined
          });
        }
      }
    });
  } catch (err) {}

  // User explicit condition: "y que solo sean las fotos publicadas, no las de las noticias"
  if (publishedPhotos.length > 0) {
    // ONLY published race photos! Repeat and distribute them smoothly across columns
    const randomized = shuffleArray(publishedPhotos);
    const targetCount = 48; // ensure plenty of tiles for up to 10 columns
    const filled = [];
    while (filled.length < targetCount) {
      filled.push(...shuffleArray(randomized));
    }
    return filled.slice(0, targetCount);
  }

  // Fallback: If no race photos are published yet in the system, show clean motorsport action photography
  // (NEVER news covers or news uploads)
  return shuffleArray(MOTORSPORT_FALLBACK_ITEMS);
}

export async function renderDriftWall(containerId = 'hero-drift-wall-bg') {
  const container = document.getElementById(containerId);
  if (!container) return;
  currentWallContainer = container;

  const items = await fetchUploadedPhotosForWall();
  const signature = items.map(it => it.image).sort().join('|');

  // If already initialized and photos haven't changed, DO NOT reload or reset!
  if (isWallInitialized && signature === currentLoadedSignature) {
    return;
  }

  currentLoadedSignature = signature;
  const cols = getRecommendedColumns();

  if (!driftWallRoot) {
    container.innerHTML = '';
    driftWallRoot = createRoot(container);
  }

  driftWallRoot.render(
    React.createElement(DriftWall, {
      items: items,
      columns: cols,
      tileWidth: 190,
      tileHeight: 118,
      gap: 14,
      radius: 12,
      tilt: 14,
      turn: -12,
      perspective: 1300,
      depth: 100,
      speed: 3,
      direction: 'down',
      variance: 0.35,
      parallax: 0,
      pauseOnHover: false,
      lift: 0,
      fade: 0.15,
      dim: 0.52,
      overlayColor: '#05020c'
    })
  );

  isWallInitialized = true;
}

export function refreshDriftWallPhotos() {
  if (currentWallContainer) {
    renderDriftWall(currentWallContainer.id);
  }
}

export function initDriftWall(containerId = 'hero-drift-wall-bg') {
  if (isWallInitialized) return;
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      renderDriftWall(containerId);
    });
  } else {
    renderDriftWall(containerId);
  }
}

// Make accessible on window object
if (typeof window !== 'undefined') {
  window.refreshDriftWallPhotos = refreshDriftWallPhotos;
  window.initDriftWall = initDriftWall;
}
