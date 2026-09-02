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
