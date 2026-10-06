-- LES DURÉES PAR FOURNISSEUR ET PAR COMPTEUR — William, 06/10/2026 : « par fournisseur et par
-- compteur, mais si monosite, ne pas afficher le compteur ». Chaque compteur d'un multisite a son
-- début de fourniture, donc sa durée max chez chaque fournisseur. `durees_mois` reste l'union (c'est
-- elle qui fait naître les offres, `fn_offres_suivent_la_commande`) ; le détail vit ici :
-- { "<compteur_id>": [12, 24], … }. Nul sur les commandes d'avant.
alter table public.optimisations_fournisseurs add column if not exists durees_par_compteur jsonb;
comment on column public.optimisations_fournisseurs.durees_par_compteur is
  'Durées demandées à ce fournisseur, compteur par compteur ({compteur_id: [mois]}). durees_mois en est l''union.';
