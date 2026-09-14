-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- COMPTER UNE OUVERTURE, SANS RIEN RÉVÉLER EN RETOUR
-- ════════════════════════════════════════════════════════════════════════════════════════════════
--
-- Suite de la migration 20260914210000, qui a posé les colonnes. Il manque le geste : incrémenter.
--
-- ══ POURQUOI UNE FONCTION ET PAS UN SIMPLE UPDATE ════════════════════════════════════════════
--
-- PostgREST ne sait pas écrire `nb_ouvertures = nb_ouvertures + 1` : il faudrait lire la valeur,
-- ajouter un, réécrire — trois allers-retours, et deux ouvertures simultanées en compteraient une.
-- La base sait le faire en une instruction, atomiquement. C'est la seule raison.
--
-- ══ ELLE NE REND RIEN, ET C'EST VOULU ════════════════════════════════════════════════════════
--
-- Le point d'entrée du pixel est PUBLIC — le client de messagerie du destinataire n'a pas de
-- session. Une fonction qui rendrait « trouvé / pas trouvé » laisserait éprouver des jetons au
-- hasard et apprendre lesquels existent. Elle rend `void` : que le jeton soit bon ou non, l'appel
-- se termine pareil, et le pixel s'affiche de toute façon.
--
-- `security definer` est nécessaire — l'appel est anonyme — et `search_path` est figé pour qu'on ne
-- puisse pas lui présenter une autre table du même nom.
--
-- ══ ELLE NE TOUCHE QUE CE QU'ELLE DOIT ═══════════════════════════════════════════════════════
--
-- Trois colonnes, sur la seule ligne qui porte ce jeton, et uniquement si c'est un mail SORTANT :
-- un jeton ne devrait jamais se trouver ailleurs, mais une fonction publique se protège de ce
-- qu'elle ne contrôle pas. `date_modification` n'est pas touchée : une ouverture chez le client
-- n'est pas une modification de la fiche, et la remonter ferait bouger l'objet dans les listes
-- triées par date de modification à chaque fois que quelqu'un relit son mail.
-- ════════════════════════════════════════════════════════════════════════════════════════════════

begin;

create or replace function public.fn_enregistrer_ouverture_mail(p_jeton uuid)
returns void
language sql
security definer
set search_path to 'public'
as $function$
  update public.interactions
     set premiere_ouverture_le = coalesce(premiere_ouverture_le, clock_timestamp()),
         derniere_ouverture_le = clock_timestamp(),
         nb_ouvertures = nb_ouvertures + 1
   where jeton_ouverture = p_jeton
     and sens = 'SORTANT';
$function$;

-- Le pixel appelle sans session : c'est `anon` qui exécute.
grant execute on function public.fn_enregistrer_ouverture_mail(uuid) to anon, authenticated;

-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- LE GARDE-FOU : ELLE COMPTE, ELLE NE PARLE PAS, ET ELLE NE SE TROMPE PAS DE LIGNE
-- ════════════════════════════════════════════════════════════════════════════════════════════════
do $$
declare
  type_email  uuid;
  piste_essai uuid;
  sortant     uuid;
  entrant     uuid;
  jeton_s     uuid := gen_random_uuid();
  jeton_e     uuid := gen_random_uuid();
  relu_s      record;
  relu_e      record;
begin
  select id into type_email from public.types_interactions where code = 'EMAIL';
  select id into piste_essai from public.pistes limit 1;

  insert into public.interactions
    (type_interaction_id, date_interaction, objet, sens, piste_id, jeton_ouverture)
  values (type_email, now(), 'Garde-fou sortant', 'SORTANT', piste_essai, jeton_s)
  returning id into sortant;

  -- Un mail ENTRANT porteur d'un jeton : il ne devrait pas exister, la fonction doit l'ignorer.
  insert into public.interactions
    (type_interaction_id, date_interaction, objet, sens, piste_id, jeton_ouverture)
  values (type_email, now(), 'Garde-fou entrant', 'ENTRANT', piste_essai, jeton_e)
  returning id into entrant;

  perform public.fn_enregistrer_ouverture_mail(jeton_s);
  perform public.fn_enregistrer_ouverture_mail(jeton_e);
  -- Un jeton qui ne désigne rien : la fonction doit se terminer sans bruit.
  perform public.fn_enregistrer_ouverture_mail(gen_random_uuid());

  select * into relu_s from public.interactions where id = sortant;
  select * into relu_e from public.interactions where id = entrant;

  if relu_s.nb_ouvertures <> 1 or relu_s.premiere_ouverture_le is null then
    raise exception 'Le mail sortant n''a pas compté son ouverture (% fois).', relu_s.nb_ouvertures;
  end if;
  if relu_e.nb_ouvertures <> 0 then
    raise exception 'Un mail ENTRANT a compté une ouverture : la fonction ne filtre pas le sens.';
  end if;

  delete from public.interactions where id in (sortant, entrant);
  raise notice 'Garde-fou : le sortant compte, l''entrant est ignoré, un jeton inconnu ne fait rien.';
end $$;

commit;
