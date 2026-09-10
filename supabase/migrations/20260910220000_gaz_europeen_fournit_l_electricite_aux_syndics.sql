-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- GAZ EUROPEEN FOURNIT AUSSI DE L'ÉLECTRICITÉ — MAIS SEULEMENT AUX SYNDICS
--
-- William, 09/09/2026 : Matthieu ne peut pas créer de version sur « ARTCOP - SDC 110 BOULEVARD
-- PEREIRE ». GAZ EUROPEEN est grisé avec « Le fournisseur ne fournit pas Électricité ». « C'est
-- faux car GAZ EUROPEEN peut gérer de l'électricité pour les syndics de copropriété. »
--
-- LE MOTEUR D'ÉLIGIBILITÉ N'EST PAS EN CAUSE : il disait la vérité de la base. GAZ EUROPEEN y était
-- enregistré `energy_types = {Gaz Naturel}`. C'est la fiche fournisseur qui était incomplète.
--
-- ── POURQUOI TROIS ÉCRITURES ET PAS UNE ──
--
-- Ajouter l'électricité seule n'aurait rien débloqué. Les douze règles ont été rejouées à la main
-- sur ce dossier : la règle « Segment » ne s'applique QU'À L'ÉLECTRICITÉ (`condition_field = energy`,
-- `neq Gaz`), et GAZ EUROPEEN avait `segments = {}` — une liste vide vaut rejet. Le message se
-- serait simplement déplacé sur « ne gère pas les segments », et Matthieu serait resté bloqué.
--
-- Le compteur d'ARTCOP est en C4. William donne C1 à C4, la configuration de six autres
-- fournisseurs élec du portefeuille (ENERGEM, GAZEL, GEDIA, SELIA, PRIMEO, ENDESA à un segment près).
-- Le C5 est volontairement exclu.
--
-- ── « SEULEMENT AUX SYNDICS » : LA CONDITION EXISTE DÉJÀ DANS LE MODÈLE ──
--
-- GAZ EUROPEEN cible `{Syndic professionnel, Entreprise}`, et ces cibles valent pour toutes ses
-- énergies. Lui poser `Électricité` à plat l'aurait rendu éligible en élec sur les 2 158 comptes
-- Entreprise, où il ne sait pas fournir : on aurait envoyé des demandes de cotation vouées au refus.
--
-- `mapping_rules.condition_field` sert exactement à ça. On crée une valeur de vocabulaire
-- fournisseur distincte, « Électricité (syndic) », qui ne se résout que lorsque la cible du compte
-- est un syndic professionnel. Résultat :
--
--   compte Syndic professionnel → Électricité résout en {Électricité, Electricité, Électricité (syndic)}
--                                 → GAZ EUROPEEN correspond          ✅
--   compte Entreprise           → Électricité résout en {Électricité, Electricité}
--                                 → GAZ EUROPEEN ne correspond pas    ✅
--
-- LES DOUZE AUTRES FOURNISSEURS ÉLEC NE BOUGENT PAS : la règle ajoutée est conditionnelle, donc
-- purement additive (`resolveMapping` renvoie l'union des règles qui matchent, l'opérateur est OU).
-- Ceux qui portent « Électricité » continuent de correspondre dans les deux cas.
--
-- LE « SYNDIC NON PROFESSIONNEL » N'EST PAS UN OUBLI : GAZ EUROPEEN ne le cible pas, la règle
-- « Cible » l'écarterait de toute façon. Le conditionner ici n'aurait rien changé.
--
-- ── LA LIMITE, DITE FRANCHEMENT ──
--
-- Ce mécanisme fonctionne, mais il encode une exception fournisseur dans un vocabulaire PARTAGÉ.
-- Tenable pour un cas ; à deux ou trois, il faudra un vrai croisement énergie × cible porté par la
-- fiche fournisseur. Voir la note laissée à William le 09/09/2026.
-- ════════════════════════════════════════════════════════════════════════════════════════════════

begin;

-- ── 1. Le vocabulaire conditionnel ──
insert into mapping_rules (field_name, salesforce_value, supplier_value, condition_field, condition_value, operator)
select 'energy', 'Électricité', 'Électricité (syndic)', 'target', 'Syndic professionnel', 'OU'
where not exists (
  select 1 from mapping_rules
  where field_name = 'energy' and supplier_value = 'Électricité (syndic)'
);

-- ── 2. La fiche fournisseur ──
update comptes_fournisseurs
set energy_types = array['Gaz Naturel', 'Électricité (syndic)'],
    segments     = array['C1', 'C2', 'C3', 'C4'],
    -- Simple affichage sur la fiche compte (« Fournit : … ») : il fournit bien de l'élec.
    fournit_electricite = true
where compte_id = '9980bebe-338d-4176-9501-4d8a57b304e1';

do $$
declare n_regle int; n_fournisseur int;
begin
  select count(*) into n_regle from mapping_rules
   where field_name = 'energy' and supplier_value = 'Électricité (syndic)';
  select count(*) into n_fournisseur from comptes_fournisseurs
   where compte_id = '9980bebe-338d-4176-9501-4d8a57b304e1'
     and 'Électricité (syndic)' = any(energy_types) and cardinality(segments) = 4;

  if n_regle <> 1 or n_fournisseur <> 1 then
    raise exception 'Attendu 1 règle et 1 fournisseur mis à jour, obtenu % et %.', n_regle, n_fournisseur;
  end if;
end $$;

commit;

-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- CONTRÔLE APRÈS APPLICATION
--
--   -- Les 12 autres fournisseurs élec portent toujours « Électricité » à plat.
--   select c.nom, f.energy_types, f.segments
--   from comptes_fournisseurs f join comptes c on c.id = f.compte_id
--   where f.energy_types && array['Électricité', 'Électricité (syndic)'] order by c.nom;
-- ════════════════════════════════════════════════════════════════════════════════════════════════
