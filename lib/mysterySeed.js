// lib/mysterySeed.js — Graine mystère toutes les 12h
import { supabase, getUserId } from '../app.js';

const COOLDOWN_MS = 12 * 60 * 60 * 1000;
let countdownInterval = null;

export function initMysterySeed(onSeedReceived) {
  const container = document.getElementById('mystery-seed-zone');
  if (!container) return;

  const btn       = container.querySelector('#mystery-seed-btn');
  const countdown = container.querySelector('#mystery-seed-countdown');
  const msg       = container.querySelector('#mystery-seed-msg');

  async function checkCooldown() {
    const { data } = await supabase
      .from('botanica_player_data')
      .select('last_seed_claimed_at')
      .eq('user_id', getUserId())
      .maybeSingle();

    const last = data?.last_seed_claimed_at ? new Date(data.last_seed_claimed_at).getTime() : 0;
    const remaining = COOLDOWN_MS - (Date.now() - last);

    if (remaining > 0) {
      startCountdown(remaining, btn, countdown);
    } else {
      btn.disabled = false;
      btn.textContent = '📦 Récupérer ma graine mystère';
      countdown.textContent = '';
    }
  }

  btn.addEventListener('click', async () => {
    btn.disabled = true;
    btn.textContent = '⏳ Récupération...';
    msg.textContent = '';

    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      msg.textContent = '🔒 Connecte-toi pour réclamer ta graine.';
      btn.disabled = false;
      btn.textContent = '📦 Récupérer ma graine mystère';
      return;
    }

    const res = await fetch(
      `${supabase.supabaseUrl}/functions/v1/claim-mystery-seed`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
      }
    );

    const payload = await res.json();

    if (res.status === 429) {
      startCountdown(payload.remaining_ms, btn, countdown);
      return;
    }
    if (!payload.ok) {
      msg.textContent = `❌ ${payload.error}`;
      btn.disabled = false;
      btn.textContent = '📦 Récupérer ma graine mystère';
      return;
    }

    // Succès — animation
    msg.innerHTML = '<span class="mystery-seed-anim">📦✨ Graine mystère reçue ! Elle sera révélée dans le pot de mutation.</span>';
    startCountdown(COOLDOWN_MS, btn, countdown);
    if (onSeedReceived) onSeedReceived();
  });

  checkCooldown();
}

function startCountdown(remainingMs, btn, countdown) {
  btn.disabled = true;
  btn.textContent = '⏳ Prochain colis dans...';
  clearInterval(countdownInterval);

  function tick() {
    const h = Math.floor(remainingMs / 3600000);
    const m = Math.floor((remainingMs % 3600000) / 60000);
    const s = Math.floor((remainingMs % 60000) / 1000);
    countdown.textContent = `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
    remainingMs -= 1000;
    if (remainingMs <= 0) {
      clearInterval(countdownInterval);
      btn.disabled = false;
      btn.textContent = '📦 Récupérer ma graine mystère';
      countdown.textContent = '';
    }
  }
  tick();
  countdownInterval = setInterval(tick, 1000);
}
