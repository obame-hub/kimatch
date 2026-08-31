import { useState } from 'react'
import { Topbar } from '@/components/layout/Topbar'
import { PageHeader, Indicateurs } from '@/components/ui/page-header'
import { ListToolbar } from '@/components/ui/list-toolbar'
import { TableauKanban } from '@/components/dashboard/TableauKanban'
import { useKanbanServeur } from '@/lib/useKanbanServeur'
import { useTriKanban, SelecteurTri } from '@/lib/triKanban'
import { usePerimetre, BasculePerimetre } from '@/lib/perimetre'
import { useMonProfil } from '@/lib/data/roles'
import { SANTE_LIBELLE, type SuiviContrat } from '@/lib/data/suivisContrats'
import { cn } from '@/lib/utils'

/**
 * SUIVIS DE CONTRATS — la liste.
 *
 * Dossier de transmission KiMatch du 31/08/2026, § 2 : la zone « Production » réunit Pricing,
 * Requêtes et Suivis de contrats. Et le modèle commun des pages de liste : « en-tête avec une action
 * principale au maximum · quatre mesures maximum · barre de travail · colonnes d'étapes pour
 * visualiser un parcours réellement séquentiel ».
 *
 * DES COLONNES ET NON UN TABLEAU, parce que le parcours EST séquentiel : les huit étapes du § 7 se
 * suivent dans l'ordre, de la préparation du dossier de bienvenue au renouvellement. C'est le cas que
 * le dossier réserve aux colonnes.
 *
 * AUCUNE ACTION PRINCIPALE DANS L'EN-TÊTE, et c'est voulu. Un suivi ne se crée pas à la main : il
 * naît du contrat qui passe au statut signé (§ 7, « création automatique »). Un bouton « Nouveau
 * suivi » proposerait un geste qui n'existe pas, et laisserait croire qu'un contrat signé peut rester
 * sans suivi.
 *
 * LES SEPT PREMIÈRES ÉTAPES SEULEMENT. « Terminé ou résilié » porte 542 suivis sur 1 579 : affichée
 * par défaut, cette colonne noierait le travail en cours. Même geste que « inclure les dossiers
 * clos » ailleurs — la règle reste la règle, la case est l'exception.
 */

const COLONNES = [
  { code: 'A_PREPARER', libelle: 'À préparer' },
  { code: 'RESILIATION_A_CONFIRMER', libelle: 'Résiliation à confirmer' },
  { code: 'EN_ATTENTE_ACTIVATION', libelle: "En attente d'activation" },
  { code: 'CONTRAT_ACTIF', libelle: 'Contrat actif' },
  { code: 'SUIVI_CLIENT', libelle: 'Suivi client' },
  { code: 'RENOUVELLEMENT_A_ANTICIPER', libelle: 'Renouvellement à anticiper' },
  { code: 'EN_RENOUVELLEMENT', libelle: 'En renouvellement' },
] as const

function dateCourte(v: string | null) {
  return v ? new Date(v).toLocaleDateString('fr-FR') : '—'
}

/**
 * L'ÉCHÉANCE, RANGÉE PAR PALIER ET ÉCRITE ENTRE LES CARTES.
 *
 * Naoëlle, 27/08/2026 : « je veux que ce soit indiqué entre les tuiles ». Une pastille répétée sur
 * huit cartes écrit huit fois la même chose ; un intertitre le dit une fois et montre COMBIEN de
 * dossiers partagent la même urgence.
 */
function groupeEcheance(jours: number | null) {
  if (jours == null) return undefined
  // Les quatre tons sont ceux du tableau : « retard », « jour », « proche », « loin ». Les réutiliser
  // plutôt que d'inventer des couleurs garde les intertitres identiques d'un kanban à l'autre.
  if (jours < 0) return { cle: 'passee', texte: 'Échéance dépassée', ton: 'retard' as const }
  if (jours <= 30) return { cle: 'm1', texte: 'Échéance dans moins d’un mois', ton: 'jour' as const }
  if (jours <= 90) return { cle: 'm3', texte: 'Échéance dans moins de trois mois', ton: 'proche' as const }
  if (jours <= 180) return { cle: 'm6', texte: 'Échéance dans moins de six mois', ton: 'proche' as const }
  return { cle: 'loin', texte: 'Échéance au-delà de six mois', ton: 'loin' as const }
}

export default function SuivisContrats() {
  const [recherche, setRecherche] = useState('')
  const [avecClos, setAvecClos] = useState(false)
  const { data: monProfil } = useMonProfil()
  const { perimetre, setPerimetre } = usePerimetre('suivis-contrats')

  const colonnes = avecClos
    ? [...COLONNES, { code: 'CLOTURE', libelle: 'Terminé ou résilié' } as const]
    : [...COLONNES]

  /* L'ÉCHÉANCE EN PREMIER ET CROISSANTE : sur un suivi, ce qui décide de l'ordre du travail est la
     date à laquelle le contrat s'arrête — c'est elle qui déclenche l'anticipation à douze mois (§ 7).
     Les trois autres axes répondent aux autres questions : qu'est-ce qui traîne, chez qui, pour qui. */
  const { tri, ascendant, setTri, options: optionsTri } = useTriKanban('suivis-contrats', [
    { cle: 'date_fin', libelle: 'échéance' },
    { cle: 'actions_en_retard', libelle: 'retards', ascendant: false },
    { cle: 'compte_nom', libelle: 'compte' },
    { cle: 'fournisseur_nom', libelle: 'fournisseur' },
  ])

  const tableau = useKanbanServeur<SuiviContrat>({
    vue: 'v_suivis_contrats_liste',
    colonneStatut: 'etape',
    colonnes: colonnes.map((c) => ({ code: c.code, libelle: c.libelle })),
    colonnesRecherche: ['compte_nom', 'site_nom', 'fournisseur_nom', 'contrat_reference'],
    recherche,
    /* Le périmètre descend en base avec les autres filtres : ce tableau est paginé par colonne, et
       filtrer à l'arrivée n'aurait touché que les cinquante cartes reçues. */
    filtres: {
      proprietaire_id: perimetre === 'moi' && monProfil?.id ? monProfil.id : null,
    },
    ordre: { colonne: tri, ascendant },
    actif: true,
  })

  const lignes = tableau.data ?? []
  const nbTotal = lignes.reduce((n, c) => n + c.total, 0)

  /* LES QUATRE MESURES SONT CELLES QUI DÉCIDENT (§ 2 : « uniquement si elles servent la décision »).
     Les deux premières disent où intervenir, la troisième ce qu'il y a à reprendre commercialement, la
     dernière donne l'assiette. La santé est comptée sur les cartes reçues et le dit : la vue calcule
     la santé ligne par ligne, PostgREST ne sait pas la grouper, et annoncer un total faux serait pire
     que d'annoncer un total partiel. */
  const cartes = lignes.flatMap((c) => c.lignes)
  const compteSante = (etat: string) => cartes.filter((s) => s.sante === etat).length
  const totalDe = (code: string) => lignes.find((c) => c.code === code)?.total ?? 0

  const mesures = [
    { libelle: 'Suivis en cours', valeur: String(nbTotal), precision: 'Contrats signés à tenir' },
    {
      libelle: SANTE_LIBELLE.A_RISQUE,
      valeur: String(compteSante('A_RISQUE')),
      precision: 'Sur les cartes affichées',
    },
    {
      libelle: SANTE_LIBELLE.A_SURVEILLER,
      valeur: String(compteSante('A_SURVEILLER')),
      precision: 'Sur les cartes affichées',
    },
    {
      libelle: 'Renouvellements à saisir',
      valeur: String(totalDe('RENOUVELLEMENT_A_ANTICIPER') + totalDe('EN_RENOUVELLEMENT')),
      precision: 'Échéance à moins de douze mois',
    },
  ]

  return (
    <div>
      <Topbar title="Suivis de contrats" />
      <div className="p-4 sm:p-6">
        <PageHeader
          title="Suivis de contrats"
          description="La vie de chaque contrat signé, de l’accueil du client au renouvellement. Un suivi s’ouvre automatiquement dès qu’un contrat passe au statut signé."
        />

        <Indicateurs mesures={mesures} />

        <ListToolbar
          query={recherche}
          onQueryChange={setRecherche}
          placeholder="Rechercher un compte, un site, un fournisseur…"
          count={nbTotal}
        >
          <BasculePerimetre
            valeur={perimetre}
            onChange={setPerimetre}
            libelleMien="Mes suivis"
            libelleTous="Tous les suivis"
          />
          <SelecteurTri valeur={tri} onChange={setTri} options={optionsTri} />
          <button
            type="button"
            onClick={() => setAvecClos((v) => !v)}
            className={cn(
              'inline-flex shrink-0 items-center gap-1.5 rounded-km border px-2.5 py-1.5 text-km-body font-bold transition-colors',
              avecClos
                ? 'border-ink-800 bg-ink-800 text-white'
                : 'border-km-line bg-white text-km-muted hover:bg-km-soft',
            )}
          >
            Inclure les contrats terminés
          </button>
        </ListToolbar>

        <TableauKanban
          colonnes={lignes.map((c) => ({ code: c.code, libelle: c.libelle }))}
          totaux={Object.fromEntries(lignes.map((c) => [c.code, c.total]))}
          cartes={Object.fromEntries(
            lignes.map((c) => [
              c.code,
              c.lignes.map((s) => {
                const chiffres: { libelle: string; valeur: string }[] = []
                if (s.date_fin) chiffres.push({ libelle: 'Échéance', valeur: dateCourte(s.date_fin) })
                if (s.actions_ouvertes > 0) {
                  chiffres.push({
                    libelle: 'Actions',
                    valeur:
                      s.actions_en_retard > 0
                        ? `${s.actions_ouvertes} dont ${s.actions_en_retard} en retard`
                        : String(s.actions_ouvertes),
                  })
                }
                return {
                  id: s.id,
                  to: `/suivis-contrats/${s.id}`,
                  /* Le regroupement ne sort que sur les deux colonnes de renouvellement : ailleurs,
                     « échéance dans moins d'un mois » annoncerait une urgence dont l'étape ne parle
                     pas encore. Une fausse alerte coûte plus cher qu'une information absente. */
                  groupe:
                    c.code === 'RENOUVELLEMENT_A_ANTICIPER' || c.code === 'EN_RENOUVELLEMENT'
                      ? groupeEcheance(s.jours_avant_echeance)
                      : undefined,
                  titre: s.compte_nom || 'Compte inconnu',
                  sousTitre: s.site_nom ?? undefined,
                  /* La santé en étiquette de nature : c'est ce qui dit, avant tout le reste, s'il
                     faut s'en occuper. Elle porte un libellé — « la couleur seule ne porte jamais
                     l'information » (§ 11). */
                  nature: SANTE_LIBELLE[s.sante] ?? undefined,
                  urgent: s.sante === 'A_RISQUE',
                  /* LE MOTIF DIT CE QU'IL Y A À FAIRE. Le § 9 l'exige : « prochaine action toujours
                     visible sur un dossier ouvert, responsable et échéance identifiables ». À défaut
                     d'action ouverte, la finalité de l'étape dit ce que l'étape sert à obtenir —
                     « À préparer » seul ne dit rien. */
                  motif: s.prochaine_action
                    ? `${s.prochaine_action}${s.prochaine_echeance ? ' — ' + dateCourte(s.prochaine_echeance) : ''}`
                    : s.etape_finalite,
                  chiffres: chiffres.slice(0, 2),
                }
              }),
            ]),
          )}
          siVide="Aucun suivi dans cette étape."
        />
      </div>
    </div>
  )
}
