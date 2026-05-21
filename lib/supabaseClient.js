import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from '../config.js';

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    persistSession: true,
    storageKey: 'botanica-auth-token',
  },
});

/**
 * Tente de restaurer la session Supabase depuis le localStorage de Star.
 * À appeler une seule fois au démarrage, avant onAuthReady().
 */
export async function restoreStarSession() {
  const PROJECT_REF = 'nmdjrcswlnydglrxaivx';
  const SSR_KEY     = `sb-${PROJECT_REF}-auth-token`;

  const { data: { session: existing } } = await supabase.auth.getSession();
  if (existing) return;

  const raw = localStorage.getItem(SSR_KEY);
  if (!raw) return;

  let parsed;
  try { parsed = JSON.parse(raw); } catch { return; }

  const tokenData = Array.isArray(parsed) ? parsed[0] : parsed;
  const { access_token, refresh_token } = tokenData ?? {};
  if (!access_token || !refresh_token) return;

  const { error } = await supabase.auth.setSession({ access_token, refresh_token });
  if (error) console.warn('[supabaseClient] restauration session Star échouée :', error.message);
  else console.info('[supabaseClient] session Star restaurée avec succès ✅');
}
