import { z } from 'zod';

const score = z.number().int().min(0).max(100);
const status = z.enum(['draft', 'published', 'archived']).default('draft');

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
  id: z.string().min(4), code: z.string().min(4), title: z.string().min(5), area: z.string().min(3),
  difficulty: z.enum(['Iniciante', 'Intermediário', 'Avançado', 'Complexo']), difficultyStars: z.number().int().min(1).max(10), deadlineHours: z.number().int().positive(),
  honorariosReward: z.number().min(0), xpReward: z.number().int().min(0), reputationReward: z.number().int(), minCareerTier: z.string().min(3),
  content: z.object({ client: z.record(z.string(), z.unknown()).default({}), briefing: z.record(z.string(), z.unknown()).default({}), locations: z.array(z.record(z.string(), z.unknown())).default([]), availableClues: z.array(z.record(z.string(), z.unknown())).default([]), strategies: z.array(z.record(z.string(), z.unknown())).default([]), npcAssignments: z.array(z.object({ npcSlug: z.string().min(2), roleInCase: z.string().min(2), isRequired: z.boolean().default(false), sortOrder: z.number().int().default(0), configuration: z.record(z.string(), z.unknown()).default({}) })).default([]), socialJuridicoTools: z.array(z.record(z.string(), z.unknown())).default([]), minimumPassingScore: z.number().int().min(0).max(100).default(70) }),
  metadata: z.record(z.string(), z.unknown()).default({}), status,
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
  case: 'Crie um caso jogável. IDs devem ser consistentes; pistas citadas devem existir; estratégias devem usar provas existentes. Personagens próprios do caso, como cliente, réu e testemunhas, não são NPCs persistentes e não entram em npcAssignments. Por padrão npcAssignments deve ser vazio. Só use npcAssignments quando o caso exigir um NPC persistente já publicado no universo, usando exclusivamente o slug fornecido pelo catálogo do Admin; nunca invente um NPC. Se o caso exigir obrigatoriamente um NPC persistente e nenhum disponível for compatível, recuse a geração conforme a instrução do provider. Ferramentas Social Jurídico só aparecem quando fizerem sentido jurídico e gamificado.',
  item: 'Crie item de jogo sem pay-to-win. Efeitos competitivos devem ser moderados e sempre depender de validação server-side.',
  exam: 'Crie os metadados de uma NOVA avaliação simulada do Rota da Justiça. Respeite integralmente o tipo, a quantidade de questões, o nível-alvo, a duração e o corte fornecidos pelo contexto. Nunca declare uma prova gerada por IA como oficial, real ou emitida por uma instituição pública.',
  examQuestionBatch: 'Crie somente as questões solicitadas no lote. Cada questão deve ser ORIGINAL, juridicamente plausível, objetiva, ter quatro alternativas A-D, uma única resposta correta e explicação. Respeite exatamente os números solicitados. Quando o contexto fixar uma área, use-a; quando a área vier livre, escolha uma área coerente com o tipo, nível e briefing da prova.',
};

export function getAIContract(entityType) {
  const schema = ENTITY_SCHEMAS[entityType];
  if (!schema) throw new Error(`Schema desconhecido: ${entityType}`);
  return { entityType, instructions: AI_INSTRUCTIONS[entityType], jsonSchema: z.toJSONSchema(schema) };
}
