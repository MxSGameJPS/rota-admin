import { z } from 'zod';

const score = z.number().int().min(0).max(100);
const status = z.enum(['draft', 'published', 'archived']).default('draft');

export const npcSchema = z.object({
  name: z.string().min(2),
  slug: z.string().min(2).regex(/^[a-z0-9-]+$/),
  roleType: z.enum(['juiz', 'desembargador', 'promotor', 'procurador', 'advogado', 'delegado', 'perito', 'cliente', 'testemunha', 'servidor', 'outro']),
  profession: z.string().min(2),
  specialization: z.string().min(2),
  jurisdiction: z.string().default(''),
  professionalProfile: z.object({
    yearsExperience: z.number().int().min(0).default(0),
    background: z.string().min(10),
    proceduralStyle: z.string().min(5),
    priorities: z.array(z.string()).default([]),
  }),
  personality: z.object({
    formalism: score,
    evidenceRigor: score,
    urgencySensitivity: score,
    conciliationOpenness: score,
    proceduralErrorTolerance: score,
    innovationOpenness: score,
  }),
  baseMemories: z.array(z.object({
    summary: z.string().min(5),
    importance: z.number().int().min(1).max(10).default(5),
    tags: z.array(z.string()).default([]),
  })).min(1),
  dialogueLibrary: z.array(z.object({
    trigger: z.string().min(2),
    tone: z.string().min(2),
    text: z.string().min(5),
  })).min(1),
  decisionRules: z.array(z.object({
    actionType: z.string().min(2),
    condition: z.string().min(5),
    weight: z.number().min(-100).max(100),
    rationale: z.string().min(5),
  })).min(1),
  relationships: z.array(z.object({
    targetNpcSlug: z.string(),
    relation: z.string(),
    strength: z.number().int().min(-100).max(100).default(0),
  })).default([]),
  knowledge: z.array(z.object({
    domain: z.string(),
    level: score,
    notes: z.string().default(''),
  })).default([]),
  metadata: z.record(z.string(), z.unknown()).default({}),
  status,
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
  minCareerTier: z.string().min(3),
  content: z.object({
    client: z.record(z.string(), z.unknown()).default({}),
    briefing: z.record(z.string(), z.unknown()).default({}),
    locations: z.array(z.record(z.string(), z.unknown())).default([]),
    availableClues: z.array(z.record(z.string(), z.unknown())).default([]),
    strategies: z.array(z.record(z.string(), z.unknown())).default([]),
    socialJuridicoTools: z.array(z.record(z.string(), z.unknown())).default([]),
    minimumPassingScore: z.number().int().min(0).max(100).default(70),
  }),
  metadata: z.record(z.string(), z.unknown()).default({}),
  status,
});

export const catalogItemSchema = z.object({
  id: z.string().min(3),
  sku: z.string().min(3),
  type: z.enum(['skin', 'office_furniture', 'cosmetic', 'time_boost', 'utility', 'bundle']),
  name: z.string().min(2),
  description: z.string().min(5),
  rarity: z.enum(['comum', 'incomum', 'raro', 'epico', 'lendario']),
  priceCurrency: z.string().min(2),
  priceAmount: z.number().int().min(0),
  effects: z.record(z.string(), z.unknown()).default({}),
  content: z.record(z.string(), z.unknown()).default({}),
  metadata: z.record(z.string(), z.unknown()).default({}),
  status,
});

export const ENTITY_SCHEMAS = { npc: npcSchema, case: caseSchema, item: catalogItemSchema };

export const AI_CONTRACTS = {
  npc: {
    required: ['name','slug','roleType','profession','specialization','professionalProfile','personality','baseMemories','dialogueLibrary','decisionRules'],
    rule: 'Crie um NPC completo e coerente. Memórias, diálogos e regras de decisão devem refletir a personalidade e a função jurídica.',
  },
  case: {
    required: ['id','code','title','area','difficulty','difficultyStars','deadlineHours','xpReward','minCareerTier','content'],
    rule: 'Crie um caso jogável. Toda pista citada deve possuir ID consistente; estratégias devem usar provas existentes; ferramentas Social Jurídico devem ser opcionais ou justificadas pela mecânica.',
  },
  item: {
    required: ['id','sku','type','name','description','rarity','priceCurrency','priceAmount'],
    rule: 'Crie item de jogo sem pay-to-win. Efeitos competitivos devem ser moderados e validados no backend.',
  },
};
