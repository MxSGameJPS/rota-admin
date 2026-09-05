'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { ENTITY_SCHEMAS } from '@/schemas/contracts';
import { caseReactiveWorldSchema, validateReactiveWorldReferences } from '@/schemas/caseReactiveWorld';
import {
  generateCaseReactiveEvents,
  generateCaseReactiveHearing,
  generateCaseReactiveWorld,
  saveCaseReactiveWorld,
} from '@/services/caseReactiveWorldService';
import {
  getEntityForEditor,
  updateDraft,
  validateCaseNpcAssignments,
} from '@/services/contentService';
import {
  repairPendingNpcs,
  repairPendingPortraits,
  repairSafeInternalReferences,
  repairSingleCasePortrait,
} from '@/services/caseRepairService';

function fail(route, error, fallback) {
  const message = error?.message || fallback;
  redirect(`${route}?error=${encodeURIComponent(message)}`);
}

function assertDraft(current) {
  if (current.status !== 'draft') {
    throw new Error('Este reparo altera o conteúdo do caso e só pode ser executado enquanto ele estiver em draft.');
  }
}

async function saveDraftCase(id, model) {
  const parsed = ENTITY_SCHEMAS.case.parse(model);
  await validateCaseNpcAssignments(parsed.content, { allowDraft: true });
  await updateDraft('case', id, parsed);
  return parsed;
}

export async function repairCasePortraitsAction(formData) {
  const id = String(formData.get('id') || '').trim();
  const route = `/cases/${id}`;
  if (!id) redirect('/cases?error=Caso%20inv%C3%A1lido.');
  try {
    const current = await getEntityForEditor('case', id);
    assertDraft(current);
    const result = await repairPendingPortraits(current);
    await saveDraftCase(id, result.caseData);
    revalidatePath(route);
    revalidatePath('/npcs');
    redirect(`${route}?repair=portraits&count=${result.generatedLocal + result.generatedNpc}`);
  } catch (error) {
    if (error?.digest?.startsWith?.('NEXT_REDIRECT')) throw error;
    fail(route, error, 'Falha ao reparar retratos pendentes.');
  }
}

export async function repairSinglePortraitAction(formData) {
  const id = String(formData.get('id') || '').trim();
  const locationId = String(formData.get('locationId') || '').trim();
  const characterId = String(formData.get('characterId') || '').trim();
  const route = `/cases/${id}`;
  try {
    const current = await getEntityForEditor('case', id);
    assertDraft(current);
    const repaired = await repairSingleCasePortrait(current, { locationId, characterId });
    await saveDraftCase(id, repaired);
    revalidatePath(route);
    redirect(`${route}?repair=portrait-one`);
  } catch (error) {
    if (error?.digest?.startsWith?.('NEXT_REDIRECT')) throw error;
    fail(route, error, 'Falha ao gerar o retrato deste personagem.');
  }
}

export async function repairCaseNpcsAction(formData) {
  const id = String(formData.get('id') || '').trim();
  const route = `/cases/${id}`;
  try {
    const current = await getEntityForEditor('case', id);
    assertDraft(current);
    const repaired = await repairPendingNpcs(current);
    await saveDraftCase(id, repaired);
    revalidatePath(route);
    revalidatePath('/npcs');
    redirect(`${route}?repair=npcs`);
  } catch (error) {
    if (error?.digest?.startsWith?.('NEXT_REDIRECT')) throw error;
    fail(route, error, 'Falha ao reprocessar NPCs pendentes.');
  }
}

export async function repairCaseReferencesAction(formData) {
  const id = String(formData.get('id') || '').trim();
  const route = `/cases/${id}`;
  try {
    const current = await getEntityForEditor('case', id);
    assertDraft(current);
    const result = repairSafeInternalReferences(current);
    await saveDraftCase(id, result.caseData);
    revalidatePath(route);
    redirect(`${route}?repair=references&count=${result.repaired}`);
  } catch (error) {
    if (error?.digest?.startsWith?.('NEXT_REDIRECT')) throw error;
    fail(route, error, 'Falha ao corrigir referências internas.');
  }
}

export async function repairReactiveEventsAction(formData) {
  const id = String(formData.get('id') || '').trim();
  const route = `/cases/${id}`;
  try {
    const current = await getEntityForEditor('case', id);
    const events = await generateCaseReactiveEvents(current);
    const existing = current.metadata?.reactiveWorld;
    const hearing = existing?.hearing ?? null;
    const existingGeneration = existing?.generation && typeof existing.generation === 'object' ? existing.generation : {};
    const config = caseReactiveWorldSchema.parse({
      version: 1,
      events,
      hearing,
      generation: {
        eventsReady: true,
        hearingReady: existing ? (existingGeneration.hearingReady ?? true) : false,
        eventsGeneratedAt: new Date().toISOString(),
        ...(existingGeneration.hearingGeneratedAt ? { hearingGeneratedAt: existingGeneration.hearingGeneratedAt } : {}),
      },
    });
    validateReactiveWorldReferences(config, current);
    const saved = await saveCaseReactiveWorld(id, config);
    revalidatePath(route);
    redirect(`${route}?repair=events&version=${saved.version}`);
  } catch (error) {
    if (error?.digest?.startsWith?.('NEXT_REDIRECT')) throw error;
    fail(route, error, 'Falha ao gerar somente as intercorrências.');
  }
}

export async function repairReactiveHearingAction(formData) {
  const id = String(formData.get('id') || '').trim();
  const route = `/cases/${id}`;
  try {
    const current = await getEntityForEditor('case', id);
    const existing = current.metadata?.reactiveWorld;
    const events = Array.isArray(existing?.events) ? existing.events : [];
    if (!events.length) throw new Error('Gere primeiro as intercorrências; a audiência usa os eventos existentes apenas como contexto e o mundo reativo exige ao menos uma intercorrência.');
    const hearing = await generateCaseReactiveHearing(current, events);
    const existingGeneration = existing?.generation && typeof existing.generation === 'object' ? existing.generation : {};
    const config = caseReactiveWorldSchema.parse({
      version: 1,
      events,
      hearing,
      generation: {
        eventsReady: true,
        hearingReady: true,
        eventsGeneratedAt: existingGeneration.eventsGeneratedAt || new Date().toISOString(),
        hearingGeneratedAt: new Date().toISOString(),
      },
    });
    validateReactiveWorldReferences(config, current);
    const saved = await saveCaseReactiveWorld(id, config);
    revalidatePath(route);
    redirect(`${route}?repair=hearing&version=${saved.version}`);
  } catch (error) {
    if (error?.digest?.startsWith?.('NEXT_REDIRECT')) throw error;
    fail(route, error, 'Falha ao gerar somente a audiência.');
  }
}

export async function repairAllCasePendingAction(formData) {
  const id = String(formData.get('id') || '').trim();
  const route = `/cases/${id}`;
  try {
    let current = await getEntityForEditor('case', id);
    assertDraft(current);
    const repairedSteps = [];

    const baseCheck = ENTITY_SCHEMAS.case.safeParse(current);
    const hasReferenceIssue = !baseCheck.success && baseCheck.error.issues.some((issue) =>
      /inexistente|referencia|desbloqueia|revela|aponta/i.test(issue.message),
    );
    if (hasReferenceIssue) {
      const references = repairSafeInternalReferences(current);
      current = references.caseData;
      if (references.repaired > 0) repairedSteps.push(`referências:${references.repaired}`);
    }

    if (Array.isArray(current.content?.npcNeeds) && current.content.npcNeeds.length > 0) {
      current = await repairPendingNpcs(current);
      repairedSteps.push('npcs');
    }

    const missingLocalPortrait = (current.content?.locations || []).some((location) =>
      (location.characters || []).some((character) => character.initialDialogue && !character.portraitSrc),
    );
    const missingNpcPortrait = (current.metadata?.automation?.generatedNpcDrafts || []).some((npc) => !npc?.portraitSrc);
    if (missingLocalPortrait || missingNpcPortrait) {
      const portraits = await repairPendingPortraits(current);
      current = portraits.caseData;
      repairedSteps.push(`retratos:${portraits.generatedLocal + portraits.generatedNpc}`);
    }

    let reactiveValid = false;
    if (current.metadata?.reactiveWorld) {
      try {
        const parsedReactive = caseReactiveWorldSchema.parse(current.metadata.reactiveWorld);
        validateReactiveWorldReferences(parsedReactive, current);
        reactiveValid = Boolean(parsedReactive.generation?.eventsReady !== false && parsedReactive.generation?.hearingReady !== false);
      } catch {}
    }
    if (!reactiveValid) {
      const reactiveWorld = await generateCaseReactiveWorld(current);
      current = {
        ...current,
        metadata: { ...(current.metadata || {}), reactiveWorld },
      };
      repairedSteps.push('mundo-reativo');
    }

    await saveDraftCase(id, current);
    revalidatePath(route);
    revalidatePath('/npcs');
    redirect(`${route}?repair=all&steps=${encodeURIComponent(repairedSteps.join(','))}`);
  } catch (error) {
    if (error?.digest?.startsWith?.('NEXT_REDIRECT')) throw error;
    fail(route, error, 'Falha ao corrigir automaticamente as pendências do caso.');
  }
}
