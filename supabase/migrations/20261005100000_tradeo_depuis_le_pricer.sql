-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- TRADEO DEPUIS LE PRICER : QUI PEUT L'APPELER, ET L'HOMOLOGATION TENUE PAR LE MANDAT
-- ════════════════════════════════════════════════════════════════════════════════════════════════
--
-- Réunion du 05/10/2026 (William, Michel, Naoëlle). Deux décisions changent la base :
--
-- ══ ① TRADEO SORT DU BANC D'ESSAI ══
--
-- « Le jour où on est censé recevoir l'offre, dans le tableau, il y aura un bouton récupérer les
-- prix Tradeo. » Le tableau, c'est le Pricer — celui d'Erwan (rôle PRICING). Jusqu'ici, seuls les
-- testeurs du banc (`testeurs_tradeo`) pouvaient appeler `api/tradeo`. Le droit s'élargit au
-- pricing et à l'administration, SANS ouvrir le banc : l'onglet « Prix Tradeo » reste aux testeurs
-- (`ouvre_banc_tradeo`, inchangée).
--
-- ══ ② L'HOMOLOGATION EST TENUE PAR LE MANDAT ══
--
-- « Le mandat de Yanis est sur 12 mois […] ta première demande va passer par l'homologation ;
-- toutes les prochaines demandes dans ce délai de 12 mois ne seront pas soumises à homologation. »
-- Et : « le champ qui nous dit que c'est homologué chez Tradeo, je pense qu'il doit être tenu par le
-- mandat, vu que c'est sur le mandat qu'on a la durée, la fin, est-ce que c'est un mandat Energix. »
--
-- Trois colonnes sur `mandats`, écrites par une seule fonction (`fn_noter_homologation_tradeo`) :
-- le pricing n'a pas à pouvoir modifier un mandat pour autant. L'homologation N'A PAS DE DATE DE FIN
-- PROPRE : elle vaut tant que le mandat est actif, et c'est `date_fin_validite` qui le dit — la
-- recopier ferait deux vérités.
-- ════════════════════════════════════════════════════════════════════════════════════════════════

begin;

-- ══ ① Qui peut appeler Tradeo ══════════════════════════════════════════════════════════════════

create or replace function peut_appeler_tradeo()
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select ouvre_banc_tradeo()
      or a_role_acces('PRICING')
      or a_role_acces('ADMIN')
      or a_role_acces('SUPER_ADMIN')
$$;

comment on function peut_appeler_tradeo() is
  'Vrai si la personne connectée peut faire appeler Tradeo par `api/tradeo` : les testeurs du banc, le pricing (bouton « Prix Tradeo » du Pricer) et l''administration. N''ouvre PAS l''onglet du banc, qui reste à `ouvre_banc_tradeo`. Voir la migration du 05/10/2026.';

drop policy if exists appels_tradeo_lecture on appels_tradeo;
create policy appels_tradeo_lecture on appels_tradeo
  for select using (peut_appeler_tradeo());

drop policy if exists appels_tradeo_ecriture on appels_tradeo;
create policy appels_tradeo_ecriture on appels_tradeo
  for insert with check (peut_appeler_tradeo() and profil_id = auth.uid());

-- ══ ② L'homologation, sur le mandat ═════════════════════════════════════════════════════════════

alter table mandats
  add column if not exists tradeo_homologation_demandee_le timestamptz,
  add column if not exists tradeo_demande_numero integer,
  add column if not exists tradeo_homologue_le timestamptz;

comment on column mandats.tradeo_homologation_demandee_le is
  'Quand Kimatch a déposé chez Tradeo la demande d''homologation des compteurs de ce mandat (création de la demande de cotation, avec le mandat Energix en pièce jointe). NULL : jamais demandée. Voir la migration du 05/10/2026.';
comment on column mandats.tradeo_demande_numero is
  'Le numéro de la demande de cotation chez Tradeo qui porte l''homologation (ex. 3099), pour la retrouver et relancer leur équipe.';
comment on column mandats.tradeo_homologue_le is
  'Quand Kimatch a lu chez Tradeo que les compteurs de ce mandat étaient acceptés. Tant que le mandat est actif (`date_fin_validite`), ses compteurs se cotent sans nouvelle homologation. NULL : pas encore homologué.';

create or replace function fn_noter_homologation_tradeo(p_mandat uuid, p_etape text, p_demande integer default null)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if not peut_appeler_tradeo() then
    raise exception 'Seuls le pricing et l''administration notent une homologation Tradeo.' using errcode = '42501';
  end if;
  if p_etape = 'DEMANDEE' then
    update mandats
       set tradeo_homologation_demandee_le = coalesce(tradeo_homologation_demandee_le, now()),
           tradeo_demande_numero = coalesce(p_demande, tradeo_demande_numero),
           date_modification = now()
     where id = p_mandat;
  elsif p_etape = 'HOMOLOGUE' then
    update mandats
       set tradeo_homologue_le = coalesce(tradeo_homologue_le, now()),
           tradeo_demande_numero = coalesce(p_demande, tradeo_demande_numero),
           tradeo_homologation_demandee_le = coalesce(tradeo_homologation_demandee_le, now()),
           date_modification = now()
     where id = p_mandat;
  else
    raise exception 'Étape inconnue : % (DEMANDEE ou HOMOLOGUE).', p_etape;
  end if;
end;
$$;

comment on function fn_noter_homologation_tradeo(uuid, text, integer) is
  'Note sur un mandat l''étape de son homologation Tradeo : DEMANDEE (demande déposée) ou HOMOLOGUE (compteurs acceptés, lu chez Tradeo). Ne recule jamais une date déjà posée. Réservée à `peut_appeler_tradeo()`. Voir la migration du 05/10/2026.';

revoke all on function fn_noter_homologation_tradeo(uuid, text, integer) from public;
grant execute on function fn_noter_homologation_tradeo(uuid, text, integer) to authenticated;

commit;
