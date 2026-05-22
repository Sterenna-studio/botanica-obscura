# Botanica Obscura — Roadmap

## Version actuelle : V0.2 (en cours)

Boucle complète codée, auth Nitro branchée, toutes les tables Supabase en place.
État : jouable mais pas encore stable UX / pas de hiérarchie claire.

---

## V0.2 — Stable Core *(chantier actuel)*

Objectif : **un joueur se connecte, comprend, plante, récolte, progresse, revient demain.**

### Auth & identité Nitro
- [x] Header affiche le badge Nitro (`#userBadge`, avatar, pseudo)
- [x] Lien "← Star" dans la topbar
- [ ] Redirection login via `/login.html` si session absente (déjà codé, à vérifier en prod)

### Onboarding
- [x] Tutoriel en 3 étapes : règles → choix graines → guide premier pot
- [x] Hint contextuel `#next-action-hint` (graines dispo, pot prêt, colis mystère)
- [ ] Colis mystère proposé dès l'onboarding si premier démarrage (step 3 pointe dessus)

### UI — Hiérarchie en zones
- [x] **Zone principale** (toujours visible) : pots + colis mystère + prévisualisation
- [x] **Zone secondaire** (dépliable) : inventaire ouvert par défaut, jardin, testeurs
- [x] **Zone collection** (dépliable) : codex, arbre des mutations
- [x] Remplacer `alert()` dans `onBuyGardenEffect` par toast

### Progression gated par niveau
- [x] Jardin masqué avant Lv3
- [x] Testeurs masqués avant Lv3
- [ ] Colis mystère amélioré débloqué à Lv2 (label visible dès Lv1)
- [x] Prochain slot verrouillé visible (grisé) avec niveau requis affiché

### Bug critique
- [x] `lib/mutation.js` — suppression import `config.js` + ajout header auth manquant sur `harvestMutation`

### Docs
- [x] `docs/roadmap.md`
- [x] `docs/game-design.md`
- [x] `docs/db-schema.md`
- [x] `README.md` mis à jour (Nitro, structure, déploiement OVH, table progression)

---

## V0.3 — Collection & Codex

- Codex redesigné : filtres par tier/rareté, compteur de découvertes
- "Découverte serveur" mise en valeur (bannière, notification globale)
- Raretés plus lisibles visuellement (bordures colorées, badges)
- Historique des découvertes joueur (page profil)
- Set 1 planté : 10 espèces Tier 2 disponibles

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
