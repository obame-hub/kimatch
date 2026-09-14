-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- LA CIVILITÉ S'ÉCRIT « M. » ET « Mme »
-- ════════════════════════════════════════════════════════════════════════════════════════════════
--
-- ══ CE CHANGEMENT DÉFAIT UNE DÉCISION DE LA VEILLE, EN CONNAISSANCE DE CAUSE ══
--
-- Naoëlle, 14/09/2026 (migration 20260914180000) : « civilité Monsieur ou Madame, nom formaté tout
-- en majuscules et prénom première lettre en majuscule. C'est très très important pour plus tard,
-- quand on fera des rapports, des stats. » Le déclencheur écrivait donc « Monsieur » / « Madame ».
--
-- William, 14/09/2026, après avoir eu les deux options sous les yeux et la raison de Naoëlle citée :
-- « Go option B » — c'est-à-dire « M. » / « Mme », et le reste s'aligne.
--
-- CE QUI NE CHANGE PAS, ET C'EST L'ESSENTIEL DE SON ARGUMENT : la civilité reste NORMALISÉE à une
-- seule écriture par le déclencheur. Ce qu'elle voulait — qu'un rapport ne compte pas « M. »,
-- « Mr » et « Monsieur » comme trois lignes — est préservé mot pour mot. Seule la forme retenue
-- change, et l'ensemble des synonymes reconnus reste identique.
--
-- À DIRE À NAOËLLE PLUTÔT QU'À LAISSER DÉCOUVRIR : sa convention avait vingt-quatre heures, elle
-- vivait dans son déclencheur, son module `src/lib/civilite.ts` et ses écrans. Les trois sont
-- alignés ici, mais c'est son travail qu'on reprend.
--
-- ══ LA REPRISE ══
--
-- 1 857 contacts et 3 590 pistes portaient « Monsieur » ou « Madame ». Les pistes n'ont pas de
-- déclencheur — seule `contacts` en porte un — mais elles alimentent les contacts à la conversion :
-- les laisser en toutes lettres réintroduirait l'ancienne forme à chaque piste convertie.
-- ════════════════════════════════════════════════════════════════════════════════════════════════

begin;

create or replace function public.fn_formater_identite_contact()
returns trigger
language plpgsql
as $function$
begin
  /* Le nom EN MAJUSCULES : « Dupont », « DUPONT » et « dupont » doivent être la même ligne d'un
     rapport.

     ON NE NULLIFIE PAS LA CHAÎNE VIDE, et c'est le premier essai de Naoëlle qui l'a appris :
     `prenom` et `nom` sont NOT NULL sur `contacts`, donc transformer « » en `null` faisait échouer
     la reprise sur les lignes où l'un des deux est vide. On se contente de nettoyer les blancs. */
  new.nom := upper(btrim(coalesce(new.nom, '')));

  -- Le prénom en Capitale. `initcap` remet une majuscule après tout caractère non alphanumérique :
  -- « jean-pierre » → « Jean-Pierre », « marie claire » → « Marie Claire ». Le `lower` d'abord,
  -- sans quoi « JEAN » resterait « JEAN ».
  new.prenom := initcap(lower(btrim(coalesce(new.prenom, ''))));

  -- La civilité se range en deux valeurs. Ce qu'on ne reconnaît pas se garde tel quel : « Dr »,
  -- « Me », « Maître » existent, et les effacer perdrait une information juste.
  new.civilite := nullif(btrim(new.civilite), '');
  if new.civilite is not null then
    case lower(replace(new.civilite, '.', ''))
      when 'm'        then new.civilite := 'M.';
      when 'mr'       then new.civilite := 'M.';
      when 'monsieur' then new.civilite := 'M.';
      when 'mme'      then new.civilite := 'Mme';
      when 'mrs'      then new.civilite := 'Mme';
      when 'ms'       then new.civilite := 'Mme';
      when 'madame'   then new.civilite := 'Mme';
      when 'mlle'         then new.civilite := 'Mme';
      when 'mademoiselle' then new.civilite := 'Mme';
      else null;  -- on ne change rien
    end case;
  end if;

  return new;
end;
$function$;

update contacts set civilite = 'M.'  where btrim(civilite) = 'Monsieur';
update contacts set civilite = 'Mme' where btrim(civilite) = 'Madame';

-- `pistes` n'a pas de déclencheur, mais alimente `contacts` à la conversion.
update pistes set civilite = 'M.'  where btrim(civilite) = 'Monsieur';
update pistes set civilite = 'Mme' where btrim(civilite) = 'Madame';

do $$
declare restants int;
begin
  select (select count(*) from contacts where btrim(civilite) in ('Monsieur', 'Madame'))
       + (select count(*) from pistes   where btrim(civilite) in ('Monsieur', 'Madame'))
    into restants;

  if restants > 0 then
    raise exception 'ARRÊT : % lignes portent encore l''ancienne écriture.', restants;
  end if;
end $$;

commit;

-- ══ CONTRÔLE APRÈS APPLICATION ══
--
--   select 'contacts' t, civilite, count(*) from contacts group by 1,2
--   union all select 'pistes', civilite, count(*) from pistes group by 1,2 order by 1, 3 desc;
--   -- appliqué le 14/09/2026 : contacts M. 1108 / Mme 749, pistes M. 2450 / Mme 1140,
--   --                          plus aucun « Monsieur » ni « Madame ».
