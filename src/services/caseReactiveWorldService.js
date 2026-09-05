import { getSupabaseAdmin } from '@/lib/supabase/server';
import { generateWithDefaultProvider } from '@/services/ai/providerService';
import {
  CASE_REACTIVE_EVENTS_STAGE_SCHEMA_JSON,
  CASE_REACTIVE_HEARING_STAGE_SCHEMA_JSON,
  caseReactiveEventsStageSchema,
  caseReactiveHearingStageSchema,
  caseReactiveWorldSchema,
  validateReactiveWorldReferences,
} from '@/schemas/caseReactiveWorld';

const TIMEOUT_MS = 300000;
const ATTEMPTS = 4;

function requireClient() {
  const client = getSupabaseAdmin();
  if (!client) throw new Error('Configure SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no .env.local.');
  return client;
}

function compactText(value, maxLength = 320) {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  if (text.length <= maxLength) return text;
  return `${text.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}

function parseJson(text) {
  const raw = String(text || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  if (!raw) throw new Error('EMPTY_RESPONSE');
  try { return JSON.parse(raw); } catch {}
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start >= 0 && end > start) {
    try { return JSON.parse(raw.slice(start, end + 1)); } catch {}
  }
  throw new Error('INVALID_JSON');
}

function isTransientProviderError(error) {
  const message = String(error?.message || '').toLowerCase();
  return [
    'http 429',
    'http 502',
    'http 503',
    'http 504',
    'tempo limite',
    'timeout',
    'socket',
    'econnreset',
    'etimedout',
    'fetch failed',
    'network',
  ].some((token) => message.includes(token));
}

function isRetryable(error) {
  const message = String(error?.message || '');
  return message === 'EMPTY_RESPONSE' || message === 'INVALID_JSON' || isTransientProviderError(error);
}

async function wait(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function requestStage({ stage, systemPrompt, prompt, compactHint = '' }) {
  const retryInstructions = [
    '',
    'A tentativa anterior falhou ou retornou JSON inválido. Refaça DO ZERO e retorne SOMENTE JSON válido, completo e fechado.',
    'MODO COMPACTO. Use o menor número de itens permitido e textos objetivos. Retorne SOMENTE JSON.',
    'ÚLTIMA TENTATIVA. JSON mínimo, completo e parseável. Sem markdown, comentários ou explicações.',
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
      if (!isRetryable(error)) throw error;
      lastError = error;
      if (attempt < ATTEMPTS - 1 && isTransientProviderError(error)) {
        await wait(1200 * (attempt + 1));
      }
    }
  }

  const message = String(lastError?.message || '');
  if (isTransientProviderError(lastError)) {
    throw new Error(`A IA não conseguiu concluir a etapa "${stage}" após ${ATTEMPTS} tentativas por instabilidade temporária do provedor/OmniRoute (${message}).`);
  }
  const reason = message === 'EMPTY_RESPONSE' ? 'resposta vazia' : 'JSON inválido ou truncado';
  throw new Error(`A IA não conseguiu concluir a etapa "${stage}" após ${ATTEMPTS} tentativas (${reason}).`);
}

function compactCaseContext(caseModel) {
  const content = caseModel.content || {};
  return {
    id: caseModel.id,
    code: caseModel.code,
    title: caseModel.title,
    area: caseModel.area,
    difficulty: caseModel.difficulty,
    deadlineHours: caseModel.deadlineHours,
    client: content.client ? {
      name: content.client.name,
      occupation: content.client.occupation,
      summary: compactText(content.client.summary, 220),
    } : null,
    briefing: content.briefing ? {
      facts: Array.isArray(content.briefing.facts)
        ? content.briefing.facts.slice(0, 6).map((fact) => compactText(fact, 180))
        : [],
      mainObjective: compactText(content.briefing.mainObjective, 220),
      legalContext: compactText(content.briefing.legalContext, 260),
    } : null,
    clues: (content.availableClues || []).slice(0, 10).map((clue) => ({
      id: clue.id,
      title: clue.title,
      type: clue.type,
      relevance: clue.relevance,
      isAuthentic: clue.isAuthentic,
      summary: compactText(clue.summary, 180),
      legalSignificance: compactText(clue.legalSignificance, 220),
    })),
    strategies: (content.strategies || []).slice(0, 5).map((strategy) => ({
      id: strategy.id,
      title: strategy.title,
      description: compactText(strategy.description, 220),
      isOptimal: strategy.isOptimal,
      requiredCrucialClueIds: strategy.requiredCrucialClueIds || [],
      incompatibleClueIds: strategy.incompatibleClueIds || [],
    })),
    characters: (content.locations || []).flatMap((location) =>
      (location.characters || []).slice(0, 3).map((character) => ({
        id: character.id,
        name: character.name,
        role: character.role,
        locationId: location.id,
      })),
    ).slice(0, 10),
    npcAssignments: (content.npcAssignments || []).slice(0, 8).map((item) => ({
      npcSlug: item?.npcSlug,
      roleInCase: item?.roleInCase,
      locationId: item?.configuration?.locationId,
    })),
  };
}

function eventsSystemPrompt() {
  return [
    'Você cria conteúdo jogável para o Rota da Justiça.',
    'Crie SOMENTE as INTERCORRÊNCIAS específicas deste caso. A audiência será criada em outra etapa.',
    'Retorne somente JSON válido, sem markdown e sem texto fora do JSON.',
    'Crie de 1 a 4 intercorrências ligadas aos fatos, pessoas, documentos, riscos ou contradições reais do caso recebido.',
    'Distribua trigger.minActions entre 2 e 8. trigger.deadlineRatio pode ser null ou valor entre 0 e 1 quando o evento fizer sentido perto do prazo.',
    'Cada escolha deve ser profissionalmente plausível e não deve indicar visualmente qual é a melhor.',
    'scoreModifier positivo fortalece a preparação; negativo enfraquece. timePenaltyHours consome prazo. professionalRisk mede risco profissional.',
    'relatedClueId deve ser um ID de pista existente ou null. Nunca invente ID.',
    'JSON Schema obrigatório:',
    JSON.stringify(CASE_REACTIVE_EVENTS_STAGE_SCHEMA_JSON),
  ].join('\n\n');
}

function hearingSystemPrompt() {
  return [
    'Você cria conteúdo jogável para o Rota da Justiça.',
    'Crie SOMENTE a AUDIÊNCIA específica deste caso.',
    'Retorne somente JSON válido, sem markdown e sem texto fora do JSON.',
    'Se o caso não justificar audiência oral relevante, retorne {"hearing":null}.',
    'Quando houver audiência, crie de 2 a 4 etapas diretamente ligadas ao caso: confronto de depoimento, escolha de prova, impugnação, pergunta a pessoa específica ou manifestação final.',
    'Cada etapa deve exigir decisão real do jogador. impact positivo representa condução tecnicamente melhor; negativo representa erro ou perda de credibilidade.',
    'relatedClueId deve ser um ID de pista existente ou null. Nunca invente ID.',
    'JSON Schema obrigatório:',
    JSON.stringify(CASE_REACTIVE_HEARING_STAGE_SCHEMA_JSON),
  ].join('\n\n');
}

export async function generateCaseReactiveWorld(caseModel, extraPrompt = '') {
  const context = compactCaseContext(caseModel);
  const adminInstruction = extraPrompt ? `ORIENTAÇÃO EXTRA DO ADMINISTRADOR: ${extraPrompt}` : '';

  const rawEvents = await requestStage({
    stage: 'intercorrências do caso',
    systemPrompt: eventsSystemPrompt(),
    prompt: [
      'Crie somente as intercorrências específicas deste caso.',
      adminInstruction,
      'CASO:',
      JSON.stringify(context),
    ].filter(Boolean).join('\n\n'),
    compactHint: 'Use 1 ou 2 intercorrências, 2 escolhas por intercorrência e textos curtos.',
  });
  const eventsStage = caseReactiveEventsStageSchema.parse(rawEvents);

  const rawHearing = await requestStage({
    stage: 'audiência do caso',
    systemPrompt: hearingSystemPrompt(),
    prompt: [
      'Crie somente a audiência deste caso.',
      adminInstruction,
      'CASO:',
      JSON.stringify(context),
      'INTERCORRÊNCIAS JÁ CRIADAS (use apenas como contexto narrativo):',
      JSON.stringify(eventsStage.events.map((event) => ({ id: event.id, title: event.title, relatedClueId: event.relatedClueId }))),
    ].filter(Boolean).join('\n\n'),
    compactHint: 'Se houver audiência, use exatamente 2 etapas e 2 escolhas por etapa. Se não for necessária, retorne hearing null.',
  });
  const hearingStage = caseReactiveHearingStageSchema.parse(rawHearing);

  const parsed = caseReactiveWorldSchema.parse({
    version: 1,
    events: eventsStage.events,
    hearing: hearingStage.hearing,
  });
  return validateReactiveWorldReferences(parsed, caseModel);
}

async function snapshotPublishedVersionIfNeeded(client, caseId, version, current) {
  const { data: existing, error: lookupError } = await client
    .from('content_versions')
    .select('id')
    .eq('entity_type', 'case')
    .eq('entity_id', String(caseId))
    .eq('version', version)
    .maybeSingle();
  if (lookupError) throw lookupError;
  if (existing) return;

  const { error: versionError } = await client.from('content_versions').insert({
    entity_type: 'case',
    entity_id: String(caseId),
    version,
    snapshot: current,
  });
  if (versionError) throw versionError;
}

export async function saveCaseReactiveWorld(caseId, config) {
  const client = requireClient();
  const { data: current, error: readError } = await client.from('cases').select('*').eq('id', caseId).single();
  if (readError) throw readError;

  const metadata = { ...(current.metadata || {}), reactiveWorld: config };
  const currentVersion = Number(current.version || 1);
  const nextVersion = current.status === 'published' ? currentVersion + 1 : currentVersion;

  if (current.status === 'published') {
    await snapshotPublishedVersionIfNeeded(client, caseId, currentVersion, current);
  }

  const { error: updateError } = await client
    .from('cases')
    .update({
      metadata,
      version: nextVersion,
      ...(current.status === 'published' ? { published_at: new Date().toISOString() } : {}),
    })
    .eq('id', caseId);
  if (updateError) throw updateError;

  await client.from('admin_audit_logs').insert({
    action: 'update_case_reactive_world',
    entity_type: 'case',
    entity_id: String(caseId),
    payload: {
      version: nextVersion,
      events: config.events.length,
      hearingRounds: config.hearing?.rounds?.length || 0,
      source: 'ai-generator',
    },
  });

  return { version: nextVersion, status: current.status };
}
