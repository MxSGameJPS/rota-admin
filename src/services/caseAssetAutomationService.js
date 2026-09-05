import { getSupabaseAdmin } from '@/lib/supabase/server';
import { generateStructured } from '@/lib/ai/provider';
import { npcSchema } from '@/schemas/contracts';
import { createDraft, listPublishedNpcGenerationContext } from '@/services/contentService';
import {
  buildCaseCharacterPortraitPrompt,
  buildNpcPortraitPrompt,
  generateAndStorePortrait,
  hasImageGenerationConfigured,
} from '@/services/ai/portraitService';

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function slugify(value) {
  return String(value || 'npc')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'npc';
}

function tokenize(value) {
  const stop = new Set(['de','da','do','das','dos','e','em','para','com','a','o','na','no','the','of','and']);
  return new Set(String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(token => token.length > 2 && !stop.has(token)));
}

function overlapScore(a, b) {
  const left = tokenize(a);
  const right = tokenize(b);
  let score = 0;
  for (const token of left) if (right.has(token)) score += 1;
  return score;
}

function candidateScore(need, candidate) {
  if (need.roleType !== candidate.roleType) return -1;
  let score = 4;
  score += Math.min(3, overlapScore(`${need.profession} ${need.specialization}`, `${candidate.profession} ${candidate.specialization}`));
  if (need.jurisdiction && candidate.jurisdiction && String(candidate.jurisdiction).toLowerCase().includes(String(need.jurisdiction).toLowerCase())) score += 1;
  return score;
}

function findReusableCandidate(need, catalog, excludedSlugs = new Set()) {
  const ranked = (catalog || [])
    .filter(candidate => !excludedSlugs.has(candidate.slug))
    .map(candidate => ({ candidate, score: candidateScore(need, candidate) }))
    .filter(item => item.score >= 5)
    .sort((a, b) => b.score - a.score || Number(a.candidate.usageCount || 0) - Number(b.candidate.usageCount || 0));
  return ranked[0]?.candidate || null;
}

async function allocateUniqueNpcSlug(desired) {
  const client = getSupabaseAdmin();
  if (!client) throw new Error('Configure o Supabase antes de criar NPCs automaticamente.');
  const base = slugify(desired);
  for (let index = 0; index < 100; index += 1) {
    const candidate = index === 0 ? base : `${base}-${index + 1}`;
    const { data, error } = await client.from('npcs').select('id').eq('slug', candidate).maybeSingle();
    if (error) throw error;
    if (!data) return candidate;
  }
  throw new Error(`Não foi possível criar um slug único para o NPC ${desired}.`);
}

function humanizeTrigger(trigger) {
  const text = String(trigger || '').replace(/[_-]+/g, ' ').trim();
  if (!text) return 'Perguntar sobre o caso';
  if (/^(perguntar|questionar|solicitar|verificar|pedir)\b/i.test(text)) return text.charAt(0).toUpperCase() + text.slice(1);
  return `Perguntar sobre ${text.toLowerCase()}`;
}

function buildAssignmentConfiguration(npc, need) {
  const dialogues = Array.isArray(npc.dialogueLibrary) ? npc.dialogueLibrary.slice(0, 4) : [];
  const portraitSrc = typeof npc.metadata?.portraitSrc === 'string' ? npc.metadata.portraitSrc : '';
  return {
    locationId: need.locationId,
    initialDialogue: dialogues[0]?.text || `Pois não, doutor(a). O que precisa saber sobre este caso?`,
    dialogueOptions: dialogues.map((item, index) => ({
      id: `auto-${slugify(item.trigger || `pergunta-${index + 1}`)}`,
      question: humanizeTrigger(item.trigger),
      answer: item.text,
      timeCostMinutes: 10,
    })),
    ...(portraitSrc ? { portraitSrc } : {}),
  };
}

function buildNpcPrompt(caseData, need) {
  return [
    'Crie um NOVO NPC PERSISTENTE para o universo do jogo Rota da Justiça.',
    'Este NPC foi solicitado automaticamente porque o caso precisa de uma figura institucional recorrente e nenhum NPC publicado existente foi considerado compatível.',
    'O NPC deve ser reutilizável em casos futuros. NÃO coloque nas memórias-base fatos exclusivos deste processo, nomes da vítima, do réu ou detalhes que só fazem sentido neste caso.',
    'Em metadata inclua obrigatoriamente appearanceProfile com genderPresentation, ageRange, skinTone, hair, clothing, expression e notes.',
    'Crie uma aparência visual própria e distinta do restante do elenco: varie idade, rosto, pele, cabelo, vestimenta, acessórios discretos e postura de maneira profissional e coerente.',
    'Necessidade institucional:', JSON.stringify(need),
    'Contexto do caso apenas para compreender a função:', JSON.stringify({
      id: caseData.id,
      title: caseData.title,
      area: caseData.area,
      difficulty: caseData.difficulty,
      legalContext: caseData.content?.briefing?.legalContext,
    }),
  ].join('\n\n');
}

async function createNpcDraftForNeed(caseData, need, imageConfigured, warnings) {
  const generated = await generateStructured('npc', buildNpcPrompt(caseData, need));
  let npc = npcSchema.parse({ ...generated, status: 'draft' });
  npc = {
    ...npc,
    slug: await allocateUniqueNpcSlug(npc.slug || npc.name),
    metadata: {
      ...(npc.metadata || {}),
      origin: 'case-derived',
      sourceCaseId: caseData.id,
      sourceCaseTitle: caseData.title,
      sourceRoleInCase: need.roleInCase,
      sourceLocationId: need.locationId,
      createdAutomatically: true,
    },
    status: 'draft',
  };

  if (imageConfigured) {
    try {
      const portrait = await generateAndStorePortrait({
        prompt: buildNpcPortraitPrompt(npc),
        folder: 'persistent',
        slug: npc.slug,
      });
      npc.metadata = { ...npc.metadata, ...portrait, portraitStatus: 'generated' };
    } catch (error) {
      npc.metadata = { ...npc.metadata, portraitStatus: 'failed', portraitGenerationError: error.message };
      warnings.push(`Retrato do NPC ${npc.name} não foi gerado: ${error.message}`);
    }
  } else {
    npc.metadata = { ...npc.metadata, portraitStatus: 'pending' };
  }

  const id = await createDraft('npc', npc);
  return { id, npc };
}

async function mapLimit(items, limit, worker) {
  let cursor = 0;
  const runners = Array.from({ length: Math.max(1, Math.min(limit, items.length || 1)) }, async () => {
    while (true) {
      const index = cursor;
      cursor += 1;
      if (index >= items.length) return;
      await worker(items[index], index);
    }
  });
  await Promise.all(runners);
}

async function generateCaseCharacterPortraits(caseData, imageConfigured, warnings) {
  if (!imageConfigured) return 0;
  const items = [];
  for (const location of caseData.content?.locations || []) {
    for (const character of location.characters || []) {
      if (!character.portraitSrc && character.initialDialogue) items.push({ location, character });
    }
  }

  let generatedCount = 0;
  const concurrency = Math.max(1, Math.min(4, Number(process.env.ROTA_PORTRAIT_CONCURRENCY || 2)));
  await mapLimit(items, concurrency, async ({ location, character }) => {
    try {
      const portrait = await generateAndStorePortrait({
        prompt: buildCaseCharacterPortraitPrompt({ caseData, location, character }),
        folder: `cases/${caseData.id}`,
        slug: `${location.id}-${character.name}`,
      });
      character.portraitSrc = portrait.portraitSrc;
      character.portraitStoragePath = portrait.portraitStoragePath;
      character.portraitGeneratedAt = portrait.portraitGeneratedAt;
      generatedCount += 1;
    } catch (error) {
      warnings.push(`Retrato de ${character.name} (${location.name}) não foi gerado: ${error.message}`);
    }
  });
  return generatedCount;
}

function assignmentKey(item) {
  return `${item.npcSlug}::${item.roleInCase}`;
}

export async function automateGeneratedCaseAssets(caseInput, { publishedNpcs = null } = {}) {
  const caseData = clone(caseInput);
  const warnings = [];
  const generatedNpcDrafts = [];
  const reusedNpcAssignments = [];
  const imageConfigured = await hasImageGenerationConfigured();
  if (!imageConfigured) warnings.push('Geração de imagens não configurada: o caso foi criado, mas novos retratos ficaram pendentes. Configure um endpoint de imagem em Configurações → Inteligência Artificial.');

  const catalog = Array.isArray(publishedNpcs) ? publishedNpcs : await listPublishedNpcGenerationContext();
  const assignments = Array.isArray(caseData.content.npcAssignments) ? [...caseData.content.npcAssignments] : [];
  const existingKeys = new Set(assignments.map(assignmentKey));
  const usedSlugs = new Set(assignments.map(item => item.npcSlug));
  const needs = Array.isArray(caseData.content.npcNeeds) ? caseData.content.npcNeeds : [];
  let nextSort = assignments.reduce((max, item) => Math.max(max, Number(item.sortOrder || 0)), -1) + 1;

  for (const need of needs) {
    const alreadyCovered = assignments.some(item => item.roleInCase === need.roleInCase && item?.configuration?.locationId === need.locationId);
    if (alreadyCovered) continue;

    const reusable = findReusableCandidate(need, catalog, usedSlugs);
    if (reusable) {
      const assignment = {
        npcSlug: reusable.slug,
        roleInCase: need.roleInCase,
        isRequired: need.isRequired ?? true,
        sortOrder: nextSort++,
        configuration: { locationId: need.locationId },
      };
      const key = assignmentKey(assignment);
      if (!existingKeys.has(key)) {
        assignments.push(assignment);
        existingKeys.add(key);
        usedSlugs.add(reusable.slug);
        reusedNpcAssignments.push({ slug: reusable.slug, name: reusable.name, roleInCase: need.roleInCase, locationId: need.locationId });
      }
      continue;
    }

    const created = await createNpcDraftForNeed(caseData, need, imageConfigured, warnings);
    const assignment = {
      npcSlug: created.npc.slug,
      roleInCase: need.roleInCase,
      isRequired: need.isRequired ?? true,
      sortOrder: nextSort++,
      configuration: buildAssignmentConfiguration(created.npc, need),
    };
    const key = assignmentKey(assignment);
    if (!existingKeys.has(key)) {
      assignments.push(assignment);
      existingKeys.add(key);
      usedSlugs.add(created.npc.slug);
    }
    generatedNpcDrafts.push({
      id: created.id,
      slug: created.npc.slug,
      name: created.npc.name,
      roleInCase: need.roleInCase,
      locationId: need.locationId,
      portraitSrc: created.npc.metadata?.portraitSrc || '',
      requiresPublication: true,
    });
  }

  caseData.content.npcAssignments = assignments;
  caseData.content.npcNeeds = [];
  const localPortraitsGenerated = await generateCaseCharacterPortraits(caseData, imageConfigured, warnings);

  caseData.metadata = {
    ...(caseData.metadata || {}),
    automation: {
      ...(caseData.metadata?.automation || {}),
      generatedNpcDrafts,
      reusedNpcAssignments,
      localPortraitsGenerated,
      imageGenerationConfigured: imageConfigured,
      warnings,
      completedAt: new Date().toISOString(),
    },
  };

  return caseData;
}

export async function automateGeneratedNpcPortrait(npcInput) {
  const npc = clone(npcInput);
  npc.metadata = { ...(npc.metadata || {}) };
  if (npc.metadata.portraitSrc) return npc;

  const imageConfigured = await hasImageGenerationConfigured();
  if (!imageConfigured) {
    npc.metadata.portraitStatus = 'pending';
    return npc;
  }

  try {
    const portrait = await generateAndStorePortrait({
      prompt: buildNpcPortraitPrompt(npc),
      folder: 'persistent',
      slug: npc.slug || npc.name,
    });
    npc.metadata = { ...npc.metadata, ...portrait, portraitStatus: 'generated' };
  } catch (error) {
    npc.metadata = { ...npc.metadata, portraitStatus: 'failed', portraitGenerationError: error.message };
  }
  return npc;
}
