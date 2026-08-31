/**
 * Création d'une recommandation — transposition de l'`OpportuniteWizard` de Tools
 * (`src/components/opportunite/OpportuniteWizard.tsx`), lu dans le code source le 15/08/2026.
 *
 * POURQUOI CETTE RÉÉCRITURE. Les règles métier étaient déjà justes dans l'ancien dialogue, mais
 * la forme ne l'était pas : Tools déroule un parcours en quatre étapes avec un fil d'avancement,
 * là où Kimatch empilait tous les champs dans un seul formulaire. Demande de Naoëlle du
 * 15/08/2026 : « refaire la création de recommandation à l'identique de Tools ».
 *
 * LES QUATRE ÉTAPES, dans l'ordre exact de Tools (constante STEPS) :
 *   1. Énergie — deux cartes, et l'on passe seul à l'étape suivante une fois le choix fait
 *   2. Points de livraison — recherche, sélection multiple, type d'opportunité déduit
 *   3. Contact décisionnaire — pré-rempli quand un seul PDL porte un responsable
 *   4. Date prévisionnelle de signature — avec l'aperçu du nom généré
 *
 * CE QUI DIFFÈRE DE TOOLS, ET POURQUOI.
 *
 * • Le point de départ. Dans Tools le wizard est une page ouverte depuis un compte, et les PDL
 *   éligibles sont ceux dont `Statut_du_mandat__c` vaut « Actif ». Kimatch ouvre un dialogue qui
 *   peut venir de la liste des recommandations, sans compte connu : on ajoute alors une étape
 *   « Compte » en tête. Elle disparaît quand on arrive d'une fiche compte, où le compte est su.
 *
 * • Le mandat n'est plus choisi à la main. L'ancien dialogue demandait de sélectionner un mandat
 *   avant tout, ce que Tools ne fait pas : c'est au PDL de porter l'information. On retient
 *   désormais, comme Tools, tous les PDL du compte couverts par un mandat ACTIF, et le mandat
 *   rattaché à la recommandation est déduit de ceux-là. L'utilisateur n'a plus à deviner quel
 *   mandat couvre le point de livraison qu'il vise.
 *
 * • La date se saisit dans un champ `date` natif plutôt que dans le calendrier de Tools : le
 *   projet n'embarque pas de composant calendrier, et en ajouter un pour ce seul écran coûterait
 *   plus qu'il ne rapporte. Le garde-fou de préavis, lui, est repris tel quel — en mieux, voir
 *   plus bas.
 *
 * • Le seuil de préavis est calculé sur le préavis réel du contrat en cours quand Kimatch le
 *   connaît (`contrats.preavis_resiliation_jours`), là où Tools retranche deux mois en dur faute
 *   d'avoir le champ. Comportement déjà en place avant cette réécriture, conservé.
 *
 * • Origine, priorité, description et commentaire interne n'existent pas dans Tools mais existent
 *   dans Kimatch. Les supprimer serait une perte : ils sont regroupés en fin de parcours, repliés.
 */
import { useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle, Briefcase, Check, ChevronLeft, ChevronRight, Flame, Info,
  Loader2, Mail, MapPin, Phone, Search, Zap,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Dialog } from '@/components/ui/dialog'
import { FormField, Input, Select, Textarea } from '@/components/ui/form'
import { WizardConnectionGate } from '@/components/ui/connection-gate'
import { ContactPicker } from '@/components/contact/ContactPicker'
import { EllisphereScoreCard } from '@/components/opportunite/EllisphereScoreCard'
import { useRecommandationsListe, useCreateRecommandation, compteursDejaEngages } from '@/lib/data/recommandations'
import { useMandats } from '@/lib/data/mandats'
import { useCompteurs } from '@/lib/data/compteurs'
import { useContacts } from '@/lib/data/contacts'
import { useContrats } from '@/lib/data/contrats'
import { useComptes } from '@/lib/data/comptes'
import { useSitesParCompte } from '@/lib/data/sites'
import { useReferenceTable } from '@/lib/data/referenceTables'
import { FALLBACK_ETAPES_RECOMMANDATION, FALLBACK_TYPES_ORIGINES, FALLBACK_TYPES_ENERGIES } from '@/lib/referenceFallbacks'
import { trouverParCode } from '@/lib/codeReferentiel'
import { cn } from '@/lib/utils'
import type { Compteur } from '@/types/domain'
import { appelerNumero } from '@/lib/telephonie'

const PRIORITE_OPTIONS = [
  { value: 1, label: 'Haute' },
  { value: 2, label: 'Normale' },
  { value: 3, label: 'Basse' },
]

/** Un PDL compte pour « client » dès qu'un contrat vivant le couvre. */
const STATUTS_CONTRAT_CLIENT = new Set(['ACTIF', 'A_RENOUVELER'])

/** Préavis retenu quand le contrat en cours ne le précise pas. */
const PREAVIS_DEFAUT_JOURS = 60

function normalizeAccents(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').trim()
}

/** Titre auto-généré, jamais saisi à la main — reprend buildOpportunityName() de Tools
 *  (`src/lib/opportunity-actions.ts`) : « {icône} {COMPTE}[ - SITE] » pour un seul PDL,
 *  « {icône} MULTISITE - {date} - {COMPTE} » au-delà. */
function buildTitre(
  typeEnergie: 'electricite' | 'gaz',
  compteNom: string,
  siteNom: string | null | undefined,
  pdlCount: number,
  dateCloture: string,
): string {
  const icon = typeEnergie === 'gaz' ? '🔥' : '⚡'
  const acc = normalizeAccents(compteNom).toUpperCase()
  if (pdlCount === 1) {
    const site = siteNom ? ` - ${normalizeAccents(siteNom)}` : ''
    return `${icon} ${acc}${site}`
  }
  return `${icon} MULTISITE - ${dateCloture} - ${acc}`
}

export function CreateRecommandationDialog({
  open,
  onClose,
  onCreated,
  initialCompteId,
  opportuniteId,
  initialCompteurIds,
}: {
  open: boolean
  onClose: () => void
  onCreated: (recoId: string) => void
  initialCompteId?: string
  /**
   * L'opportunité qu'on convertit, quand on arrive de sa fiche. Diapositive 10 : « une opportunité
   * convertie peut créer plusieurs recommandations selon les périmètres à traiter » — donc ce
   * dialogue s'ouvre autant de fois qu'il y a de périmètres, et chaque recommandation garde le lien.
   */
  opportuniteId?: string
  /** Périmètre proposé au départ — celui de l'opportunité. Reste modifiable : c'est justement le
   *  geste de découper en plusieurs recommandations. */
  initialCompteurIds?: string[]
}) {
  const { data: mandats } = useMandats()
  const { data: compteurs } = useCompteurs()
  const { data: contacts } = useContacts()
  const { data: contrats } = useContrats()
  const { data: recommandations } = useRecommandationsListe()
  const { data: comptes } = useComptes()
  const { data: etapesRef } = useReferenceTable('etapes_recommandation')
  const etapes = etapesRef && etapesRef.length > 0 ? etapesRef : FALLBACK_ETAPES_RECOMMANDATION
  const { data: originesRef } = useReferenceTable('types_origines')
  const origines = originesRef && originesRef.length > 0 ? originesRef : FALLBACK_TYPES_ORIGINES
  const { data: energiesRef } = useReferenceTable('types_energies')
  const energies = energiesRef && energiesRef.length > 0 ? energiesRef : FALLBACK_TYPES_ENERGIES
  const createRecommandation = useCreateRecommandation()

  // L'étape « Compte » n'existe que lorsqu'on n'arrive pas d'une fiche compte.
  const compteImpose = !!initialCompteId
  const ETAPES = useMemo(
    () => (compteImpose ? [] : ['Compte']).concat(['Énergie', 'Points de livraison', 'Contact décisionnaire', 'Date prévisionnelle de signature']),
    [compteImpose],
  )

  const [etape, setEtape] = useState(1)
  const [compteId, setCompteId] = useState(initialCompteId ?? '')
  const [typeEnergieId, setTypeEnergieId] = useState('')
  const [compteurIds, setCompteurIds] = useState<string[]>(initialCompteurIds ?? [])
  const [contactId, setContactId] = useState('')
  const [dateClotureManuelle, setDateClotureManuelle] = useState('')
  const [rechercheP, setRechercheP] = useState('')
  const [rechercheC, setRechercheC] = useState('')
  const [origineId, setOrigineId] = useState('')
  const [priorite, setPriorite] = useState(2)
  const [description, setDescription] = useState('')
  const [commentaireInterne, setCommentaireInterne] = useState('')
  const [complementsOuverts, setComplementsOuverts] = useState(false)
  const [feedback, setFeedback] = useState<string | null>(null)
  const [termine, setTermine] = useState(false)

  // Index des étapes, décalé d'un cran quand « Compte » est présent.
  const iEnergie = compteImpose ? 1 : 2
  const iPdl = iEnergie + 1
  const iContact = iEnergie + 2
  const iDate = iEnergie + 3

  const typeEnergie = (energies.find((e) => e.id === typeEnergieId)?.code?.toLowerCase() === 'gaz' ? 'gaz' : 'electricite') as 'electricite' | 'gaz'
  const compteCible = comptes?.find((c) => c.id === compteId)
  const { data: sitesDuCompte } = useSitesParCompte(compteId || undefined)
  const engages = useMemo(() => compteursDejaEngages(recommandations ?? []), [recommandations])

  /**
   * PDL éligibles — la règle de Tools, transposée.
   *
   * Tools lit `Statut_du_mandat__c = 'Actif'` porté par le PDL lui-même ; Kimatch n'a pas ce
   * champ, l'information vit dans le mandat. On retient donc les compteurs couverts par au moins
   * un mandat ACTIF du compte. S'y ajoutent les deux mêmes filtres que Tools : l'énergie choisie,
   * et l'exclusion des PDL déjà engagés sur une opportunité en cours (`busyPdlIds` là-bas,
   * `compteursDejaEngages` ici).
   */
  const mandatsActifsDuCompte = useMemo(
    () => (mandats ?? []).filter((m) => m.compte_id === compteId && m.statut === 'ACTIF'),
    [mandats, compteId],
  )
  const compteursSousMandat = useMemo(() => {
    const ids = new Set<string>()
    for (const m of mandatsActifsDuCompte) for (const c of m.compteur_ids) ids.add(c)
    return ids
  }, [mandatsActifsDuCompte])

  const compteursEligibles = useMemo(() => {
    if (!compteId || !typeEnergieId) return []
    return (compteurs ?? []).filter(
      (c) => compteursSousMandat.has(c.id) && c.type_energie === typeEnergie && !engages.has(c.id),
    )
  }, [compteId, typeEnergieId, typeEnergie, compteurs, compteursSousMandat, engages])

  // LES COMPTES OUVRANT DROIT À UNE RECOMMANDATION : ceux qui portent au moins un mandat actif.
  // Même règle qu'avant, seule la présentation change.
  //
  // On les enrichit depuis la liste des comptes pour pouvoir chercher sur le SIREN et la ville, et
  // pas seulement sur le nom : deux syndics homonymes ne se distinguent que par là.
  const comptesEligibles = useMemo(() => {
    const parId = new Map((comptes ?? []).map((c) => [c.id, c]))
    const parCompte = new Map<
      string,
      { id: string; nom: string; siren: string | null; ville: string; mandats: number }
    >()
    for (const m of mandats ?? []) {
      if (m.statut !== 'ACTIF') continue
      const deja = parCompte.get(m.compte_id)
      if (deja) {
        deja.mandats += 1
        continue
      }
      const compte = parId.get(m.compte_id)
      parCompte.set(m.compte_id, {
        id: m.compte_id,
        nom: compte?.nom || m.compte_nom || 'Compte',
        siren: compte?.siren ?? null,
        ville: compte?.ville || '',
        mandats: 1,
      })
    }
    return [...parCompte.values()].sort((a, b) => a.nom.localeCompare(b.nom))
  }, [mandats, comptes])

  const comptesAffiches = useMemo(() => {
    const q = rechercheC.trim().toLowerCase()
    if (!q) return comptesEligibles
    return comptesEligibles.filter((c) =>
      [c.nom, c.siren, c.ville].filter(Boolean).some((v) => String(v).toLowerCase().includes(q)),
    )
  }, [comptesEligibles, rechercheC])

  const codePostalDe = useMemo(() => {
    const parSite = new Map((sitesDuCompte ?? []).map((s) => [s.id, s.code_postal]))
    return (c: Compteur) => parSite.get(c.site_id) || ''
  }, [sitesDuCompte])

  // Recherche sur le PDL, le libellé de site et le code postal — les trois champs de Tools.
  const compteursAffiches = useMemo(() => {
    const q = rechercheP.trim().toLowerCase()
    if (!q) return compteursEligibles
    return compteursEligibles.filter((c) =>
      [c.numero_pdl, c.utilisation, c.site_nom, codePostalDe(c)]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q)),
    )
  }, [compteursEligibles, rechercheP, codePostalDe])

  const compteursChoisis = useMemo(
    () => compteursEligibles.filter((c) => compteurIds.includes(c.id)),
    [compteursEligibles, compteurIds],
  )

  const contactsDuCompte = contacts?.filter((c) => c.compte_id === compteId) ?? []

  // Mix client/prospect : blocage dur, exactement comme `mixError` dans Tools.
  const contratsParCompteurId = useMemo(() => {
    const map = new Map<string, boolean>()
    for (const c of contrats ?? []) {
      if (!STATUTS_CONTRAT_CLIENT.has(c.statut)) continue
      for (const cpt of c.compteurs) map.set(cpt.id, true)
    }
    return map
  }, [contrats])
  const estClient = (c: Compteur) => !!contratsParCompteurId.get(c.id)
  const mixStatuts = new Set(compteursChoisis.map((c) => (estClient(c) ? 'client' : 'prospect')))
  const mixInvalide = mixStatuts.size > 1
  // « Renouvellement » seulement si TOUS les PDL sont clients — règle d'`opportunityType`.
  const typeOpportunite = compteursChoisis.length > 0 && compteursChoisis.every(estClient) ? 'Renouvellement' : 'Captation'

  // Contact décisionnaire : suggéré quand un seul PDL est retenu et qu'il porte un responsable.
  const responsableSuggere = compteursChoisis.length === 1 ? compteursChoisis[0].responsable_contact_id : null
  const contactEffectifId = contactId || responsableSuggere || ''
  const responsablesDesPdl = new Set(compteursChoisis.map((c) => c.responsable_contact_id).filter(Boolean))
  const contactHorsResponsables = !!contactEffectifId && responsablesDesPdl.size > 0 && !responsablesDesPdl.has(contactEffectifId)

  // Seuil de préavis : la plus proche des échéances, diminuée du préavis réel du contrat en cours.
  const dateClotureSuggeree = useMemo(() => {
    if (compteursChoisis.length === 0) return ''
    const dates = compteursChoisis
      .map((c) => {
        if (!c.date_echeance) return null
        const contratActuel = (contrats ?? []).find(
          (ct) => STATUTS_CONTRAT_CLIENT.has(ct.statut) && ct.compteurs.some((cpt) => cpt.id === c.id),
        )
        const preavis = contratActuel?.preavis_resiliation_jours ?? PREAVIS_DEFAUT_JOURS
        const d = new Date(c.date_echeance)
        d.setDate(d.getDate() - preavis)
        return d
      })
      .filter((d): d is Date => d != null)
    if (dates.length === 0) return ''
    return dates.reduce((a, b) => (a < b ? a : b)).toISOString().slice(0, 10)
  }, [compteursChoisis, contrats])
  const dateCloture = dateClotureManuelle || dateClotureSuggeree

  const titre = compteCible && compteursChoisis.length > 0
    ? buildTitre(typeEnergie, compteCible.nom, compteursChoisis[0].site_nom, compteursChoisis.length, dateCloture)
    : ''

  // Le mandat porté par la recommandation : celui qui couvre le premier PDL retenu. Il n'est plus
  // demandé à l'utilisateur, Tools ne le lui demande pas non plus.
  const mandatRetenu = useMemo(() => {
    if (compteursChoisis.length === 0) return null
    const premier = compteursChoisis[0].id
    return mandatsActifsDuCompte.find((m) => m.compteur_ids.includes(premier)) ?? null
  }, [compteursChoisis, mandatsActifsDuCompte])

  function reset() {
    setEtape(1)
    setCompteId(initialCompteId ?? '')
    setTypeEnergieId('')
    setCompteurIds([])
    setContactId('')
    setDateClotureManuelle('')
    setRechercheP('')
    setOrigineId('')
    setPriorite(2)
    setDescription('')
    setCommentaireInterne('')
    setComplementsOuverts(false)
    setFeedback(null)
    setTermine(false)
  }

  function fermer() {
    reset()
    onClose()
  }

  // Choix de l'énergie : on avance seul, comme `selectEnergie` dans Tools (250 ms).
  function choisirEnergie(id: string) {
    setTypeEnergieId(id)
    setCompteurIds([])
    setTimeout(() => setEtape(iPdl), 250)
  }

  // Un seul PDL porteur d'un responsable : on remplit et on avance (300 ms dans Tools).
  useEffect(() => {
    if (etape !== iContact || contactId || compteursChoisis.length !== 1) return
    if (!compteursChoisis[0].responsable_contact_id) return
    const t = setTimeout(() => setEtape(iDate), 300)
    return () => clearTimeout(t)
  }, [etape, iContact, iDate, contactId, compteursChoisis])

  function basculerCompteur(id: string) {
    setCompteurIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }

  const peutAvancer = (() => {
    if (!compteImpose && etape === 1) return !!compteId
    if (etape === iEnergie) return !!typeEnergieId
    if (etape === iPdl) return compteurIds.length >= 1 && !mixInvalide
    if (etape === iContact) return !!contactEffectifId
    // Sans mandat retenu, `recommandations_mandats` recevrait un identifiant vide : l'insertion
    // échouerait sans que rien ne le signale, et la recommandation naîtrait détachée de son mandat.
    if (etape === iDate) return !!dateCloture && !!mandatRetenu
    return false
  })()

  async function creer() {
    if (createRecommandation.isPending || termine) return
    if (!compteCible || compteursChoisis.length === 0 || mixInvalide || !mandatRetenu) return
    const origine = origines.find((o) => o.id === origineId)
    const etapeInitiale = trouverParCode(etapes, 'BROUILLON', 'CONSULTATION')

    const result = await createRecommandation.mutateAsync({
      titre,
      mandat_id: mandatRetenu.id,
      compte_id: compteCible.id,
      compte_nom: compteCible.nom,
      type_energie_id: typeEnergieId || null,
      type_energie: typeEnergie,
      compteurs: compteursChoisis.map((c) => ({ id: c.id, site_id: c.site_id, site_nom: c.site_nom })),
      contact_signataire_id: contactEffectifId || null,
      date_cloture: dateCloture || null,
      type_opportunite: typeOpportunite,
      opportunite_id: opportuniteId ?? null,
      etape_id: etapeInitiale?.id ?? null,
      origine_id: origineId || null,
      origine_libelle: origine?.libelle,
      priorite,
      description,
      commentaire_interne: commentaireInterne,
    })

    setFeedback(result.persisted ? 'Recommandation créée.' : 'Recommandation ajoutée localement (non synchronisée avec Supabase).')
    if (result.persisted) {
      setTermine(true)
      // Tools enchaîne sur la cotation ; l'équivalent ici est la fiche, d'où part la version.
      setTimeout(() => {
        onCreated(result.recommandation.id)
        reset()
      }, 700)
    }
  }

  const etapeCourante = ETAPES[etape - 1]

  return (
    <Dialog
      open={open}
      onClose={fermer}
      title="Nouvelle recommandation"
      description="Créer une opportunité sur un ou plusieurs points de livraison d'un compte."
      className="max-w-3xl"
    >
      <WizardConnectionGate required={['crm']} feature="création d'opportunité">
        <div className="max-h-[75vh] space-y-4 overflow-y-auto pr-1">
          {/* Fil d'avancement — même principe que le stepper de Tools. */}
          <div className="flex items-center gap-2">
            {ETAPES.map((label, i) => {
              const idx = i + 1
              const active = idx === etape
              const passee = idx < etape
              return (
                <div key={label} className="flex flex-1 items-center gap-2">
                  <div
                    className={cn(
                      'flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold transition-colors',
                      passee && 'bg-km-green text-white',
                      active && 'bg-km-green-soft text-km-green ring-2 ring-kiwi-300',
                      !active && !passee && 'bg-km-soft text-km-faint',
                    )}
                  >
                    {passee ? <Check className="h-3.5 w-3.5" /> : idx}
                  </div>
                  <span className={cn('hidden truncate text-xs font-medium sm:inline', active ? 'text-km-text' : 'text-km-faint')}>
                    {label}
                  </span>
                  {idx < ETAPES.length && <div className="h-px flex-1 bg-km-soft" />}
                </div>
              )
            })}
          </div>

          {/* Note Ellipro — même emplacement qu'en tête du wizard de Tools. */}
          {compteCible && <EllisphereScoreCard key={compteCible.id} compteId={compteCible.id} siren={compteCible.siren} />}

          <Card className="min-h-[340px] p-5">
            {/* ÉTAPE « Compte » — propre à Kimatch, absente quand on vient d'une fiche compte. */}
            {/* ÉTAPE « Compte » — propre à Kimatch, absente quand on vient d'une fiche compte.

                UNE RECHERCHE, PLUS UN DÉROULANT. Michel, 21/08/2026 : « il va me demander de
                chercher un compte, mais en fait là c'est une liste carrément. C'est-à-dire que si
                ton truc c'est Z, il faut aller jusqu'à Z à chaque fois. Je ne peux pas faire une
                recherche directement comme dans les autres. » Six cent seize comptes portent un
                mandat actif : un `<select>` natif y est inutilisable.

                L'étape suivante de ce même wizard — les points de livraison — cherchait déjà de
                cette façon. On reprend son montage à l'identique : champ de recherche, compteur de
                résultats, lignes cliquables dans un cadre qui défile. Une seule manière de choisir
                à apprendre dans le parcours, au lieu de deux. */}
            {!compteImpose && etape === 1 && (
              <div className="space-y-3">
                <div className="space-y-1">
                  <h4 className="text-base font-semibold text-km-text">Sur quel compte ?</h4>
                  <p className="text-sm text-km-muted">
                    {comptesEligibles.length} compte{comptesEligibles.length > 1 ? 's' : ''} avec un
                    mandat actif — seuls ceux-là ont des PDL éligibles.
                  </p>
                </div>

                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-km-faint" />
                  <Input
                    value={rechercheC}
                    onChange={(e) => setRechercheC(e.target.value)}
                    placeholder="Rechercher (nom, SIREN, ville)…"
                    className="pl-9"
                    autoFocus
                  />
                </div>

                {/* Le compte retenu est rappelé sous le champ : sa ligne peut avoir défilé hors du
                    cadre, et on doit pouvoir vérifier son choix sans remonter. */}
                <div className="flex items-center justify-between gap-3 text-sm">
                  <span className="min-w-0 truncate">
                    {compteCible ? (
                      <>
                        <span className="text-km-faint">Choisi : </span>
                        <strong className="text-km-text">{compteCible.nom}</strong>
                      </>
                    ) : (
                      <span className="text-km-faint">Aucun compte choisi</span>
                    )}
                  </span>
                  {rechercheC.trim() !== '' && (
                    <span className="shrink-0 text-km-faint">
                      {comptesAffiches.length} résultat{comptesAffiches.length > 1 ? 's' : ''}
                    </span>
                  )}
                </div>

                <div className="max-h-[300px] space-y-1.5 overflow-y-auto pr-1">
                  {comptesAffiches.length === 0 ? (
                    <p className="py-10 text-center text-sm text-km-faint">
                      Aucun compte ne correspond. Un compte sans mandat actif n'apparaît pas ici.
                    </p>
                  ) : (
                    comptesAffiches.map((c) => {
                      const choisi = compteId === c.id
                      return (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => { setCompteId(c.id); setCompteurIds([]); setContactId('') }}
                          className={cn(
                            'flex w-full items-center gap-3 rounded-lg border p-2.5 text-left transition-all',
                            choisi
                              ? 'border-km-green bg-kiwi-50 ring-1 ring-kiwi-200'
                              : 'border-km-line hover:border-kiwi-300 hover:bg-km-bg',
                          )}
                        >
                          <div
                            className={cn(
                              'flex h-5 w-5 shrink-0 items-center justify-center rounded-full',
                              choisi ? 'bg-km-green text-white' : 'border border-km-line',
                            )}
                          >
                            {choisi && <Check className="h-3.5 w-3.5" />}
                          </div>
                          <Briefcase className="h-4 w-4 shrink-0 text-km-faint" />
                          <div className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-medium text-km-text">{c.nom}</span>
                            <span className="mt-0.5 block truncate text-xs text-km-faint">
                              {[c.ville, c.siren ? `SIREN ${c.siren}` : null].filter(Boolean).join(' · ') || '—'}
                            </span>
                          </div>
                          <Badge tone="neutral">
                            {c.mandats} mandat{c.mandats > 1 ? 's' : ''}
                          </Badge>
                        </button>
                      )
                    })
                  )}
                </div>
              </div>
            )}

            {/* ÉTAPE 1 — Énergie */}
            {etape === iEnergie && (
              <div className="space-y-5">
                <div className="space-y-1 text-center">
                  <h4 className="text-base font-semibold text-km-text">Quelle énergie ?</h4>
                  <p className="text-sm text-km-muted">Choisis l'énergie principale de l'opportunité</p>
                </div>
                <div className="mx-auto grid max-w-xl grid-cols-1 gap-4 sm:grid-cols-2">
                  {energies.map((en) => {
                    const gaz = en.code?.toLowerCase() === 'gaz'
                    const actif = typeEnergieId === en.id
                    const Icone = gaz ? Flame : Zap
                    return (
                      <button
                        key={en.id}
                        type="button"
                        onClick={() => choisirEnergie(en.id)}
                        className={cn(
                          'group rounded-xl border-2 p-5 text-left transition-all hover:-translate-y-0.5 hover:shadow-md',
                          actif
                            ? gaz ? 'border-violet-400 bg-violet-50 ring-2 ring-violet-200' : 'border-amber-400 bg-amber-50 ring-2 ring-amber-200'
                            : 'border-km-line bg-white hover:border-km-line',
                        )}
                      >
                        <div className="flex items-start gap-3">
                          <div className={cn(
                            'flex h-12 w-12 shrink-0 items-center justify-center rounded-lg transition-transform group-hover:scale-110',
                            actif ? (gaz ? 'bg-violet-500' : 'bg-amber-500') : (gaz ? 'bg-violet-100' : 'bg-km-amber-soft'),
                          )}>
                            <Icone className={cn('h-6 w-6', actif ? 'text-white' : gaz ? 'text-violet-500' : 'text-amber-500')} />
                          </div>
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <p className="font-semibold text-km-text">{en.libelle}</p>
                              {actif && <Check className={cn('h-4 w-4', gaz ? 'text-violet-600' : 'text-amber-600')} />}
                            </div>
                            <p className="mt-1 text-xs text-km-muted">
                              {gaz ? 'Sites raccordés au réseau gaz naturel' : 'Sites raccordés au réseau électrique'}
                            </p>
                          </div>
                        </div>
                      </button>
                    )
                  })}
                </div>
              </div>
            )}

            {/* ÉTAPE 2 — Points de livraison */}
            {etape === iPdl && (
              <div className="space-y-3">
                <div className="space-y-1">
                  <h4 className="text-base font-semibold text-km-text">Points de livraison éligibles</h4>
                  <p className="text-sm text-km-muted">
                    {compteursEligibles.length} PDL avec un mandat actif pour {typeEnergie === 'gaz' ? 'le gaz' : "l'électricité"} (hors opportunités en cours)
                  </p>
                </div>

                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-km-faint" />
                  <Input
                    value={rechercheP}
                    onChange={(e) => setRechercheP(e.target.value)}
                    placeholder="Rechercher (PDL, libellé, code postal)…"
                    className="pl-9"
                  />
                </div>

                <div className="flex items-center justify-between text-sm">
                  <span>
                    <strong className="text-km-text">{compteurIds.length}</strong>{' '}
                    <span className="text-km-faint">/ {compteursEligibles.length} sélectionné{compteurIds.length > 1 ? 's' : ''}</span>
                  </span>
                  {compteursChoisis.length > 0 && !mixInvalide && (
                    <Badge tone={typeOpportunite === 'Renouvellement' ? 'kiwi' : 'neutral'}>Type : {typeOpportunite}</Badge>
                  )}
                </div>

                {mixInvalide && (
                  <p className="flex items-center gap-1.5 rounded-lg border border-red-200 bg-km-red-soft px-3 py-2 text-xs text-red-700">
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0" /> Impossible de mélanger clients et prospects
                  </p>
                )}

                <div className="max-h-[300px] space-y-1.5 overflow-y-auto pr-1">
                  {compteursAffiches.length === 0 ? (
                    <p className="py-10 text-center text-sm text-km-faint">Aucun point de livraison éligible</p>
                  ) : (
                    compteursAffiches.map((c) => {
                      const choisi = compteurIds.includes(c.id)
                      const cp = codePostalDe(c)
                      const client = estClient(c)
                      return (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => basculerCompteur(c.id)}
                          className={cn(
                            'flex w-full items-center gap-3 rounded-lg border p-2.5 text-left transition-all',
                            choisi ? 'border-km-green bg-kiwi-50 ring-1 ring-kiwi-200' : 'border-km-line hover:border-kiwi-300 hover:bg-km-bg',
                          )}
                        >
                          <div className={cn(
                            'flex h-5 w-5 shrink-0 items-center justify-center rounded',
                            choisi ? 'bg-km-green text-white' : 'border border-km-line',
                          )}>
                            {choisi && <Check className="h-3.5 w-3.5" />}
                          </div>
                          {c.type_energie === 'gaz'
                            ? <Flame className="h-4 w-4 shrink-0 text-violet-500" />
                            : <Zap className="h-4 w-4 shrink-0 text-amber-500" />}
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="truncate text-sm font-medium text-km-text">{c.utilisation || c.site_nom}</span>
                              <Badge tone={client ? 'kiwi' : 'neutral'}>{client ? 'Client' : 'Prospect'}</Badge>
                            </div>
                            <div className="mt-0.5 flex items-center gap-2 text-xs text-km-faint">
                              <span className="font-mono">{c.numero_pdl}</span>
                              {cp && <><span>·</span><span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{cp}</span></>}
                              {c.date_echeance && <><span>·</span><span>Échéance {new Date(c.date_echeance).toLocaleDateString('fr-FR')}</span></>}
                            </div>
                          </div>
                        </button>
                      )
                    })
                  )}
                </div>
              </div>
            )}

            {/* ÉTAPE 3 — Contact décisionnaire */}
            {etape === iContact && (
              <div className="mx-auto max-w-xl space-y-3">
                <div className="space-y-1 text-center">
                  <h4 className="text-base font-semibold text-km-text">Contact décisionnaire</h4>
                </div>

                <ContactPicker
                  value={contactEffectifId}
                  onChange={setContactId}
                  accountContacts={contactsDuCompte}
                  allContacts={contacts ?? []}
                  accountId={compteId}
                  accountNom={compteCible?.nom}
                  segment={compteCible?.segment}
                />

                {/* Récapitulatif du contact retenu — la carte de rappel de Tools. */}
                {(() => {
                  const ct = contacts?.find((x) => x.id === contactEffectifId)
                  if (!ct) return null
                  return (
                    <Card className="border-dashed bg-km-bg p-3.5">
                      <div className="flex items-start gap-3">
                        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-km-green font-semibold text-white">
                          {`${(ct.prenom || '?')[0]}${(ct.nom || '?')[0]}`.toUpperCase()}
                        </div>
                        <div className="min-w-0 flex-1 space-y-1">
                          <p className="font-semibold text-km-text">{ct.prenom} {ct.nom}</p>
                          {ct.fonction && (
                            <p className="flex items-center gap-1.5 text-xs text-km-muted"><Briefcase className="h-3 w-3" />{ct.fonction}</p>
                          )}
                          {ct.email && (
                            <p className="flex items-center gap-1.5 text-xs text-km-muted">
                              <Mail className="h-3 w-3" />
                              <a href={`mailto:${ct.email}`} className="truncate hover:text-km-text">{ct.email}</a>
                            </p>
                          )}
                          {ct.telephone && (
                            <p className="flex items-center gap-1.5 text-xs text-km-muted">
                              <Phone className="h-3 w-3" />
                              <button
                                type="button"
                                onClick={() => void appelerNumero(ct.telephone)}
                                className="hover:text-km-text hover:underline"
                              >
                                {ct.telephone}
                              </button>
                            </p>
                          )}
                        </div>
                      </div>
                    </Card>
                  )
                })()}

                {contactHorsResponsables && (
                  <p className="flex items-start gap-1.5 rounded-md border border-amber-200 bg-amber-50 p-2 text-xs text-amber-900">
                    <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" /> Ton contact n'est pas renseigné comme étant le responsable du PDL en question, si tu veux continuer, penses à modifier le responsable du PDL 😊
                  </p>
                )}
              </div>
            )}

            {/* ÉTAPE 4 — Date prévisionnelle de signature */}
            {etape === iDate && (
              <div className="mx-auto max-w-md space-y-4">
                <div className="space-y-1 text-center">
                  <h4 className="text-base font-semibold text-km-text">Date prévisionnelle de signature</h4>
                </div>

                <FormField label="Date de clôture *">
                  <Input type="date" value={dateCloture} onChange={(e) => setDateClotureManuelle(e.target.value)} />
                  {dateClotureSuggeree && (
                    <p className="mt-1 text-xs text-km-faint">
                      Passé le <strong className="text-km-text">{new Date(dateClotureSuggeree).toLocaleDateString('fr-FR')}</strong>, le préavis de résiliation risque d'être dépassé et la signature compromise.
                    </p>
                  )}
                </FormField>

                {dateClotureSuggeree && dateCloture > dateClotureSuggeree && (
                  <p className="flex items-start gap-1.5 rounded-md border border-amber-200 bg-amber-50 p-2 text-xs text-amber-900">
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> Préavis peut-être dépassé — confirme avec le client.
                  </p>
                )}

                {titre && (
                  <div className="rounded-lg border-2 border-dashed border-km-line p-3 text-center">
                    <p className="mb-1 text-xs text-km-faint">Nom de la recommandation</p>
                    <p className="text-sm font-medium text-km-text">{titre}</p>
                  </div>
                )}

                {compteursChoisis.length > 0 && !mandatRetenu && (
                  <p className="flex items-start gap-1.5 rounded-md border border-red-200 bg-km-red-soft p-2 text-xs text-red-700">
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> Aucun mandat actif ne couvre le premier PDL retenu — la recommandation ne peut pas être rattachée.
                  </p>
                )}

                {/* Champs propres à Kimatch, repliés pour ne pas alourdir le parcours de Tools. */}
                <div className="rounded-lg border border-km-line">
                  <button
                    type="button"
                    onClick={() => setComplementsOuverts((v) => !v)}
                    className="flex w-full items-center justify-between px-3 py-2 text-xs font-medium text-km-muted hover:bg-km-bg"
                  >
                    Informations complémentaires
                    <ChevronRight className={cn('h-3.5 w-3.5 transition-transform', complementsOuverts && 'rotate-90')} />
                  </button>
                  {complementsOuverts && (
                    <div className="space-y-2.5 border-t border-km-line p-3">
                      <div className="grid grid-cols-2 gap-3">
                        <FormField label="Origine">
                          <Select value={origineId} onChange={(e) => setOrigineId(e.target.value)}>
                            <option value="">Sélectionner…</option>
                            {origines.map((o) => <option key={o.id} value={o.id}>{o.libelle}</option>)}
                          </Select>
                        </FormField>
                        <FormField label="Priorité">
                          <Select value={priorite} onChange={(e) => setPriorite(Number(e.target.value))}>
                            {PRIORITE_OPTIONS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
                          </Select>
                        </FormField>
                      </div>
                      <FormField label="Description">
                        <Textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
                      </FormField>
                      <FormField label="Commentaire interne">
                        <Textarea rows={2} value={commentaireInterne} onChange={(e) => setCommentaireInterne(e.target.value)} placeholder="Visible en interne uniquement" />
                      </FormField>
                    </div>
                  )}
                </div>
              </div>
            )}
          </Card>

          {feedback && <p className="text-xs text-km-muted">{feedback}</p>}

          {/* Pied de navigation — « Retour » à gauche, action à droite, comme Tools. L'étape
              Énergie n'a pas de bouton « Continuer » : le choix fait avancer tout seul. */}
          <div className="flex items-center justify-between border-t border-km-line pt-3">
            <Button
              type="button"
              variant="ghost"
              onClick={() => (etape === 1 ? fermer() : setEtape((s) => Math.max(1, s - 1)))}
              disabled={createRecommandation.isPending}
            >
              {etape === 1 ? 'Annuler' : <><ChevronLeft className="h-4 w-4" /> Retour</>}
            </Button>

            {etape < ETAPES.length ? (
              etape === iEnergie ? (
                <span />
              ) : (
                <Button type="button" onClick={() => setEtape((s) => Math.min(ETAPES.length, s + 1))} disabled={!peutAvancer}>
                  Continuer <ChevronRight className="h-4 w-4" />
                </Button>
              )
            ) : (
              <Button type="button" onClick={creer} disabled={!peutAvancer || createRecommandation.isPending || termine}>
                {createRecommandation.isPending ? (
                  <><Loader2 className="h-4 w-4 animate-spin" /> Création…</>
                ) : termine ? (
                  <><Check className="h-4 w-4" /> Créée — ouverture…</>
                ) : (
                  <>Créer et ouvrir la recommandation</>
                )}
              </Button>
            )}
          </div>

          {/* Repère discret : sans cette mention, on ne sait plus où l'on est une fois le fil
              d'avancement sorti du champ de vision sur un petit écran. */}
          <p className="text-center text-km-label text-km-faint">Étape {etape} sur {ETAPES.length} — {etapeCourante}</p>
        </div>
      </WizardConnectionGate>
    </Dialog>
  )
}
