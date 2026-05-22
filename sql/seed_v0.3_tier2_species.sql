-- sql/seed_v0.3_tier2_species.sql
-- Set 1 V0.3 : 10 especes Tier 2.

BEGIN;

INSERT INTO public.botanica_species
(id, slug, name, tier, rarity, is_base_species, parent_a_id, parent_b_id, body_color, stem_color, eye_color, description)
VALUES
(11,'crystalia','Crystalia',2,'epic',false,6,7,'#c0f0ff','#70c0e0','#205060','Structure cristalline translucide. Mutation rare entre vigueur et lumiere.'),
(12,'ignivora','Ignivora',2,'rare',false,8,3,'#f07030','#a02800','#600800','Devore la chaleur pour pousser encore plus vite.'),
(13,'volcanis','Volcanis',2,'epic',false,7,5,'#f04820','#801000','#400000','Nait dans les conditions les plus extremes. Lumiere volcanique.'),
(14,'glaciana','Glaciana',2,'epic',false,9,11,'#b0e8ff','#60a8d8','#105888','Cristaux de glace sur les tiges. Mutation aquatique cristallisee.'),
(20,'muscara','Muscara',2,'rare',false,6,2,'#78b848','#486828','#203010','Tige musclee impossible a briser. Inspiree du bambou de montagne.'),
(21,'solanara','Solanara',2,'rare',false,18,10,'#e89040','#b05010','#602800','Parente lointaine avec les solanacees. Baies lumineuses mais toxiques.'),
(22,'hostrelis','Hostrelis',2,'epic',false,7,8,'#c070e0','#803090','#400050','Feuilles veinees de lumiere qui pulsent la nuit.'),
(23,'aquamoss','Aquamoss',2,'rare',false,9,1,'#50c880','#208850','#084828','Tapis de mousse aquatique dense. Purifie son environnement.'),
(31,'nullherba','Nullherba',2,'epic',false,19,8,'#909090','#606060','#303030','Ni vivante ni morte. Classification incertaine.'),
(33,'mycelune','Mycelune',2,'rare',false,18,9,'#b8d8a0','#6f8f58','#304830','Champignon-liane lunaire aux spores pales.')
ON CONFLICT (id) DO UPDATE SET
slug=EXCLUDED.slug,
name=EXCLUDED.name,
tier=EXCLUDED.tier,
rarity=EXCLUDED.rarity,
is_base_species=EXCLUDED.is_base_species,
parent_a_id=EXCLUDED.parent_a_id,
parent_b_id=EXCLUDED.parent_b_id,
body_color=EXCLUDED.body_color,
stem_color=EXCLUDED.stem_color,
eye_color=EXCLUDED.eye_color,
description=EXCLUDED.description;

COMMIT;
