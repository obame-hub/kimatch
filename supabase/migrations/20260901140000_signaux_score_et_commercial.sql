-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- LES SIGNAUX EXISTANTS REÇOIVENT LEUR SCORE ET LEUR COMMERCIAL
--
-- Le barème de Michel classe les signaux par priorité et en garde vingt par commercial. Les deux
-- colonnes qui portent ces informations existaient depuis toujours et n'ont JAMAIS été remplies :
--
--     `gravite`                vide sur les 1 456 signaux
--     `responsable_profil_id`  vide sur les 1 456 signaux
--
-- Conséquence directe, mesurée au premier essai du générateur : sur 597 contacts concernés, 586 sont
-- écartés parce qu'ils portent déjà un signal ouvert — hérité de l'ancienne génération, sans score.
-- Le classement ne portait donc que sur 11 candidats, et le plafond de vingt par commercial ne
-- mordait sur rien : chaque commercial semblait avoir zéro signal ouvert.
--
-- Autrement dit : implémenter le barème sans reprendre l'existant l'aurait rendu inopérant. L'écran
-- aurait continué de trier par date de création, comme avant, avec un score sur les seuls nouveaux.
--
-- ══ CE QUE CE RATTRAPAGE FAIT, ET NE FAIT PAS ══
--
-- Il remplit les deux colonnes sur les signaux d'échéance OUVERTS, à partir de la même vue qui sert
-- au générateur — donc du même barème, sur les mêmes faits.
--
-- Il ne touche PAS aux signaux clos ni aux autres types : leur score n'aurait aucun usage, et
-- réécrire l'historique d'un signal déjà traité ne dit rien de vrai.
--
-- Il ne SUPPRIME rien non plus. Un commercial peut se retrouver au-dessus de vingt signaux ouverts —
-- le rattrapage le révélera, et c'est une information, pas un défaut : le générateur cessera d'en
-- créer pour lui jusqu'à ce qu'il redescende. Fermer d'autorité des signaux qu'un commercial a sous
-- les yeux serait une décision métier, pas une migration.
-- ════════════════════════════════════════════════════════════════════════════════════════════════

begin;

update public.signaux sg
   set gravite = v.score,
       responsable_profil_id = coalesce(sg.responsable_profil_id, v.commercial_id),
       date_modification = now()
  from public.v_signal_score_contact v,
       public.types_signaux ty,
       public.statuts_signaux st
 where v.contact_id = sg.contact_id
   and ty.id = sg.type_signal_id
   and st.id = sg.statut_id
   and sg.actif
   and ty.code = 'ECHEANCE_CONTRAT'
   and st.code not in ('CONVERTI', 'ECARTE');

-- ── Le garde-fou ──
do $$
declare
  v_sans_score integer;
  v_sans_commercial integer;
begin
  select count(*) filter (where sg.gravite is null),
         count(*) filter (where sg.responsable_profil_id is null)
    into v_sans_score, v_sans_commercial
    from public.signaux sg
    join public.types_signaux ty on ty.id = sg.type_signal_id
    join public.statuts_signaux st on st.id = sg.statut_id
   where sg.actif and ty.code = 'ECHEANCE_CONTRAT' and st.code not in ('CONVERTI', 'ECARTE');

  -- Un signal d'échéance ouvert dont le contact n'apparaît plus dans la vue — parce que son échéance
  -- est sortie de la fenêtre entre-temps, ou qu'une opportunité s'est ouverte — reste sans score.
  -- C'est légitime : on le signale plutôt que de lui inventer une valeur.
  raise notice 'Signaux d''échéance ouverts encore sans score : % · sans commercial : %',
    v_sans_score, v_sans_commercial;
end;
$$;

commit;
