import { getSupabaseAdmin } from '@/lib/supabase/server';

const tableByType = { case: 'cases', npc: 'npcs', item: 'catalog_items' };
function requireClient() { const client = getSupabaseAdmin(); if (!client) throw new Error('Configure SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no .env.local.'); return client; }
function caseRow(data) { return { id: data.id, code: data.code, title: data.title, area: data.area, difficulty: data.difficulty, difficulty_stars: data.difficultyStars, deadline_hours: data.deadlineHours, honorarios_reward: data.honorariosReward, xp_reward: data.xpReward, reputation_reward: data.reputationReward, min_career_tier: data.minCareerTier, status: 'draft', is_active: true, content: data.content, metadata: data.metadata || {} }; }
function npcRow(data) { return { slug: data.slug, name: data.name, role_type: data.roleType, profession: data.profession, specialization: data.specialization, jurisdiction: data.jurisdiction, status: 'draft', is_active: true, professional_profile: data.professionalProfile, personality: data.personality, base_memories: data.baseMemories, dialogue_library: data.dialogueLibrary, decision_rules: data.decisionRules, relationships: data.relationships, knowledge: data.knowledge, metadata: data.metadata || {} }; }
function itemRow(data) { return { id: data.id, sku: data.sku, type: data.type, name: data.name, description: data.description, rarity: data.rarity, price_currency: data.priceCurrency, price_amount: data.priceAmount, status: 'draft', is_active: true, effects: data.effects, content: data.content, metadata: data.metadata || {} }; }

async function valueExists(client, column, value) {
  const { data, error } = await client.from('cases').select(column).eq(column, value).maybeSingle();
  if (error) throw error;
  return Boolean(data);
}

async function allocateUniqueCaseValue(client, column, desired) {
  const original = String(desired || '').trim();
  if (!original) throw new Error(`O campo ${column} do caso não pode ficar vazio.`);
  if (!(await valueExists(client, column, original))) return original;

  const match = original.match(/^(.*?)(\d+)$/);
  const prefix = match ? match[1] : `${original}-`;
  const width = match ? match[2].length : 0;
  let next = match ? Number(match[2]) + 1 : 2;

  for (let attempt = 0; attempt < 500; attempt += 1, next += 1) {
    const candidate = match ? `${prefix}${String(next).padStart(width, '0')}` : `${prefix}${next}`;
    if (!(await valueExists(client, column, candidate))) return candidate;
  }
  throw new Error(`Não foi possível gerar um ${column} único para o caso.`);
}

export async function listPublishedNpcGenerationContext() {
  const client = requireClient();
  const { data, error } = await client
    .from('npcs')
    .select('slug,name,role_type,profession,specialization,jurisdiction,professional_profile,personality')
    .eq('status', 'published')
    .eq('is_active', true)
    .order('name');
  if (error) throw error;
  return (data || []).map((npc) => ({
    slug: npc.slug,
    name: npc.name,
    roleType: npc.role_type,
    profession: npc.profession,
    specialization: npc.specialization,
    jurisdiction: npc.jurisdiction,
    professionalProfile: npc.professional_profile || {},
    personality: npc.personality || {},
  }));
}

async function validateCaseNpcReferences(client, content) {
  const assignments = Array.isArray(content?.npcAssignments) ? content.npcAssignments : [];
  if (!assignments.length) return { assignments, bySlug: new Map() };

  const slugs = [...new Set(assignments.map((item) => String(item.npcSlug || '').trim()).filter(Boolean))];
  if (slugs.length !== assignments.length && assignments.some((item) => !String(item.npcSlug || '').trim())) {
    throw new Error('Existe uma referência de NPC sem npcSlug válido no caso.');
  }

  const { data: npcs, error } = await client.from('npcs').select('id,slug,name,status,is_active').in('slug', slugs);
  if (error) throw error;
  const bySlug = new Map((npcs || []).map((npc) => [npc.slug, npc]));

  for (const slug of slugs) {
    const npc = bySlug.get(slug);
    if (!npc) {
      throw new Error(`NPC não encontrado: ${slug}. O caso não pode criar NPCs. Crie e publique esse NPC primeiro ou remova a referência do caso.`);
    }
    if (npc.status !== 'published' || !npc.is_active) {
      throw new Error(`NPC indisponível: ${slug}. Somente NPCs publicados e ativos podem ser vinculados a um caso.`);
    }
  }
  return { assignments, bySlug };
}

export async function validateCaseNpcAssignments(content) {
  const client = requireClient();
  await validateCaseNpcReferences(client, content);
}

export async function createDraft(entityType, data) {
  const client = requireClient();
  if (entityType === 'case') {
    await validateCaseNpcReferences(client, data.content);
    const unique = {
      ...data,
      id: await allocateUniqueCaseValue(client, 'id', data.id),
      code: await allocateUniqueCaseValue(client, 'code', data.code),
    };
    const { error } = await client.from('cases').insert(caseRow(unique));
    if (error) throw error;
    return unique.id;
  }
  if (entityType === 'npc') { const { data: created, error } = await client.from('npcs').insert(npcRow(data)).select('id').single(); if (error) throw error; return created.id; }
  const { error } = await client.from('catalog_items').insert(itemRow(data)); if (error) throw error; return data.id;
}

export async function getEntityForEditor(entityType, id) {
  const client = requireClient(); const table = tableByType[entityType];
  const { data: row, error } = await client.from(table).select('*').eq('id', id).single(); if (error) throw error;
  if (entityType === 'case') return { id: row.id, code: row.code, title: row.title, area: row.area, difficulty: row.difficulty, difficultyStars: row.difficulty_stars, deadlineHours: row.deadline_hours, honorariosReward: Number(row.honorarios_reward), xpReward: row.xp_reward, reputationReward: row.reputation_reward, minCareerTier: row.min_career_tier, content: { npcAssignments: [], socialJuridicoTools: [], ...row.content }, metadata: row.metadata, status: row.status };
  if (entityType === 'npc') return { id: row.id, name: row.name, slug: row.slug, roleType: row.role_type, profession: row.profession, specialization: row.specialization, jurisdiction: row.jurisdiction, professionalProfile: row.professional_profile, personality: row.personality, baseMemories: row.base_memories, dialogueLibrary: row.dialogue_library, decisionRules: row.decision_rules, relationships: row.relationships, knowledge: row.knowledge, metadata: row.metadata, status: row.status };
  return { id: row.id, sku: row.sku, type: row.type, name: row.name, description: row.description, rarity: row.rarity, priceCurrency: row.price_currency, priceAmount: Number(row.price_amount), effects: row.effects, content: row.content, metadata: row.metadata, status: row.status };
}

export async function updateDraft(entityType, id, data) {
  const client = requireClient(); const table = tableByType[entityType];
  const { data: current, error: readError } = await client.from(table).select('status').eq('id', id).single(); if (readError) throw readError;
  if (current.status !== 'draft') throw new Error('Somente conteúdo em draft pode ser editado nesta versão do Admin.');
  if (entityType === 'case') await validateCaseNpcReferences(client, data.content);
  const payload = entityType === 'case' ? caseRow(data) : entityType === 'npc' ? npcRow(data) : itemRow(data); delete payload.id;
  const { error } = await client.from(table).update(payload).eq('id', id); if (error) throw error;
  await client.from('admin_audit_logs').insert({ action: 'update_draft', entity_type: entityType, entity_id: String(id), payload: { source: 'json-editor' } });
}

function assertReady(entityType, row) {
  if (entityType === 'case') {
    const content = row.content || {};
    if (!Array.isArray(content.locations) || content.locations.length === 0) throw new Error('Caso não pode ser publicado sem locais.');
    if (!Array.isArray(content.availableClues) || content.availableClues.length === 0) throw new Error('Caso não pode ser publicado sem provas/pistas.');
    if (!Array.isArray(content.strategies) || content.strategies.length === 0) throw new Error('Caso não pode ser publicado sem estratégias.');
  }
  if (entityType === 'npc') {
    if (!Array.isArray(row.base_memories) || row.base_memories.length === 0) throw new Error('NPC precisa de memória-base.');
    if (!Array.isArray(row.dialogue_library) || row.dialogue_library.length === 0) throw new Error('NPC precisa de diálogos.');
    if (!Array.isArray(row.decision_rules) || row.decision_rules.length === 0) throw new Error('NPC precisa de regras de decisão.');
  }
}

async function prepareCaseNpcAssignments(client, caseId, content) {
  const { assignments, bySlug } = await validateCaseNpcReferences(client, content);
  return assignments.map((item) => ({ case_id: caseId, npc_id: bySlug.get(item.npcSlug).id, role_in_case: item.roleInCase, is_required: item.isRequired ?? false, sort_order: item.sortOrder ?? 0, configuration: item.configuration || {} }));
}

export async function publishEntity(entityType, id) {
  const client = requireClient(); const table = tableByType[entityType];
  const { data: current, error: readError } = await client.from(table).select('*').eq('id', id).single(); if (readError) throw readError;
  if (current.status !== 'draft') throw new Error('Somente drafts podem ser publicados.');
  assertReady(entityType, current);

  if (entityType === 'case') {
    const rows = await prepareCaseNpcAssignments(client, id, current.content);
    const { error: deleteError } = await client.from('case_npcs').delete().eq('case_id', id); if (deleteError) throw deleteError;
    if (rows.length) { const { error: insertError } = await client.from('case_npcs').insert(rows); if (insertError) throw insertError; }
  }

  const { error: versionError } = await client.from('content_versions').insert({ entity_type: entityType, entity_id: String(id), version: current.version || 1, snapshot: current }); if (versionError) throw versionError;
  const { error } = await client.from(table).update({ status: 'published', is_active: true, published_at: new Date().toISOString() }).eq('id', id); if (error) throw error;
  await client.from('admin_audit_logs').insert({ action: 'publish', entity_type: entityType, entity_id: String(id), payload: { version: current.version || 1 } });
}

export async function createCurrency({ id, name, symbol, currencyType }) { const client = requireClient(); const { error } = await client.from('game_currencies').insert({ id, name, symbol, currency_type: currencyType, status: 'published', is_active: true }); if (error) throw error; await client.from('admin_audit_logs').insert({ action: 'create_currency', entity_type: 'currency', entity_id: id }); }
export async function createReward({ id, name, triggerType, conditions, reward, claimPolicy }) { const client = requireClient(); const { error } = await client.from('reward_definitions').insert({ id, name, trigger_type: triggerType, status: 'draft', is_active: true, conditions, reward, metadata: { claimPolicy } }); if (error) throw error; }
export async function publishReward(id) { const client = requireClient(); const { error } = await client.from('reward_definitions').update({ status: 'published', published_at: new Date().toISOString() }).eq('id', id).eq('status', 'draft'); if (error) throw error; }
export async function activateFeature(id) { const client = requireClient(); const { error } = await client.from('game_features').update({ status: 'published', is_active: true }).eq('id', id); if (error) throw error; }
export async function saveSetting(key, value, description = '') { const client = requireClient(); const { error } = await client.from('game_settings').upsert({ key, value, description, status: 'published', is_public: true }); if (error) throw error; }
