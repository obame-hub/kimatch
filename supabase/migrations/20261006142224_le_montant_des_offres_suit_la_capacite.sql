-- Suite de la migration précédente : son dernier calcul du montant de l'offre lisait les totaux
-- d'AVANT la mise à jour (une requête ne voit pas ses propres écritures). Le montant redevient la
-- somme de ses lignes, pour les offres que la reprise de la capacité a touchées.
update public.offres_fournisseurs o
   set montant_annuel_ht = s.somme, date_modification = now()
  from (select x.offre_fournisseur_id, sum(x.cout_total_annuel_estime_ht) somme
          from public.offres_fournisseurs_compteurs x
         group by x.offre_fournisseur_id) s
 where s.offre_fournisseur_id = o.id
   and o.date_modification > now() - interval '30 minutes'
   and o.montant_annuel_ht is distinct from s.somme
   and exists (select 1 from public.offres_fournisseurs_compteurs x
                 join public.offres_compteurs_electricite oce on oce.offre_compteur_id = x.id
                where x.offre_fournisseur_id = o.id);
