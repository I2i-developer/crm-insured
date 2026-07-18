import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const serviceKey = process.env.SUPABASE_SERVICE_KEY;

let supabaseClient;
let supabaseAdminClient;

export function getSupabaseClient() {
  if (!supabaseUrl || !supabaseKey) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY must be set');
  }

  if (!supabaseClient) {
    supabaseClient = createClient(supabaseUrl, supabaseKey);
  }

  return supabaseClient;
}

export function getSupabaseAdmin() {
  if (!supabaseUrl || !serviceKey) {
    throw new Error('SUPABASE_SERVICE_KEY and NEXT_PUBLIC_SUPABASE_URL must be set for server mutations');
  }

  if (!supabaseAdminClient) {
    supabaseAdminClient = createClient(supabaseUrl, serviceKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false
      }
    });
  }

  return supabaseAdminClient;
}
