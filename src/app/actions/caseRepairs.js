'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { ENTITY_SCHEMAS } from '@/schemas/contracts';
import { caseReactiveWorldSchema, validateReactiveWorldReferences } from '@/schemas/caseReactiveWorld';
import {
  generateCaseReactiveEvents,
  generateCaseReactiveHearing,
  generateCaseReactiveWorld,
} from '@/services/caseReactiveWorldService';
import {
  getEntityForEditor,
  updateDraft,
  validateCaseNpcAssignments,
} from '@/services/contentService';
import {
  discardPendingCaseRepair,
  publishPendingCaseRepair,
  savePendingCaseRepair,
} from '@/services/caseMaintenanceService';
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

async function saveDraftCase(id, model) {
  const parsed = ENTITY_SCHEMAS.case.parse(model);
  await validateCaseNpcAssignments(parsed.content, { allowDraft: true });
  await updateDraft('case', id, parsed);
  return parsed;
}

async function persistRepair(id, current, candidate, { type, summary }) {
  const parsed = ENTITY_SCHEMAS.case.parse(candidate);
  await validateCaseNpcAssignments(parsed.content, { allowDraft: true });

  if (current.status === 'published') {
    await savePendingCaseRepair(id, parsed, { type, summary });
    return { pending: true };
  }

  await saveDraftCase(id, parsed);
  return { pending: false };
}

function redirectAfterRepair(route, repair, result, extra = '') {
  const pending = result?.pending ? '&pendingReview=1' : '';
  redirect(`${route}?repair=${repair}${pending}${extra}`);
}

export async function repairCasePortraitsAction(formData) {
  const id = String(formData.get('id') || '').trim();
  const route = `/cases/${id}`;
  if (!id) redirect('/cases?error=' + encodeURIComponent('Caso inválido para reparar retratos.'));
  try {
    const current = await getEntityForEditor('case', id);
    const result = await repairPendingPortraits(current);
    const persisted = await persistRepair(id, current, result.caseData, {
      type: 'portraits',
      summary: `Retratos pendentes reprocessados: ${result.generatedLocal + result.generatedNpc} imagem(ns) gerada(s).`,
    });
    revalidatePath(route);
    revalidatePath('/npcs');
    redirectAfterRepair(route, 'portraits', persisted, `&count=${result.generatedLocal + result.generatedNpc}`);
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
    const repaired = await repairSingleCasePortrait(current, { locationId, characterId });
    const persisted = await persistRepair(id, current, repaired, {
      type: 'portrait-one',
      summary: 'Um retrato individual foi gerado e está pronto para revisão.',
    });
    revalidatePath(route);
    redirectAfterRepair(route, 'portrait-one', persisted);
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
    const repaired = await repairPendingNpcs(current);
    const persisted = await persistRepair(id, current, repaired, {
      type: 'npcs',
      summary: 'NPCs pendentes foram reprocessados sem reconstruir o caso.',
    });
    revalidatePath(route);
    revalidatePath('/npcs');
    redirectAfterRepair(route, 'npcs', persisted);
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
    const result = repairSafeInternalReferences(current);
    const persisted = await persistRepair(id, current, result.caseData, {
      type: 'references',
      summary: `${result.repaired} referência(s) interna(s) segura(s) corrigida(s).`,
    });
    revalidatePath(route);
    redirectAfterRepair(route, 'references', persisted, `&count=${result.repaired}`);
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
    const candidate = {
      ...current,
      metadata: { ...(current.metadata || {}), reactiveWorld: config },
    };
    const persisted = await persistRepair(id, current, candidate, {
      type: 'events',
      summary: `Intercorrências específicas regeneradas (${events.length} evento(s)).`,
    });
    revalidatePath(route);
    redirectAfterRepair(route, 'events', persisted);
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
    const candidate = {
      ...current,
      metadata: { ...(current.metadata || {}), reactiveWorld: config },
    };
    const persisted = await persistRepair(id, current, candidate, {
      type: 'hearing',
      summary: hearing
        ? `Audiência específica regenerada (${hearing.rounds?.length || 0} etapa(s)).`
        : 'A IA avaliou o caso e registrou que não há audiência oral específica necessária.',
    });
    revalidatePath(route);
    redirectAfterRepair(route, 'hearing', persisted);
  } catch (error) {
    if (error?.digest?.startsWith?.('NEXT_REDIRECT')) throw error;
    fail(route, error, 'Falha ao gerar somente a audiência.');
  }
}

export async function repairAllCasePendingAction(formData) {
  const id = String(formData.get('id') || '').trim();
  const route = `/cases/${id}`;
  try {
    const original = await getEntityForEditor('case', id);
    let current = original;
    const repairedSteps = [];

    const baseCheck = ENTITY_SCHEMAS.case.safeParse(current);
    const hasReferenceIssue = !baseCheck.success && baseCheck.error.issues.some((issue) =>
      !/duplicado/i.test(issue.message) && /inexistente|referencia|desbloqueia|revela|aponta/i.test(issue.message),
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

    const persisted = await persistRepair(id, original, current, {
      type: 'automatic',
      summary: repairedSteps.length
        ? `Reparo inteligente executou: ${repairedSteps.join(', ')}.`
        : 'Diagnóstico não encontrou reparos automáticos adicionais.',
    });
    revalidatePath(route);
    revalidatePath('/npcs');
    redirectAfterRepair(route, 'all', persisted, `&steps=${encodeURIComponent(repairedSteps.join(','))}`);
  } catch (error) {
    if (error?.digest?.startsWith?.('NEXT_REDIRECT')) throw error;
    fail(route, error, 'Falha ao corrigir automaticamente as pendências do caso.');
  }
}

export async function publishPendingCaseRepairAction(formData) {
  const id = String(formData.get('id') || '').trim();
  const route = `/cases/${id}`;
  try {
    const current = await getEntityForEditor('case', id);
    const pending = current.metadata?.pendingGranularRepair;
    if (!pending?.candidate?.content) throw new Error('Não existe correção pendente para publicar.');

    const candidate = ENTITY_SCHEMAS.case.parse({
      ...current,
      content: pending.candidate.content,
      metadata: pending.candidate.metadata || {},
      status: 'published',
    });
    await validateCaseNpcAssignments(candidate.content, { allowDraft: false });
    const result = await publishPendingCaseRepair(id);
    revalidatePath(route);
    revalidatePath('/cases');
    revalidatePath('/npcs');
    redirect(`${route}?repairPublished=1&version=${result.version}`);
  } catch (error) {
    if (error?.digest?.startsWith?.('NEXT_REDIRECT')) throw error;
    fail(route, error, 'Falha ao publicar a correção pendente.');
  }
}

export async function discardPendingCaseRepairAction(formData) {
  const id = String(formData.get('id') || '').trim();
  const route = `/cases/${id}`;
  try {
    await discardPendingCaseRepair(id);
    revalidatePath(route);
    redirect(`${route}?repairDiscarded=1`);
  } catch (error) {
    if (error?.digest?.startsWith?.('NEXT_REDIRECT')) throw error;
    fail(route, error, 'Falha ao descartar a correção pendente.');
  }
}
