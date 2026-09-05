import { ENTITY_SCHEMAS } from '@/schemas/contracts';
import { caseReactiveWorldSchema, validateReactiveWorldReferences } from '@/schemas/caseReactiveWorld';
import { validateCaseNpcAssignments } from '@/services/contentService';

function issueMessage(issue) {
  const path = Array.isArray(issue?.path) && issue.path.length ? `${issue.path.join('.')} — ` : '';
  return `${path}${issue?.message || 'Problema de validação.'}`;
}

function localCharacters(caseModel) {
  const result = [];
  for (const location of caseModel?.content?.locations || []) {
    for (const character of location.characters || []) {
      if (!character?.initialDialogue) continue;
      result.push({
        id: character.id,
        name: character.name,
        role: character.role,
        locationId: location.id,
        locationName: location.name,
        hasPortrait: Boolean(character.portraitSrc),
        portraitSrc: character.portraitSrc || '',
      });
    }
  }
  return result;
}

function pendingPortraitChanges(caseModel, pending) {
  const candidateContent = pending?.candidate?.content;
  if (!candidateContent) return [];
  const liveByKey = new Map(localCharacters(caseModel).map((item) => [`${item.locationId}::${item.id}`, item]));
  const changes = [];
  for (const location of candidateContent.locations || []) {
    for (const character of location.characters || []) {
      if (!character?.portraitSrc) continue;
      const key = `${location.id}::${character.id}`;
      const live = liveByKey.get(key);
      if (live?.portraitSrc === character.portraitSrc) continue;
      changes.push({
        id: character.id,
        name: character.name,
        role: character.role,
        locationId: location.id,
        locationName: location.name,
        portraitSrc: character.portraitSrc,
      });
    }
  }
  return changes;
}

export async function analyzeCaseHealth(caseModel) {
  const baseResult = ENTITY_SCHEMAS.case.safeParse(caseModel);
  const baseIssues = baseResult.success ? [] : baseResult.error.issues.map(issueMessage);
  const referenceIssues = baseIssues.filter((message) => !/duplicado/i.test(message) && /inexistente|referencia|desbloqueia|revela|aponta/i.test(message));
  const structuralIssues = baseIssues.filter((message) => !referenceIssues.includes(message));

  let npcIssue = '';
  try {
    await validateCaseNpcAssignments(caseModel?.content || {}, { allowDraft: true });
  } catch (error) {
    npcIssue = error?.message || 'Falha ao validar NPCs do caso.';
  }

  const characters = localCharacters(caseModel);
  const missingPortraits = characters.filter((item) => !item.hasPortrait);
  const generatedNpcDrafts = Array.isArray(caseModel?.metadata?.automation?.generatedNpcDrafts)
    ? caseModel.metadata.automation.generatedNpcDrafts
    : [];
  const generatedNpcPortraitsMissing = generatedNpcDrafts.filter((npc) => !npc?.portraitSrc);
  const npcNeeds = Array.isArray(caseModel?.content?.npcNeeds) ? caseModel.content.npcNeeds : [];

  const reactiveRaw = caseModel?.metadata?.reactiveWorld;
  let reactiveValid = false;
  let reactiveIssue = '';
  let eventsCount = 0;
  let hearingRounds = 0;
  let hearingState = reactiveRaw ? 'not_required' : 'missing';

  if (reactiveRaw) {
    try {
      const parsed = caseReactiveWorldSchema.parse(reactiveRaw);
      validateReactiveWorldReferences(parsed, caseModel);
      reactiveValid = true;
      eventsCount = parsed.events.length;
      hearingRounds = parsed.hearing?.rounds?.length || 0;
      if (parsed.generation?.hearingReady === false) hearingState = 'missing';
      else hearingState = parsed.hearing ? 'ready' : 'not_required';
    } catch (error) {
      reactiveIssue = error?.message || 'Mundo reativo inválido.';
      eventsCount = Array.isArray(reactiveRaw?.events) ? reactiveRaw.events.length : 0;
      hearingRounds = Array.isArray(reactiveRaw?.hearing?.rounds) ? reactiveRaw.hearing.rounds.length : 0;
      hearingState = reactiveRaw?.hearing ? 'invalid' : 'missing';
    }
  }

  const warnings = Array.isArray(caseModel?.metadata?.automation?.warnings)
    ? caseModel.metadata.automation.warnings
    : [];

  const pendingRaw = caseModel?.metadata?.pendingGranularRepair;
  const pending = pendingRaw?.candidate?.content ? {
    exists: true,
    type: pendingRaw.type || 'granular',
    summary: pendingRaw.summary || 'Correção granular pronta para revisão.',
    createdAt: pendingRaw.createdAt || '',
    baseVersion: Number(pendingRaw.baseVersion || 0),
    newPortraits: pendingPortraitChanges(caseModel, pendingRaw),
  } : {
    exists: false,
    type: '',
    summary: '',
    createdAt: '',
    baseVersion: 0,
    newPortraits: [],
  };

  const needsRepair = Boolean(
    structuralIssues.length
    || referenceIssues.length
    || npcIssue
    || npcNeeds.length
    || missingPortraits.length
    || generatedNpcPortraitsMissing.length
    || !reactiveRaw
    || (reactiveRaw && !reactiveValid),
  );

  return {
    healthy: !needsRepair,
    base: {
      valid: baseResult.success,
      structuralIssues,
      referenceIssues,
    },
    npcs: {
      valid: !npcIssue && npcNeeds.length === 0,
      issue: npcIssue,
      pendingNeeds: npcNeeds.length,
      generatedDrafts: generatedNpcDrafts.length,
      generatedPortraitsMissing: generatedNpcPortraitsMissing.length,
    },
    portraits: {
      total: characters.length,
      ready: characters.length - missingPortraits.length,
      missing: missingPortraits,
      generatedNpcPortraitsMissing,
    },
    reactive: {
      present: Boolean(reactiveRaw),
      valid: reactiveValid,
      issue: reactiveIssue,
      eventsCount,
      eventsState: eventsCount > 0 ? 'ready' : 'missing',
      hearingRounds,
      hearingState,
    },
    pending,
    warnings,
    repairable: {
      portraits: missingPortraits.length > 0 || generatedNpcPortraitsMissing.length > 0,
      npcs: npcNeeds.length > 0 || Boolean(npcIssue),
      references: referenceIssues.length > 0,
      reactiveWorld: !reactiveRaw || !reactiveValid,
      events: eventsCount === 0 || !reactiveValid,
      hearing: hearingState === 'missing' || hearingState === 'invalid',
    },
  };
}
