'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { generateStructured } from '@/lib/ai/provider';
import { ENTITY_SCHEMAS } from '@/schemas/contracts';
import {
  createDraft,
  publishEntity,
  updateDraft,
  createCurrency,
  createReward,
  publishReward,
  activateFeature,
  saveSetting,
  listPublishedNpcGenerationContext,
  validateCaseNpcAssignments,
  getEntityForEditor,
} from '@/services/contentService';
import {
  automateGeneratedCaseAssets,
  automateGeneratedNpcPortrait,
} from '@/services/caseAssetAutomationService';
import { generateCaseReactiveWorld } from '@/services/caseReactiveWorldService';
import { deleteCasePermanently, replaceCaseWithRegeneratedDraft } from '@/services/caseMaintenanceService';

const routeByType = { case: '/cases', npc: '/npcs', item: '/shop' };
const detailByType = { case: '/cases', npc: '/npcs', item: '/shop' };
const fail = (route, message) => redirect(`${route}?error=${encodeURIComponent(message)}`);

async function attachGeneratedReactiveWorld(caseModel) {
  try {
    const reactiveWorld = await generateCaseReactiveWorld(caseModel);
    return ENTITY_SCHEMAS.case.parse({
      ...caseModel,
      metadata: {
        ...(caseModel.metadata || {}),
        reactiveWorld,
      },
    });
  } catch (error) {
    const metadata = caseModel.metadata || {};
    const automation = metadata.automation && typeof metadata.automation === 'object'
      ? metadata.automation
      : {};
    const warnings = Array.isArray(automation.warnings) ? automation.warnings : [];
    return ENTITY_SCHEMAS.case.parse({
      ...caseModel,
      metadata: {
        ...metadata,
        automation: {
          ...automation,
          warnings: [
            ...warnings,
            `O caso foi criado, mas o mundo reativo específico não pôde ser gerado automaticamente: ${error.message || 'falha desconhecida'}. Use o painel Mundo reativo específico do caso para tentar novamente.`,
          ],
        },
      },
    });
  }
}

function compactRepairCase(current) {
  const content = current?.content && typeof current.content === 'object' ? current.content : {};
  const locations = Array.isArray(content.locations) ? content.locations : [];
  const clues = Array.isArray(content.availableClues) ? content.availableClues : [];
  const strategies = Array.isArray(content.strategies) ? content.strategies : [];

  return {
    id: current.id,
    code: current.code,
    title: current.title,
    area: current.area,
    difficulty: current.difficulty,
    difficultyStars: current.difficultyStars,
    deadlineHours: current.deadlineHours,
    client: content.client,
    briefing: content.briefing,
    locations: locations.map((location) => ({
      id: location.id,
      name: location.name,
      category: location.category,
      description: location.description,
      address: location.address,
      characters: Array.isArray(location.characters)
        ? location.characters.map((character) => ({
            id: character.id,
            name: character.name,
            role: character.role,
            initialDialogue: character.initialDialogue,
          }))
        : [],
    })),
    availableClues: clues.map((clue) => ({
      id: clue.id,
      title: clue.title,
      type: clue.type,
      relevance: clue.relevance,
      isAuthentic: clue.isAuthentic,
      summary: clue.summary,
      legalSignificance: clue.legalSignificance,
      locationFoundId: clue.locationFoundId,
    })),
    strategies: strategies.map((strategy) => ({
      id: strategy.id,
      title: strategy.title,
      description: strategy.description,
      isOptimal: strategy.isOptimal,
      requiredCrucialClueIds: strategy.requiredCrucialClueIds || [],
      incompatibleClueIds: strategy.incompatibleClueIds || [],
    })),
    npcAssignments: Array.isArray(content.npcAssignments) ? content.npcAssignments : [],
  };
}

export async function generateDraftAction(entityType, formData) {
  const prompt = String(formData.get('prompt') || '').trim();
  if (prompt.length < 10) fail(routeByType[entityType], 'Descreva melhor o conteúdo.');
  let id;
  try {
    const context = entityType === 'case'
      ? { publishedNpcs: await listPublishedNpcGenerationContext() }
      : {};
    const generated = await generateStructured(entityType, prompt, context);
    let parsed = ENTITY_SCHEMAS[entityType].parse(generated);

    if (entityType === 'case') {
      parsed = await automateGeneratedCaseAssets(parsed, { publishedNpcs: context.publishedNpcs });
      parsed = ENTITY_SCHEMAS.case.parse(parsed);
      await validateCaseNpcAssignments(parsed.content, { allowDraft: true });
      parsed = await attachGeneratedReactiveWorld(parsed);
    } else if (entityType === 'npc') {
      parsed = await automateGeneratedNpcPortrait(parsed);
      parsed = ENTITY_SCHEMAS.npc.parse(parsed);
    }

    id = await createDraft(entityType, parsed);
    revalidatePath(routeByType[entityType]);
    if (entityType === 'case') revalidatePath('/npcs');
  } catch (error) {
    fail(routeByType[entityType], error.message || 'Falha ao gerar conteúdo.');
  }
  redirect(`${detailByType[entityType]}/${id}?created=1`);
}

export async function updateJsonAction(entityType, formData) {
  const id = String(formData.get('id') || '');
  const route = `${detailByType[entityType]}/${id}`;
  try {
    const raw = JSON.parse(String(formData.get('json') || '{}'));
    if (entityType === 'npc') delete raw.id;
    const parsed = ENTITY_SCHEMAS[entityType].parse(raw);
    if (entityType === 'case') await validateCaseNpcAssignments(parsed.content, { allowDraft: true });
    await updateDraft(entityType, id, parsed);
    revalidatePath(route);
  } catch (error) {
    fail(route, error.message || 'JSON inválido.');
  }
  redirect(`${route}?updated=1`);
}

export async function publishAction(entityType, formData) {
  const id = String(formData.get('id') || '');
  try {
    const current = await getEntityForEditor(entityType, id);
    const candidate = entityType === 'npc' ? (() => { const copy = { ...current }; delete copy.id; return copy; })() : current;
    const parsed = ENTITY_SCHEMAS[entityType].parse(candidate);
    if (entityType === 'case') await validateCaseNpcAssignments(parsed.content, { allowDraft: false });
    await publishEntity(entityType, id);
    revalidatePath(routeByType[entityType]);
  } catch (error) {
    fail(`${detailByType[entityType]}/${id}`, error.message || 'Falha ao publicar.');
  }
  redirect(`${routeByType[entityType]}?published=1`);
}

export async function regenerateCaseAction(formData) {
  const id = String(formData.get('id') || '').trim();
  const route = `/cases/${id}`;
  if (!id) fail('/cases', 'Caso inválido para regeneração.');
  try {
    const current = await getEntityForEditor('case', id);
    const publishedNpcs = await listPublishedNpcGenerationContext();
    const repairContext = compactRepairCase(current);
    const repairPrompt = [
      'RECONSTRUA E REPARE este caso existente do Rota da Justiça para o contrato jogável atual.',
      'Preserve a premissa, os personagens centrais, a área, a dificuldade e a identidade narrativa sempre que possível.',
      'Preserve também vínculos de NPCs persistentes que continuarem coerentes com a nova estrutura.',
      'Não traduza nomes de propriedades do schema para português.',
      'Reconstrua locais investigáveis, personagens locais, diálogos, pontos pesquisáveis, pistas e estratégias coerentes entre si.',
      'Todos os IDs e referências internas precisam existir e fechar corretamente.',
      'Todo personagem local conversável precisa de appearanceProfile para geração automática do retrato.',
      'O id e o code serão preservados pelo servidor; concentre-se em reparar o conteúdo.',
      'PARA EVITAR TRUNCAMENTO, seja objetivo: prefira 2 a 4 locais, 4 a 8 pistas, 2 a 4 estratégias, 1 a 2 personagens por local e 1 a 3 interações relevantes por personagem.',
      'Não repita fatos em vários campos. Preserve riqueza jurídica, mas mantenha textos narrativos concisos.',
      'RESUMO ESTRUTURADO DO CASO ATUAL A PRESERVAR:',
      JSON.stringify(repairContext),
    ].join('\n\n');
    const generated = await generateStructured('case', repairPrompt, { publishedNpcs, repairCase: repairContext });
    let parsed = ENTITY_SCHEMAS.case.parse({
      ...generated,
      id: current.id,
      code: current.code,
      status: 'draft',
    });
    parsed = await automateGeneratedCaseAssets(parsed, { publishedNpcs });
    parsed = ENTITY_SCHEMAS.case.parse(parsed);
    await validateCaseNpcAssignments(parsed.content, { allowDraft: true });
    parsed = await attachGeneratedReactiveWorld(parsed);
    const result = await replaceCaseWithRegeneratedDraft(id, parsed);
    revalidatePath('/cases');
    revalidatePath('/npcs');
    revalidatePath(route);
    redirect(`${route}?regenerated=1&version=${result.version}`);
  } catch (error) {
    if (error?.digest?.startsWith?.('NEXT_REDIRECT')) throw error;
    fail(route, error.message || 'Falha ao regenerar o caso com IA.');
  }
}

export async function deleteCaseAction(formData) {
  const id = String(formData.get('id') || '').trim();
  if (!id) fail('/cases', 'Caso inválido para exclusão.');
  try {
    await deleteCasePermanently(id);
    revalidatePath('/cases');
  } catch (error) {
    fail(`/cases/${id}`, error.message || 'Falha ao excluir o caso.');
  }
  redirect('/cases?deleted=1');
}

export async function createCurrencyAction(formData) {
  try {
    await createCurrency({
      id: String(formData.get('id') || '').trim(),
      name: String(formData.get('name') || '').trim(),
      symbol: String(formData.get('symbol') || '').trim(),
      currencyType: String(formData.get('currencyType') || 'common'),
    });
    revalidatePath('/economy');
  } catch (error) {
    fail('/economy', error.message);
  }
  redirect('/economy?created=currency');
}

export async function createRewardAction(formData) {
  try {
    const conditions = JSON.parse(String(formData.get('conditions') || '{}'));
    const reward = JSON.parse(String(formData.get('reward') || '{}'));
    await createReward({
      id: String(formData.get('id') || '').trim(),
      name: String(formData.get('name') || '').trim(),
      triggerType: String(formData.get('triggerType') || '').trim(),
      conditions,
      reward,
      claimPolicy: String(formData.get('claimPolicy') || 'once'),
    });
    revalidatePath('/economy');
  } catch (error) {
    fail('/economy', error.message);
  }
  redirect('/economy?created=reward');
}

export async function publishRewardAction(formData) {
  try {
    await publishReward(String(formData.get('id') || ''));
    revalidatePath('/economy');
  } catch (error) {
    fail('/economy', error.message);
  }
  redirect('/economy?published=reward');
}

export async function activateFeatureAction(formData) {
  try {
    await activateFeature(String(formData.get('id') || ''));
    revalidatePath('/social-juridico');
  } catch (error) {
    fail('/social-juridico', error.message);
  }
  redirect('/social-juridico?published=1');
}

export async function saveSettingAction(formData) {
  try {
    await saveSetting(
      String(formData.get('key') || '').trim(),
      JSON.parse(String(formData.get('value') || '{}')),
      String(formData.get('description') || '').trim(),
    );
    revalidatePath('/progression');
  } catch (error) {
    fail('/progression', error.message);
  }
  redirect('/progression?saved=1');
}