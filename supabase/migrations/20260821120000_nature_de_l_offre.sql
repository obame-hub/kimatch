-- Distinguer les trois natures d'une offre : proposée, reconduction, en cours.
--
-- DEMANDE DE MICHEL, 21/08/2026 : « t'as trois types d'offres. T'as l'offre proposée, t'as l'offre de
-- reconduction, et t'as l'offre en cours. »
--
--   PROPOSEE      l'offre que Kiwee a négociée et présente au client. C'est le cas courant, et le
--                 seul qu'on puisse retenir.
--   RECONDUCTION  la proposition du fournisseur en place. « Une reconduction, ça peut être aussi un
--                 fournisseur qui fait une nouvelle proposition au client sans forcément que ce soit
--                 tacite. Mais dans les deux cas, tacite ou pas, ça reste une reconduction. »
--   EN_COURS      le contrat que le client a aujourd'hui, saisi pour servir de repère.
--
-- POURQUOI UNE COLONNE ET NON UN STATUT. `statut` dit où en est la NÉGOCIATION — en attente, reçue,
-- acceptée, refusée. La nature dit ce QU'EST l'offre. Une reconduction reçue et une proposition reçue
-- ont le même statut et ne jouent pas le même rôle ; les mêler dans une colonne obligerait à choisir
-- entre les deux informations.
--
-- CE QUE LA NATURE COMMANDE. On ne peut RETENIR qu'une offre proposée. Michel : « bien indiquer que
-- ces offres-là, on ne peut pas les retenir. Parce que s'ils retiennent la reconduction, c'est qu'en
-- fait on a perdu le dossier. » Dans ce cas on marque la proposition refusée et l'on note que le
-- client a conservé son offre — la règle est portée par l'application, pas par la base : une
-- contrainte croisée ici empêcherait aussi de corriger une nature saisie par erreur.
--
-- LES 39 OFFRES EXISTANTES deviennent PROPOSEE : c'est ce qu'elles sont toutes, aucune n'a jamais
-- pu être autre chose faute de ce champ. La valeur par défaut vaut donc aussi pour l'historique.

begin;

alter table public.offres_fournisseurs
  add column if not exists nature_offre text not null default 'PROPOSEE';

alter table public.offres_fournisseurs
  drop constraint if exists offres_fournisseurs_nature_check;

alter table public.offres_fournisseurs
  add constraint offres_fournisseurs_nature_check
  check (nature_offre = any (array['PROPOSEE', 'RECONDUCTION', 'EN_COURS']));

comment on column public.offres_fournisseurs.nature_offre is
  'PROPOSEE (négociée par Kiwee, seule retenable), RECONDUCTION (proposition du fournisseur en place, tacite ou non), EN_COURS (le contrat actuel du client, saisi comme repère). Michel OBAME, 21/08/2026.';

commit;

-- Vérification après application (à coller tel quel) :
--
--   select nature_offre, count(*) from public.offres_fournisseurs group by 1;
--   -- attendu : PROPOSEE, et le compte total des offres — rien d'autre
--
--   select pg_get_constraintdef(oid) from pg_constraint
--    where conname = 'offres_fournisseurs_nature_check';
--   -- attendu : les trois valeurs
