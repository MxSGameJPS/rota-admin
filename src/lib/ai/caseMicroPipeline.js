import { caseSchema } from '@/schemas/contracts';
import { casePlanSchema, caseLocationDetailSchema, CASE_LOCATION_SCHEMA_JSON } from '@/schemas/caseGeneration';
import {
  caseCoreStageSchema,
  caseCluesStageSchema,
  caseStrategiesStageSchema,
  caseNpcStageSchema,
  CASE_CORE_STAGE_SCHEMA_JSON,
  CASE_CLUES_STAGE_SCHEMA_JSON,
  CASE_STRATEGIES_STAGE_SCHEMA_JSON,
  CASE_NPC_STAGE_SCHEMA_JSON,
} from '@/schemas/caseGenerationStages';
import { generateWithDefaultProvider } from '@/services/ai/providerService';
import { normalizeLocationReferences } from './referenceNormalizer';

const TIMEOUT_MS = 300000;
const ATTEMPTS = 4;
const OPTIONAL_REFERENCE_KEYS = new Set([
  'requiredClueOrDialogToUnlock',
  'revealsClueId',
  'unlocksLocationId',
  'foundClueId',
]);

function compactText(value, maxLength = 320) {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  if (text.length <= maxLength) return text;
  return `${text.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}

function normalizeOptionalReferences(value) {
  if (Array.isArray(value)) return value.map(normalizeOptionalReferences);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value).flatMap(([key, child]) => {
      if (OPTIONAL_REFERENCE_KEYS.has(key) && (child == null || (typeof child === 'string' && child.trim() === ''))) return [];
      return [[key, normalizeOptionalReferences(child)]];
    }),
  );
}

function parseJson(text) {
  const raw = String(text || '').trim();
  if (!raw) throw new Error('EMPTY_RESPONSE');
  const clean = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  try { return JSON.parse(clean); } catch {}
  const first = clean.indexOf('{');
  const last = clean.lastIndexOf('}');
  if (first >= 0 && last > first) {
    try { return JSON.parse(clean.slice(first, last + 1)); } catch {}
  }
  throw new Error('INVALID_JSON');
}

function retryable(error) {
  const message = String(error?.message || '');
  return message === 'INVALID_JSON' || message === 'EMPTY_RESPONSE';
}

async function requestStage({ stage, systemPrompt, prompt, compactHint = '' }) {
  const retryInstructions = [
    '',
    'A resposta anterior veio vazia ou inválida. Refaça DO ZERO. Retorne SOMENTE JSON válido, completo e fechado.',
    'MODO COMPACTO. Use o menor número de itens permitido e textos objetivos. Retorne SOMENTE JSON válido.',
    'ÚLTIMA TENTATIVA. JSON mínimo, completo e parseável. Sem markdown, sem comentários e sem texto ornamental.',
  ];

  let lastError = null;
  for (let attempt = 0; attempt < ATTEMPTS; attempt += 1) {
    try {
      const extra = [retryInstructions[attempt], attempt > 0 ? compactHint : ''].filter(Boolean).join('\n');
      const result = await generateWithDefaultProvider({
        prompt,
        systemPrompt: [systemPrompt, extra].filter(Boolean).join('\n\n'),
        timeoutMs: TIMEOUT_MS,
      });
      return parseJson(result.text);
    } catch (error) {
      if (!retryable(error)) throw error;
      lastError = error;
    }
  }

  const reason = String(lastError?.message || '') === 'EMPTY_RESPONSE'
    ? 'resposta vazia'
    : 'JSON truncado ou inválido';
  throw new Error(`A IA não conseguiu concluir a microetapa "${stage}" após ${ATTEMPTS} tentativas (${reason}).`);
}

function compactRepairContext(context = {}) {
  const source = context.repairCase;
  if (!source || typeof source !== 'object') return null;
  const content = source.content || {};
  return {
    title: source.title,
    area: source.area,
    difficulty: source.difficulty,
    client: content.client ? {
      name: content.client.name,
      occupation: content.client.occupation,
      summary: compactText(content.client.summary, 220),
    } : undefined,
    briefing: content.briefing ? {
      facts: Array.isArray(content.briefing.facts) ? content.briefing.facts.slice(0, 6).map((item) => compactText(item, 160)) : [],
      mainObjective: compactText(content.briefing.mainObjective, 220),
      legalContext: compactText(content.briefing.legalContext, 240),
    } : undefined,
    locations: Array.isArray(content.locations)
      ? content.locations.slice(0, 4).map((location) => ({
          name: location.name,
          category: location.category,
          characters: Array.isArray(location.characters)
            ? location.characters.slice(0, 3).map((character) => ({ name: character.name, role: character.role }))
            : [],
        }))
      : [],
  };
}

function compactNpcCatalog(context = {}) {
  const items = Array.isArray(context.publishedNpcs) ? context.publishedNpcs : [];
  return items.slice(0, 40).map((npc) => ({
    slug: npc.slug,
    name: npc.name,
    roleType: npc.roleType,
    profession: npc.profession,
    specialization: npc.specialization,
    jurisdiction: npc.jurisdiction,
    usageCount: Number(npc.usageCount || 0),
  }));
}

function buildCoreSystem(context) {
  const repair = compactRepairContext(context);
  return [
    'Você cria a MICROETAPA 1 de um caso jogável do Rota da Justiça: NÚCLEO E LOCAIS.',
    'Retorne SOMENTE JSON válido conforme o schema.',
    'Crie somente identidade do caso, cliente, briefing e 2 a 4 locais. NÃO crie pistas, estratégias, NPCs, personagens locais, diálogos ou searchables.',
    'Todos os locais desta microetapa devem usar unlockedByDefault=true e OMITIR requiredClueOrDialogToUnlock; os bloqueios serão calculados depois que as pistas existirem.',
    'Use fatos jurídicos plausíveis e uma premissa que permita investigação e escolhas reais.',
    'Mantenha textos curtos: 2 a 5 fatos, descrição objetiva e contexto jurídico suficiente para as próximas microetapas.',
    repair ? 'ESTE É UM REPARO: preserve a identidade narrativa, nomes centrais, área e premissa do caso atual.' : '',
    repair ? `RESUMO DO CASO ATUAL: ${JSON.stringify(repair)}` : '',
    `JSON Schema: ${JSON.stringify(CASE_CORE_STAGE_SCHEMA_JSON)}`,
  ].filter(Boolean).join('\n\n');
}

function buildCluesSystem(core) {
  const locations = core.content.locations.map((item) => ({ id: item.id, name: item.name, category: item.category }));
  return [
    'Você cria a MICROETAPA 2 de um caso jogável do Rota da Justiça: PISTAS.',
    'Retorne SOMENTE JSON válido conforme o schema.',
    'Crie 4 a 8 pistas distribuídas somente entre os locais informados. locationFoundId deve ser um ID existente.',
    'Inclua pistas cruciais e complementares; em casos Intermediário/Avançado/Complexo, inclua também material irrelevante, contraditório ou inautêntico quando juridicamente plausível.',
    'Nenhuma prova inautêntica pode ser indispensável para a solução correta.',
    'Textos devem ser objetivos, mas fullDetail e legalSignificance precisam explicar por que o item importa.',
    `CASO: ${JSON.stringify({ title: core.title, area: core.area, difficulty: core.difficulty, client: core.content.client, briefing: core.content.briefing })}`,
    `LOCAIS VÁLIDOS: ${JSON.stringify(locations)}`,
    `JSON Schema: ${JSON.stringify(CASE_CLUES_STAGE_SCHEMA_JSON)}`,
  ].join('\n\n');
}

function buildStrategiesSystem(core, clues) {
  const clueIndex = clues.availableClues.map((item) => ({
    id: item.id,
    title: item.title,
    relevance: item.relevance,
    isAuthentic: item.isAuthentic,
    legalSignificance: compactText(item.legalSignificance, 180),
  }));
  return [
    'Você cria a MICROETAPA 3 de um caso jogável do Rota da Justiça: ESTRATÉGIAS.',
    'Retorne SOMENTE JSON válido conforme o schema.',
    'Crie 2 a 4 estratégias juridicamente distintas. Exatamente uma deve ser claramente ótima para os fatos, salvo quando o caso justificar duas vias equivalentes.',
    'requiredCrucialClueIds e incompatibleClueIds só podem usar IDs existentes na lista de pistas.',
    'Nunca exija prova isAuthentic=false para a estratégia ótima.',
    `CASO: ${JSON.stringify({ title: core.title, area: core.area, difficulty: core.difficulty, briefing: core.content.briefing })}`,
    `PISTAS: ${JSON.stringify(clueIndex)}`,
    `JSON Schema: ${JSON.stringify(CASE_STRATEGIES_STAGE_SCHEMA_JSON)}`,
  ].join('\n\n');
}

function buildNpcSystem(core, clues, context) {
  const catalog = compactNpcCatalog(context);
  const locations = core.content.locations.map((item) => ({ id: item.id, name: item.name }));
  const clueIds = clues.availableClues.map((item) => item.id);
  return [
    'Você cria a MICROETAPA 4 de um caso jogável do Rota da Justiça: NPCs PERSISTENTES.',
    'Retorne SOMENTE JSON válido conforme o schema.',
    'Use NPC persistente apenas para figuras institucionais recorrentes, como juiz, promotor, delegado, perito, oficial de justiça ou representante da OAB.',
    'Cliente, vítima, réu, testemunha, familiar, funcionário e outros personagens exclusivos do caso NÃO entram aqui; serão characters locais na próxima etapa.',
    'Se houver NPC compatível no catálogo, use exatamente o npcSlug dele. Se faltar uma função institucional realmente necessária, descreva-a em npcNeeds.',
    'configuration.locationId e npcNeeds.locationId devem usar somente IDs de locais existentes. Referências a pistas em dialogueOptions só podem usar IDs fornecidos.',
    'Se nenhum NPC persistente for necessário, retorne arrays vazios.',
    `CASO: ${JSON.stringify({ title: core.title, area: core.area, difficulty: core.difficulty })}`,
    `LOCAIS: ${JSON.stringify(locations)}`,
    `PISTAS VÁLIDAS: ${JSON.stringify(clueIds)}`,
    `CATÁLOGO DE NPCs: ${JSON.stringify(catalog)}`,
    `JSON Schema: ${JSON.stringify(CASE_NPC_STAGE_SCHEMA_JSON)}`,
  ].join('\n\n');
}

function applyDeterministicUnlocks(locations, clues) {
  if (locations.length <= 2) {
    return locations.map((item) => ({ ...item, unlockedByDefault: true, requiredClueOrDialogToUnlock: undefined }));
  }

  return locations.map((item, index) => {
    if (index < 2) return { ...item, unlockedByDefault: true, requiredClueOrDialogToUnlock: undefined };
    const earlierIds = new Set(locations.slice(0, index).map((location) => location.id));
    const unlockClue = clues.find((clue) =>
      earlierIds.has(clue.locationFoundId) && clue.isAuthentic && clue.relevance !== 'irrelevante'
    );
    if (!unlockClue) return { ...item, unlockedByDefault: true, requiredClueOrDialogToUnlock: undefined };
    return { ...item, unlockedByDefault: false, requiredClueOrDialogToUnlock: unlockClue.id };
  });
}

function buildLocationSystem(plan, skeleton, context = {}) {
  const allLocations = plan.content.locations.map((item) => ({ id: item.id, name: item.name, unlockedByDefault: item.unlockedByDefault }));
  const clueIndex = plan.content.availableClues.map((item) => ({ id: item.id, title: item.title, locationFoundId: item.locationFoundId }));
  const localClues = plan.content.availableClues
    .filter((item) => item.locationFoundId === skeleton.id)
    .map((item) => ({
      id: item.id,
      title: item.title,
      type: item.type,
      relevance: item.relevance,
      isAuthentic: item.isAuthentic,
      summary: compactText(item.summary, 200),
      fullDetail: compactText(item.fullDetail, 320),
      legalSignificance: compactText(item.legalSignificance, 220),
    }));
  const persistentHere = {
    assignments: plan.content.npcAssignments.filter((item) => item?.configuration?.locationId === skeleton.id),
    needs: plan.content.npcNeeds.filter((item) => item?.locationId === skeleton.id),
  };
  const repair = compactRepairContext(context);

  return [
    'Você cria a MICROETAPA 5 de um caso jogável do Rota da Justiça: DETALHES DE UM ÚNICO LOCAL.',
    'Retorne SOMENTE JSON válido conforme o schema.',
    'Preserve todos os campos do LOCAL FIXO exatamente como recebidos e preencha somente characters e searchables.',
    'Use normalmente 1 character local e 1 a 3 searchables; adicione um segundo character apenas se necessário para a história.',
    'Todo character precisa de appearanceProfile completo. Não gere portraitSrc nem campos de armazenamento de retrato.',
    `Todos os IDs novos devem começar com "${skeleton.id}-".`,
    'foundClueId e revealsClueId só podem usar IDs das pistas listadas. unlocksLocationId só pode usar IDs dos locais listados.',
    'As pistas deste local precisam ser descobríveis por diálogo ou searchable sempre que fizer sentido.',
    'Não duplique como character os NPCs persistentes já vinculados a este local.',
    repair ? 'Em reparo de caso existente, preserve nomes e papéis centrais quando forem coerentes.' : '',
    repair ? `RESUMO ORIGINAL: ${JSON.stringify(repair)}` : '',
    `CASO: ${JSON.stringify({ title: plan.title, area: plan.area, difficulty: plan.difficulty, client: plan.content.client, briefing: plan.content.briefing })}`,
    `LOCAL FIXO: ${JSON.stringify(skeleton)}`,
    `TODOS OS LOCAIS: ${JSON.stringify(allLocations)}`,
    `ÍNDICE DE PISTAS: ${JSON.stringify(clueIndex)}`,
    `PISTAS DESTE LOCAL: ${JSON.stringify(localClues)}`,
    `NPCs PERSISTENTES DESTE LOCAL: ${JSON.stringify(persistentHere)}`,
    `JSON Schema: ${JSON.stringify(CASE_LOCATION_SCHEMA_JSON)}`,
  ].filter(Boolean).join('\n\n');
}

export async function generateCaseMicroStructured(prompt, context = {}) {
  const rawCore = await requestStage({
    stage: 'núcleo e locais',
    systemPrompt: buildCoreSystem(context),
    prompt,
    compactHint: 'Use 2 locais, 2 ou 3 fatos e frases curtas. Todos os locais devem começar desbloqueados.',
  });
  const core = caseCoreStageSchema.parse(normalizeOptionalReferences(rawCore));

  const rawClues = await requestStage({
    stage: 'pistas',
    systemPrompt: buildCluesSystem(core),
    prompt: 'Crie somente as pistas deste caso.',
    compactHint: 'Use exatamente 4 pistas e textos curtos.',
  });
  const clues = caseCluesStageSchema.parse(normalizeOptionalReferences(rawClues));

  const rawStrategies = await requestStage({
    stage: 'estratégias',
    systemPrompt: buildStrategiesSystem(core, clues),
    prompt: 'Crie somente as estratégias deste caso.',
    compactHint: 'Use exatamente 2 estratégias e justificativas curtas.',
  });
  const strategies = caseStrategiesStageSchema.parse(normalizeOptionalReferences(rawStrategies));

  let npcPlan = { npcAssignments: [], npcNeeds: [] };
  let npcFallback = false;
  try {
    const rawNpcPlan = await requestStage({
      stage: 'planejamento de NPCs persistentes',
      systemPrompt: buildNpcSystem(core, clues, context),
      prompt: 'Defina somente NPCs persistentes necessários para este caso.',
      compactHint: 'Se houver dúvida, retorne npcAssignments e npcNeeds vazios.',
    });
    npcPlan = caseNpcStageSchema.parse(normalizeOptionalReferences(rawNpcPlan));
  } catch {
    npcFallback = true;
  }

  const locationsWithUnlocks = applyDeterministicUnlocks(core.content.locations, clues.availableClues);
  const plan = casePlanSchema.parse(normalizeOptionalReferences({
    ...core,
    status: 'draft',
    metadata: {
      ...(core.metadata || {}),
      aiGenerationPipeline: 'micro-stages-v2',
      ...(npcFallback ? { aiNpcPlanningFallback: true } : {}),
    },
    content: {
      ...core.content,
      locations: locationsWithUnlocks,
      availableClues: clues.availableClues,
      strategies: strategies.strategies,
      npcAssignments: npcPlan.npcAssignments,
      npcNeeds: npcPlan.npcNeeds,
      socialJuridicoTools: [],
      minimumPassingScore: strategies.minimumPassingScore,
    },
  }));

  const detailedLocations = [];
  for (const skeleton of plan.content.locations) {
    const rawLocation = await requestStage({
      stage: `detalhamento do local ${skeleton.name}`,
      systemPrompt: buildLocationSystem(plan, skeleton, context),
      prompt: `Complete somente o local ${skeleton.id} (${skeleton.name}).`,
      compactHint: 'Use 1 character, até 2 dialogueOptions e até 3 searchables. Textos curtos.',
    });
    const parsedLocation = caseLocationDetailSchema.parse(normalizeOptionalReferences(rawLocation));
    const reconciled = normalizeLocationReferences(parsedLocation, plan);
    detailedLocations.push({
      ...reconciled,
      ...skeleton,
      characters: reconciled.characters,
      searchables: reconciled.searchables,
    });
  }

  return caseSchema.parse(normalizeOptionalReferences({
    ...plan,
    status: 'draft',
    content: {
      ...plan.content,
      locations: detailedLocations,
    },
  }));
}
