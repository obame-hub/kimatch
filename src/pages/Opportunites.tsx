import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useNavigate } from 'react-router-dom'
import { Plus, Target } from 'lucide-react'
import { TableauKanban } from '@/components/dashboard/TableauKanban'
import { volumeLisible } from '@/lib/volume'
import { Topbar } from '@/components/layout/Topbar'
import { PageHeader, Indicateurs } from '@/components/ui/page-header'
import { Card } from '@/components/ui/card'
import { ChoixParRecherche } from '@/components/ui/choix-recherche'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { FormField, Input, Select, Textarea } from '@/components/ui/form'
import { ListToolbar, BasculeOption } from '@/components/ui/list-toolbar'
import { useListControls } from '@/lib/useListControls'
import { usePerimetreListe, BasculePerimetre } from '@/lib/perimetre'
import { SelecteurTri } from '@/lib/triKanban'
import {
  statutDerive,
  PIPELINE_OPPORTUNITE,
  useOpportunites,
  usePoidsOpportunites,
  useStatutsOpportunites,
  useCreerOpportunite,
  ORIGINES_OPPORTUNITE,
} from '@/lib/data/opportunites'
import { useContacts } from '@/lib/data/contacts'
import { useMandats } from '@/lib/data/mandats'
import { cn } from '@/lib/utils'
import { useOuvrirCreation } from '@/lib/ouvrirCreation'

/**
 * Les signaux positifs, tels que Michel les énumère : « échéance connue à moins de 2 ans, demande
 * explicite du client, marché favorable, potentiel d'optimisation TURPE, autre besoin commercial
 * concret ». Proposés en un clic parce que ce sont les quatre cinquièmes des cas ; le champ reste
 * libre pour le reste.
 */
const SIGNAUX_EXEMPLES = [
  'Échéance de contrat à moins de 2 ans',
  'Demande explicite du client',
  'Marché favorable',
  "Potentiel d'optimisation TURPE",
  'Autre besoin commercial',
]

/**
 * La liste des opportunités.
 *
 * Mémo de Michel, 23/08/2026 : « la priorité est d'avoir une première version simple et
 * opérationnelle de l'objet Opportunité afin que l'équipe puisse commencer à travailler dessus la
 * semaine prochaine. »
 *
 * CE QUE LA CARTE MONTRE, ET POURQUOI. Le compte et l'origine disent d'où vient l'affaire ; le
 * statut, où elle en est ; le périmètre, son ampleur ; la prochaine action et son échéance, ce qu'il
 * reste à faire. Une opportunité dont l'échéance est passée le dit en rouge : c'est le seul chiffre
 * qui commande une action aujourd'hui.
 */



export default function Opportunites() {
  const { data: opportunites, isLoading } = useOpportunites()
  const { data: poids } = usePoidsOpportunites()
  // Les mandats disent si le périmètre est couvert, donc où se situe chaque opportunité dans le
  // pipeline. Le même hook alimente les fiches : la requête est le plus souvent déjà en cache.
  const { data: mandats } = useMandats()
  // LE BOUTON « NOUVELLE OPPORTUNITÉ » DU TABLEAU DE BORD OUVRE VRAIMENT LE FORMULAIRE. Sa maquette
  // le place en haut à droite de l'accueil ; un bouton qui se contenterait d'amener sur la liste
  // obligerait à le chercher une seconde fois. L'état initial lit donc le paramètre d'URL.
  const [parametres] = useSearchParams()
  const [creation, setCreation] = useState(parametres.get('nouveau') === '1')
  // `?creer=1` vient du menu « Créer » de la barre du haut. `?nouveau=1` est conservé : le
  // tableau de bord l'utilise, et des liens ont pu être partagés.
  useOuvrirCreation(() => setCreation(true))
  const [avecClos, setAvecClos] = useState(false)

  const { perimetre, setPerimetre, visibles: opportunitesDuPerimetre } = usePerimetreListe(
    'opportunites', opportunites,
    { proprietaireId: (o) => o.proprietaire_id, compteId: (o) => o.compte_id },
  )

  const controles = useListControls(opportunitesDuPerimetre, {
    searchFields: (o) => [o.compte_nom, o.reference, o.contact_nom, o.type_opportunite],
    /* LES TROIS COMPARATEURS EXISTAIENT DEJA, sans aucun moyen de choisir entre eux : la page
       triait toujours par « recentes » et les deux autres etaient du code mort. Ils sont branches
       au selecteur ci-dessous. Ici le tri peut rester local — cet ecran charge TOUTES les
       opportunites, contrairement aux tableaux du Pricing et des Recommandations. */
    sorters: {
      recentes: (a, b) => (b.date_creation ?? '').localeCompare(a.date_creation ?? ''),
      compte: (a, b) => (a.compte_nom ?? '').localeCompare(b.compte_nom ?? ''),
      echeance: (a, b) => (a.prochaine_action_echeance ?? '9999').localeCompare(b.prochaine_action_echeance ?? '9999'),
    },
    defaultSort: 'recentes',
  })
  const filtrees = controles.items ?? []

  /**
   * LES OPPORTUNITÉS VIVANTES — celles que le tableau montre.
   *
   * Michel, 25/08/2026 à 14 h 29 : « pareil pour les opportunités », n'afficher que les actives.
   * `filtrees` porte encore les converties et les abandonnées : les compter au-dessus de colonnes qui
   * ne les affichent plus serait le premier écart qu'on remarque, et celui qui fait douter du reste.
   */
  const estVivante = (code: string) => code !== 'CONVERTIE' && code !== 'ABANDONNEE'
  const vivantes = avecClos
    ? filtrees
    : filtrees.filter((o) => estVivante(statutDerive(o, mandats ?? []).code))
  const paliers = PIPELINE_OPPORTUNITE.filter((p) => avecClos || estVivante(p.code))

  /* Les quatre paliers de son dossier — nouvelle, qualification, mandat, prête à recommander —
     comptés sur les opportunités vivantes. Ils sont DÉRIVÉS des objets réellement présents, jamais
     choisis à la main : c'est le principe de son chapitre 5.

     Le comptage passe par le MÊME `statutDerive` que les colonnes du tableau, pour la raison déjà
     écrite plus bas : le bandeau et le tableau doivent parler de la même population, sinon on ne
     sait plus laquelle croire. */
  const compterPalier = (code: string) =>
    vivantes.filter((o) => statutDerive(o, mandats ?? []).code === code).length
  const mesures = [
    { libelle: 'En cours', valeur: String(vivantes.length), precision: 'Opportunités vivantes' },
    { libelle: 'En qualification', valeur: String(compterPalier('EN_QUALIFICATION')), precision: 'Périmètre à valider' },
    { libelle: 'Couverture mandat', valeur: String(compterPalier('COUVERTURE_MANDAT')), precision: 'Accord à obtenir' },
    { libelle: 'Prêtes', valeur: String(compterPalier('PRETE_A_CONVERTIR')), precision: 'À recommander' },
  ]

  /**
   * LE POIDS DE CHAQUE PALIER — le bandeau de sa page 5.
   *
   * Le volume se somme sur les opportunités RÉELLEMENT AFFICHÉES, palier par palier : le bandeau et
   * le tableau doivent parler de la même population, sinon on ne sait plus laquelle croire. C'est
   * pour cette raison que le calcul part de `filtrees` et du même `statutDerive` que les colonnes,
   * et non d'une requête séparée qui aurait sa propre idée du périmètre.
   */
  const parPalier = paliers.map((p) => {
    const dedans = filtrees.filter((o) => statutDerive(o, mandats ?? []).code === p.code)
    let mwh: number | null = null
    for (const o of dedans) {
      const v = poids?.[o.id]?.mwh
      if (typeof v === 'number') mwh = (mwh ?? 0) + v
    }
    return { code: p.code, libelle: p.libelle, nb: dedans.length, mwh }
  })

  const volumeTotal = parPalier.reduce<number | null>(
    (t, p) => (p.mwh == null ? t : (t ?? 0) + p.mwh),
    null,
  )

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <Topbar title="Opportunités" />
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 lg:px-6">
        <PageHeader
          title="Opportunités"
          /* LE VOLUME TOTAL COLLÉ AU TITRE — règle n° 5 : « le total près du titre de page ». C'est
             la somme des paliers affichés, donc du travail en cours quand les clos sont masqués. */
          badge={volumeLisible(volumeTotal) ?? undefined}
          badgeLibelle="Consommation totale"
          description="Un potentiel commercial concret, à faire mûrir jusqu'à la recommandation."
          actions={
            <Button size="sm" onClick={() => setCreation(true)}>
              <Plus className="h-3.5 w-3.5" />
              Nouvelle opportunité
            </Button>
          }
        />

        {/* PLUS DE BASCULEMENT : LE KANBAN EST LA SEULE VUE. Naoëlle, 25/08/2026 : « garde juste la
            vue kanban pour partout, enlève la vue de liste, on garde que kanban, donc enlève le
            toggle liste/kanban ». Michel avait dit la veille « sur chaque type de page on garde
            toujours de base le truc », que j'avais lu comme « garder la liste » ; sa décision
            tranche.

            ON NE DÉPLACE PAS LES CARTES. Le palier d'une opportunité se CALCULE à partir des objets
            réunis (« la maturité se fait si les objets sont valides ») : glisser une carte ne
            voudrait rien dire, elle reviendrait à sa place au rechargement. Cliquer une carte ouvre
            l'opportunité, où les gestes qui font avancer existent et vérifient leurs conditions. */}
        <Indicateurs mesures={mesures} />

        <ListToolbar
          query={controles.query}
          onQueryChange={controles.setQuery}
          placeholder="Rechercher un compte, une référence…"
          count={vivantes.length}
        >
          <SelecteurTri
            valeur={controles.sortKey}
            onChange={controles.setSortKey}
            options={[
              { cle: 'recentes', libelle: 'date de création' },
              { cle: 'echeance', libelle: 'prochaine échéance' },
              { cle: 'compte', libelle: 'compte' },
            ]}
          />
          <BasculePerimetre
            valeur={perimetre}
            onChange={setPerimetre}
            libelleMien="Mes opportunités"
            libelleTous="Toutes les opportunités"
          />
                    {/* INCLURE LES DOSSIERS CLOS. Demandé par Naoëlle le 25/08/2026, après que j'aie signalé la
            conséquence de la règle de Michel : un dossier clos ne se trouvait plus par la recherche
            de cette page, et c'est le genre de chose qu'on découvre au mauvais moment.
            Décoché par défaut — sa règle reste la règle, la case est l'exception. */}
            <BasculeOption actif={avecClos} onChange={setAvecClos} libelle="Inclure les opportunités closes" />
          </ListToolbar>

        <div className="mb-3">
        </div>

        {isLoading ? (
          <p className="mt-4 text-sm text-km-faint">Chargement…</p>
        ) : vivantes.length > 0 ? (
          /* LES SIX PALIERS DE SA DIAPOSITIVE 13, colonnes terminales comprises : sur la page d'un
             objet, le tableau montre TOUT le pipeline, y compris ce qui a abouti et ce qui s'est
             fermé. C'est la différence avec le tableau de bord, qui ne montre que le travail
             restant. La recherche du bandeau ci-dessus s'y applique aussi. */
          <div className="mt-4">
            <TableauKanban
              /* SEULS LES PALIERS VIVANTS. Règle n° 5 du dossier UX du 26/08 : « limiter la vue aux
                 opportunités ouvertes. Une opportunité convertie passe en recommandation. »
                 « Convertie » et « Abandonnée » sont des aboutissements : elles quittent le plan de
                 travail et restent lisibles depuis la fiche du compte ou la recherche ⌘K.

                 LE VOLUME PAR STATUT EN PASTILLE DE COLONNE, comme sa maquette — et non plus dans un
                 bandeau au-dessus. Le chiffre est là où on lit la colonne. */
              colonnes={parPalier.map((p) => ({
                code: p.code,
                libelle: p.libelle,
                total: volumeLisible(p.mwh),
              }))}
              cartes={Object.fromEntries(
                paliers.map((p) => [
                  p.code,
                  filtrees
                    .filter((o) => statutDerive(o, mandats ?? []).code === p.code)
                    .map((o) => {
                      const d = statutDerive(o, mandats ?? [])
                      /* PAS DE MARGE SUR UNE OPPORTUNITÉ — règle n° 5, mot pour mot : « ne pas
                         afficher la marge ». Et c'est cohérent avec son pipeline : une opportunité
                         n'a pas encore d'offre, donc pas de marge à elle. La marge apparaît sur la
                         recommandation, qui est l'objet suivant. Le volume, lui, existe dès le
                         périmètre. */
                      const p = poids?.[o.id]
                      const chiffres: { libelle: string; valeur: string }[] = []
                      const vol = volumeLisible(p?.mwh)
                      if (vol) chiffres.push({ libelle: 'Volume', valeur: vol })
                      return {
                        id: o.id,
                        titre: o.compte_nom || o.reference || 'Opportunité',
                        sousTitre: o.contact_nom || undefined,
                        /* LA NATURE ET LE MOTIF DE SES CARTES : le type dit de quoi il s'agit, et le
                           signal dit pourquoi l'opportunité existe — c'est sa règle de création,
                           « un signal et un contact ». La tâche déduite du palier prend la place du
                           motif quand aucun signal n'est nommé : il faut toujours une raison. */
                        nature: o.type_opportunite ?? o.origine ?? undefined,
                        motif: o.signal_libelle ?? o.prochaine_action ?? d.tache ?? undefined,
                        chiffres: chiffres.length > 0 ? chiffres : undefined,
                        mention: o.reference ?? undefined,
                        urgent: d.code === 'PRETE_A_CONVERTIR',
                        to: `/opportunites/${o.id}`,
                      }
                    }),
                ]),
              )}
              siVide="Aucune opportunité ne correspond."
            />
          </div>
        ) : (
          <Card className="mt-4 flex flex-col items-center gap-2 p-8 text-center">
            <Target className="h-6 w-6 text-km-faint" />
            <p className="text-sm font-medium text-km-text">Aucune opportunité</p>
            <p className="max-w-md text-xs text-km-faint">
              Une opportunité naît d'une piste convertie, d'un signal sur le portefeuille, d'une
              demande entrante ou d'un partenaire. Créez-en une pour commencer à rassembler ses
              prérequis.
            </p>
          </Card>
        )}
      </div>

      {creation && <DialogCreationOpportunite onFermer={() => setCreation(false)} />}
    </div>
  )
}

/**
 * La création : le strict nécessaire.
 *
 * On ne demande ni le périmètre ni le mandat : « tant qu'un de ces éléments manque, l'Opportunité
 * reste active, soit en qualification, soit en attente ». Rassembler les prérequis EST le travail de
 * l'opportunité — les exiger à la création reviendrait à interdire d'en créer une.
 */
/**
 * ══ APPELABLE DEPUIS UNE FICHE COMPTE ══════════════════════════════════════════════════════════
 *
 * Michel, réunion du 02/09/2026 : depuis une fiche compte, « je mets créer, tu vois ici je peux
 * pas ». Sur la recommandation il se trompait — l'entrée est grisée faute de mandat actif, et c'est
 * la règle. Mais l'opportunité, elle, n'était PAS PROPOSÉE DU TOUT : le hub de la fiche compte
 * porte six entrées et pas celle-là, alors que l'opportunité est l'objet le plus en amont du cycle.
 *
 * `compteId` RESTREINT LA RECHERCHE DE CONTACTS À CE COMPTE. C'est le seul ajustement nécessaire :
 * le dialogue déduit déjà le compte du contact choisi, donc pré-remplir le compte n'aurait servi à
 * rien — alors que chercher parmi 3 387 contacts quand on est sur la fiche d'un compte qui en a
 * quatre, si.
 */
export function DialogCreationOpportunite({ onFermer, compteId: compteImpose }: {
  onFermer: () => void
  /** Depuis une fiche compte : la recherche de contacts s'y limite. */
  compteId?: string
}) {
  const navigate = useNavigate()
  const { data: tousContacts } = useContacts()
  const contacts = useMemo(
    () => (compteImpose ? (tousContacts ?? []).filter((c) => c.compte_id === compteImpose) : tousContacts),
    [tousContacts, compteImpose],
  )
  const { data: statuts } = useStatutsOpportunites()
  const creer = useCreerOpportunite()

  const [compteId, setCompteId] = useState('')
  const [contactId, setContactId] = useState('')
  const [origine, setOrigine] = useState('')
  const [type, setType] = useState('')
  const [signal, setSignal] = useState('')
  const [commentaire, setCommentaire] = useState('')
  const [erreur, setErreur] = useState<string | null>(null)

  // LE MINIMUM POUR LANCER UNE OPPORTUNITÉ. Michel, 23/08/2026 : « il nous faut au minimum un signal
  // et un contact ». Deux, et seulement deux : le compte, le périmètre et le mandat se rassemblent
  // ensuite — c'est le travail de l'opportunité. Le compte suit toutefois le contact, puisqu'on
  // choisit un contact, qui appartient deja a un compte.
  const signalDonne = signal.trim().length > 0
  const minimumTenu = signalDonne && Boolean(contactId)

  async function valider() {
    setErreur(null)
    try {
      const id = await creer.mutateAsync({
        compte_id: compteId || null,
        contact_id: contactId || null,
        origine: origine || null,
        type_opportunite: type.trim() || null,
        statut_id: statuts?.find((s) => s.code === 'NOUVELLE')?.id ?? null,
        commentaire: commentaire.trim() || null,
        signal_libelle: signal.trim() || null,
      })
      onFermer()
      navigate(`/opportunites/${id}`)
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Création impossible')
    }
  }

  return (
    <Dialog
      open
      onClose={onFermer}
      title="Nouvelle opportunité"
      description="Un signal et un contact suffisent à la lancer. Le compte, le périmètre et le mandat se rassemblent ensuite : c'est le travail de l'opportunité."
    >
      <div className="space-y-3">
        {/* LE SIGNAL EN PREMIER, parce que c'est lui qui justifie l'opportunité. Les cinq exemples
            sont ceux de Michel, mot pour mot ; le champ reste libre pour le reste. */}
        <FormField label="Signal positif">
          <div className="flex flex-wrap gap-1.5">
            {SIGNAUX_EXEMPLES.map((e) => (
              <button
                key={e}
                type="button"
                onClick={() => setSignal(e)}
                className={cn(
                  'rounded-lg border px-2.5 py-1 text-xs transition-colors',
                  signal === e
                    ? 'border-km-green bg-kiwi-50 font-semibold text-km-green'
                    : 'border-km-line text-km-muted hover:bg-km-bg',
                )}
              >
                {e}
              </button>
            ))}
          </div>
          <Input
            value={signal}
            onChange={(e) => setSignal(e.target.value)}
            placeholder="…ou décrire le signal"
            className="mt-2"
          />
        </FormField>
        {/* DEUX PAR RANGÉE. Sur une seule colonne, le formulaire faisait 700 px de haut : le bouton
            « Créer l'opportunité » tombait sous la ligne de flottaison et n'était jamais visible à
            l'ouverture (mesuré à l'écran, viewport de 709 px). */}
        {/* LE CONTACT SE CHERCHE, ET LE COMPTE EN DÉCOULE.
            Deux listes déroulantes de 2 765 et 3 387 options (mesuré à l'écran) — le défaut signalé
            le 21/08 sur l'assistant de recommandation : « c'est encore une liste de sélection
            déroulante ». Et deux champs pour une seule information : un contact appartient à un
            compte, donc le choisir suffit à connaître les deux. C'est aussi ce que dit la règle de
            Michel — « au minimum un signal et un contact » : le compte n'est pas demandé, il suit. */}
        <FormField label="Contact">
          <ChoixParRecherche
            items={contacts ?? []}
            valeur={contactId}
            onChoisir={(c) => { setContactId(c?.id ?? ''); setCompteId(c?.compte_id ?? '') }}
            placeholder="Nom, compte ou courriel…"
            principal={(c) => `${c.prenom} ${c.nom}`}
            secondaire={(c) => [c.compte_nom, c.fonction].filter(Boolean).join(' · ') || null}
            filtre={(c, q) => [c.prenom, c.nom, c.compte_nom, c.email].some((v) => (v ?? '').toLowerCase().includes(q))}
            aucun={
              compteImpose
                ? 'Aucun contact sur ce compte. Créez-le depuis l’onglet Contacts de la fiche, puis revenez ici.'
                : 'Aucun contact. Créez-le depuis Contacts, puis revenez ici.'
            }
            totalLibelle={`${(contacts ?? []).length} contact${(contacts ?? []).length > 1 ? 's' : ''}${compteImpose ? ' sur ce compte' : ''}`}
          />
        </FormField>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <FormField label="Origine">
            <Select value={origine} onChange={(e) => setOrigine(e.target.value)}>
              <option value="">Choisir…</option>
              {ORIGINES_OPPORTUNITE.map((o) => <option key={o.code} value={o.code}>{o.libelle}</option>)}
            </Select>
          </FormField>
          <FormField label="Type d’opportunité">
            <Select value={type} onChange={(e) => setType(e.target.value)}>
              <option value="">Choisir…</option>
              <option value="Captation">Captation</option>
              <option value="Renouvellement">Renouvellement</option>
              <option value="Optimisation">Optimisation</option>
            </Select>
          </FormField>
        </div>
        <FormField label="Commentaire">
          <Textarea value={commentaire} onChange={(e) => setCommentaire(e.target.value)} rows={2} placeholder="Le contexte, ce qu'on sait déjà…" />
        </FormField>

        {erreur && <p className="rounded-lg border border-red-200 bg-km-red-soft px-3 py-2 text-xs text-red-700">{erreur}</p>}

        {/* On dit CE QUI MANQUE, plutôt que de griser un bouton sans explication. */}
        {!minimumTenu && (
          <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-km-amber">
            Il manque {!signalDonne && 'le signal'}
            {!signalDonne && !contactId && ' et '}
            {!contactId && 'le contact'} : c'est le minimum pour lancer une opportunité.
          </p>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="ghost" onClick={onFermer}>Annuler</Button>
          <Button type="button" onClick={valider} disabled={creer.isPending || !minimumTenu}>
            {creer.isPending ? 'Création…' : 'Créer l’opportunité'}
          </Button>
        </div>
      </div>
    </Dialog>
  )
}
