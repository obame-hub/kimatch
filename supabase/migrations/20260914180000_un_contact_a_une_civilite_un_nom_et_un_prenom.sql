-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- UN CONTACT A UNE CIVILITÉ, UN NOM EN MAJUSCULES ET UN PRÉNOM EN CAPITALE
-- ════════════════════════════════════════════════════════════════════════════════════════════════
--
-- Naoëlle, 14/09/2026 : « il faut que le nom complet de nos contacts dans Kimatch soit divisé en
-- trois sous-champs : civilité Monsieur ou Madame, nom formaté tout en majuscules et prénom
-- première lettre en majuscule. C'est très très important pour plus tard, quand on fera des
-- rapports, des stats, etc. »
--
-- ══ CE QUI EXISTE DÉJÀ, ET CE QUI NE TIENT PAS ═══════════════════════════════════════════════
--
-- Les trois colonnes sont là depuis l'origine : `civilite`, `prenom`, `nom`. Le nom n'a jamais été
-- collé d'un seul tenant. Ce qui manque, c'est que les valeurs soient DIGNES D'UN RAPPORT :
--
--     3 419 contacts
--        33 ont une civilité  ⚠  Salesforce en connaît 1 840
--       201 noms ne sont pas en majuscules
--       183 prénoms sont mal capitalisés
--
-- Un rapport qui groupe par nom compte aujourd'hui « Dupont », « DUPONT » et « dupont » comme trois
-- personnes. C'est précisément ce que la demande veut éviter, et c'est pour cela qu'elle porte sur
-- la FORME autant que sur le découpage.
--
-- ══ UN DÉCLENCHEUR, PAS UNE SIMPLE MISE À JOUR ═══════════════════════════════════════════════
--
-- Normaliser les 3 419 lignes existantes règle aujourd'hui. Demain, un commercial saisit « dupont »
-- dans un formulaire, un import écrit « Dupont », et on recommence — avec, cette fois, personne
-- pour s'en apercevoir puisque le rapport aura l'air juste.
--
-- La règle vit donc dans la base, appliquée à CHAQUE écriture, quelle qu'en soit l'origine : le
-- formulaire, un import, une correction en SQL. C'est la seule façon qu'un invariant reste un
-- invariant.
--
-- ══ CE QUE LE DÉCLENCHEUR NE FAIT PAS ════════════════════════════════════════════════════════
--
-- IL NE DEVINE PAS LA CIVILITÉ. Déduire « Monsieur » d'un prénom serait faux une fois sur dix, et
-- se tromper de genre sur une personne est le genre d'erreur qu'un client remarque. La civilité se
-- reprend de Salesforce (script `completer-civilites-contacts.cjs`) ou se saisit ; sinon elle reste
-- vide, ce qui est honnête.
--
-- IL NE TOUCHE PAS AUX PARTICULES NI AUX SIGLES. « de La Rochefoucauld » devient « DE LA
-- ROCHEFOUCAULD » — c'est voulu : en majuscules, la particule n'a plus à être distinguée, et toute
-- tentative de règle (« de » minuscule, « Van » majuscule) se trompe dès qu'on change de pays.
--
-- LE PRÉNOM PASSE PAR `initcap`, qui remet une majuscule après tout caractère non alphanumérique.
-- « jean-pierre » devient « Jean-Pierre », « marie claire » devient « Marie Claire ». Le garde-fou
-- en bas vérifie le cas composé sur une vraie écriture plutôt que sur ma lecture de la doc.
-- ════════════════════════════════════════════════════════════════════════════════════════════════

begin;

-- ── LA MISE EN FORME, EN UN SEUL ENDROIT ──────────────────────────────────────────────────────
create or replace function public.fn_formater_identite_contact()
returns trigger
language plpgsql
as $function$
begin
  /* Le nom EN MAJUSCULES : « Dupont », « DUPONT » et « dupont » doivent être la même ligne d'un
     rapport.

     ON NE NULLIFIE PAS LA CHAÎNE VIDE, et c'est le premier essai qui l'a appris : `prenom` et `nom`
     sont NOT NULL sur `contacts`, donc transformer « » en `null` faisait échouer la reprise sur les
     lignes où l'un des deux est vide. On se contente de nettoyer les blancs. */
  new.nom := upper(btrim(coalesce(new.nom, '')));

  -- Le prénom en Capitale. `initcap` remet une majuscule après tout caractère non alphanumérique :
  -- « jean-pierre » → « Jean-Pierre », « marie claire » → « Marie Claire ». Le `lower` d'abord,
  -- sans quoi « JEAN » resterait « JEAN ».
  new.prenom := initcap(lower(btrim(coalesce(new.prenom, ''))));

  -- La civilité se range en deux valeurs lisibles. Ce qu'on ne reconnaît pas se garde tel quel :
  -- « Dr », « Me », « Maître » existent, et les effacer perdrait une information juste.
  new.civilite := nullif(btrim(new.civilite), '');
  if new.civilite is not null then
    case lower(replace(new.civilite, '.', ''))
      when 'm'        then new.civilite := 'Monsieur';
      when 'mr'       then new.civilite := 'Monsieur';
      when 'monsieur' then new.civilite := 'Monsieur';
      when 'mme'      then new.civilite := 'Madame';
      when 'mrs'      then new.civilite := 'Madame';
      when 'ms'       then new.civilite := 'Madame';
      when 'madame'   then new.civilite := 'Madame';
      when 'mlle'         then new.civilite := 'Madame';
      when 'mademoiselle' then new.civilite := 'Madame';
      else null;  -- on ne change rien
    end case;
  end if;

  return new;
end;
$function$;

drop trigger if exists trg_formater_identite_contact on public.contacts;
create trigger trg_formater_identite_contact
  before insert or update of civilite, prenom, nom on public.contacts
  for each row execute function public.fn_formater_identite_contact();

-- ── LES 3 419 EXISTANTS PASSENT À LA RÈGLE ────────────────────────────────────────────────────
-- Le déclencheur s'applique de lui-même : il suffit de les toucher. On ne met à jour que ce qui
-- change vraiment, pour ne pas réécrire 3 419 lignes dont 3 035 sont déjà correctes.
update public.contacts
   set nom = nom
 where nom is distinct from upper(btrim(coalesce(nom, '')))
    or prenom is distinct from initcap(lower(btrim(coalesce(prenom, ''))))
    or lower(replace(coalesce(civilite, ''), '.', '')) in
       ('m', 'mr', 'mme', 'mrs', 'ms', 'mlle', 'mademoiselle', 'monsieur', 'madame');

-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- LE GARDE-FOU : LA RÈGLE VAUT POUR LE PROCHAIN CONTACT, PAS SEULEMENT POUR LES 3 419
-- ════════════════════════════════════════════════════════════════════════════════════════════════
--
-- Vérifier que les 3 419 sont propres ne dit rien du 3 420e — c'est la leçon du 09/09 : une
-- contrainte qui se vérifie sur le passé ne dit rien de l'avenir. On crée donc un vrai contact
-- mal saisi, on regarde ce que la base en fait, et on l'efface.
--
do $$
declare
  compte_essai uuid;
  essai        uuid;
  relu         record;
  restants     integer;
begin
  select id into compte_essai from public.comptes limit 1;

  insert into public.contacts (compte_id, civilite, prenom, nom)
  values (compte_essai, 'm.', 'jean-pierre', 'de la tour')
  returning id into essai;

  select * into relu from public.contacts where id = essai;

  if relu.nom <> 'DE LA TOUR' then
    raise exception 'Le nom saisi « de la tour » ressort « % » au lieu de « DE LA TOUR ».', relu.nom;
  end if;
  if relu.prenom <> 'Jean-Pierre' then
    raise exception 'Le prénom saisi « jean-pierre » ressort « % » au lieu de « Jean-Pierre ».', relu.prenom;
  end if;
  if relu.civilite <> 'Monsieur' then
    raise exception 'La civilité saisie « m. » ressort « % » au lieu de « Monsieur ».', relu.civilite;
  end if;

  delete from public.contacts where id = essai;

  select count(*)::integer into restants from public.contacts
   where nom <> upper(nom) or prenom <> initcap(lower(prenom));
  if restants > 0 then
    raise exception '% contact(s) gardent un nom ou un prénom mal formé après la reprise.', restants;
  end if;

  raise notice 'Garde-fou : « m. / jean-pierre / de la tour » devient « Monsieur / Jean-Pierre / DE LA TOUR », et les % contacts sont à la règle.',
    (select count(*) from public.contacts);
end $$;

commit;
