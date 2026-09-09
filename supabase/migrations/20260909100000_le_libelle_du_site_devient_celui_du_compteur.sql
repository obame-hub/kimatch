-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- LE LIBELLÉ DU SITE DEVIENT CELUI DU COMPTEUR
--
-- William, 09/09/2026 : « important, il faudrait copier le libellé du site (dans objet site) sur le
-- champ libellé (de l'objet compteur) ». C'est la préparation de la suppression de l'objet Site, sur
-- laquelle Naoëlle travaille : un compteur qui perd son site doit garder de quoi se nommer.
--
-- ── LA COPIE EST DÉJÀ FAITE À 99,6 %, ET C'EST CE QUI REND CETTE MIGRATION COURTE ──
--
-- Mesuré avant d'écrire, sur les 7 919 compteurs actifs :
--
--   libellé identique au nom du site   7 879
--   libellé VIDE                          33   ← les seules lignes à reprendre
--   libellé DIFFÉRENT du nom du site       7   ← à ne surtout pas écraser
--
-- ── LES SEPT ÉCARTS SONT DES SAISIES, PAS DES ERREURS ──
--
--   « BSL- SAINT JACQUES 7-compteur coupé »  pour le site « BSL- SAINT JACQUES 7 »
--   « BSL- S 7 COMPTEUR COUPE »              pour le même site
--   « SDC 6 MIDI »                           pour le site « CABINET LOUIS - PORCHERET »
--   « Blum Laverie » / « BLUM LAVERIE »      une simple casse
--
-- Les deux premiers portent une information que le nom du site n'a pas — un compteur coupé — et le
-- troisième nomme un point de livraison précis dans un cabinet qui en gère plusieurs. Les écraser
-- ferait perdre exactement ce qu'un libellé libre sert à noter. On ne touche donc QU'AUX VIDES.
--
-- ── POURQUOI PAS UN DÉCLENCHEUR QUI MAINTIENDRAIT LA COPIE ──
--
-- Parce que la copie n'est pas une synchronisation : c'est un transfert de propriété. Le site s'en
-- va ; à partir de maintenant, c'est le compteur qui porte son nom, et il doit pouvoir en changer
-- sans qu'une mécanique le ramène à celui d'un objet en train de disparaître.
-- ════════════════════════════════════════════════════════════════════════════════════════════════

begin;

do $$
declare
  n_vides int;
  n_sans_nom_de_site int;
begin
  select count(*) into n_vides
  from compteurs c join sites s on s.id = c.site_id
  where c.actif and btrim(coalesce(c.libelle, '')) = '' and btrim(coalesce(s.nom, '')) <> '';

  select count(*) into n_sans_nom_de_site
  from compteurs c left join sites s on s.id = c.site_id
  where c.actif and btrim(coalesce(c.libelle, '')) = '' and btrim(coalesce(s.nom, '')) = '';

  if n_vides = 0 then
    raise exception 'Aucun compteur actif sans libellé : la reprise a déjà eu lieu.';
  end if;

  -- 33 lignes étaient attendues le 09/09/2026. Un ordre de grandeur différent voudrait dire que la
  -- donnée a bougé entre la mesure et l'application — on préfère s'arrêter et regarder.
  if n_vides > 200 then
    raise exception '% compteurs sans libellé, alors que 33 étaient attendus : vérifier avant de reprendre.', n_vides;
  end if;

  raise notice '% libellé(s) repris depuis le nom du site. % compteur(s) restent sans libellé, faute de nom de site.',
    n_vides, n_sans_nom_de_site;
end $$;

update compteurs c
set libelle = s.nom,
    date_modification = now()
from sites s
where s.id = c.site_id
  and c.actif
  and btrim(coalesce(c.libelle, '')) = ''
  and btrim(coalesce(s.nom, '')) <> '';

commit;

-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- CONTRÔLE APRÈS APPLICATION
--
--   -- Doit renvoyer 0, sauf les compteurs dont le site lui-même n'a pas de nom.
--   select count(*) from compteurs c join sites s on s.id = c.site_id
--   where c.actif and btrim(coalesce(c.libelle,'')) = '' and btrim(coalesce(s.nom,'')) <> '';
--
--   -- Doit rester à 7 : les libellés saisis à la main ne bougent pas.
--   select count(*) from compteurs c join sites s on s.id = c.site_id
--   where c.actif and btrim(coalesce(c.libelle,'')) <> '' and c.libelle <> s.nom;
-- ════════════════════════════════════════════════════════════════════════════════════════════════
