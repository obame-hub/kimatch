-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- LA VALIDITÉ D'UN MANDAT PART DE SA SIGNATURE
--
-- William, 08/09/2026, sur le mandat SAS TVPJ : « la date de signature est bien le 08/09/2026, donc
-- la période de validité ne devrait pas commencer au 07/09/2026… et sur 36 mois elle devrait se
-- terminer le 08/09/2029. »
--
-- ── PERSONNE NE CALCULAIT FAUX : PERSONNE NE RECALCULAIT ──
--
-- `date_debut_validite` est posée à la CRÉATION du mandat, par `useCreateMandat` :
-- `input.date_signature ?? aujourd'hui`. Un mandat créé dans Kimatch part au statut « À préparer »
-- et n'a évidemment pas encore de signature — le début valait donc le jour de préparation du
-- document, et la fin ce jour-là plus la durée.
--
-- Le webhook DocuSign écrivait ensuite `date_signature` et `date_envoi`, sans jamais revenir sur ces
-- deux dates. Le décalage est donc exactement l'écart entre la préparation et la signature : un
-- jour dans trois cas, deux dans le quatrième.
--
-- Le webhook les recalcule désormais à la transition « signé » (voir `api/docusign/_validite.ts`,
-- et ses dix tests). Cette migration reprend les mandats déjà signés.
--
-- ── QUATRE LIGNES, ET SEULEMENT CELLES PASSÉES PAR DOCUSIGN ──
--
--   SAS TVPJ        signé 08/09/2026   07/09 → 08/09   fin 2029-09-07 → 2029-09-08
--   CABINET CPI     signé 28/08/2026   27/08 → 28/08   fin 2029-08-27 → 2029-08-28
--   SAS TVPJ        signé 27/08/2026   26/08 → 27/08   fin 2029-08-26 → 2029-08-27
--   SAGI-TER        signé 26/08/2026   28/08 → 26/08   fin 2029-08-28 → 2029-08-26
--
-- LES 1 137 MANDATS IMPORTÉS DE SALESFORCE NE SONT PAS TOUCHÉS, et c'est délibéré. Cinq d'entre eux
-- portent aussi un début différent de leur signature — jusqu'à seize jours d'écart pour GUILLERMINET
-- SARL. Mais leurs dates viennent de leur système d'origine, où l'écart peut être une décision : un
-- mandat peut prendre effet à une date négociée. Les recalculer d'autorité écraserait un choix que
-- nous n'avons pas pris. Là où DocuSign a recueilli la signature, en revanche, la signature EST la
-- source.
--
-- ── LE JOUR EST CELUI DE PARIS ──
--
-- `date_signature` est un `timestamptz` renvoyé en UTC par DocuSign. Une signature à 23 h 30 heure
-- de Paris tombe le lendemain en UTC pendant l'été : c'est la journée du client qui fait foi sur un
-- mandat, pas celle du serveur. Aucune des quatre lignes n'est dans ce cas, mais la conversion est
-- posée ici comme elle l'est dans le code.
-- ════════════════════════════════════════════════════════════════════════════════════════════════

begin;

do $$
declare
  n_visees int;
  n_sans_duree int;
begin
  select count(*) into n_visees
  from mandats
  where actif
    and docusign_envelope_id is not null
    and date_signature is not null
    and date_debut_validite is distinct from (date_signature at time zone 'Europe/Paris')::date;

  if n_visees = 0 then
    raise exception 'Aucun mandat DocuSign décalé : la reprise a déjà eu lieu.';
  end if;

  if n_visees > 20 then
    raise exception
      '% mandats visés, alors que quatre étaient attendus le 08/09/2026 : vérifier avant de reprendre.',
      n_visees;
  end if;

  -- Sans durée, on ne peut pas recalculer la fin : on saurait la déplacer sans savoir où.
  select count(*) into n_sans_duree
  from mandats
  where actif
    and docusign_envelope_id is not null
    and date_signature is not null
    and date_debut_validite is distinct from (date_signature at time zone 'Europe/Paris')::date
    and (duree_mois is null or duree_mois <= 0);

  raise notice '% mandat(s) repris, dont % sans durée connue (fin laissée telle quelle).',
    n_visees, n_sans_duree;
end $$;

update mandats
set date_debut_validite = (date_signature at time zone 'Europe/Paris')::date,
    date_fin_validite = case
      when duree_mois is not null and duree_mois > 0
        then ((date_signature at time zone 'Europe/Paris')::date + make_interval(months => duree_mois))::date
      else date_fin_validite
    end,
    date_modification = now()
where actif
  and docusign_envelope_id is not null
  and date_signature is not null
  and date_debut_validite is distinct from (date_signature at time zone 'Europe/Paris')::date;

commit;

-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- CONTRÔLE APRÈS APPLICATION
--
--   -- Doit renvoyer 0 : plus aucun mandat DocuSign dont la validité ne part pas de sa signature.
--   select count(*) from mandats
--   where actif and docusign_envelope_id is not null and date_signature is not null
--     and date_debut_validite is distinct from (date_signature at time zone 'Europe/Paris')::date;
--
--   -- Le mandat de William : début 2026-09-08, fin 2029-09-08.
--   select date_debut_validite, date_fin_validite
--   from mandats where id = '782e2426-7d5c-4eef-bed4-0fb094c0be1d';
-- ════════════════════════════════════════════════════════════════════════════════════════════════
