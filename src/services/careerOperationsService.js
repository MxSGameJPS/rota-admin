import { getSupabaseAdmin } from '@/lib/supabase/server';

function requireClient() {
  const client = getSupabaseAdmin();
  if (!client) throw new Error('Configure SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no .env.local.');
  return client;
}

async function safeCount(client, table, filter) {
  let query = client.from(table).select('*', { count: 'exact', head: true });
  if (filter) query = filter(query);
  const { count, error } = await query;
  return { count: count ?? 0, error: error?.message || null };
}

export async function getCareerOperationsOverview() {
  const client = requireClient();
  const { data: careers, error } = await client
    .from('careers')
    .select('id,career_stage,reputation,legal_prestige,academic_career,public_career_opportunities,public_service_career,public_service_gameplay,apex_career_state,updated_at')
    .order('updated_at', { ascending: false })
    .limit(100);
  if (error) throw error;

  const rows = careers || [];
  const stages = {};
  for (const career of rows) stages[career.career_stage || 'SEM_TIER'] = (stages[career.career_stage || 'SEM_TIER'] || 0) + 1;

  const [media, memories, offices, staff, assignments, market, marketEvents] = await Promise.all([
    safeCount(client, 'career_media_events'),
    safeCount(client, 'career_world_memories'),
    safeCount(client, 'player_office_businesses'),
    safeCount(client, 'player_office_staff'),
    safeCount(client, 'player_office_case_assignments'),
    safeCount(client, 'law_firm_market_simulation'),
    safeCount(client, 'law_firm_market_events'),
  ]);

  return {
    careers: rows,
    stages,
    modules: {
      career_media_events: media,
      career_world_memories: memories,
      player_office_businesses: offices,
      player_office_staff: staff,
      player_office_case_assignments: assignments,
      law_firm_market_simulation: market,
      law_firm_market_events: marketEvents,
    },
  };
}
