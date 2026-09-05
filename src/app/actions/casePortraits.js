'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { ENTITY_SCHEMAS } from '@/schemas/contracts';
import { automateGeneratedCaseAssets } from '@/services/caseAssetAutomationService';
import {
  getEntityForEditor,
  listPublishedNpcGenerationContext,
  updateDraft,
  validateCaseNpcAssignments,
} from '@/services/contentService';

export async function retryCasePortraitsAction(formData) {
  const id = String(formData.get('id') || '').trim();
  const route = `/cases/${id}`;
  if (!id) redirect('/cases?error=' + encodeURIComponent('Caso inválido para reprocessar retratos.'));

  try {
    const current = await getEntityForEditor('case', id);
    if (current.status !== 'draft') {
      redirect(`${route}?error=${encodeURIComponent('Retratos pendentes só podem ser reprocessados enquanto o caso estiver em draft.')}`);
    }

    const previousAutomation = current.metadata?.automation && typeof current.metadata.automation === 'object'
      ? current.metadata.automation
      : {};
    const publishedNpcs = await listPublishedNpcGenerationContext();
    const retried = await automateGeneratedCaseAssets(current, { publishedNpcs });
    const retryAutomation = retried.metadata?.automation && typeof retried.metadata.automation === 'object'
      ? retried.metadata.automation
      : {};

    const parsed = ENTITY_SCHEMAS.case.parse({
      ...retried,
      metadata: {
        ...(retried.metadata || {}),
        automation: {
          ...previousAutomation,
          ...retryAutomation,
          generatedNpcDrafts: Array.isArray(previousAutomation.generatedNpcDrafts)
            ? previousAutomation.generatedNpcDrafts
            : (retryAutomation.generatedNpcDrafts || []),
          reusedNpcAssignments: Array.isArray(previousAutomation.reusedNpcAssignments)
            ? previousAutomation.reusedNpcAssignments
            : (retryAutomation.reusedNpcAssignments || []),
          localPortraitsGenerated: Number(previousAutomation.localPortraitsGenerated || 0)
            + Number(retryAutomation.localPortraitsGenerated || 0),
          warnings: Array.isArray(retryAutomation.warnings) ? retryAutomation.warnings : [],
          portraitsRetriedAt: new Date().toISOString(),
        },
      },
    });

    await validateCaseNpcAssignments(parsed.content, { allowDraft: true });
    await updateDraft('case', id, parsed);
    revalidatePath(route);
  } catch (error) {
    if (error?.digest?.startsWith?.('NEXT_REDIRECT')) throw error;
    redirect(`${route}?error=${encodeURIComponent(error.message || 'Falha ao reprocessar retratos pendentes.')}`);
  }

  redirect(`${route}?portraitsRetried=1`);
}
