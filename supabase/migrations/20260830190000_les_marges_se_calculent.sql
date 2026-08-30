begin;

-- LES MARGES SE CALCULENT, ELLES NE SE TAPENT PLUS.
--
-- Règles données par Michel le 30/08/2026 :
--   marge nette      = marge brute − marge apporteur d'affaires
--   marge commission = (marge nette / 0,75) × 0,85, selon le courtier qui propose l'offre
--
-- La première tenait déjà sur 1 562 dossiers sur 1 562, sans un contre-exemple. La seconde tenait
-- aussi, mais SAISIE À LA MAIN — et c'est là qu'était le problème :
--
--   - ENERGEM portait trois valeurs pour un seul taux : 1,13 sur 16 dossiers, 1,14 sur 16 autres,
--     1,1333 sur 7. Même courtier, même règle, trois arrondis selon qui remplissait le champ.
--   - Quatorze dossiers portaient une valeur impossible. Le pire : 222,30 € de marge nette pour
--     4 112,55 € de commission, soit un rapport de 18,50. Un autre à 0,50, où la commission vaut
--     la moitié de la marge. Ce sont des montants qui décident de rémunérations.
--
-- Le taux monte donc sur la FICHE FOURNISSEUR, où il est vrai une fois pour toutes, au lieu d'être
-- retapé sur chaque dossier. Un rapport de 18,50 devient impossible à saisir.

-- ── 1. Le taux du courtier, porté par le fournisseur ────────────────────────────────────────

alter table comptes
  add column if not exists taux_commission_courtier numeric(10, 6);

comment on column comptes.taux_commission_courtier is
  'Coefficient appliqué à la marge nette pour obtenir la marge « commission », quand ce compte est '
  'un courtier qui nous apporte l''offre. Vaut 0,85/0,75 = 1,133333 pour tous les courtiers connus '
  'au 30/08/2026. NULL veut dire qu''on traite avec ce fournisseur en direct : pas de coefficient.';

-- Les six courtiers, identifiés par leurs données : ils portent le coefficient sur la quasi-totalité
-- de leurs dossiers, là où GAZ EUROPEEN, GEDIA, OHM ENERGIE, SEFE, ILEK, TOTAL ENERGIES et
-- VATTENFALL sont à 1,0000. Aucun n'a un taux propre : les écarts observés (1,13 / 1,14 / 1,1416)
-- sont tous du bruit de saisie autour de la même valeur.
update comptes
   set taux_commission_courtier = round(0.85 / 0.75, 6)
 where nom in ('PICOTY', 'ENERGEM', 'PRIMEO ENERGIE', 'GME FRANCE', 'SELIA', 'GAZEL ENERGIE');

-- ── 2. Le calcul, à l'écriture ──────────────────────────────────────────────────────────────

create or replace function fn_calculer_marges()
returns trigger
language plpgsql
as $$
declare
  v_taux numeric;
begin
  -- Sans marge brute, il n'y a rien à déduire : on ne remplit pas des cases avec des zéros.
  if new.marge_brute is null then
    return new;
  end if;

  new.marge_nette := new.marge_brute - coalesce(new.marge_apporteur, 0);

  select taux_commission_courtier into v_taux
    from comptes where id = new.fournisseur_compte_id;

  new.marge_nette_coeff := round(new.marge_nette * coalesce(v_taux, 1), 2);
  new.marge_nette := round(new.marge_nette, 2);

  return new;
end;
$$;

drop trigger if exists trg_calculer_marges on recommandations;

create trigger trg_calculer_marges
  before insert or update of marge_brute, marge_apporteur, fournisseur_compte_id
  on recommandations
  for each row
  execute function fn_calculer_marges();

-- ── 3. Remise d'équerre de l'existant ───────────────────────────────────────────────────────
--
-- ON CORRIGE CE QUI EST FAUX, ON NE REMPLIT PAS CE QUI EST VIDE.
--
-- 880 dossiers n'ont aucune marge « commission ». Elle se déduirait sans peine — mais la calculer
-- reviendrait à faire apparaître 880 montants de rémunération que personne n'a jamais posés, d'un
-- seul coup et sans que quiconque l'ait demandé. Ils restent vides, et se rempliront au fur et à
-- mesure que les dossiers seront touchés, chaque fois tracé dans l'historique.
--
-- Seules bougent les valeurs qui contredisent la règle : 5 marges nettes (des arrondis au centime)
-- et 141 marges commission, dont les quatorze aberrantes. 16 545 € d'écart cumulé.

update recommandations r
   set marge_nette = round(r.marge_brute - coalesce(r.marge_apporteur, 0), 2)
 where r.marge_brute is not null
   and abs(coalesce(r.marge_nette, 0) - (r.marge_brute - coalesce(r.marge_apporteur, 0))) >= 0.005;

update recommandations r
   set marge_nette_coeff = round(
         (r.marge_brute - coalesce(r.marge_apporteur, 0))
         * coalesce((select c.taux_commission_courtier from comptes c where c.id = r.fournisseur_compte_id), 1),
       2)
 where r.marge_brute is not null
   and r.marge_nette_coeff is not null
   and abs(
         r.marge_nette_coeff
         - (r.marge_brute - coalesce(r.marge_apporteur, 0))
           * coalesce((select c.taux_commission_courtier from comptes c where c.id = r.fournisseur_compte_id), 1)
       ) >= 0.005;

commit;
