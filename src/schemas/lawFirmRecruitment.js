import { z } from 'zod';

const score = z.number().int().min(0).max(100);
const nonNegativeInt = z.number().int().min(0);
const slug = z.string().min(2).regex(/^[a-z0-9-]+$/);
const roleCode = z.string().min(2).regex(/^[A-Z0-9_]+$/);

export const LAW_FIRM_RECRUITMENT_SCHEMA_VERSION = 1;
export const LAW_FIRM_REQUIRED_SPECIALTIES_MATCH = 'ANY';
export const LAW_FIRM_OFFER_TYPES_V1 = [
  'POST_OAB',
  'CONTINUITY',
  'HEADHUNTING',
  'APPLICATION_APPROVED',
  'POST_TERMINATION',
  'COUNTEROFFER',
  'RETURN',
];

const commonEligibilityFields = {
  minimumReputation: score.default(0),
  minimumXp: nonNegativeInt.default(0),
  minimumCasesSolved: nonNegativeInt.default(0),
  minimumEthics: score.default(0),
};

const specialtyEligibilityFields = {
  requiredSpecialties: z.array(slug).default([]),
};

export const lawFirmRecruitmentSchema = z.object({
  recruitmentSchemaVersion: z.literal(LAW_FIRM_RECRUITMENT_SCHEMA_VERSION).default(LAW_FIRM_RECRUITMENT_SCHEMA_VERSION),

  internshipRecruitment: z.object({
    enabled: z.boolean().default(false),
    roleCode: roleCode.nullable().default(null),
    ...commonEligibilityFields,
  }).default({
    enabled: false,
    roleCode: null,
    minimumReputation: 0,
    minimumXp: 0,
    minimumCasesSolved: 0,
    minimumEthics: 0,
  }),

  postOabOffer: z.object({
    enabled: z.boolean().default(false),
    roleCode: roleCode.nullable().default(null),
    ...commonEligibilityFields,
    ...specialtyEligibilityFields,
  }).default({
    enabled: false,
    roleCode: null,
    minimumReputation: 0,
    minimumXp: 0,
    minimumCasesSolved: 0,
    minimumEthics: 0,
    requiredSpecialties: [],
  }),

  continuity: z.object({
    enabled: z.boolean().default(false),
    internshipPerformanceWeight: score.default(70),
    minimumPerformance: score.default(50),
    guaranteedPerformance: score.default(80),
  }).superRefine((value, ctx) => {
    if (value.minimumPerformance > value.guaranteedPerformance) {
      ctx.addIssue({
        code: 'custom',
        path: ['minimumPerformance'],
        message: 'minimumPerformance não pode ser maior que guaranteedPerformance.',
      });
    }
  }).default({
    enabled: false,
    internshipPerformanceWeight: 70,
    minimumPerformance: 50,
    guaranteedPerformance: 80,
  }),

  headhunting: z.object({
    enabled: z.boolean().default(false),
    eligibleRoleCodes: z.array(roleCode).default([]),
    ...commonEligibilityFields,
    ...specialtyEligibilityFields,
    evaluationChance: z.number().min(0).max(1).default(0.15),
    cooldownGameDays: nonNegativeInt.default(90),
  }).default({
    enabled: false,
    eligibleRoleCodes: [],
    minimumReputation: 0,
    minimumXp: 0,
    minimumCasesSolved: 0,
    minimumEthics: 0,
    requiredSpecialties: [],
    evaluationChance: 0.15,
    cooldownGameDays: 90,
  }),

  applications: z.object({
    enabled: z.boolean().default(false),
    eligibleRoleCodes: z.array(roleCode).default([]),
    ...commonEligibilityFields,
    ...specialtyEligibilityFields,
    cooldownGameDays: nonNegativeInt.default(30),
  }).default({
    enabled: false,
    eligibleRoleCodes: [],
    minimumReputation: 0,
    minimumXp: 0,
    minimumCasesSolved: 0,
    minimumEthics: 0,
    requiredSpecialties: [],
    cooldownGameDays: 30,
  }),

  postTermination: z.object({
    enabled: z.boolean().default(false),
    eligibleRoleCodes: z.array(roleCode).default([]),
    ...commonEligibilityFields,
    ...specialtyEligibilityFields,
    cooldownGameDays: nonNegativeInt.default(15),
  }).default({
    enabled: false,
    eligibleRoleCodes: [],
    minimumReputation: 0,
    minimumXp: 0,
    minimumCasesSolved: 0,
    minimumEthics: 0,
    requiredSpecialties: [],
    cooldownGameDays: 15,
  }),
}).superRefine((value, ctx) => {
  if (value.internshipRecruitment.enabled && !value.internshipRecruitment.roleCode) {
    ctx.addIssue({ code: 'custom', path: ['internshipRecruitment', 'roleCode'], message: 'Estágio habilitado exige roleCode.' });
  }
  if (value.postOabOffer.enabled && !value.postOabOffer.roleCode) {
    ctx.addIssue({ code: 'custom', path: ['postOabOffer', 'roleCode'], message: 'Oferta pós-OAB habilitada exige roleCode.' });
  }
});

export function defaultLawFirmRecruitment() {
  return lawFirmRecruitmentSchema.parse({ recruitmentSchemaVersion: LAW_FIRM_RECRUITMENT_SCHEMA_VERSION });
}

export function normalizeLawFirmRecruitmentV1(value) {
  const raw = value && typeof value === 'object' ? structuredClone(value) : {};
  if (raw.recruitmentSchemaVersion === LAW_FIRM_RECRUITMENT_SCHEMA_VERSION) {
    return lawFirmRecruitmentSchema.parse(raw);
  }

  const legacyInitial = raw.initialGameOffer && typeof raw.initialGameOffer === 'object' ? raw.initialGameOffer : {};
  const legacyRequirements = legacyInitial.requirements && typeof legacyInitial.requirements === 'object' ? legacyInitial.requirements : {};
  const legacyHead = raw.headhunting && typeof raw.headhunting === 'object' ? raw.headhunting : {};
  const legacyPostTermination = raw.postTerminationApplication && typeof raw.postTerminationApplication === 'object'
    ? raw.postTerminationApplication
    : {};

  return lawFirmRecruitmentSchema.parse({
    recruitmentSchemaVersion: LAW_FIRM_RECRUITMENT_SCHEMA_VERSION,
    internshipRecruitment: {
      enabled: Boolean(legacyInitial.enabled),
      roleCode: legacyInitial.roleCode || null,
      minimumReputation: Number(legacyRequirements.minimumReputation || 0),
      minimumXp: Number(legacyRequirements.minimumXp || 0),
      minimumCasesSolved: Number(legacyRequirements.minimumCasesSolved || 0),
      minimumEthics: Number(legacyRequirements.minimumEthics || 0),
    },
    postOabOffer: {
      enabled: false,
      roleCode: null,
      minimumReputation: 0,
      minimumXp: 0,
      minimumCasesSolved: 0,
      minimumEthics: 0,
      requiredSpecialties: [],
    },
    continuity: {
      enabled: false,
      internshipPerformanceWeight: 70,
      minimumPerformance: 50,
      guaranteedPerformance: 80,
    },
    headhunting: {
      enabled: Boolean(legacyHead.enabled),
      eligibleRoleCodes: Array.isArray(legacyHead.eligibleRoleCodes)
        ? legacyHead.eligibleRoleCodes
        : Array.isArray(legacyHead.eligibleCareerTiers)
          ? legacyHead.eligibleCareerTiers
          : [],
      minimumReputation: Number(legacyHead.minimumReputation || 0),
      minimumXp: Number(legacyHead.minimumXp || 0),
      minimumCasesSolved: Number(legacyHead.minimumCasesSolved || 0),
      minimumEthics: Number(legacyHead.minimumEthics || 0),
      requiredSpecialties: Array.isArray(legacyHead.requiredSpecialties) ? legacyHead.requiredSpecialties : [],
      evaluationChance: Number(legacyHead.evaluationChance ?? 0.15),
      cooldownGameDays: Number(legacyHead.cooldownGameDays ?? 90),
    },
    applications: {
      enabled: Boolean(raw.acceptsApplications),
      eligibleRoleCodes: [],
      minimumReputation: 0,
      minimumXp: 0,
      minimumCasesSolved: 0,
      minimumEthics: 0,
      requiredSpecialties: [],
      cooldownGameDays: 30,
    },
    postTermination: {
      enabled: Boolean(legacyPostTermination.enabled),
      eligibleRoleCodes: [],
      minimumReputation: 0,
      minimumXp: 0,
      minimumCasesSolved: 0,
      minimumEthics: 0,
      requiredSpecialties: [],
      cooldownGameDays: Number(legacyPostTermination.cooldownGameDays ?? 15),
    },
  });
}

export function validateLawFirmRecruitmentReferences(recruitment, { roleCodes = [], specialtySlugs = [] } = {}) {
  const parsed = lawFirmRecruitmentSchema.parse(recruitment);
  const validRoles = new Set(roleCodes);
  const validSpecialties = new Set(specialtySlugs);

  const assertRole = (code, path) => {
    if (code && !validRoles.has(code)) throw new Error(`${path} aponta para cargo inexistente no escritório: ${code}.`);
  };
  const assertRoles = (codes, path) => {
    for (const code of codes || []) assertRole(code, path);
  };
  const assertSpecialties = (slugs, path) => {
    for (const specialty of slugs || []) {
      if (!validSpecialties.has(specialty)) throw new Error(`${path} aponta para especialidade inexistente no escritório: ${specialty}.`);
    }
  };

  assertRole(parsed.internshipRecruitment.roleCode, 'internshipRecruitment.roleCode');
  assertRole(parsed.postOabOffer.roleCode, 'postOabOffer.roleCode');
  assertRoles(parsed.headhunting.eligibleRoleCodes, 'headhunting.eligibleRoleCodes');
  assertRoles(parsed.applications.eligibleRoleCodes, 'applications.eligibleRoleCodes');
  assertRoles(parsed.postTermination.eligibleRoleCodes, 'postTermination.eligibleRoleCodes');

  assertSpecialties(parsed.postOabOffer.requiredSpecialties, 'postOabOffer.requiredSpecialties');
  assertSpecialties(parsed.headhunting.requiredSpecialties, 'headhunting.requiredSpecialties');
  assertSpecialties(parsed.applications.requiredSpecialties, 'applications.requiredSpecialties');
  assertSpecialties(parsed.postTermination.requiredSpecialties, 'postTermination.requiredSpecialties');

  return parsed;
}

export function continuityIntermediateChance(performance, recruitment) {
  const config = lawFirmRecruitmentSchema.parse(recruitment).continuity;
  const current = Number(performance);
  if (!config.enabled || !Number.isFinite(current) || current < config.minimumPerformance) return 0;
  if (current >= config.guaranteedPerformance) return 1;
  if (config.guaranteedPerformance <= config.minimumPerformance) return 1;
  return (current - config.minimumPerformance) / (config.guaranteedPerformance - config.minimumPerformance);
}
