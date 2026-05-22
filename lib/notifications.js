import { supabase } from './supabaseClient.js';

// URL de l'icône dérivée dynamiquement du client Supabase partagé
function getNotifIcon() {
  return `${supabase.supabaseUrl}/storage/v1/object/public/assets/icon.png`;
}

export async function requestNotifPermission() {
  if (!('Notification' in window)) return false;
  if (Notification.permission === 'granted') return true;
  if (Notification.permission === 'denied') return false;
  const perm = await Notification.requestPermission();
  return perm === 'granted';
}

// ── Multi-pots : gestion d'un tableau de timers ────────────────────────────

function loadNotifTimers() {
  try { return JSON.parse(sessionStorage.getItem('pot_notif_timers') ?? '[]'); }
  catch { return []; }
}

function saveNotifTimers(timers) {
  sessionStorage.setItem('pot_notif_timers', JSON.stringify(timers));
}

export function schedulePotNotification(readyAt) {
  if (!('Notification' in window)) return;

  const delay = new Date(readyAt).getTime() - Date.now();
  if (delay <= 0) return;

  const timeoutId = setTimeout(async () => {
    if (Notification.permission === 'granted') {
      const icon = getNotifIcon();
      new Notification('🌺 Botanica Obscura', {
        body:  'Un pot est prêt à être récolté !',
        icon,
        badge: icon,
        tag:   `pot-ready-${readyAt}`,
      });
    }
    // Retire ce timer de la liste une fois déclenché
    saveNotifTimers(loadNotifTimers().filter(t => t.readyAt !== readyAt));
  }, delay);

  const timers = loadNotifTimers().filter(t => t.readyAt !== readyAt); // évite les doublons
  timers.push({ id: timeoutId, readyAt });
  saveNotifTimers(timers);
}

export function cancelPotNotification(readyAt = null) {
  const timers = loadNotifTimers();
  if (readyAt) {
    // Annule uniquement le timer du pot concerné
    const target = timers.find(t => t.readyAt === readyAt);
    if (target) clearTimeout(target.id);
    saveNotifTimers(timers.filter(t => t.readyAt !== readyAt));
  } else {
    // Annule tous les timers (ex : lors d'un logout)
    timers.forEach(t => clearTimeout(t.id));
    sessionStorage.removeItem('pot_notif_timers');
  }
}

export function restorePotNotification() {
  const timers = loadNotifTimers();
  if (!timers.length) return;
  // Replanifie uniquement les timers encore futurs, nettoie les expirés
  const still_valid = timers.filter(t => new Date(t.readyAt).getTime() > Date.now());
  saveNotifTimers([]);
  still_valid.forEach(t => schedulePotNotification(t.readyAt));
}
