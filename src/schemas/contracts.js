import { z } from 'zod';

const score = z.number().int().min(0).max(100);
const status = z.enum(['draft', 'published', 'archived']).default('draft');

const careerTierSchema = z.enum([
  'ESTAGIARIO',
  'ESTAGIARIO_SENIOR',
  'ADVOGADO_CONTRATADO',
  'ADVOGADO_SENIOR',
  'SOCIO_ESCRITORIO',
  'DONO_ESCRITORIO',
  'MAGISTRADO_SUBSTITUTO',
  'JUIZ_TITULAR',
  'DESEMBARGADOR',
  'MINISTRO_STF',
]);

const clueSchema = z.object({
  id: z.string().min(2),
  title: z.string().min(3),
  type: z.enum(['documento', 'depoimento', 'pericia', 'comprovante', 'registro_publico', 'objeto']),
  relevance: z.enum(['crucial', 'complementar', 'irrelevante', 'contraditoria']),
  isAuthentic: z.boolean(),
  summary: z.string().min(5),
  fullDetail: z.string().min(10),
  locationFoundId: z.string().min(2),
  legalSignificance: z.string().min(5),
  foundAtTime: z.string().optional(),
  iconName: z.string().min(2),
});

const dialogueOptionSchema = z.object({
  id: z.string().min(2),
  question: z.string().min(3),
  answer: z.string().min(3),
  revealsClueId: z.string().min(2).optional(),
  unlocksLocationId: z.string().min(2).optional(),
  timeCostMinutes: z.number().int().min(0),
  attitude: z.enum(['neutro', 'cooperativo', 'suspeito', 'nervoso']).optional(),
});

const characterSchema = z.object({
  id: z.string().min(2),
  name: z.string().min(2),
  role: z.string().min(2),
  avatarIcon: z.string().min(2),
  avatarBg: z.string().min(2),
  initialDialogue: z.string().min(3),
  dialogueOptions: z.array(dialogueOptionSchema).default([]),
});

const searchableSpotSchema = z.object({
  id: z.string().min(2),
  name: z.string().min(2),
  description: z.string().min(3),
  timeCostMinutes: z.number().int().min(0),
  foundClueId: z.string().min(2).optional(),
  inspectedMessage: z.string().min(3),
});

const locationSchema = z.object({
  id: z.string().min(2),
  name: z.string().min(2),
  category: z.enum(['cartorio', 'tribunal', 'delegacia', 'residencia', 'empresa', 'banco', 'escritorio']),
  travelTimeHours: z.number().min(0),
  travelCost: z.number().min(0),
  description: z.string().min(5),
  address: z.string().min(2),
  iconName: z.string().min(2),
  color: z.string().min(2),
  unlockedByDefault: z.boolean(),
  requiredClueOrDialogToUnlock: z.string().min(2).optional(),
  characters: z.array(characterSchema).default([]),
  searchables: z.array(searchableSpotSchema).default([]),
});

const legalStrategySchema = z.object({
  id: z.string().min(2),
  title: z.string().min(3),
  branch: z.string().min(2),
  description: z.string().min(5),
  isOptimal: z.boolean(),
  scoreWeight: z.number().min(0).max(100),
  requiredCrucialClueIds: z.array(z.string().min(2)).default([]),
  incompatibleClueIds: z.array(z.string().min(2)).optional(),
  rationale: z.string().min(5),
});

const caseContentSchema = z.object({
  client: z.object({
    name: z.string().min(2),
    occupation: z.string().min(2),
    summary: z.string().min(10),
    avatarBg: z.string().min(2),
  }),
  briefing: z.object({
    mentorName: z.string().min(2),
    mentorQuote: z.string().min(10),
    facts: z.array(z.string().min(5)).min(1),
    mainObjective: z.string().min(10),
    legalContext: z.string().min(10),
  }),
  locations: z.array(locationSchema).min(1),
  availableClues: z.array(clueSchema).min(1),
  strategies: z.array(legalStrategySchema).min(1),
  npcAssignments: z.array(z.object({
    npcSlug: z.string().min(2),
    roleInCase: z.string().min(2),
    isRequired: z.boolean().default(false),
    sortOrder: z.number().int().default(0),
    configuration: z.record(z.string(), z.unknown()).default({}),
  })).default([]),
  socialJuridicoTools: z.array(z.record(z.string(), z.unknown())).default([]),
  minimumPassingScore: z.number().int().min(0).max(100).default(70),
}).superRefine((content, ctx) => {
  const locationIds = new Set();
  const clueIds = new Set();
  const dialogueIds = new Set();
  const searchableIds = new Set();
  const characterIds = new Set();
  const strategyIds = new Set();

  for (const [index, location] of content.locations.entries()) {
    if (locationIds.has(location.id)) ctx.addIssue({ code: 'custom', path: ['locations', index, 'id'], message: `ID de local duplicado: ${location.id}.` });
    locationIds.add(location.id);
    for (const [charIndex, character] of location.characters.entries()) {
      if (characterIds.has(character.id)) ctx.addIssue({ code: 'custom', path: ['locations', index, 'characters', charIndex, 'id'], message: `ID de personagem duplicado: ${character.id}.` });
      characterIds.add(character.id);
      for (const [dialogIndex, dialog] of character.dialogueOptions.entries()) {
        if (dialogueIds.has(dialog.id)) ctx.addIssue({ code: 'custom', path: ['locations', index, 'characters', charIndex, 'dialogueOptions', dialogIndex, 'id'], message: `ID de diálogo duplicado: ${dialog.id}.` });
        dialogueIds.add(dialog.id);
      }
    }
    for (const [spotIndex, spot] of location.searchables.entries()) {
      if (searchableIds.has(spot.id)) ctx.addIssue({ code: 'custom', path: ['locations', index, 'searchables', spotIndex, 'id'], message: `ID de ponto investigável duplicado: ${spot.id}.` });
      searchableIds.add(spot.id);
    }
  }

  for (const [index, clue] of content.availableClues.entries()) {
    if (clueIds.has(clue.id)) ctx.addIssue({ code: 'custom', path: ['availableClues', index, 'id'], message: `ID de pista duplicado: ${clue.id}.` });
    clueIds.add(clue.id);
  }

  for (const [index, strategy] of content.strategies.entries()) {
    if (strategyIds.has(strategy.id)) ctx.addIssue({ code: 'custom', path: ['strategies', index, 'id'], message: `ID de estratégia duplicado: ${strategy.id}.` });
    strategyIds.add(strategy.id);
  }

  for (const [index, clue] of content.availableClues.entries()) {
    if (!locationIds.has(clue.locationFoundId)) ctx.addIssue({ code: 'custom', path: ['availableClues', index, 'locationFoundId'], message: `A pista ${clue.id} aponta para um local inexistente: ${clue.locationFoundId}.` });
  }

  for (const [locationIndex, location] of content.locations.entries()) {
    for (const [spotIndex, spot] of location.searchables.entries()) {
      if (spot.foundClueId && !clueIds.has(spot.foundClueId)) ctx.addIssue({ code: 'custom', path: ['locations', locationIndex, 'searchables', spotIndex, 'foundClueId'], message: `O ponto ${spot.id} revela uma pista inexistente: ${spot.foundClueId}.` });
    }
    for (const [charIndex, character] of location.characters.entries()) {
      for (const [dialogIndex, dialog] of character.dialogueOptions.entries()) {
        if (dialog.revealsClueId && !clueIds.has(dialog.revealsClueId)) ctx.addIssue({ code: 'custom', path: ['locations', locationIndex, 'characters', charIndex, 'dialogueOptions', dialogIndex, 'revealsClueId'], message: `O diálogo ${dialog.id} revela uma pista inexistente: ${dialog.revealsClueId}.` });
        if (dialog.unlocksLocationId && !locationIds.has(dialog.unlocksLocationId)) ctx.addIssue({ code: 'custom', path: ['locations', locationIndex, 'characters', charIndex, 'dialogueOptions', dialogIndex, 'unlocksLocationId'], message: `O diálogo ${dialog.id} desbloqueia um local inexistente: ${dialog.unlocksLocationId}.` });
      }
    }
    if (location.requiredClueOrDialogToUnlock && !clueIds.has(location.requiredClueOrDialogToUnlock) && !dialogueIds.has(location.requiredClueOrDialogToUnlock)) {
      ctx.addIssue({ code: 'custom', path: ['locations', locationIndex, 'requiredClueOrDialogToUnlock'], message: `O desbloqueio do local ${location.id} referencia pista/diálogo inexistente: ${location.requiredClueOrDialogToUnlock}.` });
    }
  }

  for (const [strategyIndex, strategy] of content.strategies.entries()) {
    for (const clueId of strategy.requiredCrucialClueIds) {
      if (!clueIds.has(clueId)) ctx.addIssue({ code: 'custom', path: ['strategies', strategyIndex, 'requiredCrucialClueIds'], message: `A estratégia ${strategy.id} exige uma pista inexistente: ${clueId}.` });
    }
    for (const clueId of strategy.incompatibleClueIds || []) {
      if (!clueIds.has(clueId)) ctx.addIssue({ code: 'custom', path: ['strategies', strategyIndex, 'incompatibleClueIds'], message: `A estratégia ${strategy.id} referencia pista incompatível inexistente: ${clueId}.` });
    }
  }
});

export const npcSchema = z.object({
  name: z.string().min(2), slug: z.string().min(2).regex(/^[a-z0-9-]+$/),
  roleType: z.enum(['juiz', 'desembargador', 'promotor', 'procurador', 'advogado', 'delegado', 'perito', 'cliente', 'testemunha', 'servidor', 'outro']),
  profession: z.string().min(2), specialization: z.string().min(2), jurisdiction: z.string().default(''),
  professionalProfile: z.object({ yearsExperience: z.number().int().min(0).default(0), background: z.string().min(10), proceduralStyle: z.string().min(5), priorities: z.array(z.string()).default([]) }),
  personality: z.object({ formalism: score, evidenceRigor: score, urgencySensitivity: score, conciliationOpenness: score, proceduralErrorTolerance: score, innovationOpenness: score }),
  baseMemories: z.array(z.object({ summary: z.string().min(5), importance: z.number().int().min(1).max(10).default(5), tags: z.array(z.string()).default([]) })).min(1),
  dialogueLibrary: z.array(z.object({ trigger: z.string().min(2), tone: z.string().min(2), text: z.string().min(5) })).min(1),
  decisionRules: z.array(z.object({ actionType: z.string().min(2), condition: z.string().min(5), weight: z.number().min(-100).max(100), rationale: z.string().min(5) })).min(1),
  relationships: z.array(z.object({ targetNpcSlug: z.string(), relation: z.string(), strength: z.number().int().min(-100).max(100).default(0) })).default([]),
  knowledge: z.array(z.object({ domain: z.string(), level: score, notes: z.string().default('') })).default([]), metadata: z.record(z.string(), z.unknown()).default({}), status,
});

export const caseSchema = z.object({
  id: z.string().min(4),
  code: z.string().min(4),
  title: z.string().min(5),
  area: z.string().min(3),
  difficulty: z.enum(['Iniciante', 'Intermediário', 'Avançado', 'Complexo']),
  difficultyStars: z.number().int().min(1).max(10),
  deadlineHours: z.number().int().positive(),
  honorariosReward: z.number().min(0),
  xpReward: z.number().int().min(0),
  reputationReward: z.number().int(),
  minCareerTier: careerTierSchema,
  content: caseContentSchema,
  metadata: z.record(z.string(), z.unknown()).default({}),
  status,
});

export const catalogItemSchema = z.object({
  id: z.string().min(3), sku: z.string().min(3), type: z.enum(['skin', 'office_furniture', 'cosmetic', 'time_boost', 'utility', 'bundle']),
  name: z.string().min(2), description: z.string().min(5), rarity: z.enum(['comum', 'incomum', 'raro', 'epico', 'lendario']),
  priceCurrency: z.string().min(2), priceAmount: z.number().int().min(0), effects: z.record(z.string(), z.unknown()).default({}), content: z.record(z.string(), z.unknown()).default({}), metadata: z.record(z.string(), z.unknown()).default({}), status,
});

export const examTypeSchema = z.enum(['oab_first_phase', 'mestrado', 'doutorado', 'concurso_juiz', 'concurso_desembargador']);

export const examQuestionSchema = z.object({
  number: z.number().int().min(1).max(120),
  area: z.string().min(3),
  prompt: z.string().min(30),
  options: z.array(z.object({ id: z.enum(['A', 'B', 'C', 'D']), text: z.string().min(3) })).length(4),
  correctOption: z.enum(['A', 'B', 'C', 'D']),
  explanation: z.string().min(10),
  difficulty: z.enum(['fácil', 'média', 'difícil']).default('média'),
});

const examBaseSchema = z.object({
  slug: z.string().min(4).regex(/^[a-z0-9-]+$/),
  title: z.string().min(8),
  examType: examTypeSchema,
  targetLevel: z.number().int().min(1).max(5).nullable().default(null),
  editionNumber: z.number().int().positive().nullable().default(null),
  year: z.number().int().min(2020).max(2100),
  sourceKind: z.literal('ai_generated').default('ai_generated'),
  sourceLabel: z.string().min(5),
  questionCount: z.number().int().min(20).max(80),
  passingScore: z.number().int().positive(),
  durationMinutes: z.number().int().min(15).max(600),
  simulationNotice: z.string().min(20),
  disclaimer: z.string().min(20),
  generationBrief: z.string().min(20),
  eligibilityRules: z.record(z.string(), z.unknown()).default({}),
  metadata: z.record(z.string(), z.unknown()).default({}),
  status,
});

export const examSchema = examBaseSchema.superRefine((data, ctx) => {
  const expectedCounts = {
    oab_first_phase: 80,
    mestrado: 40,
    doutorado: 40,
    concurso_juiz: 20,
    concurso_desembargador: 20,
  };
  if (data.questionCount !== expectedCounts[data.examType]) {
    ctx.addIssue({ code: 'custom', path: ['questionCount'], message: `${data.examType} deve ter ${expectedCounts[data.examType]} questões.` });
  }
  if (data.passingScore > data.questionCount) {
    ctx.addIssue({ code: 'custom', path: ['passingScore'], message: 'A nota de corte não pode superar o total de questões.' });
  }
  if (['mestrado', 'doutorado'].includes(data.examType) && data.targetLevel == null) {
    ctx.addIssue({ code: 'custom', path: ['targetLevel'], message: 'Mestrado e Doutorado precisam indicar o nível-alvo de 1 a 5.' });
  }
  if (!['mestrado', 'doutorado'].includes(data.examType) && data.targetLevel != null) {
    ctx.addIssue({ code: 'custom', path: ['targetLevel'], message: 'Este tipo de exame não utiliza nível-alvo.' });
  }
  if (data.examType === 'oab_first_phase' && (data.passingScore !== 40 || data.durationMinutes !== 300)) {
    ctx.addIssue({ code: 'custom', path: ['passingScore'], message: 'O preset da OAB usa 40 acertos e 300 minutos.' });
  }
});

export const examQuestionBatchSchema = z.object({ questions: z.array(examQuestionSchema).min(1).max(10) });
export const examDraftSchema = examBaseSchema.extend({ questions: z.array(examQuestionSchema).max(80).default([]) }).superRefine((data, ctx) => {
  const expectedCounts = { oab_first_phase: 80, mestrado: 40, doutorado: 40, concurso_juiz: 20, concurso_desembargador: 20 };
  if (data.questionCount !== expectedCounts[data.examType]) ctx.addIssue({ code: 'custom', path: ['questionCount'], message: 'Quantidade de questões incompatível com o tipo de prova.' });
  if (data.passingScore > data.questionCount) ctx.addIssue({ code: 'custom', path: ['passingScore'], message: 'Nota de corte inválida.' });
  if (['mestrado', 'doutorado'].includes(data.examType) && data.targetLevel == null) ctx.addIssue({ code: 'custom', path: ['targetLevel'], message: 'Informe o nível acadêmico.' });
});

export const ENTITY_SCHEMAS = { npc: npcSchema, case: caseSchema, item: catalogItemSchema, exam: examSchema, examQuestionBatch: examQuestionBatchSchema };

export const AI_INSTRUCTIONS = {
  npc: 'Crie um NPC completo e coerente. Memórias, diálogos, conhecimento, relacionamentos e regras de decisão devem refletir a personalidade e a função jurídica. Nunca omita os campos obrigatórios.',
  case: `Crie um caso COMPLETAMENTE JOGÁVEL no motor atual do Rota da Justiça. O JSON Schema é o contrato de runtime, não apenas um formato editorial. Use EXATAMENTE os nomes de propriedades do schema, em camelCase e em inglês quando definidos: client.name/occupation/summary/avatarBg; briefing.mentorName/mentorQuote/facts/mainObjective/legalContext; locations com id/name/category/travelTimeHours/travelCost/description/address/iconName/color/unlockedByDefault/characters/searchables; characters com dialogueOptions; availableClues com title/type/relevance/isAuthentic/summary/fullDetail/locationFoundId/legalSignificance/iconName; strategies com title/branch/description/isOptimal/scoreWeight/requiredCrucialClueIds/rationale. NUNCA traduza nomes de chaves para português (não use nome, profissao, resumo, descricao, passos, provas_necessarias etc.). Todos os IDs referenciados precisam existir no próprio caso. Crie locais investigáveis de verdade, com personagens locais, diálogos e/ou searchables suficientes para o jogador descobrir as pistas. Personagens próprios do caso, como cliente, réu, testemunhas, familiares e funcionários, ficam dentro de locations.characters e NÃO são NPCs persistentes. Por padrão npcAssignments deve ser vazio. Só use npcAssignments quando o caso exigir um NPC persistente já publicado no universo, usando exclusivamente o slug fornecido pelo catálogo do Admin; nunca invente um NPC. Se o caso exigir obrigatoriamente um NPC persistente e nenhum disponível for compatível, recuse a geração conforme a instrução do provider. Ferramentas Social Jurídico só aparecem quando fizerem sentido jurídico e gamificado.`,
  item: 'Crie item de jogo sem pay-to-win. Efeitos competitivos devem ser moderados e sempre depender de validação server-side.',
  exam: 'Crie os metadados de uma NOVA avaliação simulada do Rota da Justiça. Respeite integralmente o tipo, a quantidade de questões, o nível-alvo, a duração e o corte fornecidos pelo contexto. Nunca declare uma prova gerada por IA como oficial, real ou emitida por uma instituição pública.',
  examQuestionBatch: 'Crie somente as questões solicitadas no lote. Cada questão deve ser ORIGINAL, juridicamente plausível, objetiva, ter quatro alternativas A-D, uma única resposta correta e explicação. Respeite exatamente os números solicitados. Quando o contexto fixar uma área, use-a; quando a área vier livre, escolha uma área coerente com o tipo, nível e briefing da prova.',
};

export function getAIContract(entityType) {
  const schema = ENTITY_SCHEMAS[entityType];
  if (!schema) throw new Error(`Schema desconhecido: ${entityType}`);
  return { entityType, instructions: AI_INSTRUCTIONS[entityType], jsonSchema: z.toJSONSchema(schema) };
}
