'use server';

import { revalidatePath } from 'next/cache';
import {
  listProviderModels,
  listProvidersPublic,
  removeProvider,
  testProvider,
  upsertProvider,
} from '@/services/ai/providerService';

function refresh() {
  revalidatePath('/configuracoes/ia');
  revalidatePath('/studio');
}

export async function listProvidersAction() {
  return listProvidersPublic();
}

export async function saveProviderAction(provider) {
  const saved = await upsertProvider(provider || {});
  refresh();
  return saved;
}

export async function deleteProviderAction(id) {
  await removeProvider(id);
  refresh();
}

export async function testProviderAction(id) {
  return testProvider(id);
}

export async function listModelsAction(id) {
  return listProviderModels(id);
}
