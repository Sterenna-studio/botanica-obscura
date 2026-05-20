import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from '../config.js';

// Même logique que gwen-ha-star : clé publishable en priorité
export const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
