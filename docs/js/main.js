import { normalizeData } from './dataAdapter.js';

/* ============================================================
   Matrix view of Tactics & Techniques
   ============================================================ */

let allData = null;
let currentQuery = '';

// ── DOM ready ──────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  const fetchJson = url => fetch(url).then(r => {
    if (!r.ok) throw new Error(`Failed to load ${url}: ${r.status}`);
    return r.json();
  });

  fetchJson('data/ape.json')
    .then(raw => {
      const data = normalizeData(raw);
      allData = data;
      initSite(data);
      showUnknownItemFlashFromUrl();
    })
    .catch(err => {
      document.getElementById('content').innerHTML =
        `<p style="color:#e05c5c;padding:24px">Error loading data: ${escHtml(err.message)}</p>`;
    });

  document.getElementById('search-input').addEventListener('input', onSearch);
  document.getElementById('clear-btn').addEventListener('click', clearSearch);
  window.addEventListener('resize', updateScrollFades);

});

// ── Site init ──────────────────────────────────────────────
function initSite(data) {
  renderCategories(data.tactics, '');

  // Wire scroll fades
  const scroller = document.querySelector('.matrix-scroll');
  if (scroller) scroller.addEventListener('scroll', updateScrollFades);

}

// ── Scroll fades ────────────────────────────────────────────
function updateScrollFades() {
  const scroller = document.querySelector('.matrix-scroll');
  const wrap = document.querySelector('.matrix-scroll-wrap');
  if (!scroller || !wrap) return;
  const { scrollLeft, scrollWidth, clientWidth } = scroller;
  const isOverflowing = scrollWidth > clientWidth;
  wrap.classList.toggle('scroll-fade-left', isOverflowing && scrollLeft > 1);
  wrap.classList.toggle('scroll-fade-right', isOverflowing && scrollLeft + clientWidth < scrollWidth - 1);
}

// ── Rendering ──────────────────────────────────────────────
function renderCategories(categories, query) {
  const content = document.getElementById('content');
  content.innerHTML = '';

  let totalVisible = 0;

  if (query) {
    content.classList.add('search-mode');
    categories.forEach(tactic => {
      const visibleItems = tactic.techniques.filter(item => itemMatchesQuery(item, query));
      if (visibleItems.length === 0) return;
      totalVisible += visibleItems.length;
      visibleItems.forEach(item => {
        content.appendChild(buildSearchResultCard(item, query, tactic.name));
      });
    });
  } else {
    content.classList.remove('search-mode');
    categories.forEach(tactic => {
      const visibleItems = tactic.techniques;
      if (visibleItems.length === 0) return;
      totalVisible += visibleItems.length;

      const section = document.createElement('section');
      section.className = 'category';
      section.dataset.catId = tactic.id;

      section.innerHTML = `
        <div class="category-header">
          <a class="category-name-btn" href="${buildTacticHref(tactic.sourceId)}">
            <span class="category-name">${escHtml(tactic.name)}<span class="tactic-arrow" aria-hidden="true">›</span></span>
          </a>
        </div>
        <div class="cards-list"></div>
      `;

      const cardsList = section.querySelector('.cards-list');
      visibleItems.forEach(item => {
        cardsList.appendChild(buildCard(item, query, tactic.name));
      });

      content.appendChild(section);
    });
  }

  // Results count + section heading visibility
  const countEl = document.getElementById('results-count');
  const noResults = document.getElementById('no-results');

  if (query) {
    countEl.textContent = `${totalVisible} technique result${totalVisible !== 1 ? 's' : ''} for "${query}"`;
    noResults.classList.toggle('visible', totalVisible === 0);
  } else {
    countEl.textContent = '';
    noResults.classList.remove('visible');
  }

  requestAnimationFrame(updateScrollFades);
}

function buildCard(item, query, categoryName) {
  const card = document.createElement('div');
  card.className = 'card';
  card.id = `card-${item.id}`;

  const displayName = item.name.replace(/^[A-Z]+\d*\.\d+\s*-\s*/, '');
  const nameHtml = query ? highlight(displayName, query) : escHtml(displayName);

  card.innerHTML = `
    <a class="card-header" href="${buildTechniqueHref(item.sourceId)}">
      <div class="card-header-text">
        <div class="card-name">${nameHtml}</div>
      </div>
      <span class="card-chevron" aria-hidden="true">›</span>
    </a>
  `;
  

  return card;
}

function buildSearchResultCard(item, query, categoryName) {
  const card = document.createElement('div');
  card.className = 'card search-result-card';
  card.id = `card-${item.id}`;

  const displayName = item.name.replace(/^[A-Z]+\d*\.\d+\s*-\s*/, '');
  const nameHtml = highlight(displayName, query);


  card.innerHTML = `
    <a class="card-header" href="${buildTechniqueHref(item.sourceId)}">
      <div class="card-header-text">
        <div class="card-name">${nameHtml}</div>
      </div>
      <span class="card-chevron" aria-hidden="true">›</span>
    </a>
  `;
  

  return card;
}


// ── Search ─────────────────────────────────────────────────
function onSearch(e) {
  currentQuery = e.target.value.trim();
  document.getElementById('clear-btn').classList.toggle('visible', currentQuery.length > 0);
  renderCategories(allData.tactics, currentQuery);

}

function clearSearch() {
  const input = document.getElementById('search-input');
  input.value = '';
  input.focus();
  currentQuery = '';
  document.getElementById('clear-btn').classList.remove('visible');
  renderCategories(allData.tactics, '');
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

// ── Helpers ────────────────────────────────────────────────

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

function escHtml(str) {
  return String(str)
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

function buildTechniqueHref(sourceId) {
  return `technique.html?id=${encodeURIComponent(sourceId)}`;
}

function buildTacticHref(sourceId) {
  return `tactic.html?id=${encodeURIComponent(sourceId)}`;
}

function showUnknownItemFlashFromUrl() {
  const params = new URLSearchParams(window.location.search);

  const unknownTechnique = params.get('unknownTechnique');
  const unknownTactic = params.get('unknownTactic');

  const type = unknownTechnique ? 'technique' : unknownTactic ? 'tactic' : null;
  const value = unknownTechnique || unknownTactic;

  if (!type || !value) return;

  const flash = document.createElement('div');
  flash.className = 'unknown-technique-flash';
  flash.setAttribute('role', 'status');
  flash.innerHTML = `
    <strong>Unknown ${escHtml(type)}</strong>
    <span>No ${escHtml(type)} matched "${escHtml(value)}".</span>
    <button type="button" aria-label="Dismiss">×</button>
  `;

  document.body.appendChild(flash);

  flash.querySelector('button').addEventListener('click', () => {
    flash.remove();
  });

  window.history.replaceState({}, '', window.location.pathname);

  setTimeout(() => {
    flash.remove();
  }, 6000);
}