import { getAIContract, caseSchema } from '@/schemas/contracts';
import { casePlanSchema, caseLocationDetailSchema, CASE_PLAN_SCHEMA_JSON, CASE_LOCATION_SCHEMA_JSON } from '@/schemas/caseGeneration';
import { generateTemplate } from './templates';
import { generateWithDefaultProvider } from '@/services/ai/providerService';

const STRUCTURED_GENERATION_TIMEOUT_MS = 300000;

function buildCaseNpcRules(context = {}) {
  const publishedNpcs = Array.isArray(context.publishedNpcs) ? context.publishedNpcs : [];
  return [
    'REGRA CRÍTICA SOBRE NPCs EM CASOS:',
    '- Um caso NÃO cria NPCs persistentes. NPCs persistentes são criados e publicados separadamente no módulo de NPCs.',
    '- Cliente, réu, testemunhas, familiares, empregados, vizinhos e outros personagens próprios daquele caso devem permanecer dentro do conteúdo do caso e NÃO devem ser colocados em content.npcAssignments.',
    '- Por padrão, content.npcAssignments deve ser [].',
    '- Use npcAssignments somente quando o caso realmente precisar de um NPC persistente já existente no universo, por exemplo juiz, desembargador, promotor, advogado anterior ou outro personagem recorrente.',
    '- Quando usar npcAssignments, use SOMENTE npcSlug existente no catálogo publicado abaixo. Nunca invente nomes, slugs ou NPCs.',
    '- Se o briefing exigir obrigatoriamente um NPC persistente/processual e nenhum NPC publicado abaixo for compatível, NÃO improvise. Retorne exatamente um JSON no formato {"__reject":"Explique qual NPC precisa existir antes deste caso ser criado."}.',
    'CATÁLOGO DE NPCs PUBLICADOS DISPONÍVEIS:', JSON.stringify(publishedNpcs),
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
    'Obedeça integralmente ao JSON Schema fornecido, exceto pelo formato especial __reject explicitamente autorizado nas regras de NPC de casos.',
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
    'NÃO crie personagens, diálogos ou searchables nesta etapa; o schema desta etapa não contém esses campos.',
    'Crie entre 2 e 6 locais, entre 4 e 12 pistas e entre 2 e 5 estratégias. Prefira quantidade proporcional à dificuldade.',
    'Cada pista deve usar locationFoundId de um dos locais criados.',
    'Cada estratégia deve referenciar somente IDs de pistas existentes.',
    'Se um local começar bloqueado, requiredClueOrDialogToUnlock deve apontar SOMENTE para uma pista existente nesta etapa.',
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
    locations: locations.map(location => ({
      id: location.id,
      name: location.name,
      characters: Array.isArray(location.characters) ? location.characters : [],
    })),
  };
}

function buildLocationSystem(plan, skeleton, context = {}) {
  const allLocations = plan.content.locations.map(item => ({ id: item.id, name: item.name, unlockedByDefault: item.unlockedByDefault }));
  const clues = plan.content.availableClues.map(item => ({ id: item.id, title: item.title, summary: item.summary, locationFoundId: item.locationFoundId, relevance: item.relevance }));
  const localClues = clues.filter(item => item.locationFoundId === skeleton.id);
  const preservationContext = buildRepairPreservationContext(context);
  return [
    'Você está criando a ETAPA 2 de um caso jogável do Rota da Justiça: DETALHES DE UM ÚNICO LOCAL.',
    'Retorne SOMENTE JSON válido conforme o schema.',
    'Preserve exatamente id, name, category, travelTimeHours, travelCost, description, address, iconName, color, unlockedByDefault e requiredClueOrDialogToUnlock recebidos.',
    'Preencha characters e searchables de modo que o local tenha gameplay real.',
    'Personagens locais podem ser cliente, réu, testemunhas, funcionários, familiares etc. Eles NÃO são NPCs persistentes.',
    `REGRA CRÍTICA DE IDs: todos os IDs NOVOS criados dentro deste local para personagens, diálogos e searchables devem começar com o prefixo "${skeleton.id}-". Não use IDs genéricos como character-1, dialogue-1 ou searchable-1.`,
    'Dentro deste local, nenhum ID pode se repetir.',
    'revealsClueId e foundClueId só podem usar IDs da lista de pistas fornecida.',
    'unlocksLocationId só pode usar IDs da lista de locais fornecida.',
    'As pistas cujo locationFoundId é este local devem ser efetivamente descobríveis por diálogo ou searchable sempre que isso fizer sentido.',
    'Evite criar diálogos longos demais; 1 a 3 personagens e 1 a 3 interações relevantes são suficientes na maioria dos locais.',
    preservationContext ? 'ESTE É UM REPARO DE CASO EXISTENTE: preserve os personagens centrais, seus nomes, papéis e relações narrativas, além do sentido das interações e diálogos originais sempre que forem compatíveis com o novo contrato. IDs antigos não precisam ser preservados.' : '',
    preservationContext ? 'CONTEXTO NARRATIVO ORIGINAL A PRESERVAR:' : '',
    preservationContext ? JSON.stringify(preservationContext) : '',
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
    retryHint: 'Na repetição, mantenha no máximo 4 locais e 8 pistas se o briefing não exigir mais.',
  });
  if (typeof rawPlan?.__reject === 'string') throw new Error(`Caso não criado: ${rawPlan.__reject}`);
  const plan = casePlanSchema.parse(rawPlan);

  const detailedLocations = [];
  for (const skeleton of plan.content.locations) {
    const rawLocation = await requestParsedJson({
      systemPrompt: buildLocationSystem(plan, skeleton, context),
      prompt: `Complete somente o local ${skeleton.id} (${skeleton.name}). Todos os IDs internos novos devem usar o prefixo ${skeleton.id}-.`,
      retryHint: `Reduza a quantidade de diálogos, não a estrutura obrigatória. Garanta que todos os IDs internos novos comecem com ${skeleton.id}-.`,
    });
    const parsedLocation = caseLocationDetailSchema.parse(rawLocation);
    detailedLocations.push({
      ...parsedLocation,
      ...skeleton,
      characters: parsedLocation.characters,
      searchables: parsedLocation.searchables,
    });
  }

  return caseSchema.parse({
    ...plan,
    status: 'draft',
    content: {
      ...plan.content,
      locations: detailedLocations,
    },
  });
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
