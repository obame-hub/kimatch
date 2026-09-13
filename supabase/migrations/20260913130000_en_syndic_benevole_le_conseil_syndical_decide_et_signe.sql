-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- EN SYNDIC BÉNÉVOLE, LE CONSEIL SYNDICAL DÉCIDE ET SIGNE
-- ════════════════════════════════════════════════════════════════════════════════════════════════
--
-- William, 13/09/2026 : « quand le compte est un syndic non professionnel [...] un membre CS est
-- forcément décisionnaire et signataire puisque par définition il n'y a pas de cabinet de syndic,
-- donc pas de gestionnaire. »
--
-- ══ CE N'EST PAS UNE EXCEPTION, C'EST L'ABSENCE D'INTERMÉDIAIRE ══
--
-- La règle « un membre CS ne contractualise jamais » suppose qu'un cabinet se tient entre la
-- copropriété et Kiwee. En syndic bénévole, ce cabinet n'existe pas : la copropriété se gère
-- elle-même. Le conseil syndical n'empiète donc sur personne — il EST la partie contractante.
--
-- Six comptes portent ce segment et quatre contacts y sont membres du conseil syndical. Aucun ne
-- portait les deux rôles ; deux avaient déjà SIGNATAIRE parce qu'ils ont réellement signé, ce qui
-- confirme la règle au lieu de la contredire.
--
-- ══ CE QUE CETTE MIGRATION NE TOUCHE PAS, ET POURQUOI ══
--
-- Quatre contacts hors de ce segment portent aussi CONSEIL_SYNDICAL. Ils ne sont pas repris ici,
-- parce que chacun demande un arbitrage humain et non une règle :
--
--   · SYND.COPR. DU 17 RUE PAUL FEVAL — segment VIDE alors que le nom dit la copropriété. C'est le
--     segment qu'il faut corriger, pas les rôles (déjà décisionnaire et signataire).
--   · WESYNDIC — segment vide également, mais le nom évoque un cabinet. À trancher.
--   · L2CA / AFUL DOMAINE DU PARC — une AFUL n'est pas une copropriété au sens de la loi de 1965.
--     Cousine, pas identique : on ne l'aligne pas par analogie.
--   · OKEENEA BATIMENT — une comptable désignée conseil syndical sur un compteur d'un compte
--     « Entreprise ». C'est la désignation qui est fausse, pas le rôle qui manque.
--
-- LA RÈGLE EST APPLIQUÉE ICI EN REPRISE, PAS EN DÉCLENCHEUR. Un trigger la garantirait à chaque
-- écriture, mais modifierait en silence ce que l'utilisateur vient de saisir. Elle vit donc dans le
-- formulaire, qui coche et verrouille les deux cases en expliquant pourquoi — visible plutôt que
-- magique.
-- ════════════════════════════════════════════════════════════════════════════════════════════════

begin;

do $$
declare cibles int;
begin
  select count(*) into cibles
    from contacts c
    join comptes co on co.id = c.compte_id
   where co.segment = 'Syndic non professionnel'
     and 'CONSEIL_SYNDICAL' = any(c.roles)
     and not ('DECISIONNAIRE' = any(c.roles) and 'SIGNATAIRE' = any(c.roles));

  if cibles <> 4 then
    raise exception 'Attendu 4 contacts à compléter, trouvé % — la base a bougé depuis la mesure du 13/09/2026.', cibles;
  end if;
end $$;

update contacts c
   set roles = (
         select array_agg(distinct r order by r)
           from unnest(c.roles || array['DECISIONNAIRE', 'SIGNATAIRE']) as r
       )
  from comptes co
 where co.id = c.compte_id
   and co.segment = 'Syndic non professionnel'
   and 'CONSEIL_SYNDICAL' = any(c.roles);

commit;

-- ══ CONTRÔLE APRÈS APPLICATION ══
--
--   select co.nom, c.prenom || ' ' || c.nom, c.roles
--     from contacts c join comptes co on co.id = c.compte_id
--    where co.segment = 'Syndic non professionnel' and 'CONSEIL_SYNDICAL' = any(c.roles);
--   -- appliqué le 13/09/2026 : 4 lignes, chacune portant DECISIONNAIRE, SIGNATAIRE et
--   --                          CONSEIL_SYNDICAL
