import { z } from 'zod';
import { caseLocationSkeletonSchema } from './caseGeneration';

const careerTier = z.enum([
  'ESTAGIARIO','ESTAGIARIO_SENIOR','ADVOGADO_CONTRATADO','ADVOGADO_SENIOR','SOCIO_ESCRITORIO','DONO_ESCRITORIO','MAGISTRADO_SUBSTITUTO','JUIZ_TITULAR','DESEMBARGADOR','MINISTRO_STF',
]);

const npcRoleType = z.enum([
  'juiz','desembargador','promotor','procurador','advogado','defensor','delegado','investigador','perito','oficial_justica','servidor','oab','cliente','testemunha','outro',
]);

const clue = z.object({
  id:z.string().min(2),
  title:z.string().min(3),
  type:z.enum(['documento','depoimento','pericia','comprovante','registro_publico','objeto']),
  relevance:z.enum(['crucial','complementar','irrelevante','contraditoria']),
  isAuthentic:z.boolean(),
  summary:z.string().min(5),
  fullDetail:z.string().min(10),
  locationFoundId:z.string().min(2),
  legalSignificance:z.string().min(5),
  iconName:z.string().min(2),
});

const strategy = z.object({
  id:z.string().min(2),
  title:z.string().min(3),
  branch:z.string().min(2),
  description:z.string().min(5),
  isOptimal:z.boolean(),
  scoreWeight:z.number().min(0).max(100),
  requiredCrucialClueIds:z.array(z.string().min(2)).default([]),
  incompatibleClueIds:z.array(z.string().min(2)).optional(),
  rationale:z.string().min(5),
});

const dialogue = z.object({
  id:z.string().min(2),
  question:z.string().min(3),
  answer:z.string().min(3),
  revealsClueId:z.string().min(2).optional(),
  unlocksLocationId:z.string().min(2).optional(),
  timeCostMinutes:z.number().int().min(0),
  attitude:z.enum(['neutro','cooperativo','suspeito','nervoso']).optional(),
});

const npcAssignment = z.object({
  npcSlug:z.string().min(2),
  roleInCase:z.string().min(2),
  isRequired:z.boolean().default(false),
  sortOrder:z.number().int().default(0),
  configuration:z.object({
    locationId:z.string().min(2),
    initialDialogue:z.string().min(3).optional(),
    dialogueOptions:z.array(dialogue).default([]),
  }).catchall(z.unknown()),
});

const npcNeed = z.object({
  roleType:npcRoleType,
  profession:z.string().min(2),
  specialization:z.string().min(2),
  jurisdiction:z.string().default(''),
  roleInCase:z.string().min(2),
  locationId:z.string().min(2),
  reason:z.string().min(5),
  isRequired:z.boolean().default(true),
});

export const caseCoreStageSchema = z.object({
  id:z.string().min(4),
  code:z.string().min(4),
  title:z.string().min(5),
  area:z.string().min(3),
  difficulty:z.enum(['Iniciante','Intermediário','Avançado','Complexo']),
  difficultyStars:z.number().int().min(1).max(10),
  deadlineHours:z.number().int().positive(),
  honorariosReward:z.number().min(0),
  xpReward:z.number().int().min(0),
  reputationReward:z.number().int(),
  minCareerTier:careerTier,
  content:z.object({
    client:z.object({
      name:z.string().min(2),
      occupation:z.string().min(2),
      summary:z.string().min(10),
      avatarBg:z.string().min(2),
    }),
    briefing:z.object({
      mentorName:z.string().min(2),
      mentorQuote:z.string().min(10),
      facts:z.array(z.string().min(5)).min(2).max(6),
      mainObjective:z.string().min(10),
      legalContext:z.string().min(10),
    }),
    locations:z.array(caseLocationSkeletonSchema).min(2).max(4),
  }),
  metadata:z.record(z.string(),z.unknown()).default({}),
  status:z.enum(['draft','published','archived']).default('draft'),
});

export const caseCluesStageSchema = z.object({
  availableClues:z.array(clue).min(4).max(8),
});

export const caseStrategiesStageSchema = z.object({
  strategies:z.array(strategy).min(2).max(4),
  minimumPassingScore:z.number().int().min(0).max(100).default(70),
});

export const caseNpcStageSchema = z.object({
  npcAssignments:z.array(npcAssignment).max(4).default([]),
  npcNeeds:z.array(npcNeed).max(3).default([]),
});

export const CASE_CORE_STAGE_SCHEMA_JSON = z.toJSONSchema(caseCoreStageSchema);
export const CASE_CLUES_STAGE_SCHEMA_JSON = z.toJSONSchema(caseCluesStageSchema);
export const CASE_STRATEGIES_STAGE_SCHEMA_JSON = z.toJSONSchema(caseStrategiesStageSchema);
export const CASE_NPC_STAGE_SCHEMA_JSON = z.toJSONSchema(caseNpcStageSchema);
