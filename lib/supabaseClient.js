import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from '../config.js';

// Les deux projets (Star + Botanica) partagent le même projet Supabase.
// @supabase/ssr (Star) stocke la session dans localStorage sous :
//   sb-<projectRef>-auth-token
// On récupère ce token et on restaure la session dans le client CDN de Botanica.

export const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    // Persistance locale : Botanica gère aussi sa propre clé de session
    persistSession: true,
    storageKey: 'botanica-auth-token',
  },
});

/**
 * Tente de restaurer la session Supabase depuis le localStorage de Star.
 * À appeler une seule fois au démarrage, avant onAuthReady().
 */
export async function restoreStarSession() {
  // Clé utilisée par @supabase/ssr avec le ref du projet
  const PROJECT_REF = 'nmdjrcswlnydglrxaivx';
  const SSR_KEY     = `sb-${PROJECT_REF}-auth-token`;

  // Déjà connecté dans Botanica → rien à faire
  const { data: { session: existing } } = await supabase.auth.getSession();
  if (existing) return;

  // Lecture du token Star
  const raw = localStorage.getItem(SSR_KEY);
  if (!raw) return;

  let parsed;
  try { parsed = JSON.parse(raw); } catch { return; }

  // @supabase/ssr peut stocker { access_token, refresh_token } directement
  // ou un tableau [{ access_token, refresh_token }]
  const tokenData = Array.isArray(parsed) ? parsed[0] : parsed;
  const { access_token, refresh_token } = tokenData ?? {};
  if (!access_token || !refresh_token) return;

  const { error } = await supabase.auth.setSession({ access_token, refresh_token });
  if (error) console.warn('[supabaseClient] restauration session Star échouée :', error.message);
  else console.info('[supabaseClient] session Star restaurée avec succès ✅');
}
