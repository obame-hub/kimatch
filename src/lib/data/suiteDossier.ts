import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

/**
 * La suite du dossier : le mandat qui autorise, le contrat qui conclut.
 *
 * POURQUOI CE MODULE EXISTE. La fiche Recommandation s'arrêtait aux offres, alors que la base
 * continue : `recommandations_mandats` dit avec quel mandat on avait le droit de consulter, et
 * `contrats` → `contrats_compteurs` → `contrats_compteurs_tarifs` porte le résultat signé, PDL par
 * PDL. Demande de Naoëlle du 18/08/2026 : « il faut qu'on ait accès à tout par hiérarchie. »
 *
 * `contrats_compteurs_tarifs` est le MIROIR de `offres_compteurs_electricite` / `_gaz` : mêmes
 * classes temporelles, mêmes abonnements, mais côté signé au lieu de côté proposé. C'est ce qui
 * permet de comparer ce qu'on avait promis avec ce qui a été contracté.
 *
 * Requêtes scopées sur la recommandation, jamais `useContrats()` ni `useMandats()` : ces deux-là
 * chargent 1598 contrats et 1745 mandats pour en afficher un ou deux.
 */

export interface MandatDeLaReco {
  id: string
  reference: string | null
  statut: string | null
  principal: boolean
  date_signature: string | null
  date_fin_validite: string | null
}

export interface TarifContratCompteur {
  /** Classe temporelle -> €/MWh. Clés BASE, HP, HC, HPH, HCH, HPE, HCE, POINTE, GAZ. */
  prix_eur_mwh_par_classe: Record<string, number>
  type_prix: string | null
  indexation: string | null
  abonnement_annuel_ht: number | null
  date_debut_validite: string | null
  date_fin_validite: string | null
}

export interface CompteurDuContrat {
  id: string
  compteur_id: string
  compteur_label: string
  date_debut_rattachement: string | null
  tarifs: TarifContratCompteur[]
}

export interface ContratDeLaReco {
  id: string
  reference_fournisseur: string | null
  fournisseur_nom: string | null
  statut: string | null
  date_debut: string | null
  date_fin: string | null
  duree_mois: number | null
  /** Vient-il de CETTE version, ou de la recommandation en général ? */
  version_recommandation_id: string | null
  compteurs: CompteurDuContrat[]
}

const CLASSES_TARIF = ['base', 'hp', 'hc', 'hph', 'hch', 'hpe', 'hce', 'pointe', 'gaz'] as const

export function useSuiteDossier(recoId: string | undefined) {
  return useQuery({
    queryKey: ['recommandations', 'suite-dossier', recoId],
    enabled: !!recoId,
    queryFn: async (): Promise<{ mandats: MandatDeLaReco[]; contrats: ContratDeLaReco[] }> => {
      const vide = { mandats: [] as MandatDeLaReco[], contrats: [] as ContratDeLaReco[] }
      try {
        // ── Mandats ──
        const { data: liensMandats } = await supabase
          .from('recommandations_mandats')
          .select('mandat_id, principal, mandat:mandats(id, reference, date_signature, date_fin_validite, statut:statuts_mandats(libelle))')
          .eq('recommandation_id', recoId as string)
        type LienMandat = {
          principal: boolean | null
          mandat: { id: string; reference: string | null; date_signature: string | null; date_fin_validite: string | null; statut: { libelle: string } | null } | null
        }
        const mandats: MandatDeLaReco[] = ((liensMandats ?? []) as unknown as LienMandat[])
          .filter((l) => l.mandat)
          .map((l) => ({
            id: l.mandat!.id,
            reference: l.mandat!.reference,
            statut: l.mandat!.statut?.libelle ?? null,
            principal: Boolean(l.principal),
            date_signature: l.mandat!.date_signature,
            date_fin_validite: l.mandat!.date_fin_validite,
          }))
          // Le mandat principal d'abord : c'est celui qui couvre le périmètre consulté.
          .sort((a, b) => Number(b.principal) - Number(a.principal))

        // ── Contrats ──
        const { data: contratsRows } = await supabase
          .from('contrats')
          .select('id, reference_fournisseur, date_debut, date_fin, duree_mois, version_recommandation_id, statut:statuts_contrats(libelle), fournisseur:comptes!contrats_fournisseur_compte_id_fkey(nom)')
          .eq('recommandation_id', recoId as string)
        type RawContrat = {
          id: string
          reference_fournisseur: string | null
          date_debut: string | null
          date_fin: string | null
          duree_mois: number | null
          version_recommandation_id: string | null
          statut: { libelle: string } | null
          fournisseur: { nom: string } | null
        }
        const bruts = (contratsRows ?? []) as unknown as RawContrat[]
        if (bruts.length === 0) return { mandats, contrats: [] }

        // ── Compteurs des contrats, puis leurs tarifs ──
        const { data: ccRows } = await supabase
          .from('contrats_compteurs')
          .select('id, contrat_id, compteur_id, date_debut_rattachement, compteur:compteurs(numero_point, libelle)')
          .in('contrat_id', bruts.map((c) => c.id))
        type RawCC = {
          id: string
          contrat_id: string
          compteur_id: string
          date_debut_rattachement: string | null
          compteur: { numero_point: string | null; libelle: string | null } | null
        }
        const cc = (ccRows ?? []) as unknown as RawCC[]

        const { data: tarifsRows } = cc.length === 0
          ? { data: [] }
          : await supabase
              .from('contrats_compteurs_tarifs')
              .select('contrat_compteur_id, type_prix, indexation, abonnement_annuel_ht, date_debut_validite, date_fin_validite, prix_base_eur_mwh, prix_hp_eur_mwh, prix_hc_eur_mwh, prix_hph_eur_mwh, prix_hch_eur_mwh, prix_hpe_eur_mwh, prix_hce_eur_mwh, prix_pointe_eur_mwh, prix_gaz_eur_mwh')
              .in('contrat_compteur_id', cc.map((x) => x.id))

        const tarifsParCompteur = new Map<string, TarifContratCompteur[]>()
        for (const t of (tarifsRows ?? []) as unknown as Record<string, unknown>[]) {
          const parClasse: Record<string, number> = {}
          for (const k of CLASSES_TARIF) {
            const v = t[`prix_${k}_eur_mwh`] as number | null
            if (v != null) parClasse[k.toUpperCase()] = v
          }
          const cle = t.contrat_compteur_id as string
          const liste = tarifsParCompteur.get(cle) ?? []
          liste.push({
            prix_eur_mwh_par_classe: parClasse,
            type_prix: (t.type_prix as string) ?? null,
            indexation: (t.indexation as string) ?? null,
            abonnement_annuel_ht: (t.abonnement_annuel_ht as number) ?? null,
            date_debut_validite: (t.date_debut_validite as string) ?? null,
            date_fin_validite: (t.date_fin_validite as string) ?? null,
          })
          tarifsParCompteur.set(cle, liste)
        }

        const compteursParContrat = new Map<string, CompteurDuContrat[]>()
        for (const x of cc) {
          const liste = compteursParContrat.get(x.contrat_id) ?? []
          liste.push({
            id: x.id,
            compteur_id: x.compteur_id,
            compteur_label: x.compteur?.libelle || x.compteur?.numero_point || '',
            date_debut_rattachement: x.date_debut_rattachement,
            tarifs: tarifsParCompteur.get(x.id) ?? [],
          })
          compteursParContrat.set(x.contrat_id, liste)
        }

        return {
          mandats,
          contrats: bruts.map((c) => ({
            id: c.id,
            reference_fournisseur: c.reference_fournisseur,
            fournisseur_nom: c.fournisseur?.nom ?? null,
            statut: c.statut?.libelle ?? null,
            date_debut: c.date_debut,
            date_fin: c.date_fin,
            duree_mois: c.duree_mois,
            version_recommandation_id: c.version_recommandation_id,
            compteurs: compteursParContrat.get(c.id) ?? [],
          })),
        }
      } catch (error) {
        // Une branche annexe ne doit pas faire tomber la fiche : sans mandat ni contrat, la
        // recommandation reste parfaitement lisible.
        console.error('useSuiteDossier', error)
        return vide
      }
    },
  })
}
