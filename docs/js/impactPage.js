const sidebar = document.getElementById('detail-sidebar');
const sidebarNav = document.getElementById('detail-sidebar-nav');
const navSearch = document.getElementById('detail-nav-search');
const toggleNav = document.getElementById('detail-toggle-nav');
let industryDescriptions = new Map();

async function loadIndustryDescriptions(currentImpactName) {
  const res = await fetch('./data/industries.json');
  const data = await res.json();

  industryDescriptions.clear();

  (data.industries || data.Industries || []).forEach(industry => {
    const impacts = industry.impacts || industry.Impacts || industry.impact || industry.objectives || industry.Objectives || [];
    const match = impacts.find(i =>
      i.name === currentImpactName ||
      i['Impact Short Name'] === currentImpactName ||
      i['Impact Name'] === currentImpactName ||
      i['Objective Name'] === currentImpactName
    );

    if (match) {
      industryDescriptions.set(industry.name, match.description);
    }
  });

  const chipsContainer = document.getElementById('detail-subtypes');
  if (!chipsContainer) return;

  chipsContainer.innerHTML = [...industryDescriptions.keys()]
    .map(name => `<span class="detail-chip">${escapeHtml(name)}</span>`)
    .join('');

  chipsContainer.querySelectorAll('.detail-chip').forEach(chip => {
    chip.style.cursor = 'pointer';

    chip.addEventListener('click', () => {
      openIndustryModal(chip.textContent.trim());
    });
  });
}

function openIndustryModal(industryName) {
  const modal = document.getElementById('detail-modal');
  const modalTitle = document.getElementById('detail-modal-title');
  const modalBody = document.getElementById('detail-modal-body');

  modalTitle.textContent = industryName;
  const description = industryDescriptions.get(industryName) || '';

  modalBody.innerHTML = formatDescription(description);
  modal.hidden = false;
}

function closeIndustryModal() {
  document.getElementById('detail-modal').hidden = true;
}

function getImpactIdFromLocation() {
  const pathParts = window.location.pathname.split('/').filter(Boolean);
  const qp = new URLSearchParams(window.location.search).get('id');

  if (qp) return qp;

  const last = pathParts[pathParts.length - 1];
  if (!last || last.endsWith('.html')) return 'HLG01';

  return decodeURIComponent(last);
}

function escapeHtml(str) {
  return String(str || '')
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
  return escapeHtml(text || '')
    .replace(/\n{2,}/g, '<span class="tight-paragraph-break"></span>')
    .replace(/\n/g, '<br>');
}

function getImpacts(raw) {
  return raw.Impacts || raw.impacts || raw.Objectives || raw.objectives || [];
}

function getObjectives(container) {
  if (!container) return [];

  return (
    container.Objectives ||
    container.objectives ||
    container.Objectvies || // supports temporary misspelling during schema migration
    container.objectvies ||
    container['Sub-Objectives'] ||
    container['Sub Objectives'] ||
    container.subObjectives ||
    []
  );
}

function flattenObjectives(objectives, depth = 0) {
  return objectives.flatMap(objective => [
    { objective, depth },
    ...flattenObjectives(getObjectives(objective), depth + 1)
  ]);
}

function buildObjectiveListItems(objectives) {
  return flattenObjectives(objectives).map(({ objective, depth }) => `
          <li>
            <a
              class="detail-technique-link"
              data-label="${escapeHtml(`${objective['Objective ID'] || ''} ${objective['Objective Name'] || ''}`.toLowerCase())}"
              href="${buildObjectiveHref(objective['Objective ID'] || '')}"
              style="--objective-depth:${depth}">
               ${depth > 0 ? '<span class="detail-objective-indent" aria-hidden="true">↳</span>' : ''}${escapeHtml(objective['Objective Name'] || '')}
            </a>
          </li>
        `).join('');
}

function buildObjectiveRows(objectives) {
  return flattenObjectives(objectives).map(({ objective, depth }) => `
          <tr id="${escapeHtml(objective['Objective ID'] || '')}" class="${depth > 0 ? 'detail-nested-objective-row' : ''}">
            <td class="detail-table-name">
              <a href="${buildObjectiveHref(objective['Objective ID'] || '')}">
                ${depth > 0 ? '<span class="detail-objective-indent" aria-hidden="true">↳</span>' : ''}${escapeHtml(objective['Objective Name'] || '')}
              </a>
            </td>
            <td>${formatDescription(getObjectiveDescription(objective))}</td>
          </tr>
        `).join('');
}

function getObjectiveDescription(objective) {
  return (
    objective['Objective Description'] ||
    objective['Onjective Description'] || // supports typo currently in ape.json
    ''
  );
}

function buildImpactHref(impactId) {
  return `impact.html?id=${encodeURIComponent(impactId)}`;
}

function buildObjectiveHref(objectiveId) {
  return `objective.html?id=${encodeURIComponent(objectiveId)}`;
}

function renderEmptyState(id) {
  document.title = 'Impact not found · APE';

  setText('detail-impact-name', 'Impact not found');
  setHtml('detail-impact-description', formatDescription(`No impact matched ${id}.`));
  setText('detail-meta-impact-id', '—');
  setText('detail-meta-impact-short-name', '—');
  setText('detail-meta-objective-count', '0');

  setHtml(
    'detail-breadcrumbs',
    `<span><a href="objectives.html">Objectives</a></span><span>&gt;</span><span>Impact not found</span>`
  );

  setHtml(
    'detail-objectives-table-body',
    `<tr><td colspan="2" class="detail-table-empty">No objectives available.</td></tr>`
  );
}

function buildSidebar(impacts, activeImpactId) {
  sidebarNav.innerHTML = '';

  impacts.forEach(impact => {
    const impactId = impact['Impact ID'] || '';
    const shortName = impact['Impact Short Name'] || '';
    const impactName = impact['Impact Name'] || '';
    const isActiveImpact = impactId === activeImpactId;

    const block = document.createElement('div');
    block.className = 'detail-tactic-block';
    block.dataset.tacticLabel = `${impactId} ${shortName} ${impactName}`.toLowerCase();

    block.innerHTML = `
      <button
        class="detail-tactic-toggle ${isActiveImpact ? 'expanded active-parent' : ''}"
        type="button"
        aria-expanded="${isActiveImpact ? 'true' : 'false'}">
        <span class="detail-tactic-toggle-left">
          <span class="detail-tactic-chevron" aria-hidden="true">›</span>
          <a
            class="detail-tactic-inline-link ${isActiveImpact ? 'active' : ''}"
            href="${buildImpactHref(impactId)}">
            ${escapeHtml(shortName || impactName)}
          </a>
        </span>
      </button>

      <ul class="detail-technique-list" ${isActiveImpact ? '' : 'hidden'}>
        ${buildObjectiveListItems(getObjectives(impact))}
      </ul>
    `;

    const toggle = block.querySelector('.detail-tactic-toggle');
    const list = block.querySelector('.detail-technique-list');
    const inlineLink = block.querySelector('.detail-tactic-inline-link');

    inlineLink.addEventListener('click', e => {
      e.stopPropagation();
    });

    toggle.addEventListener('click', e => {
      if (e.target.closest('.detail-tactic-inline-link')) return;

      const isExpanded = toggle.getAttribute('aria-expanded') === 'true';
      toggle.setAttribute('aria-expanded', String(!isExpanded));
      toggle.classList.toggle('expanded', !isExpanded);
      list.hidden = isExpanded;
    });

    sidebarNav.appendChild(block);
  });
}

function renderImpact(impacts, impactId) {
  const impact = impacts.find(g => g['Impact ID'] === impactId);

  if (!impact) {
    const target = `objectives.html?unknownImpact=${encodeURIComponent(impactId)}`;
    window.location.replace(target);
    return;
  }

  const objectives = getObjectives(impact);
  const flattenedObjectives = flattenObjectives(objectives);
  const impactName = impact['Impact Name'] || 'Untitled Impact';
  const shortName = impact['Impact Short Name'] || '—';

  loadIndustryDescriptions(shortName);

  document.title = `${impactName} · APE`;

  setText('detail-hero-tag', `${impact['Impact ID'] || ''} · Impact`);
  setText('detail-impact-name', impactName);
  setHtml('detail-impact-description', formatDescription(impact['Impact Description'] || ''));

  setText('detail-meta-impact-id', impact['Impact ID'] || '—');
  setText('detail-meta-impact-short-name', shortName);
  setText('detail-meta-objective-count', String(flattenedObjectives.length));

  setHtml(
    'detail-breadcrumbs',
    `
      <span><a href="objectives.html">Objectives</a></span>
      <span>&gt;</span>
      <span>${escapeHtml(impactName)}</span>
    `
  );

  setHtml(
    'detail-objectives-table-body',
    flattenedObjectives.length
      ? buildObjectiveRows(objectives)
      : `<tr><td colspan="2" class="detail-table-empty">No objectives available.</td></tr>`
  );


  buildSidebar(impacts, impactId);
}

function wireSidebarSearch() {
  if (!navSearch) return;

  navSearch.addEventListener('input', e => {
    const q = e.target.value.trim().toLowerCase();
    const impactBlocks = sidebar.querySelectorAll('.detail-tactic-block');

    let anyVisible = false;

    impactBlocks.forEach(block => {
      const impactLabel = block.dataset.tacticLabel || '';
      const impactMatches = !q || impactLabel.includes(q);

      let hasVisibleChildren = false;

      block.querySelectorAll('.detail-technique-link').forEach(link => {
        const label = link.dataset.label || '';
        const li = link.closest('li');
        const objectiveMatches = !q || label.includes(q);
        const shouldShow = impactMatches || objectiveMatches;

        if (li) li.style.display = shouldShow ? '' : 'none';
        if (shouldShow) hasVisibleChildren = true;
      });

      const toggle = block.querySelector('.detail-tactic-toggle');
      const list = block.querySelector('.detail-technique-list');

      if (q) {
        const blockVisible = impactMatches || hasVisibleChildren;

        block.style.display = blockVisible ? '' : 'none';
        toggle.setAttribute('aria-expanded', String(blockVisible));
        toggle.classList.toggle('expanded', blockVisible);
        list.hidden = !blockVisible;

        if (blockVisible) anyVisible = true;
      } else {
        const hasActiveImpact = !!block.querySelector('.detail-tactic-inline-link.active');

        block.style.display = '';
        toggle.setAttribute('aria-expanded', String(hasActiveImpact));
        toggle.classList.toggle('expanded', hasActiveImpact);
        list.hidden = !hasActiveImpact;

        anyVisible = true;
      }
    });

    let emptyMsg = sidebar.querySelector('.detail-empty-search');

    if (!anyVisible && q) {
      if (!emptyMsg) {
        emptyMsg = document.createElement('div');
        emptyMsg.className = 'detail-empty-search';
        emptyMsg.textContent = 'No impacts or objectives match your search.';
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

function wireSubtypeModal() {
  const modal = document.getElementById('detail-modal');
  const modalTitle = document.getElementById('detail-modal-title');
  const modalBody = document.getElementById('detail-modal-body');
  const closeBtn = document.getElementById('detail-modal-close');

  if (!modal) return;

  function openModal(subtype) {
    modalTitle.textContent = subtype;

    modalBody.innerHTML = `
      <p>
        Placeholder description for <strong>${escapeHtml(subtype)}</strong>.
      </p>
      <p>
        Later this content can be populated from the impact JSON adapter.
      </p>
    `;

    modal.hidden = false;
    document.body.classList.add('modal-open');
  }

  function closeModal() {
    modal.hidden = true;
    document.body.classList.remove('modal-open');
  }

  document
    .querySelectorAll('#detail-subtypes .detail-chip')
    .forEach(chip => {
      chip.style.cursor = 'pointer';

      chip.addEventListener('click', () => {
        openModal(chip.textContent.trim());
      });
    });

  closeBtn?.addEventListener('click', closeModal);

  modal
    .querySelector('.detail-modal-backdrop')
    ?.addEventListener('click', closeModal);

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && !modal.hidden) {
      closeModal();
    }
  });
}


async function initImpactPage() {
  wireSidebarSearch();
  wireMobileNav();
  wireSubtypeModal();

  const res = await fetch('./data/ape.json');
  if (!res.ok) throw new Error(`Failed to load data/ape.json: ${res.status}`);

  const raw = await res.json();
  const impacts = getImpacts(raw);
  const impactId = getImpactIdFromLocation();

  renderImpact(impacts, impactId);
}

initImpactPage().catch(err => {
  console.error(err);
  renderEmptyState(getImpactIdFromLocation());
});