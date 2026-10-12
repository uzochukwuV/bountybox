import { createClient } from '@supabase/supabase-js';
import { env } from '@/lib/env';

const url = env.SUPABASE_URL;
const anonKey = env.SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  throw new Error(
    'Missing Supabase configuration. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env'
  );
}

export const supabase = createClient(url, anonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

export const STORAGE_BUCKET = env.SUPABASE_BUCKET;
