-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- LES DEUX NOTIFICATIONS DU SERVICE CLIENT
-- ════════════════════════════════════════════════════════════════════════════════════════════════
--
-- William, 26/09/2026 : « Fabien ne doit recevoir pour le moment que 2 types de notification. »
-- Nouveau contrat validé, qui mène au SUIVI du contrat ; nouvelle requête, qui mène à la requête.
--
-- ══ POURQUOI DES DONNÉES, ET PLUS SEULEMENT UNE PHRASE ══
--
-- Une notification portait un `titre` et un `message` — du texte libre, assemblé à l'écriture :
-- « PLISSON IMMOBILIER · chez GAZ EUROPEEN · validé par William Goupil ».
--
-- Le dessin retenu (direction B) montre la référence dans un jeton, l'énergie dans une pastille, le
-- compte en dessous. Les retrouver dans la phrase demanderait de la découper à la lecture, et toute
-- notification écrite autrement se dessinerait de travers. `donnees` porte donc les morceaux
-- séparés ; la phrase reste, pour les 13 notifications déjà écrites et pour tout ce qui n'a pas de
-- dessin propre.
--
-- ══ LE DÉCLENCHEUR PLUTÔT QUE L'ÉCRAN ══
--
-- La notification de contrat validé naît dans `ContratDetail` : c'est là qu'on clique « valider ».
-- Celle de requête ne peut pas faire pareil — une requête naît d'un formulaire, d'un import, d'un
-- rattachement, et demain d'un écran qu'on n'a pas écrit. Le déclencheur voit chaque création.
--
-- IL NE PRÉVIENT PAS CELUI QUI ÉCRIT : Fabien crée lui-même des requêtes, et se notifier soi-même
-- de ce qu'on vient de taper est du bruit pur.

alter table public.notifications
  add column if not exists donnees jsonb;

comment on column public.notifications.donnees is
  'Les morceaux que le dessin affiche separement : sujet, reference, jetons. Nul pour les '
  'notifications ecrites avant le 26/09/2026, qui retombent sur titre + message.';

-- ── La notification d'une nouvelle requête ──

create or replace function public.fn_notifier_nouvelle_requete()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare
  v_destinataire uuid;
  v_compte text;
  v_type text;
begin
  v_destinataire := public.fn_responsable_des_suivis_contrats();
  if v_destinataire is null then return new; end if;

  /* On ne se prévient pas soi-même de ce qu'on vient de taper. `auth.uid()` est nul pour un import
     ou une migration, et la notification part alors normalement. */
  if auth.uid() is not null and auth.uid() = v_destinataire then return new; end if;

  select c.nom into v_compte from comptes c where c.id = new.compte_id;
  select t.libelle into v_type from types_requetes t where t.id = new.type_requete_id;

  insert into public.notifications (
    destinataire_profil_id, titre, message, lien, entite_type, entite_id, categorie, cree_par_id, donnees
  ) values (
    v_destinataire,
    'Nouvelle requête',
    concat_ws(' · ', nullif(new.objet, ''), v_compte, v_type),
    '/requetes/' || new.id,
    'requete',
    new.id,
    'nouvelle_requete',
    auth.uid(),
    jsonb_strip_nulls(jsonb_build_object(
      /* LE SUJET EST L'OBJET DE LA REQUÊTE, pas le compte : c'est lui qu'on cherche du regard dans
         une liste de requêtes, et le compte se lit juste en dessous. */
      'sujet', nullif(new.objet, ''),
      'reference', new.reference,
      'jeton', v_type,
      'precision', lower(nullif(new.categorie, '')),
      'sous_titre', v_compte
    ))
  );
  return new;
end;
$fn$;

drop trigger if exists trg_notifier_nouvelle_requete on public.requetes;
create trigger trg_notifier_nouvelle_requete
  after insert on public.requetes
  for each row execute function public.fn_notifier_nouvelle_requete();

comment on function public.fn_notifier_nouvelle_requete() is
  'Previent le service client a chaque requete creee. Regle posee par William le 26/09/2026.';
