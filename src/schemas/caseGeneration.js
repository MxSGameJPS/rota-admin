import { z } from 'zod';

const careerTier = z.enum([
  'ESTAGIARIO','ESTAGIARIO_SENIOR','ADVOGADO_CONTRATADO','ADVOGADO_SENIOR','SOCIO_ESCRITORIO','DONO_ESCRITORIO','MAGISTRADO_SUBSTITUTO','JUIZ_TITULAR','DESEMBARGADOR','MINISTRO_STF',
]);

const npcRoleType = z.enum([
  'juiz','desembargador','promotor','procurador','advogado','defensor','delegado','investigador','perito','oficial_justica','servidor','oab','cliente','testemunha','outro',
]);

const appearanceProfile = z.object({
  genderPresentation:z.string().min(2),
  ageRange:z.string().min(2),
  skinTone:z.string().min(2),
  hair:z.string().min(2),
  clothing:z.string().min(2),
  expression:z.string().min(2),
  notes:z.string().default(''),
});

const clue = z.object({ id:z.string().min(2), title:z.string().min(3), type:z.enum(['documento','depoimento','pericia','comprovante','registro_publico','objeto']), relevance:z.enum(['crucial','complementar','irrelevante','contraditoria']), isAuthentic:z.boolean(), summary:z.string().min(5), fullDetail:z.string().min(10), locationFoundId:z.string().min(2), legalSignificance:z.string().min(5), iconName:z.string().min(2) });
const strategy = z.object({ id:z.string().min(2), title:z.string().min(3), branch:z.string().min(2), description:z.string().min(5), isOptimal:z.boolean(), scoreWeight:z.number().min(0).max(100), requiredCrucialClueIds:z.array(z.string().min(2)).default([]), incompatibleClueIds:z.array(z.string().min(2)).optional(), rationale:z.string().min(5) });

export const caseLocationSkeletonSchema = z.object({ id:z.string().min(2), name:z.string().min(2), category:z.enum(['cartorio','tribunal','delegacia','residencia','empresa','banco','escritorio']), travelTimeHours:z.number().min(0), travelCost:z.number().min(0), description:z.string().min(5), address:z.string().min(2), iconName:z.string().min(2), color:z.string().min(2), unlockedByDefault:z.boolean(), requiredClueOrDialogToUnlock:z.string().min(2).optional() });
const dialogue = z.object({ id:z.string().min(2), question:z.string().min(3), answer:z.string().min(3), revealsClueId:z.string().min(2).optional(), unlocksLocationId:z.string().min(2).optional(), timeCostMinutes:z.number().int().min(0), attitude:z.enum(['neutro','cooperativo','suspeito','nervoso']).optional() });
const character = z.object({
  id:z.string().min(2),
  name:z.string().min(2),
  role:z.string().min(2),
  avatarIcon:z.string().min(2),
  avatarBg:z.string().min(2),
  appearanceProfile,
  portraitSrc:z.string().min(2).optional(),
  portraitStoragePath:z.string().min(2).optional(),
  portraitGeneratedAt:z.string().min(10).optional(),
  initialDialogue:z.string().min(3),
  dialogueOptions:z.array(dialogue).default([]),
});
const searchable = z.object({ id:z.string().min(2), name:z.string().min(2), description:z.string().min(3), timeCostMinutes:z.number().int().min(0), foundClueId:z.string().min(2).optional(), inspectedMessage:z.string().min(3) });
export const caseLocationDetailSchema = caseLocationSkeletonSchema.extend({ characters:z.array(character).default([]), searchables:z.array(searchable).default([]) });

const npcAssignmentConfiguration = z.object({
  locationId:z.string().min(2),
  initialDialogue:z.string().min(3).optional(),
  dialogueOptions:z.array(dialogue).default([]),
}).catchall(z.unknown());

const npcAssignment = z.object({
  npcSlug:z.string().min(2),
  roleInCase:z.string().min(2),
  isRequired:z.boolean().default(false),
  sortOrder:z.number().int().default(0),
  configuration:npcAssignmentConfiguration,
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

export const casePlanSchema = z.object({
  id:z.string().min(4), code:z.string().min(4), title:z.string().min(5), area:z.string().min(3), difficulty:z.enum(['Iniciante','Intermediário','Avançado','Complexo']), difficultyStars:z.number().int().min(1).max(10), deadlineHours:z.number().int().positive(), honorariosReward:z.number().min(0), xpReward:z.number().int().min(0), reputationReward:z.number().int(), minCareerTier:careerTier,
  content:z.object({
    client:z.object({ name:z.string().min(2), occupation:z.string().min(2), summary:z.string().min(10), avatarBg:z.string().min(2) }),
    briefing:z.object({ mentorName:z.string().min(2), mentorQuote:z.string().min(10), facts:z.array(z.string().min(5)).min(2).max(8), mainObjective:z.string().min(10), legalContext:z.string().min(10) }),
    locations:z.array(caseLocationSkeletonSchema).min(2).max(6),
    availableClues:z.array(clue).min(4).max(12),
    strategies:z.array(strategy).min(2).max(5),
    npcAssignments:z.array(npcAssignment).default([]),
    npcNeeds:z.array(npcNeed).default([]),
    socialJuridicoTools:z.array(z.record(z.string(),z.unknown())).default([]),
    minimumPassingScore:z.number().int().min(0).max(100).default(70),
  }), metadata:z.record(z.string(),z.unknown()).default({}), status:z.enum(['draft','published','archived']).default('draft'),
}).superRefine((data,ctx)=>{
  const locationIds=new Set(data.content.locations.map(x=>x.id));
  const clueIds=new Set(data.content.availableClues.map(x=>x.id));
  for(const [i,c] of data.content.availableClues.entries()) if(!locationIds.has(c.locationFoundId)) ctx.addIssue({code:'custom',path:['content','availableClues',i,'locationFoundId'],message:`Pista aponta para local inexistente: ${c.locationFoundId}.`});
  for(const [i,s] of data.content.strategies.entries()) for(const clueId of [...s.requiredCrucialClueIds,...(s.incompatibleClueIds||[])]) if(!clueIds.has(clueId)) ctx.addIssue({code:'custom',path:['content','strategies',i],message:`Estratégia referencia pista inexistente: ${clueId}.`});
  for(const [i,need] of data.content.npcNeeds.entries()) if(!locationIds.has(need.locationId)) ctx.addIssue({code:'custom',path:['content','npcNeeds',i,'locationId'],message:`Necessidade de NPC aponta para local inexistente: ${need.locationId}.`});
  for(const [i,assignment] of data.content.npcAssignments.entries()) if(!locationIds.has(assignment.configuration.locationId)) ctx.addIssue({code:'custom',path:['content','npcAssignments',i,'configuration','locationId'],message:`NPC aponta para local inexistente: ${assignment.configuration.locationId}.`});
});

export const CASE_PLAN_SCHEMA_JSON = z.toJSONSchema(casePlanSchema);
export const CASE_LOCATION_SCHEMA_JSON = z.toJSONSchema(caseLocationDetailSchema);
