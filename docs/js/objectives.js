/* ============================================================
   Renders the Objectives page as a CIA triad.
   ============================================================ */

let allObjectives = [];
let currentQuery = '';

const IMPACT_META = {
  Confidentiality: {
    description: 'Unauthorized disclosure or exposure',
    accent: '#59B2FF'
  },
  Integrity: {
    description: 'Manipulation, subversion, or unsafe deviation',
    accent: '#37C980'
  },
  Availability: {
    description: 'Disruption, exhaustion, or degradation',
    accent: '#FFCE02'
  }
};

const SUBTYPE_ACCENTS = {
  behavioral: '#FF9F2E',
  system: '#A997FF',
  'behavioral-integrity': '#FF9F2E',
  'system-integrity': '#A997FF'
};

const SUBTYPE_ACCENT_PALETTE = [
  '#FF9F2E',
  '#A997FF',
  '#59B2FF',
  '#37C980',
  '#FFCE02',
  '#B2C4D4'
];

document.addEventListener('DOMContentLoaded', () => {
  const content = document.getElementById('content');

  if (!content) {
    console.error('Objectives page requires a #content element.');
    return;
  }

  fetch('data/ape.json')
    .then(res => {
      if (!res.ok) throw new Error(`Failed to load data/ape.json: ${res.status}`);
      return res.json();
    })
    .then(data => {
      allObjectives = getImpacts(data);
      renderObjectives(allObjectives, '');
    })
    .catch(err => {
      content.innerHTML =
        `<p style="color:#e05c5c;padding:24px">Error loading data: ${escHtml(err.message)}</p>`;
    });

  const searchInput = document.getElementById('search-input');
  const clearBtn = document.getElementById('clear-btn');

  if (searchInput) searchInput.addEventListener('input', onSearch);
  if (clearBtn) clearBtn.addEventListener('click', clearSearch);

  const scroller = document.querySelector('.matrix-scroll');
  if (scroller) scroller.addEventListener('scroll', updateScrollFades);

  window.addEventListener('resize', updateScrollFades);
});

function renderObjectives(impacts, query) {
  const content = document.getElementById('content');
  const countEl = document.getElementById('results-count');
  const noResults = document.getElementById('no-results');

  content.innerHTML = '';

  if (query) {
    content.classList.add('search-mode');
    content.classList.remove('objectives-matrix');
  } else {
    content.classList.remove('search-mode');
    content.classList.add('objectives-matrix');
  }

  let totalVisible = 0;

  impacts.forEach(impact => {
    const viewModel = buildImpactViewModel(impact, query);
    if (viewModel.totalVisible === 0) return;

    totalVisible += viewModel.totalVisible;
    content.appendChild(buildImpactColumn(impact, viewModel, query));
  });

  if (countEl) {
    countEl.textContent = query
      ? `${totalVisible} objective result${totalVisible !== 1 ? 's' : ''} for "${query}"`
      : '';
  }

  if (noResults) {
    noResults.classList.toggle('visible', query.length > 0 && totalVisible === 0);
  }

  requestAnimationFrame(updateScrollFades);
}

function buildImpactViewModel(impact, query) {
  const impactSubtypes = getImpactSubtypes(impact);

  const subtypeGroups = impactSubtypes
    .map((subtype, index) => {
      const items = getSubObjectives(subtype).filter(sub => {
        if (!query) return true;
        return objectiveMatchesQuery(impact, sub, query, subtype);
      });

      return {
        subtype: normalizeImpactSubtype(subtype, index),
        items
      };
    })
    .filter(group => group.items.length > 0);

  const directObjectives = impactSubtypes.length > 0
    ? []
    : getSubObjectives(impact).filter(sub => {
        if (!query) return true;
        return objectiveMatchesQuery(impact, sub, query);
      });

  const subtypeCount = subtypeGroups.reduce((sum, group) => sum + group.items.length, 0);

  return {
    directObjectives,
    subtypeGroups,
    totalVisible: directObjectives.length + subtypeCount
  };
}

function buildImpactColumn(impact, viewModel, query) {
  const section = document.createElement('section');
  section.className = 'category objective-category';
  section.dataset.impactId = impact['Impact ID'] || '';

  const impactName = impact['Impact Short Name'] || impact['Impact Name'] || 'Untitled Impact';
  const impactId = impact['Impact ID'] || '';
  const meta = IMPACT_META[impactName] || { description: impact['Impact Description'] || '' };

  section.innerHTML = `
    <div class="objective-column-heading">
      <a class="objective-heading-link" href="${buildImpactHref(impactId)}">
        <span class="objective-heading-copy">
          <span class="category-name objective-impact-name">
            ${query ? highlight(impactName, query) : escHtml(impactName)}
            <span class="tactic-arrow" aria-hidden="true">▸</span>
          </span>
        </span>
      </a>
    </div>
    <div class="cards-list"></div>
  `;

  const cardsList = section.querySelector('.cards-list');

  viewModel.subtypeGroups.forEach(group => {
    cardsList.appendChild(buildSubtypePanel(impact, group, query));
  });

  if (viewModel.directObjectives.length > 0 && shouldGroupDirectObjectives(impactName)) {
    cardsList.appendChild(buildImpactObjectiveGroupPanel(impact, viewModel.directObjectives, query, meta));
  } else {
    viewModel.directObjectives.forEach(sub => {
      cardsList.appendChild(buildSubObjectiveCard(impact, sub, query));
    });
  }

  return section;
}

function normalizeImpactSubtype(rawSubtype, index) {
  const name = rawSubtype['Subtype Name'] || rawSubtype.name || 'Untitled Subtype';
  const key = rawSubtype['Subtype Key'] || rawSubtype.key || slugify(name);
  const description = rawSubtype['Subtype Description'] || rawSubtype.description || '';
  const slug = slugify(key || name);
  const accent = SUBTYPE_ACCENTS[slug] || SUBTYPE_ACCENTS[key] || SUBTYPE_ACCENT_PALETTE[index % SUBTYPE_ACCENT_PALETTE.length];

  return { name, key, slug, description, accent };
}


function shouldGroupDirectObjectives(impactName) {
  return impactName === 'Confidentiality' || impactName === 'Integrity' || impactName === 'Availability';
}

function buildImpactObjectiveGroupPanel(impact, objectives, query, meta) {
  const impactName = impact['Impact Short Name'] || impact['Impact Name'] || 'Untitled Impact';
  const panel = document.createElement('div');
  panel.className = `integrity-domain objective-subtype objective-impact-group objective-impact-group-${slugify(impactName)}`;
  panel.style.setProperty('--domain-accent', meta.accent || '#37C980');
  

  panel.innerHTML = `
  <div class="integrity-domain-header objective-subtype-header objective-group-header">
    <span class="objective-group-description">
      ${escHtml(meta.description || '')}
    </span>
  </div>

  <div class="integrity-domain-divider objective-subtype-divider"></div>

  <div class="integrity-domain-cards objective-subtype-cards"></div>
`;

  const cards = panel.querySelector('.objective-subtype-cards');
  objectives.forEach(sub => cards.appendChild(buildSubObjectiveCard(impact, sub, query)));

  return panel;
}

function buildSubtypePanel(impact, group, query) {
  const subtype = group.subtype;
  const panel = document.createElement('div');
  panel.className = `integrity-domain objective-subtype objective-subtype-${subtype.slug}`;
  panel.style.setProperty('--domain-accent', subtype.accent);

  panel.innerHTML = `
    <div class="integrity-domain-header objective-subtype-header">
      <span class="integrity-domain-copy objective-subtype-copy">
        <span class="integrity-domain-title objective-subtype-title">${escHtml(subtype.name)}</span>
        ${subtype.description ? `<span class="integrity-domain-description objective-subtype-description">${escHtml(subtype.description)}</span>` : ''}
      </span>
    </div>
    <div class="integrity-domain-divider objective-subtype-divider"></div>
    <div class="integrity-domain-cards objective-subtype-cards"></div>
  `;

  const cards = panel.querySelector('.objective-subtype-cards');
  group.items.forEach(sub => cards.appendChild(buildSubObjectiveCard(impact, sub, query)));

  return panel;
}

function buildSubObjectiveCard(impact, sub, query) {
  const card = document.createElement('div');
  card.className = 'card objective-card';
  card.id = `card-${slugify(sub['Objective ID'] || sub['Objective Name'] || '')}`;

  const name = sub['Objective Name'] || 'Untitled Objective';
  const id = sub['Objective ID'] || '';
  const nameHtml = query ? highlight(name, query) : escHtml(name);
  const childObjectives = getSubObjectives(sub);
  const hasChildren = childObjectives.length > 0;

  if (!hasChildren) {
    card.innerHTML = `
      <a class="card-header objective-card-header" href="${buildObjectiveHref(id)}">
        <div class="card-header-text">
          <div class="card-name">${nameHtml}</div>
        </div>
        <span class="card-chevron" aria-hidden="true">▸</span>
      </a>
    `;

    return card;
  }

  card.classList.add('objective-card-expandable');

  const panelId = `nested-${slugify(id || name)}`;

  card.innerHTML = `
    <button
      class="card-header objective-card-header objective-expand-toggle"
      type="button"
      aria-expanded="false"
      aria-controls="${panelId}"
    >
      <div class="card-header-text">
        <div class="card-name">${nameHtml}</div>
      </div>
      <span class="card-chevron objective-expand-chevron" aria-hidden="true">▾</span>
    </button>
    <div class="objective-nested-panel" id="${panelId}" hidden></div>
  `;

  const nestedPanel = card.querySelector('.objective-nested-panel');
  childObjectives.forEach(child => {
    nestedPanel.appendChild(buildSubObjectiveCard(impact, child, query));
  });

  const toggle = card.querySelector('.objective-expand-toggle');
  toggle.addEventListener('click', () => {
    const isExpanded = toggle.getAttribute('aria-expanded') === 'true';
    const willExpand = !isExpanded;
    const chevron = toggle.querySelector('.objective-expand-chevron');

    toggle.setAttribute('aria-expanded', String(willExpand));
    nestedPanel.hidden = !willExpand;
    card.classList.toggle('expanded', willExpand);

    if (chevron) {
      chevron.textContent = willExpand ? '▴' : '▾';
    }
  });

  return card;
}

function onSearch(e) {
  currentQuery = e.target.value.trim();

  const clearBtn = document.getElementById('clear-btn');
  if (clearBtn) clearBtn.classList.toggle('visible', currentQuery.length > 0);

  renderObjectives(allObjectives, currentQuery);
}

function clearSearch() {
  const input = document.getElementById('search-input');
  if (!input) return;

  input.value = '';
  input.focus();
  currentQuery = '';

  const clearBtn = document.getElementById('clear-btn');
  if (clearBtn) clearBtn.classList.remove('visible');

  renderObjectives(allObjectives, '');
}

function objectiveMatchesQuery(impact, sub, query, subtype = null) {
  const q = query.toLowerCase();

  const selfMatches =
    textMatches(sub['Objective Name'], q) ||
    textMatches(sub['Objective Description'], q) ||
    textMatches(subtype && (subtype['Subtype Name'] || subtype.name), q) ||
    textMatches(subtype && (subtype['Subtype Description'] || subtype.description), q);

  if (selfMatches) return true;

  return getSubObjectives(sub).some(child =>
    objectiveMatchesQuery(impact, child, query, subtype)
  );
}

function getImpacts(data) {
  // Current schema: top-level Objectives was renamed to Impacts.
  // Keep legacy fallbacks so older ape.json files still render.
  return data.Impacts || data.impacts || data.Objectives || data.objectives || [];
}

function getImpactSubtypes(impact) {
  return impact['Impact Subtypes'] || impact['Impact Sub-Types'] || impact.impactSubtypes || [];
}

function getSubObjectives(container) {
  return (
    // Current schema: child/sub-objectives are stored under Objectives.
    // Include Objectvies/objectvies as a defensive fallback for the transitional typo.
    container['Objectives'] ||
    container.objectives ||
    container['Objectvies'] ||
    container.objectvies ||
    // Legacy schema fallbacks.
    container['Objective Subtypes'] ||
    container.objectiveSubtypes ||
    container['Sub-Objectives'] ||
    container['Sub Objectives'] ||
    container.subObjectives ||
    []
  );
}

function updateScrollFades() {
  const scroller = document.querySelector('.matrix-scroll');
  const wrap = document.querySelector('.matrix-scroll-wrap');
  if (!scroller || !wrap) return;

  const { scrollLeft, scrollWidth, clientWidth } = scroller;
  const isOverflowing = scrollWidth > clientWidth;

  wrap.classList.toggle('scroll-fade-left', isOverflowing && scrollLeft > 1);
  wrap.classList.toggle('scroll-fade-right', isOverflowing && scrollLeft + clientWidth < scrollWidth - 1);
}

function textMatches(value, q) {
  return String(value || '').toLowerCase().includes(q);
}

function escHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function highlight(text, query) {
  const escaped = escHtml(text);
  if (!query) return escaped;

  const escapedQuery = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`(${escapedQuery})`, 'gi');
  return escaped.replace(re, '<mark>$1</mark>');
}

function slugify(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function buildImpactHref(impactId) {
  return `impact.html?id=${encodeURIComponent(impactId)}`;
}

function buildObjectiveHref(objectiveId) {
  return `objective.html?id=${encodeURIComponent(objectiveId)}`;
}