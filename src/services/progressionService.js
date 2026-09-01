import { getSupabaseAdmin } from '@/lib/supabase/server';

function requireClient() {
  const client = getSupabaseAdmin();
  if (!client) throw new Error('Configure SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no .env.local.');
  return client;
}

export async function listExamBlueprints() {
  const client = requireClient();
  const { data, error } = await client
    .from('exam_blueprints')
    .select('id,title,description,question_count,target_kind,max_target_level,eligibility_rules,generation_instructions,is_active,sort_order,metadata')
    .order('sort_order');
  if (error) throw error;
  return data || [];
}

export async function listSpecialCareerDefinitions() {
  const client = requireClient();
  const { data, error } = await client
    .from('special_career_definitions')
    .select('id,title,description,min_master_level,min_doctorate_level,min_reputation,term_years,end_behavior,next_possible_roles,status,is_active,sort_order,metadata')
    .order('sort_order');
  if (error) throw error;
  return data || [];
}
