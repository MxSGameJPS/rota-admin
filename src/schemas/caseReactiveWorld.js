import { z } from 'zod';

const eventChoiceSchema = z.object({
  id: z.string().min(2),
  label: z.string().min(5),
  description: z.string().min(5),
  scoreModifier: z.number().min(-10).max(10),
  timePenaltyHours: z.number().min(0).max(24),
  professionalRisk: z.number().int().min(0).max(10),
  resolution: z.string().min(10),
});

const eventTriggerSchema = z.object({
  minActions: z.number().int().min(1).max(30).default(2),
  deadlineRatio: z.number().min(0).max(1).nullable().default(null),
});

export const eventSchema = z.object({
  id: z.string().min(2),
  eyebrow: z.string().min(3),
  title: z.string().min(10),
  description: z.string().min(20),
  sourceLabel: z.string().min(2),
  relatedClueId: z.string().min(2).nullable().default(null),
  trigger: eventTriggerSchema,
  choices: z.array(eventChoiceSchema).min(2).max(4),
});

const hearingChoiceSchema = z.object({
  id: z.string().min(2),
  label: z.string().min(5),
  explanation: z.string().min(10),
  impact: z.number().int().min(-4).max(4),
});

const hearingRoundSchema = z.object({
  id: z.string().min(2),
  speaker: z.string().min(2),
  title: z.string().min(5),
  prompt: z.string().min(20),
  relatedClueId: z.string().min(2).nullable().default(null),
  choices: z.array(hearingChoiceSchema).min(2).max(4),
});

export const hearingSchema = z.object({
  enabled: z.boolean().default(true),
  title: z.string().min(5).default('Audiência de instrução'),
  intro: z.string().min(10),
  rounds: z.array(hearingRoundSchema).min(2).max(6),
});

export const caseReactiveEventsStageSchema = z.object({
  events: z.array(eventSchema).min(1).max(5),
});

export const caseReactiveHearingStageSchema = z.object({
  hearing: hearingSchema.nullable().default(null),
});

export const caseReactiveWorldSchema = z.object({
  version: z.literal(1).default(1),
  events: z.array(eventSchema).min(1).max(5),
  hearing: hearingSchema.nullable().default(null),
}).superRefine((data, ctx) => {
  const eventIds = new Set();
  for (const [eventIndex, event] of data.events.entries()) {
    if (eventIds.has(event.id)) ctx.addIssue({ code: 'custom', path: ['events', eventIndex, 'id'], message: `ID de intercorrência duplicado: ${event.id}.` });
    eventIds.add(event.id);
    const choiceIds = new Set();
    for (const [choiceIndex, choice] of event.choices.entries()) {
      if (choiceIds.has(choice.id)) ctx.addIssue({ code: 'custom', path: ['events', eventIndex, 'choices', choiceIndex, 'id'], message: `ID de escolha duplicado na intercorrência ${event.id}: ${choice.id}.` });
      choiceIds.add(choice.id);
    }
  }

  if (!data.hearing) return;
  const roundIds = new Set();
  for (const [roundIndex, round] of data.hearing.rounds.entries()) {
    if (roundIds.has(round.id)) ctx.addIssue({ code: 'custom', path: ['hearing', 'rounds', roundIndex, 'id'], message: `ID de etapa de audiência duplicado: ${round.id}.` });
    roundIds.add(round.id);
    const choiceIds = new Set();
    for (const [choiceIndex, choice] of round.choices.entries()) {
      if (choiceIds.has(choice.id)) ctx.addIssue({ code: 'custom', path: ['hearing', 'rounds', roundIndex, 'choices', choiceIndex, 'id'], message: `ID de escolha duplicado na etapa ${round.id}: ${choice.id}.` });
      choiceIds.add(choice.id);
    }
  }
});

export function validateReactiveWorldReferences(config, caseModel) {
  const clueIds = new Set((caseModel?.content?.availableClues || []).map((clue) => clue.id));
  for (const event of config.events) {
    if (event.relatedClueId && !clueIds.has(event.relatedClueId)) {
      throw new Error(`A intercorrência ${event.id} referencia uma pista inexistente: ${event.relatedClueId}.`);
    }
  }
  for (const round of config.hearing?.rounds || []) {
    if (round.relatedClueId && !clueIds.has(round.relatedClueId)) {
      throw new Error(`A etapa de audiência ${round.id} referencia uma pista inexistente: ${round.relatedClueId}.`);
    }
  }
  return config;
}

export const CASE_REACTIVE_EVENTS_STAGE_SCHEMA_JSON = z.toJSONSchema(caseReactiveEventsStageSchema);
export const CASE_REACTIVE_HEARING_STAGE_SCHEMA_JSON = z.toJSONSchema(caseReactiveHearingStageSchema);
export const CASE_REACTIVE_WORLD_SCHEMA_JSON = z.toJSONSchema(caseReactiveWorldSchema);
