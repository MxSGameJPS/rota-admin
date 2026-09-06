'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import {
  archiveLawFirm,
  createGeneratedLawFirm,
  publishLawFirm,
  regenerateLawFirmMemberPortrait,
  updateLawFirmRecruitmentPolicy,
} from '@/services/lawFirmService';

function fail(route, error) {
  redirect(`${route}?error=${encodeURIComponent(error?.message || String(error) || 'Falha inesperada.')}`);
}

function bool(formData, name) {
  return formData.get(name) === 'on';
}

function number(formData, name, fallback = 0) {
  const raw = String(formData.get(name) ?? '').trim();
  if (!raw) return fallback;
  const parsed = Number(raw.replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : fallback;
}

function text(formData, name) {
  const value = String(formData.get(name) || '').trim();
  return value || null;
}

function list(formData, name) {
  return formData.getAll(name).map((value) => String(value).trim()).filter(Boolean);
}

function recruitmentFromForm(formData) {
  return {
    recruitmentSchemaVersion: 1,
    internshipRecruitment: {
      enabled: bool(formData, 'internshipEnabled'),
      roleCode: text(formData, 'internshipRoleCode'),
      minimumReputation: number(formData, 'internshipMinimumReputation'),
      minimumXp: number(formData, 'internshipMinimumXp'),
      minimumCasesSolved: number(formData, 'internshipMinimumCasesSolved'),
      minimumEthics: number(formData, 'internshipMinimumEthics'),
    },
    postOabOffer: {
      enabled: bool(formData, 'postOabEnabled'),
      roleCode: text(formData, 'postOabRoleCode'),
      minimumReputation: number(formData, 'postOabMinimumReputation'),
      minimumXp: number(formData, 'postOabMinimumXp'),
      minimumCasesSolved: number(formData, 'postOabMinimumCasesSolved'),
      minimumEthics: number(formData, 'postOabMinimumEthics'),
      requiredSpecialties: list(formData, 'postOabRequiredSpecialties'),
    },
    continuity: {
      enabled: bool(formData, 'continuityEnabled'),
      internshipPerformanceWeight: number(formData, 'continuityPerformanceWeight', 70),
      minimumPerformance: number(formData, 'continuityMinimumPerformance', 50),
      guaranteedPerformance: number(formData, 'continuityGuaranteedPerformance', 80),
    },
    headhunting: {
      enabled: bool(formData, 'headhuntingEnabled'),
      eligibleRoleCodes: list(formData, 'headhuntingRoleCodes'),
      minimumReputation: number(formData, 'headhuntingMinimumReputation'),
      minimumXp: number(formData, 'headhuntingMinimumXp'),
      minimumCasesSolved: number(formData, 'headhuntingMinimumCasesSolved'),
      minimumEthics: number(formData, 'headhuntingMinimumEthics'),
      requiredSpecialties: list(formData, 'headhuntingRequiredSpecialties'),
      evaluationChance: number(formData, 'headhuntingEvaluationChancePercent', 15) / 100,
      cooldownGameDays: number(formData, 'headhuntingCooldownGameDays', 90),
    },
    applications: {
      enabled: bool(formData, 'applicationsEnabled'),
      eligibleRoleCodes: list(formData, 'applicationsRoleCodes'),
      minimumReputation: number(formData, 'applicationsMinimumReputation'),
      minimumXp: number(formData, 'applicationsMinimumXp'),
      minimumCasesSolved: number(formData, 'applicationsMinimumCasesSolved'),
      minimumEthics: number(formData, 'applicationsMinimumEthics'),
      requiredSpecialties: list(formData, 'applicationsRequiredSpecialties'),
      cooldownGameDays: number(formData, 'applicationsCooldownGameDays', 30),
    },
    postTermination: {
      enabled: bool(formData, 'postTerminationEnabled'),
      eligibleRoleCodes: list(formData, 'postTerminationRoleCodes'),
      minimumReputation: number(formData, 'postTerminationMinimumReputation'),
      minimumXp: number(formData, 'postTerminationMinimumXp'),
      minimumCasesSolved: number(formData, 'postTerminationMinimumCasesSolved'),
      minimumEthics: number(formData, 'postTerminationMinimumEthics'),
      requiredSpecialties: list(formData, 'postTerminationRequiredSpecialties'),
      cooldownGameDays: number(formData, 'postTerminationCooldownGameDays', 15),
    },
  };
}

export async function generateLawFirmAction(formData) {
  const prompt = String(formData.get('prompt') || '').trim();
  try {
    const firm = await createGeneratedLawFirm(prompt);
    revalidatePath('/law-firms');
    revalidatePath('/npcs');
    redirect(`/law-firms/${firm.id}?created=1`);
  } catch (error) {
    if (error?.digest?.startsWith?.('NEXT_REDIRECT')) throw error;
    fail('/law-firms', error);
  }
}

export async function updateLawFirmRecruitmentAction(id, formData) {
  const route = `/law-firms/${id}`;
  try {
    await updateLawFirmRecruitmentPolicy(id, recruitmentFromForm(formData));
    revalidatePath(route);
    revalidatePath('/law-firms');
    redirect(`${route}?recruitmentSaved=1`);
  } catch (error) {
    if (error?.digest?.startsWith?.('NEXT_REDIRECT')) throw error;
    fail(route, error);
  }
}

export async function publishLawFirmAction(id) {
  const route = `/law-firms/${id}`;
  try {
    await publishLawFirm(id);
    revalidatePath(route);
    revalidatePath('/law-firms');
    revalidatePath('/npcs');
    redirect(`${route}?published=1`);
  } catch (error) {
    if (error?.digest?.startsWith?.('NEXT_REDIRECT')) throw error;
    fail(route, error);
  }
}

export async function regenerateLawFirmPortraitAction(firmId, npcId) {
  const route = `/law-firms/${firmId}`;
  try {
    await regenerateLawFirmMemberPortrait(firmId, npcId);
    revalidatePath(route);
    revalidatePath(`/npcs/${npcId}`);
    redirect(`${route}?portrait=${encodeURIComponent(npcId)}`);
  } catch (error) {
    if (error?.digest?.startsWith?.('NEXT_REDIRECT')) throw error;
    fail(route, error);
  }
}

export async function archiveLawFirmAction(id) {
  try {
    await archiveLawFirm(id);
    revalidatePath('/law-firms');
    redirect('/law-firms?archived=1');
  } catch (error) {
    if (error?.digest?.startsWith?.('NEXT_REDIRECT')) throw error;
    fail(`/law-firms/${id}`, error);
  }
}
