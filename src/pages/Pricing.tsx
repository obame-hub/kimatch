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
 * ══ SEULES LES RECOMMANDATIONS EN COURS ══
 *
 * Naoëlle, 27/08/2026 : « filtre juste les recos en cours, le pricing n'a besoin de voir que ça — là
 * il y a tout et c'est pas ce qu'on veut. »
 *
 * Mesuré avant de filtrer : sur les 3 469 consultations affichées, 3 217 appartenaient à une
 * recommandation déjà tranchée (1 548 acceptées, 763 refusées, 906 abandonnées). 93 % de l'écran
 * portait donc sur des dossiers où personne n'a plus rien à demander à un fournisseur — et ces lignes
 * noyaient les 153 demandes réellement en attente, qui sont le seul vrai sujet de cette page.
 *
 * La page en montre 305. « En cours » n'est pas redéfini ici : la vue reprend les trois étapes closes
 * que l'application connaît déjà (acceptée, refusée, abandonnée — Michel, 26/08/2026).
 *
 * ══ « VALIDÉES » A ÉTÉ RETIRÉE ══
 *
 * « Enlève la colonne validée, elle ne sert à rien ici » (Naoëlle, même message) — et c'est juste :
 * une offre retenue est une décision de Kiwee, pas une étape du traitement d'une demande fournisseur.
 * Elle n'avait rien à faire dans un tableau qui suit « où en est ma demande ».
 *
 * Ses 2 lignes n'ont pas disparu pour autant : la branche correspondante a été retirée de la vue, et
 * elles ont rejoint la colonne de leur suivi réel (« Demande acceptée » → en attente fournisseur).
 * Retirer la colonne sans toucher à la vue les aurait fait s'évaporer sans trace.
 *
 * MAIS LE MONTANT MANQUE PRESQUE PARTOUT, et ce n'est pas le champ qui est vide — CE SONT LES OFFRES
 * QUI N'EXISTENT PAS. Mesuré le 27/08/2026 : `offres_fournisseurs` compte 55 lignes pour 3 526
 * consultations, dont 6 portent un montant. Sur les 120 consultations en cours marquées « offre
 * reçue », 120 n'ont AUCUNE ligne d'offre.
 *
 * DEUX CAUSES DISTINCTES, et il faut les séparer :
 *
 *  1. La reprise Salesforce n'a importé aucune offre par fournisseur — les 55 lignes ont toutes été
 *     créées en août 2026, dans Kimatch. Salesforce ne portait le montant qu'au niveau de l'affaire
 *     (`recommandations.budget_nouvelle_offre`, renseigné sur 289 dossiers, TOUS clos) : le chiffre
 *     final d'une affaire gagnée, jamais « l'offre du fournisseur X ». Il n'y a donc rien à afficher
 *     pour les dossiers repris, et rien ne le fera apparaître.
 *
 *  2. Sur les dossiers vivants, changer le suivi en « offre reçue » est UN CLIC dans une liste
 *     déroulante, tandis que saisir l'offre est un formulaire à part (« Ajouter une offre de … »).
 *     Le premier geste est fait, le second non. Le statut avance donc sans le prix.
 *
 * La carte affiche le montant quand il existe et se tait sinon, au lieu d'un zéro qui ferait croire à
 * une offre gratuite. Rendre la saisie obligatoire au passage en « offre reçue » relève d'une décision
 * de Michel, pas d'un correctif d'affichage.
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
  recommandation_etape: string | null
  reco_en_cours: boolean
}

/**
 * Les trois étapes du traitement d'une demande fournisseur. « Refusées » n'apparaît que sur demande.
 *
 * Son dossier UX en annonçait quatre, « validées » comprise ; elle a été retirée le 27/08/2026 sur
 * demande de Naoëlle. Les trois qui restent ont ceci en commun qu'elles décrivent TOUTES un état de
 * la demande — pas envoyée, partie, revenue — là où « validée » décrivait une décision interne prise
 * après coup.
 */
const COLONNES = [
  { code: 'A_DEMANDER', libelle: 'À demander' },
  { code: 'EN_ATTENTE', libelle: 'En attente fournisseur' },
  { code: 'RECUE', libelle: 'Offres reçues' },
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
    // LE FILTRE DE LA PAGE, appliqué à toutes les colonnes ET aux sommes : le bandeau chiffré doit
    // additionner la même population que le tableau, sinon l'un démentira l'autre à l'écran.
    filtres: { reco_en_cours: true },
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
          description="Suivez les offres fournisseurs à chaque étape de leur traitement. Seuls les dossiers en cours apparaissent."
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

        {/* CE QUE LA PAGE NE PEUT PAS DIRE, dit à l'écran. Sur les 305 consultations en cours, 5
            portent un montant, et aucune des 120 « offres reçues » : le suivi avance d'un clic, la
            saisie de l'offre est un formulaire séparé que personne ne remplit. Voir l'en-tête. */}
        <p className="mt-3 max-w-[95ch] text-kw-xs leading-relaxed text-kw-faint">
          Seuls les dossiers en cours apparaissent : une recommandation acceptée, refusée ou abandonnée
          n’attend plus rien d’un fournisseur. Le budget, lui, n’apparaît que sur les consultations dont
          l’offre a été saisie — une offre reçue mais non chiffrée reste dans sa colonne, sans montant.
        </p>
      </div>
    </div>
  )
}
