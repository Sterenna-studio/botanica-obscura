export async function requestNotifPermission() {
  if (!('Notification' in window)) return false;
  if (Notification.permission === 'granted') return true;
  if (Notification.permission === 'denied') return false;
  const perm = await Notification.requestPermission();
  return perm === 'granted';
}

export function schedulePotNotification(readyAt) {
  if (!('Notification' in window)) return;
  cancelPotNotification();

  const delay = new Date(readyAt).getTime() - Date.now();
  if (delay <= 0) return;

  const timeoutId = setTimeout(async () => {
    if (Notification.permission === 'granted') {
      new Notification('🌺 Botanica Obscura', {
        body: 'Ta mutation est prête à être récoltée !',
        icon: 'https://nmdjrcswlnydglrxaivx.supabase.co/storage/v1/object/public/assets/icon.png',
        badge: 'https://nmdjrcswlnydglrxaivx.supabase.co/storage/v1/object/public/assets/icon.png',
        tag: 'pot-ready',
      });
    }
  }, delay);

  sessionStorage.setItem('pot_notif_timeout', String(timeoutId));
  sessionStorage.setItem('pot_ready_at', readyAt);
}

export function cancelPotNotification() {
  const id = sessionStorage.getItem('pot_notif_timeout');
  if (id) clearTimeout(Number(id));
  sessionStorage.removeItem('pot_notif_timeout');
}

export function restorePotNotification() {
  const readyAt = sessionStorage.getItem('pot_ready_at');
  if (!readyAt) return;
  const delay = new Date(readyAt).getTime() - Date.now();
  if (delay > 0) schedulePotNotification(readyAt);
}
