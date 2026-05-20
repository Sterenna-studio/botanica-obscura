import { SUPABASE_URL, SUPABASE_ANON } from '../config.js';

export const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON);
