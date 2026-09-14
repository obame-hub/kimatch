-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- UNE PISTE RETROUVE SA VRAIE DATE DE CRÉATION
-- ════════════════════════════════════════════════════════════════════════════════════════════════
--
-- Naoëlle, 14/09/2026 : « oui bascule date_creation sur la vraie date Salesforce ».
--
-- La migration 20260914170000 avait posé `date_creation_salesforce` sans y toucher, en disant :
-- « réécrire la date de création de 5 131 lignes change l'ordre de toutes les listes, le calcul des
-- anciennetés, et l'ordre chronologique dont les références PST tirent leur numéro. C'est une
-- décision, pas un effet de bord d'un import de champs. » La décision est prise.
--
-- ══ CE QU'ON RÉPARE ══════════════════════════════════════════════════════════════════════════
--
-- Les pistes reprises portent TOUTES le 01/09/2026 dans `date_creation` : le jour de l'import.
-- Salesforce les échelonne du 24/02/2025 au 14/09/2026 — 454 en 2025, 4 685 en 2026. Toute
-- statistique par mois de création est donc fausse aujourd'hui, et c'est exactement ce que William
-- veut pouvoir faire.
--
--     à basculer                5 137
--     déjà justes                   2   (créées aujourd'hui des deux côtés)
--     sans date Salesforce          6   ⚠  saisies à la main dans Kimatch, on n'y touche pas
--
-- LES SIX SAISIES À LA MAIN GARDENT LEUR DATE. Elles n'ont jamais existé dans Salesforce : leur
-- `date_creation` est déjà la vraie, et y écrire un `null` détruirait la seule qu'on ait.
--
-- ══ CE QUI CHANGE AILLEURS, ET QU'IL FAUT AVOIR EN TÊTE ══════════════════════════════════════
--
-- L'ORDRE DES LISTES. « Trier par date de création » sur l'écran Prospection rendait 5 131 pistes
-- à la même seconde, donc un ordre arbitraire ; il devient chronologique. C'est le but.
--
-- LES RÉFÉRENCES PST NE BOUGENT PAS. Elles ont été attribuées le 14/09 dans l'ordre de l'ancienne
-- `date_creation` — donc dans un ordre arbitraire. Elles resteront donc sans rapport avec la
-- chronologie réelle. Les renuméroter serait une seconde décision, et changerait des identifiants
-- que des gens ont pu noter depuis ce matin : on ne le fait pas.
--
-- L'HISTORIQUE VA RECEVOIR 5 137 LIGNES. `fn_audit_trace` consigne chaque colonne modifiée, et
-- c'est bien ce qu'on veut ici : `appliquer-migration.cjs` pose `kimatch.origine`, donc chaque
-- ligne dira « migration 20260914240000_une_piste_retrouve_sa_vraie_date_de_creation ». Une fiche
-- dont la date change sans trace serait pire que la trace.
--
-- ══ RÉVERSIBLE ═══════════════════════════════════════════════════════════════════════════════
--
-- `date_creation_salesforce` reste. Elle dit d'où vient la valeur, et l'historique des
-- modifications garde l'ancienne date ligne par ligne. Revenir en arrière est possible ; il faudrait
-- le vouloir.
-- ════════════════════════════════════════════════════════════════════════════════════════════════

begin;

update public.pistes
   set date_creation = date_creation_salesforce
 where date_creation_salesforce is not null
   and date_creation is distinct from date_creation_salesforce;

-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- LE GARDE-FOU : LA CHRONOLOGIE EST CELLE DE SALESFORCE, ET RIEN N'A ÉTÉ PERDU
-- ════════════════════════════════════════════════════════════════════════════════════════════════
--
-- Trois choses à prouver, et la troisième est celle qu'on oublie : que les six pistes saisies dans
-- Kimatch ont gardé leur date. Une bascule qui les aurait mises à `null` passerait inaperçue —
-- elles sont six sur cinq mille — et on ne saurait plus quand elles ont été créées.
--
do $$
declare
  restantes   integer;
  futures     integer;
  en_2025     integer;
  en_2026     integer;
  a_la_main   integer;
  le_plus_vieux date;
begin
  select count(*)::integer into restantes
    from public.pistes
   where date_creation_salesforce is not null
     and date_creation is distinct from date_creation_salesforce;
  if restantes > 0 then
    raise exception '% piste(s) gardent la date de l''import.', restantes;
  end if;

  select count(*)::integer into futures from public.pistes where date_creation > now();
  if futures > 0 then
    raise exception '% piste(s) sont créées dans le futur : la date est mal lue.', futures;
  end if;

  -- La répartition doit être celle relevée dans Salesforce avant la bascule.
  select count(*) filter (where extract(year from date_creation) = 2025)::integer,
         count(*) filter (where extract(year from date_creation) = 2026)::integer
    into en_2025, en_2026
    from public.pistes where date_creation_salesforce is not null;
  if en_2025 <> 454 or en_2026 <> 4685 then
    raise exception 'Répartition inattendue : % en 2025 et % en 2026, au lieu de 454 et 4 685.',
      en_2025, en_2026;
  end if;

  -- LES SIX SAISIES À LA MAIN : elles n'ont pas de date Salesforce, elles doivent garder la leur.
  select count(*)::integer into a_la_main
    from public.pistes where date_creation_salesforce is null and date_creation is not null;
  if a_la_main <> 6 then
    raise exception 'Les 6 pistes saisies dans Kimatch ne sont plus que % à porter une date.', a_la_main;
  end if;

  select min(date_creation)::date into le_plus_vieux from public.pistes;
  raise notice 'Garde-fou : % pistes rangées du % à aujourd''hui — 454 en 2025, 4 685 en 2026, et les 6 saisies à la main intactes.',
    (select count(*) from public.pistes), le_plus_vieux;
end $$;

commit;
