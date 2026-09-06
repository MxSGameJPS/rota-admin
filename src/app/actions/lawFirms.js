'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import {
  archiveLawFirm,
  createGeneratedLawFirm,
  publishLawFirm,
  regenerateLawFirmMemberPortrait,
} from '@/services/lawFirmService';

function fail(route, error) {
  redirect(`${route}?error=${encodeURIComponent(error?.message || String(error) || 'Falha inesperada.')}`);
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
