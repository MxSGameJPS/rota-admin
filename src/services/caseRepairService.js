import { ENTITY_SCHEMAS } from '@/schemas/contracts';
import {
  automateGeneratedCaseAssets,
  automateGeneratedNpcPortrait,
} from '@/services/caseAssetAutomationService';
import {
  buildCaseCharacterPortraitPrompt,
  generateAndStorePortrait,
  hasImageGenerationConfigured,
} from '@/services/ai/portraitService';
import {
  getEntityForEditor,
  listPublishedNpcGenerationContext,
  updateDraft,
} from '@/services/contentService';

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function cleanPortraitWarnings(warnings = []) {
  return warnings.filter((warning) => !/^Retrato (de|do NPC) /i.test(String(warning || '')));
}

export async function repairPendingPortraits(caseInput) {
  const caseData = clone(caseInput);
  const configured = await hasImageGenerationConfigured();
  if (!configured) throw new Error('Geração de imagens não configurada em Configurações → Inteligência Artificial.');

  const previousAutomation = caseData.metadata?.automation && typeof caseData.metadata.automation === 'object'
    ? caseData.metadata.automation
    : {};
  const warnings = cleanPortraitWarnings(Array.isArray(previousAutomation.warnings) ? previousAutomation.warnings : []);
  let generatedLocal = 0;
  let generatedNpc = 0;

  for (const location of caseData.content?.locations || []) {
    for (const character of location.characters || []) {
      if (character.portraitSrc || !character.initialDialogue) continue;
      try {
        const portrait = await generateAndStorePortrait({
          prompt: buildCaseCharacterPortraitPrompt({ caseData, location, character }),
          folder: `cases/${caseData.id}`,
          slug: `${location.id}-${character.name}`,
        });
        character.portraitSrc = portrait.portraitSrc;
        character.portraitStoragePath = portrait.portraitStoragePath;
        character.portraitGeneratedAt = portrait.portraitGeneratedAt;
        generatedLocal += 1;
      } catch (error) {
        warnings.push(`Retrato de ${character.name} (${location.name}) não foi gerado: ${error.message}`);
      }
    }
  }

  const generatedNpcDrafts = Array.isArray(previousAutomation.generatedNpcDrafts)
    ? clone(previousAutomation.generatedNpcDrafts)
    : [];

  for (const item of generatedNpcDrafts) {
    if (item.portraitSrc || !item.id) continue;
    try {
      const npc = await getEntityForEditor('npc', item.id);
      if (npc.status !== 'draft') {
        warnings.push(`Retrato do NPC ${item.name || item.slug} não foi reprocessado porque o NPC não está em draft.`);
        continue;
      }
      const repairedNpc = await automateGeneratedNpcPortrait(npc);
      if (!repairedNpc.metadata?.portraitSrc) {
        throw new Error(repairedNpc.metadata?.portraitGenerationError || 'A IA não retornou um retrato.');
      }
      await updateDraft('npc', item.id, repairedNpc);
      item.portraitSrc = repairedNpc.metadata.portraitSrc;
      generatedNpc += 1;

      for (const assignment of caseData.content?.npcAssignments || []) {
        if (assignment.npcSlug !== item.slug) continue;
        assignment.configuration = {
          ...(assignment.configuration || {}),
          portraitSrc: repairedNpc.metadata.portraitSrc,
        };
      }
    } catch (error) {
      warnings.push(`Retrato do NPC ${item.name || item.slug} não foi gerado: ${error.message}`);
    }
  }

  caseData.metadata = {
    ...(caseData.metadata || {}),
    automation: {
      ...previousAutomation,
      generatedNpcDrafts,
      localPortraitsGenerated: Number(previousAutomation.localPortraitsGenerated || 0) + generatedLocal,
      warnings,
      portraitsRetriedAt: new Date().toISOString(),
    },
  };

  return {
    caseData: ENTITY_SCHEMAS.case.parse(caseData),
    generatedLocal,
    generatedNpc,
    warnings,
  };
}

export async function repairSingleCasePortrait(caseInput, { locationId, characterId }) {
  const caseData = clone(caseInput);
  const configured = await hasImageGenerationConfigured();
  if (!configured) throw new Error('Geração de imagens não configurada em Configurações → Inteligência Artificial.');

  const location = (caseData.content?.locations || []).find((item) => item.id === locationId);
  if (!location) throw new Error('Local do personagem não encontrado.');
  const character = (location.characters || []).find((item) => item.id === characterId);
  if (!character) throw new Error('Personagem não encontrado neste local.');

  const portrait = await generateAndStorePortrait({
    prompt: buildCaseCharacterPortraitPrompt({ caseData, location, character }),
    folder: `cases/${caseData.id}`,
    slug: `${location.id}-${character.name}`,
  });
  character.portraitSrc = portrait.portraitSrc;
  character.portraitStoragePath = portrait.portraitStoragePath;
  character.portraitGeneratedAt = portrait.portraitGeneratedAt;

  const previousAutomation = caseData.metadata?.automation && typeof caseData.metadata.automation === 'object'
    ? caseData.metadata.automation
    : {};
  caseData.metadata = {
    ...(caseData.metadata || {}),
    automation: {
      ...previousAutomation,
      localPortraitsGenerated: Number(previousAutomation.localPortraitsGenerated || 0) + 1,
      warnings: cleanPortraitWarnings(Array.isArray(previousAutomation.warnings) ? previousAutomation.warnings : []),
      portraitsRetriedAt: new Date().toISOString(),
    },
  };

  return ENTITY_SCHEMAS.case.parse(caseData);
}

export async function repairPendingNpcs(caseInput) {
  const publishedNpcs = await listPublishedNpcGenerationContext();
  const repaired = await automateGeneratedCaseAssets(caseInput, { publishedNpcs });
  return ENTITY_SCHEMAS.case.parse(repaired);
}

export function repairSafeInternalReferences(caseInput) {
  const caseData = clone(caseInput);
  const content = caseData.content || {};
  const locations = Array.isArray(content.locations) ? content.locations : [];
  if (!locations.length) return { caseData, repaired: 0 };

  const locationIds = new Set(locations.map((location) => location.id));
  const clueIds = new Set((content.availableClues || []).map((clue) => clue.id));
  const dialogueIds = new Set();
  for (const location of locations) {
    for (const character of location.characters || []) {
      for (const dialog of character.dialogueOptions || []) dialogueIds.add(dialog.id);
    }
  }

  let repaired = 0;
  const fallbackLocation = locations.find((location) => location.unlockedByDefault) || locations[0];

  for (const clue of content.availableClues || []) {
    if (locationIds.has(clue.locationFoundId)) continue;
    const owner = locations.find((location) =>
      (location.searchables || []).some((spot) => spot.foundClueId === clue.id)
      || (location.characters || []).some((character) =>
        (character.dialogueOptions || []).some((dialog) => dialog.revealsClueId === clue.id),
      ),
    );
    clue.locationFoundId = (owner || fallbackLocation).id;
    repaired += 1;
  }

  for (const location of locations) {
    for (const spot of location.searchables || []) {
      if (spot.foundClueId && !clueIds.has(spot.foundClueId)) {
        delete spot.foundClueId;
        repaired += 1;
      }
    }
    for (const character of location.characters || []) {
      for (const dialog of character.dialogueOptions || []) {
        if (dialog.revealsClueId && !clueIds.has(dialog.revealsClueId)) {
          delete dialog.revealsClueId;
          repaired += 1;
        }
        if (dialog.unlocksLocationId && !locationIds.has(dialog.unlocksLocationId)) {
          delete dialog.unlocksLocationId;
          repaired += 1;
        }
      }
    }
    if (
      location.requiredClueOrDialogToUnlock
      && !clueIds.has(location.requiredClueOrDialogToUnlock)
      && !dialogueIds.has(location.requiredClueOrDialogToUnlock)
    ) {
      delete location.requiredClueOrDialogToUnlock;
      location.unlockedByDefault = true;
      repaired += 1;
    }
  }

  for (const strategy of content.strategies || []) {
    const beforeRequired = (strategy.requiredCrucialClueIds || []).length;
    strategy.requiredCrucialClueIds = (strategy.requiredCrucialClueIds || []).filter((id) => clueIds.has(id));
    repaired += beforeRequired - strategy.requiredCrucialClueIds.length;
    const beforeIncompatible = (strategy.incompatibleClueIds || []).length;
    strategy.incompatibleClueIds = (strategy.incompatibleClueIds || []).filter((id) => clueIds.has(id));
    repaired += beforeIncompatible - strategy.incompatibleClueIds.length;
  }

  for (const need of content.npcNeeds || []) {
    if (!locationIds.has(need.locationId)) {
      need.locationId = fallbackLocation.id;
      repaired += 1;
    }
  }
  for (const assignment of content.npcAssignments || []) {
    const currentLocation = assignment?.configuration?.locationId;
    if (currentLocation && !locationIds.has(currentLocation)) {
      assignment.configuration = { ...(assignment.configuration || {}), locationId: fallbackLocation.id };
      repaired += 1;
    }
  }

  return { caseData: ENTITY_SCHEMAS.case.parse(caseData), repaired };
}
