import { getSupabaseAdmin } from '@/lib/supabase/server';

function requireClient() {
  const client = getSupabaseAdmin();
  if (!client) throw new Error('Configure SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no .env.local.');
  return client;
}

export async function createDraft(entityType, data) {
  const client = requireClient();
  if (entityType === 'case') {
    const row = { id: data.id, code: data.code, title: data.title, area: data.area, difficulty: data.difficulty, difficulty_stars: data.difficultyStars, deadline_hours: data.deadlineHours, honorarios_reward: data.honorariosReward, xp_reward: data.xpReward, reputation_reward: data.reputationReward, min_career_tier: data.minCareerTier, status: 'draft', is_active: true, content: data.content, metadata: data.metadata || {} };
    const { error } = await client.from('cases').insert(row); if (error) throw error; return data.id;
  }
  if (entityType === 'npc') {
    const row = { slug: data.slug, name: data.name, role_type: data.roleType, profession: data.profession, specialization: data.specialization, jurisdiction: data.jurisdiction, status: 'draft', is_active: true, professional_profile: data.professionalProfile, personality: data.personality, base_memories: data.baseMemories, dialogue_library: data.dialogueLibrary, decision_rules: data.decisionRules, relationships: data.relationships, knowledge: data.knowledge, metadata: data.metadata || {} };
    const { data: created, error } = await client.from('npcs').insert(row).select('id').single(); if (error) throw error; return created.id;
  }
  const row = { id: data.id, sku: data.sku, type: data.type, name: data.name, description: data.description, rarity: data.rarity, price_currency: data.priceCurrency, price_amount: data.priceAmount, status: 'draft', is_active: true, effects: data.effects, content: data.content, metadata: data.metadata || {} };
  const { error } = await client.from('catalog_items').insert(row); if (error) throw error; return data.id;
}

const tableByType = { case: 'cases', npc: 'npcs', item: 'catalog_items' };

export async function publishEntity(entityType, id) {
  const client = requireClient();
  const table = tableByType[entityType];
  const { data: current, error: readError } = await client.from(table).select('*').eq('id', id).single();
  if (readError) throw readError;
  await client.from('content_versions').insert({ entity_type: entityType, entity_id: String(id), version: current.version || 1, snapshot: current });
  const { error } = await client.from(table).update({ status: 'published', is_active: true, published_at: new Date().toISOString() }).eq('id', id);
  if (error) throw error;
  await client.from('admin_audit_logs').insert({ action: 'publish', entity_type: entityType, entity_id: String(id), payload: { version: current.version || 1 } });
}
