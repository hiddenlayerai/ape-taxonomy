/* ============================================================
   Detail page for one objective or objective subtype
   ============================================================ */

const sidebar = document.getElementById('detail-sidebar');
const sidebarNav = document.getElementById('detail-sidebar-nav');
const navSearch = document.getElementById('detail-nav-search');
const toggleNav = document.getElementById('detail-toggle-nav');

function getObjectiveIdFromLocation() {
  const pathParts = window.location.pathname.split('/').filter(Boolean);
  const qp = new URLSearchParams(window.location.search).get('id');

  if (qp) return qp;

  const last = pathParts[pathParts.length - 1];
  if (!last || last.endsWith('.html')) return 'HLG01.01';

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

function getObjectives(impact) {
  return (
    impact.Objectives ||
    impact.objectives ||
    impact['Sub-Objectives'] ||
    impact['Sub Objectives'] ||
    impact.subObjectives ||
    []
  );
}

function getObjectiveSubtypes(objective) {
  return (
    objective['Objective Subtypes'] ||
    objective.objectiveSubtypes ||
    objective['Sub-Objectives'] ||
    objective['Sub Objectives'] ||
    objective.subObjectives ||
    []
  );
}

function getSubObjectives(container) {
  return getObjectives(container);
}

function getObjectiveDescription(objective) {
  return (
    objective['Objective Description'] ||
    ''
  );
}

function buildImpactHref(impactId) {
  return `impact.html?id=${encodeURIComponent(impactId)}`;
}

function buildObjectiveHref(objectiveId) {
  return `objective.html?id=${encodeURIComponent(objectiveId)}`;
}

function findObjective(impacts, objectiveId) {
  for (const impact of impacts) {
    const objective = findObjectiveInTree(getObjectives(impact), objectiveId);

    if (objective) {
      return {
        impact,
        objective: objective.item,
        parentObjective: objective.parentObjective
      };
    }
  }

  return null;
}

function findObjectiveInTree(objectives, objectiveId, parentObjective = null) {
  for (const objective of objectives) {
    if (objective['Objective ID'] === objectiveId) {
      return { item: objective, parentObjective };
    }

    const childMatch = findObjectiveInTree(getObjectiveSubtypes(objective), objectiveId, objective);
    if (childMatch) return childMatch;
  }

  return null;
}

function renderEmptyState(id) {
  document.title = 'Objective not found · APE';

  setText('detail-objective-name', 'Objective not found');
  setHtml('detail-objective-description', formatDescription(`No objective matched ${id}.`));
  setText('detail-meta-objective-id', '—');
  setText('detail-meta-impact-link', '—');

  setHtml(
    'detail-breadcrumbs',
    `<span><a href="objectives.html">Objectives</a></span><span>&gt;</span><span>Objective not found</span>`
  );
}

function buildSidebar(impacts, activeObjectiveId) {
  sidebarNav.innerHTML = '';

  impacts.forEach(impact => {
    const impactId = impact['Impact ID'] || '';
    const shortName = impact['Impact Short Name'] || '';
    const impactName = impact['Impact Name'] || '';
    const objectives = getObjectives(impact);
    const isActiveImpact = objectivesContainObjective(objectives, activeObjectiveId);

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
        ${renderObjectiveNavItems(objectives, activeObjectiveId)}
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

function renderObjectiveNavItems(objectives, activeObjectiveId, depth = 0) {
  return objectives.map(objective => {
    const objectiveId = objective['Objective ID'] || '';
    const isActiveObjective = objectiveId === activeObjectiveId;
    const children = getObjectiveSubtypes(objective);
    const hasChildren = children.length > 0;
    const childActive = objectivesContainObjective(children, activeObjectiveId);
    const shouldExpand = isActiveObjective || childActive;

    return `
      <li class="detail-objective-nav-item depth-${depth}">
        <a
          class="detail-technique-link ${isActiveObjective ? 'active' : ''}"
          data-label="${escapeHtml(buildObjectiveSearchLabel(objective).toLowerCase())}"
          href="${buildObjectiveHref(objectiveId)}">
          ${escapeHtml(objective['Objective Name'] || '')}
        </a>
        ${hasChildren ? `<ul class="detail-objective-subtype-list" ${shouldExpand ? '' : 'hidden'}>
          ${renderObjectiveNavItems(children, activeObjectiveId, depth + 1)}
        </ul>` : ''}
      </li>
    `;
  }).join('');
}

function objectivesContainObjective(objectives, objectiveId) {
  return objectives.some(objective => {
    if (objective['Objective ID'] === objectiveId) return true;
    return objectivesContainObjective(getObjectiveSubtypes(objective), objectiveId);
  });
}

function buildObjectiveSearchLabel(objective) {
  const children = getObjectiveSubtypes(objective)
    .map(child => buildObjectiveSearchLabel(child))
    .join(' ');

  return `${objective['Objective ID'] || ''} ${objective['Objective Name'] || ''} ${children}`;
}

function renderObjective(impacts, objectiveId) {
  const match = findObjective(impacts, objectiveId);

  if (!match) {
    const target = `objectives.html?unknownObjective=${encodeURIComponent(objectiveId)}`;
    window.location.replace(target);
    return;
  }

  const { impact, objective, parentObjective } = match;

  const impactId = impact['Impact ID'] || '';
  const impactShortName = impact['Impact Short Name'] || impact['Impact Name'] || 'Impact';
  const impactName = impact['Impact Name'] || impactShortName;
  const objectiveName = objective['Objective Name'] || 'Untitled Objective';
  const description = getObjectiveDescription(objective);

  document.title = `${objectiveName} · APE`;

  setText('detail-hero-tag', `${objective['Objective ID'] || ''} · ${parentObjective ? 'Objective Subtype' : 'Objective'}`);
  setText('detail-objective-name', objectiveName);
  setHtml('detail-objective-description', formatDescription(description));

  setText('detail-meta-objective-id', objective['Objective ID'] || '—');
  setHtml(
    'detail-meta-impact-link',
    `<a href="${buildImpactHref(impactId)}">${escapeHtml(impactShortName)}</a>`
  );

  const parentBreadcrumb = parentObjective
    ? `
      <span>&gt;</span>
      <span><a href="${buildObjectiveHref(parentObjective['Objective ID'] || '')}">${escapeHtml(parentObjective['Objective Name'] || '')}</a></span>
    `
    : '';

  setHtml(
    'detail-breadcrumbs',
    `
      <span><a href="objectives.html">Objectives</a></span>
      <span>&gt;</span>
      <span><a href="${buildImpactHref(impactId)}">${escapeHtml(impactName)}</a></span>
      ${parentBreadcrumb}
      <span>&gt;</span>
      <span>${escapeHtml(objectiveName)}</span>
    `
  );

  renderReferences(objective);
  renderObjectiveSubtypes(objective);

  buildSidebar(impacts, objectiveId);
}

function wireSidebarSearch() {
  if (!navSearch) return;

  navSearch.addEventListener('input', e => {
    const q = e.target.value.trim().toLowerCase();
    const impactBlocks = sidebar.querySelectorAll('.detail-tactic-block');

    let anyVisible = false;

    function filterNavItem(li) {
      const directLink = li.querySelector(':scope > .detail-technique-link');
      const childList = li.querySelector(':scope > .detail-objective-subtype-list');
      const childItems = childList
        ? Array.from(childList.querySelectorAll(':scope > .detail-objective-nav-item'))
        : [];

      const selfMatches = !q || (directLink?.dataset.label || '').includes(q);
      const childMatches = childItems.map(filterNavItem).some(Boolean);
      const shouldShow = selfMatches || childMatches;

      li.style.display = shouldShow ? '' : 'none';

      if (childList) {
        childList.hidden = q ? !childMatches && !selfMatches : true;

        if (!q) {
          const hasActiveChild = !!childList.querySelector('.detail-technique-link.active');
          childList.hidden = !hasActiveChild;
        }
      }

      return shouldShow;
    }

    impactBlocks.forEach(block => {
      const impactLabel = block.dataset.tacticLabel || '';
      const impactMatches = !q || impactLabel.includes(q);

      const topItems = Array.from(
        block.querySelectorAll('.detail-technique-list > .detail-objective-nav-item')
      );

      const childMatches = topItems.map(filterNavItem).some(Boolean);
      const blockVisible = impactMatches || childMatches;

      const toggle = block.querySelector('.detail-tactic-toggle');
      const list = block.querySelector('.detail-technique-list');

      if (q) {
        block.style.display = blockVisible ? '' : 'none';
        toggle.setAttribute('aria-expanded', String(blockVisible));
        toggle.classList.toggle('expanded', blockVisible);
        list.hidden = !blockVisible;

        if (blockVisible) anyVisible = true;
      } else {
        const hasActiveImpact = !!block.querySelector('.detail-tactic-inline-link.active');
        const hasActiveObjective = !!block.querySelector('.detail-technique-link.active');
        const shouldExpand = hasActiveImpact || hasActiveObjective;

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

async function fetchObjectiveData() {
  const candidates = ['./data/ape.json'];

  for (const path of candidates) {
    const res = await fetch(path);
    if (res.ok) return res.json();
  }

  throw new Error('Failed to load objective data.');
}

async function initObjectivePage() {
  wireSidebarSearch();
  wireMobileNav();

  const raw = await fetchObjectiveData();
  const impacts = getImpacts(raw);
  const objectiveId = getObjectiveIdFromLocation();

  renderObjective(impacts, objectiveId);
}

initObjectivePage().catch(err => {
  console.error(err);
  renderEmptyState(getObjectiveIdFromLocation());
});

function getObjectiveReferences(objective) {
  return objective.References || objective.references || [];
}

function isSafeExternalUrl(value) {
  try {
    const url = new URL(value, window.location.href);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

function renderReferences(objective) {
  const panel = document.getElementById('detail-references-panel');
  const list = document.getElementById('detail-references-list');
  if (!panel || !list) return;

  const refs = getObjectiveReferences(objective);

  if (!refs.length) {
    panel.hidden = true;
    list.innerHTML = '';
    return;
  }

  panel.hidden = false;
  list.innerHTML = refs.map(ref => {
    const link = ref.link || ref.url || '';
    const title = ref.title || link;

    if (!link || !isSafeExternalUrl(link)) return `<li>${escapeHtml(title)}</li>`;

    return `
      <li>
        <a href="${escapeHtml(link)}" target="_blank" rel="noopener noreferrer">
          ${escapeHtml(title)}
        </a>
      </li>
    `;
  }).join('');
}

function renderObjectiveSubtypes(objective) {
  const panel = document.getElementById('detail-objective-subtypes-panel');
  const tableBody = document.getElementById('detail-objective-subtypes-table-body');
  if (!panel || !tableBody) return;

  const subtypes = getObjectiveSubtypes(objective);

  if (!subtypes.length) {
    panel.hidden = true;
    tableBody.innerHTML = '';
    return;
  }

  panel.hidden = false;
  tableBody.innerHTML = subtypes.map(subtype => `
    <tr id="${escapeHtml(subtype['Objective ID'] || '')}">
      <td class="detail-table-name">
        <a href="${buildObjectiveHref(subtype['Objective ID'] || '')}">
          ${escapeHtml(subtype['Objective Name'] || '')}
        </a>
      </td>
      <td>${formatDescription(getObjectiveDescription(subtype))}</td>
    </tr>
  `).join('');
}
