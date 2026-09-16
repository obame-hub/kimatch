import { useMemo, useState } from 'react'
import { ArrowRight, GripVertical, Phone, Zap } from 'lucide-react'
import { Topbar } from '@/components/layout/Topbar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { EntityLink } from '@/components/ui/entity-link'
import { cn } from '@/lib/utils'
import { appelerNumero } from '@/lib/telephonie'
import { SprintCockpit } from '@/components/cockpit/SprintCockpit'
import { CockpitEnConstruction } from '@/components/cockpit/OuvertureCockpit'
import { cockpitOuvert } from '@/lib/cockpitOuvert'
import {
  LIBELLE_CRITERE,
  LIBELLE_SOURCE,
  useAjouterAuPipe,
  useCompleterPipe,
  usePipeDuJour,
  useReordonnerPipe,
  useSortirDuPipe,
  useVivier,
  type LignePipe,
  type SourcePipe,
} from '@/lib/data/cockpit'

/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * COCKPIT — TROIS TEMPS, UNE SEULE PAGE
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * William, 15/09/2026 : « toutes ces infos dans une seule page nommée Cockpit dans la barre de
 * navigation », et un design « qui favorise la concentration des équipes […] les équipes doivent
 * avoir l'impression de sortir de l'outil et d'entrer dans une période de prospection ».
 *
 * D'où trois temps, et une escalade délibérée de l'immersion :
 *
 *   LE SEUIL   ce qui attend, avant d'entrer. Le rail de gauche est encore là : on n'a rien
 *              commencé, on décide.
 *   LE PLAN    la surface de travail. Le rail est là aussi — on peut vouloir ouvrir une fiche.
 *   LE SPRINT  plein écran, par-dessus tout. Le rail disparaît. On y entre, on n'y navigue pas.
 *
 * C'EST LA DISPARITION PROGRESSIVE DU MOBILIER qui crée le sentiment de sortir de l'outil, et non
 * une couleur ni une animation. Un écran qui aurait tout caché dès le seuil n'aurait plus rien à
 * retirer au moment où la concentration compte vraiment.
 *
 * ══ AUCUNE RÈGLE MÉTIER ICI ══
 *
 * Les seaux, les filtres, le périmètre, le plafond, l'ordre : tout est en base (migrations
 * 20260915090000 à 20260915093000). Cette page affiche et déclenche.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */

type Temps = 'seuil' | 'plan'
type Zone = 'pipe' | 'vivier'

/**
 * Les filtres du plan.
 *
 * ILS PORTENT LES MÊMES REGROUPEMENTS QUE LES CARTES DU SEUIL, et c'est ce qui rend le passage de
 * l'un à l'autre lisible : le 19 lu sur la carte est le 19 de la puce, et la table qui s'ouvre en
 * contient 19. Deux découpages différents auraient fait douter du chiffre.
 */
const FILTRES: { cle: SourcePipe; libelle: string; sources: SourcePipe[] }[] = [
  { cle: 'INBOUND', libelle: 'Leads entrants', sources: ['INBOUND', 'INBOUND_LIVE'] },
  { cle: 'RAPPEL_HEURE', libelle: 'Rappels à l’heure', sources: ['RAPPEL_HEURE'] },
  { cle: 'RAPPEL_JOUR', libelle: 'Rappels sans heure', sources: ['RAPPEL_JOUR'] },
  { cle: 'VIVIER', libelle: 'À transformer', sources: ['VIVIER', 'PISTE_FROIDE', 'OPPORTUNITE_DORMANTE', 'AJOUT_MANUEL'] },
]

/** Les quatre nombres du seuil, et le seau que chacun désigne. */
const SEAUX: { cle: SourcePipe[]; titre: string; chaud?: boolean }[] = [
  { cle: ['INBOUND', 'INBOUND_LIVE'], titre: 'Leads entrants', chaud: true },
  { cle: ['RAPPEL_HEURE'], titre: 'Rappels à l’heure' },
  { cle: ['RAPPEL_JOUR'], titre: 'Rappels sans heure' },
  { cle: ['VIVIER', 'PISTE_FROIDE', 'OPPORTUNITE_DORMANTE', 'AJOUT_MANUEL'], titre: 'À transformer' },
]

export default function Cockpit() {
  /**
   * LE VERROU EST LA PREMIÈRE LIGNE DE LA PAGE, avant tout crochet.
   *
   * Un retour anticipé placé après `usePipeDuJour` appellerait quand même
   * `construire_pipe_du_jour` — donc écrirait un snapshot en production pour un écran que
   * personne ne verra. Ici, rien n'est demandé à la base tant que le Cockpit est fermé.
   *
   * `cockpitOuvert` est une constante de module, pas un état : sa valeur ne change jamais pendant
   * la vie du composant, et les règles des crochets sont donc respectées.
   */
  if (!cockpitOuvert) return <CockpitEnConstruction />

  return <CockpitOuvert />
}

function CockpitOuvert() {
  const [temps, setTemps] = useState<Temps>('seuil')
  const [zone, setZone] = useState<Zone>('pipe')
  const [enSprint, setEnSprint] = useState(false)
  const [choisie, setChoisie] = useState<string | null>(null)
  const [cochees, setCochees] = useState<Set<string>>(new Set())
  const [tire, setTire] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  /** `null` veut dire « tout le pipe ». La valeur est la première source du seau choisi. */
  const [filtre, setFiltre] = useState<SourcePipe | null>(null)

  const { data: pipe, isLoading } = usePipeDuJour()
  const { data: vivier } = useVivier()
  const completer = useCompleterPipe()
  const ajouter = useAjouterAuPipe()
  const sortir = useSortirDuPipe()
  const reordonner = useReordonnerPipe()

  const lignes = pipe?.lignes ?? []
  /**
   * Ce que la table montre, et ce que le sprint parcourra.
   *
   * LE SPRINT SUIT LE FILTRE, et le bouton annonce son effectif. Sinon un conseiller qui a filtré
   * sur ses quatre leads entrants lancerait un sprint de soixante sans comprendre pourquoi.
   */
  const affichees = filtre ? lignes.filter((l) => FILTRES.find((f) => f.cle === filtre)?.sources.includes(l.source)) : lignes
  /* `?? []` produirait un tableau neuf à chaque rendu, donc un `useMemo` qui recalcule toujours. */
  const lignesVivier = useMemo(() => vivier?.lignes ?? [], [vivier])

  /* UNE SEULE DES DEUX SOURCES SUFFIT À LE DIRE. Les fonctions du pipe et la vue du vivier
     arrivent par des migrations distinctes : n'annoncer que l'absence du pipe laisserait un vivier
     vide sans explication, ce qui est exactement la question qu'on s'est posée le 15/09. */
  const enAttenteDeMigration = pipe?.pretMigration === false || vivier?.pretMigration === false
  const laFiche = affichees.find((l) => l.ligne_id === choisie) ?? affichees[0]

  /* Les héros du vivier : de l'argent et des alarmes, pas des effectifs de lignes. */
  const heros = useMemo(() => {
    const mwh = lignesVivier.reduce((s, l) => s + (l.mwh_annuels ?? 0), 0)
    const depassees = lignesVivier.filter((l) => l.echeance_depassee).length
    const sansPerimetre = lignesVivier.filter((l) => l.critere === 'SANS_PERIMETRE').length
    const plusLourd = lignesVivier.reduce<typeof lignesVivier[number] | null>(
      (p, l) => (!p || (l.mwh_annuels ?? 0) > (p.mwh_annuels ?? 0) ? l : p),
      null,
    )
    return { mwh, depassees, sansPerimetre, plusLourd, total: lignesVivier.length }
  }, [lignesVivier])

  /**
   * ══ LA FRISE DES HORIZONS ══
   *
   * UN SEUL TON, DU PLUS PROCHE AU PLUS LOINTAIN. Le validateur de palette a tranché la première
   * version : « dépassée » en rouge à côté de « moins de 6 mois » en ambre foncé donnaient un écart
   * perceptif de 1,4 en deutéranopie — deux barres voisines indistinguables. « Dépassée » est donc
   * sortie de la frise : ce n'est pas un point du calendrier, c'est une alarme, et elle a sa carte.
   *
   * ET « ÉCHÉANCE INCONNUE » N'EST PAS UN HORIZON PLUS LOINTAIN, c'est une ignorance. D'où des
   * hachures et non une teinte du dégradé — on ne la place pas sur une échelle de temps.
   *
   * L'effectif est écrit au bout de chaque barre : la couleur ne porte jamais l'information seule.
   */
  const horizons = useMemo(() => {
    const aujourdhui = new Date()
    aujourdhui.setHours(0, 0, 0, 0)
    const mois = (n: number) => {
      const d = new Date(aujourdhui)
      d.setMonth(d.getMonth() + n)
      return d
    }
    const seuils = [mois(6), mois(12), mois(18)]
    const cases = [0, 0, 0, 0] // <6, 6-12, 12-18, inconnue

    for (const l of lignesVivier) {
      if (!l.echeance_min) { cases[3] += 1; continue }
      const d = new Date(l.echeance_min)
      if (d < aujourdhui) continue // dépassée : dans la carte d'alarme, pas dans la frise
      if (d <= seuils[0]) cases[0] += 1
      else if (d <= seuils[1]) cases[1] += 1
      else if (d <= seuils[2]) cases[2] += 1
    }

    return [
      { lab: 'Moins de 6 mois', n: cases[0], ton: 'rgb(var(--km-amber))' },
      { lab: '6 à 12 mois', n: cases[1], ton: 'rgb(var(--km-amber) / 0.62)' },
      { lab: '12 à 18 mois', n: cases[2], ton: 'rgb(var(--km-amber) / 0.34)' },
      { lab: 'Échéance inconnue', n: cases[3], ton: null },
    ]
  }, [lignesVivier])

  function signaler(m: string) {
    setMessage(m)
    window.setTimeout(() => setMessage(null), 4000)
  }

  function compte(cles: SourcePipe[]): number {
    return lignes.filter((l) => cles.includes(l.source)).length
  }

  /**
   * La phrase sous chaque chiffre du seuil.
   *
   * ELLE SE CALCULE, ELLE NE S'ÉCRIT PAS. « Le plus ancien attend depuis hier » doit rester vrai
   * demain : une phrase figée dans le code deviendrait fausse au premier lead traité, et personne
   * ne s'en apercevrait.
   */
  function detailDuSeau(cles: SourcePipe[]): string {
    const dedans = lignes.filter((l) => cles.includes(l.source))
    if (dedans.length === 0) return 'Rien à ce titre aujourd’hui'

    if (cles.includes('INBOUND')) return 'Priorité absolue — personne ne les a encore appelés'

    if (cles.includes('RAPPEL_HEURE')) {
      const heures = dedans.map((l) => l.heure).filter(Boolean).sort() as string[]
      return heures.length > 1
        ? `Premier à ${heures[0]}, dernier à ${heures[heures.length - 1]}`
        : `À ${heures[0] ?? 'une heure inconnue'}`
    }

    if (cles.includes('RAPPEL_JOUR')) {
      const retard = dedans.filter((l) => l.en_retard).length
      return retard > 0 ? `Dont ${retard} en retard depuis hier ou avant` : 'Tous dus aujourd’hui'
    }

    const duVivier = dedans.filter((l) => l.source === 'VIVIER').length
    const dormantes = dedans.filter((l) => l.source === 'OPPORTUNITE_DORMANTE').length
    const froides = dedans.filter((l) => l.source === 'PISTE_FROIDE').length
    return [
      duVivier > 0 ? `${duVivier} du vivier` : null,
      dormantes > 0 ? `${dormantes} sans tâche` : null,
      froides > 0 ? `${froides} piste${froides > 1 ? 's' : ''} froide${froides > 1 ? 's' : ''}` : null,
    ].filter(Boolean).join(', ')
  }

  async function surCompleter() {
    const n = await completer.mutateAsync(undefined)
    signaler(
      n > 0
        ? `${n} opportunité${n > 1 ? 's' : ''} créée${n > 1 ? 's' : ''} depuis le vivier et ajoutée${n > 1 ? 's' : ''} au pipe.`
        : 'Rien à ajouter : le pipe est plein, ou votre vivier est vide.',
    )
  }

  async function surAjouter() {
    const n = await ajouter.mutateAsync([...cochees])
    setCochees(new Set())
    signaler(`${n} opportunité${n > 1 ? 's' : ''} créée${n > 1 ? 's' : ''} et ajoutée${n > 1 ? 's' : ''} au pipe.`)
    setZone('pipe')
  }

  /* ── LE GLISSER-DÉPOSER : l'ordre est persisté, sinon il ne survivrait pas au rechargement et
        le conseiller le referait chaque matin. ── */
  function surDepot(surId: string) {
    if (!tire || tire === surId) return
    const ordre = lignes.map((l) => l.ligne_id)
    const de = ordre.indexOf(tire)
    const vers = ordre.indexOf(surId)
    if (de < 0 || vers < 0) return
    ordre.splice(de, 1)
    ordre.splice(vers, 0, tire)
    void reordonner.mutateAsync(ordre)
    setTire(null)
  }

  if (enSprint) {
    return (
      <SprintCockpit
        lignes={affichees}
        onSortir={(ligne, motif) => void sortir.mutateAsync({ ligne, motif })}
        onFermer={() => setEnSprint(false)}
      />
    )
  }

  /* ══════════════ LE SEUIL ══════════════ */
  if (temps === 'seuil') {
    return (
      <div className="flex min-h-screen flex-col">
        <Topbar title="Cockpit" />
        {/* LES DEUX DÉGRADÉS DE LA MAQUETTE. Ils ne décorent pas : ils donnent au seuil une
            profondeur que le plan n'a pas, et c'est ce qui fait qu'on sent le changement de lieu
            avant d'avoir lu un mot. */}
        <div
          className="flex flex-1 flex-col justify-center gap-8 bg-km-side px-5 py-12 text-km-side-text sm:px-10"
          style={{
            backgroundImage:
              'radial-gradient(130% 80% at 12% -10%, rgb(var(--km-green) / 0.10) 0%, transparent 46%), radial-gradient(90% 70% at 96% 108%, rgb(var(--km-amber) / 0.10) 0%, transparent 52%)',
          }}
        >
          <div className="flex flex-wrap items-baseline justify-between gap-4">
            <span className="font-mono text-km-label uppercase tracking-[0.3em] text-km-side-muted">
              Cockpit ·{' '}
              {new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}
            </span>
            <span className="font-mono text-km-label uppercase tracking-[0.16em] text-km-side-muted">
              {enAttenteDeMigration
                ? 'En attente des migrations du 15/09'
                : 'Pipe arrêté pour la journée — il ne se rechargera pas'}
            </span>
          </div>

          <h1 className="max-w-[24ch] text-balance font-mono text-[clamp(28px,5.4vw,56px)] font-semibold leading-[0.98] tracking-tight">
            {isLoading ? (
              'On regarde ce qui vous attend…'
            ) : lignes.length === 0 ? (
              'Rien dans la pile. Le vivier, lui, attend.'
            ) : (
              <>
                {lignes.length} action{lignes.length > 1 ? 's' : ''} vous attendent.{' '}
                {compte(['INBOUND', 'INBOUND_LIVE']) > 0 ? (
                  <span className="text-km-green">
                    {compte(['INBOUND', 'INBOUND_LIVE'])} {compte(['INBOUND', 'INBOUND_LIVE']) > 1 ? 'sont chaudes.' : 'est chaude.'}
                  </span>
                ) : null}
              </>
            )}
          </h1>

          {enAttenteDeMigration ? (
            <p className="max-w-[62ch] rounded-km border border-km-amber-line bg-km-amber/10 px-4 py-3 text-km-body text-km-amber">
              <b className="font-semibold">Les quatre migrations du Cockpit ne sont pas encore en base.</b>{' '}
              Les compteurs ci-dessous resteront donc à zéro, et le vivier vide : il n’y a rien à
              lire avant que le SQL soit appliqué. Les fichiers attendent dans
              <span className="font-mono"> supabase/migrations/</span>.
            </p>
          ) : null}

          <div className="grid max-w-[1080px] grid-cols-[repeat(auto-fit,minmax(190px,1fr))] gap-2.5">
            {SEAUX.map((s) => (
              <button
                key={s.titre}
                /* LA CARTE FILTRE, elle ne fait pas que naviguer : on entre dans le plan déjà
                   restreint au seau qu'on vient de lire. Sans ça, le chiffre annonce un travail
                   qu'il faut ensuite retrouver à la main dans soixante lignes. */
                onClick={() => { setFiltre(s.cle[0]); setZone('pipe'); setTemps('plan') }}
                className={cn(
                  'flex flex-col gap-1 rounded-km border border-km-side-line border-t-2 bg-km-side-bas px-4 py-4 text-left transition-colors hover:border-km-side-muted',
                  s.chaud ? 'border-t-km-green' : 'border-t-km-side-line',
                )}
              >
                <span className={cn('font-mono text-km-metric-lg font-medium leading-none tabular-nums', s.chaud ? 'text-km-green' : '')}>
                  {compte(s.cle)}
                </span>
                <span className="text-km-body font-medium">{s.titre}</span>
                {/* LA LIGNE DE DÉTAIL EST LA MOITIÉ DE L'INFORMATION. Un 19 tout seul n'aide
                    personne à décider par où commencer ; « dont 6 en retard depuis hier » si. */}
                <span className="text-km-micro text-km-side-muted">{detailDuSeau(s.cle)}</span>
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-6">
            <button
              onClick={() => setTemps('plan')}
              className="inline-flex items-center gap-3 rounded-km bg-km-green px-8 py-4 font-mono text-km-body font-semibold uppercase tracking-[0.16em] text-white hover:bg-[#0a6650]"
            >
              Démarrer la séance
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </button>
            <p className="max-w-[46ch] text-km-body text-km-side-muted">
              Le plan du jour s’ouvre sur les {lignes.length} actions, dans l’ordre. Le sprint, lui,
              masquera tout le reste de Kimatch.
            </p>
          </div>

          <div className="flex flex-wrap gap-6 border-t border-km-side-line pt-5 text-km-body text-km-side-muted">
            <span>
              Vivier : <b className="font-medium text-km-side-text">{heros.total} contact{heros.total > 1 ? 's' : ''}</b>
              {heros.mwh > 0 ? ` · ${Math.round(heros.mwh).toLocaleString('fr-FR')} MWh/an à renégocier` : ''}
            </span>
            {heros.depassees > 0 ? (
              <span>
                <b className="font-medium text-km-amber">{heros.depassees}</b> échéance
                {heros.depassees > 1 ? 's' : ''} déjà dépassée{heros.depassees > 1 ? 's' : ''}
              </span>
            ) : null}
          </div>
        </div>
      </div>
    )
  }

  /* ══════════════ LE PLAN DU JOUR ══════════════ */
  return (
    <div className="flex min-h-screen flex-col">
      <Topbar title="Cockpit" crumb="Plan du jour" />

      <div className="sticky top-0 z-10 flex flex-wrap items-center gap-x-5 gap-y-3 border-b border-km-line bg-km-surface px-4 py-2.5 sm:px-6">
        <Button variant="ghost" onClick={() => setTemps('seuil')} className="px-2.5 py-1.5">
          ← Le seuil
        </Button>
        <h2 className="font-mono text-km-label font-semibold uppercase tracking-[0.16em] text-km-text">
          {zone === 'pipe' ? 'Plan du jour' : 'Vivier'}
        </h2>

        <div className="flex overflow-hidden rounded-km border border-km-line">
          {([
            ['pipe', 'Pipe du jour', lignes.length],
            ['vivier', 'Vivier', heros.total],
          ] as const).map(([cle, libelle, n]) => (
            <button
              key={cle}
              aria-pressed={zone === cle}
              onClick={() => setZone(cle)}
              className={cn(
                'px-3.5 py-1.5 text-km-body',
                zone === cle ? 'bg-km-text text-white' : 'text-km-muted hover:bg-km-soft',
                cle === 'vivier' ? 'border-l border-km-line' : '',
              )}
            >
              {libelle} <span className="font-mono text-km-label opacity-75">{n}</span>
            </button>
          ))}
        </div>

        <button
          onClick={() => setEnSprint(true)}
          disabled={affichees.length === 0}
          className="ml-auto inline-flex items-center gap-2.5 rounded-km bg-km-text px-4 py-2.5 text-km-body font-semibold text-white hover:bg-[#2A3340] disabled:opacity-45"
        >
          <Zap className="h-4 w-4" aria-hidden="true" />
          Lancer un sprint
          {affichees.length !== lignes.length ? (
            <span className="font-mono opacity-80">{affichees.length}</span>
          ) : null}
        </button>
      </div>

      {zone === 'pipe' ? (
        <div className="flex flex-wrap gap-1.5 border-b border-km-line bg-km-bg px-4 py-2.5 sm:px-6">
          <button
            aria-pressed={filtre === null}
            onClick={() => setFiltre(null)}
            className={cn(
              'rounded-km-pill border px-3 py-1 text-km-micro',
              filtre === null
                ? 'border-km-green bg-km-green-soft font-medium text-km-green'
                : 'border-km-line bg-km-surface text-km-muted hover:text-km-text',
            )}
          >
            Tout le pipe <span className="ml-1 font-mono opacity-75">{lignes.length}</span>
          </button>
          {FILTRES.map((f) => (
            <button
              key={f.cle}
              aria-pressed={filtre === f.cle}
              onClick={() => setFiltre(filtre === f.cle ? null : f.cle)}
              className={cn(
                'rounded-km-pill border px-3 py-1 text-km-micro',
                filtre === f.cle
                  ? 'border-km-green bg-km-green-soft font-medium text-km-green'
                  : 'border-km-line bg-km-surface text-km-muted hover:text-km-text',
              )}
            >
              {f.libelle}
              <span className="ml-1 font-mono opacity-75">{compte(f.sources)}</span>
            </button>
          ))}
        </div>
      ) : null}

      {message ? (
        <p className="border-b border-km-green-line bg-km-green-soft px-4 py-2 text-km-body text-km-green sm:px-6">{message}</p>
      ) : null}

      {enAttenteDeMigration ? (
        <p className="border-b border-km-amber-line bg-km-amber-soft px-4 py-2.5 text-km-body text-km-amber sm:px-6">
          <b className="font-semibold">Le Cockpit n’est pas encore en base.</b> Le pipe et le vivier
          resteront vides jusqu’à l’application des quatre migrations du 15/09/2026 — rien ici ne
          peut être lu avant. Ce n’est pas une erreur de l’écran.
        </p>
      ) : null}

      {zone === 'vivier' ? (
        <div className="grid grid-cols-[repeat(auto-fit,minmax(178px,1fr))] gap-2.5 px-4 pt-4 sm:px-6">
          <Hero titre="À renégocier" valeur={`${Math.round(heros.mwh).toLocaleString('fr-FR')}`} unite="MWh/an" detail={`Sur ${heros.total} contact${heros.total > 1 ? 's' : ''} dont vous répondez`} />
          <Hero titre="Échéances dépassées" valeur={String(heros.depassees)} detail="Contrats reconduits sans nous" alarme />
          <Hero titre="Sans périmètre" valeur={String(heros.sansPerimetre)} detail="Décisionnaires dont on ne sait rien" />
          <Hero
            titre="Le plus lourd"
            valeur={heros.plusLourd?.mwh_annuels ? Math.round(heros.plusLourd.mwh_annuels).toLocaleString('fr-FR') : '—'}
            unite={heros.plusLourd?.mwh_annuels ? 'MWh' : undefined}
            detail={heros.plusLourd?.compte_nom ?? 'Aucun volume connu'}
          />
        </div>
      ) : null}

      {zone === 'vivier' && heros.total > 0 ? (
        <div className="px-4 pb-4 pt-3 sm:px-6">
          <span className="mb-2.5 block font-mono text-km-label uppercase tracking-[0.16em] text-km-muted">
            Quand tombent les échéances du vivier — {heros.total} contact{heros.total > 1 ? 's' : ''}
          </span>
          <div className="grid max-w-[620px] gap-1.5">
            {horizons.map((h) => {
              const max = Math.max(...horizons.map((x) => x.n), 1)
              return (
                <div key={h.lab} className="grid grid-cols-[132px_minmax(0,1fr)_38px] items-center gap-2.5 text-km-micro">
                  <span className="text-km-muted">{h.lab}</span>
                  <span className="h-[13px] rounded-r-[3px] bg-km-soft">
                    <span
                      className="block h-full rounded-r-[3px]"
                      style={
                        h.ton
                          ? { width: `${Math.round((h.n / max) * 100)}%`, background: h.ton }
                          : {
                              width: `${Math.round((h.n / max) * 100)}%`,
                              backgroundImage:
                                'repeating-linear-gradient(45deg, rgb(var(--km-muted) / 0.55) 0 4px, transparent 4px 8px)',
                              backgroundColor: 'rgb(var(--km-muted) / 0.14)',
                            }
                      }
                    />
                  </span>
                  <span className="text-right font-mono font-medium tabular-nums">{h.n}</span>
                </div>
              )
            })}
          </div>
        </div>
      ) : null}

      <div className="grid flex-1 grid-cols-1 items-start lg:grid-cols-[minmax(0,1fr)_372px]">
        <div className="overflow-x-auto">
          {zone === 'pipe' ? (
            <table className="w-full min-w-[760px] border-collapse text-km-body">
              <thead>
                <tr>
                  {['', '#', 'Nom complet', 'Fonction', 'Compte', 'Tag', 'Segment', 'Heure'].map((t, i) => (
                    <th
                      key={i}
                      scope="col"
                      className="sticky top-0 border-b border-km-line bg-km-bg px-3 py-2 text-left font-mono text-km-label font-medium uppercase tracking-[0.1em] text-km-muted"
                    >
                      {t}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {affichees.map((l, i) => (
                  <tr
                    key={l.ligne_id}
                    draggable
                    onDragStart={() => setTire(l.ligne_id)}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={() => surDepot(l.ligne_id)}
                    onClick={() => setChoisie(l.ligne_id)}
                    aria-selected={l.ligne_id === (choisie ?? affichees[0]?.ligne_id)}
                    tabIndex={0}
                    onKeyDown={(e) => { if (e.key === 'Enter') setChoisie(l.ligne_id) }}
                    className={cn(
                      'cursor-pointer bg-km-surface hover:bg-km-green-tint',
                      l.ligne_id === (choisie ?? affichees[0]?.ligne_id) ? 'bg-km-green-tint' : '',
                    )}
                  >
                    <td className="w-8 border-b border-km-line-soft px-2 py-2 text-km-faint">
                      <GripVertical className="h-4 w-4 cursor-grab" aria-hidden="true" />
                    </td>
                    <td className="w-10 border-b border-km-line-soft px-3 py-2 font-mono text-km-label text-km-muted">{i + 1}</td>
                    <td className="border-b border-km-line-soft px-3 py-2">
                      <span className="block font-medium">{l.nom_complet ?? 'Sans nom'}</span>
                      <span className="block font-mono text-km-label tracking-wide text-km-muted">{l.telephone ?? 'Aucun numéro'}</span>
                      <span className="block text-km-micro text-km-muted">{LIBELLE_SOURCE[l.source]}</span>
                    </td>
                    <td className="border-b border-km-line-soft px-3 py-2">{l.fonction ?? '—'}</td>
                    <td className="border-b border-km-line-soft px-3 py-2">{l.compte_nom ?? '—'}</td>
                    <td className="border-b border-km-line-soft px-3 py-2">
                      <Badge tone={l.cible_type === 'PISTE' ? 'blue' : 'green'}>
                        {l.cible_type === 'PISTE' ? 'Piste' : 'Opportunité'}
                      </Badge>
                    </td>
                    <td className="border-b border-km-line-soft px-3 py-2">{l.segment ?? '—'}</td>
                    <td
                      className={cn(
                        'border-b border-km-line-soft px-3 py-2 font-mono text-km-label tabular-nums',
                        l.en_retard ? 'font-medium text-km-amber' : l.heure ? '' : 'text-km-faint',
                      )}
                    >
                      {l.heure ?? (l.en_retard ? 'en retard' : '—')}
                    </td>
                  </tr>
                ))}
                {affichees.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="bg-km-surface px-4 py-10 text-center text-km-muted">
                      {isLoading
                        ? 'Chargement…'
                        : filtre
                          ? 'Aucune fiche à ce titre. Retirez le filtre pour voir tout le pipe.'
                          : 'Le pipe est vide. Complétez-le depuis le vivier.'}
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          ) : (
            <table className="w-full min-w-[760px] border-collapse text-km-body">
              <thead>
                <tr>
                  {['', 'Nom complet', 'Fonction', 'Compte principal', 'Segment', 'Critère d’éligibilité', 'Volume'].map((t, i) => (
                    <th
                      key={i}
                      scope="col"
                      className="sticky top-0 border-b border-km-line bg-km-bg px-3 py-2 text-left font-mono text-km-label font-medium uppercase tracking-[0.1em] text-km-muted"
                    >
                      {t}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {lignesVivier.map((c) => (
                  <tr
                    key={c.contact_id}
                    onClick={() => {
                      const n = new Set(cochees)
                      if (n.has(c.contact_id)) n.delete(c.contact_id)
                      else n.add(c.contact_id)
                      setCochees(n)
                    }}
                    className={cn('cursor-pointer bg-km-surface hover:bg-km-green-tint', cochees.has(c.contact_id) ? 'bg-km-green-tint' : '')}
                  >
                    <td className="w-9 border-b border-km-line-soft px-3 py-2">
                      <input
                        type="checkbox"
                        id={`vivier-${c.contact_id}`}
                        checked={cochees.has(c.contact_id)}
                        onChange={() => {}}
                        aria-label={`Choisir ${c.nom_complet ?? 'ce contact'}`}
                        className="h-4 w-4 accent-km-green"
                      />
                    </td>
                    <td className="border-b border-km-line-soft px-3 py-2">
                      <span className="block font-medium">{c.nom_complet ?? 'Sans nom'}</span>
                      <span className="block font-mono text-km-label text-km-muted">{c.telephone ?? '—'}</span>
                    </td>
                    <td className="border-b border-km-line-soft px-3 py-2">{c.fonction ?? '—'}</td>
                    <td className="border-b border-km-line-soft px-3 py-2">{c.compte_nom ?? '—'}</td>
                    <td className="border-b border-km-line-soft px-3 py-2">{c.compte_segment ?? '—'}</td>
                    <td className="border-b border-km-line-soft px-3 py-2">
                      <Badge tone={c.echeance_depassee ? 'red' : c.critere === 'SANS_PERIMETRE' ? 'neutral' : 'amber'}>
                        {c.echeance_depassee ? 'Échéance dépassée' : LIBELLE_CRITERE[c.critere]}
                      </Badge>
                    </td>
                    <td className="border-b border-km-line-soft px-3 py-2 font-mono tabular-nums">
                      {c.mwh_annuels ? `${Math.round(c.mwh_annuels).toLocaleString('fr-FR')} MWh` : '—'}
                    </td>
                  </tr>
                ))}
                {lignesVivier.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="bg-km-surface px-4 py-10 text-center text-km-muted">
                      Votre vivier est vide : tout le portefeuille dont vous répondez est travaillé.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          )}
        </div>

        {/* ── LE VOLET DE DÉTAIL ── */}
        <aside className="sticky top-[53px] flex flex-col gap-4 border-t border-km-line bg-km-surface p-4 lg:border-l lg:border-t-0">
          {zone === 'pipe' && laFiche ? (
            <VoletFiche
              fiche={laFiche}
              onSortir={(motif) => void sortir.mutateAsync({ ligne: laFiche.ligne_id, motif })}
            />
          ) : zone === 'pipe' ? (
            <p className="text-km-body text-km-muted">Choisissez une ligne pour voir son détail.</p>
          ) : (
            <>
              <div>
                <h3 className="text-km-lg font-medium">
                  {cochees.size > 0
                    ? `${cochees.size} contact${cochees.size > 1 ? 's' : ''} choisi${cochees.size > 1 ? 's' : ''}`
                    : 'Le vivier'}
                </h3>
                <p className="mt-0.5 text-km-body text-km-muted">
                  {cochees.size > 0
                    ? 'Créer leurs opportunités les fait entrer dans le pipe du jour, même au-delà du plafond.'
                    : 'Cochez des lignes pour créer leurs opportunités en une fois.'}
                </p>
              </div>
              {cochees.size > 0 ? (
                <dl className="overflow-hidden rounded-km border border-km-line">
                  <Fait libelle="Opportunités à créer" valeur={String(cochees.size)} />
                  <Fait
                    libelle="Volume représenté"
                    valeur={`${Math.round(
                      lignesVivier.filter((l) => cochees.has(l.contact_id)).reduce((s, l) => s + (l.mwh_annuels ?? 0), 0),
                    ).toLocaleString('fr-FR')} MWh/an`}
                  />
                  <Fait libelle="Origine posée" valeur="Portefeuille" />
                  <Fait libelle="Signal inscrit" valeur="le critère d’éligibilité" />
                </dl>
              ) : null}
              <Button
                variant="primary"
                disabled={cochees.size === 0 || ajouter.isPending}
                onClick={() => void surAjouter()}
              >
                Créer {cochees.size > 0 ? cochees.size : ''} opportunité{cochees.size > 1 ? 's' : ''} et ajouter au pipe
              </Button>
            </>
          )}
        </aside>
      </div>

      <div className="flex flex-wrap items-center gap-4 border-t border-km-line bg-km-surface px-4 py-2.5 text-km-body text-km-muted sm:px-6">
        {zone === 'pipe' ? (
          <>
            <span>Le pipe est arrêté pour la journée. Une fiche traitée sort et n’est pas remplacée.</span>
            <Button className="ml-auto" disabled={completer.isPending} onClick={() => void surCompleter()}>
              Compléter depuis le vivier
            </Button>
          </>
        ) : (
          <span>
            Le vivier est la première source de complétion du pipe : les pistes froides n’arrivent
            qu’après lui.
          </span>
        )}
      </div>
    </div>
  )
}

function Hero({ titre, valeur, unite, detail, alarme }: { titre: string; valeur: string; unite?: string; detail: string; alarme?: boolean }) {
  return (
    <div className={cn('rounded-km border bg-km-surface px-3.5 py-3.5', alarme ? 'border-km-amber-line' : 'border-km-line')}>
      <span className={cn('font-mono text-km-label uppercase tracking-[0.14em]', alarme ? 'text-km-amber' : 'text-km-muted')}>
        {alarme ? '▲ ' : ''}
        {titre}
      </span>
      <span className={cn('mt-1 block font-mono text-km-metric font-medium leading-none tabular-nums', alarme ? 'text-km-amber' : '')}>
        {valeur}
        {unite ? <span className="ml-1 text-km-body font-normal text-km-muted">{unite}</span> : null}
      </span>
      <span className="mt-0.5 block text-km-micro text-km-muted">{detail}</span>
    </div>
  )
}

function Fait({ libelle, valeur, alerte }: { libelle: string; valeur: string; alerte?: boolean }) {
  return (
    <div className="flex justify-between gap-3 border-b border-km-line px-3 py-2 text-km-body last:border-b-0">
      <dt className="text-km-muted">{libelle}</dt>
      <dd className={cn('text-right font-medium', alerte ? 'text-km-amber' : '')}>{valeur}</dd>
    </div>
  )
}

function VoletFiche({ fiche, onSortir }: { fiche: LignePipe; onSortir: (m: 'APPELE' | 'REPORTE' | 'ECARTE') => void }) {
  return (
    <>
      <div>
        <h3 className="text-km-lg font-medium">{fiche.nom_complet ?? 'Sans nom'}</h3>
        <p className="mt-0.5 text-km-body text-km-muted">
          {fiche.fonction ?? '—'} · {fiche.compte_nom ?? '—'}
        </p>
      </div>

      <div className="flex flex-wrap gap-1.5">
        <Badge tone={fiche.cible_type === 'PISTE' ? 'blue' : 'green'}>
          {fiche.cible_type === 'PISTE' ? 'Piste' : 'Opportunité'}
        </Badge>
        {fiche.segment ? <Badge tone="neutral">{fiche.segment}</Badge> : null}
      </div>

      {/* Le numéro en clair, à côté du bouton : c'est lui que l'extension Allo détecte. */}
      <div className="flex items-center justify-between gap-3 rounded-km border border-km-line border-l-[3px] border-l-km-green px-3 py-2.5">
        <span>
          <span className="block font-mono text-km-lead font-medium tracking-wide">{fiche.telephone ?? 'Aucun numéro'}</span>
          <span className="block font-mono text-km-label uppercase tracking-[0.1em] text-km-muted">
            {fiche.telephone_mobile && fiche.telephone_mobile !== fiche.telephone ? 'Fixe · un mobile aussi' : 'Ligne connue'}
          </span>
        </span>
        <Button
          variant="primary"
          disabled={!fiche.telephone}
          onClick={() =>
            void appelerNumero(fiche.telephone, { nom: fiche.nom_complet, societe: fiche.compte_nom, fonction: fiche.fonction })
          }
        >
          <Phone className="h-4 w-4" aria-hidden="true" />
          Appeler
        </Button>
      </div>

      <dl className="overflow-hidden rounded-km border border-km-line">
        <Fait libelle="Pourquoi cette fiche est là" valeur={LIBELLE_SOURCE[fiche.source]} />
        <Fait
          libelle="Périmètre"
          valeur={fiche.compteurs > 0 ? `${fiche.compteurs} compteur${fiche.compteurs > 1 ? 's' : ''}` : 'vide — à qualifier'}
          alerte={fiche.compteurs === 0}
        />
        {fiche.mwh_annuels ? (
          <Fait libelle="Volume" valeur={`${Math.round(fiche.mwh_annuels).toLocaleString('fr-FR')} MWh/an`} />
        ) : null}
        <Fait libelle="Échéance" valeur={fiche.echeance ?? 'inconnue'} alerte={!fiche.echeance} />
        <Fait libelle="Nature" valeur={fiche.nature_echeance ?? '—'} />
        <Fait libelle="Tâches ouvertes" valeur={String(fiche.taches_ouvertes)} />
      </dl>

      {fiche.commentaire ? (
        <div className="rounded-km border border-km-green-line bg-km-green-soft px-3 py-2.5 text-km-body">
          <span className="mb-1 block font-mono text-km-label uppercase tracking-[0.14em] text-km-green">Note importante</span>
          {fiche.commentaire}
        </div>
      ) : null}

      <div className="mt-auto flex flex-wrap gap-2">
        <Button className="flex-1" onClick={() => onSortir('REPORTE')}>
          Reporter
        </Button>
        <Button variant="danger" className="flex-1" onClick={() => onSortir('ECARTE')}>
          Écarter
        </Button>
        <EntityLink
          to={fiche.cible_type === 'PISTE' ? `/pistes/${fiche.cible_id}` : `/opportunites/${fiche.cible_id}`}
          className="self-center"
        >
          Ouvrir la fiche
        </EntityLink>
      </div>
    </>
  )
}
