import { z } from 'zod';
import { npcSchema } from '@/schemas/contracts';
import {
  LAW_FIRM_REQUIRED_SPECIALTIES_MATCH,
  lawFirmRecruitmentSchema,
  normalizeLawFirmRecruitmentV1,
  validateLawFirmRecruitmentReferences,
} from '@/schemas/lawFirmRecruitment';

const score = z.number().int().min(0).max(100);
const slug = z.string().min(2).regex(/^[a-z0-9-]+$/);

export const LAW_FIRM_MARKET_TIERS = ['LOCAL', 'REGIONAL', 'NATIONAL', 'ELITE'];
export const LAW_FIRM_SIZE_CATEGORIES = ['SMALL', 'MEDIUM', 'LARGE', 'MEGA'];
export const LAW_FIRM_LOCATION_STRATEGIES = ['PLAYER_BASE_CITY', 'FIXED_BRANCHES', 'NATIONAL_DYNAMIC'];

const appearanceProfileSchema = z.object({
  genderPresentation: z.string().min(2),
  ageRange: z.string().min(2),
  skinTone: z.string().min(2),
  hair: z.string().min(2),
  clothing: z.string().min(2),
  expression: z.string().min(2),
  notes: z.string().default(''),
});

const embeddedNpcSchema = npcSchema.omit({ status: true, metadata: true }).extend({
  appearanceProfile: appearanceProfileSchema,
  metadata: z.record(z.string(), z.unknown()).default({}),
});

const roleSchema = z.object({
  code: z.string().min(2).regex(/^[A-Z0-9_]+$/),
  title: z.string().min(2),
  mapsToCareerTier: z.string().min(2).nullable().default(null),
  roleType: z.string().min(2),
  hierarchyLevel: z.number().int().min(1).max(20),
  requiresOab: z.boolean().default(false),
  employmentType: z.string().min(2),
  contract: z.object({
    salaryMonthlyJR: z.number().int().min(0).nullable().default(null),
    weeklyHours: z.number().int().min(1).max(80).nullable().default(null),
    exclusiveDedication: z.boolean().default(false),
  }).passthrough().default({ salaryMonthlyJR: null, weeklyHours: null, exclusiveDedication: false }),
  requirements: z.record(z.string(), z.unknown()).default({}),
  benefits: z.record(z.string(), z.unknown()).default({}),
  caseAccess: z.record(z.string(), z.unknown()).default({}),
  promotion: z.record(z.string(), z.unknown()).default({}),
  terminationRules: z.record(z.string(), z.unknown()).default({}),
  metadata: z.record(z.string(), z.unknown()).default({}),
});

const departmentSchema = z.object({
  slug,
  name: z.string().min(2),
  specialty: z.string().min(2).nullable().default(null),
}).passthrough();

const memberSchema = z.object({
  npcSlug: slug,
  roleCode: z.string().min(2).nullable().default(null),
  departmentSlug: slug.nullable().default(null),
  officeTitle: z.string().min(2),
  npc: embeddedNpcSchema.nullable().default(null),
  permissions: z.record(z.string(), z.unknown()).default({}),
  metadata: z.record(z.string(), z.unknown()).default({}),
});

export const lawFirmSchema = z.object({
  schemaVersion: z.literal(1).default(1),
  entityType: z.literal('LAW_FIRM').default('LAW_FIRM'),
  slug,
  name: z.string().min(2),
  legalName: z.string().min(2).nullable().default(null),
  description: z.string().min(10),
  status: z.literal('draft').default('draft'),
  isActive: z.boolean().default(true),
  market: z.object({
    tier: z.enum(LAW_FIRM_MARKET_TIERS).default('LOCAL'),
    size: z.enum(LAW_FIRM_SIZE_CATEGORIES).default('SMALL'),
    prestige: score.default(20),
    publicReputation: score.default(20),
  }),
  brand: z.record(z.string(), z.unknown()).default({}),
  location: z.object({
    strategy: z.enum(LAW_FIRM_LOCATION_STRATEGIES).default('PLAYER_BASE_CITY'),
  }).passthrough(),
  culture: z.record(z.string(), z.unknown()).default({}),
  specialties: z.array(z.object({
    slug,
    name: z.string().min(2),
    weight: score.default(50),
  }).passthrough()).default([]),
  departments: z.array(departmentSchema).min(1),
  recruitment: lawFirmRecruitmentSchema,
  roles: z.array(roleSchema).min(1),
  members: z.array(memberSchema).min(1),
  caseDistribution: z.record(z.string(), z.unknown()).default({}),
  discipline: z.record(z.string(), z.unknown()).default({}),
  economy: z.record(z.string(), z.unknown()).default({}),
  metadata: z.record(z.string(), z.unknown()).default({}),
}).superRefine((firm, ctx) => {
  const roleCodes = new Set();
  const departmentSlugs = new Set();
  const memberSlugs = new Set();
  const specialtySlugs = new Set(firm.specialties.map((item) => item.slug));

  for (const [index, role] of firm.roles.entries()) {
    if (roleCodes.has(role.code)) ctx.addIssue({ code: 'custom', path: ['roles', index, 'code'], message: `Cargo duplicado: ${role.code}.` });
    roleCodes.add(role.code);
  }

  for (const [index, department] of firm.departments.entries()) {
    if (departmentSlugs.has(department.slug)) ctx.addIssue({ code: 'custom', path: ['departments', index, 'slug'], message: `Departamento duplicado: ${department.slug}.` });
    departmentSlugs.add(department.slug);
  }

  for (const [index, member] of firm.members.entries()) {
    if (memberSlugs.has(member.npcSlug)) ctx.addIssue({ code: 'custom', path: ['members', index, 'npcSlug'], message: `NPC duplicado no escritório: ${member.npcSlug}.` });
    memberSlugs.add(member.npcSlug);

    if (member.npc && member.npc.slug !== member.npcSlug) {
      ctx.addIssue({ code: 'custom', path: ['members', index, 'npc', 'slug'], message: `npc.slug precisa ser igual a npcSlug (${member.npcSlug}).` });
    }
    if (member.roleCode && !roleCodes.has(member.roleCode)) {
      ctx.addIssue({ code: 'custom', path: ['members', index, 'roleCode'], message: `Cargo inexistente no escritório: ${member.roleCode}.` });
    }
    if (member.departmentSlug && !departmentSlugs.has(member.departmentSlug)) {
      ctx.addIssue({ code: 'custom', path: ['members', index, 'departmentSlug'], message: `Departamento inexistente no escritório: ${member.departmentSlug}.` });
    }
  }

  for (const key of ['assignmentNpcSlug', 'crmOperatorNpcSlug']) {
    const value = typeof firm.caseDistribution?.[key] === 'string' ? firm.caseDistribution[key].trim() : '';
    if (value && !memberSlugs.has(value)) {
      ctx.addIssue({ code: 'custom', path: ['caseDistribution', key], message: `${key} precisa apontar para um membro deste escritório.` });
    }
  }

  try {
    validateLawFirmRecruitmentReferences(firm.recruitment, {
      roleCodes: [...roleCodes],
      specialtySlugs: [...specialtySlugs],
    });
  } catch (error) {
    ctx.addIssue({ code: 'custom', path: ['recruitment'], message: error.message });
  }
});

export function normalizeLawFirmGeneratedInput(value) {
  const raw = value && typeof value === 'object' ? structuredClone(value) : {};
  raw.schemaVersion = 1;
  raw.entityType = 'LAW_FIRM';
  raw.status = 'draft';
  raw.isActive = raw.isActive !== false;
  raw.recruitment = normalizeLawFirmRecruitmentV1(raw.recruitment);

  if (Array.isArray(raw.members)) {
    raw.members = raw.members.map((member) => {
      if (!member || typeof member !== 'object' || !member.npc || typeof member.npc !== 'object') return member;
      const npc = { ...member.npc };
      const role = String(npc.roleType || '').toUpperCase();
      const aliases = {
        LAWYER: 'advogado',
        ATTORNEY: 'advogado',
        PARTNER: 'advogado',
        SECRETARY: 'outro',
        ADMIN: 'outro',
        ADMINISTRATIVE: 'outro',
      };
      if (aliases[role]) npc.roleType = aliases[role];
      return { ...member, npc };
    });
  }

  raw.metadata = {
    ...(raw.metadata && typeof raw.metadata === 'object' ? raw.metadata : {}),
    createdBy: 'rota-admin',
    generatedByAI: true,
  };
  return raw;
}

export const LAW_FIRM_AI_INSTRUCTIONS = `
Crie um ESCRITÓRIO DE ADVOCACIA persistente e jogável para o universo do Rota da Justiça.
Retorne SOMENTE JSON válido conforme o schema fornecido.
O status deve ser sempre draft. Nunca publique automaticamente.

REGRAS DE NPC:
- Todo membro citado nominalmente pelo administrador deve aparecer em members[].
- npcSlug é a identidade persistente do personagem.
- Quando estiver criando um NPC novo, preencha members[].npc com o NPC COMPLETO e use npc.slug exatamente igual a npcSlug.
- O NPC completo deve conter professionalProfile, personality, baseMemories, dialogueLibrary, decisionRules, relationships, knowledge, appearanceProfile e metadata.
- roleType de NPC deve seguir o contrato atual: advogado, juiz, desembargador, promotor, procurador, defensor, delegado, investigador, perito, oficial_justica, servidor, oab, cliente, testemunha ou outro. Secretárias e profissionais administrativos normalmente usam outro.
- appearanceProfile precisa ser visualmente específico e diverso. Os personagens do mesmo escritório NÃO podem parecer a mesma pessoa com roupa diferente.
- NÃO invente portraitSrc nem URL de imagem. O servidor gera o PNG transparente após validar o JSON.
- Se o briefing disser explicitamente que um NPC já existente deve ser reutilizado, use npc:null para ele.

REGRAS DE ESTRUTURA:
- Todo roleCode usado por members precisa existir em roles, exceto cargos administrativos que podem usar roleCode:null.
- Todo departmentSlug usado por members precisa existir em departments.
- caseDistribution.assignmentNpcSlug e crmOperatorNpcSlug, quando usados, precisam apontar para membros do próprio escritório.
- Crie cargos suficientes para o funcionamento do escritório e para progressão do jogador quando fizer sentido, mas não crie dezenas de cargos desnecessários.
- Preserve coerência entre porte, reputação, salários, cultura, benefícios, recrutamento e acesso a casos.
- Não use marcas reais nem pessoas reais identificáveis, salvo se o administrador fornecer explicitamente conteúdo autorizado para isso.

RECRUTAMENTO V1 — CONTRATO CONGELADO:
- recruitment.recruitmentSchemaVersion deve ser 1.
- Use somente internshipRecruitment, postOabOffer, continuity, headhunting, applications e postTermination.
- NÃO use initialGameOffer, acceptsApplications, postTerminationApplication ou nomes alternativos legados.
- recruitment define QUEM o escritório procura. Salário, horas, exclusividade e benefícios ficam em roles[].contract/benefits.
- internshipRecruitment.roleCode e postOabOffer.roleCode precisam existir em roles[].
- eligibleRoleCodes precisam existir em roles[].
- requiredSpecialties contém somente slugs existentes em specialties[]. A semântica V1 é ${LAW_FIRM_REQUIRED_SPECIALTIES_MATCH}: basta o jogador possuir qualquer uma das especialidades exigidas.
- evaluationChance só é aplicada pelo game DEPOIS de todos os requisitos mínimos terem sido atendidos.
- continuity só considera histórico do jogador neste mesmo law_firm_id.
- Na continuidade: abaixo de minimumPerformance não há proposta; em/ acima de guaranteedPerformance a proposta é garantida; entre os dois valores o game usa interpolação linear.
- cooldownGameDays é respeitado pelo game e propostas PENDING equivalentes não podem ser duplicadas.
`;
