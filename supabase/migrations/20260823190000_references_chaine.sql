-- Les références lisibles de la chaîne commerciale : OPP-2026-014, et ses équivalents.
--
-- POURQUOI. La maquette de William met la référence au premier plan de la fiche opportunité —
-- « OPP-2026-014 », en JetBrains Mono, 20 px, c'est le titre de l'écran. Nos opportunités n'en
-- avaient aucune : l'en-tête affichait « Sans référence », ce qui donne l'impression d'un écran
-- cassé. Vérifié avant d'écrire ceci : aucune séquence dans le schéma, aucune colonne `reference`
-- avec une valeur par défaut. Il n'existait donc pas de convention à suivre, il faut la poser.
--
-- UNE SEULE SÉQUENCE PAR OBJET, ET L'ANNÉE DANS LE LIBELLÉ. Une numérotation qui repart à 1 chaque
-- année demanderait de lire le maximum de l'année en cours à chaque insertion : deux créations
-- simultanées liraient le même maximum et produiraient le même numéro. Une séquence ne se trompe
-- jamais, même sous charge. Le compteur ne repart donc pas à zéro en janvier — c'est le seul écart
-- avec l'exemple de William, et il est délibéré.
--
-- LE DÉCLENCHEUR NE POSE LA RÉFÉRENCE QUE SI ELLE EST NULLE : une reprise de données qui apporte ses
-- propres références les garde.

begin;

create sequence if not exists public.seq_reference_opportunite;
create sequence if not exists public.seq_reference_piste;
create sequence if not exists public.seq_reference_liste;
create sequence if not exists public.seq_reference_requete;
create sequence if not exists public.seq_reference_remuneration;

create or replace function public.fn_reference_chaine()
returns trigger
language plpgsql
as $$
declare
  prefixe text;
  sequence_nom text;
begin
  if new.reference is not null and btrim(new.reference) <> '' then
    return new;
  end if;

  case TG_TABLE_NAME
    when 'opportunites'  then prefixe := 'OPP'; sequence_nom := 'seq_reference_opportunite';
    when 'pistes'        then prefixe := 'PST'; sequence_nom := 'seq_reference_piste';
    when 'listes'        then prefixe := 'LST'; sequence_nom := 'seq_reference_liste';
    when 'requetes'      then prefixe := 'REQ'; sequence_nom := 'seq_reference_requete';
    when 'remunerations' then prefixe := 'REM'; sequence_nom := 'seq_reference_remuneration';
    else return new;
  end case;

  new.reference := prefixe || '-' || to_char(now(), 'YYYY') || '-'
    || lpad(nextval('public.' || sequence_nom)::text, 3, '0');
  return new;
end;
$$;

do $$
declare t text;
begin
  foreach t in array array['opportunites', 'pistes', 'listes', 'requetes', 'remunerations']
  loop
    execute format('drop trigger if exists trg_reference_chaine on public.%I', t);
    -- Après `trg_audit_trace` dans l'ordre alphabétique, ce qui n'a pas d'importance ici : les deux
    -- ne font que renseigner des champs de NEW, sans se lire l'un l'autre.
    execute format('create trigger trg_reference_chaine before insert on public.%I for each row execute function fn_reference_chaine()', t);
  end loop;
end $$;

-- Reprise des lignes déjà créées sans référence, dans l'ordre de leur création pour que la
-- numérotation suive l'ancienneté.
do $$
declare
  r record;
  couples text[][] := array[
    array['opportunites', 'OPP', 'seq_reference_opportunite'],
    array['pistes', 'PST', 'seq_reference_piste'],
    array['listes', 'LST', 'seq_reference_liste'],
    array['requetes', 'REQ', 'seq_reference_requete'],
    array['remunerations', 'REM', 'seq_reference_remuneration']
  ];
  i integer;
begin
  for i in 1 .. array_length(couples, 1) loop
    for r in execute format(
      'select id, to_char(date_creation, ''YYYY'') an from public.%I where reference is null or btrim(reference) = '''' order by date_creation',
      couples[i][1]
    ) loop
      execute format(
        'update public.%I set reference = %L where id = %L',
        couples[i][1],
        couples[i][2] || '-' || r.an || '-' || lpad(nextval('public.' || couples[i][3])::text, 3, '0'),
        r.id
      );
    end loop;
  end loop;
end $$;

commit;
