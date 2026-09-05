import { getSupabaseAdmin } from '@/lib/supabase/server';

function requireClient() {
  const client = getSupabaseAdmin();
  if (!client) throw new Error('Configure SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no .env.local.');
  return client;
}

function casePayload(data) {
  return {
    code: data.code,
    title: data.title,
    area: data.area,
    difficulty: data.difficulty,
    difficulty_stars: data.difficultyStars,
    deadline_hours: data.deadlineHours,
    honorarios_reward: data.honorariosReward,
    xp_reward: data.xpReward,
    reputation_reward: data.reputationReward,
    min_career_tier: data.minCareerTier,
    content: data.content,
    metadata: data.metadata || {},
    status: 'draft',
    is_active: true,
    published_at: null,
    updated_at: new Date().toISOString(),
  };
}

function cleanPendingMetadata(metadata = {}) {
  const clean = { ...(metadata || {}) };
  delete clean.pendingGranularRepair;
  return clean;
}

async function snapshotPublishedVersionIfNeeded(client, current) {
  const version = Number(current.version || 1);
  const { data: existing, error: lookupError } = await client
    .from('content_versions')
    .select('id')
    .eq('entity_type', 'case')
    .eq('entity_id', String(current.id))
    .eq('version', version)
    .maybeSingle();
  if (lookupError) throw lookupError;
  if (existing) return;

  const { error } = await client.from('content_versions').insert({
    entity_type: 'case',
    entity_id: String(current.id),
    version,
    snapshot: current,
  });
  if (error) throw error;
}

async function syncCaseNpcRelations(client, caseId, content) {
  const assignments = Array.isArray(content?.npcAssignments) ? content.npcAssignments : [];
  const slugs = [...new Set(assignments.map((item) => String(item?.npcSlug || '').trim()).filter(Boolean))];
  let bySlug = new Map();

  if (slugs.length) {
    const { data: npcs, error } = await client
      .from('npcs')
      .select('id,slug,status,is_active')
      .in('slug', slugs);
    if (error) throw error;
    bySlug = new Map((npcs || []).map((npc) => [npc.slug, npc]));

    for (const slug of slugs) {
      const npc = bySlug.get(slug);
      if (!npc) throw new Error(`NPC não encontrado: ${slug}.`);
      if (!npc.is_active) throw new Error(`NPC desativado: ${slug}.`);
      if (npc.status !== 'published') throw new Error(`NPC ainda não publicado: ${slug}. Publique o NPC antes de publicar esta correção.`);
    }
  }

  const rows = assignments.map((item) => ({
    case_id: caseId,
    npc_id: bySlug.get(String(item.npcSlug).trim()).id,
    role_in_case: item.roleInCase,
    is_required: item.isRequired ?? false,
    sort_order: item.sortOrder ?? 0,
    configuration: item.configuration || {},
  }));

  const { error: deleteError } = await client.from('case_npcs').delete().eq('case_id', caseId);
  if (deleteError) throw deleteError;
  if (rows.length) {
    const { error: insertError } = await client.from('case_npcs').insert(rows);
    if (insertError) throw insertError;
  }
}

export async function savePendingCaseRepair(id, candidate, { type = 'granular', summary = 'Correção granular pronta para revisão.' } = {}) {
  const client = requireClient();
  const { data: current, error: readError } = await client
    .from('cases')
    .select('id,status,version,metadata')
    .eq('id', id)
    .single();
  if (readError) throw readError;
  if (current.status !== 'published') throw new Error('Pendências de revisão só são usadas em casos publicados.');

  const candidateMetadata = cleanPendingMetadata(candidate?.metadata || {});
  const pendingGranularRepair = {
    type,
    summary,
    createdAt: new Date().toISOString(),
    baseVersion: Number(current.version || 1),
    candidate: {
      content: candidate.content,
      metadata: candidateMetadata,
    },
  };

  const metadata = {
    ...(current.metadata || {}),
    pendingGranularRepair,
  };

  const { error: updateError } = await client
    .from('cases')
    .update({ metadata, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (updateError) throw updateError;

  await client.from('admin_audit_logs').insert({
    action: 'stage_case_granular_repair',
    entity_type: 'case',
    entity_id: String(id),
    payload: { type, summary, baseVersion: Number(current.version || 1) },
  });

  return pendingGranularRepair;
}

export async function publishPendingCaseRepair(id) {
  const client = requireClient();
  const { data: current, error: readError } = await client
    .from('cases')
    .select('*')
    .eq('id', id)
    .single();
  if (readError) throw readError;
  if (current.status !== 'published') throw new Error('Esta ação publica correções pendentes de um caso já publicado.');

  const pending = current.metadata?.pendingGranularRepair;
  if (!pending?.candidate?.content) throw new Error('Não existe correção pendente para publicar.');
  if (Number(pending.baseVersion || 0) !== Number(current.version || 1)) {
    throw new Error('A correção pendente foi criada sobre outra versão do caso. Descarte-a e gere novamente para evitar sobrescrever alterações recentes.');
  }

  const nextMetadata = cleanPendingMetadata(pending.candidate.metadata || current.metadata || {});
  const nextContent = pending.candidate.content;
  await syncCaseNpcRelations(client, id, nextContent);
  await snapshotPublishedVersionIfNeeded(client, current);

  const nextVersion = Number(current.version || 1) + 1;
  const { error: updateError } = await client
    .from('cases')
    .update({
      content: nextContent,
      metadata: nextMetadata,
      version: nextVersion,
      status: 'published',
      is_active: true,
      published_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', id);
  if (updateError) throw updateError;

  await client.from('admin_audit_logs').insert({
    action: 'publish_case_granular_repair',
    entity_type: 'case',
    entity_id: String(id),
    payload: {
      previousVersion: Number(current.version || 1),
      newVersion: nextVersion,
      repairType: pending.type || 'granular',
      summary: pending.summary || '',
    },
  });

  return { version: nextVersion };
}

export async function discardPendingCaseRepair(id) {
  const client = requireClient();
  const { data: current, error: readError } = await client
    .from('cases')
    .select('metadata,status')
    .eq('id', id)
    .single();
  if (readError) throw readError;
  if (!current.metadata?.pendingGranularRepair) return;

  const metadata = cleanPendingMetadata(current.metadata || {});
  const { error: updateError } = await client
    .from('cases')
    .update({ metadata, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (updateError) throw updateError;

  await client.from('admin_audit_logs').insert({
    action: 'discard_case_granular_repair',
    entity_type: 'case',
    entity_id: String(id),
    payload: { previousStatus: current.status },
  });
}

export async function replaceCaseWithRegeneratedDraft(id, data) {
  const client = requireClient();
  const { data: current, error: readError } = await client
    .from('cases')
    .select('id,code,title,status,version')
    .eq('id', id)
    .single();
  if (readError) throw readError;

  const nextVersion = current.status === 'published'
    ? Number(current.version || 1) + 1
    : Number(current.version || 1);

  const payload = {
    ...casePayload({ ...data, id: current.id, code: current.code }),
    code: current.code,
    version: nextVersion,
  };

  const { error: relationError } = await client.from('case_npcs').delete().eq('case_id', id);
  if (relationError) throw relationError;

  const { error: updateError } = await client.from('cases').update(payload).eq('id', id);
  if (updateError) throw updateError;

  await client.from('admin_audit_logs').insert({
    action: 'regenerate_case_draft',
    entity_type: 'case',
    entity_id: String(id),
    payload: {
      previous_status: current.status,
      previous_version: Number(current.version || 1),
      new_version: nextVersion,
      source: 'ai-repair',
    },
  });

  return { id: current.id, code: current.code, version: nextVersion };
}

export async function deleteCasePermanently(id) {
  const client = requireClient();
  const { data: current, error: readError } = await client
    .from('cases')
    .select('id,code,title,status,version')
    .eq('id', id)
    .single();
  if (readError) throw readError;

  const { error: versionsError } = await client
    .from('content_versions')
    .delete()
    .eq('entity_type', 'case')
    .eq('entity_id', String(id));
  if (versionsError) throw versionsError;

  const { error: relationsError } = await client.from('case_npcs').delete().eq('case_id', id);
  if (relationsError) throw relationsError;

  const { error: deleteError } = await client.from('cases').delete().eq('id', id);
  if (deleteError) throw deleteError;

  await client.from('admin_audit_logs').insert({
    action: 'delete_case',
    entity_type: 'case',
    entity_id: String(id),
    payload: {
      code: current.code,
      title: current.title,
      status: current.status,
      version: Number(current.version || 1),
    },
  });
}
