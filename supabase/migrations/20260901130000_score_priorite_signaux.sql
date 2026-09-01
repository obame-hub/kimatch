-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- LE SCORE DE PRIORITÉ D'UN SIGNAL — LE BARÈME DE MICHEL
--
-- Michel, message du 11 h 43 : « Contact → contrôle opportunité en cours → analyse → score →
-- classement → Top 20 signaux », avec un barème sur 100 :
--
--     Échéance                50 pts
--     Taux d'acceptation      25 pts
--     Interactions            15 pts
--     Potentiel portefeuille  10 pts
--
-- Cette vue calcule le score de CHAQUE contact. Elle ne crée rien : le classement et la génération
-- des signaux s'appuient dessus (script `generer-signaux-echeance.cjs`), et l'écran peut la lire
-- pour montrer POURQUOI un signal est prioritaire — un score sans son détail est un chiffre qu'on
-- subit.
--
-- ══ POURQUOI UNE VUE, ET NON UNE COLONNE CALCULÉE À L'ÉCRITURE ══
--
-- Trois des quatre critères bougent sans qu'on touche au signal : une interaction arrive, une
-- recommandation se clôture, un compteur change d'échéance. Un score figé à la création serait faux
-- le lendemain. Ici il se recalcule à chaque lecture, sur les faits du jour.
--
-- ══ LE CHEMIN VERS LE CONTACT EST CELUI DU GÉNÉRATEUR, MOT POUR MOT ══
--
-- `compteurs.responsable_contact_id`, à défaut le contact principal du compte. Le reprendre à
-- l'identique n'est pas une commodité : si la vue et le générateur désignaient deux contacts
-- différents, le score afficherait celui d'une personne et le signal nommerait l'autre.
--
-- ══ CE QUE « INTERACTION POSITIVE » VEUT DIRE, ET COMMENT JE L'AI TRADUIT ══
--
-- Michel : « réponse à un email, appel avec échange, demande d'information, demande de rappel,
-- rendez-vous ou autre échange montrant un intérêt du contact. Un simple email automatique envoyé ne
-- doit pas être considéré comme une interaction positive. »
--
-- Le critère commun est que LE CONTACT A RÉAGI. Deux marques le disent dans nos données :
--
--   · `sens = 'ENTRANT'`  — l'échange vient de lui : réponse, appel reçu, demande. 15 665 lignes.
--   · un RENDEZ-VOUS, une VISIO ou une VISITE DE SITE — quel qu'en soit le sens, elle a eu lieu,
--     donc il y a participé.
--
-- Un e-mail SORTANT seul n'est pas retenu : c'est exactement le cas qu'il exclut. Les notes internes
-- non plus — elles ne sont pas un échange avec le contact.
--
-- LIMITE ASSUMÉE : 31 793 interactions n'ont aucun sens renseigné (reprise Salesforce). Elles ne
-- comptent donc pas comme positives, sauf si leur type est un rendez-vous. C'est le choix prudent :
-- compter un envoi sans réponse comme un signe d'intérêt gonflerait le score de contacts muets.
--
-- ══ LE POTENTIEL PASSE PAR LE COMPTE, FAUTE DE MIEUX ══
--
-- Michel : « le nombre de compteurs rattachés au contact ». La table `contacts_sites`, qui dirait
-- quels sites un contact suit précisément, est VIDE — zéro ligne. Le seul chemin disponible est donc
-- le compte : les compteurs de tous les sites de son compte, plus ceux dont il est explicitement
-- responsable. Deux contacts d'un même compte reçoivent de ce fait le même potentiel. C'est fidèle à
-- l'intention — mesurer la taille du portefeuille — mais à corriger le jour où `contacts_sites` sera
-- alimentée.
-- ════════════════════════════════════════════════════════════════════════════════════════════════

begin;

drop view if exists public.v_signal_score_contact;

create view public.v_signal_score_contact
with (security_invoker = true) as
with compteur_contact as (
  -- Le rattachement compteur → contact, identique à celui du générateur.
  select k.id as compteur_id,
         k.date_echeance,
         coalesce(
           k.responsable_contact_id,
           (select ct.id from public.contacts ct
             where ct.compte_id = s.compte_id and ct.actif
             order by ct.contact_principal desc nulls last, ct.date_creation
             limit 1)
         ) as contact_id
    from public.compteurs k
    join public.sites s on s.id = k.site_id
   where k.actif
),
patrimoine as (
  select contact_id,
         count(*)::integer as nb_compteurs,
         -- L'échéance qui compte est LA PLUS PROCHE dans la fenêtre : c'est elle qui donne l'urgence.
         min(date_echeance) filter (
           where date_echeance >= current_date
             and date_echeance <= current_date + interval '12 months'
         ) as echeance_proche,
         count(*) filter (where date_echeance is null)::integer as compteurs_sans_echeance,
         count(*) filter (where date_echeance < current_date)::integer as compteurs_echeance_depassee
    from compteur_contact
   where contact_id is not null
   group by contact_id
),
acceptation as (
  -- « L'historique des recommandations RÉELLEMENT PRÉSENTÉES au contact » : celles qui portent une
  -- finalité, donc qui ont été tranchées. Une recommandation encore ouverte n'a rien à dire du taux.
  select r.contact_signataire_id as contact_id,
         count(*)::integer as nb_tranchees,
         count(*) filter (where r.finalite_cloture = 'ACCEPTEE')::integer as nb_acceptees
    from public.recommandations r
   where r.contact_signataire_id is not null and r.finalite_cloture is not null
   group by r.contact_signataire_id
),
derniere_positive as (
  select i.contact_id,
         max(i.date_interaction) as le
    from public.interactions i
    left join public.types_interactions ti on ti.id = i.type_interaction_id
   where i.contact_id is not null and i.actif
     and (
       i.sens = 'ENTRANT'
       or coalesce(ti.code, '') in ('RENDEZ_VOUS', 'VISIO', 'VISITE_SITE')
     )
   group by i.contact_id
),
opportunite_ouverte as (
  select distinct o.contact_id
    from public.opportunites o
    join public.statuts_opportunites so on so.id = o.statut_id
   where o.contact_id is not null and o.actif
     and so.code not in ('CONVERTIE', 'ABANDONNEE')
)
select ct.id                              as contact_id,
       ct.prenom || ' ' || ct.nom         as contact_nom,
       ct.compte_id,
       cp.nom                             as compte_nom,
       -- LE COMMERCIAL. Le classement se fait « par commercial » : sans cet ancrage la règle des 20
       -- n'a aucun sens. Le propriétaire du contact d'abord, celui du compte à défaut.
       coalesce(ct.proprietaire_id, cp.proprietaire_id) as commercial_id,

       pa.echeance_proche,
       (pa.echeance_proche - current_date)             as jours_avant_echeance,
       coalesce(pa.nb_compteurs, 0)                    as nb_compteurs,
       coalesce(pa.compteurs_sans_echeance, 0)         as compteurs_sans_echeance,
       coalesce(pa.compteurs_echeance_depassee, 0)     as compteurs_echeance_depassee,

       -- ══ 1 · ÉCHÉANCE — 50 POINTS ══
       case
         when pa.echeance_proche is null then 0
         when pa.echeance_proche <= current_date + interval '3 months'  then 50
         when pa.echeance_proche <= current_date + interval '6 months'  then 40
         when pa.echeance_proche <= current_date + interval '9 months'  then 25
         when pa.echeance_proche <= current_date + interval '12 months' then 10
         else 0
       end::integer as pts_echeance,

       -- ══ 2 · TAUX D'ACCEPTATION — 25 POINTS ══
       -- « Aucun historique : 10 pts pour ne pas pénaliser un nouveau contact » (Michel).
       coalesce(ac.nb_tranchees, 0)  as nb_recos_tranchees,
       coalesce(ac.nb_acceptees, 0)  as nb_recos_acceptees,
       case when coalesce(ac.nb_tranchees, 0) = 0 then null
            else round(100.0 * ac.nb_acceptees / ac.nb_tranchees) end as taux_acceptation,
       case
         when coalesce(ac.nb_tranchees, 0) = 0 then 10
         when 100.0 * ac.nb_acceptees / ac.nb_tranchees >= 80 then 25
         when 100.0 * ac.nb_acceptees / ac.nb_tranchees >= 60 then 20
         when 100.0 * ac.nb_acceptees / ac.nb_tranchees >= 40 then 15
         when 100.0 * ac.nb_acceptees / ac.nb_tranchees >= 20 then 10
         else 5
       end::integer as pts_acceptation,

       -- ══ 3 · INTERACTIONS — 15 POINTS ══
       dp.le as derniere_interaction_positive,
       case
         when dp.le is null then 0
         when dp.le >= now() - interval '30 days'  then 15
         when dp.le >= now() - interval '90 days'  then 10
         when dp.le >= now() - interval '180 days' then 5
         else 0
       end::integer as pts_interactions,

       -- ══ 4 · POTENTIEL — 10 POINTS ══
       case
         when coalesce(pa.nb_compteurs, 0) >= 10 then 10
         when coalesce(pa.nb_compteurs, 0) >= 4  then 8
         when coalesce(pa.nb_compteurs, 0) >= 2  then 5
         when coalesce(pa.nb_compteurs, 0) = 1   then 2
         else 0
       end::integer as pts_potentiel,

       -- ══ LE SCORE ══
       (
         case
           when pa.echeance_proche is null then 0
           when pa.echeance_proche <= current_date + interval '3 months'  then 50
           when pa.echeance_proche <= current_date + interval '6 months'  then 40
           when pa.echeance_proche <= current_date + interval '9 months'  then 25
           when pa.echeance_proche <= current_date + interval '12 months' then 10
           else 0
         end
         + case
             when coalesce(ac.nb_tranchees, 0) = 0 then 10
             when 100.0 * ac.nb_acceptees / ac.nb_tranchees >= 80 then 25
             when 100.0 * ac.nb_acceptees / ac.nb_tranchees >= 60 then 20
             when 100.0 * ac.nb_acceptees / ac.nb_tranchees >= 40 then 15
             when 100.0 * ac.nb_acceptees / ac.nb_tranchees >= 20 then 10
             else 5
           end
         + case
             when dp.le is null then 0
             when dp.le >= now() - interval '30 days'  then 15
             when dp.le >= now() - interval '90 days'  then 10
             when dp.le >= now() - interval '180 days' then 5
             else 0
           end
         + case
             when coalesce(pa.nb_compteurs, 0) >= 10 then 10
             when coalesce(pa.nb_compteurs, 0) >= 4  then 8
             when coalesce(pa.nb_compteurs, 0) >= 2  then 5
             when coalesce(pa.nb_compteurs, 0) = 1   then 2
             else 0
           end
       )::integer as score,

       -- ══ L'ÉLIGIBILITÉ ══
       -- « Si le contact possède déjà une opportunité en cours → aucun signal n'est généré. » Le
       -- contrôle vient AVANT tout calcul dans la phrase de Michel ; ici il est une colonne, pour que
       -- l'écran puisse dire « écarté parce qu'une opportunité est ouverte » plutôt que de le taire.
       (oo.contact_id is not null) as opportunite_en_cours,
       (pa.echeance_proche is not null and oo.contact_id is null) as eligible_signal
  from public.contacts ct
  left join public.comptes cp on cp.id = ct.compte_id
  left join patrimoine pa on pa.contact_id = ct.id
  left join acceptation ac on ac.contact_id = ct.id
  left join derniere_positive dp on dp.contact_id = ct.id
  left join opportunite_ouverte oo on oo.contact_id = ct.id
 where ct.actif;

comment on view public.v_signal_score_contact is
  'Score de priorité /100 d''un contact pour la génération des signaux — barème de Michel du 01/09/2026 : échéance 50, taux d''acceptation 25, interactions 15, potentiel 10. `eligible_signal` applique le contrôle « pas d''opportunité en cours ».';

grant select on public.v_signal_score_contact to authenticated, anon, service_role;

commit;
