/* ============================================================
   Renders the indivisual technique page details
   ============================================================ */

import { normalizeData } from './dataAdapter.js';

const sidebar = document.getElementById('detail-sidebar');
const sidebarNav = document.getElementById('detail-sidebar-nav');
const navSearch = document.getElementById('detail-nav-search');
const toggleNav = document.getElementById('detail-toggle-nav');

function getTechniqueIdFromLocation() {
  const pathParts = window.location.pathname.split('/').filter(Boolean);
  const qp = new URLSearchParams(window.location.search).get('id');

  if (qp) return qp;

  const last = pathParts[pathParts.length - 1];
  if (!last || last.endsWith('.html')) return 'HL01.01';

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

function renderEmptyState(id) {
  document.title = 'Technique not found · APE';


  setText('detail-technique-name', 'Technique not found');
  setText('detail-technique-description', `No technique matched ${id}.`);
  setText('detail-procedure-copy', 'Check the URL or choose a technique from the left navigation.');
  setHtml('detail-example-prompts', '<pre>No example available.</pre>');

  setHtml(
    'detail-breadcrumbs',
    `<span><a href="index.html">APE</a></span><span>&gt;</span><span>Technique not found</span>`
  );

  setText('detail-meta-technique-id', '—');
  setText('detail-meta-tactic-id', '—');
  setText('detail-meta-tactic-name', '—');
}

function buildTechniqueHref(sourceId) {
  return `technique.html?id=${encodeURIComponent(sourceId)}`;
}

function buildTacticHref(sourceId) {
  return `tactic.html?id=${encodeURIComponent(sourceId)}`;
}

function buildSidebar(data, activeTechniqueId) {
  const tactics = data.tactics || [];
  sidebarNav.innerHTML = '';

  tactics.forEach(tactic => {
    const hasActiveChild = (tactic.techniques || []).some(t => t.sourceId === activeTechniqueId);

    const block = document.createElement('div');
    block.className = 'detail-tactic-block';
    block.dataset.tacticLabel = `${tactic.sourceId} ${tactic.name}`.toLowerCase();

    block.innerHTML = `
      <div class="detail-tactic-row">
        <button
          class="detail-tactic-toggle ${hasActiveChild ? 'expanded active-parent' : ''}"
          type="button"
          aria-expanded="${hasActiveChild ? 'true' : 'false'}"
          aria-label="Toggle ${escapeHtml(tactic.name)}">
          <span class="detail-tactic-chevron" aria-hidden="true">${hasActiveChild ? '▾' : '▸'}</span>
        </button>

        <a
          class="detail-tactic-inline-link ${hasActiveChild ? 'active' : ''}"
          href="${buildTacticHref(tactic.sourceId)}">
          ${escapeHtml(tactic.name)}
        </a>
      </div>

      <ul class="detail-technique-list" ${hasActiveChild ? '' : 'hidden'}>
        ${(tactic.techniques || []).map(tech => `
          <li>
            <a
              class="detail-technique-link ${tech.sourceId === activeTechniqueId ? 'active' : ''}"
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

function renderTechnique(data, techniqueId) {
  const allTechniques = (data.tactics || []).flatMap(tactic =>
    (tactic.techniques || []).map(tech => ({ tech, tactic }))
  );

  const match = allTechniques.find(({ tech }) => tech.sourceId === techniqueId);

  if (!match) {
    const target = `standard-view.html?unknownTechnique=${encodeURIComponent(techniqueId)}`;
    window.location.replace(target);
    return;
  }

  const { tech, tactic } = match;
  const refs = (tech.references || [])
    .flatMap(ref => Array.isArray(ref) ? ref : [ref])
    .map(ref => String(ref || '').trim())
    .filter(ref => ref && isSafeExternalUrl(ref));
  const contributors = cleanList(tech.contributors);
  const subtypes = cleanList(tech.subtypes);
  const examples = tech.examples || [];
  const annotationNotes = String(tech.annotationNotes || '').trim();

  document.title = `${tech.name} · APE`;

  setText('detail-hero-tag', `${tech.sourceId} · Technique`);
  setText('detail-technique-name', tech.name);
  setHtml(
    'detail-technique-description',
    formatDescription(tech.description || '')
  );

  setText('detail-meta-technique-id', tech.sourceId || '—');
  setHtml(
    'detail-meta-tactic-name',
    `<a href="${buildTacticHref(tactic.sourceId)}">${escapeHtml(tactic.name)}</a>`
  );
  setText('detail-meta-tactic-id', tactic.sourceId || '—');

  setHtml(
    'detail-breadcrumbs',
    `
      <span><a href="index.html">APE</a></span>
      <span>&gt;</span>
      <span><a href="${buildTacticHref(tactic.sourceId)}">${escapeHtml(tactic.name)}</a></span>
      <span>&gt;</span>
      <span>${escapeHtml(tech.name)}</span>
    `
  );

  setText(
    'detail-example-count',
    `${examples.length || 1} example${examples.length === 1 ? '' : 's'}`
  );

  renderPromptExamples(examples);

  renderOptionalSection(
    'detail-subtypes',
    subtypes.length > 0,
    subtypes.map(item => `<span class="detail-chip">${escapeHtml(item)}</span>`).join('')
  );

  renderOptionalSection(
    'detail-references',
    refs.length > 0,
    refs.map(ref => `<li><a href="${escapeHtml(ref)}" target="_blank" rel="noopener noreferrer">${escapeHtml(ref)}</a></li>`).join('')
  );

  renderOptionalSection(
    'detail-contributors',
    contributors.length > 0,
    contributors.map(name => `<li>${escapeHtml(name)}</li>`).join('')
  );

  renderOptionalSection(
    'detail-annotation-notes',
    annotationNotes.length > 0,
    formatDescription(annotationNotes)
  );

  renderCustomAnnotationSections(tech.customAnnotations || []);

  buildSidebar(data, techniqueId);
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

async function initTechniquePage() {
  wireSidebarSearch();
  wireMobileNav();

  const res = await fetch('./data/ape.json');
  if (!res.ok) {
    throw new Error(`Failed to load data/ape.json: ${res.status}`);
  }

  const raw = await res.json();
  const data = normalizeData(raw);
  const techniqueId = getTechniqueIdFromLocation();

  renderTechnique(data, techniqueId);
}

initTechniquePage().catch(err => {
  console.error(err);
  renderEmptyState(getTechniqueIdFromLocation());
});

function renderPromptExamples(examples) {
  const container = document.getElementById('detail-example-prompts');
  if (!container) return;

  if (!examples.length) {
    container.innerHTML = '<div class="detail-empty">No example available.</div>';
    return;
  }

  container.innerHTML = examples.map((example, index) => {
    const turns = example.turns || [{
      prompt: typeof example === 'string' ? example : example.prompt,
      highlightingOffsets: example.highlightingOffsets || []
    }];

    return `
      <div class="detail-example-box detail-prompt-box">
        <div class="detail-prompt-group-label">
          <span>Example ${index + 1}</span>
          <button
            type="button"
            class="detail-prompt-copy"
            data-example-index="${index}">
            Copy prompt
          </button>
        </div>

        ${turns.map((turn, turnIndex) => `
          <div class="detail-prompt-example">
            <div class="detail-prompt-label">
              ${turns.length > 1 ? `Turn ${turnIndex + 1}` : ''}
            </div>

            <pre>${renderHighlightedPrompt(turn.prompt, turn.highlightingOffsets || [])}</pre>

            ${
              hasZeroHighlight(turn.highlightingOffsets)
                ? `<div class="detail-prompt-note">Note: This is best understood holistically; no single segment captures the technique.</div>`
                : ''
            }
          </div>
        `).join('')}
      </div>
    `;
  }).join('');

  container.querySelectorAll('.detail-prompt-copy').forEach(button => {
    button.addEventListener('click', async () => {
      const exampleIndex = Number(button.dataset.exampleIndex);
      const example = examples[exampleIndex];

      const turns = example.turns || [{
        prompt: typeof example === 'string' ? example : example.prompt
      }];

      const promptText = turns
        .map((turn, index) =>
          turns.length > 1
            ? `Turn ${index + 1}: ${turn.prompt || ''}`
            : `${turn.prompt || ''}`
        )
        .join('\n\n');

      try {
        await navigator.clipboard.writeText(promptText);
        button.textContent = 'Copied!';
      } catch {
        button.textContent = 'Copy failed';
      }

      setTimeout(() => {
        button.textContent = 'Copy prompt';
      }, 1600);
    });
  });
}

function renderHighlightedPrompt(promptText, offsets) {
  const text = String(promptText || '');
  const safeOffsets = normalizeHighlightOffsets(offsets, text.length);

  if (!safeOffsets.length) {
    return escapeHtml(text);
  }

  let html = '';
  let cursor = 0;

  safeOffsets.forEach(({ start, length }) => {
    const end = start + length;

    html += escapeHtml(text.slice(cursor, start));
    html += `<mark class="prompt-highlight">${escapeHtml(text.slice(start, end))}</mark>`;

    cursor = end;
  });

  html += escapeHtml(text.slice(cursor));
  return html;
}

function normalizeHighlightOffsets(offsets, textLength) {
  return (offsets || [])
    .map(o => ({
      start: Number(o.start),
      length: Number(o.length)
    }))
    .filter(o =>
      Number.isInteger(o.start) &&
      Number.isInteger(o.length) &&
      o.start >= 0 &&
      o.length > 0 &&
      o.start < textLength
    )
    .map(o => ({
      start: o.start,
      length: Math.min(o.length, textLength - o.start)
    }))
    .sort((a, b) => a.start - b.start)
    .reduce((acc, cur) => {
      const prev = acc[acc.length - 1];

      // Prevent overlapping highlights
      if (prev && cur.start < prev.start + prev.length) {
        return acc;
      }

      acc.push(cur);
      return acc;
    }, []);
}

function formatDescription(text) {
  return escapeHtml(text)
    .replace(/\n{2,}/g, '<span class="tight-paragraph-break"></span>')
    .replace(/\n/g, '<br>');
}

function hasZeroHighlight(offsets) {
  return (offsets || []).some(o => Number(o.start) === 0 && Number(o.length) === 0);
}

function isSafeExternalUrl(value) {
  try {
    const url = new URL(value, window.location.href);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

function renderOptionalSection(contentId, hasContent, html) {
  const contentEl = document.getElementById(contentId);
  if (!contentEl) return;

  const section = contentEl.closest('.detail-panel');
  if (!section) return;

  if (!hasContent) {
    section.hidden = true;
    contentEl.innerHTML = '';
    return;
  }

  section.hidden = false;
  contentEl.innerHTML = html;
}

function cleanList(items) {
  return (items || [])
    .map(item => String(item || '').trim())
    .filter(Boolean);
}

function renderCustomAnnotationSections(customAnnotations) {
  const grid = document.querySelector('.detail-content-grid');
  const subtypesPanel = document
    .getElementById('detail-subtypes')
    ?.closest('.detail-panel');

  if (!grid) return;

  grid.querySelectorAll('.detail-custom-annotation-panel').forEach(el => el.remove());

  customAnnotations.forEach(annotation => {
    const section = document.createElement('section');
    section.className = 'detail-panel detail-custom-annotation-panel';

    section.innerHTML = `
      <h2>${escapeHtml(annotation.title)}</h2>
      <p>${formatDescription(annotation.text)}</p>
    `;

    grid.insertBefore(section, subtypesPanel || null);
  });
}