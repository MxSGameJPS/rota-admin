function normalizeText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function tokens(value) {
  return new Set(normalizeText(value).split(/\s+/).filter(token => token.length >= 3));
}

function overlapScore(left, right) {
  const a = tokens(left);
  const b = tokens(right);
  if (!a.size || !b.size) return 0;
  let overlap = 0;
  for (const token of a) if (b.has(token)) overlap += 1;
  return overlap / Math.max(a.size, b.size);
}

function bestClueMatch(rawReference, interactionText, clues) {
  const source = `${rawReference || ''} ${interactionText || ''}`;
  let best = null;
  let bestScore = 0;
  for (const clue of clues) {
    const target = `${clue.id} ${clue.title || ''} ${clue.summary || ''} ${clue.fullDetail || ''}`;
    const score = overlapScore(source, target);
    if (score > bestScore) {
      bestScore = score;
      best = clue;
    }
  }
  return bestScore >= 0.12 ? best : null;
}

function bestLocationMatch(rawReference, interactionText, locations) {
  const source = `${rawReference || ''} ${interactionText || ''}`;
  let best = null;
  let bestScore = 0;
  for (const location of locations) {
    const target = `${location.id} ${location.name || ''} ${location.description || ''} ${location.address || ''}`;
    const score = overlapScore(source, target);
    if (score > bestScore) {
      bestScore = score;
      best = location;
    }
  }
  return bestScore >= 0.12 ? best : null;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

export function normalizeLocationReferences(location, plan) {
  const normalized = clone(location);
  const allClues = Array.isArray(plan?.content?.availableClues) ? plan.content.availableClues : [];
  const allLocations = Array.isArray(plan?.content?.locations) ? plan.content.locations : [];
  const localClues = allClues.filter(clue => clue.locationFoundId === normalized.id);
  const clueIds = new Set(allClues.map(clue => clue.id));
  const locationIds = new Set(allLocations.map(item => item.id));
  const usedLocalClueIds = new Set();

  for (const searchable of normalized.searchables || []) {
    if (!searchable.foundClueId) continue;
    if (clueIds.has(searchable.foundClueId)) {
      if (localClues.some(clue => clue.id === searchable.foundClueId)) usedLocalClueIds.add(searchable.foundClueId);
      continue;
    }
    const match = bestClueMatch(
      searchable.foundClueId,
      `${searchable.name || ''} ${searchable.description || ''} ${searchable.inspectedMessage || ''}`,
      localClues.length ? localClues : allClues,
    );
    if (match) {
      searchable.foundClueId = match.id;
      if (localClues.some(clue => clue.id === match.id)) usedLocalClueIds.add(match.id);
    } else {
      delete searchable.foundClueId;
    }
  }

  for (const character of normalized.characters || []) {
    for (const dialogue of character.dialogueOptions || []) {
      if (dialogue.revealsClueId) {
        if (clueIds.has(dialogue.revealsClueId)) {
          if (localClues.some(clue => clue.id === dialogue.revealsClueId)) usedLocalClueIds.add(dialogue.revealsClueId);
        } else {
          const match = bestClueMatch(
            dialogue.revealsClueId,
            `${dialogue.question || ''} ${dialogue.answer || ''}`,
            localClues.length ? localClues : allClues,
          );
          if (match) {
            dialogue.revealsClueId = match.id;
            if (localClues.some(clue => clue.id === match.id)) usedLocalClueIds.add(match.id);
          } else {
            delete dialogue.revealsClueId;
          }
        }
      }

      if (dialogue.unlocksLocationId && !locationIds.has(dialogue.unlocksLocationId)) {
        const match = bestLocationMatch(
          dialogue.unlocksLocationId,
          `${dialogue.question || ''} ${dialogue.answer || ''}`,
          allLocations,
        );
        if (match) dialogue.unlocksLocationId = match.id;
        else delete dialogue.unlocksLocationId;
      }
    }
  }

  const unreferencedLocalClues = localClues.filter(clue => !usedLocalClueIds.has(clue.id));
  if (unreferencedLocalClues.length) {
    const candidates = [
      ...(normalized.searchables || []).map(item => ({ type: 'searchable', item })),
      ...(normalized.characters || []).flatMap(character =>
        (character.dialogueOptions || []).map(item => ({ type: 'dialogue', item })),
      ),
    ];

    for (const clue of unreferencedLocalClues) {
      const available = candidates.filter(candidate =>
        candidate.type === 'searchable'
          ? !candidate.item.foundClueId
          : !candidate.item.revealsClueId,
      );
      if (!available.length) break;

      let bestCandidate = available[0];
      let bestScore = -1;
      for (const candidate of available) {
        const interactionText = candidate.type === 'searchable'
          ? `${candidate.item.name || ''} ${candidate.item.description || ''} ${candidate.item.inspectedMessage || ''}`
          : `${candidate.item.question || ''} ${candidate.item.answer || ''}`;
        const score = overlapScore(interactionText, `${clue.title || ''} ${clue.summary || ''} ${clue.fullDetail || ''}`);
        if (score > bestScore) {
          bestScore = score;
          bestCandidate = candidate;
        }
      }

      if (bestCandidate.type === 'searchable') bestCandidate.item.foundClueId = clue.id;
      else bestCandidate.item.revealsClueId = clue.id;
    }
  }

  return normalized;
}
