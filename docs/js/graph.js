/* ============================================================
   Interactive graph of all tactics and techniques.
   ============================================================ */

import { normalizeData, toSlug } from './dataAdapter.js';

let allData = null;
let itemIndex = {};
let currentQuery = '';

// ── Drag / interaction state ──────────────────────────────────
let svgCenter     = { x: 0, y: 0 };
let nodePositions = new Map();  // id → {x, y}
let nodeElements  = new Map();  // id → SVGGElement
let edgeElements  = new Map();  // key → {el, fromId, toId}
let techToTactic  = new Map();  // techId → tacticId
let tacticToTechs = new Map();  // tacticId → [techId, ...]
let dragState     = null;       // active node drag info
let panDragState  = null;       // active pan drag info
let wasDragging   = false;      // suppresses click after drag
let rootGroup     = null;       // <g> wrapper for zoom/pan transform
let revealedTactics = new Set(); // tactic IDs whose technique labels are shown on mobile
let expandedTactics = new Set(); // tactic IDs whose outer-ring techniques are visible
let graphHintDismissed = false; // whether the initial interaction hint has been dismissed
let graphHintTimer = null;      // auto-dismiss timer for the initial interaction hint

// ── Pan / zoom state ──────────────────────────────────────────
let panZoom = { tx: 0, ty: 0, scale: 1 };
const MIN_SCALE   = 0.15;
const MAX_SCALE   = 5;
const ZOOM_FACTOR = 1.06;

const DRAG_THRESHOLD = 4;    // px before motion is treated as a drag
const TACTIC_PULL    = 0.15; // fraction of technique drag applied to parent tactic

const EXPANDED_TACTICS_KEY = 'apeGraphExpandedTactics';

function saveExpandedTactics() {
  sessionStorage.setItem(
    EXPANDED_TACTICS_KEY,
    JSON.stringify([...expandedTactics])
  );
}

function restoreExpandedTactics() {
  try {
    expandedTactics = new Set(JSON.parse(sessionStorage.getItem(EXPANDED_TACTICS_KEY) || '[]'));
  } catch {
    expandedTactics = new Set();
  }
}

function clearSavedExpandedTactics() {
  sessionStorage.removeItem(EXPANDED_TACTICS_KEY);
}

// ── DOM ready ──────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  injectGraphHoverStyles();

  restoreExpandedTactics();

  if (performance.getEntriesByType('navigation')[0]?.type === 'reload') {
    expandedTactics.clear();
    clearSavedExpandedTactics();
  }

  const fetchJson = url => fetch(url).then(r => {
    if (!r.ok) throw new Error(`Failed to load ${url}: ${r.status}`);
    return r.json();
  });

  fetchJson('data/ape.json')
    .then(raw => {
      const data = normalizeData(raw);
      data.tactics.forEach(tactic => {
        tactic.id = toSlug(tactic.name);
        tactic.techniques.forEach(item => { item.id = toSlug(item.name); });
      });
      allData = data;

      // Build lookup index for modals
      buildIndex(data);

      // Open modal for any hash present in the URL
      handleDeepLink();

      // Render the graph (retries via rAF if dimensions aren't ready)
      renderGraph(data);
    })
    .catch(err => {
      const svg = document.getElementById('graph-svg');
      svg.innerHTML =
        `<text x="50%" y="50%" text-anchor="middle" fill="#e05c5c" font-size="14">` +
        `Error loading data: ${escHtml(err.message)}</text>`;
    });

  // Graph search handlers
  document.getElementById('graph-search-input').addEventListener('input', onGraphSearch);
  document.getElementById('graph-clear-btn').addEventListener('click', clearGraphSearch);
  document.getElementById('graph-reset-btn').addEventListener('click', () => {
    expandedTactics.clear();
    clearSavedExpandedTactics();
    if (allData) renderGraph(allData);
  });

  const expandAllBtn = document.getElementById('graph-expand-all-btn');
  if (expandAllBtn) {
    expandAllBtn.addEventListener('click', expandAllTactics);
  }

  const legacyBtn = document.getElementById('graph-legacy-btn');
  if (legacyBtn) {
    legacyBtn.addEventListener('click', () => {
      window.location.href = '/legacy';
    });
}

  document.getElementById('graph-search-input').addEventListener('blur', e => {
    if (e.relatedTarget === document.getElementById('graph-clear-btn')) return;
    if (!currentQuery) return;
    const input = document.getElementById('graph-search-input');
    input.value = '';
    currentQuery = '';
    document.getElementById('graph-clear-btn').classList.remove('visible');
    applySearchFilter();
    renderGraphResults();
  });

  // Prevent result card clicks from blurring the search input first
  document.getElementById('graph-results-panel').addEventListener('mousedown', e => {
    e.preventDefault();
  });

  // Modal close handlers
  const modalCloseBtn = document.getElementById('modal-close');
  if (modalCloseBtn) {
    modalCloseBtn.addEventListener('click', closeModal);
  }
  const modalOverlay = document.getElementById('modal-overlay');
  if (modalOverlay) {
    modalOverlay.addEventListener('click', e => {
      if (e.target === modalOverlay) closeModal();
    });
  }
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') closeModal();
  });

  // Debounced resize handler
  window.addEventListener('resize', debounce(() => {
    if (allData) renderGraph(allData);
  }, 150));
});


// ── Graph hover label styles ────────────────────────────────
function injectGraphHoverStyles() {
  if (document.getElementById('graph-hover-label-styles')) return;

  const style = document.createElement('style');
  style.id = 'graph-hover-label-styles';
  style.textContent = `
    .graph-node-tech .node-label-tech {
      transition: fill 0.15s ease, opacity 0.15s ease, font-weight 0.15s ease;
    }

    .graph-node-tech.branch-lit .node-label-tech,
    .graph-node-tech:hover .node-label-tech,
    .graph-node-tech:focus .node-label-tech {
      opacity: 1;
      font-weight: 600;
    }

    .graph-node-tech.branch-lit.color-0 .node-label-tech,
    .graph-node-tech.color-0:hover .node-label-tech,
    .graph-node-tech.color-0:focus .node-label-tech { fill: #37C980; }

    .graph-node-tech.branch-lit.color-1 .node-label-tech,
    .graph-node-tech.color-1:hover .node-label-tech,
    .graph-node-tech.color-1:focus .node-label-tech { fill: #59B2FF; }

    .graph-node-tech.branch-lit.color-2 .node-label-tech,
    .graph-node-tech.color-2:hover .node-label-tech,
    .graph-node-tech.color-2:focus .node-label-tech { fill: #D0FFEF; }

    .graph-node-tech.branch-lit.color-3 .node-label-tech,
    .graph-node-tech.color-3:hover .node-label-tech,
    .graph-node-tech.color-3:focus .node-label-tech { fill: #59B2FF; }

    .graph-node-tech.branch-lit.color-4 .node-label-tech,
    .graph-node-tech.color-4:hover .node-label-tech,
    .graph-node-tech.color-4:focus .node-label-tech { fill: #A997FF; }

    .graph-node-tech.branch-lit.color-5 .node-label-tech,
    .graph-node-tech.color-5:hover .node-label-tech,
    .graph-node-tech.color-5:focus .node-label-tech { fill: #B2C4D4; }

    .graph-node-tech.branch-lit.color-6 .node-label-tech,
    .graph-node-tech.color-6:hover .node-label-tech,
    .graph-node-tech.color-6:focus .node-label-tech { fill: #C46952; }

    .graph-node-tech.branch-lit.color-7 .node-label-tech,
    .graph-node-tech.color-7:hover .node-label-tech,
    .graph-node-tech.color-7:focus .node-label-tech { fill: #FFCE02; }

    .edge-tech.branch-lit {
      stroke-opacity: 0.95;
      stroke-width: 2.25;
    }

    .edge-tactic.branch-lit {
      stroke: rgba(55, 201, 128, 0.95);
      stroke-opacity: 1;
      stroke-width: 3;
    }

    .graph-node-tactic.tactic-hint-pulse .node-circle {
      animation: tacticHintPulse 1.15s ease-in-out 3;
      filter: drop-shadow(0 0 8px currentColor);
    }

    @keyframes tacticHintPulse {
      0%, 100% {
        stroke-width: 5;
        filter: drop-shadow(0 0 0 rgba(55, 201, 128, 0));
      }
      50% {
        stroke-width: 7;
        filter: drop-shadow(0 0 12px rgba(55, 201, 128, 0.9));
      }
    }

    .graph-interaction-hint {
      position: absolute;
      z-index: 20;
      padding: 12px 18px;
      border: 1px solid rgba(55, 201, 128, 0.45);
      border-radius: 999px;
      background: rgba(16, 36, 54, 0.95);
      color: #D0FFEF;
      font-family: var(--font);
      font-size: 0.95rem;
      font-weight: 600;
      line-height: 1;
      pointer-events: none;
      opacity: 0;
      box-shadow: 0 10px 28px rgba(0, 0, 0, 0.35);
      animation: graphHintFade 4s ease forwards;
      white-space: nowrap;
      transform: translate(-50%, -100%);
    }

    @keyframes graphHintFade {
      0% { opacity: 0; transform: translate(-50%, calc(-100% + 10px)); }
      12% { opacity: 1; transform: translate(-50%, -100%); }
      78% { opacity: 1; transform: translate(-50%, -100%); }
      100% { opacity: 0; transform: translate(-50%, calc(-100% - 8px)); }
    }
  `;
  document.head.appendChild(style);
}

// ── Index ───────────────────────────────────────────────────
function buildIndex(data) {
  itemIndex = {};
  data.tactics.forEach(tactic => {
    itemIndex[tactic.id] = {
      item: {
        id: tactic.id,
        sourceId: tactic.sourceId,
        name: tactic.name,
        description: tactic.description
      },
      categoryName: 'Tactic'
    };
    tactic.techniques.forEach(tech => {
      itemIndex[tech.id] = { item: tech, categoryName: tactic.name };
    });
  });
}

// ── Deep linking ───────────────────────────────────────────
function handleDeepLink() {
  const hash = location.hash.slice(1);
  if (!hash) return;
  requestAnimationFrame(() => {
    const entry = itemIndex[hash];
    if (entry) goToItemPage(item, categoryName);;
  });
}

// ── Layout computation ──────────────────────────────────────
/**
 * Returns an array of layout entries, one per tactic:
 * { tactic, startAngle, endAngle, midAngle, techniques: [{ tech, angle }] }
 *
 * Sector sizes are proportional to the number of techniques in each tactic,
 * so dense tactics get more angular space and nothing overlaps.
 */
function computeLayout(data) {
  const TWO_PI = Math.PI * 2;

  const tacticCount = data.tactics.length;
  const totalTechniques = data.tactics.reduce(
    (sum, tactic) => sum + tactic.techniques.length,
    0
  );

  const preferredGapAngle = 0.07;
  const maxTotalGapAngle = TWO_PI * 0.16;
  const gapAngle = Math.min(
    preferredGapAngle,
    maxTotalGapAngle / tacticCount
  );

  const usableAngle = TWO_PI - gapAngle * tacticCount;

  // Give every tactic a small base amount, then allocate the rest by technique count.
  // This avoids wasting huge arcs on tactics with only 2-3 techniques.
  const baseWeight = 1.25;

  const totalWeight = data.tactics.reduce(
    (sum, tactic) => sum + baseWeight + tactic.techniques.length,
    0
  );

  let cursor = -Math.PI / 2;
  const layout = [];

  data.tactics.forEach(tactic => {
    const weight = baseWeight + tactic.techniques.length;
    const sectorAngle = usableAngle * (weight / totalWeight);

    const startAngle = cursor;
    const endAngle = startAngle + sectorAngle;
    const midAngle = startAngle + sectorAngle / 2;

    const techCount = tactic.techniques.length;

    const techniques = tactic.techniques.map((tech, index) => {
      const angle =
        techCount === 1
          ? midAngle
          : startAngle + sectorAngle * ((index + 0.5) / techCount);

      return { tech, angle };
    });

    layout.push({
      tactic,
      startAngle,
      endAngle,
      midAngle,
      sectorAngle,
      techniques
    });

    cursor = endAngle + gapAngle;
  });

  return layout;
}

// ── Graph rendering ─────────────────────────────────────────
function renderGraph(data) {
  const svg = document.getElementById('graph-svg');
  const W = svg.clientWidth;
  const H = svg.clientHeight;

  // If the SVG hasn't been laid out yet, retry on the next animation frame
  if (W === 0 || H === 0) {
    requestAnimationFrame(() => renderGraph(data));
    return;
  }

  // Clear previous render and reset all interaction state
  svg.innerHTML = '';
  nodePositions.clear();
  nodeElements.clear();
  edgeElements.clear();
  techToTactic.clear();
  tacticToTechs.clear();
  //revealedTactics = new Set();
  //expandedTactics = new Set();
  //dragState    = null;
  const previouslyExpandedTactics = new Set(expandedTactics);

  revealedTactics = new Set();
  expandedTactics = previouslyExpandedTactics;
  dragState    = null;
  panDragState = null;
  wasDragging  = false;
  panZoom      = { tx: 0, ty: 0, scale: 1 };

  // Root group — all content lives here so pan/zoom transform is applied to it
  rootGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  rootGroup.setAttribute('id', 'graph-root');
  svg.appendChild(rootGroup);

  const CX = W / 2;
  const minDim = Math.min(W, H);
  const CY = H / 4 + minDim * 0.20;

  svgCenter = { x: CX, y: CY };
  nodePositions.set('center', { x: CX, y: CY });

  // Node sizes
  const isMobile  = minDim < 640;
  const R_CENTER  = minDim * 0.196;
  const R1        = minDim * (isMobile ? 0.50 : 0.46);
  const R2        = minDim * (isMobile ? 0.72 : 0.80);
  const R_TACTIC  = minDim * 0.085;
  const R_TECH    = minDim * 0.044;

  const layout = computeLayout(data);


  // ── Precompute positions and relationships ──────────────────

  layout.forEach(({ tactic, midAngle, techniques }) => {
    const tx = CX + Math.cos(midAngle) * R1;
    const ty = CY + Math.sin(midAngle) * R1;

    nodePositions.set(tactic.id, { x: tx, y: ty });
    tacticToTechs.set(tactic.id, []);

    techniques.forEach(({ tech, angle }) => {
      const ex = CX + Math.cos(angle) * R2;
      const ey = CY + Math.sin(angle) * R2;

      nodePositions.set(tech.id, { x: ex, y: ey });
      techToTactic.set(tech.id, tactic.id);
      tacticToTechs.get(tactic.id).push(tech.id);
    });
  });

  resolveCircleCollisions({
    iterations: 20,
    padding: minDim * 0.002,
    centerId: 'center',
    centerRadius: R_CENTER,
    tacticRadius: R_TACTIC,
    techRadius: R_TECH
  });

  // ── Draw edges first so they appear behind all nodes ─────────

  layout.forEach(({ tactic }) => {
    const tp = nodePositions.get(tactic.id);
    drawEdge(
      rootGroup,
      CX,
      CY,
      tp.x,
      tp.y,
      CX,
      CY,
      'edge-tactic',
      `center-${tactic.id}`,
      'center',
      tactic.id
    );
  });

  const TACTIC_COLORS_EDGE = [
    '#37C980', '#1385F0', '#D0FFEF', '#59B2FF',
    '#A997FF', '#B2C4D4', '#C46952', '#FFCE02',
  ];

  layout.forEach(({ tactic, techniques }, tacticIdx) => {
    const tp = nodePositions.get(tactic.id);
    const edgeColor = TACTIC_COLORS_EDGE[tacticIdx];

    techniques.forEach(({ tech }) => {
      const ep = nodePositions.get(tech.id);
      drawEdge(
        rootGroup,
        tp.x,
        tp.y,
        ep.x,
        ep.y,
        CX,
        CY,
        'edge-tech',
        `${tactic.id}-${tech.id}`,
        tactic.id,
        tech.id,
        edgeColor
      );
    });
  });

  // ── Draw center node ────────────────────────────────────────
  const centerG = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  centerG.setAttribute('class', 'graph-node-center');
  centerG.setAttribute('transform', `translate(${CX},${CY})`);

  const centerCircle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
  centerCircle.setAttribute('class', 'node-circle');
  centerCircle.setAttribute('r', R_CENTER);
  centerG.appendChild(centerCircle);

  const centerImg = document.createElementNS('http://www.w3.org/2000/svg', 'image');
  const imgSize = R_CENTER * 1.4;
  centerImg.setAttribute('href', 'images/ape-logo.svg');
  centerImg.setAttribute('x', -imgSize / 2);
  centerImg.setAttribute('y', -imgSize / 2);
  centerImg.setAttribute('width', imgSize);
  centerImg.setAttribute('height', imgSize);
  centerG.appendChild(centerImg);

  rootGroup.appendChild(centerG);

  centerG.addEventListener('dblclick', () => {
    clearGraphSearchState();
    startBananaRain();
    expandAllTacticsOneByOne();
  });

  const TACTIC_COLORS = [
    '#37C980',
    '#1385F0',
    '#D0FFEF',
    '#59B2FF',
    '#A997FF',
    '#B2C4D4',
    '#C46952',
    '#FFCE02',
  ];

  // ── Draw technique nodes first ──────────────────────────────
  // This keeps expanded technique circles below tactic labels.
  layout.forEach(({ tactic, techniques }, tacticIdx) => {
    techniques.forEach(({ tech, angle }) => {
      const ep = nodePositions.get(tech.id);
      const tacticPos = nodePositions.get(tactic.id);

      const localAngle = Math.atan2(
        ep.y - tacticPos.y,
        ep.x - tacticPos.x
      );

      drawNode(
        rootGroup,
        ep.x,
        ep.y,
        R_TECH,
        localAngle,
        tech,
        'tech',
        tactic.name,
        CX,
        CY,
        tacticIdx
      );
    });
  });

  // ── Draw tactic nodes last ──────────────────────────────────
  // Tactic labels now paint above nearby expanded technique circles.
  layout.forEach(({ tactic }, tacticIdx) => {
    const tp = nodePositions.get(tactic.id);
    const tacticItem = {
      id: tactic.id,
      sourceId: tactic.sourceId,
      name: tactic.name,
      description: tactic.description
    };

    drawNode(
      rootGroup,
      tp.x,
      tp.y,
      R_TACTIC,
      0,
      tacticItem,
      'tactic',
      'Tactic',
      CX,
      CY,
      tacticIdx
    );
  });

  // ── Wire up pan/zoom and drag interaction ──────────────────
  setupPanZoom(svg);
  setupDrag(svg);

  // Hide outer-ring technique nodes and labels by default.
  applyExpansionState();

  // ── Wire up tactic branch hover ─────────────────────────────
  setupTacticHover();

  // Re-apply active search filter after graph re-render
  if (currentQuery) applySearchFilter();

  // Fit the collapsed graph into the visible viewport on initial load / resize
  fitGraphToView(svg);

  // Briefly call attention to the clickable tactic nodes on first load.
  showInitialGraphHint(svg, CX, CY, R_CENTER);
}

function resolveCircleCollisions({
  iterations = 60,
  padding = 8,
  centerId = 'center',
  centerRadius,
  tacticRadius,
  techRadius
}) {
  const getRadius = id => {
    if (id === centerId) return centerRadius;
    if (tacticToTechs.has(id)) return tacticRadius;
    return techRadius;
  };

  const ids = [...nodePositions.keys()].filter(id => id !== centerId);

  for (let i = 0; i < iterations; i++) {
    for (let a = 0; a < ids.length; a++) {
      for (let b = a + 1; b < ids.length; b++) {
        const idA = ids[a];
        const idB = ids[b];

        const posA = nodePositions.get(idA);
        const posB = nodePositions.get(idB);
        if (!posA || !posB) continue;

        const radiusA = getRadius(idA);
        const radiusB = getRadius(idB);
        const minDistance = radiusA + radiusB + padding;

        let dx = posB.x - posA.x;
        let dy = posB.y - posA.y;
        let distance = Math.sqrt(dx * dx + dy * dy);

        if (distance === 0) {
          dx = 1;
          dy = 0;
          distance = 1;
        }

        if (distance >= minDistance) continue;

        const overlap = minDistance - distance;
        const nx = dx / distance;
        const ny = dy / distance;

        const move = overlap / 2;

        posA.x -= nx * move;
        posA.y -= ny * move;
        posB.x += nx * move;
        posB.y += ny * move;

        nodePositions.set(idA, posA);
        nodePositions.set(idB, posB);
      }
    }
  }
}

// ── Initial interaction hint ─────────────────────────────────
function showInitialGraphHint(svg, CX, CY, R_CENTER) {
  if (graphHintDismissed || !svg || !rootGroup) return;

  nodeElements.forEach(el => {
    if (el.classList.contains('graph-node-tactic')) {
      el.classList.add('tactic-hint-pulse');
    }
  });

  const graphMain = document.getElementById('graph-main');
  if (graphMain && !document.getElementById('graph-interaction-hint')) {
    const hint = document.createElement('div');
    hint.id = 'graph-interaction-hint';
    hint.className = 'graph-interaction-hint';
    hint.textContent = 'Click a Tactic to Explore the Taxonomy';

    // Center the hint above the actual center logo circle.
    // The SVG graph itself is transformed by pan/zoom after fitGraphToView(),
    // so convert graph coordinates into screen coordinates using the current
    // panZoom values rather than using raw CX/CY directly.
    const gap = 14;
    const x = panZoom.tx + CX * panZoom.scale;
    const y = panZoom.ty + (CY - R_CENTER - gap) * panZoom.scale;

    hint.style.left = `${x}px`;
    hint.style.top = `${y}px`;

    graphMain.appendChild(hint);
  }

  const dismissEvents = ['mousedown', 'touchstart', 'wheel', 'keydown'];
  dismissEvents.forEach(eventName => {
    svg.addEventListener(eventName, dismissInitialGraphHint, { once: true, passive: true });
  });

  const searchInput = document.getElementById('graph-search-input');
  if (searchInput) {
    searchInput.addEventListener('focus', dismissInitialGraphHint, { once: true });
    searchInput.addEventListener('input', dismissInitialGraphHint, { once: true });
  }

  clearTimeout(graphHintTimer);
  graphHintTimer = setTimeout(dismissInitialGraphHint, 4200);
}

function dismissInitialGraphHint() {
  if (graphHintDismissed) return;
  graphHintDismissed = true;
  clearTimeout(graphHintTimer);

  nodeElements.forEach(el => el.classList.remove('tactic-hint-pulse'));

  const hint = document.getElementById('graph-interaction-hint');
  if (hint) {
    hint.style.animation = 'none';
    hint.style.opacity = '0';
    hint.remove();
  }
}

// ── Fit graph to viewport ────────────────────────────────────
function fitGraphToView(svg, animate = false) {
  const bbox = rootGroup.getBBox();
  if (!bbox || bbox.width === 0 || bbox.height === 0) return;

  // Visible area: keep the fitted graph inside the actual SVG viewport and
  // reserve space for the footer on shorter screens so bottom labels are not hidden.
  const svgRect = svg.getBoundingClientRect();
  const footer = document.querySelector('footer');
  const footerH = footer ? footer.getBoundingClientRect().height : 0;

  // Laptop/desktop screens have enough width but limited vertical room.
  // Use tighter padding and a slightly more aggressive fit so the graph
  // feels intentional instead of floating in the middle of the page.
  const isLaptopLike = window.innerWidth >= 900 && window.innerHeight <= 1000;
  const padX = isLaptopLike ? 16 : 24;
  const padY = isLaptopLike ? 12 : 24;
  const fitRatio = isLaptopLike ? 0.98 : 0.92;

  const availableWindowH = window.innerHeight - svgRect.top - footerH;
  const viewW = Math.max(240, svg.clientWidth - padX * 2);
  const viewH = Math.max(240, Math.min(svg.clientHeight, availableWindowH) - padY * 2);

  // Scale so the graph fills the available space while leaving a safe margin.
  const scale = Math.min(viewW / bbox.width, viewH / bbox.height) * fitRatio;

  // Translate so the graph is centered inside the safe viewport.
  const tx = padX + (viewW - bbox.width * scale) / 2 - bbox.x * scale;
  const ty = padY + (viewH - bbox.height * scale) / 2 - bbox.y * scale;

  const target = { tx, ty, scale };

  if (animate) {
    animatePanZoomTo(target);
    return;
  }

  panZoom = target;
  applyPanZoom();
}

function fitUpperHalfGraphToView(svg, animate = true) {
  const bbox = rootGroup.getBBox();
  const centerPos = nodePositions.get('center');

  if (!bbox || bbox.width === 0 || bbox.height === 0 || !centerPos) return;

  const svgRect = svg.getBoundingClientRect();
  const footer = document.querySelector('footer');
  const footerH = footer ? footer.getBoundingClientRect().height : 0;

  const padX = 24;
  const padTop = 24;
  const padBottom = 24;

  const availableWindowH = window.innerHeight - svgRect.top - footerH;
  const viewW = Math.max(240, svg.clientWidth - padX * 2);
  const viewH = Math.max(
    240,
    Math.min(svg.clientHeight, availableWindowH) - padTop - padBottom
  );

  // Only fit the upper half of the full graph.
  const upperHalfHeight = Math.max(1, centerPos.y - bbox.y);

  // Full graph fit scale
  const fullFitScale = Math.min(
    viewW / bbox.width,
    viewH / bbox.height
  ) * 0.96;

  // Upper-half cinematic scale.
  // Use height only so smaller screens can still zoom into the upper half,
  // even if that means cropping the far left/right edges a bit.
  const upperHalfScale = (viewH / upperHalfHeight) * 0.82;

  const scale = Math.min(
    upperHalfScale,
    fullFitScale * 1.60
  );

  // Center the inner circle horizontally, place it at the bottom vertically.
  const viewCenterX = svg.clientWidth / 2;
  const centerBottomOffset = viewH * 0.16;
  const viewBottomY = padTop + viewH - centerBottomOffset;

  const target = {
    tx: viewCenterX - centerPos.x * scale,
    ty: viewBottomY - centerPos.y * scale,
    scale,
  };

  if (animate) {
    animatePanZoomTo(target);
  } else {
    panZoom = target;
    applyPanZoom();
  }
}

function animatePanZoomTo(target, duration = 420) {
  const start = { ...panZoom };
  const startTime = performance.now();

  function easeInOutCubic(t) {
    return t < 0.5
      ? 4 * t * t * t
      : 1 - Math.pow(-2 * t + 2, 3) / 2;
  }

  function step(now) {
    const progress = Math.min(1, (now - startTime) / duration);
    const eased = easeInOutCubic(progress);

    panZoom = {
      tx: start.tx + (target.tx - start.tx) * eased,
      ty: start.ty + (target.ty - start.ty) * eased,
      scale: start.scale + (target.scale - start.scale) * eased,
    };
    applyPanZoom();

    if (progress < 1) requestAnimationFrame(step);
  }

  requestAnimationFrame(step);
}

function centerGraphBetweenCenterAndNode(nodeId, animate = true) {
  const svg = document.getElementById('graph-svg');
  const centerPos = nodePositions.get('center');
  const nodePos = nodePositions.get(nodeId);

  if (!svg || !rootGroup || !centerPos || !nodePos) return;

  const svgRect = svg.getBoundingClientRect();
  const footer = document.querySelector('footer');
  const footerH = footer ? footer.getBoundingClientRect().height : 0;

  // 0.5 = exact midpoint
  // 0.75 = 75% toward the tactic
  // 1.0 = directly center on the tactic
  const focusRatio = 0.70;

  const focusPoint = {
    x: centerPos.x + (nodePos.x - centerPos.x) * focusRatio,
    y: centerPos.y + (nodePos.y - centerPos.y) * focusRatio,
  };

  const availableWindowH =
    window.innerHeight - svgRect.top - footerH;

  const viewW = Math.max(240, svg.clientWidth);
  const viewH = Math.max(
    240,
    Math.min(svg.clientHeight, availableWindowH)
  );

  const viewCenterX = viewW / 2;
  const viewCenterY = viewH / 2;

  const target = {
    tx: viewCenterX - focusPoint.x * panZoom.scale,
    ty: viewCenterY - focusPoint.y * panZoom.scale,
    scale: panZoom.scale,
  };

  if (animate) {
    animatePanZoomTo(target);
  } else {
    panZoom = target;
    applyPanZoom();
  }
}


// ── Tactic expansion / collapse ─────────────────────────────
function applyExpansionState() {
  tacticToTechs.forEach((techIds, tacticId) => {
    setTacticExpanded(tacticId, expandedTactics.has(tacticId));
  });
}

function expandAllTactics() {
  dismissInitialGraphHint();

  tacticToTechs.forEach((techIds, tacticId) => {
    setTacticExpanded(tacticId, true);
  });

  const svg = document.getElementById('graph-svg');

  if (svg && rootGroup) {
    requestAnimationFrame(() => {
      fitGraphToView(svg, true);

      setTimeout(() => {
        fitUpperHalfGraphToView(svg, true);
      }, 900);
    });
  }
}

function expandAllTacticsOneByOne() {
  dismissInitialGraphHint();

  const svg = document.getElementById('graph-svg');
  const tacticIds = [...tacticToTechs.keys()];

  if (!svg || !rootGroup) return;

  // Temporarily reveal all techniques invisibly so getBBox()
  // measures the full expanded graph.
  tacticIds.forEach(tacticId => {
    setTacticExpanded(tacticId, true);
  });

  nodeElements.forEach(el => {
    if (el.classList.contains('graph-node-tech')) {
      el.style.opacity = '0';
    }
  });

  edgeElements.forEach(({ el }) => {
    if (el.classList.contains('edge-tech')) {
      el.style.opacity = '0';
    }
  });

  requestAnimationFrame(() => {
    // Step 1: zoom out to the full expanded graph
    fitGraphToView(svg, true);

    // Step 2: collapse again while staying zoomed out
    setTimeout(() => {
      tacticIds.forEach(tacticId => {
        setTacticExpanded(tacticId, false);
      });

      nodeElements.forEach(el => {
        if (el.classList.contains('graph-node-tech')) {
          el.style.opacity = '';
        }
      });

      edgeElements.forEach(({ el }) => {
        if (el.classList.contains('edge-tech')) {
          el.style.opacity = '';
        }
      });

      // Step 3: reveal tactics one by one
      setTimeout(() => {
        tacticIds.forEach((tacticId, index) => {
          setTimeout(() => {
            setTacticExpanded(tacticId, true);

            if (index === tacticIds.length - 1) {
              setTimeout(() => {
                fitUpperHalfGraphToView(svg, true);
              }, 900);
            }
          }, index * 500);
        });
      }, 250);
    }, 550);
  });
}

function startBananaRain(duration = 6000) {

  let longestAnimation = 0;

  const container = document.createElement('div');

  container.id = 'banana-rain';
  container.style.position = 'fixed';
  container.style.inset = '0';
  container.style.pointerEvents = 'none';
  container.style.zIndex = '99999';
  container.style.overflow = 'hidden';

  document.body.appendChild(container);

  const bananaCount = 80;

  for (let i = 0; i < bananaCount; i++) {
    const banana = document.createElement('div');

    banana.textContent = '🍌';

    const size = 18 + Math.random() * 42;
    const left = Math.random() * 100;
    const delay = Math.random() * 2;
    const fallDuration = 3 + Math.random() * 4;
    const rotate = -180 + Math.random() * 360;

    longestAnimation = Math.max(
      longestAnimation,
      fallDuration + delay
    );
    banana.style.position = 'absolute';
    banana.style.left = `${left}%`;
    banana.style.top = '-10%';
    banana.style.fontSize = `${size}px`;
    banana.style.opacity = '0.95';
    banana.style.transform = `rotate(${rotate}deg)`;
    banana.style.animation = `
      bananaFall ${fallDuration}s linear ${delay}s forwards
    `;

    container.appendChild(banana);
  }

  if (!document.getElementById('banana-rain-style')) {
    const style = document.createElement('style');

    style.id = 'banana-rain-style';

    style.textContent = `
      @keyframes bananaFall {
        0% {
          transform:
            translateY(-10vh)
            rotate(0deg);
          opacity: 0;
        }

        10% {
          opacity: 1;
        }

        100% {
          transform:
            translateY(120vh)
            rotate(720deg);
          opacity: 0.9;
        }
      }
    `;

    document.head.appendChild(style);
  }

  setTimeout(() => {
    container.remove();
  }, longestAnimation * 1000 + 500);
}

function toggleTacticExpanded(tacticId) {
  const shouldExpand = !expandedTactics.has(tacticId);
  setTacticExpanded(tacticId, shouldExpand);

  // Keep the current zoom level and smoothly pan to the midpoint between
  // the center circle and clicked tactic instead of refitting the full graph.
  requestAnimationFrame(() => centerGraphBetweenCenterAndNode(tacticId, true));
}

function setTacticExpanded(tacticId, shouldExpand) {
  if (shouldExpand) expandedTactics.add(tacticId);
  else expandedTactics.delete(tacticId);

  saveExpandedTactics();

  const tacticEl = nodeElements.get(tacticId);
  if (tacticEl) {
    tacticEl.classList.toggle('expanded', shouldExpand);
    tacticEl.setAttribute('aria-expanded', String(shouldExpand));
  }

  (tacticToTechs.get(tacticId) || []).forEach(techId => {
    const techEl = nodeElements.get(techId);
    if (techEl) {
      techEl.style.display = shouldExpand ? '' : 'none';

      const label = techEl.querySelector('.node-label-tech');
      if (label) label.style.display = shouldExpand ? '' : 'none';

      if (!shouldExpand) techEl.classList.remove('branch-lit', 'match');
    }

    const edgeInfo = edgeElements.get(`${tacticId}-${techId}`);
    if (edgeInfo) {
      edgeInfo.el.style.display = shouldExpand ? '' : 'none';
      if (!shouldExpand) edgeInfo.el.classList.remove('branch-lit', 'match');
    }
  });
}

// ── Tactic branch hover ──────────────────────────────────────
function setupTacticHover() {
  tacticToTechs.forEach((techIds, tacticId) => {
    const tacticEl = nodeElements.get(tacticId);
    if (!tacticEl) return;

    tacticEl.addEventListener('mouseenter', () => {
      const centerEdgeInfo = edgeElements.get(`center-${tacticId}`);
      if (centerEdgeInfo) centerEdgeInfo.el.classList.add('branch-lit');

      techIds.forEach(techId => {
        const techEl = nodeElements.get(techId);
        if (techEl) techEl.classList.add('branch-lit');
        const edgeInfo = edgeElements.get(`${tacticId}-${techId}`);
        if (edgeInfo) edgeInfo.el.classList.add('branch-lit');
      });

      techIds.forEach(techId => {
        const techEl = nodeElements.get(techId);
        if (techEl) {
          techEl.classList.add('branch-lit');

          const label = techEl.querySelector('.node-label-tech');
          if (label) label.style.display = '';
        }

        const edgeInfo = edgeElements.get(`${tacticId}-${techId}`);
        if (edgeInfo) edgeInfo.el.classList.add('branch-lit');
      });
    });

    tacticEl.addEventListener('mouseleave', () => {
      const centerEdgeInfo = edgeElements.get(`center-${tacticId}`);
      if (centerEdgeInfo) centerEdgeInfo.el.classList.remove('branch-lit');

      techIds.forEach(techId => {
        const techEl = nodeElements.get(techId);
        if (techEl) techEl.classList.remove('branch-lit');
        const edgeInfo = edgeElements.get(`${tacticId}-${techId}`);
        if (edgeInfo) edgeInfo.el.classList.remove('branch-lit');
      });

      techIds.forEach(techId => {
        const techEl = nodeElements.get(techId);
        if (techEl) {
          techEl.classList.remove('branch-lit');

          const label = techEl.querySelector('.node-label-tech');
          if (label && !expandedTactics.has(tacticId)) {
            label.style.display = 'none';
          }
        }

        const edgeInfo = edgeElements.get(`${tacticId}-${techId}`);
        if (edgeInfo) edgeInfo.el.classList.remove('branch-lit');
      });
    });
  });
}

// ── Pan / zoom ───────────────────────────────────────────────
function setupPanZoom(svg) {
  svg.addEventListener('wheel', onWheel, { passive: false });
  svg.addEventListener('touchstart', onTouchStart, { passive: false });
  svg.addEventListener('touchmove',  onTouchMove,  { passive: false });
  svg.addEventListener('touchend',   onTouchEnd,   { passive: false });
  svg.addEventListener('touchcancel',onTouchEnd,   { passive: false });
}

function applyPanZoom() {
  if (rootGroup) {
    rootGroup.setAttribute('transform',
      `translate(${panZoom.tx},${panZoom.ty}) scale(${panZoom.scale})`);
  }
}

function onWheel(e) {
  e.preventDefault();
  const svg = document.getElementById('graph-svg');

  // Mouse position in SVG coordinate space (pre-transform)
  const svgPt = getSVGSpacePoint(svg, e);

  // Normalize delta so fast trackpad swipes don't jump wildly
  const delta     = Math.sign(e.deltaY) * Math.min(Math.abs(e.deltaY), 50);
  const factor    = Math.pow(ZOOM_FACTOR, delta / 50);
  const newScale  = Math.max(MIN_SCALE, Math.min(MAX_SCALE, panZoom.scale * factor));
  if (newScale === panZoom.scale) return;

  // Keep the point under the cursor fixed:
  // svgPt = translate + scale * graphPt  →  graphPt = (svgPt - translate) / scale
  const graphX = (svgPt.x - panZoom.tx) / panZoom.scale;
  const graphY = (svgPt.y - panZoom.ty) / panZoom.scale;
  panZoom.tx    = svgPt.x - newScale * graphX;
  panZoom.ty    = svgPt.y - newScale * graphY;
  panZoom.scale = newScale;

  applyPanZoom();
}

// ── Touch pan / pinch-zoom ───────────────────────────────────
let touchPanState  = null; // { startClientX, startClientY, startTx, startTy }
let pinchState     = null; // { startDist, startScale, midSvgX, midSvgY }

function touchDist(t1, t2) {
  const dx = t1.clientX - t2.clientX;
  const dy = t1.clientY - t2.clientY;
  return Math.sqrt(dx * dx + dy * dy);
}

function onTouchStart(e) {
  e.preventDefault();
  const svg = document.getElementById('graph-svg');
  if (e.touches.length === 1) {
    pinchState = null;
    const touch = e.touches[0];

    // Check if the touch landed on a draggable node
    const el = document.elementFromPoint(touch.clientX, touch.clientY);
    const g  = el && el.closest('.graph-node');
    if (g && !g.classList.contains('graph-node-center')) {
      const id  = g.dataset.id;
      const pos = nodePositions.get(id);
      if (pos) {
        const pt       = getSVGPointFromClient(svg, touch.clientX, touch.clientY);
        const tacticId = techToTactic.get(id) || null;
        const tacticPos = tacticId ? nodePositions.get(tacticId) : null;
        let techStartPositions = null;
        if (!tacticId) {
          techStartPositions = new Map();
          (tacticToTechs.get(id) || []).forEach(tid => {
            const tp = nodePositions.get(tid);
            if (tp) techStartPositions.set(tid, { x: tp.x, y: tp.y });
          });
        }
        dragState = {
          nodeId:            id,
          startMouseX:       pt.x,
          startMouseY:       pt.y,
          startNodeX:        pos.x,
          startNodeY:        pos.y,
          hasMoved:          false,
          tacticId,
          tacticStartX:      tacticPos ? tacticPos.x : null,
          tacticStartY:      tacticPos ? tacticPos.y : null,
          techStartPositions,
        };
        touchPanState = null;
        return;
      }
    }

    // No node hit — pan
    touchPanState = {
      startClientX: touch.clientX,
      startClientY: touch.clientY,
      startTx: panZoom.tx,
      startTy: panZoom.ty,
    };
  } else if (e.touches.length === 2) {
    // Cancel any in-progress node drag when a second finger lands
    if (dragState) {
      if (dragState.hasMoved) wasDragging = true;
      dragState = null;
    }
    touchPanState = null;
    const t1 = e.touches[0], t2 = e.touches[1];
    const midClient = { x: (t1.clientX + t2.clientX) / 2, y: (t1.clientY + t2.clientY) / 2 };
    const pt = svg.createSVGPoint();
    pt.x = midClient.x; pt.y = midClient.y;
    const midSvg = pt.matrixTransform(svg.getScreenCTM().inverse());
    pinchState = {
      startDist:  touchDist(t1, t2),
      startScale: panZoom.scale,
      startTx:    panZoom.tx,
      startTy:    panZoom.ty,
      midSvgX:    midSvg.x,
      midSvgY:    midSvg.y,
      midClientX: midClient.x,
      midClientY: midClient.y,
    };
  }
}

function onTouchMove(e) {
  e.preventDefault();
  if (e.touches.length === 1) {
    const touch = e.touches[0];
    if (dragState) {
      const svg = document.getElementById('graph-svg');
      const pt  = getSVGPointFromClient(svg, touch.clientX, touch.clientY);
      const dx  = pt.x - dragState.startMouseX;
      const dy  = pt.y - dragState.startMouseY;
      if (Math.abs(dx) > DRAG_THRESHOLD || Math.abs(dy) > DRAG_THRESHOLD) {
        dragState.hasMoved = true;
      }
      if (dragState.hasMoved) applyNodeDrag(dx, dy);
    } else if (touchPanState) {
      panZoom.tx = touchPanState.startTx + (touch.clientX - touchPanState.startClientX);
      panZoom.ty = touchPanState.startTy + (touch.clientY - touchPanState.startClientY);
      applyPanZoom();
    }
  } else if (e.touches.length === 2 && pinchState) {
    const t1 = e.touches[0], t2 = e.touches[1];
    const dist = touchDist(t1, t2);
    const rawScale = pinchState.startScale * (dist / pinchState.startDist);
    const newScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, rawScale));

    // Keep the pinch midpoint fixed in graph space
    const graphX = (pinchState.midSvgX - pinchState.startTx) / pinchState.startScale;
    const graphY = (pinchState.midSvgY - pinchState.startTy) / pinchState.startScale;

    // Also allow the midpoint to pan as the fingers move together
    const svg = document.getElementById('graph-svg');
    const midClientX = (t1.clientX + t2.clientX) / 2;
    const midClientY = (t1.clientY + t2.clientY) / 2;
    const pt = svg.createSVGPoint();
    pt.x = midClientX; pt.y = midClientY;
    const midSvgNow = pt.matrixTransform(svg.getScreenCTM().inverse());

    panZoom.tx    = midSvgNow.x - newScale * graphX;
    panZoom.ty    = midSvgNow.y - newScale * graphY;
    panZoom.scale = newScale;
    applyPanZoom();
  }
}

function onTouchEnd(e) {
  if (e.touches.length === 0) {
    if (dragState) {
      if (dragState.hasMoved) {
        wasDragging = true;
      } else {
        // Tap on a node — two-tap reveal on mobile for technique nodes
        const entry = itemIndex[dragState.nodeId];
        if (entry) {
          const { item, categoryName } = entry;
          const isTech = categoryName !== 'Tactic' && categoryName !== 'Objective';
          if (isTech && window.innerWidth < 640) {
            const tacticId = techToTactic.get(item.id);
            if (tacticId && !revealedTactics.has(tacticId)) {
              revealedTactics.add(tacticId);
              (tacticToTechs.get(tacticId) || []).forEach(techId => {
                const techEl = nodeElements.get(techId);
                if (techEl) {
                  const label = techEl.querySelector('.node-label-tech');
                  if (label) label.style.display = '';
                }
              });
              dragState = null;
              return;
            }
          }
          goToItemPage(item, categoryName);
        }
      }
      dragState = null;
    }
    touchPanState = null;
    pinchState    = null;
  } else if (e.touches.length === 1) {
    // One finger lifted — stop any node drag and switch to pan
    if (dragState) {
      if (dragState.hasMoved) wasDragging = true;
      dragState = null;
    }
    pinchState = null;
    touchPanState = {
      startClientX: e.touches[0].clientX,
      startClientY: e.touches[0].clientY,
      startTx: panZoom.tx,
      startTy: panZoom.ty,
    };
  }
}

// ── Drag interaction ─────────────────────────────────────────
function setupDrag(svg) {
  svg.addEventListener('mousedown', onDragStart);
  svg.addEventListener('mousemove', onDragMove);
  svg.addEventListener('mouseup',   onDragEnd);
  svg.addEventListener('mouseleave', onDragEnd);
}

// Convert a mouse event to SVG coordinate space (no pan/zoom adjustment)
function getSVGSpacePoint(svg, e) {
  const pt = svg.createSVGPoint();
  pt.x = e.clientX;
  pt.y = e.clientY;
  return pt.matrixTransform(svg.getScreenCTM().inverse());
}

// Convert a mouse event to graph space (accounts for pan/zoom transform)
function getSVGPoint(svg, e) {
  return getSVGPointFromClient(svg, e.clientX, e.clientY);
}

// Convert client coordinates to graph space (accounts for pan/zoom transform)
function getSVGPointFromClient(svg, clientX, clientY) {
  const pt = svg.createSVGPoint();
  pt.x = clientX;
  pt.y = clientY;
  return pt.matrixTransform(rootGroup.getScreenCTM().inverse());
}

function onDragStart(e) {
  if (e.button !== 0) return;
  const g = e.target.closest('.graph-node');

  // Clicking on empty space (or the center node) → pan the whole graph
  if (!g || g.classList.contains('graph-node-center')) {
    if (g) return; // center node — don't pan
    const svg = document.getElementById('graph-svg');
    panDragState = {
      startClientX: e.clientX,
      startClientY: e.clientY,
      startTx: panZoom.tx,
      startTy: panZoom.ty,
    };
    e.preventDefault();
    svg.style.cursor = 'grabbing';
    return;
  }

  const id = g.dataset.id;
  const pos = nodePositions.get(id);
  if (!pos) return;

  const svg = document.getElementById('graph-svg');
  const pt = getSVGPoint(svg, e);

  // For technique nodes, capture tactic's starting position for the pull.
  // For tactic nodes, capture starting positions of all child techniques.
  const tacticId = techToTactic.get(id) || null;
  const tacticPos = tacticId ? nodePositions.get(tacticId) : null;

  let techStartPositions = null;
  if (!tacticId) {
    // This is a tactic node — snapshot all child technique positions
    techStartPositions = new Map();
    (tacticToTechs.get(id) || []).forEach(tid => {
      const tp = nodePositions.get(tid);
      if (tp) techStartPositions.set(tid, { x: tp.x, y: tp.y });
    });
  }

  dragState = {
    nodeId:            id,
    startMouseX:       pt.x,
    startMouseY:       pt.y,
    startNodeX:        pos.x,
    startNodeY:        pos.y,
    hasMoved:          false,
    tacticId,
    tacticStartX:      tacticPos ? tacticPos.x : null,
    tacticStartY:      tacticPos ? tacticPos.y : null,
    techStartPositions,
  };

  e.preventDefault();
  svg.style.cursor = 'grabbing';
}

function onDragMove(e) {
  if (panDragState) {
    panZoom.tx = panDragState.startTx + (e.clientX - panDragState.startClientX);
    panZoom.ty = panDragState.startTy + (e.clientY - panDragState.startClientY);
    applyPanZoom();
    return;
  }
  if (!dragState) return;

  const svg = document.getElementById('graph-svg');
  const pt = getSVGPoint(svg, e);
  const dx = pt.x - dragState.startMouseX;
  const dy = pt.y - dragState.startMouseY;

  if (Math.abs(dx) > DRAG_THRESHOLD || Math.abs(dy) > DRAG_THRESHOLD) {
    dragState.hasMoved = true;
  }
  if (!dragState.hasMoved) return;

  applyNodeDrag(dx, dy);
}

function applyNodeDrag(dx, dy) {
  const { nodeId, startNodeX, startNodeY, tacticId } = dragState;

  setNodePosition(nodeId, startNodeX + dx, startNodeY + dy);

  if (tacticId) {
    // Technique node: update its edge, then pull the parent tactic slightly
    updateEdge(`${tacticId}-${nodeId}`);

    const newTacticX = dragState.tacticStartX + dx * TACTIC_PULL;
    const newTacticY = dragState.tacticStartY + dy * TACTIC_PULL;
    setNodePosition(tacticId, newTacticX, newTacticY);
    updateEdge(`center-${tacticId}`);

    // Update edges from the tactic to its other techniques
    (tacticToTechs.get(tacticId) || []).forEach(tid => {
      if (tid !== nodeId) updateEdge(`${tacticId}-${tid}`);
    });
  } else {
    // Tactic node: move it, move all child techniques by the same delta, update edges
    updateEdge(`center-${nodeId}`);
    (tacticToTechs.get(nodeId) || []).forEach(tid => {
      const start = dragState.techStartPositions && dragState.techStartPositions.get(tid);
      if (start) setNodePosition(tid, start.x + dx, start.y + dy);
      updateEdge(`${nodeId}-${tid}`);
    });
  }
}

function onDragEnd() {
  const svg = document.getElementById('graph-svg');
  if (panDragState) {
    panDragState = null;
    svg.style.cursor = '';
    return;
  }
  if (!dragState) return;
  if (dragState.hasMoved) wasDragging = true;
  dragState = null;
  svg.style.cursor = '';
}

function setNodePosition(id, x, y) {
  nodePositions.set(id, { x, y });
  const el = nodeElements.get(id);
  if (el) el.setAttribute('transform', `translate(${x},${y})`);
}

function updateEdge(key) {
  const info = edgeElements.get(key);
  if (!info) return;
  const { el, fromId, toId } = info;
  const from = nodePositions.get(fromId);
  const to   = nodePositions.get(toId);
  if (!from || !to) return;
  const mx  = (from.x + to.x) / 2;
  const my  = (from.y + to.y) / 2;
  const cpx = mx + (svgCenter.x - mx) * 0.2;
  const cpy = my + (svgCenter.y - my) * 0.2;
  el.setAttribute('d', `M${from.x},${from.y} Q${cpx},${cpy} ${to.x},${to.y}`);
}

// ── Edge drawing ────────────────────────────────────────────
/**
 * Draws a quadratic Bezier curve between (x1,y1) and (x2,y2).
 * The control point is the midpoint of the two endpoints, pulled
 * 20% of the way toward the SVG center (CX, CY), giving gentle
 * organic curves that bow slightly inward.
 */
function drawEdge(parent, x1, y1, x2, y2, CX, CY, cls, key, fromId, toId, color = null) {
  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2;
  // Pull control point 20% toward center
  const cpx = mx + (CX - mx) * 0.2;
  const cpy = my + (CY - my) * 0.2;

  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('class', cls);
  path.setAttribute('d', `M${x1},${y1} Q${cpx},${cpy} ${x2},${y2}`);
  if (color) {
    path.setAttribute('stroke', color);
    path.setAttribute('stroke-opacity', '0.3');
  }
  parent.appendChild(path);

  if (key) edgeElements.set(key, { el: path, fromId, toId });
}

// ── Node drawing ─────────────────────────────────────────────
/**
 * Creates a <g> containing a <circle class="node-circle"> and a text label.
 * Clicking a tactic or technique node opens the modal.
 *
 * @param {SVGElement} parent   - The SVG element to append to
 * @param {number}     x, y     - Center position of the node
 * @param {number}     r        - Circle radius
 * @param {number}     angle    - Angle from center (radians), used for label placement
 * @param {object}     item     - Data item { id, name, description, ... }
 * @param {string}     type     - 'tactic' | 'tech'
 * @param {string}     categoryName - Name of parent tactic (or 'Tactic' for tactic nodes)
 * @param {number}     CX, CY   - SVG center
 */
function drawNode(parent, x, y, r, angle, item, type, categoryName, CX, CY, colorIdx = 0) {
  const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  g.setAttribute('class', `graph-node graph-node-${type} color-${colorIdx}`);
  g.setAttribute('transform', `translate(${x},${y})`);
  g.setAttribute('role', 'button');
  g.setAttribute('tabindex', '0');
  g.setAttribute('aria-label', item.name);
  if (type === 'tactic') g.setAttribute('aria-expanded', 'false');
  g.dataset.id = item.id;

  const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
  circle.setAttribute('class', 'node-circle');
  circle.setAttribute('r', r);
  g.appendChild(circle);

  // Label text (prefix stripped)
  const labelText = item.name.replace(/^[A-Z]+\d*\.\d+\s*-\s*/, '');

  if (type === 'tactic') {
    addTacticCircleLabel(g, item, labelText);
  } else {
    addTechniqueCircleLabel(g, labelText, r);
  }

  // Click handler — suppressed if the user was dragging
  g.addEventListener('click', () => {
    if (wasDragging) { wasDragging = false; return; }

    if (type === 'tactic') {
      dismissInitialGraphHint();
      toggleTacticExpanded(item.id);
      return;
    }

    if (type === 'tech' && window.innerWidth < 640) {
      const tacticId = techToTactic.get(item.id);
      if (tacticId && !revealedTactics.has(tacticId)) {
        // First tap: reveal all technique labels for this tactic
        revealedTactics.add(tacticId);
        (tacticToTechs.get(tacticId) || []).forEach(techId => {
          const techEl = nodeElements.get(techId);
          if (techEl) {
            const label = techEl.querySelector('.node-label-tech');
            if (label) label.style.display = '';
          }
        });
        return; // don't open modal yet
      }
    }
    goToItemPage(item, categoryName);
  });
  g.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (type === 'tactic') {
        dismissInitialGraphHint();
        toggleTacticExpanded(item.id);
      } else goToItemPage(item, categoryName);
    }
  });

  if (type === 'tech') {
    const setTechniquePathHighlight = isHighlighted => {
      const tacticId = techToTactic.get(item.id);
      if (!tacticId) return;

      // Technique → tactic edge
      const techEdgeInfo = edgeElements.get(`${tacticId}-${item.id}`);
      if (techEdgeInfo) {
        techEdgeInfo.el.classList.toggle('branch-lit', isHighlighted);
      }

      // Tactic → center edge (THIS is what you're missing)
      const centerEdgeInfo = edgeElements.get(`center-${tacticId}`);
      if (centerEdgeInfo) {
        centerEdgeInfo.el.classList.toggle('branch-lit', isHighlighted);
      }

      // Optional: also highlight the tactic node itself
      const tacticEl = nodeElements.get(tacticId);
      if (tacticEl) {
        tacticEl.classList.toggle('branch-lit', isHighlighted);
      }
    };

    g.addEventListener('mouseenter', () => setTechniquePathHighlight(true));
    g.addEventListener('mouseleave', () => setTechniquePathHighlight(false));
    g.addEventListener('focus', () => setTechniquePathHighlight(true));
    g.addEventListener('blur', () => setTechniquePathHighlight(false));
  }

  nodeElements.set(item.id, g);
  parent.appendChild(g);
}

function addTacticCircleLabel(g, item, labelText) {
  const techniqueCount = tacticToTechs.get(item.id)?.length || 0;
  const circle = g.querySelector('.node-circle');
  const radius = Number(circle?.getAttribute('r')) || 80;

  const maxTextWidth = radius * 1.45;
  const maxTextHeight = radius * 0.72;

  let fontSize = Math.min(22, Math.max(9, radius * 0.22));
  let lines = [];

  while (fontSize >= 8) {
    const approxCharsPerLine = Math.max(8, Math.floor(maxTextWidth / (fontSize * 0.58)));
    lines = wrapLabelText(labelText, approxCharsPerLine);

    const estimatedHeight = lines.length * fontSize * 1.15;

    if (estimatedHeight <= maxTextHeight && lines.length <= 4) break;
    fontSize -= 1;
  }

  const titleEl = document.createElementNS('http://www.w3.org/2000/svg', 'text');
  titleEl.setAttribute('class', 'node-label-tactic node-label-tactic-inside');
  titleEl.setAttribute('text-anchor', 'middle');
  titleEl.setAttribute('dominant-baseline', 'middle');
  titleEl.setAttribute('pointer-events', 'none');
  titleEl.style.fontSize = `${fontSize}px`;

  const lineHeight = 1.15;
  const titleBlockHeight = lines.length * fontSize * lineHeight;
  const countFontSize = Math.max(8, fontSize * 0.62);
  const countGap = Math.max(8, fontSize * 0.55);

  const totalBlockHeight = titleBlockHeight + countGap + countFontSize;
  const firstLineY = -totalBlockHeight / 2 + fontSize / 2;

  lines.forEach((line, index) => {
    const tspan = document.createElementNS('http://www.w3.org/2000/svg', 'tspan');
    tspan.setAttribute('x', '0');
    tspan.setAttribute('y', String(firstLineY + index * fontSize * lineHeight));
    tspan.textContent = line;
    titleEl.appendChild(tspan);
  });

  const countEl = document.createElementNS('http://www.w3.org/2000/svg', 'text');
  countEl.setAttribute('class', 'node-label-tactic-count');
  countEl.setAttribute('text-anchor', 'middle');
  countEl.setAttribute('x', '0');
  countEl.setAttribute(
    'y',
    String(firstLineY + titleBlockHeight + countGap)
  );
  countEl.setAttribute('pointer-events', 'none');
  countEl.style.fontSize = `${countFontSize}px`;
  countEl.textContent = `${techniqueCount} technique${techniqueCount === 1 ? '' : 's'}`;

  g.appendChild(titleEl);
  g.appendChild(countEl);
}

function addTechniqueCircleLabel(g, labelText, radius) {
  const maxTextWidth = radius * 1.55;
  const maxTextHeight = radius * 1.45;

  let fontSize = Math.min(18, Math.max(7, radius * 0.48));
  let lines = [];

  while (fontSize >= 6) {
    const approxCharsPerLine = Math.max(
      5,
      Math.floor(maxTextWidth / (fontSize * 0.56))
    );

    lines = wrapLabelText(labelText, approxCharsPerLine);

    const estimatedHeight = lines.length * fontSize * 1.1;
    const longestLine = lines.reduce((max, line) => Math.max(max, line.length), 0);
    const estimatedWidth = longestLine * fontSize * 0.56;

    if (
      estimatedHeight <= maxTextHeight &&
      estimatedWidth <= maxTextWidth &&
      lines.length <= 4
    ) {
      break;
    }

    fontSize -= 0.5;
  }

  const textEl = document.createElementNS('http://www.w3.org/2000/svg', 'text');
  textEl.setAttribute('class', 'node-label-tech node-label-tech-inside');
  textEl.setAttribute('text-anchor', 'middle');
  textEl.setAttribute('dominant-baseline', 'middle');
  textEl.setAttribute('pointer-events', 'none');
  textEl.style.fontSize = `${fontSize}px`;

  const lineHeight = 1.1;
  const blockHeight = lines.length * fontSize * lineHeight;
  const firstLineY = -blockHeight / 2 + fontSize / 2;

  lines.forEach((line, index) => {
    const tspan = document.createElementNS('http://www.w3.org/2000/svg', 'tspan');
    tspan.setAttribute('x', '0');
    tspan.setAttribute('y', String(firstLineY + index * fontSize * lineHeight));
    tspan.textContent = line;
    textEl.appendChild(tspan);
  });

  g.appendChild(textEl);
}

// ── Label placement ──────────────────────────────────────────
/**
 * Appends a <text> element to group `g`, positioned outside the node
 * circle in the direction of `angle`. Text-anchor and dominant-baseline
 * are set based on where the label falls relative to the node center
 * so the text always reads away from the center.
 *
 * @param {SVGElement} g     - Parent <g> element (node already translated)
 * @param {number}     angle - Angle in radians from SVG center
 * @param {number}     r     - Node radius (label placed at r + 8px offset)
 * @param {string}     text  - Display text
 * @param {string}     cls   - CSS class for styling
 */
function addLabel(g, angle, r, text, cls) {
  const isTacticLabel = cls === 'node-label-tactic';

  let lx;
  let ly;
  let textAnchor = 'middle';
  let isAbove = false;

  if (isTacticLabel) {
    const tacticOffset = r + 18;
    const sin = Math.sin(angle);
    const cos = Math.cos(angle);
    const isTopArc = sin < -0.35;

    const normalizedText = String(text || '')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();


    if (normalizedText.includes('output structuring')) {
      // Move to the right and below the tactic circle.
      lx = -70;
      ly = -(tacticOffset );
      textAnchor = 'start';
    } else if (isTopArc) {
      const sideOffset = Math.max(8, r * 0.35);

      if (cos < -0.18) {
        lx = -sideOffset;
        ly = -(tacticOffset + 14);
        textAnchor = 'end';
      } else if (cos > 0.18) {
        lx = sideOffset;
        ly = -(tacticOffset + 14);
        textAnchor = 'start';
      } else {
        lx = 0;
        ly = -(tacticOffset + 26);
        textAnchor = 'middle';
      }
    } else {
      lx = 0;
      ly = -(tacticOffset + 10);
      textAnchor = 'middle';
    }

    isAbove = ly < 0;
  } else {
    // Technique labels keep the original outward placement.
    const offset = r + 22;
    lx = Math.cos(angle) * offset;
    ly = Math.sin(angle) * offset;

    isAbove = Math.sin(angle) < -0.35;

    if (lx > r * 0.3) textAnchor = 'start';
    else if (lx < -r * 0.3) textAnchor = 'end';
    else textAnchor = 'middle';
  }

  const textEl = document.createElementNS('http://www.w3.org/2000/svg', 'text');
  textEl.setAttribute('class', cls);
  textEl.setAttribute('x', lx);
  textEl.setAttribute('y', ly);
  textEl.setAttribute('text-anchor', textAnchor);
  textEl.setAttribute('pointer-events', 'none');

  const maxChars = cls === 'node-label-tech' ? 18 : 24;
  const lines = wrapLabelText(text, maxChars);

  lines.forEach((line, index) => {
    const tspan = document.createElementNS('http://www.w3.org/2000/svg', 'tspan');
    tspan.setAttribute('x', lx);
    tspan.setAttribute(
      'dy',
      index === 0
        ? (isAbove ? `-${(lines.length - 1) * 1.15}em` : '0')
        : '1.15em'
    );
    tspan.textContent = line;
    textEl.appendChild(tspan);
  });

  g.appendChild(textEl);
}

function wrapLabelText(text, maxChars) {
  const words = String(text || '').split(/\s+/);
  const lines = [];
  let line = '';

  words.forEach(word => {
    const next = line ? `${line} ${word}` : word;

    if (next.length > maxChars && line) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  });

  if (line) lines.push(line);
  return lines;
}

// ── Search ───────────────────────────────────────────────────
function onGraphSearch(e) {
  currentQuery = e.target.value.trim();
  document.getElementById('graph-clear-btn').classList.toggle('visible', currentQuery.length > 0);
  applySearchFilter();
  renderGraphResults();
}

function clearGraphSearch() {
  clearGraphSearchState({ focusInput: true });
}

function clearGraphSearchState({ focusInput = false } = {}) {
  const input = document.getElementById('graph-search-input');
  if (input) {
    input.value = '';
    if (focusInput) input.focus();
  }

  currentQuery = '';
  document.getElementById('graph-clear-btn')?.classList.remove('visible');
  applySearchFilter();
  renderGraphResults();
}

function itemMatchesQuery(item, query) {
  const q = query.toLowerCase();

  return (
    textMatches(item.name, q) ||
    textMatches(item.description, q) ||
    listMatches(item.examples, q, getExampleText) ||
    listMatches(item.subtypes, q) ||
    listMatches(item.references, q) ||
    listMatches(item.contributors, q) ||
    textMatches(item.annotationNotes, q)
  );
}

function applySearchFilter() {
  const svg = document.getElementById('graph-svg');
  if (!currentQuery) {
    svg.classList.remove('searching');
    nodeElements.forEach(el => el.classList.remove('match'));
    edgeElements.forEach(({ el }) => el.classList.remove('match'));
    applyExpansionState();
    return;
  }

  svg.classList.add('searching');
  nodeElements.forEach(el => el.classList.remove('match'));
  edgeElements.forEach(({ el }) => el.classList.remove('match'));

  // While searching, temporarily reveal matching techniques even if their
  // tactic branch is collapsed.
  applyExpansionState();

  nodeElements.forEach((el, id) => {
    const entry = itemIndex[id];
    if (!entry) return;
    if (!itemMatchesQuery(entry.item, currentQuery)) return;
    el.classList.add('match');

    const tacticId = techToTactic.get(id);

    if (tacticId) {
      // Technique match: reveal the technique, its parent tactic, and both
      // connecting edges so the highlighted path reaches the center.
      el.style.display = '';

      const label = el.querySelector('.node-label-tech');
      if (label) label.style.display = '';

      const tacticEl = nodeElements.get(tacticId);
      if (tacticEl) tacticEl.classList.add('match');

      const techEdgeInfo = edgeElements.get(`${tacticId}-${id}`);
      if (techEdgeInfo) {
        techEdgeInfo.el.style.display = '';
        techEdgeInfo.el.classList.add('match');
      }

      const centerEdgeInfo = edgeElements.get(`center-${tacticId}`);
      if (centerEdgeInfo) centerEdgeInfo.el.classList.add('match');
    } else if (tacticToTechs.has(id)) {
      // Tactic match: the tactic node is already highlighted; also light up
      // its edge back to the center logo. This covers searches that match a
      // tactic name/description but no individual technique.
      const centerEdgeInfo = edgeElements.get(`center-${id}`);
      if (centerEdgeInfo) centerEdgeInfo.el.classList.add('match');
    }
  });
}

function renderGraphResults() {
  const panel    = document.getElementById('graph-results-panel');
  const countEl  = document.getElementById('graph-results-count');
  const listEl   = document.getElementById('graph-results-list');
  const noResults = document.getElementById('graph-no-results');

  if (!currentQuery || !allData) {
    panel.hidden = true;
    return;
  }

  panel.hidden = false;

  const results = [];
  allData.tactics.forEach(tactic => {
    tactic.techniques.forEach(tech => {
      if (itemMatchesQuery(tech, currentQuery)) {
        results.push({ item: tech, categoryName: tactic.name });
      }
    });
  });

  countEl.textContent = `${results.length} technique result${results.length !== 1 ? 's' : ''} for "${currentQuery}"`;
  noResults.hidden = results.length > 0;

  listEl.innerHTML = '';
  results.forEach(({ item, categoryName }) => {
    listEl.appendChild(buildGraphResultCard(item, categoryName));
  });
}

function buildGraphResultCard(item, categoryName) {
  const card = document.createElement('div');
  card.className = 'card search-result-card';

  const displayName = item.name.replace(/^[A-Z]+\d*\.\d+\s*-\s*/, '');
  const nameHtml = highlight(displayName, currentQuery);

  let snippetHtml = '';
  const q = currentQuery.toLowerCase();
  if (item.description && item.description.toLowerCase().includes(q)) {
    const desc  = item.description;
    const idx   = desc.toLowerCase().indexOf(q);
    const start = Math.max(0, idx - 60);
    const raw   = (start > 0 ? '…' : '') + desc.slice(start, idx + 200) + (idx + 200 < desc.length ? '…' : '');
    snippetHtml = highlight(raw, currentQuery);
  }

  card.innerHTML = `
    <div class="card-header" role="button" tabindex="0">
      <div class="card-header-text">
        <div class="search-result-tactic">${escHtml(categoryName)}</div>
        <div class="card-name search-result-name">${nameHtml}</div>
        ${snippetHtml ? `<div class="search-result-snippet">${snippetHtml}</div>` : ''}
      </div>
      <span class="card-chevron" aria-hidden="true">›</span>
    </div>
  `;

  const header = card.querySelector('.card-header');
  header.addEventListener('click', () => goToItemPage(item, categoryName));
  header.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      goToItemPage(item, categoryName);
    }
  });

  return card;
}

function highlight(text, query) {
  const escaped = escHtml(text);
  if (!query) return escaped;
  const escapedQuery = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`(${escapedQuery})`, 'gi');
  return escaped.replace(re, '<mark>$1</mark>');
}

// ── Helpers ──────────────────────────────────────────────────

function textMatches(value, q) {
  return String(value || '').toLowerCase().includes(q);
}

function listMatches(items, q, mapper = item => item) {
  return (items || []).some(item => textMatches(mapper(item), q));
}

function getExampleText(example) {
  if (typeof example === 'string') return example;
  return example?.prompt || '';
}

function goToItemPage(item, categoryName) {
  const isTactic = categoryName === 'Tactic';

  if (isTactic) {
    window.location.href = `/tactic.html?id=${encodeURIComponent(item.sourceId)}`;
    return;
  }

  window.location.href = `/technique.html?id=${encodeURIComponent(item.sourceId)}`;
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function debounce(fn, delay) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

// Back to top
(function () {
  const btn = document.getElementById('back-to-top');
  window.addEventListener('scroll', () => {
    btn.classList.toggle('visible', window.scrollY > 300);
  }, { passive: true });
  btn.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
}());
