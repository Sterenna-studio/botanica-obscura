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
| 10 | 6 000 | +1 000🪙 🎖️ |
| 11 | 8 000 | +600🪙 +1 slot pot (5 pots) |
| 12 | 10 500 | +700🪙 |
| 13 | 13 500 | +900🪙 |
| 14 | 17 000 | +1 200🪙 +1 slot pot (6 pots) |
| 15 | 21 000 | +2 000🪙 🏆 (max level) |

**Slots de pots** : 1 → 2 (Lv4) → 3 (Lv5) → 4 (Lv8) → 5 (Lv11) → 6 (Lv14).
Au-delà, achetables à la Boutique (« Agrandir le laboratoire ») jusqu'à **8 pots**,
coût croissant `1500 × slots actuels` (max 8).

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
| yieldBonus | Engrais Florissant | 🌸 | +1 fleur récoltée / niveau | 300🪙 | 3 |
| seedLuck | Pollen Fertile | 🧬 | +8% chances graines de variété / niveau | 250🪙 | 3 |

Débloqué à Lv3. `yieldBonus` et `seedLuck` sont résolus côté client
(quantité de fleurs et drop de graines) ; les autres décalent les poids de
qualité côté Edge Function.

---

## Drop de graines à la récolte

À chaque récolte (`lib/seedDrop.js`) :

- **Graines parentes** : chaque espèce mère a 70% de chance de redonner 1–3 de
  ses graines (50% → 1, 35% → 2, 15% → 3).
- **Graines de variété** : la plante récoltée peut redonner des graines de sa
  propre espèce. La chance croît avec le tier de qualité, +8%/niveau de
  `seedLuck` :

| Qualité | Guezmer | Potable | Frape | Banger | Comète |
|---------|---------|---------|-------|--------|--------|
| Chance variété | 10% | 20% | 35% | 55% | 75% |
| Chance ×2 graines | 0% | 0% | 10% | 25% | 40% |

---

## Bonus quotidien & quêtes (`lib/quests.js`)

État stocké en local (`daily`, `quests`), récompenses appliquées via
`grantPlayerRewards` (XP + pièces, sync cloud).

- **Bonus quotidien** : réclamable 1×/jour. Série (streak) de jours consécutifs,
  plafonnée à J7. Récompense = `25 + (streak−1)×10` 🪙 et `15 + (streak−1)×5` XP.
- **Quêtes journalières** (réinit. chaque jour) :
  - 🌸 Récolter 3 plantes → +30🪙 +40 XP
  - 🧪 Lancer 2 mutations → +20🪙 +25 XP
  - 💰 Vendre 5 fleurs → +25🪙 +30 XP

---

## Statistiques (`lib/stats.js`)

Suivi local de l'activité : récoltes, fleurs/graines obtenues, graines de
variété, mutations lancées, fleurs vendues, pièces gagnées, répartition et
meilleur tier de qualité. Affiché dans l'onglet Codex (panneau 📊).

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

---

## Boutique (onglet dédié)

Tout le contenu marchand est regroupé dans l'onglet **🏪 Boutique** : bonus
quotidien, quêtes, colis mystère, graines de base, agrandissement du labo et
jardin/améliorations.

**Graines de base** — prix élevés et déblocage par niveau (on devient un
botaniste reconnu, donc on accède au matériel rare) :

| Rareté | Prix achat | Niveau requis |
|--------|-----------|---------------|
| common | 40🪙 | 1 |
| rare | 120🪙 | 2 |
| epic | 350🪙 | 4 |
| legendary | 900🪙 | 6 |
| mythic | 2 200🪙 | 8 |

---

## Livraisons — Pontivy

Page `delivery.html` + mini-jeu de conduite (`lib/deliveryGame.js`).

- Des NPC commandent une espèce, à livrer à un **vrai lieu de Pontivy** (Les
  Halles, Château des Rohan, Place du Martray, Basilique Notre-Dame-de-Joie,
  Quartier de la Gare, bords du Blavet, Parc de Kério, Stival, Le Plessis).
- Chaque lieu a une distance, une difficulté (★ à ★★★) et un multiplicateur de
  récompense (`reward = prix NPC × 1.5 × multiplicateur lieu`).
- Cliquer **Livrer** lance le mini-jeu top-down : on traverse Pontivy (panneaux
  et monuments en décor) en évitant la gendarmerie jusqu'à la destination.
  - Réussite → la commande est honorée (graine consommée) + récompense + XP.
  - Échec (collision) → cargo confisqué, commande non livrée (réessayable).
