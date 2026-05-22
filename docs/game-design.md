# Botanica Obscura — Game Design Document

## Concept

Idle gacha botanique. Le joueur combine des graines dans des pots de mutation,
attend la pousse, récolte une plante avec un tier de qualité aléatoire,
gagne XP + coins, et progresse vers des espèces de plus en plus rares.

Botanica tourne sous Nitro (https://nitro.sterenna.fr/botanica/) et
partage l'authentification et le profil Nitro.

---

## Boucle principale

```
Colis mystère / graine de départ (onboarding)
→ Choisir 2 graines dans l'inventaire
→ Lancer une mutation dans un pot (12h)
→ Récolter → tier de qualité tiré au sort
→ Gagner XP + coins
→ Vendre graines au NPC / faire goûter aux testeurs
→ Débloquer codex + arbre de mutations
→ Améliorer jardin (meilleurs tiers de qualité)
→ Recommencer avec plus d'options (nouveaux slots, espèces rares)
```

**Règle d'or UX :** un joueur doit comprendre quoi faire en moins de 30 secondes.

---

## Progression joueur

| Niveau | XP cumulée | Récompense |
|--------|-----------|------------|
| 1 | 0 | 1 pot |
| 2 | 100 | +50🪙 — colis mystère amélioré débloqué |
| 3 | 250 | +75🪙 — testeurs + jardin débloqués |
| 4 | 500 | +100🪙 +1 slot pot (2 pots) |
| 5 | 900 | +150🪙 +1 slot pot (3 pots) |
| 6 | 1 400 | +200🪙 |
| 7 | 2 100 | +300🪙 |
| 8 | 3 000 | +400🪙 +1 slot pot (4 pots) |
| 9 | 4 200 | +500🪙 |
| 10 | 6 000 | +1 000🪙 🎖️ (max level V0.2) |

**Slots de pots** : 1 → 2 (Lv4) → 3 (Lv5) → 4 (Lv8)

---

## XP par récolte

| Rareté | XP base |
|--------|---------|
| common | 10 |
| rare | 20 |
| epic | 40 |
| legendary | 80 |
| mythic | 200 |

Multiplicateurs qualité : Guezmer ×0.5 / Potable ×1.0 / Frape ×1.5 / Banger ×2.0 / Comète ×3.0

---

## Espèces

### Raretés

| Rareté | Drop rate (approx.) | Prix NPC base |
|--------|--------------------|----|
| common | ~60% | 10🪙 |
| rare | ~25% | 30🪙 |
| epic | ~10% | 80🪙 |
| legendary | ~4% | 200🪙 |
| mythic | ~1% | 500🪙 |

### Sets de contenu

| Set | Tier | Espèces | Version |
|-----|------|---------|---------|
| 0 — Base | 0–1 | 5 communes (onboarding pool IDs 1–10) | V0.1 |
| 1 — Mutations | 2 | 10 espèces Tier 2 | V0.3 |
| 2 — Obscura | 3 | 5 espèces rares / étranges | V0.4 |
| 3 — Légendaires | 4 | 2–3 serveur-first très rares | V0.5 |

---

## Tiers de qualité

Tirés au sort à la récolte. Les bonus jardin décalent les poids.

| ID | Nom | Emoji | Prix ×base | XP ×base |
|----|-----|-------|-----------|---------|
| 0 | Guezmer | 💀 | ×0.5 | ×0.5 |
| 1 | Potable | 🌱 | ×1.0 | ×1.0 |
| 2 | Frape | ✨ | ×1.8 | ×1.5 |
| 3 | Banger | 🔥 | ×3.0 | ×2.0 |
| 4 | Comète | ☄️ | ×6.0 | ×3.0 |

Poids de base : Guezmer 20 / Potable 40 / Frape 25 / Banger 10 / Comète 5

---

## Jardin (améliorations)

Chaque effet a un niveau max et un coût qui croît par palier.

| ID | Nom | Emoji | Effet | Prix Lv1 | Max |
|----|-----|-------|-------|----------|-----|
| waterBonus | Arrosoir auto | 🚿 | +chances Frape | 50🪙 | 3 |
| lightBonus | Lampe LED | 💡 | +chances Banger | 150🪙 | 3 |
| thermoBonus | Thermostat Pro | 🌡️ | −risque Guezmer | 200🪙 | 2 |
| fanBonus | Ventilateur | 🌬️ | +chances Banger | 400🪙 | 3 |
| uvBonus | Loupe UV | 🔬 | +chances Comète | 800🪙 | 2 |

Débloqué à Lv3.

---

## Colis mystère

- Cooldown : 12h
- Livraison : 1 graine Tier 0–1 aléatoire via Edge Function `claim-mystery-seed`
- À Lv2 : pool élargi (à implémenter en V0.3)

---

## Testeurs

5 testeurs nommés (Gus, Miko, Zara, Pépé, Nox), chacun avec un score de bonheur (0–100).
Faire goûter une plante récoltée augmente leur bonheur selon la rareté.
Débloqués à Lv3.

| Rareté | Delta bonheur |
|--------|--------------|
| common | +2 |
| rare | +6 |
| epic | +12 |
| legendary | +20 |
| mythic | +30 |

---

## Codex

- Une entrée par espèce découverte par le joueur
- Trois états : `unknown` / `server-known` (découverte par quelqu'un d'autre) / `unlocked`
- Badge 🏅 "1ère découverte serveur" si `was_first_server = true`

---

## Identité Nitro

- Botanica est une app connectée au compte Nitro (https://nitro.sterenna.fr)
- Auth partagée via `/shared/auth.js` et `/shared/profile.js`
- La topbar affiche : avatar Nitro + pseudo + lien "Retour Star"
- Le profil Botanica sera visible dans Star à partir de V0.5

---

## Mutations

Durée fixe : **12h** par pot.
Résultat calculé côté serveur (Edge Function `harvest-mutation`) selon :
- Les deux espèces mères
- Le niveau joueur
- Les bonus jardin actifs
