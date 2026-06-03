# Botanica Obscura — Roadmap

## Version actuelle : V0.3 — Collection & Codex

V0.2 complète. Boucle stable : connexion Nitro → onboarding → colis mystère → mutation → récolte avec overlay → progression XP/niveau.

---

## V0.2 — Stable Core ✅ *complète*

Objectif : **un joueur se connecte, comprend, plante, récolte, progresse, revient demain.**

### Auth & identité Nitro
- [x] Header affiche le badge Nitro (`#userBadge`, avatar, pseudo)
- [x] Lien "← Star" dans la topbar
- [x] Redirection login via `/login.html` si session absente
- [x] `display_name` + `avatar_url` synchronisés vers `botanica_player_data` à chaque login

### Onboarding
- [x] Tutoriel en 3 étapes : règles → choix graines → guide premier pot
- [x] Hint contextuel `#next-action-hint` (graines dispo, pot prêt, colis mystère)
- [x] Flag `onboarding_completed` pour éviter de redonner les graines de départ
- [x] Tier/rareté masqués pendant le choix initial des graines

### UI — Hiérarchie en zones
- [x] **Zone principale** (toujours visible) : pots + colis mystère + prévisualisation
- [x] **Zone secondaire** (dépliable) : inventaire ouvert par défaut, jardin, testeurs
- [x] **Zone collection** (dépliable) : codex, arbre des mutations
- [x] Remplacer `alert()` dans `onBuyGardenEffect` par toast
- [x] **Overlay récolte** : carte reveal avec qualité colorée, SVG plante, XP, badge 1ère mondiale
- [x] UX pots améliorée : placement guidé des graines, aperçu A/B, validation avant lancement
- [x] Graines rendues sans visage dans l'inventaire

### Progression gated par niveau
- [x] Jardin masqué avant Lv3
- [x] Testeurs masqués avant Lv3
- [x] Prochain slot verrouillé visible (grisé) avec niveau requis affiché

### Bug critique
- [x] `lib/mutation.js` — suppression import `config.js` + ajout header auth manquant sur `harvestMutation`
- [x] `lib/mysterySeed.js` — session Nitro partagée au lieu de `supabase.auth.getSession()`
- [x] `lib/authModal.js` — supprimé (obsolète, auth centralisée sur Nitro `/login.html`)
- [x] XP source unique : `resolveLevel()` dans `xp.js` utilisé partout (playerData, profil)

### Docs
- [x] `docs/roadmap.md`
- [x] `docs/game-design.md`
- [x] `docs/db-schema.md`
- [x] `README.md` mis à jour (Nitro, structure, déploiement OVH, table progression)

---

## V0.3 — Collection & Codex ✅ *en consolidation*

- [x] Codex redesigné : filtres par tier/rareté/état, recherche, compteur de découvertes
- [x] Raretés plus lisibles visuellement (bordures, badges, résumé collection)
- [x] "Découverte serveur" mise en valeur : overlay récolte + notice visuelle première serveur
- [x] Historique des découvertes joueur sur la page profil
- [x] Set 1 planté : 10 espèces Tier 2 dans le fallback et migration SQL
- [x] Colis mystère amélioré à partir du niveau 2 côté front (`improved_pool`, `player_level` envoyés à l'Edge Function)

### À vérifier / finaliser côté backend Supabase
- [ ] Exécuter `sql/fix_v0.2_schema_drift.sql`
- [ ] Exécuter `sql/fix_v0.3_profile_schema_drift.sql`
- [ ] Exécuter `sql/add_onboarding_completed_flag.sql`
- [ ] Exécuter `sql/seed_v0.3_tier2_species.sql`
- [ ] Vérifier que l'Edge Function `harvest-mutation` respecte les couples `parent_a_id` / `parent_b_id` pour le Set 1
- [ ] Vérifier que l'Edge Function `claim-mystery-seed` utilise `player_level` / `improved_pool` pour élargir le pool Lv2

---

## V0.4 — Garden Strategy

- Effets jardin plus impactants et visibles (animations à la récolte)
- Nouveaux effets débloquables par niveau
- Choix stratégiques : investir dans qualité vs vitesse vs rareté
- Boost temporaires (potions, événements)
- Set 2 planté : 5 espèces Tier 3 "Obscura" (rares / étranges)

---

## V0.5 — Social / Nitro

- Profil Botanica visible dans Star (badges, codex count, plante fétiche)
- Classement affiné (hebdo, alltime, par set)
- Badges Nitro récompensant les premières découvertes
- Récompenses cross-projets (Botanica ↔ Star)
- Set 3 planté : 2–3 espèces Légendaires serveur-first très rares

---

## Species sets

| Set | Tier | Count | Disponible à partir de |
|-----|------|-------|------------------------|
| 0 — Base | 0–1 | 5 communes | V0.1 (onboarding) |
| 1 — Mutations | 2 | 10 | V0.3 |
| 2 — Obscura | 3 | 5 | V0.4 |
| 3 — Légendaires | 4 | 2–3 | V0.5 (serveur-first) |
