-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- LE PIPE EN DÉCISION LIT LA COLONNE DE TRAVAIL DU DOSSIER, PAS LE STATUT DE SA VERSION
--
-- William, 11/09/2026 : « attention, c'est la recommandation qui doit être à "En décision", pas la
-- version. J'ai tort ? »
--
-- Il n'a pas tort, et l'écart est de QUATRE DOSSIERS.
--
-- ── LE MALENTENDU, ET CE QU'IL CACHAIT ──
--
-- Pris à la lettre, « En décision » n'est pas une étape de recommandation : `etapes_recommandation`
-- ne connaît que BROUILLON, ACTIVE, À RÉACTIVER et CLÔTURÉE. Le statut vit bien sur la version —
-- c'est Michel qui l'y a déplacé le 28/08/2026 : « ce qu'on présente au client est une version, pas
-- un dossier ».
--
-- MAIS CE N'EST PAS CE QUE WILLIAM REGARDE. Sur la page Recommandations, un dossier est rangé dans
-- une colonne de travail, et cette colonne N'EST PAS le statut de la version : elle le surclasse
-- quand un contrat est parti à la signature.
--
--     colonne_travail = CLÔTURÉE                si l'étape est clôturée
--                       EN_CONTRACTUALISATION   si un contrat est en cours de signature  ← ICI
--                       BROUILLON               si aucune version
--                       le statut de la version sinon
--
-- La première version de cette fonction filtrait sur `sv.code = 'EN_DECISION'`. Elle ramassait donc
-- 26 dossiers là où l'écran en montre 22 : les 4 autres ont leur contrat chez le notaire de la
-- signature électronique, et l'interface les range — à raison — sous « En cours de
-- contractualisation ».
--
-- CES QUATRE-LÀ N'ONT RIEN À FAIRE DANS LE PIPE. « En décision » veut dire « la balle est chez le
-- client, il peut encore dire non ». Un dossier dont le contrat part à la signature a déjà dit oui :
-- le compter comme une espérance, c'est compter deux fois — une fois ici, une fois dans le montant
-- signé le jour où il se signe.
--
-- ── D'OÙ LA LECTURE DE `v_recommandations_liste` ──
--
-- La fonction lit désormais `colonne_travail`, c'est-à-dire EXACTEMENT la définition qui range les
-- dossiers sur la page Recommandations. Réécrire cette règle ici en aurait fait une seconde vérité :
-- il aurait suffi que Michel ajoute une colonne — ce qu'il a fait le 31/08/2026 avec « En cours de
-- contractualisation », précisément la cause de cet écart — pour que le tableau de bord et la page
-- Recommandations cessent de dire la même chose sans que personne ne le remarque.
--
-- Le garde-fou du `join recommandations … and r.actif` reste : la vue n'expose pas `actif`, et un
-- dossier supprimé ne doit pas peser dans un indicateur.
-- ════════════════════════════════════════════════════════════════════════════════════════════════

begin;

drop function if exists compter_totaux_offres();

create function compter_totaux_offres()
returns table (
  pipe_en_decision numeric,
  nb_en_decision   integer,
  montant_signe    numeric
)
language sql
stable
security invoker
set search_path = public
as $$
  with moi as (select auth.uid() as profil_id),
  jour as (select (now() at time zone 'Europe/Paris')::date as aujourdhui),
  en_decision as (
    select l.marge_nette_coeff
    from v_recommandations_liste l
    join recommandations r on r.id = l.id and r.actif
    cross join moi
    where l.colonne_travail = 'EN_DECISION'
      and l.proprietaire_id = moi.profil_id
  )
  select
    (select coalesce(sum(marge_nette_coeff), 0) from en_decision),
    (select count(*)::integer from en_decision),
    (select coalesce(sum(r.marge_nette_coeff), 0)
     from recommandations r
     cross join moi
     cross join jour j
     where r.actif
       and r.proprietaire_id = moi.profil_id
       and r.finalite_cloture = 'ACCEPTEE'
       and r.date_cloture = j.aujourdhui);
$$;

comment on function compter_totaux_offres is
  'Le pipe en décision et le montant signé du jour, pour le propriétaire connecté. Le périmètre du pipe est colonne_travail = EN_DECISION de v_recommandations_liste — la même définition que la colonne « En décision » de la page Recommandations, contractualisation exclue.';

grant execute on function compter_totaux_offres() to authenticated;

commit;

-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- CONTRÔLE APRÈS APPLICATION
--
--   -- Le total tous propriétaires confondus doit égaler la colonne de la page Recommandations :
--   select count(*) from v_recommandations_liste where colonne_travail = 'EN_DECISION';  -- 22
--
--   -- Et NON le nombre de versions au statut « En décision », qui en compte 26 :
--   select count(*) from v_recommandations_liste
--    where statut_version = 'EN_DECISION' and etape <> 'CLOTUREE';
-- ════════════════════════════════════════════════════════════════════════════════════════════════
