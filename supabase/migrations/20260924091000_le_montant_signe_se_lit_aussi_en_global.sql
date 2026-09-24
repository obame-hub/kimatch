-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- LE MONTANT SIGNÉ SE LIT AUSSI EN GLOBAL
-- ════════════════════════════════════════════════════════════════════════════════════════════════
--
-- William, 24/09/2026 : « ajoute un autre filtre à côté : Moi + Global. Le "Moi" est sélectionné par
-- défaut et n'affiche que les montants des recommandations acceptées de l'utilisateur en question.
-- Au clic sur Global, c'est TOUTES les recommandations acceptées qui sont comptabilisées. Les
-- filtres doivent être cumulables. »
--
-- ══ LE PIPE EN DÉCISION NE BOUGE PAS ══
--
-- Il reste mien, toujours. William l'avait posé ainsi le 11/09 (« uniquement les recommandations
-- avec en propriétaire l'utilisateur qui affiche le dashboard ») et ne demande pas de le changer :
-- c'est une espérance personnelle, pas un compteur d'équipe. Seul `montant_signe` écoute la portée.
--
-- ══ LE TRIMESTRE RESTE ACCEPTÉ, MÊME S'IL DISPARAÎT DE L'ÉCRAN ══
--
-- Il sort des filtres à la demande de William, mais chaque navigateur garde le dernier choix dans
-- son `localStorage` : ceux qui étaient sur « Trimestre » enverraient encore ce mot au prochain
-- chargement. Le front les ramène au défaut, et la fonction continue de répondre plutôt que de
-- lever une exception — une valeur périmée en mémoire ne doit pas blanchir un tableau de bord.
--
-- ══ L'ANCIENNE SIGNATURE EST SUPPRIMÉE, ET CE N'EST PAS UN DÉTAIL ══
--
-- `create or replace` avec un paramètre de plus ne remplace rien : il crée une SECONDE fonction.
-- Les deux coexisteraient — `(text)` et `(text, text default)` — et un appel à un seul argument
-- deviendrait ambigu : « function is not unique ». C'est exactement le piège rencontré le
-- 22/09/2026 sur `creer_tache_debut_prospection`. On supprime donc l'ancienne dans la foulée ; les
-- appels à un seul argument retombent alors sur la nouvelle et sa valeur par défaut.

create or replace function compter_totaux_offres(p_periode text default 'JOUR', p_portee text default 'MOI')
returns table(pipe_en_decision numeric, nb_en_decision integer, montant_signe numeric)
language plpgsql
stable
set search_path to 'public'
as $$
declare
  v_periode text := upper(coalesce(p_periode, ''));
  v_portee  text := upper(coalesce(p_portee, 'MOI'));
  v_aujourdhui date := (now() at time zone 'Europe/Paris')::date;
  v_depuis date;
begin
  if v_periode not in ('JOUR', 'MOIS', 'TRIMESTRE', 'ANNEE') then
    raise exception 'Période inconnue : « % ». Attendu : JOUR, MOIS, TRIMESTRE ou ANNEE.', p_periode;
  end if;
  if v_portee not in ('MOI', 'GLOBAL') then
    raise exception 'Portée inconnue : « % ». Attendu : MOI ou GLOBAL.', p_portee;
  end if;

  v_depuis := case v_periode
                when 'JOUR'      then v_aujourdhui
                when 'MOIS'      then date_trunc('month',   v_aujourdhui)::date
                when 'TRIMESTRE' then date_trunc('quarter', v_aujourdhui)::date
                when 'ANNEE'     then date_trunc('year',    v_aujourdhui)::date
              end;

  return query
  with moi as (select auth.uid() as profil_id),
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
     where r.actif
       and r.finalite_cloture = 'ACCEPTEE'
       and r.date_cloture >= v_depuis
       and r.date_cloture <= v_aujourdhui
       -- En GLOBAL on ne filtre plus sur le propriétaire : « TOUTES les recommandations acceptées ».
       and (v_portee = 'GLOBAL' or r.proprietaire_id = moi.profil_id));
end;
$$;

drop function if exists compter_totaux_offres(text);
