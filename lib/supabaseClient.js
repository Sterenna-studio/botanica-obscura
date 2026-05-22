// Botanica uses Nitro shared Supabase client.
// When deployed under https://nitro.sterenna.fr/botanica/,
// the session is shared with /star and the rest of Nitro through /shared.

export { supabase } from '/shared/supabase-client.js';

// Compatibility no-op kept for older imports.
// Session restoration is no longer needed because Botanica is served under the
// same origin as Nitro and uses the same shared Supabase client/storage.
export async function restoreStarSession() {
  return null;
}
