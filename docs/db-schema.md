# Botanica Obscura — Schéma de base de données

Toutes les tables sont dans le projet Supabase partagé Nitro.
RLS activée sur toutes les tables : `auth.uid() = user_id`.

---

## Tables joueur

### `botanica_player_data`
Données de progression principale, une ligne par joueur.

| Colonne | Type | Notes |
|---------|------|-------|
| `user_id` | UUID PK | FK → `auth.users` |
| `xp` | INT | XP cumulée totale |
| `level` | INT | Calculé via `LEVEL_TABLE` dans `lib/xp.js` |
| `coins` | INT | Monnaie in-game |
| `pot_slots` | INT | Nombre de slots pots actifs (1–4) |
| `last_active` | TIMESTAMPTZ | Mis à jour à chaque connexion |
| `last_seed_claimed_at` | TIMESTAMPTZ | Cooldown colis mystère (12h) |
| `display_name` | TEXT | Copié depuis le profil Nitro |
| `avatar_url` | TEXT | Copié depuis le profil Nitro |
| `codex_count` | INT | Nombre d'espèces découvertes |

### `botanica_player_seeds`
Inventaire de graines du joueur.

| Colonne | Type | Notes |
|---------|------|-------|
| `id` | BIGSERIAL PK | |
| `user_id` | UUID | FK → `auth.users` |
| `species_id` | INT | FK → `botanica_species` |
| `quantity` | INT | Ligne supprimée si quantity = 0 |
| `obtained_at` | TIMESTAMPTZ | |

Contrainte unique : `(user_id, species_id)`

### `botanica_player_codex`
Espèces découvertes par le joueur.

| Colonne | Type | Notes |
|---------|------|-------|
| `user_id` | UUID | FK → `auth.users` |
| `species_id` | INT | FK → `botanica_species` |
| `was_first_server` | BOOL | True si première découverte mondiale |
| `discovered_at` | TIMESTAMPTZ | |

Clé primaire composée : `(user_id, species_id)`

### `botanica_player_garden`
Niveaux des améliorations jardin par joueur.

| Colonne | Type | Notes |
|---------|------|-------|
| `user_id` | UUID PK | FK → `auth.users` |
| `effects` | JSONB | `{ waterBonus, lightBonus, thermoBonus, fanBonus, uvBonus }` — valeurs 0–maxLevel |
| `updated_at` | TIMESTAMPTZ | |

---

## Tables de jeu

### `botanica_mutation_pots`
Pots de mutation actifs et historique.

| Colonne | Type | Notes |
|---------|------|-------|
| `id` | BIGSERIAL PK | |
| `user_id` | UUID | FK → `auth.users` |
| `species_a_id` | INT | FK → `botanica_species` |
| `species_b_id` | INT | FK → `botanica_species` |
| `started_at` | TIMESTAMPTZ | |
| `ready_at` | TIMESTAMPTZ | `started_at + 12h` |
| `status` | TEXT | `growing` / `ready` / `harvested` |
| `growth_stage` | SMALLINT | 0–4 |
| `quality_tier_id` | SMALLINT | NULL jusqu'à la récolte |

### `botanica_species`
Référentiel de toutes les espèces (géré par les admins).

| Colonne | Type | Notes |
|---------|------|-------|
| `id` | INT PK | |
| `name` | TEXT | |
| `tier` | INT | 0 = base, 1–4 = mutations |
| `rarity` | TEXT | `common` / `rare` / `epic` / `legendary` / `mythic` |
| `description` | TEXT | |
| `body_color` | TEXT | Hex CSS |
| `stem_color` | TEXT | Hex CSS |
| `eye_color` | TEXT | Hex CSS |
| `discovered_by` | UUID | Premier joueur à l'avoir découverte |
| `discovered_by_username` | TEXT | Snapshot du pseudo au moment de la découverte |

### `botanica_testers`
Testeurs du joueur (créés à la première connexion).

| Colonne | Type | Notes |
|---------|------|-------|
| `id` | BIGSERIAL PK | |
| `user_id` | UUID | FK → `auth.users` |
| `name` | TEXT | Gus / Miko / Zara / Pépé / Nox |
| `happiness` | INT | 0–100 |
| `last_tasted_at` | TIMESTAMPTZ | |

---

## Tables de log

### `botanica_tasting_log`
| Colonne | Type |
|---------|------|
| `id` | BIGSERIAL PK |
| `user_id` | UUID |
| `species_id` | INT |
| `quality_tier_id` | SMALLINT |
| `tasted_at` | TIMESTAMPTZ |

### `botanica_npc_sales_log`
| Colonne | Type |
|---------|------|
| `id` | BIGSERIAL PK |
| `user_id` | UUID |
| `species_id` | INT |
| `quality_tier_id` | SMALLINT |
| `price_sold` | INT |
| `sold_at` | TIMESTAMPTZ |

---

## Vues

### `botanica_leaderboard`
```sql
SELECT
  ROW_NUMBER() OVER (ORDER BY xp DESC) AS rank,
  display_name,
  avatar_url,
  codex_count,
  level,
  xp
FROM botanica_player_data
WHERE display_name IS NOT NULL;
```

---

## Edge Functions

| Fonction | Déclencheur | Description |
|----------|------------|-------------|
| `claim-mystery-seed` | POST | Vérifie cooldown 12h, attribue une graine Tier 0–1 |
| `harvest-mutation` | POST | Résout la mutation (espèce résultante + qualité), met à jour `botanica_player_seeds` et `botanica_species.discovered_by` |

---

## Migrations à appliquer

### `sql/fix_v0.2_schema_drift.sql` *(à exécuter sur la prod)*

Corrige deux divergences DB ↔ code détectées en prod V0.2 :

1. **`botanica_player_garden.effects` manquant** — la prod a été créée avec les
   anciennes colonnes individuelles (`waterBonus`, `lightBonus`, …) au lieu du
   JSONB `effects` attendu par `lib/garden.js`. La migration migre les valeurs
   existantes vers `effects` puis drop les anciennes colonnes.

2. **Contrainte UNIQUE `(user_id, species_id)` manquante sur
   `botanica_player_seeds`** — sans elle, les upserts avec `onConflict` (utilisés
   par `lib/onboarding.js` et le grant de mutation) renvoient 400. La migration
   déduplique d'abord puis ajoute la contrainte.

Le script est idempotent (`IF NOT EXISTS`, `DROP POLICY IF EXISTS`) — réexécutable
sans risque.
