import { getSupabaseAdmin } from '@/lib/supabase/server';

function client() {
  const supabase = getSupabaseAdmin();
  if (!supabase) throw new Error('Configure SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no .env.local.');
  return supabase;
}

export async function listLawFirms() {
  const supabase = client();
  const { data, error } = await supabase
    .from('law_firms')
    .select('id,slug,name,market_tier,size_category,prestige,public_reputation,status,is_active,version,updated_at')
    .order('name');
  if (error) throw error;

  const firms = data || [];
  if (!firms.length) return [];
  const ids = firms.map((firm) => firm.id);
  const [{ data: roles }, { data: members }] = await Promise.all([
    supabase.from('law_firm_roles').select('law_firm_id').in('law_firm_id', ids),
    supabase.from('law_firm_members').select('law_firm_id').in('law_firm_id', ids),
  ]);
  const roleCount = new Map();
  const memberCount = new Map();
  for (const row of roles || []) roleCount.set(row.law_firm_id, (roleCount.get(row.law_firm_id) || 0) + 1);
  for (const row of members || []) memberCount.set(row.law_firm_id, (memberCount.get(row.law_firm_id) || 0) + 1);
  return firms.map((firm) => ({
    ...firm,
    role_count: roleCount.get(firm.id) || 0,
    member_count: memberCount.get(firm.id) || 0,
  }));
}

export async function listNpcCatalogForLawFirmGeneration() {
  const supabase = client();
  const { data, error } = await supabase
    .from('npcs')
    .select('id,slug,name,role_type,profession,specialization,status,is_active,metadata')
    .eq('is_active', true)
    .in('status', ['draft', 'published'])
    .order('name');
  if (error) throw error;
  return data || [];
}

export async function findNpcBySlug(slug) {
  const supabase = client();
  const { data, error } = await supabase
    .from('npcs')
    .select('*')
    .eq('slug', slug)
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

export async function insertLawFirm(row) {
  const supabase = client();
  const { data, error } = await supabase.from('law_firms').insert(row).select('*').single();
  if (error) throw error;
  return data;
}

export async function insertLawFirmRoles(rows) {
  if (!rows.length) return [];
  const supabase = client();
  const { data, error } = await supabase.from('law_firm_roles').insert(rows).select('*');
  if (error) throw error;
  return data || [];
}

export async function insertNpc(row) {
  const supabase = client();
  const { data, error } = await supabase.from('npcs').insert(row).select('*').single();
  if (error) throw error;
  return data;
}

export async function updateNpcMetadata(npcId, metadata) {
  const supabase = client();
  const { data, error } = await supabase.from('npcs').update({ metadata }).eq('id', npcId).select('*').single();
  if (error) throw error;
  return data;
}

export async function insertLawFirmMembers(rows) {
  if (!rows.length) return [];
  const supabase = client();
  const { data, error } = await supabase.from('law_firm_members').insert(rows).select('*');
  if (error) throw error;
  return data || [];
}

export async function getLawFirm(id) {
  const supabase = client();
  const [{ data: firm, error: firmError }, { data: roles, error: rolesError }, { data: members, error: membersError }] = await Promise.all([
    supabase.from('law_firms').select('*').eq('id', id).single(),
    supabase.from('law_firm_roles').select('*').eq('law_firm_id', id).order('hierarchy_level'),
    supabase.from('law_firm_members').select('*').eq('law_firm_id', id).order('created_at'),
  ]);
  if (firmError) throw firmError;
  if (rolesError) throw rolesError;
  if (membersError) throw membersError;

  const npcIds = [...new Set((members || []).map((member) => member.npc_id).filter(Boolean))];
  let npcs = [];
  if (npcIds.length) {
    const { data, error } = await supabase
      .from('npcs')
      .select('id,slug,name,role_type,profession,specialization,status,is_active,metadata')
      .in('id', npcIds);
    if (error) throw error;
    npcs = data || [];
  }
  const npcById = new Map(npcs.map((npc) => [npc.id, npc]));
  const roleById = new Map((roles || []).map((role) => [role.id, role]));
  return {
    ...firm,
    roles: roles || [],
    members: (members || []).map((member) => ({
      ...member,
      npc: npcById.get(member.npc_id) || null,
      role: member.role_id ? roleById.get(member.role_id) || null : null,
    })),
  };
}

export async function publishLawFirmGraph(id, memberNpcIdsToPublish = []) {
  const supabase = client();
  if (memberNpcIdsToPublish.length) {
    const { error: npcError } = await supabase
      .from('npcs')
      .update({ status: 'published', is_active: true, published_at: new Date().toISOString() })
      .in('id', memberNpcIdsToPublish)
      .eq('status', 'draft');
    if (npcError) throw npcError;
  }
  const { error: roleError } = await supabase
    .from('law_firm_roles')
    .update({ status: 'published', is_active: true })
    .eq('law_firm_id', id)
    .eq('status', 'draft');
  if (roleError) throw roleError;
  const { error: firmError } = await supabase
    .from('law_firms')
    .update({ status: 'published', is_active: true, published_at: new Date().toISOString() })
    .eq('id', id)
    .eq('status', 'draft');
  if (firmError) throw firmError;
}

export async function archiveLawFirm(id) {
  const supabase = client();
  const { error } = await supabase.from('law_firms').update({ status: 'archived', is_active: false }).eq('id', id);
  if (error) throw error;
}

export async function deleteLawFirm(id) {
  const supabase = client();
  const { error } = await supabase.from('law_firms').delete().eq('id', id);
  if (error) throw error;
}

export async function deleteNpcs(ids) {
  if (!ids.length) return;
  const supabase = client();
  const { error } = await supabase.from('npcs').delete().in('id', ids);
  if (error) throw error;
}

export async function writeLawFirmAudit(action, entityId, payload = {}) {
  const supabase = client();
  const { error } = await supabase.from('admin_audit_logs').insert({
    action,
    entity_type: 'law_firm',
    entity_id: String(entityId),
    payload,
  });
  if (error) console.warn('Falha ao registrar auditoria de escritório:', error.message);
}
