import { getSupabaseAdmin } from '@/lib/supabase/server';
import { generateWithDefaultProvider } from '@/services/ai/providerService';
import {
  CASE_REACTIVE_WORLD_SCHEMA_JSON,
  caseReactiveWorldSchema,
  validateReactiveWorldReferences,
} from '@/schemas/caseReactiveWorld';

const TIMEOUT_MS = 300000;

function requireClient() {
  const client = getSupabaseAdmin();
  if (!client) throw new Error('Configure SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no .env.local.');
  return client;
}

function parseJson(text) {
  const raw = String(text || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  if (!raw) throw new Error('A IA não retornou conteúdo para o mundo reativo.');
  try { return JSON.parse(raw); } catch {}
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start >= 0 && end > start) {
    try { return JSON.parse(raw.slice(start, end + 1)); } catch {}
  }
  throw new Error('A IA retornou JSON inválido ao criar intercorrências e audiência.');
}

function compactCaseContext(caseModel) {
  const content = caseModel.content || {};
  return {
    id: caseModel.id,
    code: caseModel.code,
    title: caseModel.title,
    area: caseModel.area,
    difficulty: caseModel.difficulty,
    deadlineHours: caseModel.deadlineHours,
    client: content.client,
    briefing: content.briefing,
    clues: (content.availableClues || []).map((clue) => ({
      id: clue.id,
      title: clue.title,
      type: clue.type,
      relevance: clue.relevance,
      isAuthentic: clue.isAuthentic,
      summary: clue.summary,
      legalSignificance: clue.legalSignificance,
    })),
    strategies: (content.strategies || []).map((strategy) => ({
      id: strategy.id,
      title: strategy.title,
      description: strategy.description,
      isOptimal: strategy.isOptimal,
      requiredCrucialClueIds: strategy.requiredCrucialClueIds,
      incompatibleClueIds: strategy.incompatibleClueIds || [],
    })),
    characters: (content.locations || []).flatMap((location) =>
      (location.characters || []).map((character) => ({
        id: character.id,
        name: character.name,
        role: character.role,
        locationId: location.id,
      })),
    ),
    npcAssignments: content.npcAssignments || [],
  };
}

function systemPrompt() {
  return [
    'Você cria conteúdo jogável para o Rota da Justiça.',
    'Sua tarefa é criar INTERCORRÊNCIAS e, quando fizer sentido, uma AUDIÊNCIA específicas para UM caso já existente.',
    'Retorne somente JSON válido, sem markdown e sem texto fora do JSON.',
    'Não use situações genéricas se os fatos do caso permitirem algo específico. Cada evento deve citar fatos, pessoas, documentos, riscos ou contradições coerentes com o processo recebido.',
    'Crie normalmente 2 a 4 intercorrências. Distribua os gatilhos ao longo da investigação usando trigger.minActions entre 2 e 8. trigger.deadlineRatio pode ser null ou um valor entre 0 e 1 quando o evento fizer sentido perto do prazo.',
    'Cada escolha deve representar uma decisão profissional plausível; não marque visualmente qual é a melhor. scoreModifier positivo fortalece a preparação, negativo enfraquece; timePenaltyHours consome prazo; professionalRisk mede risco profissional.',
    'Se relatedClueId for usado, ele deve ser exatamente o ID de uma pista existente no contexto. Use null quando o evento não depender de uma pista específica.',
    'A audiência deve ser criada quando o caso tiver depoimentos, pessoas relevantes, controvérsia fática ou prova que possa ser confrontada oralmente. Caso contrário, hearing pode ser null.',
    'Quando criar audiência, faça entre 3 e 5 etapas realmente ligadas ao caso: contradição concreta, escolha de prova, impugnação, pergunta a pessoa específica, sustentação final etc.',
    'Nas escolhas da audiência, impact positivo representa uma condução tecnicamente melhor e impact negativo representa erro ou perda de credibilidade. Não use campo correct; o jogo infere pelo impacto.',
    'Nunca invente IDs de pistas em relatedClueId.',
    'JSON Schema obrigatório:',
    JSON.stringify(CASE_REACTIVE_WORLD_SCHEMA_JSON),
  ].join('\n\n');
}

export async function generateCaseReactiveWorld(caseModel, extraPrompt = '') {
  const context = compactCaseContext(caseModel);
  const prompt = [
    'Crie o mundo reativo específico deste caso.',
    extraPrompt ? `ORIENTAÇÃO EXTRA DO ADMINISTRADOR: ${extraPrompt}` : '',
    'CASO:',
    JSON.stringify(context),
  ].filter(Boolean).join('\n\n');

  const result = await generateWithDefaultProvider({
    prompt,
    systemPrompt: systemPrompt(),
    timeoutMs: TIMEOUT_MS,
  });
  const parsed = caseReactiveWorldSchema.parse(parseJson(result.text));
  return validateReactiveWorldReferences(parsed, caseModel);
}

async function snapshotPublishedVersionIfNeeded(client, caseId, version, current) {
  const { data: existing, error: lookupError } = await client
    .from('content_versions')
    .select('id')
    .eq('entity_type', 'case')
    .eq('entity_id', String(caseId))
    .eq('version', version)
    .maybeSingle();
  if (lookupError) throw lookupError;
  if (existing) return;

  const { error: versionError } = await client.from('content_versions').insert({
    entity_type: 'case',
    entity_id: String(caseId),
    version,
    snapshot: current,
  });
  if (versionError) throw versionError;
}

export async function saveCaseReactiveWorld(caseId, config) {
  const client = requireClient();
  const { data: current, error: readError } = await client.from('cases').select('*').eq('id', caseId).single();
  if (readError) throw readError;

  const metadata = { ...(current.metadata || {}), reactiveWorld: config };
  const currentVersion = Number(current.version || 1);
  const nextVersion = current.status === 'published' ? currentVersion + 1 : currentVersion;

  if (current.status === 'published') {
    await snapshotPublishedVersionIfNeeded(client, caseId, currentVersion, current);
  }

  const { error: updateError } = await client
    .from('cases')
    .update({
      metadata,
      version: nextVersion,
      ...(current.status === 'published' ? { published_at: new Date().toISOString() } : {}),
    })
    .eq('id', caseId);
  if (updateError) throw updateError;

  await client.from('admin_audit_logs').insert({
    action: 'update_case_reactive_world',
    entity_type: 'case',
    entity_id: String(caseId),
    payload: {
      version: nextVersion,
      events: config.events.length,
      hearingRounds: config.hearing?.rounds?.length || 0,
      source: 'ai-generator',
    },
  });

  return { version: nextVersion, status: current.status };
}
