-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- LE MONTANT D'UNE RECOMMANDATION N'A PLUS QU'UNE SOURCE
--
-- William, 10/09/2026, après l'import Salesforce : « Supprime le trigger ».
--
-- ── CE QUE FAISAIT `fn_calculer_marges` ──
--
--     marge_nette       := marge_brute − marge_apporteur
--     marge_nette_coeff := marge_nette × comptes.taux_commission_courtier
--
-- déclenché AVANT tout INSERT, et avant tout UPDATE de `marge_brute`, `marge_apporteur` ou
-- `fournisseur_compte_id`.
--
-- ── POURQUOI IL DOIT PARTIR, ET PAS SEULEMENT ÊTRE CORRIGÉ ──
--
-- Il était le TROISIÈME endroit où ces deux montants se calculaient, après `BlocAffaire`
-- (`avecMontantNet`) et `v_montants_recommandation`. Trois implémentations d'une même formule
-- finissent par donner trois chiffres — c'est exactement ce qui a produit l'écart de 137 038 €
-- entre le rapport Salesforce et celui de Kimatch.
--
-- Et il était le plus dangereux des trois, parce qu'il était INVISIBLE : il s'exécutait sous
-- l'écriture de quelqu'un d'autre. Il a fallu le désactiver pour que l'import du 10/09/2026 puisse
-- écrire les valeurs Salesforce ; laissé en place, il les aurait reperdues au premier
-- enregistrement d'un montant brut depuis la fiche.
--
-- SA FORMULE ÉTAIT DEVENUE FAUSSE, AUSSI. Elle ignore la commission d'intermédiaire, qui n'existait
-- pas quand elle a été écrite (colonne créée le 09/09/2026). La cascade dit aujourd'hui
-- `brute − CIP − apporteur`, et lui rendait `brute − apporteur`.
--
-- ── CE QUI PREND LE RELAIS, ET QUI EXISTE DÉJÀ ──
--
--   · une recommandation qui porte une offre retenue → `v_montants_recommandation` calcule tout ;
--   · une recommandation reprise d'un autre système → les colonnes portent la valeur d'origine,
--     et `BlocAffaire` tient la soustraction à jour quand on saisit.
--
-- Rien à écrire de plus : les deux chemins étaient déjà en place, le trigger les doublait.
--
-- ── `taux_commission_courtier` RESTE EN BASE, ET C'EST VOLONTAIRE ──
--
-- Elle vaut 1,133333 sur six fournisseurs — soit 0,85 / 0,75, exactement le rapport constaté entre
-- le « Montant » et le « Montant net » sur 139 recommandations. C'est la trace historique du modèle
-- de commissionnement d'avant, et elle explique des chiffres encore lisibles à l'écran. La
-- supprimer aujourd'hui effacerait la seule pièce qui permet de comprendre ces montants. Elle n'est
-- plus lue par personne une fois ce trigger parti.
-- ════════════════════════════════════════════════════════════════════════════════════════════════

begin;

drop trigger if exists trg_calculer_marges on recommandations;
drop function if exists fn_calculer_marges();

comment on column comptes.taux_commission_courtier is
  'HISTORIQUE — plus lu par personne depuis le 10/09/2026. Alimentait fn_calculer_marges (supprimé) : marge_nette_coeff = marge_nette × ce taux. Vaut 1,133333 (= 0,85/0,75) sur 6 fournisseurs. Conservée parce qu''elle explique les montants d''avant.';

do $$
declare n_trigger int; n_fonction int;
begin
  select count(*) into n_trigger from pg_trigger t join pg_class c on c.oid = t.tgrelid
   where c.relname = 'recommandations' and t.tgname = 'trg_calculer_marges';
  select count(*) into n_fonction from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
   where p.proname = 'fn_calculer_marges' and ns.nspname = 'public';

  if n_trigger <> 0 or n_fonction <> 0 then
    raise exception 'Suppression incomplète : % trigger, % fonction.', n_trigger, n_fonction;
  end if;
end $$;

commit;

-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- CONTRÔLE APRÈS APPLICATION
--
--   -- Les montants de l'import ne bougent plus quand on touche au montant brut.
--   select round(sum(marge_nette_coeff),2) as montant, round(sum(marge_nette),2) as net
--   from recommandations r join import_sf_montants i on left(r.id_salesforce,15) = i.id15
--   where r.actif;   -- attendu : 1038667.57 et 1005178.33
-- ════════════════════════════════════════════════════════════════════════════════════════════════
