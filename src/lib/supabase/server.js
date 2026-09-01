import { createClient } from '@supabase/supabase-js';

let cachedClient;

export function getSupabaseAdmin() {
  const url = process.env.SUPABASE_URL?.trim();
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !serviceRole) return null;
  if (!cachedClient) {
    cachedClient = createClient(url, serviceRole, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return cachedClient;
}

export function isAdminConfigured() {
  return Boolean(process.env.SUPABASE_URL?.trim() && process.env.SUPABASE_SERVICE_ROLE_KEY?.trim());
}
