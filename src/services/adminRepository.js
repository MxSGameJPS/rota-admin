import { getSupabaseAdmin } from '@/lib/supabase/server';

async function safeCount(client, table) {
  const { count, error } = await client.from(table).select('*', { count: 'exact', head: true });
  return { count: error ? 0 : (count ?? 0), error: error?.message || null };
}

export async function getDashboardStats() {
  const client = getSupabaseAdmin();
  if (!client) return { connected: false, cases: 0, npcs: 0, items: 0, rewards: 0, warnings: ['Configure o .env.local para conectar ao Supabase.'] };
  const [cases, npcs, items, rewards] = await Promise.all([
    safeCount(client, 'cases'), safeCount(client, 'npcs'), safeCount(client, 'catalog_items'), safeCount(client, 'reward_definitions'),
  ]);
  return {
    connected: true,
    cases: cases.count,
    npcs: npcs.count,
    items: items.count,
    rewards: rewards.count,
    warnings: [npcs.error, items.error, rewards.error].filter(Boolean),
  };
}

export async function listCases() {
  const client = getSupabaseAdmin();
  if (!client) return [];
  const { data } = await client.from('cases').select('id,code,title,area,difficulty,min_career_tier,status,is_active,version,updated_at').order('sort_order').order('created_at');
  return data || [];
}

export async function listNpcs() {
  const client = getSupabaseAdmin();
  if (!client) return [];
  const { data } = await client.from('npcs').select('id,slug,name,role_type,profession,specialization,status,is_active,version,updated_at').order('name');
  return data || [];
}

export async function listCatalogItems() {
  const client = getSupabaseAdmin();
  if (!client) return [];
  const { data } = await client.from('catalog_items').select('id,sku,type,name,rarity,price_currency,price_amount,status,is_active,updated_at').order('name');
  return data || [];
}

export async function listCurrencies() {
  const client = getSupabaseAdmin();
  if (!client) return [];
  const { data } = await client.from('game_currencies').select('*').order('name');
  return data || [];
}

export async function listFeatures() {
  const client = getSupabaseAdmin();
  if (!client) return [];
  const { data } = await client.from('game_features').select('*').order('name');
  return data || [];
}
