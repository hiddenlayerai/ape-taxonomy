/* ============================================================
   Renders information on tactics and nested techniques
   ============================================================ */

import { normalizeData } from './dataAdapter.js';

const sidebar = document.getElementById('detail-sidebar');
const sidebarNav = document.getElementById('detail-sidebar-nav');
const navSearch = document.getElementById('detail-nav-search');
const toggleNav = document.getElementById('detail-toggle-nav');

function getTacticIdFromLocation() {
  const pathParts = window.location.pathname.split('/').filter(Boolean);
  const qp = new URLSearchParams(window.location.search).get('id');

  if (qp) return qp;

  const last = pathParts[pathParts.length - 1];
  if (!last || last.endsWith('.html')) return 'HL01';

  return decodeURIComponent(last);
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function setHtml(id, html) {
  const el = document.getElementById(id);
  if (el) el.innerHTML = html;
}

function setText(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

function formatDescription(text) {
  return escapeHtml(text)
    .replace(/\n{2,}/g, '<span class="tight-paragraph-break"></span>')
    .replace(/\n/g, '<br>');
}

function buildTechniqueHref(sourceId) {
  return `technique.html?id=${encodeURIComponent(sourceId)}`;
}

function buildTacticHref(sourceId) {
  return `tactic.html?id=${encodeURIComponent(sourceId)}`;
}

function renderEmptyState(id) {
  document.title = 'Tactic not found · APE';

  setText('detail-tactic-name', 'Tactic not found');
  setHtml('detail-tactic-description', formatDescription(`No tactic matched ${id}.`));
  setText('detail-meta-tactic-id', '—');
  setText('detail-meta-technique-count', '0');

  setHtml(
    'detail-breadcrumbs',
    `<span><a href="index.html">APE</a></span><span>&gt;</span><span>Tactic not found</span>`
  );

  setHtml(
    'detail-techniques-table-body',
    `<tr><td colspan="3" class="detail-table-empty">No techniques available.</td></tr>`
  );
}

function buildSidebar(data, activeTacticId) {
  const tactics = data.tactics || [];
  sidebarNav.innerHTML = '';

  tactics.forEach(tactic => {
    const isActiveTactic = tactic.sourceId === activeTacticId;

    const block = document.createElement('div');
    block.className = 'detail-tactic-block';
    block.dataset.tacticLabel = `${tactic.sourceId} ${tactic.name}`.toLowerCase();

    block.innerHTML = `
      <div class="detail-tactic-row">
        <button
          class="detail-tactic-toggle ${isActiveTactic ? 'expanded active-parent' : ''}"
          type="button"
          aria-expanded="${isActiveTactic ? 'true' : 'false'}"
          aria-label="Toggle ${escapeHtml(tactic.name)}">
          <span class="detail-tactic-chevron" aria-hidden="true">${isActiveTactic ? '▾' : '▸'}</span>
        </button>

        <a
          class="detail-tactic-inline-link ${isActiveTactic ? 'active' : ''}"
          href="${buildTacticHref(tactic.sourceId)}">
          ${escapeHtml(tactic.name)}
        </a>
      </div>

      <ul class="detail-technique-list" ${isActiveTactic ? '' : 'hidden'}>
        ${(tactic.techniques || []).map(tech => `
          <li>
            <a
              class="detail-technique-link"
              data-label="${escapeHtml(`${tech.sourceId} ${tech.name}`.toLowerCase())}"
              href="${buildTechniqueHref(tech.sourceId)}">
              ${escapeHtml(tech.name)}
            </a>
          </li>
        `).join('')}
      </ul>
    `;

    const toggle = block.querySelector('.detail-tactic-toggle');
    const list = block.querySelector('.detail-technique-list');
    const chevron = block.querySelector('.detail-tactic-chevron');

    toggle.addEventListener('click', () => {
      const isExpanded = toggle.getAttribute('aria-expanded') === 'true';
      const willExpand = !isExpanded;

      toggle.setAttribute('aria-expanded', String(willExpand));
      toggle.classList.toggle('expanded', willExpand);
      list.hidden = !willExpand;

      if (chevron) {
        chevron.textContent = willExpand ? '▾' : '▸';
      }
    });

    sidebarNav.appendChild(block);
  });
}

function renderTactic(data, tacticId) {
  const tactic = (data.tactics || []).find(t => t.sourceId === tacticId);

  if (!tactic) {
    const target = `standard-view.html?unknownTactic=${encodeURIComponent(tacticId)}`;
    window.location.replace(target);
    return;
  }

  const techniques = tactic.techniques || [];

  document.title = `${tactic.name} · APE`;

  setText('detail-hero-tag', `${tactic.sourceId} · Tactic`);
  setText('detail-tactic-name', tactic.name);
  setHtml(
    'detail-tactic-description',
    formatDescription(tactic.description || '')
  );

  setText('detail-meta-tactic-id', tactic.sourceId || '—');
  setText('detail-meta-technique-count', String(techniques.length));

  setHtml(
    'detail-breadcrumbs',
    `
      <span><a href="index.html">APE</a></span>
      <span>&gt;</span>
      <span>${escapeHtml(tactic.name)}</span>
    `
  );

  setHtml(
  'detail-techniques-table-body',
    techniques.length
        ? techniques.map(tech => `
            <tr>
            <td class="detail-table-name">
                <a href="${buildTechniqueHref(tech.sourceId)}">${escapeHtml(tech.name)}</a>
            </td>
            <td>${formatDescription(tech.description || '')}</td>
            </tr>
        `).join('')
        : `<tr><td colspan="2" class="detail-table-empty">No techniques available.</td></tr>`
    );

  buildSidebar(data, tacticId);
}

function wireSidebarSearch() {
  if (!navSearch) return;

  navSearch.addEventListener('input', e => {
    const q = e.target.value.trim().toLowerCase();
    const tacticBlocks = sidebar.querySelectorAll('.detail-tactic-block');

    let anyVisible = false;

    tacticBlocks.forEach(block => {
      const tacticLabel = block.dataset.tacticLabel || '';
      const tacticMatches = !q || tacticLabel.includes(q);

      let hasVisibleChildren = false;

      block.querySelectorAll('.detail-technique-link').forEach(link => {
        const label = link.dataset.label || '';
        const li = link.closest('li');
        const techniqueMatches = !q || label.includes(q);

        // If the tactic itself matches, show all its techniques.
        const shouldShow = tacticMatches || techniqueMatches;

        if (li) li.style.display = shouldShow ? '' : 'none';
        if (shouldShow) hasVisibleChildren = true;
      });

      const toggle = block.querySelector('.detail-tactic-toggle');
      const list = block.querySelector('.detail-technique-list');

      if (q) {
        const blockVisible = tacticMatches || hasVisibleChildren;

        block.style.display = blockVisible ? '' : 'none';
        toggle.setAttribute('aria-expanded', String(blockVisible));
        toggle.classList.toggle('expanded', blockVisible);
        list.hidden = !blockVisible;

        if (blockVisible) anyVisible = true;
      } else {
        const hasActiveTechnique = !!block.querySelector('.detail-technique-link.active');
        const hasActiveTactic = !!block.querySelector('.detail-tactic-inline-link.active');
        const shouldExpand = hasActiveTechnique || hasActiveTactic;

        block.style.display = '';
        toggle.setAttribute('aria-expanded', String(shouldExpand));
        toggle.classList.toggle('expanded', shouldExpand);
        list.hidden = !shouldExpand;

        anyVisible = true;
      }
    });

    let emptyMsg = sidebar.querySelector('.detail-empty-search');

    if (!anyVisible && q) {
      if (!emptyMsg) {
        emptyMsg = document.createElement('div');
        emptyMsg.className = 'detail-empty-search';
        emptyMsg.textContent = 'No tactics or techniques match your search.';
        sidebarNav.appendChild(emptyMsg);
      }
    } else if (emptyMsg) {
      emptyMsg.remove();
    }
  });
}

function wireMobileNav() {
  const openSidebar = () => sidebar.classList.add('open');
  const closeSidebar = () => sidebar.classList.remove('open');

  let touchStartX = 0;
  let touchCurrentX = 0;

  toggleNav?.addEventListener('click', event => {
    event.stopPropagation();
    openSidebar();
  });

  document.addEventListener('click', event => {
    if (!sidebar.classList.contains('open')) return;

    const clickedInsideSidebar = sidebar.contains(event.target);
    const clickedToggle = toggleNav?.contains(event.target);

    if (!clickedInsideSidebar && !clickedToggle) {
      closeSidebar();
    }
  });

  sidebar.addEventListener('touchstart', event => {
    touchStartX = event.touches[0].clientX;
    touchCurrentX = touchStartX;
  }, { passive: true });

  sidebar.addEventListener('touchmove', event => {
    touchCurrentX = event.touches[0].clientX;
  }, { passive: true });

  sidebar.addEventListener('touchend', () => {
    const swipeDistance = touchCurrentX - touchStartX;

    // Sidebar is on the left, so swiping left closes it.
    if (swipeDistance < -60) {
      closeSidebar();
    }
  });

  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') {
      closeSidebar();
    }
  });
}

async function initTacticPage() {
  wireSidebarSearch();
  wireMobileNav();

  const res = await fetch('./data/ape.json');
  if (!res.ok) {
    throw new Error(`Failed to load data/ape.json: ${res.status}`);
  }

  const raw = await res.json();
  const data = normalizeData(raw);
  const tacticId = getTacticIdFromLocation();

  renderTactic(data, tacticId);
}

initTacticPage().catch(err => {
  console.error(err);
  renderEmptyState(getTacticIdFromLocation());
});