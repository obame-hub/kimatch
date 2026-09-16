import { useMemo, useState } from 'react'
import { Check, Layers, Plus, Trash2, X } from 'lucide-react'
import { Dialog } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/form'
import { Badge } from '@/components/ui/badge'
import { useCompteurs } from '@/lib/data/compteurs'
import { useMandats } from '@/lib/data/mandats'
import { useContrats } from '@/lib/data/contrats'
import { useCreateRecommandation } from '@/lib/data/recommandations'
import { useReferenceTable } from '@/lib/data/referenceTables'
import { useEcarterDuPerimetre } from '@/lib/data/opportunites'
import { buildTitre, dateClotureSuggereePour } from '@/components/opportunite/CreationRecommandationWizard'
import type { Opportunite, Compteur } from '@/types/domain'
import { cn } from '@/lib/utils'

/**
 * ══ CONVERTIR UNE OPPORTUNITÉ, C'EST DÉCOUPER SON PÉRIMÈTRE ══
 *
 * Michel, appel du 11/09/2026, retranscrit :
 *
 *   « En gros la question c'est : avec ce périmètre-là, j'ai besoin de combien de contrats ?
 *   Est-ce que j'ai besoin d'un contrat et ça prend en compte tout le périmètre ? Est-ce que j'ai
 *   besoin de deux contrats et ça divise les compteurs ? Est-ce que j'ai besoin d'un contrat pour
 *   chaque compteur et ça me fait cinq recommandations ? »
 *
 * UNE RECOMMANDATION ABOUTIT À UN CONTRAT. Le nombre de recommandations n'est donc pas un réglage
 * d'outil : il suit la façon dont le client décide. « C'est toujours lié à la décision qui
 * finalise la décision pour générer les contrats. » Deux compteurs se décident ensemble, les trois
 * autres séparément — deux recommandations, et Kimatch n'a pas à en juger.
 *
 * ── POURQUOI UN DIALOGUE, ET PAS UN ÉCRAN ──
 *
 * « Rappelle-toi un peu quand on fait une demande de cotation : il va juste mettre temporairement
 * deux cotations ou trois recommandations en fonction de ce que tu lui as dit, et c'est quand je
 * confirme que c'est bon. »
 *
 * RIEN N'EST CRÉÉ TANT QU'ON N'A PAS CONFIRMÉ. Les lots qu'on prépare ici ne vivent qu'à l'écran.
 * C'est ce qui répond à la question que Naoëlle a posée deux fois — « si je crée une reco pour
 * deux compteurs sur quatre, l'opportunité reste en quel statut ? » : la question ne se pose pas,
 * parce qu'il n'y a pas d'état intermédiaire à porter. Soit on ferme le dialogue et tout part d'un
 * coup, soit on l'abandonne et rien ne s'est passé.
 *
 * ── ÉCARTER EST UNE SORTIE, PAS UN ABANDON ──
 *
 * « Ah bah finalement j'écarte ce compteur […] en écartant, ça valide le fait que j'ai deux
 * recommandations […] et l'autre qui a été écarté, fin du gain. »
 *
 * Sans cette sortie, un périmètre dont un compteur ne mérite pas de recommandation resterait
 * éternellement à moitié converti. C'est une décision qui se consigne — d'où la colonne `ecarte`
 * de la migration 20260911150000, et non un simple oubli côté écran.
 *
 * ── CE QUI SE DÉDUIT, ET QU'ON NE REDEMANDE PAS ──
 *
 * Michel : « la recommandation va venir reprendre exactement tout ce qu'il y a dans
 * l'opportunité ». Le compte, le contact, le mandat et l'énergie viennent donc de l'opportunité et
 * des compteurs choisis. Ne restent saisissables que le titre et la date de clôture, parce qu'ils
 * diffèrent d'un lot à l'autre — et les deux sont pré-remplis par les mêmes règles que
 * l'assistant, dont ce fichier importe les fonctions plutôt que de les recopier.
 */

/**
 * LE NUMÉRO D'ÉTAPE.
 *
 * Naoëlle, 12/09/2026 : « peux-tu mettre des étapes 1 et 2 à côté de "reste à placer" et "que faire
 * de ces x compteurs", comme ça on comprend qu'il faut tout remplir pour que le bouton convertir
 * soit utilisable ».
 *
 * Les deux blocs se lisaient comme deux listes indépendantes, alors que c'est un aller-retour :
 * on choisit, on décide, on recommence. Numéroter dit la boucle sans avoir à l'expliquer — et
 * l'étape 2 reste affichée en gris avant toute sélection, sinon la deuxième moitié du travail
 * n'existerait pas tant qu'on n'a rien coché.
 */
function Etape({ numero, actif, children }: { numero: number; actif: boolean; children: React.ReactNode }) {
  return (
    <div className="mb-2.5 mt-0.5 flex items-center gap-2">
      <span
        className={cn(
          'flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-km-tiny font-bold',
          actif ? 'bg-opp-500 text-white' : 'bg-km-line text-km-faint',
        )}
      >
        {numero}
      </span>
      {children}
    </div>
  )
}

/** Un lot préparé : les compteurs qui partiront ensemble dans une même recommandation. */
interface Lot {
  cle: string
  compteurIds: string[]
  titre: string
  dateCloture: string
}

export function DialogConversionOpportunite({
  opportunite,
  ouvert,
  onFermer,
  onConverti,
}: {
  opportunite: Opportunite
  ouvert: boolean
  onFermer: () => void
  onConverti: (nbRecommandations: number) => void
}) {
  const { data: tousCompteurs } = useCompteurs()
  const { data: mandats } = useMandats()
  const { data: contrats } = useContrats()
  const { data: etapesRef } = useReferenceTable('etapes_recommandation')
  const creerRecommandation = useCreateRecommandation()
  const ecarter = useEcarterDuPerimetre()

  const [lots, setLots] = useState<Lot[]>([])
  const [ecartes, setEcartes] = useState<{ id: string; motif: string }[]>([])
  const [selection, setSelection] = useState<Set<string>>(new Set())
  const [motifEcart, setMotifEcart] = useState('')
  const [enCours, setEnCours] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)

  /* ── LE PÉRIMÈTRE ENCORE À TRAITER ──
     On repart de ce qui n'est ni déjà placé dans une recommandation d'un passage précédent, ni
     déjà écarté : le dialogue doit pouvoir se rouvrir pour finir un découpage commencé. */
  const compteursDuPerimetre = useMemo(() => {
    const dejaTraites = new Set([...(opportunite.compteurs_places ?? []), ...(opportunite.compteurs_ecartes ?? [])])
    return (tousCompteurs ?? []).filter((c) => opportunite.compteur_ids.includes(c.id) && !dejaTraites.has(c.id))
  }, [tousCompteurs, opportunite])

  const places = useMemo(() => new Set(lots.flatMap((l) => l.compteurIds)), [lots])
  const ecartesIds = useMemo(() => new Set(ecartes.map((e) => e.id)), [ecartes])
  const restants = compteursDuPerimetre.filter((c) => !places.has(c.id) && !ecartesIds.has(c.id))

  const mandatsActifs = useMemo(
    () => (mandats ?? []).filter((m) => m.compte_id === opportunite.compte_id && m.statut === 'ACTIF'),
    [mandats, opportunite.compte_id],
  )

  const choisis = restants.filter((c) => selection.has(c.id))

  /* ══ CE QU'UN LOT NE PEUT PAS MÉLANGER — ET CE QU'IL PEUT ══
   *
   * L'ÉNERGIE RESTE UNE : le comparatif se fait à énergie constante, mélanger gaz et électricité
   * n'a pas de sens.
   *
   * LE MANDAT, LUI, N'A PLUS À ÊTRE UNIQUE. William, 16/09/2026, sur l'opportunité aux douze
   * compteurs : « le plus important c'est que tous les compteurs soient couverts, peu importe si
   * c'est 2 mandats différents. » Ce qui compte est l'autorisation de consulter, et elle est acquise
   * dès qu'un mandat actif couvre le compteur — qu'il couvre aussi ses voisins est sans effet sur ce
   * droit.
   *
   * ══ ET L'ANCIENNE RÈGLE SE TROMPAIT MÊME SUR SES PROPRES TERMES ══
   *
   * Elle ne cherchait pas un mandat COMMUN : elle prenait le premier mandat couvrant le PREMIER
   * compteur choisi, puis vérifiait que les autres y étaient. Un mandat étroit rencontré en tête
   * faisait donc échouer un lot qu'un mandat plus large couvrait entièrement.
   *
   * C'est exactement ce qui est arrivé : les douze compteurs sont tous couverts par MDT-2026-916,
   * mais le premier de la liste porte aussi MDT-2025-259, qui ne couvre que lui. L'écran annonçait
   * « faites-en deux lots » devant un lot parfaitement légitime.
   *
   * ══ CE QU'ON INSCRIT ══
   *
   * TOUS les mandats qui couvrent le lot, le plus couvrant en tête comme principal. Sans quoi la
   * recommandation ne porterait qu'une partie de son autorisation, et la question « de quoi ce
   * dossier tire-t-il son droit de consulter » resterait sans réponse complète. */
  const energies = new Set(choisis.map((c) => c.type_energie))

  /** Les compteurs du lot qu'aucun mandat actif ne couvre. Ce sont eux qui bloquent, nommément. */
  const nonCouverts = choisis.filter(
    (c) => !mandatsActifs.some((m) => m.compteur_ids.includes(c.id)),
  )

  const empechement = (() => {
    if (choisis.length === 0) return 'Choisissez au moins un compteur.'
    if (energies.size > 1) return 'Un lot ne peut pas mélanger gaz et électricité : une recommandation porte une seule énergie.'
    if (nonCouverts.length > 0) {
      const nommes = nonCouverts.slice(0, 3).map((c) => c.numero_pdl).join(', ')
      const reste = nonCouverts.length > 3 ? ` et ${nonCouverts.length - 3} autre${nonCouverts.length - 3 > 1 ? 's' : ''}` : ''
      return nonCouverts.length === 1
        ? `${nommes} n’est couvert par aucun mandat actif — retirez-le du lot, ou faites signer un mandat.`
        : `${nonCouverts.length} compteurs ne sont couverts par aucun mandat actif (${nommes}${reste}) — retirez-les du lot, ou faites signer un mandat.`
    }
    return null
  })()

  function basculer(id: string) {
    setSelection((s) => {
      const n = new Set(s)
      if (n.has(id)) n.delete(id); else n.add(id)
      return n
    })
  }

  function preparerUnLot() {
    if (empechement) return
    const dateCloture = dateClotureSuggereePour(choisis, contrats ?? [])
    setLots((l) => [...l, {
      cle: `lot-${Date.now()}`,
      compteurIds: choisis.map((c) => c.id),
      titre: buildTitre(opportunite.compte_nom, choisis[0].site_nom, choisis.length, dateCloture),
      dateCloture,
    }])
    setSelection(new Set())
  }

  function ecarterLaSelection() {
    if (choisis.length === 0) return
    setEcartes((e) => [...e, ...choisis.map((c) => ({ id: c.id, motif: motifEcart.trim() }))])
    setSelection(new Set())
    setMotifEcart('')
  }

  function defaireLeLot(cle: string) {
    setLots((l) => l.filter((x) => x.cle !== cle))
  }

  function remettreDansLePerimetre(id: string) {
    setEcartes((e) => e.filter((x) => x.id !== id))
  }

  const nomDe = (id: string) => (tousCompteurs ?? []).find((c) => c.id === id)?.numero_pdl ?? id.slice(0, 8)

  /* ── LA CONFIRMATION : TOUT PART D'UN COUP ──
     Les recommandations sont créées l'une après l'autre, puis les écarts sont consignés. En cas
     d'échec au milieu, on s'arrête et on le dit : les lots déjà créés existent, le dialogue reste
     ouvert sur ce qui reste. Rouvrir le reprendra là où il s'est arrêté, puisque « déjà placé » se
     lit en base et non dans cet écran. */
  async function confirmer() {
    if (restants.length > 0 || lots.length === 0 || enCours) return
    setEnCours(true)
    setErreur(null)
    const etapeInitiale = (etapesRef ?? []).find((e) => e.code === 'BROUILLON')
      ?? (etapesRef ?? []).find((e) => e.code === 'CONSULTATION')
    let crees = 0
    try {
      for (const lot of lots) {
        const compteursDuLot = compteursDuPerimetre.filter((c) => lot.compteurIds.includes(c.id))
        /* Tous les mandats qui couvrent au moins un compteur du lot, LE PLUS COUVRANT EN TÊTE : il
           devient le principal, ce qui est le choix le plus défendable quand il y en a plusieurs.
           Le contrôle est refait ici et pas seulement à l'écran : un mandat peut expirer entre la
           composition du lot et l'enregistrement. */
        const mandatsDuLot = mandatsActifs
          .map((m) => ({ m, couverts: compteursDuLot.filter((c) => m.compteur_ids.includes(c.id)).length }))
          .filter((x) => x.couverts > 0)
          .sort((a, b) => b.couverts - a.couverts)
          .map((x) => x.m)
        const orphelins = compteursDuLot.filter(
          (c) => !mandatsDuLot.some((m) => m.compteur_ids.includes(c.id)),
        )
        if (orphelins.length > 0) {
          throw new Error(
            `Le lot « ${lot.titre} » contient ${orphelins.length} compteur(s) sans mandat actif : `
            + orphelins.map((c) => c.numero_pdl).join(', '),
          )
        }
        const client = (c: Compteur) => (contrats ?? []).some(
          (ct) => (!ct.date_fin || new Date(ct.date_fin) >= new Date()) && ct.compteurs.some((x) => x.id === c.id),
        )
        await creerRecommandation.mutateAsync({
          titre: lot.titre,
          mandat_ids: mandatsDuLot.map((m) => m.id),
          compte_id: opportunite.compte_id ?? '',
          compte_nom: opportunite.compte_nom,
          type_energie_id: null,
          type_energie: compteursDuLot[0].type_energie === 'gaz' ? 'gaz' : 'electricite',
          compteurs: compteursDuLot.map((c) => ({ id: c.id, site_id: c.site_id, site_nom: c.site_nom })),
          contact_signataire_id: opportunite.contact_id ?? null,
          date_cloture: lot.dateCloture || null,
          // Même règle que l'assistant : renouvellement seulement si TOUS les compteurs sont clients.
          type_opportunite: compteursDuLot.every(client) ? 'Renouvellement' : 'Captation',
          opportunite_id: opportunite.id,
          etape_id: etapeInitiale?.id ?? null,
          origine_id: null,
          priorite: 2,
          description: '',
          commentaire_interne: '',
        })
        crees += 1
      }
      if (ecartes.length > 0) {
        await ecarter.mutateAsync({
          opportuniteId: opportunite.id,
          compteurs: ecartes.map((e) => ({ compteurId: e.id, motif: e.motif || null })),
        })
      }
      onConverti(crees)
      reinitialiser()
    } catch (e) {
      setErreur(
        crees > 0
          ? `${crees} recommandation(s) créée(s), puis : ${(e as Error).message}. Rouvrez la conversion pour finir le périmètre.`
          : (e as Error).message,
      )
    } finally {
      setEnCours(false)
    }
  }

  function reinitialiser() {
    setLots([])
    setEcartes([])
    setSelection(new Set())
    setMotifEcart('')
    setErreur(null)
  }

  const dejaPlaces = (opportunite.compteurs_places ?? []).length
  const dejaEcartes = (opportunite.compteurs_ecartes ?? []).length

  return (
    <Dialog
      open={ouvert}
      onClose={() => { reinitialiser(); onFermer() }}
      title="Convertir l’opportunité en recommandations"
      description="Découpez le périmètre : un lot de compteurs par contrat à venir. Rien n’est créé tant que vous n’avez pas confirmé."
      className="max-w-3xl"
    >
      <div className="space-y-5">
        {(dejaPlaces > 0 || dejaEcartes > 0) && (
          <p className="rounded-km-md border border-km-line bg-km-soft px-3 py-2 text-km-label text-km-muted">
            Conversion déjà commencée : {dejaPlaces} compteur(s) placé(s)
            {dejaEcartes > 0 && `, ${dejaEcartes} écarté(s)`}. Il reste ce qui suit.
          </p>
        )}

        {/* ── CE QUI RESTE À PLACER ── */}
        <section>
          <Etape numero={1} actif={restants.length > 0}>
            <span className="text-km-label font-bold uppercase tracking-wide text-km-faint">
              Choisir des compteurs — reste à placer
            </span>
            <Badge tone={restants.length === 0 ? 'kiwi' : 'neutral'}>
              {restants.length} sur {compteursDuPerimetre.length}
            </Badge>
          </Etape>

          {/* La consigne d'entrée : sans elle, la première chose qu'on voit est une liste de
              cases à cocher sans savoir ce qu'on coche. */}
          {restants.length > 0 && lots.length === 0 && choisis.length === 0 && (
            <p className="mb-2 rounded-km-md border border-km-line bg-km-soft px-3 py-2 text-km-label text-km-muted">
              Cochez les compteurs qui feront l’objet d’<strong className="text-km-text">un même
              contrat</strong>, puis préparez leur recommandation. Répétez jusqu’à ce que chaque
              compteur soit placé — ou écarté si vous n’attendez rien de lui.
            </p>
          )}

          {restants.length === 0 ? (
            <p className="rounded-km-md border border-km-green-line bg-km-green-tint px-3 py-2.5 text-km-body text-km-text">
              <Check className="mr-1.5 inline h-4 w-4 text-km-green" />
              Tout le périmètre est traité. Vous pouvez confirmer.
            </p>
          ) : (
            <div className="max-h-60 space-y-1.5 overflow-y-auto rounded-km-md border border-km-line p-2">
              {restants.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => basculer(c.id)}
                  className={cn(
                    'flex w-full items-center gap-3 rounded-km-sm px-3 py-2 text-left transition-colors',
                    selection.has(c.id) ? 'bg-opp-100 text-opp-600' : 'hover:bg-km-soft',
                  )}
                >
                  <span className={cn(
                    'flex h-4 w-4 shrink-0 items-center justify-center rounded border',
                    selection.has(c.id) ? 'border-opp-500 bg-opp-500 text-white' : 'border-km-line',
                  )}>
                    {selection.has(c.id) && <Check className="h-3 w-3" />}
                  </span>
                  <span className="font-mono text-km-label">{c.numero_pdl}</span>
                  <span className="min-w-0 flex-1 truncate text-km-label text-km-muted">{c.site_nom}</span>
                  <Badge tone={c.type_energie === 'gaz' ? 'amber' : 'blue'}>
                    {c.type_energie === 'gaz' ? 'Gaz' : 'Élec'}
                  </Badge>
                </button>
              ))}
            </div>
          )}

          {/* L'étape 2 s'annonce AVANT d'être disponible : sans elle, on ne verrait qu'une liste de
              cases et rien ne dirait qu'une décision suit. */}
          {restants.length > 0 && (
            <div className="mt-5">
            <Etape numero={2} actif={choisis.length > 0}>
              <span className="text-km-label font-bold uppercase tracking-wide text-km-faint">
                {choisis.length === 0
                  ? 'Décider de leur sort'
                  : `Que faire ${choisis.length > 1 ? `de ces ${choisis.length} compteurs` : 'de ce compteur'} ?`}
              </span>
              {choisis.length === 0 && (
                <span className="text-km-label text-km-faint">cochez d’abord au moins un compteur</span>
              )}
            </Etape>
            </div>
          )}

          {choisis.length > 0 && (
            /* ══ DEUX DESTINATIONS, ET ON LES SÉPARE ══
               Naoëlle, 12/09/2026 : « je comprends pas le bloc où c'est écrit "ou motif
               facultatif" et la case écarter ». Les deux boutons étaient sur une même ligne avec le
               champ motif coincé entre eux — il avait l'air de servir aux deux, et rien ne disait
               que « écarter » était une SORTIE et non une variante de « préparer ».

               Ce ne sont pas deux boutons, ce sont deux destins possibles pour le même compteur :
               il part vers un contrat, ou il n'en aura pas. Chacun a donc son cadre, son titre et
               sa conséquence écrite. Le motif ne vit que dans le second, là où il veut dire
               quelque chose. */
            <div className="space-y-2.5">
              {empechement && (
                <p className="rounded-km-md border border-km-amber-line bg-km-amber-soft px-3 py-2 text-km-label text-amber-800">
                  {empechement}
                </p>
              )}

              {/* ── VOIE 1 : IL PART VERS UN CONTRAT ── */}
              <div className="rounded-km-md border border-opp-200 bg-opp-100/30 p-3.5">
                <p className="text-km-body font-bold text-km-text">Le mettre dans une recommandation</p>
                <p className="mb-3 mt-1 text-km-label leading-relaxed text-km-muted">
                  {choisis.length > 1
                    ? 'Ces compteurs seront négociés ensemble et aboutiront à un seul contrat.'
                    : 'Ce compteur sera négocié et aboutira à un contrat.'}
                </p>
                <Button size="sm" onClick={preparerUnLot} disabled={!!empechement}>
                  <Plus className="h-3.5 w-3.5" />
                  Préparer une recommandation ({choisis.length})
                </Button>
              </div>

              {/* ── VOIE 2 : ON N'EN ATTEND RIEN ── */}
              <div className="rounded-km-md border border-km-line bg-km-surface p-3.5">
                <p className="text-km-body font-bold text-km-text">L’écarter</p>
                <p className="mb-3 mt-1 text-km-label leading-relaxed text-km-muted">
                  On ne cherchera pas de contrat pour {choisis.length > 1 ? 'ces compteurs' : 'ce compteur'} :
                  il {choisis.length > 1 ? 'sortent' : 'sort'} du périmètre.
                  {' '}C’est ce qui permet de terminer la conversion quand tout le monde n’est pas concerné.
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  <Input
                    value={motifEcart}
                    onChange={(e) => setMotifEcart(e.target.value)}
                    placeholder="Pourquoi ? ex. le client garde son fournisseur (facultatif)"
                    className="h-8 min-w-0 flex-1 text-km-label"
                  />
                  <Button size="sm" variant="outline" onClick={ecarterLaSelection}>
                    <X className="h-3.5 w-3.5" />
                    Écarter
                  </Button>
                </div>
              </div>
            </div>
          )}
        </section>

        {/* ── LES LOTS PRÉPARÉS ── */}
        {lots.length > 0 && (
          <section>
            <div className="mb-2 flex items-center gap-2">
              <Layers className="h-3.5 w-3.5 text-km-faint" />
              <span className="text-km-label font-bold uppercase tracking-wide text-km-faint">
                {lots.length} recommandation{lots.length > 1 ? 's' : ''} à créer
              </span>
            </div>
            <div className="space-y-2">
              {lots.map((lot, i) => (
                <div key={lot.cle} className="rounded-km-md border border-opp-200 bg-opp-100/40 p-2.5">
                  <div className="mb-1.5 flex items-center gap-2">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-opp-500 text-km-tiny font-bold text-white">
                      {i + 1}
                    </span>
                    <Input
                      value={lot.titre}
                      onChange={(e) => setLots((l) => l.map((x) => x.cle === lot.cle ? { ...x, titre: e.target.value } : x))}
                      className="h-8 flex-1 text-km-label"
                    />
                    <Input
                      type="date"
                      value={lot.dateCloture}
                      onChange={(e) => setLots((l) => l.map((x) => x.cle === lot.cle ? { ...x, dateCloture: e.target.value } : x))}
                      className="h-8 w-36 text-km-label"
                      title="Date de clôture visée"
                    />
                    <button
                      type="button"
                      onClick={() => defaireLeLot(lot.cle)}
                      className="rounded-km-sm p-1 text-km-faint hover:bg-km-red-soft hover:text-km-red"
                      title="Défaire ce lot"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <p className="pl-7 font-mono text-km-xs text-km-muted">
                    {lot.compteurIds.map(nomDe).join(' · ')}
                  </p>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ── LES ÉCARTÉS ── */}
        {ecartes.length > 0 && (
          <section>
            <span className="mb-2 block text-km-label font-bold uppercase tracking-wide text-km-faint">
              {ecartes.length} compteur{ecartes.length > 1 ? 's' : ''} écarté{ecartes.length > 1 ? 's' : ''}
            </span>
            <div className="space-y-1">
              {ecartes.map((e) => (
                <div key={e.id} className="flex items-center gap-2 rounded-km-sm border border-km-line px-2.5 py-1.5">
                  <span className="font-mono text-km-label text-km-muted line-through">{nomDe(e.id)}</span>
                  {e.motif && <span className="min-w-0 flex-1 truncate text-km-label text-km-faint">{e.motif}</span>}
                  <div className="flex-1" />
                  <button
                    type="button"
                    onClick={() => remettreDansLePerimetre(e.id)}
                    className="text-km-label font-semibold text-km-green hover:underline"
                  >
                    remettre
                  </button>
                </div>
              ))}
            </div>
          </section>
        )}

        {erreur && (
          <p className="rounded-km-md border border-red-200 bg-km-red-soft px-3 py-2 text-km-label text-red-700">{erreur}</p>
        )}

        {/* ══ LE BOUTON DIT CE QU'IL FAIT, PAS CE QU'IL FAUDRAIT FAIRE ══

            Naoëlle, 12/09/2026 : « le bouton en bas "préparez au moins une recommandation", il sert
            à quoi ? il est tout le temps grisé. » J'avais mis la CONSIGNE dans le libellé : il
            ressemblait à une action à cliquer alors que c'est la validation finale, et son vrai nom
            avait disparu.

            Un bouton nomme son geste, toujours le même. Ce qui manque pour pouvoir l'actionner se
            dit À CÔTÉ, en toutes lettres — c'est une information sur l'état du découpage, pas sur
            le bouton. */}
        <div className="mt-1 flex flex-wrap items-center justify-end gap-x-3 gap-y-2 border-t border-km-line pt-4">
          {!enCours && (lots.length === 0 || restants.length > 0) && (
            <p className="mr-auto text-km-label text-km-muted">
              {lots.length === 0 && restants.length > 0
                ? `Placez ${restants.length > 1 ? `les ${restants.length} compteurs` : 'le compteur'} ci-dessus pour pouvoir convertir.`
                : restants.length > 0
                  ? `Encore ${restants.length} compteur${restants.length > 1 ? 's' : ''} à placer ou à écarter.`
                  : 'Aucune recommandation préparée : tout le périmètre a été écarté.'}
            </p>
          )}
          <Button variant="ghost" onClick={() => { reinitialiser(); onFermer() }} disabled={enCours}>
            Annuler
          </Button>
          <Button onClick={confirmer} disabled={restants.length > 0 || lots.length === 0 || enCours}>
            {enCours
              ? 'Création…'
              : lots.length > 0
                ? `Convertir et créer ${lots.length} recommandation${lots.length > 1 ? 's' : ''}`
                : 'Convertir l’opportunité'}
          </Button>
        </div>
      </div>
    </Dialog>
  )
}
