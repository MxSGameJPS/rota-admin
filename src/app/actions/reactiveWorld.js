'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { getEntityForEditor } from '@/services/contentService';
import {
  generateCaseReactiveWorld,
  saveCaseReactiveWorld,
} from '@/services/caseReactiveWorldService';

export async function generateCaseReactiveWorldAction(formData) {
  const id = String(formData.get('id') || '').trim();
  const extraPrompt = String(formData.get('prompt') || '').trim();
  const route = `/cases/${id}`;
  if (!id) redirect('/cases?error=Caso%20inv%C3%A1lido.');

  try {
    const current = await getEntityForEditor('case', id);
    const config = await generateCaseReactiveWorld(current, extraPrompt);
    const saved = await saveCaseReactiveWorld(id, config);
    revalidatePath(route);
    revalidatePath('/cases');
    redirect(`${route}?reactiveGenerated=1&version=${saved.version}`);
  } catch (error) {
    if (error?.digest?.startsWith?.('NEXT_REDIRECT')) throw error;
    redirect(`${route}?error=${encodeURIComponent(error.message || 'Falha ao gerar o mundo reativo do caso.')}`);
  }
}
