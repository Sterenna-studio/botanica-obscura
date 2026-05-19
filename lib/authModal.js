/**
 * lib/authModal.js — Injection du DOM de la modale d'auth
 * Appelé une fois au chargement, injecte la modale dans le body.
 */
import { openAuthModal, closeAuthModal, submitAuth, signOut } from './auth.js';

export function initAuthModal() {
  // Injection du HTML
  const tpl = document.createElement('div');
  tpl.innerHTML = `
    <div id="authModal" class="auth-modal-overlay" role="dialog" aria-modal="true" aria-labelledby="authModalTitle">
      <div class="auth-modal-card">
        <button class="auth-modal-close" id="authModalClose" aria-label="Fermer">&times;</button>
        <h2 id="authModalTitle">🔑 Se connecter</h2>

        <div class="auth-tabs">
          <button class="auth-tab active" data-tab="login">Connexion</button>
          <button class="auth-tab" data-tab="signup">Inscription</button>
        </div>

        <form id="authForm" autocomplete="on" novalidate>
          <div id="authFieldUsername" class="auth-field" style="display:none">
            <label for="authUsername">Pseudo</label>
            <input id="authUsername" type="text" placeholder="MonPseudo" autocomplete="username" />
          </div>
          <div class="auth-field">
            <label for="authEmail">E-mail</label>
            <input id="authEmail" type="email" placeholder="email@exemple.com" autocomplete="email" required />
          </div>
          <div class="auth-field">
            <label for="authPassword">Mot de passe</label>
            <input id="authPassword" type="password" placeholder="••••••••" autocomplete="current-password" required />
          </div>
          <p id="authError" class="auth-error"></p>
          <button type="submit" class="auth-submit-btn" id="authSubmitBtn">Se connecter</button>
        </form>

        <p class="auth-footer-note">Pas de compte ? <button class="auth-link" data-tab="signup">S'inscrire</button></p>
      </div>
    </div>
  `;
  document.body.appendChild(tpl.firstElementChild);

  // Logique onglets
  const modal     = document.getElementById('authModal');
  const tabs      = modal.querySelectorAll('.auth-tab');
  const usernameField = document.getElementById('authFieldUsername');
  const submitBtn = document.getElementById('authSubmitBtn');
  const title     = document.getElementById('authModalTitle');

  function setTab(tab) {
    tabs.forEach(t => t.classList.toggle('active', t.dataset.tab === tab));
    modal.dataset.mode = tab;
    usernameField.style.display = tab === 'signup' ? 'flex' : 'none';
    submitBtn.textContent = tab === 'signup' ? 'Créer mon compte' : 'Se connecter';
    title.textContent     = tab === 'signup' ? '🌱 Créer un compte' : '🔑 Se connecter';
    document.getElementById('authError').textContent = '';
  }

  tabs.forEach(t => t.addEventListener('click', () => setTab(t.dataset.tab)));
  modal.querySelectorAll('.auth-link[data-tab]').forEach(l =>
    l.addEventListener('click', () => setTab(l.dataset.tab))
  );

  // Fermeture
  document.getElementById('authModalClose').addEventListener('click', closeAuthModal);
  modal.addEventListener('click', e => { if (e.target === modal) closeAuthModal(); });

  // Soumission
  document.getElementById('authForm').addEventListener('submit', async e => {
    e.preventDefault();
    submitBtn.disabled = true;
    const email    = document.getElementById('authEmail').value.trim();
    const password = document.getElementById('authPassword').value;
    const username = document.getElementById('authUsername').value.trim();
    await submitAuth(email, password, username);
    submitBtn.disabled = false;
  });

  // Bouton logout dans le header
  document.getElementById('logoutBtn')?.addEventListener('click', async () => {
    await signOut();
  });

  // Bouton login dans le header
  document.getElementById('loginBtn')?.addEventListener('click', () => openAuthModal('login'));
}
