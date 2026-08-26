import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Euro } from 'lucide-react'
import { Topbar } from '@/components/layout/Topbar'
import { PageHeader } from '@/components/ui/page-header'
import { ListToolbar } from '@/components/ui/list-toolbar'
import { TableauKanban } from '@/components/dashboard/TableauKanban'
import { useKanbanServeur } from '@/lib/useKanbanServeur'
import { cn } from '@/lib/utils'

/**
 * PRICING — page 7 du dossier UX du 26/08/2026.
 *
 * Sa règle : « Gérer les offres fournisseurs par statut : à demander, en attente fournisseur, offres
 * reçues et validées. » Et pendant l'appel du 26/08, la même idée dans ses mots : « une page dédiée,
 * pour savoir si on a bien envoyé l'offre, si on ne l'a pas envoyée, où on en est ».
 *
 * ══ RIEN N'A ÉTÉ CRÉÉ EN BASE, ET C'EST LE POINT ══
 *
 * Avant d'écrire une table, j'ai regardé : `suivis_consultations_fournisseurs` porte 5 409 événements
 * horodatés sur 3 487 consultations, avec huit statuts déjà définis. C'est exactement le suivi que sa
 * page décrit, et il tourne depuis la reprise Salesforce. La vue `v_pricing_consultations` en rend
 * l'état courant ; créer un second mécanisme aurait produit deux vérités sur le même fait.
 *
 * ══ CE QUE LA PAGE MONTRE, ET CE QU'ELLE NE PEUT PAS MONTRER ══
 *
 * Répartition mesurée le 26/08 : 36 à demander, 2 060 en attente fournisseur, 1 368 offres reçues,
 * 2 validées. Le déséquilibre est réel et il dit quelque chose — 2 060 demandes parties sans réponse
 * enregistrée, c'est le vrai sujet de cette page.
 *
 * MAIS LE MONTANT MANQUE PRESQUE PARTOUT : 52 offres chiffrées pour 3 523 consultations. Ce n'est pas
 * un défaut de jointure — vérifié, le lien est renseigné sur les 52 — c'est que les offres reçues sont
 * SUIVIES sans être SAISIES. La carte affiche donc le montant quand il existe et se tait sinon, au
 * lieu d'un zéro qui ferait croire à une offre gratuite.
 *
 * « DEMANDE REFUSÉE » SORT DU TABLEAU. Un fournisseur qui refuse de coter n'est plus dans le
 * pipeline ; l'y laisser gonflerait « en attente » de 57 dossiers morts. La case « inclure les
 * refusées » les ramène quand on cherche pourquoi une consultation n'a rien donné.
 */

interface LignePricing {
  consultation_id: string
  recommandation_id: string
  recommandation_nom: string | null
  compte_nom: string | null
  fournisseur_nom: string | null
  type_energie: string | null
  statut_libelle: string | null
  date_evenement: string | null
  nb_offres: number
  montant_annuel_ht: number | null
  prix_moyen_mwh: number | null
  colonne: string
}

/** Ses quatre colonnes, dans son ordre. La cinquième n'apparaît que sur demande. */
const COLONNES = [
  { code: 'A_DEMANDER', libelle: 'À demander' },
  { code: 'EN_ATTENTE', libelle: 'En attente fournisseur' },
  { code: 'RECUE', libelle: 'Offres reçues' },
  { code: 'VALIDEE', libelle: 'Validées' },
] as const

const euros = (v: number) => v.toLocaleString('fr-FR', { maximumFractionDigits: 0 }) + ' €'

export default function Pricing({ sansEntete }: { sansEntete?: boolean }) {
  const navigate = useNavigate()
  const [recherche, setRecherche] = useState('')
  const [avecRefusees, setAvecRefusees] = useState(false)

  const colonnes = avecRefusees
    ? [...COLONNES, { code: 'REFUSEE', libelle: 'Refusées' } as const]
    : [...COLONNES]

  const tableau = useKanbanServeur<LignePricing>({
    vue: 'v_pricing_consultations',
    colonneStatut: 'colonne',
    colonnes: colonnes.map((c) => ({ code: c.code, libelle: c.libelle })),
    colonnesRecherche: ['fournisseur_nom', 'compte_nom', 'recommandation_nom'],
    recherche,
    // Le montant se somme par colonne : c'est ce qui attend chez chaque fournisseur.
    colonneSomme: 'montant_annuel_ht',
    actif: true,
  })

  const lignes = tableau.data ?? []
  const nbTotal = lignes.reduce((n, c) => n + c.total, 0)
  const montantTotal = lignes.reduce((t, c) => t + (c.somme ?? 0), 0)
  const montantConnu = lignes.some((c) => (c.somme ?? 0) > 0)

  return (
    <div>
      {!sansEntete && <Topbar title="Pricing" />}
      <div className="p-4 sm:p-6">
        <PageHeader
          icone={<Euro className="h-[19px] w-[19px]" strokeWidth={2.1} />}
          teinte="from-kiwi-600 to-kiwi-400"
          title="Pricing"
          badge={montantConnu ? euros(montantTotal) : undefined}
          badgeLibelle="Montant chiffré"
          description="Suivez les offres fournisseurs à chaque étape de leur traitement."
        />

        <ListToolbar
          query={recherche}
          onQueryChange={setRecherche}
          placeholder="Rechercher un fournisseur, un compte…"
          count={nbTotal}
        >
          {/* MÊME GESTE QUE « INCLURE LES DOSSIERS CLOS » AILLEURS : la règle reste la règle, la case
              est l'exception. Un refus se consulte quand on cherche pourquoi une consultation n'a rien
              donné — pas tous les jours. */}
          <button
            type="button"
            onClick={() => setAvecRefusees((v) => !v)}
            className={cn(
              'inline-flex shrink-0 items-center gap-1.5 rounded-kw-md border px-2.5 py-1.5 text-kw-sm font-bold transition-colors',
              avecRefusees
                ? 'border-ink-800 bg-ink-800 text-white'
                : 'border-kw-border-strong bg-white text-kw-meta hover:bg-kw-subtle',
            )}
          >
            Inclure les demandes refusées
          </button>
        </ListToolbar>

        <TableauKanban
          colonnes={lignes.map((c) => ({
            code: c.code,
            libelle: c.libelle,
            total: c.somme && c.somme > 0 ? euros(c.somme) : null,
          }))}
          cartes={Object.fromEntries(
            lignes.map((c) => [
              c.code,
              c.lignes.map((l) => {
                const chiffres: { libelle: string; valeur: string }[] = []
                if (l.montant_annuel_ht != null) {
                  chiffres.push({ libelle: 'Budget annuel', valeur: euros(l.montant_annuel_ht) })
                }
                if (l.prix_moyen_mwh != null) {
                  chiffres.push({
                    libelle: 'Prix moyen',
                    valeur:
                      l.prix_moyen_mwh.toLocaleString('fr-FR', { maximumFractionDigits: 2 }) + ' €/MWh',
                  })
                }
                return {
                  id: l.consultation_id,
                  /* LE FOURNISSEUR EN TITRE, LE CLIENT EN SOUS-TITRE. Sur cette page on travaille
                     fournisseur par fournisseur — « qui ne m'a pas répondu » — là où les autres
                     kanbans partent du client. */
                  titre: l.fournisseur_nom || 'Fournisseur inconnu',
                  sousTitre: l.compte_nom ?? undefined,
                  nature: l.type_energie === 'GAZ' ? 'Gaz' : l.type_energie ? 'Électricité' : undefined,
                  /* LE MOTIF DIT OÙ ON EN EST, avec la date du dernier événement : sur 2 060 demandes
                     en attente, ce qui compte est depuis QUAND. */
                  motif:
                    l.statut_libelle && l.date_evenement
                      ? `${l.statut_libelle} — ${new Date(l.date_evenement).toLocaleDateString('fr-FR')}`
                      : (l.statut_libelle ?? 'Demande non envoyée'),
                  chiffres: chiffres.length > 0 ? chiffres : undefined,
                  mention: l.recommandation_nom ?? undefined,
                  to: `/recommandations/${l.recommandation_id}`,
                }
              }),
            ]),
          )}
          totaux={Object.fromEntries(lignes.map((c) => [c.code, c.total]))}
          onCarte={(id) => {
            const l = lignes.flatMap((c) => c.lignes).find((x) => x.consultation_id === id)
            if (l) navigate(`/recommandations/${l.recommandation_id}`)
          }}
          siVide={
            tableau.isLoading
              ? 'Chargement…'
              : 'Aucune consultation fournisseur ne correspond.'
          }
        />

        {/* CE QUE LA PAGE NE PEUT PAS DIRE, dit à l'écran. 52 offres chiffrées pour 3 523
            consultations : les offres reçues sont suivies sans être saisies, et une page de pricing
            sans montants doit l'annoncer plutôt que de laisser chercher. */}
        <p className="mt-3 max-w-[95ch] text-kw-xs leading-relaxed text-kw-faint">
          Le budget n’apparaît que sur les consultations dont l’offre a été saisie. Une offre reçue mais
          non chiffrée reste dans sa colonne, sans montant : c’est le suivi qui la fait avancer, pas le
          prix.
        </p>
      </div>
    </div>
  )
}
