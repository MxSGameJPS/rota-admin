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

function safeId(value, fallback = 'case') {
  return String(value || fallback)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 90) || fallback;
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
  return message === 'EMPTY_RESPONSE'
    || message === 'INVALID_JSON'
    || error?.name === 'ZodError'
    || Array.isArray(error?.issues)
    || isTransientProviderError(error);
}

async function wait(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function requestStage({
  stage,
  systemPrompt,
  prompt,
  promptForAttempt = null,
  compactHint = '',
  validator = null,
  fallback = null,
}) {
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
      const effectivePrompt = typeof promptForAttempt === 'function' ? promptForAttempt(attempt) : prompt;
      const result = await generateWithDefaultProvider({
        prompt: effectivePrompt,
        systemPrompt: [systemPrompt, extra].filter(Boolean).join('\n\n'),
        timeoutMs: TIMEOUT_MS,
      });
      const parsed = parseJson(result.text);
      return typeof validator === 'function' ? validator(parsed) : parsed;
    } catch (error) {
      if (!isRetryable(error)) throw error;
      lastError = error;
      if (attempt < ATTEMPTS - 1) {
        const delay = isTransientProviderError(error) ? 1200 * (attempt + 1) : 350 * (attempt + 1);
        await wait(delay);
      }
    }
  }

  if (typeof fallback === 'function') {
    console.warn(`[Rota Admin] ${stage}: IA indisponível após ${ATTEMPTS} tentativas; usando fallback local do caso.`, lastError?.message || 'erro desconhecido');
    const fallbackValue = fallback(lastError);
    return typeof validator === 'function' ? validator(fallbackValue) : fallbackValue;
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
    proceduralStage: caseModel.proceduralStage || 'PRIMEIRA_INSTANCIA',
    courtName: caseModel.courtName || null,
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

function leanCaseContext(caseModel) {
  const content = caseModel.content || {};
  const clues = content.availableClues || [];
  const strategies = content.strategies || [];
  return {
    id: caseModel.id,
    title: caseModel.title,
    area: caseModel.area,
    difficulty: caseModel.difficulty,
    proceduralStage: caseModel.proceduralStage || 'PRIMEIRA_INSTANCIA',
    deadlineHours: caseModel.deadlineHours,
    objective: compactText(content.briefing?.mainObjective, 160),
    facts: (content.briefing?.facts || []).slice(0, 3).map((fact) => compactText(fact, 120)),
    clues: clues.slice(0, 6).map((clue) => ({
      id: clue.id,
      title: compactText(clue.title, 100),
      relevance: clue.relevance,
      isAuthentic: clue.isAuthentic,
      legalSignificance: compactText(clue.legalSignificance, 120),
    })),
    strategies: strategies.slice(0, 2).map((strategy) => ({
      id: strategy.id,
      title: compactText(strategy.title, 100),
      isOptimal: strategy.isOptimal,
      requiredCrucialClueIds: strategy.requiredCrucialClueIds || [],
    })),
    actors: (content.locations || []).flatMap((location) =>
      (location.characters || []).slice(0, 2).map((character) => ({ name: character.name, role: character.role })),
    ).slice(0, 5),
  };
}

function minimalCaseContext(caseModel) {
  const content = caseModel.content || {};
  return {
    id: caseModel.id,
    title: caseModel.title,
    area: caseModel.area,
    difficulty: caseModel.difficulty,
    proceduralStage: caseModel.proceduralStage || 'PRIMEIRA_INSTANCIA',
    objective: compactText(content.briefing?.mainObjective, 120),
    clues: (content.availableClues || []).slice(0, 4).map((clue) => ({
      id: clue.id,
      title: compactText(clue.title, 80),
      relevance: clue.relevance,
      isAuthentic: clue.isAuthentic,
    })),
  };
}

function cluePriority(clue) {
  let score = 0;
  if (clue?.relevance === 'crucial') score += 5;
  if (clue?.isAuthentic === false) score += 4;
  if (clue?.relevance === 'contraditoria') score += 3;
  if (clue?.relevance === 'complementar') score += 1;
  return score;
}

function chooseReactiveClue(caseModel) {
  return [...(caseModel?.content?.availableClues || [])]
    .sort((left, right) => cluePriority(right) - cluePriority(left))[0] || null;
}

function buildFallbackEvents(caseModel) {
  const clue = chooseReactiveClue(caseModel);
  const strategy = (caseModel?.content?.strategies || []).find((item) => item.isOptimal)
    || (caseModel?.content?.strategies || [])[0]
    || null;
  const subject = clue?.title || strategy?.title || caseModel.title || 'um elemento relevante do processo';
  const base = safeId(caseModel.id || caseModel.code || 'case');

  return {
    events: [{
      id: `${base}-reactive-review`,
      eyebrow: 'Intercorrência processual',
      title: `Nova decisão sobre ${compactText(subject, 74)}`,
      description: `Durante a preparação de ${compactText(caseModel.title, 90)}, surge uma necessidade de decisão relacionada a ${compactText(subject, 110)}. É preciso equilibrar segurança técnica e prazo processual.`,
      sourceLabel: clue?.title || 'Andamento do caso',
      relatedClueId: clue?.id || null,
      trigger: {
        minActions: Math.max(2, Math.min(6, Number(caseModel.difficultyStars || 2))),
        deadlineRatio: 0.55,
      },
      choices: [
        {
          id: `${base}-reactive-review-check`,
          label: 'Solicitar conferência complementar',
          description: 'Dedicar parte do prazo à verificação técnica do elemento antes de consolidar a estratégia.',
          scoreModifier: 2,
          timePenaltyHours: Math.min(3, Math.max(1, Math.round(Number(caseModel.deadlineHours || 48) * 0.03))),
          professionalRisk: 1,
          resolution: 'A conferência acrescenta segurança técnica e reduz o risco de sustentar a estratégia sobre um elemento frágil.',
        },
        {
          id: `${base}-reactive-review-keep`,
          label: 'Preservar o cronograma atual',
          description: 'Manter a estratégia já preparada e evitar consumir novas horas do prazo disponível.',
          scoreModifier: 0,
          timePenaltyHours: 0,
          professionalRisk: clue?.isAuthentic === false ? 5 : 3,
          resolution: 'O cronograma é preservado, mas a equipe assume o risco de descobrir tarde uma inconsistência que poderia ter sido conferida antes.',
        },
      ],
    }],
  };
}

function supportsFallbackHearing(caseModel) {
  const stage = caseModel.proceduralStage || 'PRIMEIRA_INSTANCIA';
  if (stage !== 'PRIMEIRA_INSTANCIA') return false;
  const locations = caseModel?.content?.locations || [];
  const characters = locations.flatMap((location) => location.characters || []);
  const hasTribunal = locations.some((location) => location.category === 'tribunal');
  const hasHearingActor = characters.some((character) => /testemunha|autor|reu|réu|vitima|vítima|cliente|perito/i.test(`${character.role || ''} ${character.name || ''}`));
  return hasTribunal || hasHearingActor;
}

function buildFallbackHearing(caseModel) {
  if (!supportsFallbackHearing(caseModel)) return { hearing: null };

  const content = caseModel.content || {};
  const clues = [...(content.availableClues || [])].sort((left, right) => cluePriority(right) - cluePriority(left));
  const firstClue = clues[0] || null;
  const secondClue = clues.find((clue) => clue.id !== firstClue?.id) || firstClue;
  const firstActor = (content.locations || []).flatMap((location) => location.characters || [])[0] || null;
  const base = safeId(caseModel.id || caseModel.code || 'case');
  const firstSubject = firstClue?.title || 'os fatos centrais apresentados pelas partes';
  const secondSubject = secondClue?.title || content.briefing?.mainObjective || 'o conjunto probatório disponível';

  return {
    hearing: {
      enabled: true,
      title: 'Audiência de instrução',
      intro: `A audiência exige decisões sobre os fatos e provas de ${compactText(caseModel.title, 100)} sem revelar antecipadamente qual estratégia terá melhor resultado.`,
      rounds: [
        {
          id: `${base}-hearing-facts`,
          speaker: firstActor?.name || 'Juízo',
          title: 'Esclarecimento dos fatos',
          prompt: `A manifestação coloca em discussão ${compactText(firstSubject, 120)}. Como conduzir este ponto preservando coerência com o restante do processo?`,
          relatedClueId: firstClue?.id || null,
          choices: [
            {
              id: `${base}-hearing-facts-cross`,
              label: 'Explorar a consistência do relato',
              explanation: 'Relacionar a manifestação aos elementos já documentados antes de avançar para a tese principal.',
              impact: 2,
            },
            {
              id: `${base}-hearing-facts-focus`,
              label: 'Concentrar na narrativa principal',
              explanation: 'Evitar ampliar o debate e preservar a linha argumentativa que já foi preparada para o caso.',
              impact: 0,
            },
          ],
        },
        {
          id: `${base}-hearing-evidence`,
          speaker: 'Juízo',
          title: 'Manifestação sobre a prova',
          prompt: `O juízo solicita posicionamento sobre ${compactText(secondSubject, 120)} e seu peso na solução do conflito. Qual abordagem adotar neste momento?`,
          relatedClueId: secondClue?.id || null,
          choices: [
            {
              id: `${base}-hearing-evidence-joint`,
              label: 'Pedir valoração conjunta das provas',
              explanation: 'Conectar o elemento discutido ao restante do conjunto probatório e à coerência da estratégia escolhida.',
              impact: 2,
            },
            {
              id: `${base}-hearing-evidence-thesis`,
              label: 'Sustentar somente a tese central',
              explanation: 'Manter a manifestação restrita ao fundamento principal para reduzir a abertura de novos pontos de controvérsia.',
              impact: 0,
            },
          ],
        },
      ],
    },
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

function buildEventsPrompt(context, adminInstruction = '') {
  return [
    'Crie somente as intercorrências específicas deste caso.',
    adminInstruction,
    'CASO:',
    JSON.stringify(context),
  ].filter(Boolean).join('\n\n');
}

function buildHearingPrompt(context, events, adminInstruction = '') {
  return [
    'Crie somente a audiência deste caso.',
    adminInstruction,
    'CASO:',
    JSON.stringify(context),
    'INTERCORRÊNCIAS JÁ EXISTENTES (use apenas como contexto narrativo):',
    JSON.stringify((events || []).map((event) => ({ id: event.id, title: event.title, relatedClueId: event.relatedClueId }))),
  ].filter(Boolean).join('\n\n');
}

function validateHearingReferences(hearing, caseModel) {
  if (!hearing) return hearing;
  const clueIds = new Set((caseModel?.content?.availableClues || []).map((clue) => clue.id));
  for (const round of hearing.rounds || []) {
    if (round.relatedClueId && !clueIds.has(round.relatedClueId)) {
      throw new Error(`A etapa de audiência ${round.id} referencia uma pista inexistente: ${round.relatedClueId}.`);
    }
  }
  return hearing;
}

export async function generateCaseReactiveEvents(caseModel, extraPrompt = '') {
  const contexts = [
    compactCaseContext(caseModel),
    leanCaseContext(caseModel),
    minimalCaseContext(caseModel),
    minimalCaseContext(caseModel),
  ];
  const adminInstruction = extraPrompt ? `ORIENTAÇÃO EXTRA DO ADMINISTRADOR: ${extraPrompt}` : '';
  const eventsStage = await requestStage({
    stage: 'intercorrências do caso',
    systemPrompt: eventsSystemPrompt(),
    promptForAttempt: (attempt) => buildEventsPrompt(contexts[Math.min(attempt, contexts.length - 1)], adminInstruction),
    compactHint: 'Use 1 ou 2 intercorrências, 2 escolhas por intercorrência e textos curtos.',
    validator: (raw) => caseReactiveEventsStageSchema.parse(raw),
    fallback: () => buildFallbackEvents(caseModel),
  });
  const validationShell = caseReactiveWorldSchema.parse({
    version: 1,
    events: eventsStage.events,
    hearing: null,
    generation: { eventsReady: true, hearingReady: false, eventsGeneratedAt: new Date().toISOString() },
  });
  validateReactiveWorldReferences(validationShell, caseModel);
  return eventsStage.events;
}

export async function generateCaseReactiveHearing(caseModel, events = [], extraPrompt = '') {
  const contexts = [
    compactCaseContext(caseModel),
    leanCaseContext(caseModel),
    minimalCaseContext(caseModel),
    minimalCaseContext(caseModel),
  ];
  const adminInstruction = extraPrompt ? `ORIENTAÇÃO EXTRA DO ADMINISTRADOR: ${extraPrompt}` : '';
  const hearingStage = await requestStage({
    stage: 'audiência do caso',
    systemPrompt: hearingSystemPrompt(),
    promptForAttempt: (attempt) => buildHearingPrompt(contexts[Math.min(attempt, contexts.length - 1)], events, adminInstruction),
    compactHint: 'Se houver audiência, use exatamente 2 etapas e 2 escolhas por etapa. Se não for necessária, retorne hearing null.',
    validator: (raw) => caseReactiveHearingStageSchema.parse(raw),
    fallback: () => buildFallbackHearing(caseModel),
  });
  return validateHearingReferences(hearingStage.hearing, caseModel);
}

export async function generateCaseReactiveWorld(caseModel, extraPrompt = '') {
  const events = await generateCaseReactiveEvents(caseModel, extraPrompt);
  const eventsGeneratedAt = new Date().toISOString();
  const hearing = await generateCaseReactiveHearing(caseModel, events, extraPrompt);
  const hearingGeneratedAt = new Date().toISOString();
  const parsed = caseReactiveWorldSchema.parse({
    version: 1,
    events,
    hearing,
    generation: {
      eventsReady: true,
      hearingReady: true,
      eventsGeneratedAt,
      hearingGeneratedAt,
    },
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
      generation: config.generation || null,
      source: 'reactive-world-generator',
    },
  });

  return { version: nextVersion, status: current.status };
}
