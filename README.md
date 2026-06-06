# Botanica Obscura

[![Deploy Botanica Obscura to Nitro](https://github.com/MutenRock/botanica-obscura/actions/workflows/deploy-ovh.yml/badge.svg)](https://github.com/MutenRock/botanica-obscura/actions/workflows/deploy-ovh.yml)

Idle gacha botanique connecté à Nitro (https://nitro.sterenna.fr).
Les joueurs combinent des graines dans des pots de mutation, récoltent des plantes, complètent un codex partagé et progressent via XP + coins.

## Stack

- HTML / CSS / JavaScript (modules ES)
- Supabase — base de données + Edge Functions
- SVG — rendu des personnages plantes
- Auth partagée via Nitro (`/shared/auth.js`, `/shared/profile.js`)

## Structure

```
index.html          — shell principal
app.js              — init + orchestration
styles.css          — styles globaux
styles/             — styles par module (pots, garden, inventory…)
lib/
  auth.js           — bridge vers l'auth Nitro partagée
  supabaseClient.js — client Supabase partagé (re-export depuis /shared)
  pots.js           — UI multi-pots de mutation
  mutation.js       — logique mutation (start, harvest via Edge Function)
  xp.js             — table de niveaux, calcul XP, rewards
  onboarding.js     — choix des graines de départ
  inventory.js      — inventaire + vente NPC
  garden.js         — effets jardin (achat, rendu)
  testers.js        — testeurs de dégustation
  mysterySeed.js    — colis mystère 12h
  quality.js        — tiers de qualité (Guezmer → Comète)
  codex / mutations — arbre d'espèces, codex global
sql/                — migrations Supabase
docs/               — roadmap, game design, schéma DB
```

## Déploiement

Le projet tourne sous Nitro via rsync + SSH (GitHub Actions → `.github/workflows/deploy-ovh.yml`).
Il n'a pas de config locale — les variables Supabase sont injectées par le serveur Nitro via `/shared/supabase-client.js`.

Pour tester en local : lancer un serveur HTTP statique à la racine du projet.
L'app nécessite `/shared/auth.js` et `/shared/supabase-client.js` fournis par Nitro — sans eux, les modules d'auth échoueront.

## Progression

| Niveau | Slots pots | Nouveauté |
|--------|-----------|-----------|
| 1 | 1 | Onboarding, colis mystère |
| 3 | 1 | Jardin + Testeurs débloqués |
| 4 | 2 | 2e pot |
| 5 | 3 | 3e pot |
| 8 | 4 | 4e pot |
| 10 | 4 | Niveau max (V0.2) |

## Docs

- [docs/roadmap.md](docs/roadmap.md) — versions V0.2 → V0.5
- [docs/game-design.md](docs/game-design.md) — boucle de jeu, espèces, qualité
- [docs/db-schema.md](docs/db-schema.md) — tables Supabase + Edge Functions
