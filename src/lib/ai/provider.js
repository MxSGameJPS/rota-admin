import { getAIContract, caseSchema } from '@/schemas/contracts';
import { casePlanSchema, caseLocationDetailSchema, CASE_PLAN_SCHEMA_JSON, CASE_LOCATION_SCHEMA_JSON } from '@/schemas/caseGeneration';
import { generateTemplate } from './templates';
import { normalizeLocationReferences } from './referenceNormalizer';
import { generateWithDefaultProvider } from '@/services/ai/providerService';

const STRUCTURED_GENERATION_TIMEOUT_MS = 300000;
const STRUCTURED_GENERATION_ATTEMPTS = 4;
const OPTIONAL_CASE_REFERENCE_KEYS = new Set([
  'requiredClueOrDialogToUnlock',
  'revealsClueId',
  'unlocksLocationId',
  'foundClueId',
]);

function normalizeCaseOptionalReferences(value) {
  if (Array.isArray(value)) return value.map(normalizeCaseOptionalReferences);
  if (!value || typeof value !== 'object') return value;

  return Object.fromEntries(
    Object.entries(value).flatMap(([key, child]) => {
      if (OPTIONAL_CASE_REFERENCE_KEYS.has(key) && typeof child === 'string' && child.trim() === '') return [];
      return [[key, normalizeCaseOptionalReferences(child)]];
    }),
  );
}

function compactAiText(value, maxLength = 360) {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  if (text.length <= maxLength) return text;
  return `${text.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}

function compactNpcCatalog(publishedNpcs) {
  return publishedNpcs.map((npc) => ({
    slug: npc.slug,
    name: npc.name,
    roleType: npc.roleType,
    profession: npc.profession,
    specialization: npc.specialization,
    jurisdiction: npc.jurisdiction,
    usageCount: Number(npc.usageCount || 0),
    professionalProfile: compactAiText(JSON.stringify(npc.professionalProfile || {}), 480),
    personality: compactAiText(JSON.stringify(npc.personality || {}), 320),
    hasPortrait: Boolean(npc.hasPortrait),
  }));
}

function buildCaseNpcRules(context = {}) {
  const publishedNpcs = Array.isArray(context.publishedNpcs) ? context.publishedNpcs : [];
  const compactNpcs = compactNpcCatalog(publishedNpcs);
  return [
    'REGRA CRÍTICA SOBRE NPCs PERSISTENTES EM CASOS:',
    '- Antes de definir content.npcAssignments ou content.npcNeeds, ANALISE ATIVAMENTE o catálogo de NPCs persistentes publicados abaixo.',
    '- Compare o caso planejado com roleType, profession, specialization, jurisdiction, professionalProfile e personality de cada NPC.',
    '- Se existir NPC persistente que se encaixe NATURALMENTE em uma função institucional/recorrente do caso, REUTILIZE esse NPC em content.npcAssignments.',
    '- Todo npcAssignment deve indicar configuration.locationId com o ID EXATO de um local do próprio caso onde o NPC aparecerá.',
    '- Sempre que possível, configuration também deve trazer initialDialogue e dialogueOptions específicos deste caso. Cada dialogueOption pode usar question, answer, timeCostMinutes e, somente quando coerente, revealsClueId ou unlocksLocationId existentes.',
    '- Exemplos apropriados para NPC persistente: juiz, desembargador, promotor, procurador, delegado, investigador recorrente, defensor, perito, oficial de justiça, servidor relevante, representante da OAB ou outra figura institucional que possa reaparecer.',
    '- Cliente, réu, vítima, suspeito, testemunhas, familiares, empregados, vizinhos e personagens exclusivos daquela história continuam como characters locais e NÃO devem virar NPC persistente.',
    '- Se o caso NECESSITAR de uma figura institucional recorrente e NÃO existir NPC publicado realmente compatível, NÃO recuse o caso e NÃO invente um npcSlug. Preencha content.npcNeeds descrevendo exatamente o NPC que falta.',
    '- Cada npcNeed deve conter roleType, profession, specialization, jurisdiction, roleInCase, locationId, reason e isRequired. locationId deve existir no caso.',
    '- O Admin usará npcNeeds para criar automaticamente o NPC em draft, gerar seu retrato e vinculá-lo ao caso. Portanto use npcNeeds somente para funções genuinamente persistentes.',
    '- Se dois ou mais NPCs existentes forem igualmente adequados, prefira o de menor usageCount para distribuir melhor o elenco, salvo quando continuidade narrativa justificar reutilizar alguém mais frequente.',
    '- Quando usar npcAssignments, use SOMENTE npcSlug existente no catálogo publicado abaixo. Nunca invente slug em npcAssignments.',
    '- Não force NPC incompatível só para evitar npcNeeds. Coerência jurídica e narrativa tem prioridade.',
    publishedNpcs.length
      ? 'CATÁLOGO DE NPCs PUBLICADOS DISPONÍVEIS PARA AVALIAÇÃO (resumido para economizar contexto):'
      : 'CATÁLOGO DE NPCs PUBLICADOS: vazio. Se uma função persistente for necessária, use npcNeeds.',
    JSON.stringify(compactNpcs),
  ].join('\n');
}

function buildExamRules(entityType, context = {}) {
  if (entityType === 'exam') {
    const preset = context.preset || {};
    return [
      'REGRA CRÍTICA SOBRE PROVAS GERADAS:',
      '- Esta é uma NOVA prova simulada produzida para o Rota da Justiça, não uma prova oficial.',
      `- examType deve ser exatamente: ${preset.id || context.examType || 'o tipo informado'}.`,
      `- questionCount deve ser exatamente: ${preset.questionCount || context.questionCount}.`,
      `- passingScore deve ser exatamente: ${context.passingScore}.`,
      `- durationMinutes deve ser exatamente: ${context.durationMinutes}.`,
      `- targetLevel deve ser exatamente: ${context.targetLevel ?? 'null'}.`,
      '- Não altere os parâmetros estruturais definidos pelo administrador.',
      '- Para OAB, use a referência apenas para distribuição de matérias e nível; não copie nem reescreva de perto questões oficiais.',
      `INSTRUÇÕES DO TIPO: ${preset.instructions || ''}`,
      'ESCOPO DE REFERÊNCIA:', JSON.stringify(preset.scopeSummary || []),
      'REGRAS DE ELEGIBILIDADE:', JSON.stringify(preset.eligibility || {}),
    ].join('\n');
  }
  if (entityType === 'examQuestionBatch') {
    return [
      'LOTE DE QUESTÕES - REGRAS OBRIGATÓRIAS:',
      '- Retorne exatamente uma questão para cada item de expectedQuestions.',
      '- number deve coincidir exatamente com expectedQuestions.',
      '- Se expectedQuestions informar area, use exatamente essa área; se area for null, escolha uma área jurídica coerente com a prova.',
      '- Quatro alternativas A, B, C e D, sem repetição; somente uma correta.',
      '- Enunciados, personagens e situações devem ser originais.',
      '- Não copie ou parafraseie de perto qualquer prova usada como referência.',
      'QUESTÕES ESPERADAS NESTE LOTE:', JSON.stringify(context.expectedQuestions || []),
      'DADOS DA PROVA:', JSON.stringify(context.exam || {}),
    ].join('\n');
  }
  return '';
}

function buildSystemPrompt(contract, entityType, context) {
  const extraRules = entityType === 'case' ? buildCaseNpcRules(context) : buildExamRules(entityType, context);
  return [
    'Você é o gerador de conteúdo oficial do Rota da Justiça.',
    'Retorne SOMENTE JSON válido. Não use markdown, comentários ou texto fora do JSON.',
    'Obedeça integralmente ao JSON Schema fornecido.',
    contract.instructions, extraRules,
    'JSON Schema obrigatório:', JSON.stringify(contract.jsonSchema),
  ].filter(Boolean).join('\n\n');
}

function parseStructuredText(text) {
  const raw = String(text || '').trim();
  if (!raw) throw new Error('EMPTY_RESPONSE');
  const withoutFence = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  try { return JSON.parse(withoutFence); } catch {}
  const first = withoutFence.indexOf('{'); const last = withoutFence.lastIndexOf('}');
  if (first >= 0 && last > first) { try { return JSON.parse(withoutFence.slice(first, last + 1)); } catch {} }
  throw new Error('INVALID_JSON');
}

function isRetryableStructuredError(error) {
  const message = String(error?.message || '');
  return message === 'INVALID_JSON' || message === 'EMPTY_RESPONSE';
}

async function requestParsedJson({ systemPrompt, prompt, retryHint, stage = 'conteúdo estruturado' }) {
  const run = async (extra = '') => {
    const result = await generateWithDefaultProvider({
      prompt,
      systemPrompt: [systemPrompt, extra].filter(Boolean).join('\n\n'),
      timeoutMs: STRUCTURED_GENERATION_TIMEOUT_MS,
    });
    return parseStructuredText(result.text);
  };

  const retryInstructions = [
    '',
    [
      'ATENÇÃO: a resposta anterior veio vazia ou não formou JSON válido, possivelmente por excesso de texto ou truncamento.',
      'Tente novamente DO ZERO. Seja mais conciso nos textos narrativos, mas NÃO omita campos obrigatórios.',
      'Feche corretamente todos os objetos e arrays. Retorne somente JSON.',
      retryHint || '',
    ].filter(Boolean).join('\n'),
    [
      'MODO COMPACTO OBRIGATÓRIO.',
      'A resposta anterior ainda não pôde ser validada.',
      'Gere novamente DO ZERO e priorize validade estrutural sobre riqueza textual.',
      'Use arrays próximos do menor tamanho permitido pelo schema e frases objetivas.',
      'Não repita explicações, contexto, markdown ou comentários.',
      'Mantenha cada campo narrativo o mais curto possível, sem violar os mínimos do schema.',
      retryHint || '',
    ].filter(Boolean).join('\n'),
    [
      'ÚLTIMA TENTATIVA — JSON MÍNIMO E COMPLETO.',
      'Retorne somente um objeto JSON fechado e parseável.',
      'Use o menor número de itens permitido pelo schema quando houver faixa.',
      'Use textos curtos e diretos; nenhum texto ornamental.',
      'Não deixe nenhum objeto, array ou string sem fechamento.',
      retryHint || '',
    ].filter(Boolean).join('\n'),
  ];

  let lastError = null;
  for (let attempt = 0; attempt < STRUCTURED_GENERATION_ATTEMPTS; attempt += 1) {
    try {
      return await run(retryInstructions[attempt] || retryInstructions[retryInstructions.length - 1]);
    } catch (error) {
      if (!isRetryableStructuredError(error)) throw error;
      lastError = error;
    }
  }

  const reason = String(lastError?.message || '') === 'EMPTY_RESPONSE'
    ? 'o provedor continuou retornando resposta vazia'
    : 'o provedor continuou retornando JSON truncado ou inválido';
  throw new Error(
    `A IA não conseguiu concluir a etapa "${stage}" após ${STRUCTURED_GENERATION_ATTEMPTS} tentativas: ${reason}. ` +
    'O Admin já reduziu automaticamente o conteúdo nas novas tentativas. Se persistir, teste outro modelo/provedor ou aumente o limite de tokens em Configurações → Inteligência Artificial.'
  );
}

function buildCasePlanSystem(context) {
  return [
    'Você está criando a ETAPA 1 de um caso jogável do Rota da Justiça: o PLANO ESTRUTURAL.',
    'Retorne SOMENTE JSON válido conforme o schema abaixo.',
    'NÃO crie characters, diálogos ou searchables nesta etapa; eles serão detalhados na etapa 2.',
    'Crie entre 2 e 6 locais, entre 4 e 12 pistas e entre 2 e 5 estratégias. Prefira quantidade proporcional à dificuldade.',
    'Cada pista deve usar locationFoundId de um dos locais criados.',
    'Cada estratégia deve referenciar somente IDs de pistas existentes.',
    'REGRA CRÍTICA DE REALISMO PROBATÓRIO: nem toda pista deve ajudar o jogador e nem toda prova deve ser autêntica. O caso precisa permitir erro humano real na seleção dos anexos.',
    '- Em casos Iniciante, use de 0 a 1 pista potencialmente enganosa (inautêntica, irrelevante ou contraditória).',
    '- Em casos Intermediário, inclua normalmente 1 a 2 pistas enganosas, sendo permitido pelo menos um item com isAuthentic=false quando narrativamente plausível.',
    '- Em casos Avançado ou Complexo, inclua normalmente 2 a 4 pistas enganosas e pelo menos uma prova inautêntica quando houver forma juridicamente plausível de ela surgir.',
    '- Uma prova com isAuthentic=false deve parecer inicialmente plausível: recibo adulterado, print manipulado, documento com inconsistência, depoimento fabricado, registro incompleto ou material cuja origem não resiste à conferência.',
    '- Nunca torne uma pista isAuthentic=false obrigatória em requiredCrucialClueIds da estratégia ótima. O jogador cuidadoso deve conseguir vencer sem usar prova falsa.',
    '- Use relevance=irrelevante para material verdadeiro que não ajuda juridicamente; use relevance=contraditoria para elemento autêntico que enfraquece uma hipótese ou exige revisão da tese.',
    '- Quando uma prova for incompatível com uma estratégia específica, use incompatibleClueIds nessa estratégia. Isso permite ao motor judicial penalizar a incoerência entre tese e prova.',
    '- A falsidade ou fragilidade precisa deixar sinais narrativos verificáveis em summary/fullDetail e nas interações do local, sem transformar a resposta correta em algo óbvio à primeira leitura.',
    'Se um local começar bloqueado, requiredClueOrDialogToUnlock deve apontar SOMENTE para uma pista existente nesta etapa.',
    'Se unlockedByDefault for true, OMITA requiredClueOrDialogToUnlock. Nunca envie string vazia e nunca envie null para campos opcionais de referência.',
    'Use chaves exatamente como definidas no schema; nunca traduza chaves para português.',
    'Seja narrativamente rico, porém conciso: detalhes de interação serão criados na etapa 2.',
    'Para evitar respostas truncadas, mantenha os campos narrativos desta etapa objetivos; detalhes extensos pertencem aos locais da etapa 2.',
    buildCaseNpcRules(context),
    'JSON Schema obrigatório para o plano:', JSON.stringify(CASE_PLAN_SCHEMA_JSON),
  ].join('\n\n');
}

function buildRepairPreservationContext(context = {}) {
  const repairCase = context.repairCase;
  if (!repairCase || typeof repairCase !== 'object') return null;
  const content = repairCase.content || {};
  const locations = Array.isArray(content.locations) ? content.locations : [];
  const briefing = content.briefing || {};
  const client = content.client || {};
  return {
    title: repairCase.title,
    area: repairCase.area,
    difficulty: repairCase.difficulty,
    client: {
      name: client.name,
      occupation: client.occupation,
      summary: compactAiText(client.summary, 280),
    },
    briefing: {
      mentorName: briefing.mentorName,
      mentorQuote: compactAiText(briefing.mentorQuote, 220),
      facts: Array.isArray(briefing.facts) ? briefing.facts.slice(0, 8).map((fact) => compactAiText(fact, 220)) : [],
      mainObjective: compactAiText(briefing.mainObjective, 280),
      legalContext: compactAiText(briefing.legalContext, 320),
    },
    npcAssignments: Array.isArray(content.npcAssignments)
      ? content.npcAssignments.map((item) => ({
          npcSlug: item?.npcSlug,
          roleInCase: item?.roleInCase,
          locationId: item?.configuration?.locationId,
        }))
      : [],
    locations: locations.map((location) => ({
      id: location.id,
      name: location.name,
      characters: Array.isArray(location.characters)
        ? location.characters.slice(0, 4).map((character) => ({
            name: character?.name,
            role: character?.role,
            initialDialogue: compactAiText(character?.initialDialogue, 180),
          }))
        : [],
    })),
  };
}

function plannedPersistentNpcsForLocation(plan, locationId) {
  const assignments = Array.isArray(plan.content.npcAssignments) ? plan.content.npcAssignments : [];
  const needs = Array.isArray(plan.content.npcNeeds) ? plan.content.npcNeeds : [];
  return {
    assignments: assignments.filter(item => item?.configuration?.locationId === locationId),
    needs: needs.filter(item => item.locationId === locationId),
  };
}

function buildLocationSystem(plan, skeleton, context = {}) {
  const allLocations = plan.content.locations.map(item => ({ id: item.id, name: item.name, unlockedByDefault: item.unlockedByDefault }));
  const clues = plan.content.availableClues.map(item => ({
    id: item.id,
    title: item.title,
    locationFoundId: item.locationFoundId,
    relevance: item.relevance,
    isAuthentic: item.isAuthentic,
  }));
  const localClues = plan.content.availableClues
    .filter(item => item.locationFoundId === skeleton.id)
    .map(item => ({
      id: item.id,
      title: item.title,
      type: item.type,
      relevance: item.relevance,
      isAuthentic: item.isAuthentic,
      summary: compactAiText(item.summary, 240),
      fullDetail: compactAiText(item.fullDetail, 420),
      legalSignificance: compactAiText(item.legalSignificance, 300),
    }));
  const preservationContext = buildRepairPreservationContext(context);
  const persistentHere = plannedPersistentNpcsForLocation(plan, skeleton.id);
  return [
    'Você está criando a ETAPA 2 de um caso jogável do Rota da Justiça: DETALHES DE UM ÚNICO LOCAL.',
    'Retorne SOMENTE JSON válido conforme o schema.',
    'Preserve exatamente id, name, category, travelTimeHours, travelCost, description, address, iconName, color, unlockedByDefault e requiredClueOrDialogToUnlock recebidos.',
    'Preencha characters e searchables de modo que o local tenha gameplay real.',
    'characters são PERSONAGENS EXCLUSIVOS deste caso: cliente, vítima, réu, suspeito, testemunha, familiar, funcionário, vizinho etc.',
    'NÃO duplique dentro de characters um NPC persistente que já esteja planejado em npcAssignments ou npcNeeds para este local. O runtime renderiza esses NPCs separadamente.',
    'Todo character conversável deve possuir appearanceProfile completo com genderPresentation, ageRange, skinTone, hair, clothing, expression e notes. Varie aparência, idade, traços, cabelo, corpo aparente e vestimenta para evitar rostos genéricos repetidos.',
    'OMITA portraitSrc, portraitStoragePath e portraitGeneratedAt. O servidor gera e salva o retrato depois que o JSON estiver validado.',
    `REGRA CRÍTICA DE IDs: todos os IDs NOVOS criados dentro deste local para personagens, diálogos e searchables devem começar com o prefixo "${skeleton.id}-". Não use IDs genéricos como character-1, dialogue-1 ou searchable-1.`,
    'Dentro deste local, nenhum ID pode se repetir.',
    'revealsClueId e foundClueId só podem usar EXATAMENTE IDs da lista TODAS AS PISTAS fornecida abaixo. Nunca invente ID de pista nesta etapa.',
    'unlocksLocationId só pode usar EXATAMENTE IDs da lista TODOS OS LOCAIS fornecida abaixo. Nunca invente ID de local nesta etapa.',
    'Campos opcionais de referência sem valor devem ser OMITIDOS. Nunca use "" e nunca use null em requiredClueOrDialogToUnlock, revealsClueId, unlocksLocationId ou foundClueId.',
    'As pistas cujo locationFoundId é este local devem ser efetivamente descobríveis por diálogo ou searchable sempre que isso fizer sentido.',
    'Se uma pista deste local tiver isAuthentic=false, crie contexto plausível para ela aparecer e, quando possível, sinais de inconsistência que um jogador atento possa perceber. Não diga diretamente em diálogo "esta prova é falsa"; permita que a desconfiança venha da investigação.',
    'Pistas relevance=irrelevante ou contraditoria devem parecer suficientemente plausíveis para testar a seleção probatória, mas não podem bloquear a solução correta do caso.',
    'Evite criar diálogos longos demais; 1 a 3 personagens e 1 a 3 interações relevantes são suficientes na maioria dos locais.',
    preservationContext ? 'ESTE É UM REPARO DE CASO EXISTENTE: preserve os personagens centrais, seus nomes, papéis e relações narrativas, além do sentido das interações e diálogos originais sempre que forem compatíveis com o novo contrato. IDs antigos não precisam ser preservados.' : '',
    preservationContext ? 'CONTEXTO NARRATIVO ORIGINAL A PRESERVAR (resumido):' : '',
    preservationContext ? JSON.stringify(preservationContext) : '',
    'NPCs PERSISTENTES PLANEJADOS PARA ESTE LOCAL — NÃO DUPLICAR COMO CHARACTER:', JSON.stringify(persistentHere),
    'CASO:', JSON.stringify({
      title: plan.title,
      area: plan.area,
      difficulty: plan.difficulty,
      client: plan.content.client,
      briefing: {
        ...plan.content.briefing,
        mentorQuote: compactAiText(plan.content.briefing?.mentorQuote, 220),
        facts: Array.isArray(plan.content.briefing?.facts)
          ? plan.content.briefing.facts.map((fact) => compactAiText(fact, 220))
          : [],
        legalContext: compactAiText(plan.content.briefing?.legalContext, 320),
      },
    }),
    'LOCAL FIXO:', JSON.stringify(skeleton),
    'TODOS OS LOCAIS:', JSON.stringify(allLocations),
    'TODAS AS PISTAS (índice resumido):', JSON.stringify(clues),
    'PISTAS DESTE LOCAL (detalhadas):', JSON.stringify(localClues),
    'JSON Schema obrigatório:', JSON.stringify(CASE_LOCATION_SCHEMA_JSON),
  ].filter(Boolean).join('\n\n');
}

async function generateCaseStructured(prompt, context) {
  const rawPlan = await requestParsedJson({
    systemPrompt: buildCasePlanSystem(context),
    prompt,
    retryHint: 'Na repetição, use 2 ou 3 locais, 4 a 6 pistas e 2 ou 3 estratégias. Omita referências opcionais sem valor. Reduza cada texto narrativo ao essencial.',
    stage: 'plano estrutural do caso',
  });
  if (typeof rawPlan?.__reject === 'string') throw new Error(`Caso não criado: ${rawPlan.__reject}`);
  const plan = casePlanSchema.parse(normalizeCaseOptionalReferences(rawPlan));

  const detailedLocations = [];
  for (const skeleton of plan.content.locations) {
    const rawLocation = await requestParsedJson({
      systemPrompt: buildLocationSystem(plan, skeleton, context),
      prompt: `Complete somente o local ${skeleton.id} (${skeleton.name}). Todos os IDs internos novos devem usar o prefixo ${skeleton.id}-. Omita campos opcionais de referência que não tenham valor. Use somente IDs de pistas e locais já existentes no plano.`,
      retryHint: `Use no máximo 1 character, até 2 dialogueOptions para esse character e até 3 searchables, desde que todas as pistas locais continuem descobríveis. Textos devem ser curtos. Garanta que todos os IDs internos novos comecem com ${skeleton.id}-. Todo character precisa de appearanceProfile.`,
      stage: `detalhamento do local ${skeleton.name}`,
    });
    const parsedLocation = caseLocationDetailSchema.parse(normalizeCaseOptionalReferences(rawLocation));
    const reconciledLocation = normalizeLocationReferences(parsedLocation, plan);
    detailedLocations.push({
      ...reconciledLocation,
      ...skeleton,
      characters: reconciledLocation.characters,
      searchables: reconciledLocation.searchables,
    });
  }

  return caseSchema.parse(normalizeCaseOptionalReferences({
    ...plan,
    status: 'draft',
    content: {
      ...plan.content,
      locations: detailedLocations,
    },
  }));
}

export async function generateStructured(entityType, prompt, context = {}) {
  try {
    if (entityType === 'case') return await generateCaseStructured(prompt, context);

    const contract = getAIContract(entityType);
    const parsed = await requestParsedJson({
      prompt,
      systemPrompt: buildSystemPrompt(contract, entityType, context),
      retryHint: 'Mantenha todos os campos do schema e reduza apenas texto ornamental.',
      stage: `geração de ${entityType}`,
    });
    return parsed;
  } catch (error) {
    if (String(error?.message || '').includes('Nenhum provedor de IA ativo')) {
      if (entityType === 'exam' || entityType === 'examQuestionBatch') throw new Error('Configure um provedor de IA ativo para gerar novas provas.');
      return generateTemplate(entityType, prompt);
    }
    throw error;
  }
}
