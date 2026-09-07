-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- LA PHOTO DE LA SIGNATURE EST RONDE
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
--
-- Naoëlle, 07/09/2026, en testant l'envoi depuis Kimatch : « dans la signature il faut que la photo
-- soit au format rond ».
--
-- ══ CE QUI CHANGE : UNE PROPRIÉTÉ, DANS LE GABARIT ET NULLE PART AILLEURS ══
--
-- `border-radius:50%` sur la balise `<img>`. Le gabarit `fn_signature_html` est le seul endroit où
-- la présentation vit — c'est ce qui permet de changer la signature des dix commerciaux d'un coup
-- au lieu de retoucher dix blocs HTML qui divergeraient.
--
-- La fonction est REMPLACÉE EN ENTIER plutôt que corrigée par bouts : sa définition est la source de
-- vérité du rendu, et deux migrations qui en modifieraient chacune une moitié rendraient impossible
-- de lire le gabarit courant sans les empiler mentalement.
--
-- ══ CE QUE ÇA DONNERA VRAIMENT, SELON LE CLIENT DE MESSAGERIE ══
--
-- ROND : Gmail (web et mobile), Apple Mail, Mail iOS, Outlook.com, Thunderbird.
-- CARRÉ : Outlook pour Windows, qui rend le HTML avec le moteur de Word et ignore `border-radius`.
--
-- Ce n'est pas contournable en CSS — Outlook n'a jamais su arrondir un coin. La seule façon d'avoir
-- un rond partout serait de servir une image DÉJÀ découpée en cercle, avec un fond transparent : ça
-- suppose de retailler les photos hors de Kimatch, et le rond n'apparaîtrait correctement que sur
-- fond clair. On ne le fait pas pour un carré chez une minorité de destinataires.
--
-- Kimatch envoie par Gmail et l'équipe s'y relit : ce que Naoëlle verra sera rond.
--
-- ══ LA PHOTO N'EST PAS RECADRÉE, ET C'EST VOLONTAIRE ══
--
-- `width="76" height="76"` force un carré : une photo qui ne l'est pas se retrouve étirée, et le
-- cercle devient un ovale légèrement déformé. `object-fit:cover` corrigerait ça dans un navigateur,
-- mais les clients de messagerie l'ignorent presque tous — l'écrire donnerait l'illusion d'un
-- recadrage qui n'aurait pas lieu. Sur les dix profils actifs, UN SEUL porte une photo, et elle est
-- déjà à peu près carrée. Le jour où ce ne sera plus vrai, c'est la photo du profil qu'il faudra
-- recadrer, pas le gabarit.
-- ═══════════════════════════════════════════════════════════════════════════════════════════════

begin;

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
         -- LE ROND. Demandé le 07/09/2026. `border-radius:50%` et non `border-radius:38px` : la
         -- valeur en pourcentage suit la taille si un jour on change les 76 pixels, alors qu'une
         -- valeur en dur donnerait un rectangle aux coins mangés dès la première retouche.
         || 'style="display:block;width:76px;height:76px;border:0;border-radius:50%;" /></td>'
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
  'changer cette fonction — et non dix blocs HTML modifiés séparément, qui divergeraient. '
  'Photo ronde depuis le 07/09/2026 (border-radius:50%, ignoré par Outlook pour Windows).';

-- ── LE RATTRAPAGE : les signatures déjà écrites ne se réécrivent pas toutes seules ─────────────
--
-- `corps_html` est une colonne stockée, pas un calcul : remplacer le gabarit ne touche pas les dix
-- lignes existantes. On force le passage du déclencheur en réécrivant une colonne qu'il surveille,
-- exactement comme le faisait la migration du gabarit.
--
-- LES SIGNATURES LIBRES NE SONT PAS CONCERNÉES : le déclencheur ne regénère que le mode GABARIT, et
-- écraser le HTML que quelqu'un a collé lui-même serait lui reprendre son travail.
update public.profils_signatures_email
   set mode = coalesce(mode, 'GABARIT')
 where true;

-- ── GARDE-FOU ─────────────────────────────────────────────────────────────────────────────────
do $$
declare
  avec_photo text;
  sans_photo text;
  n_rondes   integer;
  n_photos   integer;
begin
  -- Sur un jeu d'essai jamais enregistré : le gabarit arrondit-il, et seulement quand il y a une
  -- photo à arrondir ?
  select fn_signature_html('Marie', 'Thonnard', 'm.thonnard@kiwee-energie.fr',
                           'https://exemple.test/photo.jpg',
                           'Responsable Pôle Syndics', '01 76 38 15 23', '06 44 60 18 54')
    into avec_photo;
  select fn_signature_html('Marie', 'Thonnard', 'm.thonnard@kiwee-energie.fr', null,
                           'Responsable Pôle Syndics', '01 76 38 15 23', '06 44 60 18 54')
    into sans_photo;

  -- `position` ET NON `like` : dans un motif LIKE, `%` est un joker. `like '%border-radius:50%%'`
  -- ne vérifie donc PAS le signe pourcentage — il accepterait `border-radius:50px`, qui ferait un
  -- rectangle aux coins mangés. Une recherche de sous-chaîne exacte n'a pas cette ambiguïté.
  if position('border-radius:50%' in avec_photo) = 0 then
    raise exception 'Le gabarit n''arrondit pas la photo. Rien n''est appliqué.';
  end if;
  if sans_photo like '%<img%' then
    raise exception 'Le gabarit met une balise img sans photo. Rien n''est appliqué.';
  end if;

  -- CE QUI AVAIT ÉTÉ ACQUIS NE DOIT PAS SE PERDRE : la fonction est remplacée en entier, donc les
  -- deux garanties de la migration du gabarit sont revérifiées ici. Les numéros sortent, et ils ne
  -- sont pas emballés dans une pastille — celle-ci vient de l'extension Allo, jamais de nous.
  if avec_photo not like '%01 76 38 15 23%' or avec_photo not like '%06 44 60 18 54%' then
    raise exception 'Le gabarit ne rend plus les téléphones. Rien n''est appliqué.';
  end if;
  if avec_photo like '%border-radius:14px%' then
    raise exception 'Le gabarit emballe les numéros dans des pastilles. Rien n''est appliqué.';
  end if;

  -- ── Et les signatures réellement stockées ont bien suivi ────────────────────────────────────
  --
  -- SEULEMENT CELLES EN MODE GABARIT. Mesuré avant d'écrire ce contrôle : sur les dix signatures,
  -- deux sont en mode LIBRE et LES DEUX portent une image — du HTML que ces personnes ont collé
  -- elles-mêmes. Le déclencheur ne les regénère pas, et c'est voulu : écraser leur bloc serait leur
  -- reprendre leur travail. Compter toutes les images aurait donc trouvé 3 photos pour 1 arrondie,
  -- et fait échouer une migration parfaitement correcte.
  select count(*) into n_photos from profils_signatures_email
   where mode = 'GABARIT' and position('<img' in corps_html) > 0;
  select count(*) into n_rondes from profils_signatures_email
   where mode = 'GABARIT' and position('border-radius:50%' in corps_html) > 0;
  if n_rondes <> n_photos then
    raise exception '% signature(s) au gabarit portent une photo mais % seulement sont rondes. Rien n''est appliqué.',
      n_photos, n_rondes;
  end if;

  raise notice 'Photo ronde : % signature(s) au gabarit avec photo, toutes arrondies. Carré chez Outlook Windows, qui ignore border-radius.', n_photos;
  raise notice 'Les 2 signatures en mode libre ne sont pas touchées : leur HTML est celui de leur auteur.';
end $$;

commit;
