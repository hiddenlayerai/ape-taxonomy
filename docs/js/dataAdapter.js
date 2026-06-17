/* ============================================================
   Normalizes ape.json into the shape expected by the site.
   ============================================================ */

export function toSlug(name) {
  return String(name)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function splitLines(value) {
  if (!value) return [];
  return String(value)
    .split('\n')
    .map(s => s.trim())
    .filter(Boolean);
}

function parseReferences(value) {
  if (!value) return [];

  const values = Array.isArray(value) ? value : [value];

  return values
    .flatMap(item => String(item).split('\n'))
    .flatMap(line => line.split(/\s+/))
    .map(s => s.trim())
    .filter(Boolean);
}

export function normalizeData(orig) {
  const tacticMap = {};

  (orig.Tactics || []).forEach(t => {
    const tacticId = t['Tactic ID'];

    tacticMap[tacticId] = {
      id: toSlug(t['Tactic Name']),
      sourceId: tacticId,
      name: t['Tactic Name'],
      description: t['Tactic Description'],
      techniques: []
    };

    // New ape-taxonomy.json shape: techniques nested under tactics
    (t.Techniques || []).forEach(tech => {
      tacticMap[tacticId].techniques.push(normalizeTechnique(tech, tacticId));
    });
  });

  // Backward compatibility with old ape.json shape
  (orig.Techniques || []).forEach(tech => {
    const tacticId = tech['Tactic ID'];
    const tactic = tacticMap[tacticId];
    if (!tactic) return;
    tactic.techniques.push(normalizeTechnique(tech, tacticId));
  });

  return {
    objectives: flattenImpactsToObjectives(orig).map(o => ({
      id: toSlug(o['Objective Name']),
      sourceId: o['Objective ID'],
      name: o['Objective Name'],
      description: o['Objective Description']
    })),
    tactics: Object.values(tacticMap),
    industries: (orig.industries || orig.Industries || []).map(ind => ({
      name: ind.name || ind['Industry Name'],
      objectives: (ind.objectives || ind['Objectives'] || []).map(obj => ({
        name: obj.name || obj['Objective Name'],
        description: obj.description || obj['Objective Description']
      }))
    }))
  };
}

function flattenImpactsToObjectives(orig) {
  // Current schema: top-level Objectives was renamed to Impacts.
  // Keep legacy fallbacks so older ape.json files still normalize.
  const impacts = orig.Impacts || orig.impacts || orig.Objectives || orig.objectives || [];

  return impacts.flatMap(impact => getNestedObjectives(impact));
}

function getNestedObjectives(container) {
  const objectives = getObjectives(container);

  return objectives.flatMap(objective => [
    objective,
    ...getNestedObjectives(objective)
  ]);
}

function getObjectives(container) {
  if (!container) return [];

  return (
    // Current schema: child/sub-objectives are stored under Objectives.
    // Include Objectvies/objectvies as a defensive fallback for the transitional typo.
    container.Objectives ||
    container.objectives ||
    container.Objectvies ||
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

function normalizeTechnique(tech, tacticId) {
  const annotations = normalizeAnnotations(tech['Annotations']);

  return {
    id: toSlug(tech['Technique Name']),
    sourceId: tech['Technique ID'],
    tacticSourceId: tacticId,
    name: tech['Technique Name'],
    description: tech['Technique Description'],
    examples: normalizePrompts(tech),
    subtypes: annotations.subtypes,
    annotationNotes: annotations.notes,
    customAnnotations: annotations.custom,
    references: parseReferences(tech['References']),
    contributors: splitLines(tech['Contributors'])
  };
}

function normalizePrompts(tech) {
  if (Array.isArray(tech.Prompts)) {
    return tech.Prompts
      .filter(entry => entry)
      .map(entry => {
        const turns = Array.isArray(entry.prompt)
          ? entry.prompt
          : [entry.prompt];

        return {
          turns: turns
            .map(turn => {
              if (typeof turn === 'string') {
                return {
                  prompt: turn,
                  highlightingOffsets: []
                };
              }

              return {
                prompt: String(turn.text || turn.prompt || ''),
                highlightingOffsets: Array.isArray(turn.highlightingOffsets)
                  ? turn.highlightingOffsets
                  : []
              };
            })
            .filter(turn => turn.prompt.trim())
        };
      })
      .filter(group => group.turns.length > 0);
  }

  if (tech.Prompt) {
    return [{
      turns: [{
        prompt: tech.Prompt,
        highlightingOffsets: []
      }]
    }];
  }

  return [];
}

function normalizeAnnotations(value) {
  if (!value) {
    return {
      notes: '',
      subtypes: [],
      custom: []
    };
  }

  if (typeof value === 'object' && !Array.isArray(value)) {
    const reservedKeys = new Set(['notes', 'subtypes']);

    return {
      notes: String(value.notes || ''),
      subtypes: Array.isArray(value.subtypes)
        ? value.subtypes.map(s => String(s).trim()).filter(Boolean)
        : [],
      custom: Object.entries(value)
        .filter(([key, val]) =>
          !reservedKeys.has(key) &&
          typeof val === 'string' &&
          val.trim()
        )
        .map(([key, val]) => ({
          title: titleCase(key),
          text: val.trim()
        }))
    };
  }

  return {
    notes: '',
    subtypes: [],
    custom: []
  };
}

function titleCase(value) {
  return String(value)
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase());
}
