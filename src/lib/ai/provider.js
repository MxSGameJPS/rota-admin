import { getAIContract, caseSchema } from '@/schemas/contracts';
import { casePlanSchema, caseLocationDetailSchema, CASE_PLAN_SCHEMA_JSON, CASE_LOCATION_SCHEMA_JSON } from '@/schemas/caseGeneration';
import { generateTemplate } from './templates';
import { normalizeLocationReferences } from './referenceNormalizer';
import { generateWithDefaultProvider } from '@/services/ai/providerService';

const STRUCTURED_GENERATION_TIMEOUT_MS = 300000;
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

function buildCaseNpcRules(context = {}) {
  const publishedNpcs = Array.isArray(context.publishedNpcs) ? context.publishedNpcs : [];
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
      ? 'CATÁLOGO DE NPCs PUBLICADOS DISPONÍVEIS PARA AVALIAÇÃO:'
      : 'CATÁLOGO DE NPCs PUBLICADOS: vazio. Se uma função persistente for necessária, use npcNeeds.',
    JSON.stringify(publishedNpcs),
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
  if (!raw) throw new Error('O provedor retornou uma resposta vazia.');
  const withoutFence = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  try { return JSON.parse(withoutFence); } catch {}
  const first = withoutFence.indexOf('{'); const last = withoutFence.lastIndexOf('}');
  if (first >= 0 && last > first) { try { return JSON.parse(withoutFence.slice(first, last + 1)); } catch {} }
  throw new Error('INVALID_JSON');
}

async function requestParsedJson({ systemPrompt, prompt, retryHint }) {
  const run = async (extra = '') => {
    const result = await generateWithDefaultProvider({
      prompt,
      systemPrompt: [systemPrompt, extra].filter(Boolean).join('\n\n'),
      timeoutMs: STRUCTURED_GENERATION_TIMEOUT_MS,
    });
    return parseStructuredText(result.text);
  };

  try {
    return await run();
  } catch (error) {
    if (String(error?.message || '') !== 'INVALID_JSON') throw error;
    try {
      return await run([
        'ATENÇÃO: a resposta anterior não formou JSON válido, possivelmente por excesso de texto ou truncamento.',
        'Tente novamente do zero. Seja mais conciso nos textos narrativos, mas NÃO omita campos obrigatórios.',
        'Feche corretamente todos os objetos e arrays. Retorne somente JSON.',
        retryHint || '',
      ].filter(Boolean).join('\n'));
    } catch (retryError) {
      if (String(retryError?.message || '') === 'INVALID_JSON') {
        throw new Error('A IA respondeu duas vezes, mas o JSON ficou incompleto. O Admin dividiu a geração em etapas; se persistir, aumente o limite de tokens do provider em Configurações → Inteligência Artificial.');
      }
      throw retryError;
    }
  }
}

function buildCasePlanSystem(context) {
  return [
    'Você está criando a ETAPA 1 de um caso jogável do Rota da Justiça: o PLANO ESTRUTURAL.',
    'Retorne SOMENTE JSON válido conforme o schema abaixo.',
    'NÃO crie characters, diálogos ou searchables nesta etapa; eles serão detalhados na etapa 2.',
    'Crie entre 2 e 6 locais, entre 4 e 12 pistas e entre 2 e 5 estratégias. Prefira quantidade proporcional à dificuldade.',
    'Cada pista deve usar locationFoundId de um dos locais criados.',
    'Cada estratégia deve referenciar somente IDs de pistas existentes.',
    'Se um local começar bloqueado, requiredClueOrDialogToUnlock deve apontar SOMENTE para uma pista existente nesta etapa.',
    'Se unlockedByDefault for true, OMITA requiredClueOrDialogToUnlock. Nunca envie string vazia e nunca envie null para campos opcionais de referência.',
    'Use chaves exatamente como definidas no schema; nunca traduza chaves para português.',
    'Seja narrativamente rico, porém conciso: detalhes de interação serão criados na etapa 2.',
    buildCaseNpcRules(context),
    'JSON Schema obrigatório para o plano:', JSON.stringify(CASE_PLAN_SCHEMA_JSON),
  ].join('\n\n');
}

function buildRepairPreservationContext(context = {}) {
  const repairCase = context.repairCase;
  if (!repairCase || typeof repairCase !== 'object') return null;
  const content = repairCase.content || {};
  const locations = Array.isArray(content.locations) ? content.locations : [];
  return {
    title: repairCase.title,
    area: repairCase.area,
    difficulty: repairCase.difficulty,
    client: content.client,
    briefing: content.briefing,
    npcAssignments: Array.isArray(content.npcAssignments) ? content.npcAssignments : [],
    locations: locations.map(location => ({
      id: location.id,
      name: location.name,
      characters: Array.isArray(location.characters) ? location.characters : [],
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
  const clues = plan.content.availableClues.map(item => ({ id: item.id, title: item.title, summary: item.summary, locationFoundId: item.locationFoundId, relevance: item.relevance }));
  const localClues = clues.filter(item => item.locationFoundId === skeleton.id);
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
    'Evite criar diálogos longos demais; 1 a 3 personagens e 1 a 3 interações relevantes são suficientes na maioria dos locais.',
    preservationContext ? 'ESTE É UM REPARO DE CASO EXISTENTE: preserve os personagens centrais, seus nomes, papéis e relações narrativas, além do sentido das interações e diálogos originais sempre que forem compatíveis com o novo contrato. IDs antigos não precisam ser preservados.' : '',
    preservationContext ? 'CONTEXTO NARRATIVO ORIGINAL A PRESERVAR:' : '',
    preservationContext ? JSON.stringify(preservationContext) : '',
    'NPCs PERSISTENTES PLANEJADOS PARA ESTE LOCAL — NÃO DUPLICAR COMO CHARACTER:', JSON.stringify(persistentHere),
    'CASO:', JSON.stringify({ title: plan.title, area: plan.area, difficulty: plan.difficulty, client: plan.content.client, briefing: plan.content.briefing }),
    'LOCAL FIXO:', JSON.stringify(skeleton),
    'TODOS OS LOCAIS:', JSON.stringify(allLocations),
    'TODAS AS PISTAS:', JSON.stringify(clues),
    'PISTAS DESTE LOCAL:', JSON.stringify(localClues),
    'JSON Schema obrigatório:', JSON.stringify(CASE_LOCATION_SCHEMA_JSON),
  ].filter(Boolean).join('\n\n');
}

async function generateCaseStructured(prompt, context) {
  const rawPlan = await requestParsedJson({
    systemPrompt: buildCasePlanSystem(context),
    prompt,
    retryHint: 'Na repetição, mantenha no máximo 4 locais e 8 pistas se o briefing não exigir mais. Omita referências opcionais sem valor em vez de usar string vazia ou null.',
  });
  if (typeof rawPlan?.__reject === 'string') throw new Error(`Caso não criado: ${rawPlan.__reject}`);
  const plan = casePlanSchema.parse(normalizeCaseOptionalReferences(rawPlan));

  const detailedLocations = [];
  for (const skeleton of plan.content.locations) {
    const rawLocation = await requestParsedJson({
      systemPrompt: buildLocationSystem(plan, skeleton, context),
      prompt: `Complete somente o local ${skeleton.id} (${skeleton.name}). Todos os IDs internos novos devem usar o prefixo ${skeleton.id}-. Omita campos opcionais de referência que não tenham valor. Use somente IDs de pistas e locais já existentes no plano.`,
      retryHint: `Reduza a quantidade de diálogos, não a estrutura obrigatória. Garanta que todos os IDs internos novos comecem com ${skeleton.id}-. Todo character precisa de appearanceProfile. Nunca invente IDs em foundClueId, revealsClueId ou unlocksLocationId.`,
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
