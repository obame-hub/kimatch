-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- KIMATCH SAIT PRÉVENIR LES GENS
-- ════════════════════════════════════════════════════════════════════════════════════════════════
--
-- ══ CE QUI MANQUAIT ════════════════════════════════════════════════════════════════════════════
--
-- Naoëlle, 09/09/2026 : « ce serait bien d'avoir des notifs sur l'app direct », « pour les
-- principaux concernés de l'action ».
--
-- Il n'existait AUCUNE notification dans Kimatch — relevé du jour : pas de table, pas de cloche,
-- rien. Les seuls avertissements partaient par Slack ou par courriel, c'est-à-dire HORS de
-- l'application : on apprend qu'il s'est passé quelque chose dans Kimatch en lisant ailleurs.
--
-- Or tout le parcours que William a décrit le 09/09 est fait de passages de relais :
--
--   Brouillon      → prévenir Erwan qu'il faut demander le contrat au fournisseur
--   Réceptionné    → prévenir le commercial que le contrat est arrivé
--   Signé          → prévenir le commercial qu'il faut le faire valider par le fournisseur
--   VALIDÉ         → prévenir le service client, pour sa « deuxième lame »
--
-- « Quand je validais, ça envoyait une notification au service client. Avant c'était Agathe,
-- maintenant c'est Fabien. Ce que j'attendais de lui, c'était qu'il fasse une DEUXIÈME LAME —
-- parce que c'est possible que je fasse une erreur en récupérant les données d'un contrat, une
-- erreur sur une date. Il revérifiait toutes les infos. »
--
-- Cette migration pose le support des quatre. Seul le dernier est câblé aujourd'hui.
--
-- ══ POURQUOI UNE TABLE, ET PAS UN COURRIEL DE PLUS ═════════════════════════════════════════════
--
-- Un courriel se perd, ne se coche pas, et ne dit à personne d'autre qu'il a été traité. Une
-- notification en base porte trois choses qu'un courriel n'a pas : elle sait si elle a été LUE,
-- elle pointe l'OBJET concerné, et elle reste consultable dans l'outil où le travail se fait.
--
-- Elle ne remplace pas le courriel — `parametres_emails` continue d'exister et de partir vers
-- l'extérieur. Elle le double à l'intérieur.
--
-- ══ LA POLITIQUE D'ACCÈS EST UNE VRAIE, POUR UNE FOIS ══════════════════════════════════════════
--
-- Les 263 politiques du schéma sont toutes en `using (true)` : n'importe quel utilisateur connecté
-- lit tout. C'est tenable pour des contrats, que toute l'équipe a le droit de voir. Ça ne l'est pas
-- pour une boîte de réception : la mienne ne regarde que moi.
--
-- `profils.id` EST l'identifiant d'authentification (`fetchMonProfil` fait
-- `.eq('id', utilisateur.id)`), donc `auth.uid()` suffit à écrire la règle sans jointure.
--
-- L'INSERTION, ELLE, RESTE OUVERTE à tout utilisateur connecté : c'est l'application qui crée les
-- notifications DES AUTRES — celui qui valide un contrat écrit dans la boîte du service client. La
-- restreindre à soi-même reviendrait à interdire de prévenir qui que ce soit.
-- ════════════════════════════════════════════════════════════════════════════════════════════════

begin;

create table if not exists notifications (
  id uuid primary key default gen_random_uuid(),

  /* À QUI. `on delete cascade` : les notifications d'un profil supprimé n'ont plus de destinataire,
     et les garder en ferait des lignes que personne ne pourra jamais lire ni effacer. */
  destinataire_profil_id uuid not null references profils (id) on delete cascade,

  titre text not null,
  message text,

  /* OÙ ALLER. Un chemin interne (« /contrats/<id> ») plutôt qu'une URL : la notification survit à un
     changement de domaine, et rien ne peut y glisser un lien vers l'extérieur. */
  lien text,

  /* SUR QUOI. Séparé du lien : c'est ce qui permettra de grouper (« 3 contrats à revérifier ») et
     de retrouver les notifications d'un objet quand il est supprimé. */
  entite_type text,
  entite_id uuid,

  /* POURQUOI. Une famille, pas un type technique — c'est ce qui se filtre et se coupe si un jour
     quelqu'un en reçoit trop. */
  categorie text not null default 'general',

  /* QUAND ELLE A ÉTÉ LUE, et non un booléen : savoir QUAND quelqu'un a vu passer une demande de
     revérification vaut mieux que savoir qu'il l'a vue. Nul = pas encore lue. */
  lu_le timestamptz,

  /* QUI L'A DÉCLENCHÉE. `set null` et pas `cascade` : le départ d'un collaborateur ne doit pas
     effacer les notifications qu'il a provoquées chez les autres. */
  cree_par_id uuid references profils (id) on delete set null,

  date_creation timestamptz not null default now()
);

/* L'INDEX SUIT LA SEULE REQUÊTE QUI COMPTE : « mes non-lues, les plus récentes d'abord ». Partiel
   sur `lu_le is null` — une boîte contient surtout des notifications déjà lues, et les indexer
   ferait grossir l'index pour des lignes que la cloche ne regarde jamais. */
create index if not exists idx_notifications_boite
  on notifications (destinataire_profil_id, date_creation desc) where lu_le is null;

/* Et un second pour la liste complète, celle qu'on ouvre quand on veut relire l'historique. */
create index if not exists idx_notifications_destinataire
  on notifications (destinataire_profil_id, date_creation desc);

comment on table notifications is
  'La boite de reception interne. Naoelle, 09/09/2026 : « ce serait bien d''avoir des notifs sur '
  'l''app direct, pour les principaux concernes de l''action ». Double les courriels de '
  '`parametres_emails` a l''interieur de l''outil, avec ce qu''un courriel n''a pas : un etat lu, '
  'un objet pointe, et une place la ou le travail se fait.';

-- ── LA POLITIQUE D'ACCÈS ───────────────────────────────────────────────────────────────────────
alter table notifications enable row level security;

drop policy if exists notifications_lecture on notifications;
create policy notifications_lecture on notifications
  for select to authenticated
  using (destinataire_profil_id = auth.uid());

/* MARQUER COMME LUE EST LE SEUL CHANGEMENT PERMIS, et seulement sur les siennes. Le `with check`
   répète la condition : sans lui, on pourrait réaffecter sa notification à quelqu'un d'autre. */
drop policy if exists notifications_maj on notifications;
create policy notifications_maj on notifications
  for update to authenticated
  using (destinataire_profil_id = auth.uid())
  with check (destinataire_profil_id = auth.uid());

/* L'INSERTION EST OUVERTE : l'application prévient les AUTRES. Voir l'en-tête. */
drop policy if exists notifications_insertion on notifications;
create policy notifications_insertion on notifications
  for insert to authenticated
  with check (true);

drop policy if exists notifications_suppression on notifications;
create policy notifications_suppression on notifications
  for delete to authenticated
  using (destinataire_profil_id = auth.uid());

-- ── QUI EST « LE SERVICE CLIENT » ──────────────────────────────────────────────────────────────
/* IL FAUT LE DIRE QUELQUE PART, ET CE N'EST PAS DÉDUCTIBLE. La table `postes` est VIDE et `profils`
   ne porte aucun rôle métier : rien dans la base ne dit que Fabien Dubarry est le service client.
   William le dit de vive voix — « avant c'était Agathe, maintenant c'est Fabien » — et ça changera
   encore.

   On réutilise donc `parametres_emails`, qui sert déjà exactement à ça pour trois autres modules et
   qui est modifiable dans Paramètres sans toucher au code. Le module est nouveau : `validation_contrat`
   existe déjà mais désigne l'inverse — qui prévenir quand un contrat SIGNÉ attend d'être validé. */
insert into parametres_emails (module, actif, destinataires, copies, copies_cachees, sujet_template)
values (
  'service_client_contrat',
  true,
  array(select email from profils where email = 'f.dubarry@kiwee-energie.fr' and actif),
  array[]::text[],
  array[]::text[],
  'Contrat validé à revérifier — {{compte}} ({{reference}})'
)
on conflict (module) do nothing;

-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- LES GARDE-FOUS
-- ════════════════════════════════════════════════════════════════════════════════════════════════
do $$
declare
  v_politiques integer;
  v_rls        boolean;
  v_dest       text[];
begin
  -- ① RLS ACTIVE. Une table de notifications sans RLS, c'est la boîte de réception de tout le monde
  --   ouverte à tout le monde — et la base en compte déjà 144 en `using (true)`.
  select relrowsecurity into v_rls from pg_class where relname = 'notifications';
  if not coalesce(v_rls, false) then
    raise exception 'Garde-fou : RLS non active sur notifications';
  end if;

  -- ② LES QUATRE POLITIQUES SONT LÀ. Une table RLS sans politique ne rend RIEN, en silence — c'est
  --   la panne du 17/07/2026 (44 tables, 0 politique).
  select count(*) into v_politiques from pg_policies
   where tablename = 'notifications'
     and policyname in ('notifications_lecture', 'notifications_maj',
                        'notifications_insertion', 'notifications_suppression');
  if v_politiques <> 4 then
    raise exception 'Garde-fou : % politique(s) sur 4 posees', v_politiques;
  end if;

  -- ③ LE SERVICE CLIENT EST DÉSIGNÉ. Sans destinataire, la notification serait écrite pour
  --   personne et la validation n'avertirait rien du tout — en silence, ce qui est le pire cas.
  select destinataires into v_dest from parametres_emails where module = 'service_client_contrat';
  if v_dest is null or array_length(v_dest, 1) is null then
    raise exception 'Garde-fou : aucun destinataire pour le service client — verifier que le profil f.dubarry existe et est actif';
  end if;

  raise notice 'Garde-fou passe : table notifications creee, 4 politiques, service client = %', array_to_string(v_dest, ', ');
end $$;

commit;
