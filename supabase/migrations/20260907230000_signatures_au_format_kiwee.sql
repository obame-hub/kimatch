-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- LES SIGNATURES AU VRAI FORMAT KIWEE, CONSTRUITES ET NON RECOPIÉES
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
--
-- Naoëlle, 07/09/2026, deux captures d'écran à l'appui : « pour les signatures elles sont comme ça,
-- on les a chacun comme ça, il faudrait les ajouter en HTML. » Puis : « y a même le numéro chez
-- certains commerciaux. »
--
-- La vraie signature KiWee, telle qu'elle est chez Marie Thonnard :
--
--   [photo]   Marie Thonnard          │  m.thonnard@kiwee-energie.fr
--             Responsable Pôle Syndics│  01 76 38 15 23
--             KIWEE                   │  06 44 60 18 54
--                                     │  kiwee-energie.com
--
-- Trois colonnes et un filet vert vertical.
--
-- ══ LES NUMÉROS SONT DU TEXTE BRUT, ET C'EST LA CONDITION POUR QU'ILS SERVENT ══
--
-- Sur la capture, les téléphones apparaissent en pastilles sombres à icône jaune. J'ai commencé par
-- reproduire ces pastilles en HTML — à tort. Naoëlle : « les pastilles oublie-les, c'est juste
-- l'extension Allo qui les transforme avec cette couleur. »
--
-- Elles ne sont donc pas dans la signature : c'est l'extension Chrome d'Allo qui décore les numéros
-- qu'elle rencontre. Et elle ne décore que ce qu'elle VOIT comme du texte — la leçon déjà écrite en
-- tête de `src/lib/telephonie.tsx`, après avoir constaté qu'un numéro caché dans une infobulle ne
-- recevait jamais l'icône Allo.
--
-- Emballer les numéros dans des pastilles maison aurait produit l'inverse du but : une imitation
-- statique de la décoration, là où le texte nu reçoit la vraie — celle sur laquelle on clique pour
-- appeler.
--
-- ══ POURQUOI ON LA CONSTRUIT AU LIEU DE LA STOCKER À LA MAIN ══
--
-- La version du matin stockait un bloc HTML libre, modifiable dans un éditeur. Dix personnes, dix
-- blocs modifiés séparément : au troisième mois les signatures ne se ressemblent plus, l'une a perdu
-- le filet vert, l'autre a un nom d'entreprise en minuscules. C'est exactement ce qui arrive à toutes
-- les signatures d'entreprise laissées en édition libre.
--
-- Les champs sont donc STRUCTURÉS — fonction, fixe, mobile — et `corps_html` est REGÉNÉRÉ par un
-- déclencheur à chaque modification. Personne n'écrit de HTML, et le gabarit ne peut pas dériver :
-- le changer, c'est changer une fonction, une fois, pour tout le monde.
--
-- ══ EN TABLEAU ET EN STYLES EN LIGNE, ET C'EST OBLIGATOIRE ══
--
-- Outlook rend le HTML avec le moteur de Word : ni flexbox, ni grid, ni feuille de style externe, ni
-- classe CSS. Le tableau à cellules et les styles écrits sur chaque balise sont les seules mises en
-- page qui traversent Outlook, Gmail, un webmail de FAI et un téléphone.
--
-- ── LE FILET VERT EST UNE BORDURE DE CELLULE ──
-- Un `<div>` de 2 px de large et 76 px de haut ne se dessine pas de façon fiable dans Outlook ; une
-- bordure de cellule, oui.
--
-- ══ LA PHOTO EST OPTIONNELLE, ET C'EST MESURÉ ══
--
-- Sur les dix profils actifs, UN SEUL porte une photo. La colonne n'apparaît que si `photo_url`
-- existe : une balise `<img>` sans adresse afficherait une icône d'image cassée chez le client, ce
-- qui est pire que pas de photo. L'adresse existante pointe vers un bucket PUBLIC, donc l'image se
-- charge bien hors de Kimatch.
--
-- ══ CE QU'ON NE PEUT PAS AMORCER ══
--
-- `profils` ne porte ni fonction ni téléphone. Ils s'affichent donc comme un appel à compléter, en
-- évidence DANS la signature — le seul rappel qui fonctionne : personne ne va spontanément dans un
-- écran de réglages, tout le monde corrige un texte qu'il voit dans son propre mail.
-- ═══════════════════════════════════════════════════════════════════════════════════════════════

begin;

-- ── Les champs structurés ─────────────────────────────────────────────────────────────────────
alter table public.profils_signatures_email
  add column if not exists fonction         text,
  add column if not exists telephone_fixe   text,
  add column if not exists telephone_mobile text;

comment on column public.profils_signatures_email.fonction is
  'Le titre affiché sous le nom. Absent, la signature affiche un appel à le compléter.';
comment on column public.profils_signatures_email.corps_html is
  'GÉNÉRÉ, ne pas écrire à la main : `fn_signature_html` le reconstruit à chaque modification des '
  'champs structurés. Une édition directe serait écrasée à la modification suivante.';

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- LE GABARIT
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
create or replace function public.fn_signature_html(
  p_prenom text,
  p_nom text,
  p_email text,
  p_photo_url text,
  p_fonction text,
  p_fixe text,
  p_mobile text
)
returns text
language sql
immutable
as $$
  with couleurs as (
    select '#8CC63F'::text as vert,      -- le filet, relevé sur la capture
           '#111827'::text as encre,
           '#374151'::text as gris,
           '#1155cc'::text as lien
  ),
  -- Les numéros, EN TEXTE NU, une ligne chacun.
  --
  -- Ni pastille, ni icône, ni lien `tel:` : l'extension Allo décore elle-même les numéros qu'elle
  -- voit, et elle ne voit que du texte. C'est ce qui rend le numéro cliquable pour appeler — une
  -- imitation maison de sa pastille serait une décoration inerte à la place de la vraie.
  telephones as (
    select string_agg(
             '<div style="color:' || c.encre || ';">' || n.numero || '</div>', ''
             order by n.rang) as html
    from couleurs c,
         (select 1 as rang, nullif(trim(coalesce(p_fixe, '')), '') as numero
          union all
          select 2, nullif(trim(coalesce(p_mobile, '')), '')) n
    where n.numero is not null
  )
  select '<div style="font-family:Arial,Helvetica,sans-serif;font-size:13px;color:' || c.encre || ';">'
    -- Le double tiret : séparateur reconnu par Gmail, qui replie la signature dans les réponses au
    -- lieu de l'empiler à chaque échange.
    || '<div style="color:#9ca3af;">--</div>'
    || '<table cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;margin-top:6px;"><tr>'
    || case when coalesce(trim(p_photo_url), '') <> '' then
         '<td style="padding-right:16px;vertical-align:middle;">'
         || '<img src="' || p_photo_url || '" width="76" height="76" alt="" '
         || 'style="display:block;width:76px;height:76px;border:0;" /></td>'
       else '' end
    || '<td style="padding-right:20px;vertical-align:middle;line-height:1.5;">'
    || '<div style="font-weight:bold;font-size:14px;color:' || c.encre || ';">'
    || trim(coalesce(p_prenom, '') || ' ' || coalesce(p_nom, '')) || '</div>'
    || '<div style="color:' || c.gris || ';">'
    || case when coalesce(trim(p_fonction), '') <> '' then p_fonction
            else '<span style="color:#9ca3af;">[votre fonction — à compléter dans Mon profil]</span>'
       end
    || '</div>'
    || '<div style="font-weight:bold;color:' || c.encre || ';">KIWEE</div>'
    || '</td>'
    || '<td style="border-left:2px solid ' || c.vert || ';padding-left:20px;vertical-align:middle;line-height:1.5;">'
    || '<div><a href="mailto:' || coalesce(p_email, '') || '" style="color:' || c.lien || ';">'
    || coalesce(p_email, '') || '</a></div>'
    || coalesce(tel.html, '')
    || '<div style="margin-top:3px;"><a href="https://kiwee-energie.com" style="color:' || c.lien || ';">'
    || 'kiwee-energie.com</a></div>'
    || '</td></tr></table></div>'
  from couleurs c, telephones tel;
$$;

comment on function public.fn_signature_html(text, text, text, text, text, text, text) is
  'Le gabarit unique de la signature KiWee. Changer la présentation pour toute l''équipe, c''est '
  'changer cette fonction — et non dix blocs HTML modifiés séparément, qui divergeraient.';

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- LE HTML SE REGÉNÈRE TOUT SEUL
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
--
-- Sur INSERT comme sur UPDATE : l'écran n'écrit que les champs structurés, et `corps_html` suit.
-- C'est ce qui garantit qu'aucune signature ne peut dériver du gabarit.
create or replace function public.fn_regenerer_signature()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  p record;
begin
  select prenom, nom, email, photo_url into p from profils where id = new.profil_id;
  if p is null then
    return new;
  end if;

  new.corps_html := fn_signature_html(
    p.prenom, p.nom, p.email, p.photo_url,
    new.fonction, new.telephone_fixe, new.telephone_mobile
  );
  new.date_modification := now();
  return new;
end;
$$;

drop trigger if exists trg_regenerer_signature on public.profils_signatures_email;
create trigger trg_regenerer_signature
  before insert or update of fonction, telephone_fixe, telephone_mobile
  on public.profils_signatures_email
  for each row execute function public.fn_regenerer_signature();

-- Le déclencheur de date de modification posé le matin devient inutile : celui-ci s'en charge, et
-- deux déclencheurs qui écrivent la même colonne se marchent dessus.
drop trigger if exists trg_signature_date_modification on public.profils_signatures_email;

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- LE RATTRAPAGE : tout le monde passe au nouveau gabarit
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
--
-- Aucune signature n'a encore été personnalisée — la table a été amorcée ce matin même. On peut donc
-- toutes les regénérer sans écraser de travail. Si l'une l'avait été, ses champs structurés sont
-- vides et le gabarit affichera l'appel à compléter : rien n'est perdu, tout est à ressaisir dans un
-- formulaire au lieu d'un bloc HTML.
update public.profils_signatures_email
   set fonction = fonction
 where true;

-- ── GARDE-FOU ─────────────────────────────────────────────────────────────────────────────────
do $$
declare
  n_total   integer;
  n_gabarit integer;
  n_cassees integer;
  apercu    text;
begin
  select count(*) into n_total from profils_signatures_email;
  select count(*) into n_gabarit from profils_signatures_email where corps_html like '%<table%';

  -- UNE BALISE IMG SANS ADRESSE afficherait une icône d'image cassée dans le mail du client : c'est
  -- le seul défaut de ce gabarit qui ne se verrait jamais depuis Kimatch.
  select count(*) into n_cassees from profils_signatures_email
   where corps_html like '%<img src=""%' or corps_html like '%<img src="null"%';
  if n_cassees > 0 then
    raise exception '% signature(s) portent une image sans adresse. Rien n''est appliqué.', n_cassees;
  end if;

  if n_gabarit <> n_total then
    raise exception 'Seulement % signature(s) sur % au nouveau gabarit. Rien n''est appliqué.',
      n_gabarit, n_total;
  end if;

  -- On vérifie que les numéros sortent bien, sur un jeu d'essai jamais enregistré.
  select fn_signature_html('Marie', 'Thonnard', 'm.thonnard@kiwee-energie.fr', null,
                           'Responsable Pôle Syndics', '01 76 38 15 23', '06 44 60 18 54')
    into apercu;
  if apercu not like '%01 76 38 15 23%' or apercu not like '%06 44 60 18 54%' then
    raise exception 'Le gabarit ne rend pas les téléphones. Rien n''est appliqué.';
  end if;
  -- ET IL NE DOIT PAS LES DÉCORER : la pastille vient de l'extension Allo, pas de nous.
  if apercu like '%border-radius:14px%' then
    raise exception 'Le gabarit emballe encore les numéros dans des pastilles. Rien n''est appliqué.';
  end if;

  raise notice '% signatures au format KiWee. Chacun complète fonction et téléphones dans Mon profil.', n_total;
end $$;

commit;
