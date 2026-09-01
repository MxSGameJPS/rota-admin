'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { generateStructured } from '@/lib/ai/provider';
import { ENTITY_SCHEMAS } from '@/schemas/contracts';
import { createDraft, publishEntity } from '@/services/contentService';

const routeByType = { case: '/cases', npc: '/npcs', item: '/shop' };

export async function generateDraftAction(entityType, formData) {
  const prompt = String(formData.get('prompt') || '').trim();
  if (prompt.length < 10) redirect(`${routeByType[entityType]}?error=${encodeURIComponent('Descreva melhor o conteúdo.')}`);
  try {
    const generated = await generateStructured(entityType, prompt);
    const parsed = ENTITY_SCHEMAS[entityType].parse(generated);
    await createDraft(entityType, parsed);
    revalidatePath(routeByType[entityType]);
  } catch (error) {
    redirect(`${routeByType[entityType]}?error=${encodeURIComponent(error.message || 'Falha ao gerar conteúdo.')}`);
  }
  redirect(`${routeByType[entityType]}?created=1`);
}

export async function publishAction(entityType, formData) {
  const id = String(formData.get('id') || '');
  try { await publishEntity(entityType, id); revalidatePath(routeByType[entityType]); }
  catch (error) { redirect(`${routeByType[entityType]}?error=${encodeURIComponent(error.message || 'Falha ao publicar.')}`); }
  redirect(`${routeByType[entityType]}?published=1`);
}
