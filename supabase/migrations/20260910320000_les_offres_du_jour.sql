-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- LES OFFRES DU JOUR
--
-- William, 10/09/2026 : une section sous les cinq cartes, avec un tableau en trois sous-parties et
-- deux cartes de totaux à droite.
--
-- ── LES TROIS SOUS-PARTIES, TELLES QU'IL LES A DÉFINIES ──
--
--   En retard    version actuelle « Disponible »,      date souhaitée < aujourd'hui
--   À envoyer    version actuelle « Disponible »,      date souhaitée = aujourd'hui
--   En attente   version actuelle « En construction », date souhaitée = aujourd'hui
--
-- ── `date_souhaitee` EST BIEN LA DATE DE LIVRAISON ATTENDUE ──
--
-- Je l'avais prise pour la date de début de fourniture souhaitée par le client. William, 10/09/2026 :
-- « date souhaitée correspond à la date à laquelle je souhaite recevoir l'offre de la part du
-- service pricing, donc c'est bien ça qu'il faut utiliser. » C'est un délai INTERNE, entre le
-- commercial et le pricing — d'où le sens des trois sections : ce qui a dépassé la date promise,
-- ce qui est promis pour aujourd'hui, et ce que le pricing doit encore rendre aujourd'hui.
--
-- Aucun champ n'est donc créé. C'était l'autre option, et elle aurait laissé 1 557 versions avec une
-- date vide, donc un tableau vide pour longtemps.
--
-- ── LE MONTANT ESTIMÉ EST `gain_estime_annuel` ──
--
-- Choix de William parmi trois. Il est renseigné sur ZÉRO version au 10/09/2026 : la colonne et la
-- carte « pipe ouvert » afficheront un tiret jusqu'à ce que le pricing commence à le remplir. C'est
-- assumé — l'autre piste consistait à réutiliser le « Montant » des commissions, qui ne mesure pas
-- la même chose : ce que Kiwee encaisse, et non ce que le client économise.
--
-- ── CHACUN NE VOIT QUE SES DOSSIERS ──
--
-- Même règle que la rangée de cartes : `recommandations.proprietaire_id = auth.uid()`. Cette page
-- dit ce que J'AI à faire aujourd'hui ; y mêler les études d'un collègue en ferait un rapport.
--
-- ── DEUX FONCTIONS, PARCE QUE DEUX PÉRIMÈTRES ──
--
-- Le tableau ne montre que le jour. Les deux cartes de droite mesurent tout autre chose : le pipe
-- ouvert court sur TOUTES mes recommandations ouvertes, et le montant signé sur celles acceptées
-- aujourd'hui. Les calculer depuis les lignes du tableau aurait donné des totaux qui ne parlent que
-- du tableau — et qui changeraient en filtrant une colonne.
-- ════════════════════════════════════════════════════════════════════════════════════════════════

begin;

create or replace function lister_offres_du_jour()
returns table (
  section            text,
  recommandation_id  uuid,
  nom                text,
  type_energie       text,
  numero_version     integer,
  montant_estime     numeric,
  date_souhaitee     date,
  contact_id         uuid,
  contact_nom        text,
  compte_id          uuid,
  compte_nom         text
)
language sql
stable
security invoker
set search_path = public
as $$
  with moi as (select auth.uid() as profil_id),
  jour as (select (now() at time zone 'Europe/Paris')::date as aujourdhui)
  select
    case
      when sv.code = 'DISPONIBLE'      and v.date_souhaitee < j.aujourdhui then 'EN_RETARD'
      when sv.code = 'DISPONIBLE'      and v.date_souhaitee = j.aujourdhui then 'A_ENVOYER'
      else 'EN_ATTENTE'
    end                                                       as section,
    r.id,
    r.nom,
    te.code                                                   as type_energie,
    v.numero_version,
    v.gain_estime_annuel                                      as montant_estime,
    v.date_souhaitee,
    c.id                                                      as contact_id,
    nullif(trim(coalesce(c.prenom, '') || ' ' || coalesce(c.nom, '')), '') as contact_nom,
    cp.id                                                     as compte_id,
    cp.nom                                                    as compte_nom
  from versions_recommandation v
  join statuts_versions_recommandation sv on sv.id = v.statut_version_id
  join recommandations r  on r.id = v.recommandation_id and r.actif
  cross join moi
  cross join jour j
  left join types_energies te on te.id = r.type_energie_id
  left join contacts c        on c.id = r.contact_signataire_id
  left join comptes cp        on cp.id = r.compte_id
  where v.version_actuelle
    and r.proprietaire_id = moi.profil_id
    and (
      (sv.code = 'DISPONIBLE'      and v.date_souhaitee <= j.aujourdhui)
      or
      (sv.code = 'EN_CONSTRUCTION' and v.date_souhaitee =  j.aujourdhui)
    );
$$;

comment on function lister_offres_du_jour is
  'Les études que je dois traiter aujourd''hui, en trois sections : en retard, à envoyer, en attente du pricing. Filtré sur recommandations.proprietaire_id = auth.uid().';

-- ── Les deux cartes de droite ──
create or replace function compter_totaux_offres()
returns table (
  pipe_ouvert    numeric,
  montant_signe  numeric
)
language sql
stable
security invoker
set search_path = public
as $$
  with moi as (select auth.uid() as profil_id),
  jour as (select (now() at time zone 'Europe/Paris')::date as aujourdhui)
  select
    -- LE PIPE OUVERT : la somme des montants estimés de mes recommandations encore ouvertes. Une
    -- recommandation est ouverte tant qu'elle n'est pas clôturée — c'est l'étape qui le dit, pas la
    -- finalité, qui n'est renseignée qu'une fois la décision prise.
    (select coalesce(sum(v.gain_estime_annuel), 0)
     from versions_recommandation v
     join recommandations r on r.id = v.recommandation_id and r.actif
     join etapes_recommandation e on e.id = r.etape_id
     cross join moi
     where v.version_actuelle
       and r.proprietaire_id = moi.profil_id
       and e.code <> 'CLOTUREE'),
    -- LE MONTANT SIGNÉ, AUJOURD'HUI SEULEMENT. William : « somme des montants des recommandations
    -- au statut acceptée, qui ont été closes à la date d'aujourd'hui ». C'est une mesure du jour,
    -- pas un cumul : elle repart de zéro chaque matin, et c'est ce qui en fait une bonne nouvelle
    -- quand elle bouge.
    --
    -- On somme le « Montant » (`marge_nette_coeff`), la référence des commissions — pas le gain
    -- estimé : une affaire signée n'a plus d'estimation, elle a un montant.
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
  'Les deux totaux du tableau de bord : le pipe ouvert (gain estimé de mes recommandations non clôturées) et le montant signé du jour (Montant de mes recommandations acceptées clôturées aujourd''hui).';

grant execute on function lister_offres_du_jour()  to authenticated;
grant execute on function compter_totaux_offres()  to authenticated;

commit;

-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- CONTRÔLE APRÈS APPLICATION
--
--   -- Depuis l'application, connecté :
--   select section, count(*) from lister_offres_du_jour() group by 1;
--   select * from compter_totaux_offres();
--
--   -- Sans filtre d'utilisateur, au 10/09/2026 : 3 en retard (Fabien, Marie), 9 en attente
--   -- (Marie, Matthieu), 0 à envoyer.
-- ════════════════════════════════════════════════════════════════════════════════════════════════
