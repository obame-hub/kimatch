import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { CalendarClock, ChevronRight, Flame, Zap } from 'lucide-react'
import { TitreOnglet } from '@/components/layout/TitreOnglet'
import { PageHeader, Indicateurs } from '@/components/ui/page-header'
import { ListToolbar } from '@/components/ui/list-toolbar'
import { usePerimetre, BasculePerimetre } from '@/lib/perimetre'
import { useMonProfil } from '@/lib/data/roles'
import { useVersionsPricing, type VersionPricing } from '@/lib/data/pricingVersions'
import { PastilleStatutConsultation } from '@/components/recommandation/PastilleStatutConsultation'
import { CODES_STATUT_CONSULTATION_PROPOSES, useChangerStatutConsultation } from '@/lib/data/recommandations'
import { useReferenceTable, type ReferenceRow } from '@/lib/data/referenceTables'
import { cn } from '@/lib/utils'

/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * PRICING — DEUX COLONNES, DES VERSIONS, ET LEURS FOURNISSEURS AU CLIC
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * William, 18/09/2026 : « j'aimerais complètement repenser la page Pricing avec la nouvelle
 * articulation que l'on a mise au point pour les versions sur la page recommandation.
 *
 *   · uniquement 2 colonnes, En construction et Disponible ;
 *   · le numéro de la version mais surtout le nom de la recommandation liée pour s'y retrouver ;
 *   · au sein des colonnes, un zoning en fonction de la date de livraison souhaitée ;
 *   · au clic sur la version, se déroulent les fournisseurs avec pour chacun leur statut. »
 *
 * ══ CE QUE CETTE PAGE ÉTAIT, ET POURQUOI ELLE NE POUVAIT PAS TENIR ══
 *
 * Elle affichait UNE CARTE PAR FOURNISSEUR CONSULTÉ, réparties dans quatre colonnes selon
 * l'avancement de chacun. Une version consultée chez quatre fournisseurs se retrouvait donc éclatée
 * sur toute la largeur de l'écran — une carte en « À traiter », deux en « Demande envoyée », une en
 * « Proposition reçue » — et rien ne disait qu'elles appartenaient au même dossier.
 *
 * On ne pouvait pas répondre à la seule question qui compte ici : QUELLES DEMANDES SONT PRÊTES À
 * PARTIR CHEZ LE CLIENT. Il fallait rassembler mentalement des cartes qu'on ne voyait jamais côte à
 * côte, et le nom du compte revenait quatre fois sans qu'on sache si c'était le même dossier ou
 * quatre dossiers du même client.
 *
 * ══ LA VERSION EST L'UNITÉ DE TRAVAIL ══
 *
 * C'est elle qui porte la date de livraison souhaitée, c'est elle qui devient « Disponible », et
 * c'est elle qu'Erwan livre. Les fournisseurs sont son DÉTAIL : on les regarde pour savoir pourquoi
 * une version n'avance pas, pas pour les suivre un par un. D'où le repli — ils se déroulent au clic,
 * et la colonne reste lisible.
 *
 * Les statuts de fournisseur n'ont pas disparu : chaque carte annonce en permanence combien de
 * propositions sont arrivées sur combien attendues, et la barre de progression le montre sans lire.
 * Ce qui change, c'est qu'ils ne commandent plus la géographie de l'écran.
 *
 * ══ DEUX COLONNES, ET LA TROISIÈME QU'ON NE VERRA PAS ══
 *
 * « En construction » et « Disponible » sont deux des trois statuts de version arrêtés le
 * 18/09/2026. Le troisième — « Clôturée » — n'a pas sa place ici : une version close n'attend plus
 * rien d'un fournisseur, et c'est exactement la question de cette page. La vue les écarte donc en
 * amont, plutôt que de les charger pour les cacher.
 *
 * Mesuré au moment d'écrire : 74 versions en construction, 28 disponibles.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */

const COLONNES = [
  {
    code: 'EN_CONSTRUCTION' as const,
    libelle: 'En construction',
    phrase: 'La consultation est en cours — on attend des fournisseurs.',
  },
  {
    code: 'DISPONIBLE' as const,
    libelle: 'Disponible',
    phrase: 'Tout est revenu — la version peut partir chez le client.',
  },
]

/**
 * ══════════ LE ZONAGE PAR ÉCHÉANCE ══════════
 *
 * William, 18/09/2026 : « au sein des colonnes, tu appliqueras un zoning en fonction de la date de
 * livraison souhaitée ».
 *
 * CINQ ZONES, PAS UN GROUPE PAR JOUR. L'ancienne page groupait par nombre de jours exact — une
 * demande de Naoëlle du 27/08/2026, juste pour une colonne de consultations triée par échéance, où
 * chaque groupe réunissait plusieurs cartes. Ici, 74 versions réparties sur autant de dates
 * produiraient une trentaine d'intertitres pour une ou deux cartes chacun : ce ne serait plus un
 * zonage, ce serait une liste avec des titres.
 *
 * LES ZONES SUIVENT L'ACTION, PAS LE CALENDRIER. En retard : à rattraper. Aujourd'hui : à livrer
 * maintenant. Cette semaine : à planifier. Plus tard : un repère. Sans date : une saisie qui manque.
 * À l'intérieur de chaque zone, l'ordre reste chronologique — entre un retard de six jours et un
 * retard d'un jour, ce n'est pas le même appel.
 *
 * « SANS DATE » EST UNE ZONE ET NON UN OUBLI. 28 versions n'en portent aucune, toutes nées avant que
 * la date devienne obligatoire à la création (18/09/2026). Les ranger en bas sans les nommer les
 * aurait fait passer pour les moins urgentes, alors qu'on ne sait simplement pas.
 */
const ZONES = [
  { cle: 'retard', titre: 'En retard', ton: 'retard' as const },
  { cle: 'jour', titre: "Aujourd'hui", ton: 'jour' as const },
  { cle: 'semaine', titre: 'Cette semaine', ton: 'proche' as const },
  { cle: 'plus_tard', titre: 'Plus tard', ton: 'loin' as const },
  { cle: 'sans_date', titre: 'Sans date souhaitée', ton: 'muet' as const },
]

function zoneDe(jours: number | null): string {
  if (jours == null) return 'sans_date'
  if (jours < 0) return 'retard'
  if (jours === 0) return 'jour'
  if (jours <= 7) return 'semaine'
  return 'plus_tard'
}

const TONS_ZONE: Record<string, string> = {
  retard: 'border-km-red-line bg-km-red-soft text-km-red',
  jour: 'border-km-amber/40 bg-km-amber-soft text-km-amber',
  proche: 'border-km-blue/30 bg-km-blue-soft text-km-blue',
  loin: 'border-km-line bg-km-soft text-km-muted',
  muet: 'border-dashed border-km-line bg-white text-km-faint',
}

/** Le délai, dit en français. Le décompte vient de la base — voir la vue. */
function delaiLisible(jours: number | null): string | null {
  if (jours == null) return null
  if (jours === 0) return "aujourd'hui"
  if (jours === 1) return 'demain'
  if (jours === -1) return 'hier'
  if (jours > 1) return `dans ${jours} jours`
  return `en retard de ${-jours} jours`
}

export default function Pricing({ sansEntete }: { sansEntete?: boolean }) {
  const [recherche, setRecherche] = useState('')
  const [deroulees, setDeroulees] = useState<Set<string>>(new Set())
  const { data: monProfil } = useMonProfil()
  const { perimetre, setPerimetre } = usePerimetre('pricing')
  const { data: versions, isLoading } = useVersionsPricing()
  const { data: statutsRef } = useReferenceTable('statuts_consultations_fournisseurs')
  const changerStatut = useChangerStatutConsultation()
  const [toast, setToast] = useState<string | null>(null)
  /* L'ÉCRITURE EN COURS EST NOMMÉE, PAS GLOBALE. `changerStatut.isPending` est vrai pour la page
     entière : s'en servir aurait fait dire « Enregistrement… » aux quarante-neuf pastilles à la fois
     pendant qu'une seule s'écrit. On retient donc LAQUELLE. */
  const [enEcriture, setEnEcriture] = useState<string | null>(null)

  /**
   * ══════════ ERWAN CHANGE LE STATUT SANS QUITTER LE PRICING ══════════
   *
   * William, 18/09/2026 : « oui câble-le, c'est son geste quotidien ».
   *
   * IL LE FAISAIT DÉJÀ, mais en trois écrans : ouvrir la recommandation, retrouver la version,
   * cliquer la pastille, revenir. Sur une trentaine de consultations par jour, c'est une centaine de
   * navigations pour un geste qui tient en un clic — et surtout, on perd la colonne qu'on était en
   * train de dépiler, donc l'endroit où l'on en était.
   *
   * C'EST LA MÊME MUTATION QUE LA FICHE, et la même pastille : `useChangerStatutConsultation` écrit
   * un événement daté dans le journal de suivi, et `PastilleStatutConsultation` porte les trois
   * règles du choix. Rien n'est réécrit ici — c'est la condition pour que les deux écrans ne
   * divergent jamais.
   *
   * LA LISTE SE RAFRAÎCHIT TOUTE SEULE : la mutation invalide désormais la clef `pricing` en plus de
   * `recommandations`. Sans cet ajout, la carte aurait affiché l'ancien statut juste après le
   * changement — les deux écrans lisent le même fait par deux portes différentes.
   */
  const statutsProposables = useMemo(
    () => (statutsRef ?? []).filter((s) => (CODES_STATUT_CONSULTATION_PROPOSES as readonly string[]).includes(s.code ?? '')),
    [statutsRef],
  )

  async function poserStatut(consultationId: string, fournisseurNom: string, statut: ReferenceRow) {
    setEnEcriture(consultationId)
    try {
      await changerStatut.mutateAsync({
        optimisationFournisseurId: consultationId,
        statutId: statut.id,
        statutCode: statut.code ?? '',
      })
      setToast(`✓ ${fournisseurNom} : ${statut.libelle}`)
    } catch (e) {
      setToast(`Erreur : ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setEnEcriture(null)
    }
    window.setTimeout(() => setToast(null), 2600)
  }

  function basculer(id: string) {
    setDeroulees((precedent) => {
      const suivant = new Set(precedent)
      if (suivant.has(id)) suivant.delete(id)
      else suivant.add(id)
      return suivant
    })
  }

  /**
   * LE FILTRE ET LE TRI SE FONT ICI, PAS EN BASE, et c'est le corollaire du chargement complet :
   * cent deux lignes se filtrent en une fraction de milliseconde, et la zone « en retard » annonce
   * alors TOUT ce qui est en retard — ce qu'une page de dix cartes ne pourrait pas promettre.
   *
   * LE PÉRIMÈTRE REGARDE LES DEUX PROPRIÉTAIRES. Une recommandation a le sien, et son compte aussi ;
   * l'ancienne page ne filtrait que sur celui du compte. Un commercial qui reprend un dossier sur un
   * compte qui n'est pas le sien disparaissait donc de « mes versions ».
   */
  const visibles = useMemo(() => {
    const terme = recherche.trim().toLowerCase()
    return (versions ?? [])
      .filter((v) => {
        if (perimetre === 'moi' && monProfil?.id) {
          const mien = v.recommandation_proprietaire_id === monProfil.id
            || v.compte_proprietaire_id === monProfil.id
          if (!mien) return false
        }
        if (!terme) return true
        return `${v.recommandation_nom} ${v.compte_nom ?? ''} ${v.fournisseurs.map((f) => f.fournisseur_nom).join(' ')}`
          .toLowerCase()
          .includes(terme)
      })
      /* LES PLUS URGENTES D'ABORD, sans date en dernier. `Infinity` range les sans-date au bout sans
         cas particulier dans le tri — elles ne sont ni en avance ni en retard, elles sont ailleurs. */
      .sort((a, b) => (a.jours_avant_livraison ?? Infinity) - (b.jours_avant_livraison ?? Infinity))
  }, [versions, recherche, perimetre, monProfil?.id])

  const parColonne = useMemo(() => {
    const m = new Map<string, VersionPricing[]>()
    for (const c of COLONNES) m.set(c.code, [])
    for (const v of visibles) m.get(v.version_statut)?.push(v)
    return m
  }, [visibles])

  const enConstruction = parColonne.get('EN_CONSTRUCTION') ?? []
  const disponibles = parColonne.get('DISPONIBLE') ?? []
  const enRetard = visibles.filter((v) => (v.jours_avant_livraison ?? 0) < 0).length
  const attendus = enConstruction.reduce((n, v) => n + v.nb_attendus, 0)

  const mesures = [
    { libelle: 'Versions suivies', valeur: String(visibles.length), precision: 'Dossiers ouverts, version en cours' },
    { libelle: 'En construction', valeur: String(enConstruction.length), precision: `${attendus} réponses attendues` },
    { libelle: 'Disponibles', valeur: String(disponibles.length), precision: 'Prêtes à partir au client' },
    { libelle: 'En retard', valeur: String(enRetard), precision: 'Date de livraison dépassée' },
  ]

  return (
    <div>
      {!sansEntete && <TitreOnglet title="Pricing" />}
      <div className="p-4 sm:p-6">
        <PageHeader
          title="Pricing"
          description="Les versions en cours de consultation, rangées par statut et par date de livraison souhaitée. Cliquez une version pour voir où en est chaque fournisseur."
        />

        <Indicateurs mesures={mesures} />

        <ListToolbar
          query={recherche}
          onQueryChange={setRecherche}
          placeholder="Rechercher une recommandation, un compte, un fournisseur…"
          count={visibles.length}
        >
          <BasculePerimetre
            valeur={perimetre}
            onChange={setPerimetre}
            libelleMien="Mes versions"
            libelleTous="Toutes les versions"
          />
        </ListToolbar>

        {isLoading ? (
          <p className="text-km-body text-km-faint">Chargement…</p>
        ) : (
          <div className="grid grid-cols-1 gap-3.5 lg:grid-cols-2">
            {COLONNES.map((colonne) => {
              const cartes = parColonne.get(colonne.code) ?? []
              return (
                <section
                  key={colonne.code}
                  className="flex min-w-0 flex-col overflow-hidden rounded-km-lg border border-km-line bg-km-bg"
                >
                  <header className="flex flex-wrap items-baseline gap-2 border-b border-km-line bg-gradient-to-b from-km-soft to-white px-4 py-3">
                    <h2 className="text-km-name font-extrabold text-km-text">{colonne.libelle}</h2>
                    <span
                      className={cn(
                        'rounded-km-pill border px-2 py-[2px] text-km-label font-extrabold tabular-nums',
                        colonne.code === 'DISPONIBLE'
                          ? 'border-km-green-line bg-km-green-soft text-km-green'
                          : 'border-km-line bg-km-soft text-km-muted',
                      )}
                    >
                      {cartes.length}
                    </span>
                    <p className="min-w-0 flex-1 truncate text-km-label text-km-faint">{colonne.phrase}</p>
                  </header>

                  <div className="flex flex-col gap-3 p-3">
                    {cartes.length === 0 ? (
                      <p className="px-1 py-2 text-km-body text-km-faint">
                        {recherche ? 'Aucune version ne correspond.' : 'Aucune version à ce statut.'}
                      </p>
                    ) : (
                      ZONES.map((zone) => {
                        const deLaZone = cartes.filter((v) => zoneDe(v.jours_avant_livraison) === zone.cle)
                        if (deLaZone.length === 0) return null
                        return (
                          <div key={zone.cle} className="flex flex-col gap-2">
                            <div className="flex items-center gap-2">
                              <span
                                className={cn(
                                  'rounded-km-pill border px-2 py-[2px] text-km-tiny font-extrabold uppercase tracking-[0.06em]',
                                  TONS_ZONE[zone.ton],
                                )}
                              >
                                {zone.titre}
                              </span>
                              <span className="text-km-tiny font-bold tabular-nums text-km-faint">
                                {deLaZone.length}
                              </span>
                              <span className="h-px flex-1 bg-km-line" />
                            </div>
                            {deLaZone.map((v) => (
                              <CarteVersion
                                key={v.version_id}
                                version={v}
                                ouverte={deroulees.has(v.version_id)}
                                onBasculer={() => basculer(v.version_id)}
                                statuts={statutsProposables}
                                onChangerStatut={poserStatut}
                                enEcriture={enEcriture}
                              />
                            ))}
                          </div>
                        )
                      })
                    )}
                  </div>
                </section>
              )
            })}
          </div>
        )}
      </div>

      {/* Le même retour visuel que sur la fiche : une phrase qui confirme et s'efface. Sur un écran
          où l'on enchaîne les changements, une confirmation à valider serait une friction par
          geste — ici, on lit et on continue. */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 animate-km-toast-in whitespace-nowrap rounded-km-md bg-ink-900 px-4 py-2.5 text-km-name font-semibold text-white shadow-km-pop">
          {toast}
        </div>
      )}
    </div>
  )
}

/**
 * Une version : son dossier, son numéro, son échéance, et ses fournisseurs au clic.
 *
 * LE NOM DE LA RECOMMANDATION EST LE TITRE, pas le numéro de version. « surtout le nom de la
 * recommandation liée pour s'y retrouver » (William) : « V2 » ne désigne rien tout seul, alors que
 * « CABINET MOLINIER — SDC LE FONTENAY » se reconnaît d'un regard. Le numéro reste, en pastille, là
 * où il répond à « laquelle ? » une fois le dossier identifié.
 */
function CarteVersion({
  version,
  ouverte,
  onBasculer,
  statuts,
  onChangerStatut,
  enEcriture,
}: {
  version: VersionPricing
  ouverte: boolean
  onBasculer: () => void
  statuts: ReferenceRow[]
  onChangerStatut: (consultationId: string, fournisseurNom: string, statut: ReferenceRow) => void
  /** L'identifiant de la consultation en cours d'écriture, s'il y en a une. */
  enEcriture: string | null
}) {
  const delai = delaiLisible(version.jours_avant_livraison)
  const enRetard = (version.jours_avant_livraison ?? 0) < 0
  const repondu = version.nb_recues + version.nb_refusees

  return (
    <article className="overflow-hidden rounded-km-md border border-km-line bg-white">
      {/* ══════════ DEUX GESTES, DEUX ZONES ══════════

          William, 18/09/2026 : « il doit y avoir 2 clics possibles : un clic sur le titre doit
          renvoyer vers la recommandation en question ; un clic en bas doit permettre de dérouler la
          card avec les fournisseurs ».

          LA CARTE ÉTAIT UN SEUL BOUTON, et c'était un défaut de fond : le titre d'une carte est ce
          qu'on vise pour aller à l'objet — c'est le geste de toutes les listes de Kimatch. Le rendre
          inerte, ou pire lui faire faire autre chose, oblige à apprendre une exception.

          ET CE N'EST PAS QU'UNE QUESTION D'USAGE : un `<a>` à l'intérieur d'un `<button>` est du
          HTML invalide, que les navigateurs réparent chacun à leur façon. La carte se sépare donc en
          deux éléments voisins — un lien en haut, un bouton en bas — plutôt qu'en un imbriqué dans
          l'autre. Chacun garde son clavier, son focus et son menu contextuel : sur le titre, « ouvrir
          dans un nouvel onglet » fonctionne, ce qu'un bouton ne saura jamais faire. */}
      <Link
        to={`/recommandations/${version.recommandation_id}`}
        className="flex items-start gap-2 px-3 pb-1.5 pt-2.5 transition-colors hover:bg-km-bg"
      >
        <span className="min-w-0 flex-1">
          <span className="block truncate text-km-body font-extrabold leading-tight text-km-text">
            {version.recommandation_nom}
          </span>
          {version.compte_nom && version.compte_nom !== version.recommandation_nom && (
            <span className="block truncate text-km-label text-km-faint">{version.compte_nom}</span>
          )}
        </span>
        {version.type_energie && (
          <span
            className={cn(
              'inline-flex shrink-0 items-center gap-1 rounded-km-pill border px-1.5 py-[2px] text-km-tiny font-extrabold',
              version.type_energie === 'gaz'
                ? 'border-[#c9dcea] bg-km-gaz-soft text-km-gaz'
                : 'border-[#f2dd96] bg-km-elec-soft text-km-elec',
            )}
          >
            {version.type_energie === 'gaz' ? <Flame className="h-[9px] w-[9px]" /> : <Zap className="h-[9px] w-[9px]" />}
            {version.type_energie === 'gaz' ? 'GAZ' : 'ÉLEC'}
          </span>
        )}
        <span className="shrink-0 rounded-km-pill bg-km-amber-soft px-1.5 py-[2px] text-km-tiny font-extrabold text-[#8a4b2a]">
          V{version.numero_version ?? '?'}
        </span>
      </Link>

      {/* LA ZONE BASSE DÉROULE. Elle porte l'échéance, l'avancement et la barre : ce qui décrit
          l'état de la consultation, donc précisément ce que le détail vient expliquer. */}
      <button
        type="button"
        onClick={onBasculer}
        aria-expanded={ouverte}
        title={ouverte ? 'Replier les fournisseurs' : 'Voir les fournisseurs consultés'}
        className="flex w-full flex-col gap-2 px-3 pb-2.5 pt-1 text-left transition-colors hover:bg-km-bg"
      >
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
          <span
            className={cn(
              'inline-flex items-center gap-1 text-km-label font-semibold',
              enRetard ? 'text-km-red' : 'text-km-muted',
            )}
          >
            <CalendarClock className="h-3 w-3" />
            {version.date_souhaitee
              ? `${new Date(version.date_souhaitee).toLocaleDateString('fr-FR')}${delai ? ` · ${delai}` : ''}`
              : 'date souhaitée à définir'}
          </span>
          <span className="flex-1" />
          {/* CE QUE LA CARTE DIT SANS QU'ON L'OUVRE : combien ont répondu sur combien. C'est la
              seule chose qu'on regarde vingt fois par jour ; le détail par fournisseur, une fois. */}
          <span className="shrink-0 text-km-label tabular-nums text-km-muted">
            {version.nb_fournisseurs === 0 ? (
              <span className="text-km-faint">aucun fournisseur consulté</span>
            ) : (
              <>
                <b className={version.nb_recues > 0 ? 'text-km-green' : 'text-km-muted'}>{version.nb_recues}</b>
                {' '}reçue{version.nb_recues > 1 ? 's' : ''} / {version.nb_fournisseurs}
              </>
            )}
          </span>
          <ChevronRight
            className={cn('h-3.5 w-3.5 shrink-0 text-km-faint transition-transform', ouverte && 'rotate-90')}
          />
        </div>

        {/* La barre : une part par fournisseur, verte quand la proposition est arrivée, rouge sur un
            refus, creuse tant qu'on attend. Elle dit l'avancement sans qu'on lise un chiffre. */}
        {version.nb_fournisseurs > 0 && (
          <div className="flex gap-[3px]" aria-hidden="true">
            {version.fournisseurs.map((f) => (
              <span
                key={f.id}
                className={cn(
                  'h-[3px] flex-1 rounded-full',
                  f.statut_code === 'DISPONIBLE'
                    ? 'bg-km-green'
                    : f.statut_code === 'REFUSEE'
                      ? 'bg-km-red/50'
                      : f.statut_code === 'A_TRAITER'
                        ? 'bg-km-line'
                        : 'bg-km-amber/60',
                )}
              />
            ))}
          </div>
        )}
      </button>

      {ouverte && (
        <div className="animate-km-fade-slide border-t border-km-line-soft bg-km-bg/60 px-3 py-2.5">
          {version.fournisseurs.length === 0 ? (
            <p className="text-km-label text-km-faint">
              Aucun fournisseur n'a encore été consulté sur cette version.
            </p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {version.fournisseurs.map((f) => (
                <li key={f.id} className="flex items-center gap-2">
                  <span className="min-w-0 flex-1 truncate text-km-body font-semibold text-km-text">
                    {f.fournisseur_nom}
                  </span>
                  {/* Un fournisseur à outil en ligne n'attend aucun mail : Erwan va lire les prix
                      chez lui. Le dire évite de le compter comme une relance à faire. */}
                  {f.mode_consultation === 'OUTIL_EN_LIGNE' && (
                    <span className="shrink-0 text-km-tiny font-bold uppercase tracking-[0.05em] text-km-blue">
                      outil en ligne
                    </span>
                  )}
                  <PastilleStatutConsultation
                    statutCode={f.statut_code}
                    statutLibelle={f.statut_libelle}
                    modeConsultation={f.mode_consultation}
                    statuts={statuts}
                    onChoisir={(st) => onChangerStatut(f.id, f.fournisseur_nom, st)}
                    peutModifier={statuts.length > 0}
                    nomFournisseur={f.fournisseur_nom}
                    enCours={enEcriture === f.id}
                  />
                </li>
              ))}
            </ul>
          )}
          {/* LE LIEN VERS LA FICHE A QUITTÉ CE PIED : le titre de la carte le porte désormais, et
              deux chemins vers le même endroit sur la même carte font hésiter au lieu d'aider.

              LE STATUT, LUI, SE CHANGE SUR LA FICHE ET PAS ICI. Le poser demanderait de recopier la
              mutation, ses cinq statuts et sa règle « outil en ligne n'a pas d'envoi » — soit une
              seconde implémentation d'un geste qui en a déjà une, à un clic d'ici. */}
          {version.nb_fournisseurs > 0 && (
            <p className="mt-2.5 border-t border-km-line-soft pt-2 text-km-tiny text-km-faint">
              {repondu} réponse{repondu > 1 ? 's' : ''} sur {version.nb_fournisseurs}
              {version.nb_refusees > 0 && `, dont ${version.nb_refusees} refus`}
            </p>
          )}
        </div>
      )}
    </article>
  )
}
