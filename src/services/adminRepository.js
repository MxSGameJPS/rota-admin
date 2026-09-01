import { getSupabaseAdmin } from '@/lib/supabase/server';

async function safeCount(client, table) {
  const { count, error } = await client.from(table).select('*', { count: 'exact', head: true });
  return { count: error ? 0 : (count ?? 0), error: error?.message || null };
}
async function list(table, select = '*', order = 'created_at') {
  const client = getSupabaseAdmin();
  if (!client) return [];
  const { data } = await client.from(table).select(select).order(order, { ascending: true });
  return data || [];
}

export async function getDashboardStats() {
  const client = getSupabaseAdmin();
  if (!client) return { connected: false, cases: 0, npcs: 0, items: 0, rewards: 0, warnings: ['Configure o .env.local para conectar ao Supabase.'] };
  const [cases, npcs, items, rewards] = await Promise.all([safeCount(client, 'cases'), safeCount(client, 'npcs'), safeCount(client, 'catalog_items'), safeCount(client, 'reward_definitions')]);
  return { connected: true, cases: cases.count, npcs: npcs.count, items: items.count, rewards: rewards.count, warnings: [npcs.error, items.error, rewards.error].filter(Boolean) };
}

export async function listCases() {
  const client = getSupabaseAdmin(); if (!client) return [];
  const { data } = await client.from('cases').select('id,code,title,area,difficulty,min_career_tier,status,is_active,version,updated_at').order('sort_order').order('created_at'); return data || [];
}
export async function listNpcs() { return list('npcs', 'id,slug,name,role_type,profession,specialization,status,is_active,version,updated_at', 'name'); }
export async function listCatalogItems() { return list('catalog_items', 'id,sku,type,name,rarity,price_currency,price_amount,status,is_active,version,updated_at', 'name'); }
export async function listCurrencies() { return list('game_currencies', '*', 'name'); }
export async function listRewards() { return list('reward_definitions', 'id,name,trigger_type,status,is_active,version,conditions,reward,metadata,updated_at', 'name'); }
export async function listFeatures() { return list('game_features', '*', 'name'); }
export async function listSettings() { return list('game_settings', '*', 'key'); }
