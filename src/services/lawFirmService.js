import { npcSchema } from '@/schemas/contracts';
import { lawFirmSchema } from '@/schemas/lawFirm';
import {
  LAW_FIRM_RECRUITMENT_SCHEMA_VERSION,
  lawFirmRecruitmentSchema,
  normalizeLawFirmRecruitmentV1,
  validateLawFirmRecruitmentReferences,
} from '@/schemas/lawFirmRecruitment';
import { publishEntity } from '@/services/contentService';
import { generateLawFirmContract } from '@/services/ai/lawFirmGenerationService';
import {
  buildLawFirmNpcPortraitPrompt,
  generateAndStoreLawFirmPortrait,
  hasLawFirmPortraitProvider,
} from '@/services/ai/lawFirmPortraitService';
import {
  archiveLawFirm as archiveLawFirmRow,
  deleteLawFirm,
  deleteNpcs,
  findNpcBySlug,
  getLawFirm as getLawFirmRow,
  insertLawFirm,
  insertLawFirmMembers,
  insertLawFirmRoles,
  insertNpc,
  listLawFirms as listLawFirmRows,
  listNpcCatalogForLawFirmGeneration,
  publishLawFirmGraph,
  updateLawFirmRecruitment,
  updateNpcMetadata,
  writeLawFirmAudit,
} from '@/services/lawFirmRepository';

function firmRow(model) {
  return {
    slug: model.slug,
    name: model.name,
    legal_name: model.legalName || null,
    description: model.description,
    status: 'draft',
    is_active: model.isActive !== false,
    market_tier: model.market.tier,
    size_category: model.market.size,
    prestige: model.market.prestige,
    public_reputation: model.market.publicReputation,
    location_strategy: model.location.strategy,
    brand: model.brand || {},
    location: model.location || {},
    culture: model.culture || {},
    specialties: model.specialties || [],
    departments: model.departments || [],
    recruitment: model.recruitment || {},
    case_distribution: model.caseDistribution || {},
    discipline: model.discipline || {},
    economy: model.economy || {},
    metadata: {
      ...(model.metadata || {}),
      schemaVersion: model.schemaVersion,
      entityType: model.entityType,
      generationContract: 'LAW_FIRM_V1',
    },
  };
}

function roleRows(firmId, roles) {
  return roles.map((role) => ({
    law_firm_id: firmId,
    code: role.code,
    title: role.title,
    maps_to_career_tier: role.mapsToCareerTier || null,
    role_type: role.roleType,
    hierarchy_level: role.hierarchyLevel,
    requires_oab: role.requiresOab,
    employment_type: role.employmentType,
    salary_monthly_jr: role.contract?.salaryMonthlyJR ?? null,
    weekly_hours: role.contract?.weeklyHours ?? null,
    exclusive_dedication: role.contract?.exclusiveDedication ?? false,
    contract: role.contract || {},
    requirements: role.requirements || {},
    benefits: role.benefits || {},
    case_access: role.caseAccess || {},
    promotion: role.promotion || {},
    termination_rules: role.terminationRules || {},
    status: 'draft',
    is_active: true,
    metadata: role.metadata || {},
  }));
}

function generatedNpcModel(member, firm) {
  const source = member.npc;
  if (!source) throw new Error(`O NPC ${member.npcSlug} não existe e a IA não forneceu members[].npc para criá-lo.`);
  return npcSchema.parse({
    name: source.name,
    slug: member.npcSlug,
    roleType: source.roleType,
    profession: source.profession,
    specialization: source.specialization,
    jurisdiction: source.jurisdiction || 'Brasil',
    professionalProfile: source.professionalProfile,
    personality: source.personality,
    baseMemories: source.baseMemories,
    dialogueLibrary: source.dialogueLibrary,
    decisionRules: source.decisionRules,
    relationships: source.relationships || [],
    knowledge: source.knowledge || [],
    metadata: {
      ...(source.metadata || {}),
      appearanceProfile: source.appearanceProfile,
      sourceLawFirmId: firm.id,
      sourceLawFirmSlug: firm.slug,
      sourceLawFirmName: firm.name,
      sourceLawFirmOfficeTitle: member.officeTitle,
      createdBy: 'rota-admin-law-firm',
    },
    status: 'draft',
  });
}

function npcRow(model) {
  return {
    slug: model.slug,
    name: model.name,
    role_type: model.roleType,
    profession: model.profession,
    specialization: model.specialization,
    jurisdiction: model.jurisdiction,
    status: 'draft',
    is_active: true,
    professional_profile: model.professionalProfile,
    personality: model.personality,
    base_memories: model.baseMemories,
    dialogue_library: model.dialogueLibrary,
    decision_rules: model.decisionRules,
    relationships: model.relationships,
    knowledge: model.knowledge,
    metadata: model.metadata || {},
  };
}

function rowToPortraitNpc(npcRowValue) {
  return {
    name: npcRowValue.name,
    slug: npcRowValue.slug,
    profession: npcRowValue.profession,
    specialization: npcRowValue.specialization,
    professionalProfile: npcRowValue.professional_profile || {},
    appearanceProfile: npcRowValue.metadata?.appearanceProfile || {},
  };
}

function recruitmentReferenceContext(firm) {
  return {
    roleCodes: (firm.roles || []).map((role) => role.code),
    specialtySlugs: (firm.specialties || []).map((specialty) => specialty.slug).filter(Boolean),
  };
}

export async function listLawFirms() {
  return listLawFirmRows();
}

export async function getLawFirm(id) {
  return getLawFirmRow(id);
}

export async function createGeneratedLawFirm(prompt) {
  const briefing = String(prompt || '').trim();
  if (briefing.length < 10) throw new Error('Descreva melhor o escritório que deseja criar.');

  const existingNpcs = await listNpcCatalogForLawFirmGeneration();
  const contract = lawFirmSchema.parse(await generateLawFirmContract(briefing, existingNpcs));
  const needsNewNpc = contract.members.some((member) => !existingNpcs.some((npc) => npc.slug === member.npcSlug));
  if (needsNewNpc && !(await hasLawFirmPortraitProvider())) {
    throw new Error('Este escritório precisa criar novos NPCs, mas não há provedor de imagens ativo. Configure a geração de imagens antes de continuar.');
  }

  let firm = null;
  const createdNpcIds = [];
  try {
    firm = await insertLawFirm(firmRow(contract));
    const createdRoles = await insertLawFirmRoles(roleRows(firm.id, contract.roles));
    const roleByCode = new Map(createdRoles.map((role) => [role.code, role]));
    const memberRows = [];

    for (const member of contract.members) {
      let npc = await findNpcBySlug(member.npcSlug);
      let createdByThisFirm = false;
      if (npc) {
        if (!npc.is_active || npc.status === 'archived') throw new Error(`O NPC existente ${member.npcSlug} está inativo/arquivado e não pode ser vinculado.`);
      } else {
        const npcModel = generatedNpcModel(member, firm);
        const portrait = await generateAndStoreLawFirmPortrait({
          firm,
          npc: {
            ...npcModel,
            appearanceProfile: npcModel.metadata.appearanceProfile,
          },
          officeTitle: member.officeTitle,
        });
        npcModel.metadata = {
          ...npcModel.metadata,
          ...portrait,
        };
        npc = await insertNpc(npcRow(npcModel));
        createdNpcIds.push(npc.id);
        createdByThisFirm = true;
      }

      const role = member.roleCode ? roleByCode.get(member.roleCode) : null;
      if (member.roleCode && !role) throw new Error(`Cargo ${member.roleCode} não pertence ao escritório ${firm.name}.`);
      const departments = Array.isArray(firm.departments) ? firm.departments : contract.departments;
      if (member.departmentSlug && !departments.some((department) => department.slug === member.departmentSlug)) {
        throw new Error(`Departamento ${member.departmentSlug} não pertence ao escritório ${firm.name}.`);
      }

      memberRows.push({
        law_firm_id: firm.id,
        npc_id: npc.id,
        role_id: role?.id || null,
        department_slug: member.departmentSlug || null,
        office_title: member.officeTitle,
        permissions: member.permissions || {},
        is_active: true,
        metadata: {
          ...(member.metadata || {}),
          npcSlug: member.npcSlug,
          roleCode: member.roleCode,
          createdNpcForThisFirm: createdByThisFirm,
        },
      });
    }

    await insertLawFirmMembers(memberRows);
    await writeLawFirmAudit('create_law_firm_draft', firm.id, {
      prompt: briefing,
      slug: firm.slug,
      createdNpcIds,
      memberCount: memberRows.length,
      roleCount: createdRoles.length,
      recruitmentSchemaVersion: contract.recruitment.recruitmentSchemaVersion,
    });
    return getLawFirmRow(firm.id);
  } catch (error) {
    if (firm?.id) {
      try { await deleteLawFirm(firm.id); } catch {}
    }
    if (createdNpcIds.length) {
      try { await deleteNpcs(createdNpcIds); } catch {}
    }
    throw error;
  }
}

export async function updateLawFirmRecruitmentPolicy(id, input) {
  const firm = await getLawFirmRow(id);
  if (firm.status === 'archived' || !firm.is_active) throw new Error('Escritório arquivado/inativo não pode receber alterações de recrutamento.');

  const normalized = normalizeLawFirmRecruitmentV1(input);
  const parsed = validateLawFirmRecruitmentReferences(normalized, recruitmentReferenceContext(firm));
  await updateLawFirmRecruitment(id, parsed);
  await writeLawFirmAudit('update_law_firm_recruitment', id, {
    recruitmentSchemaVersion: parsed.recruitmentSchemaVersion,
    source: 'visual-editor',
  });
  return parsed;
}

export async function regenerateLawFirmMemberPortrait(firmId, npcId) {
  const firm = await getLawFirmRow(firmId);
  const member = firm.members.find((item) => item.npc_id === npcId);
  if (!member?.npc) throw new Error('NPC não pertence a este escritório.');
  if (!(await hasLawFirmPortraitProvider())) throw new Error('Configure um provedor de imagens antes de gerar o retrato.');

  const npcForPortrait = rowToPortraitNpc(member.npc);
  const portrait = await generateAndStoreLawFirmPortrait({
    firm,
    npc: npcForPortrait,
    officeTitle: member.office_title,
  });
  const metadata = {
    ...(member.npc.metadata || {}),
    ...portrait,
  };
  await updateNpcMetadata(npcId, metadata);
  await writeLawFirmAudit('regenerate_law_firm_npc_portrait', firmId, { npcId, npcSlug: member.npc.slug });
  return portrait;
}

export async function publishLawFirm(id) {
  const firm = await getLawFirmRow(id);
  if (firm.status !== 'draft') throw new Error('Somente escritórios em draft podem ser publicados.');
  if (!firm.roles.length) throw new Error('O escritório precisa possuir pelo menos um cargo.');
  if (!firm.members.length) throw new Error('O escritório precisa possuir pelo menos um membro.');
  if (firm.recruitment?.recruitmentSchemaVersion !== LAW_FIRM_RECRUITMENT_SCHEMA_VERSION) {
    throw new Error('A política de recrutamento ainda não está no contrato V1. Revise e salve o editor de Mercado de Trabalho antes de publicar.');
  }
  const recruitment = lawFirmRecruitmentSchema.parse(firm.recruitment);
  validateLawFirmRecruitmentReferences(recruitment, recruitmentReferenceContext(firm));

  const npcIdsToPublish = [];
  for (const member of firm.members) {
    const npc = member.npc;
    if (!npc || !npc.is_active || npc.status === 'archived') throw new Error(`Membro inválido no escritório: ${member.office_title}.`);
    const portrait = npc.metadata?.portrait;
    const validTransparentPng = portrait?.status === 'READY'
      && portrait?.format === 'png'
      && portrait?.transparentBackground === true
      && typeof portrait?.url === 'string'
      && portrait.url.length > 5;
    if (!validTransparentPng) {
      throw new Error(`O NPC ${npc.name} ainda não possui retrato PNG transparente validado. Gere o retrato antes de publicar.`);
    }
    if (npc.status === 'draft') {
      if (npc.metadata?.sourceLawFirmId !== id) {
        throw new Error(`O NPC reutilizado ${npc.name} ainda está em draft. Publique-o separadamente antes de publicar o escritório.`);
      }
      npcIdsToPublish.push(npc.id);
    } else if (npc.status !== 'published') {
      throw new Error(`O NPC ${npc.name} não está disponível para publicação.`);
    }
  }

  const memberSlugs = new Set(firm.members.map((member) => member.npc?.slug).filter(Boolean));
  for (const key of ['assignmentNpcSlug', 'crmOperatorNpcSlug']) {
    const value = typeof firm.case_distribution?.[key] === 'string' ? firm.case_distribution[key].trim() : '';
    if (value && !memberSlugs.has(value)) throw new Error(`${key} aponta para NPC que não é membro deste escritório.`);
  }

  for (const npcId of npcIdsToPublish) await publishEntity('npc', npcId);
  await publishLawFirmGraph(id, []);
  await writeLawFirmAudit('publish_law_firm', id, {
    npcIdsPublished: npcIdsToPublish,
    recruitmentSchemaVersion: recruitment.recruitmentSchemaVersion,
  });
}

export async function archiveLawFirm(id) {
  await archiveLawFirmRow(id);
  await writeLawFirmAudit('archive_law_firm', id);
}

export { buildLawFirmNpcPortraitPrompt };
