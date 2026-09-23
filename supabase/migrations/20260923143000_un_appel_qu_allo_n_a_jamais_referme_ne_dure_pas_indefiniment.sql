-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- UN APPEL QU'ALLO N'A JAMAIS REFERMÉ NE DURE PAS INDÉFINIMENT
-- ════════════════════════════════════════════════════════════════════════════════════════════════
--
-- Naoëlle, 23/09/2026, après trois tentatives : « la modale de rattachement ne s'ouvre jamais. »
--
-- ══ CE QU'ON A MESURÉ ══
--
-- `appels_en_cours` contient 827 lignes, dont 20 avec `termine_le` à NULL : une de sept minutes,
-- une de vingt et une, et d'autres remontant au 9, au 10, au 15 et au 16 septembre — jusqu'à
-- quatorze jours. Ce ne sont pas des doublons : vérifié un par un, les lignes terminées du même
-- numéro le même jour sont séparées de onze à trois cent quatre-vingt-quatorze minutes, ce sont de
-- vrais rappels. Ces vingt lignes n'ont simplement JAMAIS reçu `call.completed`.
--
-- ALLO NE L'ENVOIE PAS À TOUS LES COUPS, et rien dans Kimatch ne peut l'y forcer. Deux pour cent
-- des appels restent donc ouverts pour toujours.
--
-- ══ POURQUOI ÇA NE RESTE PAS UN DÉTAIL ══
--
-- Un appel « en cours » n'est pas qu'une ligne inexacte, c'est un état qui commande des écrans.
-- La modale de rattachement se taisait tant qu'un appel était ouvert : un seul fantôme la faisait
-- taire pour tous les appels suivants — c'est la panne que Naoëlle voyait. La carte d'appel, elle,
-- prend « l'appel non terminé » en priorité, donc un fantôme y masque le vrai appel en cours.
--
-- Le code applicatif vient d'être corrigé pour ne plus se fier aveuglément à cet état. Mais
-- corriger les lecteurs sans corriger la donnée, c'est laisser chaque nouvel écran retomber dans le
-- même piège. On répare donc la donnée elle-même.
--
-- ══ CE QU'ON FAIT, ET CE QU'ON SE REFUSE À FAIRE ══
--
-- On clôt les appels ouverts depuis plus de DEUX HEURES. Pas quinze minutes : un vrai appel long
-- existe — le plus long mesuré en base dure vingt-six minutes — et fermer une conversation en cours
-- ferait disparaître la carte sous les yeux de qui téléphone. Deux heures est plus long que tout
-- appel plausible et plus court qu'une journée de travail.
--
-- ON NE REMPLIT NI `duree_secondes`, NI `decroche_le`, NI `resultat`. On ne sait pas ce qui s'est
-- passé au téléphone : l'événement de fin n'est jamais venu. Inventer une durée salirait les
-- chiffres de prospection exactement comme la croix qui écrivait `PAS_DE_REPONSE` le 22/09. On
-- pose `termine_le` et `termine_par = 'KIMATCH'` — un fait d'infrastructure, pas un résultat
-- commercial, et qui se distingue d'un `'ALLO'` à la lecture.
--
-- ON NE POSE PAS DE TRIGGER : rien ne se passe à l'insertion ni à la mise à jour de ces lignes au
-- moment où elles expirent, donc un trigger n'aurait aucun événement sur lequel se déclencher.
-- C'est une fonction que `api/allo/webhook.ts` appelle à chaque événement reçu — le trafic d'Allo
-- est le battement le plus fiable dont on dispose, et il ne coûte pas une tâche planifiée de plus.
-- ════════════════════════════════════════════════════════════════════════════════════════════════

begin;

create or replace function public.fermer_appels_fantomes(p_heures integer default 2)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_fermes integer;
begin
  /* `clock_timestamp()` ET NON `now()` : dans une transaction, `now()` reste figé à son ouverture.
     Une fonction appelée par un webhook peut s'exécuter dans une transaction plus longue qu'on ne
     croit, et l'on comparerait alors à une heure passée. */
  update public.appels_en_cours
     set termine_le  = clock_timestamp(),
         termine_par = 'KIMATCH'
   where termine_le is null
     and demarre_le < clock_timestamp() - make_interval(hours => p_heures);
  get diagnostics v_fermes = row_count;
  return v_fermes;
end $$;

comment on function public.fermer_appels_fantomes(integer) is
  'Clôt les appels restés « en cours » au-delà du délai donné, parce qu''Allo n''envoie pas '
  '`call.completed` à tous les coups — 20 lignes sur 827 mesurées le 23/09/2026, dont une de '
  'quatorze jours. Rend le nombre de lignes fermées. N''invente ni durée ni résultat : on ne sait '
  'pas ce qui s''est passé au téléphone, seulement que l''appel ne dure plus.';

-- ── `termine_par` doit accepter la nouvelle provenance ──
--
-- La contrainte n'admettait que 'ALLO' et 'COMMERCIAL'. Sans cet élargissement, la fonction
-- ci-dessus échouerait à la première ligne fermée — et elle échouerait EN SILENCE côté webhook.
alter table public.appels_en_cours
  drop constraint if exists appels_en_cours_termine_par_check;
alter table public.appels_en_cours
  add constraint appels_en_cours_termine_par_check
  check (termine_par is null or termine_par in ('ALLO', 'COMMERCIAL', 'KIMATCH'));

comment on column public.appels_en_cours.termine_par is
  'Qui a déclaré la fin : ALLO sur `call.completed`, COMMERCIAL sur un geste dans Kimatch, KIMATCH '
  'quand le délai a fermé un appel qu''Allo n''a jamais refermé. Cette dernière valeur signale une '
  'fin SUPPOSÉE : ni durée ni résultat ne l''accompagnent.';

-- ── Le rattrapage des lignes déjà en base ──
select public.fermer_appels_fantomes(2);

-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- LE GARDE-FOU : UN APPEL EN COURS DEPUIS DIX MINUTES NE DOIT PAS ÊTRE FERMÉ
-- ════════════════════════════════════════════════════════════════════════════════════════════════
--
-- Ce que la migration rend possible, et qu'on éprouve ici : distinguer le fantôme de la
-- conversation. Le risque n'est PAS de laisser traîner un fantôme de plus — ça se corrige au
-- passage suivant. C'est de RACCROCHER SUR QUELQU'UN : fermer la ligne de qui est en train de
-- parler ferait disparaître sa carte et son chronomètre en pleine conversation.
--
-- On éprouve donc les deux sens, et le second est le seul qui compte vraiment.
--
do $$
declare
  v_vieux uuid;
  v_frais uuid;
  v_fermes integer;
  v_fin_vieux timestamptz;
  v_fin_frais timestamptz;
  v_par text;
  v_duree integer;
begin
  -- Un fantôme : ouvert il y a cinq heures, jamais refermé.
  insert into public.appels_en_cours (user_email, numero, sens, demarre_le)
  values ('zzz.fantome@kiwee-energie.fr', '+33999999994', 'SORTANT',
          clock_timestamp() - interval '5 hours')
  returning id into v_vieux;

  -- Une vraie conversation, commencée il y a dix minutes. On est peut-être encore en ligne.
  insert into public.appels_en_cours (user_email, numero, sens, demarre_le, decroche_le)
  values ('zzz.fantome@kiwee-energie.fr', '+33999999993', 'SORTANT',
          clock_timestamp() - interval '10 minutes', clock_timestamp() - interval '9 minutes')
  returning id into v_frais;

  v_fermes := public.fermer_appels_fantomes(2);

  select termine_le, termine_par, duree_secondes
    into v_fin_vieux, v_par, v_duree
    from public.appels_en_cours where id = v_vieux;

  select termine_le into v_fin_frais
    from public.appels_en_cours where id = v_frais;

  if v_fin_vieux is null then
    raise exception 'Un appel ouvert depuis cinq heures reste ouvert : les fantômes continueraient de masquer la modale.';
  end if;

  if v_par is distinct from 'KIMATCH' then
    raise exception 'Une fin supposée se fait passer pour une fin annoncée par Allo (termine_par = %).', v_par;
  end if;

  -- CE QU'ON REFUSE D'INVENTER. Une durée fabriquée fausserait les chiffres de prospection.
  if v_duree is not null then
    raise exception 'Une durée a été inventée sur un appel dont on n''a jamais su la fin.';
  end if;

  -- LE CAS QUI DOIT ÉCHOUER, et le seul qui ferait du mal à quelqu'un.
  if v_fin_frais is not null then
    raise exception 'Un appel de dix minutes a été fermé : on raccroche sur une conversation en cours.';
  end if;

  delete from public.appels_en_cours where id in (v_vieux, v_frais);
  raise notice 'Garde-fou : le fantôme de cinq heures se ferme sans durée inventée, la conversation de dix minutes reste ouverte (% ligne(s) fermée(s) au total).', v_fermes;
end $$;

commit;
