-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- FERMER LA CARTE D'APPEL N'EST PAS DIRE « PAS DE RÉPONSE »
-- ════════════════════════════════════════════════════════════════════════════════════════════════
--
-- Naoëlle, 22/09/2026 : « le petit bloc où ça demande si j'ai eu quelqu'un ou un répondeur ou
-- quelque chose n'apparaît toujours pas ».
--
-- ══ LA CAUSE, MESURÉE ET NON SUPPOSÉE ══
--
-- La croix de la carte d'appel écrivait `qualification = 'PAS_DE_REPONSE'`. Relevé en base le
-- 22/09 : 115 appels portent cette valeur avec `qualifie_le` À NULL — c'est-à-dire que PERSONNE n'a
-- répondu à la question. Et plusieurs d'entre eux ont un `decroche_le` renseigné et un `resultat`
-- « ANSWERED » : on a donc enregistré « ça a sonné dans le vide » sur des appels DÉCROCHÉS.
--
-- Deux dégâts, et le second explique la phrase de Naoëlle :
--
--   · LES CHIFFRES SONT FAUX. « Pas de réponse » est une information commerciale ; l'inventer sur
--     un appel décroché fausse tout comptage de prospection.
--
--   · LA CARTE NE REVIENT JAMAIS. Les deux requêtes qui l'alimentent ne proposent que les appels
--     NON qualifiés. Un appel fermé par la croix était donc considéré comme traité, et ne
--     redemandait plus rien — même quand le commercial venait d'avoir quelqu'un au téléphone.
--
-- ══ CE QU'ON SÉPARE ══
--
-- Écarter une carte est un FAIT D'INTERFACE : « je ne veux plus voir ça maintenant ». Qualifier un
-- appel est un FAIT COMMERCIAL : « j'ai eu un répondeur ». Les deux vivaient dans la même colonne,
-- d'où la confusion. `ecarte_le` accueille le premier, `qualification` garde le second.
--
-- ON NE TOUCHE PAS AUX 115 LIGNES DÉJÀ ÉCRITES. On ne sait pas lesquelles ont été fermées par la
-- croix et lesquelles ont été réellement qualifiées — `qualifie_le` le dirait, mais il est nul dans
-- les deux cas pour les plus anciennes. Réécrire à l'aveugle remplacerait une donnée fausse par une
-- autre. Elles restent telles quelles, et le défaut ne se reproduit plus.
-- ════════════════════════════════════════════════════════════════════════════════════════════════

begin;

alter table public.appels_en_cours
  add column if not exists ecarte_le timestamptz;

comment on column public.appels_en_cours.ecarte_le is
  'Quand le commercial a fermé la carte de cet appel sans répondre à « qui as-tu eu ? ». C''est un '
  'fait d''interface — « je ne veux plus voir ça » — et non un résultat d''appel : la croix '
  'écrivait auparavant « PAS_DE_REPONSE », ce qui inventait une information commerciale sur des '
  'appels parfois décrochés, et empêchait la carte de reparaître. Une carte écartée peut être '
  'reproposée ; un appel qualifié, non.';

-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- LE GARDE-FOU : ÉCARTER NE DOIT RIEN AFFIRMER SUR L'APPEL
-- ════════════════════════════════════════════════════════════════════════════════════════════════
--
-- Ce que la migration rend possible, et qu'on éprouve ici : écarter une carte sans toucher ni à la
-- qualification, ni à la fin de l'appel. Le risque qu'on écarte est précisément celui qu'on vient
-- de corriger — qu'un geste d'interface se mette à écrire une donnée métier.
--
do $$
declare
  v_appel uuid;
  v_qualif text;
  v_termine timestamptz;
  v_ecarte timestamptz;
begin
  insert into public.appels_en_cours (user_email, numero, sens, demarre_le, decroche_le)
  values ('zzz.test@kiwee-energie.fr', '+33999999996', 'SORTANT',
          clock_timestamp(), clock_timestamp())
  returning id into v_appel;

  -- LE GESTE QUE LA MIGRATION AUTORISE : écarter, et rien d'autre.
  update public.appels_en_cours
     set ecarte_le = clock_timestamp()
   where id = v_appel;

  select qualification, termine_le, ecarte_le
    into v_qualif, v_termine, v_ecarte
    from public.appels_en_cours where id = v_appel;

  if v_ecarte is null then
    raise exception 'Écarter une carte ne laisse aucune trace : le geste serait perdu au rechargement.';
  end if;

  if v_qualif is not null then
    raise exception 'Écarter a écrit une qualification (%) — c''est exactement le défaut corrigé.', v_qualif;
  end if;

  if v_termine is not null then
    raise exception 'Écarter a déclaré l''appel terminé : Kimatch se croirait libre pendant une conversation.';
  end if;

  delete from public.appels_en_cours where id = v_appel;

  raise notice 'Garde-fou : écarter une carte n''invente ni qualification ni fin d''appel.';
end $$;

commit;
