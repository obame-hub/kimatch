import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { CalendarDays, ChevronRight } from 'lucide-react'
import { journeeDuPricing, calendrierDeProduction, type ActionJournee, type Urgence } from '@/lib/journeePricing'
import type { VersionPricing } from '@/lib/data/pricingVersions'
import type { ContratPricing } from '@/lib/data/pricingContrats'
import { cn } from '@/lib/utils'
import {
  BoutonEcrire,
  BoutonStatut,
  SelecteurDestinataire,
  objetDuGeste,
  type DemandeEnvoi,
} from '@/components/pricing/GestesJournee'
import { CODES_STATUT_CONSULTATION_PROPOSES, useChangerStatutConsultation } from '@/lib/data/recommandations'
import { useReferenceTable } from '@/lib/data/referenceTables'
import { useUpdateContratPartiel } from '@/lib/data/contrats'

/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * MA JOURNÉE — CE QU'ERWAN DOIT FAIRE, DANS L'ORDRE
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * William, 18/09/2026, après avoir vu les trois directions : « garde ce qui existe actuellement, et
 * implémente en plus la maquette A comme une option d'affichage — on verra à l'utilisation ce qui
 * est le plus pratique pour Erwan. »
 *
 * D'où un écran qui s'ajoute et ne remplace rien. Le tableau par versions reste l'autre onglet.
 *
 * ══ POURQUOI UNE LISTE ET NON UN TABLEAU ══
 *
 * Le tableau par versions montre l'ÉTAT du portefeuille ; cette page montre l'ORDRE DES GESTES. Ce
 * ne sont pas deux présentations de la même chose : une version « En construction » ne dit pas s'il
 * faut écrire maintenant, relever des prix cet après-midi ou ne rien faire avant lundi. La réponse
 * dépend du mode de réponse de chaque fournisseur, de l'heure qu'il est et de jours ouvrés — c'est
 * ce que `journeePricing.ts` calcule, et que vingt-quatre tests verrouillent.
 *
 * ══ LES SECTIONS SUIVENT LE MOMENT, PAS L'OBJET ══
 *
 * Une relance de contrat en retard voisine avec une relance d'offre en retard : elles se font dans
 * la même minute. Les ranger par objet — les offres puis les contrats — obligerait à balayer deux
 * listes pour savoir par quoi commencer, ce qui est précisément la question.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */

const SECTIONS: { cle: Urgence; titre: string; phrase: string; pastille: string }[] = [
  { cle: 'retard', titre: 'En retard', phrase: 'à traiter avant tout le reste', pastille: 'bg-km-red text-white' },
  { cle: 'aujourdhui', titre: "Aujourd'hui", phrase: 'échéance du jour', pastille: 'bg-km-amber text-white' },
  { cle: 'a_lancer', titre: 'À lancer', phrase: 'la demande part le jour de la création', pastille: 'bg-km-text text-white' },
]

const FILET: Record<Urgence, string> = {
  retard: 'border-l-[3px] border-l-km-red',
  aujourdhui: 'border-l-[3px] border-l-km-amber',
  a_lancer: 'border-l-[3px] border-l-km-text',
}

/** Ce que le geste demande, en deux mots, pour la pastille de droite. */
const ETIQUETTE: Record<string, { mot: string; ton: string }> = {
  ECRIRE_DEMANDE: { mot: 'Mail', ton: 'border-km-blue/30 bg-km-blue-soft text-km-blue' },
  SAISIR_TRADEO: { mot: 'Tradéo', ton: 'border-km-violet/30 bg-km-violet/10 text-km-violet' },
  RELEVER_PRIX: { mot: 'À relever', ton: 'border-km-green-line bg-km-green-soft text-km-green' },
  RELANCER_CONFIRMATION: { mot: 'Relance', ton: 'border-km-red-line bg-km-red-soft text-km-red' },
  RELANCER_OFFRE: { mot: 'Relance', ton: 'border-km-red-line bg-km-red-soft text-km-red' },
  EDITER_PROPOSITION: { mot: 'Proposition', ton: 'border-km-green-line bg-km-green-soft text-km-green' },
  DEMANDER_CONTRAT: { mot: 'Contrat', ton: 'border-km-violet/30 bg-km-violet/10 text-km-violet' },
  RELANCER_CONTRAT: { mot: 'Contrat', ton: 'border-km-red-line bg-km-red-soft text-km-red' },
  TRANSMETTRE_CONTRAT: { mot: 'Contrat signé', ton: 'border-km-green-line bg-km-green-soft text-km-green' },
}

export function MaJournee({
  versions,
  contrats,
  chargement,
  signaler,
}: {
  versions: VersionPricing[]
  contrats: ContratPricing[]
  chargement: boolean
  signaler: (message: string) => void
}) {
  const { data: statutsConsultation } = useReferenceTable('statuts_consultations_fournisseurs')
  const { data: statutsAvancement } = useReferenceTable('statuts_contrats_avancement')
  const changerStatut = useChangerStatutConsultation()
  const majContrat = useUpdateContratPartiel()
  const [envoi, setEnvoi] = useState<DemandeEnvoi | null>(null)
  const [enEcriture, setEnEcriture] = useState<string | null>(null)

  /* LES DEUX RÉFÉRENTIELS SONT RÉSOLUS UNE FOIS, par code. Les tables de référence ont un repli local
     dont les identifiants ne sont pas des UUID : écrire avec l'un d'eux échoue en base tout en
     paraissant réussir à l'écran, d'où le refus explicite plus bas. */
  const statutConsultation = (code: string) =>
    (statutsConsultation ?? []).find(
      (st) => st.code === code && (CODES_STATUT_CONSULTATION_PROPOSES as readonly string[]).includes(st.code ?? ''),
    )
  const avancementContrat = (code: string) => (statutsAvancement ?? []).find((st) => st.code === code)

  async function poserStatutFournisseur(action: ActionJournee, code: string, mot: string) {
    const statut = statutConsultation(code)
    if (!action.consultationId || !statut || !/^[0-9a-f-]{36}$/i.test(statut.id)) {
      signaler('Statuts indisponibles — rechargez la page avant de poser un statut.')
      return
    }
    setEnEcriture(action.id)
    try {
      await changerStatut.mutateAsync({
        optimisationFournisseurId: action.consultationId,
        statutId: statut.id,
        statutCode: statut.code ?? code,
      })
      signaler(`✓ ${action.fournisseurNom ?? 'Fournisseur'} : ${mot}`)
    } catch (e) {
      signaler(`Erreur : ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setEnEcriture(null)
    }
  }

  async function poserAvancementContrat(action: ActionJournee, code: string, mot: string) {
    const statut = avancementContrat(code)
    if (!action.contratId || !statut || !/^[0-9a-f-]{36}$/i.test(statut.id)) {
      signaler('Statuts de contrat indisponibles — rechargez la page.')
      return
    }
    setEnEcriture(action.id)
    try {
      await majContrat.mutateAsync({ id: action.contratId, patch: { statut_avancement_id: statut.id } })
      signaler(`✓ Contrat : ${mot}`)
    } catch (e) {
      signaler(`Erreur : ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setEnEcriture(null)
    }
  }

  /**
   * Ouvrir le sélecteur de destinataire, en emportant ce qu'il faudra faire après.
   *
   * SANS COMPTE FOURNISSEUR, PAS DE SÉLECTEUR : la consultation ne porte pas toujours un compte —
   * une reprise Salesforce peut avoir perdu le lien. On le dit plutôt que d'ouvrir une liste vide.
   */
  function ouvrirEnvoi(action: ActionJournee, apresEnvoi?: () => Promise<void> | void) {
    if (!action.fournisseurCompteId) {
      signaler('Ce fournisseur n’est rattaché à aucun compte — impossible de trouver un destinataire.')
      return
    }
    setEnvoi({
      compteId: action.fournisseurCompteId,
      fournisseurNom: action.fournisseurNom ?? 'ce fournisseur',
      objet: objetDuGeste(action),
      recommandationId: action.lien.startsWith('/recommandations/') ? action.lien.split('/').pop() : undefined,
      contratId: action.contratId,
      apresEnvoi,
    })
  }
  /* L'HEURE FAIT PARTIE DU CALCUL — la relance du jour J s'ouvre à 15 h. On la fige au rendu plutôt
     que de la relire à chaque appel : une liste qui se réordonne toute seule pendant qu'on la lit
     ferait manquer une ligne. Un rechargement suffit à la rafraîchir. */
  const maintenant = useMemo(() => new Date(), [])
  const actions = useMemo(
    () => journeeDuPricing(versions, contrats, maintenant),
    [versions, contrats, maintenant],
  )

  const parUrgence = useMemo(() => {
    const m = new Map<Urgence, ActionJournee[]>()
    for (const s of SECTIONS) m.set(s.cle, [])
    for (const a of actions) m.get(a.urgence)?.push(a)
    return m
  }, [actions])

  if (chargement) return <p className="text-km-body text-km-faint">Chargement…</p>

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_330px]">
      <div className="flex min-w-0 flex-col gap-4">
        {actions.length === 0 ? (
          <div className="rounded-km-lg border border-km-green-line bg-km-green-tint px-4 py-5">
            <p className="text-km-name font-bold text-km-green">Rien à faire pour l'instant.</p>
            <p className="mt-1 text-km-body text-km-muted">
              Toutes les demandes sont parties et aucune échéance n'est atteinte. Le calendrier dit ce
              qui arrive.
            </p>
          </div>
        ) : (
          SECTIONS.map((section) => {
            const lignes = parUrgence.get(section.cle) ?? []
            if (lignes.length === 0) return null
            return (
              <section key={section.cle} className="flex flex-col gap-2">
                <div className="flex items-center gap-2.5">
                  <span className={cn('rounded-km-pill px-2.5 py-[3px] text-km-tiny font-extrabold uppercase tracking-[0.07em]', section.pastille)}>
                    {section.titre}
                  </span>
                  <span className="text-km-label text-km-muted">{section.phrase}</span>
                  <span className="text-km-label font-bold tabular-nums text-km-faint">{lignes.length}</span>
                  <span className="h-px flex-1 bg-km-line" />
                </div>
                {lignes.map((a) => (
                  <LigneAction
                    key={a.id}
                    action={a}
                    enEcriture={enEcriture === a.id}
                    onEcrire={ouvrirEnvoi}
                    onStatutFournisseur={poserStatutFournisseur}
                    onAvancementContrat={poserAvancementContrat}
                  />
                ))}
              </section>
            )
          })
        )}
      </div>

      <CalendrierProduction versions={versions} maintenant={maintenant} />

      {envoi && <SelecteurDestinataire demande={envoi} onFermer={() => setEnvoi(null)} signaler={signaler} />}
    </div>
  )
}

function LigneAction({
  action,
  enEcriture,
  onEcrire,
  onStatutFournisseur,
  onAvancementContrat,
}: {
  action: ActionJournee
  enEcriture: boolean
  onEcrire: (a: ActionJournee, apres?: () => Promise<void> | void) => void
  onStatutFournisseur: (a: ActionJournee, code: string, mot: string) => Promise<void>
  onAvancementContrat: (a: ActionJournee, code: string, mot: string) => Promise<void>
}) {
  const e = ETIQUETTE[action.geste]
  return (
    <article className={cn('flex flex-wrap items-center gap-3 rounded-km-md border border-km-line bg-white px-4 py-3', FILET[action.urgence])}>
      <Link to={action.lien} className="min-w-0 flex-1 rounded-km-sm">
        <span className="block text-km-name font-bold leading-tight text-km-text hover:text-km-green">
          {action.titre}
        </span>
        <span className="mt-0.5 block truncate text-km-label text-km-muted">{action.contexte}</span>
      </Link>
      {e && (
        <span className={cn('shrink-0 rounded-km-pill border px-2 py-[2px] text-km-label font-bold', e.ton)}>
          {e.mot}
        </span>
      )}

      {/* ══ CHAQUE GESTE PORTE SON BOUTON, ET CELUI QUI L'ANNULE ══

          Un geste, un bouton principal — et quand c'est utile, le raccourci qui ferme la ligne
          autrement. Une relance d'offre s'accompagne de « Proposition reçue » parce que c'est le
          cas de William : « s'il l'a reçue et qu'il ne l'a pas vue et que la relance est proposée,
          Erwan peut simplement passer Proposition reçue, ce qui annule la relance ». */}
      <div className="flex shrink-0 flex-wrap items-center gap-1.5">
        {action.geste === 'ECRIRE_DEMANDE' && action.consultationId && (
          <BoutonEcrire
            libelle="Écrire au fournisseur"
            onOuvrir={() => onEcrire(action, () => onStatutFournisseur(action, 'ENVOYEE', 'demande envoyée'))}
          />
        )}
        {action.geste === 'SAISIR_TRADEO' && (
          /* Rien ne part par mail : la demande se saisit sur la plateforme du partenaire, et le
             bouton consigne qu'elle est faite. */
          <BoutonStatut
            libelle="Demande saisie"
            ton="ambre"
            enCours={enEcriture}
            onCliquer={() => void onStatutFournisseur(action, 'ENVOYEE', 'demande envoyée')}
          />
        )}
        {action.geste === 'RELEVER_PRIX' && (
          <BoutonStatut
            libelle="Prix relevés"
            enCours={enEcriture}
            onCliquer={() => void onStatutFournisseur(action, 'DISPONIBLE', 'proposition reçue')}
          />
        )}
        {action.geste === 'RELANCER_CONFIRMATION' && (
          <>
            <BoutonEcrire libelle="Écrire la relance" ton="rouge" onOuvrir={() => onEcrire(action)} />
            <BoutonStatut
              libelle="Acceptée"
              ton="ambre"
              enCours={enEcriture}
              onCliquer={() => void onStatutFournisseur(action, 'ACCEPTEE', 'demande acceptée')}
            />
          </>
        )}
        {action.geste === 'RELANCER_OFFRE' && (
          <>
            <BoutonEcrire libelle="Écrire la relance" ton="rouge" onOuvrir={() => onEcrire(action)} />
            <BoutonStatut
              libelle="Reçue"
              enCours={enEcriture}
              onCliquer={() => void onStatutFournisseur(action, 'DISPONIBLE', 'proposition reçue')}
            />
          </>
        )}
        {action.geste === 'EDITER_PROPOSITION' && (
          /* La proposition s'édite hors de Kimatch puis se dépose au pied de la version : le bouton
             mène là où se trouve la zone de dépôt, et c'est ce dépôt qui rend la version Disponible. */
          <Link
            to={action.lien}
            className="inline-flex h-[30px] shrink-0 items-center rounded-km bg-km-green px-3 text-km-body font-bold text-white hover:brightness-110"
          >
            Joindre la proposition
          </Link>
        )}
        {action.geste === 'DEMANDER_CONTRAT' && (
          <BoutonEcrire
            libelle="Demander au fournisseur"
            onOuvrir={() => onEcrire(action, () => onAvancementContrat(action, 'DEMANDE', 'demandé'))}
          />
        )}
        {action.geste === 'RELANCER_CONTRAT' && (
          <>
            <BoutonEcrire libelle="Écrire la relance" ton="rouge" onOuvrir={() => onEcrire(action)} />
            <BoutonStatut
              libelle="Réceptionné"
              enCours={enEcriture}
              onCliquer={() => void onAvancementContrat(action, 'RECEPTIONNE', 'réceptionné')}
            />
          </>
        )}
        {action.geste === 'TRANSMETTRE_CONTRAT' && (
          /* AUCUN STATUT NE SUIT : « c'est à ce moment que le périmètre d'Erwan s'arrête, car c'est
             ensuite à un manager de valider le contrat ». Le geste est l'envoi, rien d'autre. */
          <BoutonEcrire libelle="Envoyer au fournisseur" ton="vert" onOuvrir={() => onEcrire(action)} />
        )}
      </div>
    </article>
  )
}

/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * LE CALENDRIER DE PRODUCTION — UN AGENDA, PAS UNE GRILLE
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * William, 18/09/2026 : « un calendrier avec pour chaque jour le nombre et le détail des offres qui
 * sont attendues ce jour ». Puis, devant la grille mensuelle : « je n'aime pas ce nouveau modèle,
 * il faut qu'il soit plus grand verticalement et plus clair. Je veux quelque chose de plus tranché
 * graphiquement pour bien identifier en un coup d'œil les prochaines échéances, ce qui va se passer
 * dans les prochains jours. »
 *
 * ══ LA GRILLE MENSUELLE RÉPONDAIT À UNE AUTRE QUESTION ══
 *
 * Un mois en sept colonnes sert à SITUER une date — « le 14, c'est un lundi ». Ce n'est pas la
 * question ici : Erwan veut savoir ce qui arrive, dans l'ordre où ça arrive. Une grille l'obligeait
 * à reconstruire cette suite lui-même en lisant de gauche à droite et de haut en bas, en sautant
 * les cases vides — et les cases, faute de place, ne pouvaient porter qu'un chiffre.
 *
 * ══ UN AGENDA VERTICAL, UNE LIGNE PAR JOUR OUVRÉ ══
 *
 * L'ordre du temps devient l'ordre de lecture. Chaque ligne a la place d'écrire CE QUI est attendu,
 * pas seulement combien — c'est le « détail » que William demandait dès la première fois, et qu'une
 * case de 40 px ne pouvait pas contenir.
 *
 * ══ « TRANCHÉ » VEUT DIRE : LES JOURS CHARGÉS SONT PLEINS, LES AUTRES SONT VIDES ══
 *
 * Un jour qui attend des offres porte une tuile de date PLEINE et un fond teinté sur toute la
 * ligne ; un jour sans rien n'est qu'un chiffre gris sur du blanc. Le contraste ne joue pas sur une
 * nuance mais sur la présence ou l'absence de matière : de loin, on voit des blocs.
 *
 * Trois couleurs et pas une de plus — ambre ce qui est attendu, vert ce qui est complet, rouge ce
 * qui aurait dû arriver. L'ambre s'assombrit à partir de quatre offres : une journée chargée se
 * repère avant même qu'on lise le nombre.
 *
 * LES WEEK-ENDS NE SONT PAS DES LIGNES. Ni les commerciaux ni les fournisseurs n'y travaillent
 * (William) : ils deviennent un filet entre deux semaines. SAUF s'ils portent une version — ce qui
 * est alors une erreur de saisie, et la ligne rouge la signale au lieu de la cacher.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */
function CalendrierProduction({ versions, maintenant }: { versions: VersionPricing[]; maintenant: Date }) {
  const [portee, setPortee] = useState(15)
  const [jourOuvert, setJourOuvert] = useState<string | null>(null)

  const calendrier = useMemo(() => calendrierDeProduction(versions), [versions])

  const cleDe = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  const aujourdhui = cleDe(maintenant)

  /**
   * Les jours à montrer : à partir d'aujourd'hui, les jours ouvrés — plus tout week-end qui porte
   * une échéance, parce qu'une livraison un samedi est une anomalie qu'il vaut mieux voir.
   *
   * LE DÉBUT DE SEMAINE EST MARQUÉ pour qu'on lise « la semaine prochaine » sans compter les jours :
   * le premier lundi rencontré ouvre un bloc.
   */
  const lignes = useMemo(() => {
    const out: { cle: string; date: Date; nouvelleSemaine: boolean; weekend: boolean }[] = []
    const curseur = new Date(maintenant.getFullYear(), maintenant.getMonth(), maintenant.getDate())
    for (let i = 0; i < portee; i += 1) {
      const d = new Date(curseur)
      d.setDate(d.getDate() + i)
      const cle = cleDe(d)
      const weekend = d.getDay() === 0 || d.getDay() === 6
      if (weekend && !calendrier.has(cle)) continue
      out.push({ cle, date: d, nouvelleSemaine: d.getDay() === 1 && i > 0, weekend })
    }
    return out
  }, [maintenant, portee, calendrier])

  /* Ce qui est en retard n'apparaît plus dans l'agenda — il commence aujourd'hui — mais il ne doit
     pas disparaître pour autant : la liste de gauche le porte, et l'en-tête le rappelle en un mot. */
  const enRetard = [...calendrier.values()].filter((j) => j.cle < aujourdhui && j.offresAttendues > 0)
  const totalRetard = enRetard.reduce((n, j) => n + j.offresAttendues, 0)
  const totalAVenir = lignes.reduce((n, l) => n + (calendrier.get(l.cle)?.offresAttendues ?? 0), 0)

  return (
    <aside className="flex flex-col gap-2.5">
      <div className="overflow-hidden rounded-km-lg border border-km-line bg-white">
        <header className="border-b border-km-line bg-gradient-to-b from-km-soft to-white px-4 py-3">
          <div className="flex items-center gap-2">
            <CalendarDays className="h-3.5 w-3.5 shrink-0 text-km-muted" />
            <span className="text-km-body font-extrabold text-km-text">Calendrier de production</span>
          </div>
          <p className="mt-1 text-km-label text-km-muted">
            {totalAVenir === 0
              ? `Rien d'attendu d'ici ${portee} jours.`
              : <><b className="text-km-text">{totalAVenir} offre{totalAVenir > 1 ? 's' : ''}</b> attendue{totalAVenir > 1 ? 's' : ''} d'ici {portee} jours.</>}
            {totalRetard > 0 && (
              <span className="text-km-red"> {totalRetard} en retard.</span>
            )}
          </p>
        </header>

        <div className="flex flex-col">
          {lignes.map((l) => {
            const duJour = calendrier.get(l.cle)
            const nb = duJour?.offresAttendues ?? 0
            const estAujourdhui = l.cle === aujourdhui
            const ouvert = jourOuvert === l.cle
            const charge = nb > 0
            const complet = duJour != null && nb === 0
            const lourd = nb >= 4

            return (
              <div key={l.cle} className={cn(l.nouvelleSemaine && 'border-t-[3px] border-t-km-line')}>
                <button
                  type="button"
                  disabled={!duJour}
                  onClick={() => setJourOuvert(ouvert ? null : l.cle)}
                  aria-expanded={ouvert}
                  className={cn(
                    'flex w-full items-center gap-3 border-b border-km-line-soft px-3 py-2.5 text-left transition-colors',
                    charge && !l.weekend && (lourd ? 'bg-km-amber-soft' : 'bg-km-amber-soft/50'),
                    charge && l.weekend && 'bg-km-red-soft',
                    complet && 'bg-km-green-tint/60',
                    !duJour && 'hover:bg-km-bg',
                    ouvert && 'bg-km-green-soft',
                  )}
                >
                  {/* LA TUILE DE DATE : pleine quand la journée porte quelque chose, creuse sinon.
                      C'est elle qui fait le contraste — de loin, on ne voit que les tuiles pleines. */}
                  <span
                    className={cn(
                      'flex h-[44px] w-[44px] shrink-0 flex-col items-center justify-center rounded-km-md border',
                      estAujourdhui && 'border-km-text bg-km-text text-white',
                      !estAujourdhui && charge && !l.weekend && (lourd
                        ? 'border-transparent bg-km-amber text-white'
                        : 'border-km-amber/45 bg-white text-km-amber'),
                      !estAujourdhui && charge && l.weekend && 'border-transparent bg-km-red text-white',
                      !estAujourdhui && complet && 'border-km-green-line bg-white text-km-green',
                      !estAujourdhui && !duJour && 'border-km-line bg-white text-km-faint',
                    )}
                  >
                    <span className="text-km-micro font-extrabold uppercase leading-none tracking-[0.06em] opacity-80">
                      {l.date.toLocaleDateString('fr-FR', { weekday: 'short' }).replace('.', '')}
                    </span>
                    <span className="text-km-metric font-extrabold leading-none tabular-nums">
                      {l.date.getDate()}
                    </span>
                  </span>

                  <span className="min-w-0 flex-1">
                    {duJour ? (
                      <>
                        <span className={cn(
                          'block text-km-body font-extrabold leading-tight',
                          charge && !l.weekend && 'text-km-amber',
                          charge && l.weekend && 'text-km-red',
                          complet && 'text-km-green',
                        )}>
                          {charge
                            ? `${nb} offre${nb > 1 ? 's' : ''} attendue${nb > 1 ? 's' : ''}`
                            : 'Tout est arrivé'}
                        </span>
                        <span className="mt-0.5 block truncate text-km-label text-km-muted">
                          {duJour.versions.slice(0, 2).map((v) => v.recommandation_nom).join(' · ')}
                          {duJour.versions.length > 2 && ` +${duJour.versions.length - 2}`}
                        </span>
                      </>
                    ) : (
                      <span className="block text-km-body text-km-faint">
                        {estAujourdhui ? "Rien d'attendu aujourd'hui" : 'Rien d’attendu'}
                      </span>
                    )}
                  </span>

                  {duJour && (
                    <ChevronRight
                      className={cn('h-3.5 w-3.5 shrink-0 text-km-faint transition-transform', ouvert && 'rotate-90')}
                    />
                  )}
                </button>

                {ouvert && duJour && (
                  <ul className="animate-km-fade-slide flex flex-col border-b border-km-line-soft bg-km-bg/60">
                    {duJour.versions.map((v) => (
                      <li key={v.version_id} className="border-b border-km-line-soft last:border-0">
                        <Link
                          to={`/recommandations/${v.recommandation_id}`}
                          className="flex items-center gap-2.5 py-2 pl-[62px] pr-3 hover:bg-white"
                        >
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-km-body font-bold text-km-text">
                              {v.recommandation_nom}
                            </span>
                            <span className="block text-km-label text-km-faint">
                              V{v.numero_version ?? '?'} · {v.nb_recues}/{v.nb_fournisseurs} reçue{v.nb_recues > 1 ? 's' : ''}
                            </span>
                          </span>
                          {v.nb_attendus > 0 && (
                            <span className="shrink-0 rounded-km-pill bg-km-amber px-1.5 py-[2px] text-km-tiny font-extrabold tabular-nums text-white">
                              {v.nb_attendus}
                            </span>
                          )}
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )
          })}

          <button
            type="button"
            onClick={() => setPortee((p) => p + 15)}
            className="px-3 py-2.5 text-km-label font-bold text-km-green hover:bg-km-bg"
          >
            Voir quinze jours de plus →
          </button>
        </div>
      </div>
    </aside>
  )
}
