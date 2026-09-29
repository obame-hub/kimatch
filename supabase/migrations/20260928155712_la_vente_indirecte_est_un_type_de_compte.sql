-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- LA VENTE INDIRECTE EST UN TYPE DE COMPTE
-- ════════════════════════════════════════════════════════════════════════════════════════════════
--
-- William, 28/09/2026 : « créer un autre genre de compte, Vente indirecte. C'est un compte qui est
-- relié à un partenaire — c'est le compte du partenaire et pas vraiment celui de KiWee. » Puis :
-- « ce serait pas bête de créer un autre type de compte Vente indirecte ».
--
-- ══ LE MODÈLE À DEUX COLONNES, TEL QU'IL EST ══
--
-- `segment` porte la TYPOLOGIE — syndic professionnel, non professionnel, entreprise ; `type_compte`
-- la FAMILLE — consommateur, fournisseur, partenaire, KiWee. Une vente indirecte garde sa vraie
-- typologie (décision de William) : c'est sa famille qui change.
--
-- ══ CE QUE LE NOUVEAU TYPE OUVRE ET FERME — tranché par William le 28/09 ══
--
--   · il RESTE dans la qualité des données (comptes et compteurs) : KiWee gère ses compteurs et ses
--     contrats, leurs données doivent rester complètes ;
--   · il SORT de la synthèse du patrimoine et du vivier du Cockpit : c'est le client du partenaire,
--     pas celui de KiWee, et c'est le partenaire qui le suit.
--
-- Les deux sorties sont automatiques — ces vues ne retiennent que le type CLIENT. La qualité, elle,
-- est élargie ci-dessous.
--
-- ══ « LIÉ À UN PARTENAIRE » ET « VENTE INDIRECTE » SONT LA MÊME CHOSE ══
--
-- Un consommateur rattaché à un partenaire (`apporteur_partenaire_id`) EST une vente indirecte, et
-- réciproquement. Le déclencheur ci-dessous tient l'équivalence dans les deux sens : retirer le
-- partenaire sur la fiche rend le compte à KiWee, en poser un le passe en vente indirecte. Sans lui,
-- les deux finiraient par se contredire — et chacune des vues ci-dessus croirait l'une ou l'autre.
--
-- ══ ET LE TYPE N'A PLUS DEUX VALEURS ══
--
-- Un compte stocke sa famille deux fois : `type_compte` (texte), que la fiche modifie, et
-- `type_compte_id`, que les vues lisent. Rien ne les tenait d'accord : changer le type sur la fiche
-- n'avait jamais changé les vues où le compte apparaît. Mesuré ce jour, ENERGIX s'affichait
-- « Partenaire » et comptait pour les vues comme consommateur — dans le vivier et le patrimoine.
-- Le texte fait désormais foi, le lien le suit ; un texte vide se remplit depuis le lien.

insert into public.types_comptes (code, libelle, ordre, actif)
select 'VENTE_INDIRECTE', 'Vente indirecte', 25, true
 where not exists (select 1 from public.types_comptes where code = 'VENTE_INDIRECTE');

create or replace function public.fn_type_compte_coherent()
returns trigger
language plpgsql
set search_path to 'public'
as $$
declare
  v_depuis_lien text;
begin
  /* 1 · LE TEXTE FAIT FOI. Vide, il se remplit depuis le lien ; si SEUL le lien a changé, on le suit —
     c'est qu'un écran a écrit l'identifiant et non le libellé. */
  if new.type_compte_id is not null then
    select lower(code) into v_depuis_lien from types_comptes where id = new.type_compte_id;
  end if;
  if new.type_compte is null then
    new.type_compte := v_depuis_lien;
  elsif tg_op = 'UPDATE'
        and new.type_compte_id is distinct from old.type_compte_id
        and new.type_compte is not distinct from old.type_compte then
    new.type_compte := coalesce(v_depuis_lien, new.type_compte);
  end if;

  /* 2 · LA VENTE INDIRECTE SUIT LE PARTENAIRE, dans la famille des consommateurs seulement : un
     fournisseur ou un partenaire rattachés à un apporteur restent ce qu'ils sont. */
  if new.type_compte in ('client', 'vente_indirecte') then
    new.type_compte := case when new.apporteur_partenaire_id is not null then 'vente_indirecte' else 'client' end;
  end if;

  /* 3 · LE LIEN SUIT LE TEXTE, toujours. */
  if new.type_compte is not null then
    new.type_compte_id := coalesce(
      (select id from types_comptes where code = upper(new.type_compte)),
      new.type_compte_id
    );
  end if;

  return new;
end;
$$;

drop trigger if exists trg_type_compte_coherent on public.comptes;
create trigger trg_type_compte_coherent
  before insert or update of type_compte, type_compte_id, apporteur_partenaire_id on public.comptes
  for each row execute function public.fn_type_compte_coherent();

revoke execute on function public.fn_type_compte_coherent() from public, anon, authenticated;

-- ── La qualité des données suit aussi les ventes indirectes ──
do $$
declare
  v_vue text;
  d text;
  motif constant text := $q$tcp.code = 'CLIENT'::text$q$;
begin
  foreach v_vue in array array['v_qualite_compte', 'v_qualite_compteur'] loop
    d := pg_get_viewdef(('public.' || v_vue)::regclass, true);
    if (length(d) - length(replace(d, motif, ''))) / length(motif) <> 1 then
      raise exception '% : le filtre sur le type CLIENT n''a pas été trouvé exactement une fois', v_vue;
    end if;
    d := replace(d, motif, $q$tcp.code = ANY (ARRAY['CLIENT'::text, 'VENTE_INDIRECTE'::text])$q$);
    /* `security_invoker` est REPORTÉ : recréée sans lui, la vue lirait avec les droits de son
       propriétaire et non plus de l'utilisateur. */
    execute format('create or replace view public.%I with (security_invoker = true) as %s', v_vue, d);
  end loop;
end $$;

-- ── La reprise : les deux comptes rattachés, et les deux types qui se contredisaient ──
update public.comptes c
   set type_compte_id = c.type_compte_id
 where c.actif
   and (c.apporteur_partenaire_id is not null
        or upper(coalesce(c.type_compte, '')) is distinct from (select t.code from types_comptes t where t.id = c.type_compte_id));
