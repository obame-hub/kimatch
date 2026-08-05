import { useEffect, useMemo, useState } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import {
  ArrowLeft,
  Phone,
  Mail,
  Plus,
  Building2,
  Users,
  Gauge,
  Loader2,
  Pencil,
  Trash2,
  FileCheck2,
  FileText,
  Sparkle,
  Radio,
  UploadCloud,
  MapPin,
  Search,
  AlertTriangle,
} from 'lucide-react'
import { Topbar } from '@/components/layout/Topbar'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { EntityLink } from '@/components/ui/entity-link'
import { Dialog } from '@/components/ui/dialog'
import { Sheet } from '@/components/ui/sheet'
import { ContactForm } from '@/components/contact/ContactForm'
import { PdlMethodSheet } from '@/components/compteur/PdlMethodSheet'
import { CreateMandatDialog } from '@/pages/Mandats'
import { CreateRecommandationDialog } from '@/pages/Recommandations'
import { FormField, Input, Select, Textarea } from '@/components/ui/form'
import { HistoriqueDiscret } from '@/components/ui/historique-discret'
import { InlineField } from '@/components/ui/inline-field'
import { AddressAutocomplete } from '@/components/ui/address-autocomplete'
import { PdlDraftRows, emptyPdlDraft, buildDraftCharacteristics, champsPdlManquants, type PdlDraft } from '@/components/compteur/PdlDraftRows'
import { MandatChainPrompt, type ChainedCompteur } from '@/components/compteur/MandatChainPrompt'
import {
  useComptes,
  useUpdateCompteScore,
  useUpdateCompteClient,
  useUpdateCompteFournisseur,
  useUpdateComptePartenaire,
  useUpdateCompte,
  useUpdateCompteField,
  useDeleteCompte,
} from '@/lib/data/comptes'
import { useSites, useCreateSite, matchSitesPourCompteur } from '@/lib/data/sites'
import { useContacts } from '@/lib/data/contacts'
import { useSignaux } from '@/lib/data/signaux'
import { useCompteurs, useCreateCompteur } from '@/lib/data/compteurs'
import { useRecommandations } from '@/lib/data/recommandations'
import { useContrats } from '@/lib/data/contrats'
import { useInteractionsForCompte } from '@/lib/data/interactions'
import { useMandats } from '@/lib/data/mandats'
import { useActions, useCreateAction } from '@/lib/data/actions'
import { useDocuments, useCreateDocument } from '@/lib/data/documents'
import { useHistorique } from '@/lib/data/historique'
import { useEllisphereScore } from '@/lib/data/ellisphere'
import { useReferenceTable } from '@/lib/data/referenceTables'
import {
  FALLBACK_STATUTS_MANDATS,
  STATUT_MANDAT_TONE,
  FALLBACK_STATUTS_VERSIONS,
  FALLBACK_ETAPES_RECOMMANDATION,
  ETAPE_TONE,
  FALLBACK_TYPES_DOCUMENTS,
  FALLBACK_TYPES_ENERGIES,
} from '@/lib/referenceFallbacks'
import { useCanManage, useIsAdmin, useProfilsAdmin } from '@/lib/data/roles'
import { ActivityFeed } from '@/components/site/ActivityFeed'
import { cn } from '@/lib/utils'
import { useGoBack } from '@/lib/useGoBack'
import type { Compte, Contact, Site, TypeCompte, Signal, Contrat, Mandat, Compteur, Recommandation } from '@/types/domain'
import { SitesMap, type SitesMapItem } from '@/components/site/SitesMap'
import { computeSiteHealth } from '@/lib/siteHealth'

const typeMeta: Record<TypeCompte, { label: string; tone: 'kiwi' | 'blue' | 'amber' | 'neutral' }> = {
  client: { label: 'Consommateur', tone: 'kiwi' },
  fournisseur: { label: 'Fournisseur', tone: 'blue' },
  partenaire: { label: 'Partenaire', tone: 'amber' },
  kiwee: { label: 'KiWee', tone: 'neutral' },
}

// Distinction graphique franche entre Client / Fournisseur / Partenaire / KiWee (demande design
// William) : un badge à pastille dédié par type, au lieu d'un badge bleu unique pour tous les
// types. Valeurs "client" mesurées pixel pour pixel dans la référence ; fournisseur/partenaire/
// kiwee dérivées du même jeu de tokens faute d'exemple de référence pour ces types (à valider
// visuellement). L'icône "compte" (dalle bleue Building2) ne varie pas : c'est la couleur de
// l'objet, pas du sous-type, cf. charte iconographique du handoff.
const TYPE_BADGE_STYLE: Record<TypeCompte, { bg: string; border: string; text: string; dot: string }> = {
  client: { bg: 'bg-kw-green-light', border: 'border-kw-green-border', text: 'text-kw-green', dot: 'bg-kw-green' },
  fournisseur: { bg: 'bg-kw-blue-light', border: 'border-sky-200', text: 'text-kw-blue', dot: 'bg-kw-blue' },
  partenaire: { bg: 'bg-kw-amber-light', border: 'border-kw-amber-border', text: 'text-kw-amber-dark', dot: 'bg-kw-amber' },
  kiwee: { bg: 'bg-kw-muted', border: 'border-kw-border-strong', text: 'text-kw-label', dot: 'bg-kw-ghost' },
}

type TabKey = 'synthese' | 'contrats' | 'compteurs' | 'recommandations' | 'signaux' | 'mandats' | 'fichiers' | 'historique' | 'activite'

function copyToClipboard(text: string, onDone: (msg: string) => void) {
  if (!text) return
  navigator.clipboard?.writeText(text).catch(() => {})
  onDone(`⧉ Copié — ${text}`)
}

export default function CompteDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const { data: comptes } = useComptes()
  const { data: sites } = useSites()
  const { data: contacts } = useContacts()
  const { data: signaux } = useSignaux()
  const { data: compteurs } = useCompteurs()
  const { data: recommandations } = useRecommandations()
  const { data: contrats } = useContrats()
  const { data: mandats } = useMandats()
  const { data: actions } = useActions()
  const { data: documents } = useDocuments()
  const ellisphereScore = useEllisphereScore()
  const updateScore = useUpdateCompteScore()
  const deleteCompte = useDeleteCompte()
  const updateCompte = useUpdateCompte()
  const createRelance = useCreateAction()
  const goBack = useGoBack('/comptes')

  const { data: statutsMandatsRef } = useReferenceTable('statuts_mandats')
  const statutsMandats = statutsMandatsRef && statutsMandatsRef.length > 0 ? statutsMandatsRef : FALLBACK_STATUTS_MANDATS
  const { data: statutsVersionsRef } = useReferenceTable('statuts_versions_recommandation')
  const statutsVersions = statutsVersionsRef && statutsVersionsRef.length > 0 ? statutsVersionsRef : FALLBACK_STATUTS_VERSIONS
  const { data: etapesRef } = useReferenceTable('etapes_recommandation')
  const etapes = etapesRef && etapesRef.length > 0 ? etapesRef : FALLBACK_ETAPES_RECOMMANDATION

  const [tab, setTab] = useState<TabKey>('synthese')
  const [toast, setToast] = useState<string | null>(null)
  const [showEditSubtype, setShowEditSubtype] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [addFichierOpen, setAddFichierOpen] = useState(false)
  const [ficCategorie, setFicCategorie] = useState<string | null>(null)
  const [addCompteurOpen, setAddCompteurOpen] = useState(false)
  const [pdlMethodOpen, setPdlMethodOpen] = useState(false)
  const [addContactOpen, setAddContactOpen] = useState(false)
  const [addMandatOpen, setAddMandatOpen] = useState(false)
  const [addRecoOpen, setAddRecoOpen] = useState(false)

  // Ouvre automatiquement "Nouveau compteur" quand on arrive depuis l'étape "que faire
  // maintenant ?" du wizard de création de compte (CompteCreate.tsx).
  useEffect(() => {
    if (searchParams.get('action') === 'ajouter-compteur') {
      setAddCompteurOpen(true)
      setSearchParams((prev) => { prev.delete('action'); return prev }, { replace: true })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function showToast(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(null), 2200)
  }

  const compte = comptes?.find((c) => c.id === id)
  const canManage = useCanManage(compte?.proprietaire_id)
  const { data: historique } = useHistorique('comptes', compte?.id)

  const sitesDuCompte = useMemo(() => sites?.filter((s) => s.compte_id === id) ?? [], [sites, id])
  const siteIdsDuCompte = useMemo(() => new Set(sitesDuCompte.map((s) => s.id)), [sitesDuCompte])
  const siteIdsArray = useMemo(() => [...siteIdsDuCompte], [siteIdsDuCompte])
  // Fiche compte : on ne charge que les interactions de ce perimetre (pas la table entiere,
  // qui met plusieurs minutes a charger une fois tous les comptes Salesforce importes).
  const { data: interactionsDuCompte = [] } = useInteractionsForCompte(id, siteIdsArray)
  const contactsDuCompte = useMemo(() => contacts?.filter((c) => c.compte_id === id) ?? [], [contacts, id])
  const signauxDuCompte = useMemo(() => signaux?.filter((s) => siteIdsDuCompte.has(s.site_id)) ?? [], [signaux, siteIdsDuCompte])
  const compteursDuCompte = useMemo(() => compteurs?.filter((c) => siteIdsDuCompte.has(c.site_id)) ?? [], [compteurs, siteIdsDuCompte])
  // Le contrat est lie directement au compte (decision Michel/William 31/07/2026), plus via site_id --
  // reste visible meme si ses compteurs ont change de cabinet entre-temps.
  const contratsDuCompte = useMemo(() => contrats?.filter((c) => c.compte_id === id) ?? [], [contrats, id])
  const recommandationsDuCompte = useMemo(() => recommandations?.filter((r) => r.compte_id === id) ?? [], [recommandations, id])
  const mandatsDuCompte = useMemo(() => mandats?.filter((m) => m.compte_id === id) ?? [], [mandats, id])
  const actionsDuCompte = useMemo(() => actions?.filter((a) => siteIdsDuCompte.has(a.site_id ?? '')) ?? [], [actions, siteIdsDuCompte])
  const documentsDuCompte = useMemo(() => documents?.filter((d) => d.entite_type === 'compte' && d.entite_id === id) ?? [], [documents, id])
  const categoriesFichiers = useMemo(() => [...new Set(documentsDuCompte.map((d) => d.type_document).filter(Boolean))], [documentsDuCompte])
  const documentsFiltresParCategorie = ficCategorie ? documentsDuCompte.filter((d) => d.type_document === ficCategorie) : documentsDuCompte

  const contactPrincipal = contactsDuCompte.find((c) => c.contact_principal) ?? contactsDuCompte[0]

  async function handleScoreClick() {
    if (!compte?.siren) return
    const score = await ellisphereScore.mutateAsync(compte.siren)
    updateScore.mutate({ compteId: compte.id, score })
  }

  async function handleDelete() {
    if (!compte) return
    await deleteCompte.mutateAsync(compte.id)
    navigate('/comptes')
  }

  // Bouton "Relance" du header (design William) : crée une tâche de relance à échéance du jour.
  // La table actions n'a pas de compte_id (seulement site_id/contact_id) -- on la rattache donc
  // au premier site du compte, comme le reste de l'onglet Activité qui agrège déjà par site.
  async function handleRelance() {
    const site = sitesDuCompte[0]
    if (!site || !compte) return
    await createRelance.mutateAsync({
      titre: `Relance — ${compte.nom}`,
      type_action_id: null,
      type_action_libelle: 'Relance',
      site_id: site.id,
      site_nom: site.nom,
      contact_id: contactPrincipal?.id ?? null,
      contact_nom: contactPrincipal ? `${contactPrincipal.prenom} ${contactPrincipal.nom}` : '',
      priorite: 1,
      echeance: new Date().toISOString(),
      commentaire: null,
      statut_id: null,
    })
    showToast('✓ Relance créée pour aujourd\'hui')
    setTab('activite')
  }

  const TABS: { key: TabKey; label: string; labelMobile?: string; badge?: string; mobileOnly?: boolean }[] = [
    { key: 'synthese', label: 'Compte' },
    { key: 'contrats', label: 'Contrats', badge: contratsDuCompte.length ? String(contratsDuCompte.length) : undefined },
    { key: 'compteurs', label: 'Compteurs', badge: compteursDuCompte.length ? String(compteursDuCompte.length) : undefined },
    { key: 'recommandations', label: 'Recommandations', labelMobile: 'Recos', badge: recommandationsDuCompte.length ? String(recommandationsDuCompte.length) : undefined },
    { key: 'signaux', label: 'Signaux', badge: signauxDuCompte.length ? String(signauxDuCompte.length) : undefined },
    { key: 'mandats', label: 'Mandats', badge: mandatsDuCompte.length ? String(mandatsDuCompte.length) : undefined },
    { key: 'fichiers', label: 'Fichiers', badge: documentsDuCompte.length ? String(documentsDuCompte.length) : undefined },
    { key: 'historique', label: 'Historique' },
    { key: 'activite', label: 'Activité', mobileOnly: true },
  ]

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return
      const map: Record<string, TabKey> = { '1': 'synthese', '2': 'contrats', '3': 'compteurs', '4': 'recommandations', '5': 'signaux', '6': 'mandats', '7': 'fichiers', '8': 'historique' }
      if (map[e.key]) setTab(map[e.key])
      if (e.key === 'n' || e.key === 'N') setTab('activite')
      if (e.key === 'r' || e.key === 'R') handleRelance()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [compte?.id, sitesDuCompte, contactPrincipal])

  if (!comptes) {
    return (
      <div>
        <Topbar crumb="Comptes" title="Compte" />
        <div className="p-4 sm:p-6"><p className="text-sm text-navy-400">Chargement…</p></div>
      </div>
    )
  }

  if (!compte) {
    return (
      <div>
        <Topbar crumb="Comptes" title="Compte" />
        <div className="p-4 sm:p-6">
          <Button variant="ghost" size="sm" className="mb-4" onClick={goBack}>
            <ArrowLeft className="h-4 w-4" />
            Retour aux comptes
          </Button>
          <p className="text-sm text-navy-500">Compte introuvable.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-[calc(100vh-52px-56px)] flex-col overflow-hidden md:h-[calc(100vh-52px)]">
      <Topbar crumb="Comptes" title={compte.nom} />

      {/* Bandeau compte */}
      <div className="flex flex-wrap items-start gap-4 bg-kw-surface px-4 pt-3.5 sm:px-[22px]">
        <Button variant="ghost" size="icon" onClick={goBack} title="Retour aux comptes" className="mt-1">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        {/* Icône = objet "compte" au sens de la charte iconographique (bleu #3b5f8a, Building2,
            identique partout dans le CRM) -- ne varie PAS avec le sous-type Client/Fournisseur/
            Partenaire, c'est le badge à pastille juste à côté qui porte cette distinction. */}
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-kw-xl bg-gradient-to-br from-kw-blue to-[#4f78ab] text-white">
          <Building2 className="h-[18px] w-[18px]" />
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <div className="flex flex-wrap items-center gap-3">
            {canManage ? (
              <InlineField
                variant="text"
                value={compte.nom}
                onCommit={(nom) => updateCompte.mutateAsync({ id: compte.id, nom, ville: compte.ville, segment: compte.segment, proprietaire_id: compte.proprietaire_id ?? null })}
                onSaved={() => showToast('✓ enregistré')}
                onError={(err) => showToast(`Erreur : ${err.message}`)}
                className="text-[20px] font-bold tracking-tight text-kw-ink"
              />
            ) : (
              <span className="text-[20px] font-bold tracking-tight text-kw-ink">{compte.nom}</span>
            )}
            {compte.segment && (
              <span className="rounded-[12px] bg-kw-blue-light px-2.5 py-[3px] text-kw-xs font-semibold text-kw-blue">{compte.segment}</span>
            )}
            <span className={cn('inline-flex items-center gap-1.5 rounded-[12px] border px-2.5 py-[3px] text-kw-xs font-bold uppercase tracking-wide', TYPE_BADGE_STYLE[compte.type_compte].bg, TYPE_BADGE_STYLE[compte.type_compte].border, TYPE_BADGE_STYLE[compte.type_compte].text)}>
              <span className={cn('h-[7px] w-[7px] rounded-full', TYPE_BADGE_STYLE[compte.type_compte].dot)} />
              {typeMeta[compte.type_compte].label}
            </span>
            <span className="text-kw-lg text-kw-meta"><b className="text-kw-ink">{sitesDuCompte.length}</b> site{sitesDuCompte.length > 1 ? 's' : ''} géré{sitesDuCompte.length > 1 ? 's' : ''}</span>
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            disabled={!contactPrincipal?.telephone}
            onClick={() => contactPrincipal?.telephone && (window.location.href = `tel:${contactPrincipal.telephone}`)}
            className="flex items-center gap-1.5 rounded-kw-md border border-kw-border-strong bg-kw-surface px-3 py-2 text-kw-md font-semibold text-kw-ink transition-colors hover:bg-kw-bg disabled:opacity-40"
          >
            <Phone className="h-3 w-3" /> Appeler
          </button>
          <button
            type="button"
            onClick={() => setTab('activite')}
            className="flex items-center gap-1.5 rounded-kw-md border border-kw-border-strong bg-kw-surface px-3 py-2 text-kw-md font-semibold text-kw-ink transition-colors hover:bg-kw-bg"
          >
            Note <span className="font-mono text-kw-tiny text-kw-ghost">N</span>
          </button>
          <button
            type="button"
            disabled={!sitesDuCompte[0] || createRelance.isPending}
            onClick={() => handleRelance()}
            title={!sitesDuCompte[0] ? 'Aucun site rattaché à ce compte' : undefined}
            className="flex items-center gap-1.5 rounded-kw-md border border-kw-border-strong bg-kw-surface px-3 py-2 text-kw-md font-semibold text-kw-ink transition-colors hover:bg-kw-bg disabled:opacity-40"
          >
            Relance <span className="font-mono text-kw-tiny text-kw-ghost">R</span>
          </button>
          <button
            type="button"
            onClick={() => navigate('/sites', { state: { openCreateForCompteId: compte.id } })}
            className="flex items-center gap-1.5 rounded-kw-md bg-kw-ink px-3.5 py-2 text-kw-md font-semibold text-white transition-colors hover:bg-[#2c2f36]"
          >
            ＋ Site
          </button>
          <button
            type="button"
            onClick={() => setPdlMethodOpen(true)}
            className="flex items-center gap-1.5 rounded-kw-md border border-kw-border-strong bg-kw-surface px-3 py-2 text-kw-md font-semibold text-kw-ink transition-colors hover:bg-kw-bg"
          >
            <Gauge className="h-3 w-3" /> Compteur
          </button>
          <button
            type="button"
            onClick={() => setAddContactOpen(true)}
            className="flex items-center gap-1.5 rounded-kw-md border border-kw-border-strong bg-kw-surface px-3 py-2 text-kw-md font-semibold text-kw-ink transition-colors hover:bg-kw-bg"
          >
            <Users className="h-3 w-3" /> Contact
          </button>
          <button
            type="button"
            disabled={compteursDuCompte.length === 0}
            onClick={() => setAddMandatOpen(true)}
            title={compteursDuCompte.length === 0 ? 'Aucun compteur sur ce compte — un mandat couvre des PDL' : undefined}
            className="flex items-center gap-1.5 rounded-kw-md border border-kw-border-strong bg-kw-surface px-3 py-2 text-kw-md font-semibold text-kw-ink transition-colors hover:bg-kw-bg disabled:opacity-40"
          >
            <FileCheck2 className="h-3 w-3" /> Mandat
          </button>
          <button
            type="button"
            disabled={!mandatsDuCompte.some((m) => m.statut === 'ACTIF')}
            onClick={() => setAddRecoOpen(true)}
            title={!mandatsDuCompte.some((m) => m.statut === 'ACTIF') ? 'Aucun mandat actif — requis pour lancer une recommandation' : undefined}
            className="flex items-center gap-1.5 rounded-kw-md border border-kw-border-strong bg-kw-surface px-3 py-2 text-kw-md font-semibold text-kw-ink transition-colors hover:bg-kw-bg disabled:opacity-40"
          >
            <Sparkle className="h-3 w-3" /> Recommandation
          </button>
          {canManage && (
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              className="flex items-center gap-1.5 rounded-kw-md border border-kw-border-strong bg-kw-surface px-3 py-2 text-kw-md font-semibold text-kw-red transition-colors hover:bg-kw-red-light"
            >
              <Trash2 className="h-3 w-3" /> Supprimer
            </button>
          )}
        </div>
        <RecordMetaCard compte={compte} canManage={canManage} onToast={showToast} />
      </div>

      {/* Onglets */}
      <div className="flex items-center gap-0.5 overflow-x-auto border-b border-kw-border bg-kw-surface px-4 pt-2.5 sm:px-[22px]">
        {TABS.map((t) => {
          const isActive = tab === t.key
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={cn(
                'inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap border-b-2 px-[13px] py-[9px] text-kw-xl transition-colors',
                t.mobileOnly && 'lg:hidden',
                isActive ? 'border-kw-ink font-semibold text-kw-ink' : 'border-transparent font-normal text-kw-meta hover:text-kw-ink',
              )}
            >
              <span className="lg:hidden">{t.labelMobile ?? t.label}</span>
              <span className="hidden lg:inline">{t.label}</span>
              {t.badge && (
                <span className="rounded-kw-sm bg-kw-muted px-[5px] py-px text-[9.5px] font-bold text-kw-label">
                  {t.badge}
                </span>
              )}
            </button>
          )
        })}
        <div className="flex-1" />
        <span className="hidden pr-1 font-mono text-kw-tiny text-kw-ghost lg:inline">1–8 pour naviguer</span>
      </div>

      {/* 3 zones */}
      <div className="grid min-h-0 flex-1 grid-cols-1 overflow-hidden lg:grid-cols-[300px_minmax(0,1fr)_340px]">
        {/* Colonne gauche — Contacts (desktop uniquement) */}
        <div className="hidden min-h-0 flex-col gap-3.5 overflow-y-auto border-r border-kw-border bg-kw-subtle p-3.5 lg:flex">
          <ContactsPanel contacts={contactsDuCompte} compteId={compte.id} />
          <CommentaireCard compte={compte} />
        </div>

        {/* Centre — contenu de l'onglet */}
        <div className="min-h-0 overflow-y-auto bg-navy-50 p-4 sm:p-5">
          {tab === 'synthese' && (
            <div className="flex flex-col gap-3.5">
              <div className="grid grid-cols-1 gap-3.5 lg:grid-cols-[1fr_1.25fr]">
                <ValeurCompteCard compte={compte} sitesDuCompte={sitesDuCompte} contratsDuCompte={contratsDuCompte} />
                <IdentiteCard compte={compte} onToast={showToast} />
              </div>

              <div className="rounded-xl border border-navy-100 bg-kw-surface p-4">
                <div className="mb-3 flex items-center">
                  <span className="text-[10px] font-bold uppercase tracking-wide text-navy-400">Score Ellisphere</span>
                </div>
                {!compte.siren ? (
                  <p className="text-xs text-navy-400">Aucun SIREN renseigné — impossible d'interroger Ellisphere.</p>
                ) : (
                  <div className="flex flex-col gap-2.5">
                    {compte.score_ellipro ? (
                      <div className="flex items-center gap-2 rounded-lg bg-kiwi-50 px-3 py-2">
                        <Gauge className="h-4 w-4 text-kiwi-700" />
                        <p className="text-xs text-kiwi-800">
                          Score actuel : <span className="font-semibold">{compte.score_ellipro}</span>
                          {compte.score_ellipro_scale && ` / ${compte.score_ellipro_scale}`}
                        </p>
                      </div>
                    ) : (
                      <p className="text-xs text-navy-400">Aucun score interrogé pour le moment.</p>
                    )}
                    {compte.score_ellipro_maj && (
                      <p className="text-[10.5px] text-navy-400">Dernière interrogation : {new Date(compte.score_ellipro_maj).toLocaleString('fr-FR')}</p>
                    )}
                    <Button type="button" variant="outline" size="sm" onClick={handleScoreClick} disabled={ellisphereScore.isPending} className="self-start">
                      {ellisphereScore.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Gauge className="h-4 w-4" />}
                      {ellisphereScore.isPending ? 'Interrogation…' : 'Interroger Ellisphere'}
                    </Button>
                    {ellisphereScore.isError && <p className="text-xs text-red-600">{(ellisphereScore.error as Error).message}</p>}
                    {updateScore.isSuccess && (
                      <p className="text-[10.5px] text-navy-400">
                        {updateScore.data.changed ? 'Score mis à jour.' : 'Score inchangé depuis la dernière interrogation.'}
                      </p>
                    )}
                  </div>
                )}
                <HistoriqueDiscret tableNom="comptes" ligneId={compte.id} />
              </div>

              {compte.type_compte !== 'kiwee' && (
                <div className="rounded-xl border border-navy-100 bg-white p-4">
                  <div className="mb-3 flex items-center justify-between">
                    <span className="text-[10px] font-bold uppercase tracking-wide text-navy-400">Détails {typeMeta[compte.type_compte].label.toLowerCase()}</span>
                    <Button type="button" size="sm" variant="outline" onClick={() => setShowEditSubtype(true)}>
                      <Pencil className="h-3.5 w-3.5" /> Modifier
                    </Button>
                  </div>
                  <div className="space-y-1.5 text-xs text-navy-700">
                    {compte.type_compte === 'client' && (
                      <>
                        <p><span className="text-navy-400">Segment compte :</span> {compte.segment_compte_libelle || '—'}</p>
                        <p><span className="text-navy-400">Conseiller référent :</span> {compte.conseiller_referent_nom || '—'}</p>
                        <p><span className="text-navy-400">Origine d'acquisition :</span> {compte.origine_acquisition || '—'}</p>
                        <p><span className="text-navy-400">Mandat-cadre actif :</span> {compte.mandat_cadre_actif ? 'Oui' : 'Non'}</p>
                        <p><span className="text-navy-400">Apporteur d'affaires :</span> {comptes?.find((c) => c.id === compte.apporteur_partenaire_id)?.nom || '—'}</p>
                        {compte.note_interne && <p><span className="text-navy-400">Note interne :</span> {compte.note_interne}</p>}
                      </>
                    )}
                    {compte.type_compte === 'fournisseur' && (
                      <>
                        <p><span className="text-navy-400">Fournit :</span> {[compte.fournit_electricite && 'Électricité', compte.fournit_gaz && 'Gaz'].filter(Boolean).join(', ') || '—'}</p>
                        <p><span className="text-navy-400">Contact commercial :</span> {compte.contact_commercial_nom || '—'}</p>
                        <p><span className="text-navy-400">Statut partenariat :</span> <Badge tone="neutral">{compte.statut_partenariat || 'À qualifier'}</Badge></p>
                        <p><span className="text-navy-400">Limite Ellipro :</span> {compte.limite_ellipro ?? '—'}</p>
                        {compte.conditions_commerciales && <p><span className="text-navy-400">Conditions :</span> {compte.conditions_commerciales}</p>}
                        {compte.commentaire_partenariat && <p><span className="text-navy-400">Commentaire :</span> {compte.commentaire_partenariat}</p>}
                      </>
                    )}
                    {compte.type_compte === 'partenaire' && (
                      <>
                        <p><span className="text-navy-400">Type de partenariat :</span> {compte.type_partenariat || '—'}</p>
                        <p><span className="text-navy-400">Modèle de rémunération :</span> {compte.modele_remuneration || '—'}</p>
                        <p><span className="text-navy-400">Contact référent :</span> {compte.contact_referent_nom || '—'}</p>
                        <p><span className="text-navy-400">Statut partenariat :</span> <Badge tone="neutral">{compte.statut_partenariat || 'À qualifier'}</Badge></p>
                        <p><span className="text-navy-400">Début du partenariat :</span> {compte.date_debut_partenariat ? new Date(compte.date_debut_partenariat).toLocaleDateString('fr-FR') : '—'}</p>
                        {compte.commentaire_partenariat && <p><span className="text-navy-400">Commentaire :</span> {compte.commentaire_partenariat}</p>}
                      </>
                    )}
                  </div>
                </div>
              )}

              {/* Carte multi-pins -- remplace l'ancienne liste "Sites rattachés" (anomalie QA
                  William du 30/07 : les sites ne doivent pas être listés dans l'onglet Compte). */}
              <CompteSitesMap
                sitesDuCompte={sitesDuCompte}
                signaux={signauxDuCompte}
                contrats={contratsDuCompte}
                recommandations={recommandationsDuCompte}
                mandats={mandatsDuCompte}
                compteurs={compteursDuCompte}
              />

              <RelationTimeline compte={compte} mandats={mandatsDuCompte} recommandations={recommandationsDuCompte} signaux={signauxDuCompte} />
            </div>
          )}

          {tab === 'contrats' && (
            <ContratsTabContent
              sites={sitesDuCompte}
              contrats={contratsDuCompte}
              recommandations={recommandationsDuCompte}
            />
          )}

          {tab === 'compteurs' && (
            <CompteursTabContent sites={sitesDuCompte} compteurs={compteursDuCompte} />
          )}

          {tab === 'recommandations' && (
            <div className="flex flex-col gap-2.5">
              {recommandationsDuCompte.length === 0 && <p className="text-kw-lg text-kw-faint">Aucune recommandation pour ce compte.</p>}
              {recommandationsDuCompte.map((r) => {
                const derniereVersion = r.versions[r.versions.length - 1]
                return (
                  <div
                    key={r.id}
                    onClick={() => navigate(`/recommandations/${r.id}`)}
                    className="cursor-pointer rounded-xl border border-kw-border bg-kw-surface p-3.5 hover:bg-kw-muted"
                  >
                    <div className="flex items-center gap-2">
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-kw-amber-light text-kw-amber">
                        <Sparkle className="h-3.5 w-3.5" />
                      </span>
                      <p className="flex-1 truncate text-kw-h4 font-bold text-kw-ink">{r.titre}</p>
                      <Badge tone={ETAPE_TONE[r.etape] ?? 'amber'}>{etapes.find((e) => e.code === r.etape)?.libelle ?? r.etape}</Badge>
                    </div>
                    {derniereVersion && (
                      <p className="ml-9 mt-1.5 text-kw-sm text-kw-meta">
                        {derniereVersion.nom || 'Version'} · {statutsVersions.find((s) => s.code === derniereVersion.statut)?.libelle ?? derniereVersion.statut}
                        {derniereVersion.gains_estimes ? ` · gain estimé ${derniereVersion.gains_estimes.toLocaleString('fr-FR')} €/an` : ''}
                      </p>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          {tab === 'signaux' && (
            <div className="flex flex-col gap-2.5">
              {signauxDuCompte.length === 0 ? (
                <div className="rounded-xl border border-dashed border-kw-green-border bg-kw-surface p-6 text-center text-kw-lg font-semibold text-kw-green">
                  ✓ Aucun signal ouvert — compte sous contrôle
                </div>
              ) : (
                signauxDuCompte.map((s) => (
                  <div key={s.id} className="rounded-xl border border-kw-border bg-kw-surface p-3.5">
                    <div className="flex items-start gap-3">
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-kw-red-light text-kw-red">
                        <Radio className="h-3.5 w-3.5" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-kw-h4 font-bold text-kw-ink">{s.type_signal}</p>
                        <p className="mt-0.5 text-kw-lg text-kw-meta">{s.description}</p>
                        <span className="mt-1 inline-block text-kw-sm"><EntityLink to={`/sites/${s.site_id}`}>{s.site_nom}</EntityLink></span>
                      </div>
                    </div>
                    <div className="mt-2.5 flex gap-2 border-t border-kw-border-subtle pt-2.5">
                      <Button variant="ghost" size="sm" className="ml-auto" onClick={() => navigate('/signaux')}>
                        Voir dans Signaux
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {tab === 'mandats' && (
            <div className="flex flex-col gap-2.5">
              {mandatsDuCompte.length === 0 ? (
                <div className="rounded-xl border border-dashed border-kw-amber-border bg-kw-amber-light p-4">
                  <p className="text-kw-lg font-bold text-kw-amber-dark">Aucun mandat pour ce compte</p>
                  <Button size="sm" className="mt-2.5" onClick={() => navigate('/mandats')}>
                    <Plus className="h-3.5 w-3.5" />
                    Préparer un mandat
                  </Button>
                </div>
              ) : (
                mandatsDuCompte.map((m) => (
                  <div
                    key={m.id}
                    onClick={() => navigate(`/mandats/${m.id}`)}
                    className="flex cursor-pointer items-center gap-3 rounded-xl border border-kw-border bg-kw-surface p-3.5 hover:bg-kw-muted"
                  >
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-kw-lg bg-kw-amber-light text-kw-amber-dark">
                      <FileCheck2 className="h-4 w-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-kw-h4 font-bold text-kw-ink">{m.nb_sites_couverts} site{m.nb_sites_couverts > 1 ? 's' : ''} couvert{m.nb_sites_couverts > 1 ? 's' : ''}</p>
                      <p className="truncate text-kw-sm text-kw-meta">{m.contact_signataire_nom ?? 'Signataire non renseigné'}</p>
                    </div>
                    <Badge tone={STATUT_MANDAT_TONE[m.statut] ?? 'neutral'}>{statutsMandats.find((s) => s.code === m.statut)?.libelle ?? m.statut}</Badge>
                  </div>
                ))
              )}
            </div>
          )}

          {tab === 'fichiers' && (
            <div className="flex flex-col gap-3.5">
              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setFicCategorie(null)}
                  className={cn('rounded-full px-2.5 py-1 text-kw-base font-semibold', ficCategorie === null ? 'bg-kw-ink text-white' : 'bg-kw-muted text-kw-label hover:bg-kw-border')}
                >
                  Tous
                </button>
                {categoriesFichiers.map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setFicCategorie(cat)}
                    className={cn('rounded-full px-2.5 py-1 text-kw-base font-semibold', ficCategorie === cat ? 'bg-kw-ink text-white' : 'bg-kw-muted text-kw-label hover:bg-kw-border')}
                  >
                    {cat}
                  </button>
                ))}
                <div className="flex-1" />
                <Button size="sm" onClick={() => setAddFichierOpen(true)}>
                  <Plus className="h-3.5 w-3.5" />
                  Ajouter un fichier
                </Button>
              </div>
              <button
                type="button"
                onClick={() => setAddFichierOpen(true)}
                className="flex flex-col items-center gap-1.5 rounded-xl border-2 border-dashed border-kw-border-strong bg-kw-surface py-6 text-kw-faint hover:border-kw-green-border hover:text-kw-green"
              >
                <UploadCloud className="h-[18px] w-[18px]" />
                <span className="text-kw-lg font-bold text-kw-body">Glissez-déposez vos fichiers ici</span>
                <span className="text-kw-sm">PDF, images, emails — catégorisés ensuite en un clic</span>
              </button>
              {documentsFiltresParCategorie.length === 0 ? (
                <p className="text-kw-lg text-kw-faint">{ficCategorie ? 'Aucun fichier dans cette catégorie.' : 'Aucun fichier pour ce compte.'}</p>
              ) : (
                <div className="overflow-hidden rounded-xl border border-kw-border bg-kw-surface">
                  {documentsFiltresParCategorie.map((d) => (
                    <div
                      key={d.id}
                      onClick={() => navigate(`/documents/${d.id}`)}
                      className="flex cursor-pointer items-center gap-3 border-b border-kw-border-subtle px-4 py-3 last:border-b-0 hover:bg-kw-muted"
                    >
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-kw-muted text-kw-label">
                        <FileText className="h-4 w-4" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-kw-h4 font-bold text-kw-ink">{d.nom}</p>
                        <p className="truncate text-kw-sm text-kw-faint">{d.auteur} · {new Date(d.date_creation).toLocaleDateString('fr-FR')}</p>
                      </div>
                      <Badge tone="neutral">{d.type_document}</Badge>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {tab === 'historique' && (
            <div className="flex flex-col gap-2.5">
              <p className="text-kw-base text-kw-faint">{historique?.length ?? 0} changement{(historique?.length ?? 0) > 1 ? 's' : ''} tracé{(historique?.length ?? 0) > 1 ? 's' : ''} · tous horodatés</p>
              <div className="overflow-hidden rounded-xl border border-kw-border bg-kw-surface">
                {!historique || historique.length === 0 ? (
                  <p className="p-4 text-kw-lg text-kw-faint">Aucune modification enregistrée.</p>
                ) : (
                  historique.map((h) => (
                    <div key={h.id} className="grid grid-cols-[110px_1fr] gap-3 border-b border-kw-border-subtle px-4 py-3 last:border-b-0 sm:grid-cols-[110px_140px_140px_1fr]">
                      <span className="font-mono text-kw-sm text-kw-meta">{new Date(h.date_modification).toLocaleString('fr-FR')}</span>
                      <span className="hidden text-kw-md font-semibold text-kw-body sm:block">{h.modifie_par_nom ?? 'Quelqu\'un'}</span>
                      <span className="hidden text-kw-md font-medium text-kw-label sm:block">{h.champ}</span>
                      <span className="flex flex-wrap items-center gap-2 text-kw-md">
                        {h.ancienne_valeur && (
                          <>
                            <span className="text-kw-faint line-through">{h.ancienne_valeur}</span>
                            <span className="text-kw-ghost">→</span>
                          </>
                        )}
                        <span className="font-semibold text-kw-green">{h.nouvelle_valeur ?? '—'}</span>
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {tab === 'activite' && (
            <ActivityFeed
              compteId={compte.id}
              compteNom={compte.nom}
              signaux={signauxDuCompte}
              interactions={interactionsDuCompte}
              actions={actionsDuCompte}
              documents={documentsDuCompte}
              filterDimension="site"
            />
          )}
        </div>

        {/* Colonne droite — Activité persistante (desktop uniquement) */}
        <div className="hidden min-h-0 flex-col border-l border-navy-100 bg-white lg:flex">
          <div className="flex items-center gap-2 px-3.5 py-3">
            <span className="text-[10px] font-bold uppercase tracking-wide text-navy-400">Activité · portefeuille</span>
          </div>
          <div className="min-h-0 flex-1 overflow-hidden px-3.5 pb-3.5">
            <ActivityFeed
              compteId={compte.id}
              compteNom={compte.nom}
              signaux={signauxDuCompte}
              interactions={interactionsDuCompte}
              actions={actionsDuCompte}
              documents={documentsDuCompte}
              filterDimension="site"
            />
          </div>
        </div>
      </div>

      {toast && (
        <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 whitespace-nowrap rounded-lg bg-ink-800 px-4 py-2.5 text-xs font-semibold text-white shadow-lg">
          {toast}
        </div>
      )}

      {compte.type_compte === 'client' && (
        <EditCompteClientDialog compte={compte} comptes={comptes ?? []} open={showEditSubtype} onClose={() => setShowEditSubtype(false)} />
      )}
      {compte.type_compte === 'fournisseur' && (
        <EditCompteFournisseurDialog compte={compte} contacts={contactsDuCompte} open={showEditSubtype} onClose={() => setShowEditSubtype(false)} />
      )}
      {compte.type_compte === 'partenaire' && (
        <EditComptePartenaireDialog compte={compte} contacts={contactsDuCompte} open={showEditSubtype} onClose={() => setShowEditSubtype(false)} />
      )}

      <EditCompteDialog compte={compte} open={editOpen} onClose={() => setEditOpen(false)} />

      <AddFichierDialog
        open={addFichierOpen}
        onClose={() => setAddFichierOpen(false)}
        compteId={compte.id}
        onSaved={() => showToast('✓ Fichier ajouté')}
      />

      <AddCompteurAutoSiteDialog
        open={addCompteurOpen}
        onClose={() => setAddCompteurOpen(false)}
        compte={compte}
        sites={sites ?? []}
        onSaved={(message) => showToast(message)}
      />

      {/* Choix de la méthode avant le formulaire PDL, comme Tools. */}
      <PdlMethodSheet
        open={pdlMethodOpen}
        onClose={() => setPdlMethodOpen(false)}
        compteNom={compte.nom}
        onChoose={() => { setPdlMethodOpen(false); setAddCompteurOpen(true) }}
      />

      {/* Contact : panneau latéral (reste sur la fiche compte, comme l'écran de session
          post-création dans Tools) -- on ne quitte jamais la page. */}
      <Sheet
        open={addContactOpen}
        onClose={() => setAddContactOpen(false)}
        title="Ajouter un contact"
        description={`Rattaché à ${compte.nom}`}
      >
        <ContactForm
          compteId={compte.id}
          compteNom={compte.nom}
          segment={compte.segment}
          onCancel={() => setAddContactOpen(false)}
          onCreated={(contact) => {
            setAddContactOpen(false)
            showToast(`✓ ${contact.prenom} ${contact.nom} ajouté`)
          }}
        />
      </Sheet>

      <CreateMandatDialog
        open={addMandatOpen}
        onClose={() => setAddMandatOpen(false)}
        initialCompteId={compte.id}
      />

      <CreateRecommandationDialog
        open={addRecoOpen}
        onClose={() => setAddRecoOpen(false)}
        initialCompteId={compte.id}
        onCreated={(recoId) => navigate(`/recommandations/${recoId}`)}
      />

      <Dialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title="Supprimer ce compte ?"
        description="Cette action est irréversible. Les sites, contacts et contrats rattachés ne seront pas supprimés mais perdront leur lien à ce compte."
      >
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="ghost" onClick={() => setConfirmDelete(false)}>Annuler</Button>
          <Button type="button" variant="outline" className="border-red-200 text-red-600 hover:bg-red-50" disabled={deleteCompte.isPending} onClick={handleDelete}>
            Supprimer définitivement
          </Button>
        </div>
      </Dialog>
    </div>
  )
}

function CompteSitesMap({
  sitesDuCompte, signaux, contrats, recommandations, mandats, compteurs,
}: {
  sitesDuCompte: Site[]
  signaux: Signal[]
  contrats: Contrat[]
  recommandations: Recommandation[]
  mandats: Mandat[]
  compteurs: Compteur[]
}) {
  const items: SitesMapItem[] = sitesDuCompte.map((site) => {
    const health = computeSiteHealth({
      signaux: signaux.filter((s) => s.site_id === site.id),
      contrats: contrats.filter((c) => c.site_id === site.id),
      recommandations: recommandations.filter((r) => r.sites?.some((s) => s.id === site.id)),
      mandat: mandats.find((m) => m.site_ids?.includes(site.id)),
      compteurs: compteurs.filter((c) => c.site_id === site.id),
    })
    return { id: site.id, nom: site.nom, ville: site.ville, compte_nom: site.compte_nom, latitude: site.latitude, longitude: site.longitude, tone: health.tone }
  })
  const villes = [...new Set(sitesDuCompte.map((s) => s.ville).filter(Boolean))]

  return (
    <div className="overflow-hidden rounded-xl border border-navy-100 bg-kw-surface">
      <SitesMap sites={items} />
      <div className="flex flex-wrap items-center gap-3 border-t border-kw-border-subtle px-3.5 py-2">
        <span className="whitespace-nowrap text-kw-md font-semibold text-kw-ink">
          {sitesDuCompte.length} site{sitesDuCompte.length > 1 ? 's' : ''}{villes.length > 0 ? ` · ${villes.slice(0, 2).join(', ')}` : ''}
        </span>
        <span className="flex flex-wrap gap-2.5 text-kw-xs text-kw-label">
          <span><span className="mr-1 inline-block h-2 w-2 rounded-full bg-kw-green align-middle" />bonne santé</span>
          <span><span className="mr-1 inline-block h-2 w-2 rounded-full bg-[#e0a83c] align-middle" />attention</span>
          <span><span className="mr-1 inline-block h-2 w-2 rounded-full bg-kw-red align-middle" />critique</span>
        </span>
        <div className="flex-1" />
        <span className="text-kw-xs text-kw-faint">clic sur un pin → fiche Site</span>
      </div>
    </div>
  )
}

type RelationEventKind = 'mandat' | 'gagne' | 'perdu' | 'litige' | 'a_venir'

interface RelationEvent {
  id: string
  date: string
  label: string
  kind: RelationEventKind
}

const RELATION_EVENT_STYLE: Record<RelationEventKind, { badge: string; text: string }> = {
  mandat: { badge: 'Mandat', text: 'bg-kw-amber-light text-kw-amber-dark' },
  gagne: { badge: 'Gagné', text: 'bg-kw-green-light text-kw-green' },
  perdu: { badge: 'Perdu', text: 'bg-kw-muted text-kw-label' },
  litige: { badge: 'Litige', text: 'bg-kw-red-light text-kw-red' },
  a_venir: { badge: 'À venir', text: 'bg-kw-amber-light text-kw-amber-dark' },
}

// Frise "Historique de la relation" -- présente dans la référence design (William) mais absente
// jusqu'ici. Dérivée des données déjà chargées (mandats, recommandations, signaux) : première
// passe raisonnable, PAS validée avec William/Michel sur le choix exact des jalons ni leurs
// libellés (voir tâche de suivi) -- à corriger si le classement Gagné/Perdu/Litige ne correspond
// pas à la réalité métier.
function buildRelationEvents(compte: Compte, mandats: Mandat[], recommandations: Recommandation[], signaux: Signal[]): RelationEvent[] {
  const events: RelationEvent[] = []

  if (compte.date_creation) {
    events.push({ id: `debut-${compte.id}`, date: compte.date_creation, label: 'Début de la relation', kind: 'mandat' })
  }

  for (const m of mandats) {
    if (m.date_signature) {
      events.push({ id: `mandat-${m.id}`, date: m.date_signature, label: `Signature du mandat · ${m.nb_sites_couverts} site${m.nb_sites_couverts > 1 ? 's' : ''}`, kind: 'mandat' })
    } else if (m.statut === 'ENVOYE' || m.statut === 'EN_SIGNATURE') {
      events.push({ id: `mandat-avenir-${m.id}`, date: m.date_envoi ?? m.date_creation ?? new Date().toISOString(), label: `Mandat en attente de signature · ${m.nb_sites_couverts} site${m.nb_sites_couverts > 1 ? 's' : ''}`, kind: 'a_venir' })
    }
  }

  for (const r of recommandations) {
    const derniere = r.versions[r.versions.length - 1]
    if (r.etape === 'ACCEPTEE') {
      const date = derniere?.date_decision_client ?? derniere?.date_creation ?? r.date_creation
      const gain = derniere?.gains_estimes ? ` · ${derniere.gains_estimes.toLocaleString('fr-FR')} €/an` : ''
      events.push({ id: `reco-gagne-${r.id}`, date, label: `${r.titre}${gain}`, kind: 'gagne' })
    } else if (r.etape === 'REFUSEE') {
      const date = derniere?.date_decision_client ?? derniere?.date_creation ?? r.date_creation
      events.push({ id: `reco-perdu-${r.id}`, date, label: r.titre, kind: 'perdu' })
    }
  }

  for (const s of signaux) {
    if (/litige/i.test(s.type_signal) || /litige/i.test(s.description)) {
      events.push({ id: `signal-${s.id}`, date: s.date_creation, label: s.description || s.type_signal, kind: 'litige' })
    }
  }

  return events.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
}

function RelationTimeline({ compte, mandats, recommandations, signaux }: { compte: Compte; mandats: Mandat[]; recommandations: Recommandation[]; signaux: Signal[] }) {
  const events = useMemo(() => buildRelationEvents(compte, mandats, recommandations, signaux), [compte, mandats, recommandations, signaux])
  const [expanded, setExpanded] = useState(false)
  const CAP = 8
  const visibles = expanded ? events : events.slice(0, CAP)

  if (events.length === 0) return null

  return (
    <div className="rounded-xl border border-navy-100 bg-kw-surface p-4">
      <div className="mb-3 flex items-center gap-1.5">
        <span className="text-kw-xs font-bold uppercase tracking-wide text-kw-faint">Historique de la relation</span>
        <span className="text-kw-xs text-kw-ghost">· tous sites confondus</span>
      </div>
      <div className="flex flex-col divide-y divide-kw-border-subtle">
        {visibles.map((e) => (
          <div key={e.id} className="flex items-center gap-3 py-2 first:pt-0 last:pb-0">
            <span className="w-20 shrink-0 font-mono text-kw-sm text-kw-meta">{new Date(e.date).toLocaleDateString('fr-FR')}</span>
            <p className="min-w-0 flex-1 truncate text-kw-lg text-kw-body">{e.label}</p>
            <span className={cn('shrink-0 rounded px-1.5 py-0.5 text-kw-xs font-bold uppercase', RELATION_EVENT_STYLE[e.kind].text)}>
              {RELATION_EVENT_STYLE[e.kind].badge}
            </span>
          </div>
        ))}
      </div>
      {events.length > CAP && (
        <button type="button" onClick={() => setExpanded((v) => !v)} className="mt-2.5 text-kw-sm font-semibold text-kw-blue hover:underline">
          {expanded ? '← Réduire' : `Voir les ${events.length} événements →`}
        </button>
      )}
    </div>
  )
}

function ValeurCompteCard({ compte, sitesDuCompte, contratsDuCompte }: { compte: Compte; sitesDuCompte: Site[]; contratsDuCompte: Contrat[] }) {
  const anneeCreation = compte.date_creation ? new Date(compte.date_creation) : null
  const anciennete = anneeCreation ? Math.max(0, new Date().getFullYear() - anneeCreation.getFullYear()) : 0
  // "Site client" = a un contrat ACTIF (peu importe si le site lui-même est actif/inactif --
  // ce sont deux notions différentes : un site peut être en activité sans jamais avoir eu de
  // contrat signé, et inversement). Décision Naoëlle/William du 05/08/2026.
  const sitesClients = sitesDuCompte.filter((s) => contratsDuCompte.some((c) => c.site_id === s.id && c.statut === 'ACTIF')).length
  const ratioClient = sitesDuCompte.length > 0 ? sitesClients / sitesDuCompte.length : 0
  const prospects = sitesDuCompte.length - sitesClients

  const ancienneteScore = Math.min(30, anciennete * 5)
  const ratioScore = Math.round(ratioClient * 40)
  const prospectsScore = Math.min(20, prospects * 8)
  const score = Math.min(100, ancienneteScore + ratioScore + prospectsScore)

  const drivers = [
    { label: `Ancienneté relation · ${anciennete} an${anciennete > 1 ? 's' : ''}`, value: ancienneteScore, tone: 'green' as const },
    { label: `${sitesClients}/${sitesDuCompte.length || 0} sites client (${Math.round(ratioClient * 100)} %)`, value: ratioScore, tone: 'green' as const },
    ...(prospects > 0 ? [{ label: `${prospects} prospect${prospects > 1 ? 's' : ''} convertible${prospects > 1 ? 's' : ''}`, value: prospectsScore, tone: 'amber' as const }] : []),
  ]

  const dotColor = { green: 'bg-kw-green', amber: 'bg-kw-amber' }
  const chipStyle = { green: 'bg-kw-blue-light text-kw-blue', amber: 'bg-kw-amber-border text-kw-amber-dark' }

  return (
    <div className="rounded-xl border border-kw-blue/20 bg-kw-surface p-4 shadow-sm">
      <div className="flex items-center gap-3">
        <div
          className="relative flex h-[58px] w-[58px] shrink-0 items-center justify-center rounded-full"
          style={{ background: `conic-gradient(#3b5f8a 0 ${score}%, #e8ecf1 ${score}% 100%)` }}
        >
          <div className="flex h-11 w-11 flex-col items-center justify-center rounded-full bg-kw-surface">
            <span className="text-[16px] font-bold leading-none text-kw-blue">{score}</span>
            <span className="text-[7.5px] font-bold text-kw-faint">/ 100</span>
          </div>
        </div>
        <div>
          <div className="text-kw-xl font-bold text-kw-ink">Valeur du compte</div>
          <div className="text-kw-lg font-semibold text-kw-blue">Scoring commercial</div>
        </div>
      </div>
      <div className="mt-3 flex flex-col gap-1.5">
        {drivers.map((d, i) => (
          <div key={i} className="flex items-center gap-2 text-kw-lg">
            <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', dotColor[d.tone])} />
            <span className="flex-1 text-kw-body">{d.label}</span>
            <span className={cn('rounded px-1.5 py-0.5 font-mono text-kw-xs font-extrabold', chipStyle[d.tone])}>+{d.value}</span>
          </div>
        ))}
        {drivers.length === 0 && <p className="text-kw-lg text-kw-faint">Pas assez de données pour établir un score.</p>}
      </div>
    </div>
  )
}

function IdentiteCard({ compte, onToast }: { compte: Compte; onToast: (msg: string) => void }) {
  const updateField = useUpdateCompteField()
  const [editingAddress, setEditingAddress] = useState(false)
  const [addrDraft, setAddrDraft] = useState({ rue: compte.rue ?? '', code_postal: compte.code_postal ?? '', ville: compte.ville ?? '' })

  function commit(patch: Partial<Compte>) {
    return updateField.mutateAsync({ id: compte.id, patch }).then(() => onToast('✓ enregistré')).catch((err) => onToast(`Erreur : ${err.message}`))
  }

  const statutClient = useMemo(() => true, []) // dérivé du statut réel des sites, câblé une fois l'onglet Sites/Compteurs aligné

  async function saveAddress() {
    await commit({ rue: addrDraft.rue || null, code_postal: addrDraft.code_postal || null, ville: addrDraft.ville })
    setEditingAddress(false)
  }

  return (
    <div className="rounded-xl border border-navy-100 bg-kw-surface p-4">
      <div className="mb-3.5 flex items-center gap-1.5">
        <span className="flex h-5 w-5 items-center justify-center rounded-md bg-kw-blue-light text-kw-blue"><Building2 className="h-2.5 w-2.5" /></span>
        <span className="text-kw-xs font-bold uppercase tracking-wide text-kw-faint">Identité</span>
        <div className="flex-1" />
        <span className="text-kw-xs text-kw-ghost">cliquer une valeur pour modifier · ⧉ pour copier</span>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <InlineField variant="select" label="Type de compte" value={compte.type_compte} options={[{ value: 'client', label: 'Consommateur' }, { value: 'fournisseur', label: 'Fournisseur' }, { value: 'partenaire', label: 'Partenaire' }, { value: 'kiwee', label: 'KiWee' }]} onCommit={(v) => commit({ type_compte: v as TypeCompte })} onSaved={() => onToast('✓ enregistré')} />
        <InlineField variant="text" label="Typologie" value={compte.segment || ''} emptyLabel="ajouter" onCommit={(v) => commit({ segment: v })} onSaved={() => onToast('✓ enregistré')} />
        <div>
          <div className="mb-0.5 text-kw-xs font-semibold uppercase tracking-wide text-kw-faint">Statut</div>
          <span className={cn('rounded px-2 py-0.5 text-kw-xs font-semibold', statutClient ? 'bg-kw-green-light text-kw-green' : 'bg-kw-muted text-kw-label')}>
            {statutClient ? 'Client' : 'Prospect'}
          </span>
        </div>
        {compte.siret && <InfoFieldKw label="SIRET" value={compte.siret} onCopy={onToast} mono />}
        {compte.siren && <InfoFieldKw label="SIREN" value={compte.siren} onCopy={onToast} mono />}
        <InlineField variant="text" label="Code NAF" mono value={compte.code_naf || ''} emptyLabel="ajouter" onCommit={(v) => commit({ code_naf: v || null })} onSaved={() => onToast('✓ enregistré')} />
        <InlineField variant="text" label="Libellé APE" value={compte.libelle_ape || ''} emptyLabel="ajouter" onCommit={(v) => commit({ libelle_ape: v || null })} onSaved={() => onToast('✓ enregistré')} />
        {compte.score_ellipro && (
          <div>
            <div className="mb-0.5 text-kw-xs font-semibold uppercase tracking-wide text-kw-faint">Note Ellipro</div>
            <span className="rounded bg-kw-green-light px-1.5 py-0.5 text-kw-lg font-extrabold text-kw-green">
              {compte.score_ellipro}{compte.score_ellipro_scale ? ` / ${compte.score_ellipro_scale}` : ''}
            </span>
          </div>
        )}
        <div className="col-span-2">
          <div className="mb-0.5 text-kw-xs font-semibold uppercase tracking-wide text-kw-faint">Siège social</div>
          {editingAddress ? (
            <div className="flex flex-wrap items-center gap-1.5">
              <input value={addrDraft.rue} onChange={(e) => setAddrDraft((d) => ({ ...d, rue: e.target.value }))} placeholder="Rue" className="min-w-[150px] flex-[2] rounded-kw-sm border border-kw-green px-1.5 py-1 text-kw-lg outline-none" />
              <input value={addrDraft.code_postal} onChange={(e) => setAddrDraft((d) => ({ ...d, code_postal: e.target.value }))} placeholder="Code postal" className="w-20 rounded-kw-sm border border-kw-green px-1.5 py-1 font-mono text-kw-lg outline-none" />
              <input value={addrDraft.ville} onChange={(e) => setAddrDraft((d) => ({ ...d, ville: e.target.value }))} placeholder="Ville" className="min-w-[90px] flex-1 rounded-kw-sm border border-kw-green px-1.5 py-1 text-kw-lg outline-none" />
              <button type="button" onClick={saveAddress} className="flex h-6 w-6 shrink-0 items-center justify-center rounded-kw-sm bg-kw-green text-white">✓</button>
            </div>
          ) : (
            <div className="flex items-start gap-1.5">
              <button type="button" onClick={() => { setAddrDraft({ rue: compte.rue ?? '', code_postal: compte.code_postal ?? '', ville: compte.ville ?? '' }); setEditingAddress(true) }} className="rounded-kw-sm px-1.5 py-0.5 text-left text-kw-lg text-kw-ink hover:bg-kw-muted">
                {compte.rue || compte.code_postal || compte.ville ? (
                  <>
                    {compte.rue && <span className="block truncate">{compte.rue}</span>}
                    <span className="block truncate">{`${compte.code_postal ?? ''} ${compte.ville ?? ''}`.trim()}</span>
                  </>
                ) : (
                  <span className="text-kw-faint">＋ ajouter</span>
                )}
              </button>
            </div>
          )}
        </div>
        <div>
          <div className="mb-0.5 text-kw-xs font-semibold uppercase tracking-wide text-kw-faint">Département</div>
          <div className="flex items-center gap-2">
            <InlineField variant="text" mono value={compte.departement_code || ''} emptyLabel="—" onCommit={(v) => commit({ departement_code: v || null })} onSaved={() => onToast('✓ enregistré')} className="w-12" />
            <InlineField variant="text" value={compte.departement_nom || ''} emptyLabel="nom" onCommit={(v) => commit({ departement_nom: v || null })} onSaved={() => onToast('✓ enregistré')} />
          </div>
        </div>
      </div>
    </div>
  )
}

function InfoFieldKw({ label, value, onCopy, mono }: { label: string; value: string; onCopy: (msg: string) => void; mono?: boolean }) {
  return (
    <div>
      <div className="mb-0.5 text-kw-xs font-semibold uppercase tracking-wide text-kw-faint">{label}</div>
      <div className="flex items-center gap-1.5">
        <button type="button" onClick={() => copyToClipboard(value, onCopy)} title="Cliquer pour copier" className={cn('truncate text-kw-lg font-semibold text-kw-ink hover:text-kw-blue', mono && 'font-mono')}>
          {value}
        </button>
      </div>
    </div>
  )
}

function RecordMetaCard({ compte, canManage, onToast }: { compte: Compte; canManage: boolean; onToast: (msg: string) => void }) {
  const updateCompte = useUpdateCompte()
  const { data: profilsAdmin } = useProfilsAdmin()
  const [open, setOpen] = useState(false)

  const initiales = compte.proprietaire_nom ? compte.proprietaire_nom.split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase() : '—'

  async function reassign(profilId: string) {
    setOpen(false)
    const profil = profilsAdmin?.find((p) => p.id === profilId)
    try {
      await updateCompte.mutateAsync({ id: compte.id, nom: compte.nom, ville: compte.ville, segment: compte.segment, proprietaire_id: profilId || null })
      onToast(`✓ Propriétaire : ${profil ? `${profil.prenom} ${profil.nom}` : 'Aucun'}`)
    } catch (err) {
      onToast(`Erreur : ${err instanceof Error ? err.message : 'inconnue'}`)
    }
  }

  return (
    <div className="relative flex shrink-0 flex-col items-start gap-0.5 rounded-kw-xl border border-kw-border-subtle bg-kw-subtle px-2.5 py-1.5">
      <button
        type="button"
        disabled={!canManage}
        onClick={() => setOpen((v) => !v)}
        title="Propriétaire — cliquer pour réattribuer"
        className="flex items-center gap-1.5 disabled:cursor-default"
      >
        <span className="flex h-4 w-4 items-center justify-center rounded-full bg-[#e4ded2] text-[7.5px] font-bold text-[#6b6355]">{initiales}</span>
        <span className="text-kw-xs font-bold text-kw-label">{compte.proprietaire_nom || 'Aucun propriétaire'}</span>
        {canManage && <span className="text-kw-ghost">▾</span>}
      </button>
      <span className="whitespace-nowrap text-kw-tiny text-kw-faint">
        {compte.date_creation && <>Créé {new Date(compte.date_creation).toLocaleDateString('fr-FR')} · </>}
        Modifié {compte.date_modification ? new Date(compte.date_modification).toLocaleDateString('fr-FR') : '—'}
      </span>
      {open && (
        <div className="absolute right-0 top-full z-30 mt-1 max-h-64 w-52 overflow-y-auto rounded-kw-lg border border-kw-border bg-kw-surface py-1 shadow-kw-panel">
          <button type="button" onClick={() => reassign('')} className="block w-full px-3 py-1.5 text-left text-kw-lg text-kw-body hover:bg-kw-muted">Aucun</button>
          {profilsAdmin?.map((p) => (
            <button key={p.id} type="button" onClick={() => reassign(p.id)} className="block w-full px-3 py-1.5 text-left text-kw-lg text-kw-body hover:bg-kw-muted">
              {p.prenom} {p.nom}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

const LIFECYCLE_ACTIF = new Set(['ACTIF'])
const LIFECYCLE_A_VENIR = new Set(['A_VENIR', 'EN_PREPARATION', 'A_SIGNER'])
const LIFECYCLE_EXPIRE = new Set(['TERMINE', 'RESILIE', 'ANNULE'])

function contratLifecycle(statut: string): 'actif' | 'a_venir' | 'expire' | 'autre' {
  if (LIFECYCLE_ACTIF.has(statut)) return 'actif'
  if (LIFECYCLE_A_VENIR.has(statut)) return 'a_venir'
  if (LIFECYCLE_EXPIRE.has(statut)) return 'expire'
  return 'autre'
}

function ContratsTabContent({
  sites, contrats, recommandations,
}: {
  sites: Site[]
  contrats: Contrat[]
  recommandations: Recommandation[]
}) {
  const [recherche, setRecherche] = useState('')
  const total = contrats.length
  const nbCompteurs = new Set(contrats.flatMap((c) => c.compteurs.map((cp) => cp.id))).size
  const nbSites = new Set(contrats.map((c) => c.site_id)).size
  const actifs = contrats.filter((c) => contratLifecycle(c.statut) === 'actif')
  const aVenir = contrats.filter((c) => contratLifecycle(c.statut) === 'a_venir')
  const expires = contrats.filter((c) => contratLifecycle(c.statut) === 'expire')

  const dans12mois = new Date()
  dans12mois.setMonth(dans12mois.getMonth() + 12)
  const echeances = actifs.filter((c) => c.date_fin && new Date(c.date_fin) <= dans12mois)
  const prochaine = echeances.slice().sort((a, b) => new Date(a.date_fin!).getTime() - new Date(b.date_fin!).getTime())[0]

  const sitesAvecReco = new Set(recommandations.flatMap((r) => r.sites?.map((s) => s.id) ?? []))
  const sansReco = actifs.filter((c) => !sitesAvecReco.has(c.site_id ?? ''))

  const [filtre, setFiltre] = useState<'all' | 'actifs' | 'echeances' | 'sans_reco'>('all')
  const filtres: Record<typeof filtre, Contrat[]> = { all: contrats, actifs, echeances, sans_reco: sansReco }
  const contratsFiltres = filtres[filtre]
  const q = recherche.trim().toLowerCase()
  const contratsAffiches = q
    ? contratsFiltres.filter((ct) => {
        const site = sites.find((s) => s.id === ct.site_id)
        return (ct.fournisseur_nom ?? '').toLowerCase().includes(q) || (site?.nom ?? '').toLowerCase().includes(q)
      })
    : contratsFiltres

  if (total === 0) return <p className="text-kw-lg text-kw-faint">Aucun contrat pour ce compte.</p>

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-kw-3xl border border-kw-border bg-kw-border md:grid-cols-4">
        {[
          { key: 'all' as const, label: 'Contrats', value: total, sub: `${nbCompteurs} compteurs · ${nbSites} sites`, color: 'text-kw-ink' },
          { key: 'actifs' as const, label: 'Actifs', value: actifs.length, sub: `+ ${aVenir.length} à venir · ${expires.length} expirés`, color: 'text-kw-green' },
          { key: 'echeances' as const, label: 'Échéances < 12 mois', value: echeances.length, sub: prochaine ? `prochaine : ${new Date(prochaine.date_fin!).toLocaleDateString('fr-FR')}` : '—', color: 'text-kw-red' },
          { key: 'sans_reco' as const, label: 'Sans reco lancée', value: sansReco.length, sub: 'à couvrir avant l\'hiver', color: 'text-kw-amber' },
        ].map((hub) => (
          <button
            key={hub.key}
            type="button"
            onClick={() => setFiltre(hub.key)}
            className={cn('flex flex-col gap-1 bg-kw-surface px-4 py-3 text-left transition-colors hover:bg-kw-subtle', filtre === hub.key && 'bg-kw-subtle ring-1 ring-inset ring-kw-green/30')}
          >
            <span className="text-kw-xs font-bold uppercase tracking-wide text-kw-faint">{hub.label}</span>
            <span className={cn('font-mono text-[22px] font-bold', hub.color)}>{hub.value}</span>
            <span className="text-kw-sm text-kw-meta">{hub.sub}</span>
          </button>
        ))}
      </div>

      {filtre !== 'all' && (
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-kw-pill bg-kw-ink px-3 py-1 text-kw-sm font-bold text-white">
            Filtre : {filtre === 'actifs' ? 'Actifs' : filtre === 'echeances' ? 'Échéances < 12 mois' : 'Sans reco lancée'}
            <button type="button" onClick={() => setFiltre('all')} className="opacity-70 hover:opacity-100">✕</button>
          </span>
          <span className="text-kw-sm text-kw-meta">{contratsAffiches.length} contrat{contratsAffiches.length > 1 ? 's' : ''} correspondant{contratsAffiches.length > 1 ? 's' : ''}</span>
        </div>
      )}

      <SiteSearchBox
        value={recherche}
        onChange={setRecherche}
        placeholder="Rechercher un site, un fournisseur…"
        total={contratsAffiches.length}
        unit="contrat"
      />

      <GroupedBySite
        sites={sites}
        itemsBySiteId={(siteId) => contratsAffiches.filter((ct) => ct.site_id === siteId)}
        orphanItems={contratsAffiches.filter((ct) => !ct.site_id || !sites.some((s) => s.id === ct.site_id))}
        renderSummary={(items) => {
          const nbCompteursSite = new Set(items.flatMap((ct) => ct.compteurs.map((cp) => cp.id))).size
          return `${nbCompteursSite} compteur${nbCompteursSite > 1 ? 's' : ''} · ${items.length} contrat${items.length > 1 ? 's' : ''}`
        }}
        emptyLabel="Aucun contrat pour ce filtre."
      />
    </div>
  )
}

function CompteursTabContent({ sites, compteurs }: { sites: Site[]; compteurs: Compteur[] }) {
  const [recherche, setRecherche] = useState('')
  const q = recherche.trim().toLowerCase()
  const compteursAffiches = q
    ? compteurs.filter((c) => {
        const site = sites.find((s) => s.id === c.site_id)
        return (c.numero_pdl ?? '').toLowerCase().includes(q) || (c.utilisation ?? '').toLowerCase().includes(q) || (site?.nom ?? '').toLowerCase().includes(q)
      })
    : compteurs

  if (compteurs.length === 0) return <p className="text-kw-lg text-kw-faint">Aucun compteur pour ce compte.</p>

  return (
    <div className="flex flex-col gap-3">
      <SiteSearchBox
        value={recherche}
        onChange={setRecherche}
        placeholder="Rechercher un site, un numéro de PDL/PCE…"
        total={compteursAffiches.length}
        unit="compteur"
      />
      <GroupedBySite
        sites={sites}
        itemsBySiteId={(siteId) => compteursAffiches.filter((c) => c.site_id === siteId)}
        orphanItems={compteursAffiches.filter((c) => !sites.some((s) => s.id === c.site_id))}
        renderSummary={(items) => {
          const elec = items.filter((c) => c.type_energie !== 'gaz').length
          const gaz = items.filter((c) => c.type_energie === 'gaz').length
          const parts = [elec > 0 && `${elec} élec.`, gaz > 0 && `${gaz} gaz`].filter(Boolean)
          return parts.join(' · ')
        }}
        emptyLabel="Aucun compteur pour ce filtre."
      />
    </div>
  )
}

// Barre de recherche générique réutilisée par les onglets Contrats/Compteurs (retour William :
// « faut que tu mettes une recherche »). Filtre côté appelant, cette fonction ne fait que l'UI.
function SiteSearchBox({ value, onChange, placeholder, total, unit }: { value: string; onChange: (v: string) => void; placeholder: string; total: number; unit: string }) {
  return (
    <div className="flex items-center gap-2 rounded-kw-md border border-kw-border-strong bg-kw-surface px-3 py-2">
      <Search className="h-3.5 w-3.5 shrink-0 text-kw-ghost" />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="min-w-0 flex-1 bg-transparent text-kw-md text-kw-ink outline-none placeholder:text-kw-faint"
      />
      <span className="shrink-0 text-kw-sm text-kw-meta">{total} {unit}{total > 1 ? 's' : ''}</span>
    </div>
  )
}

// Un site = une ligne résumé (nom, statut, compte en gris), jamais les compteurs/contrats
// listés en dessous -- retour William du 02/08 : « affiche la liste des sites, pas les
// compteurs en dessous ». Le détail se consulte en cliquant, sur la fiche Site elle-même.
function GroupedBySite<T>({
  sites,
  itemsBySiteId,
  renderSummary,
  emptyLabel,
  orphanItems,
}: {
  sites: Site[]
  itemsBySiteId: (siteId: string) => T[]
  renderSummary: (items: T[]) => React.ReactNode
  emptyLabel: string
  /** Elements sans site rattachable (ex. contrat dont les compteurs ont change de cabinet) --
   * doivent quand meme s'afficher, pas disparaitre silencieusement (voir bug Rivet-Lenoble). */
  orphanItems?: T[]
}) {
  const navigate = useNavigate()
  const groups = sites.map((s) => ({ site: s, items: itemsBySiteId(s.id) })).filter((g) => g.items.length > 0)
  const orphans = orphanItems ?? []

  if (groups.length === 0 && orphans.length === 0) return <p className="text-kw-lg text-kw-faint">{emptyLabel}</p>

  return (
    <div className="overflow-hidden rounded-xl border border-navy-100 bg-white">
      {groups.map(({ site, items }) => (
        <div
          key={site.id}
          onClick={() => navigate(`/sites/${site.id}`)}
          className="flex cursor-pointer items-center gap-2.5 border-b border-navy-50 px-4 py-3 last:border-b-0 hover:bg-navy-50/60"
        >
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-kiwi-100 text-kiwi-600">
            <MapPin className="h-3.5 w-3.5" />
          </span>
          <p className="min-w-0 flex-1 truncate text-kw-h4 font-bold text-kw-ink">{site.nom}</p>
          <span className={cn('rounded-kw-sm px-1.5 py-0.5 text-kw-xs font-bold uppercase', site.statut === 'actif' ? 'bg-kw-green-light text-kw-green' : 'bg-kw-muted text-kw-label')}>
            {site.statut === 'actif' ? 'Client' : 'Prospect'}
          </span>
          <span className="shrink-0 text-kw-sm text-kw-meta">{renderSummary(items)}</span>
          <span className="text-kw-ghost">›</span>
        </div>
      ))}
      {orphans.length > 0 && (
        <div className="flex items-center gap-2.5 border-t border-dashed border-navy-200 bg-navy-50/60 px-4 py-3">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-navy-100 text-navy-500">
            <MapPin className="h-3.5 w-3.5" />
          </span>
          <p className="min-w-0 flex-1 truncate text-kw-h4 font-bold text-kw-ink">Sans site rattaché (historique)</p>
          <span className="shrink-0 text-kw-sm text-kw-meta">{renderSummary(orphans)}</span>
        </div>
      )}
    </div>
  )
}

function ContactsPanel({ contacts, compteId }: { contacts: Contact[]; compteId: string }) {
  const navigate = useNavigate()
  const [expanded, setExpanded] = useState(false)
  const visibles = expanded ? contacts : contacts.slice(0, 3)
  return (
    <div className="rounded-kw-2xl border border-kw-border bg-kw-surface p-3.5">
      <div className="mb-2.5 flex items-center gap-1.5">
        <span className="flex h-5 w-5 items-center justify-center rounded-kw-sm bg-kw-purple/15 text-kw-purple"><Users className="h-2.5 w-2.5" /></span>
        <span className="text-kw-xs font-bold uppercase tracking-wide text-kw-faint">Contacts</span>
        <div className="flex-1" />
        <button type="button" onClick={() => navigate('/contacts', { state: { openCreateForCompteId: compteId } })} className="text-kw-sm font-semibold text-kw-purple">＋</button>
      </div>
      {contacts.length === 0 && <p className="text-kw-lg text-kw-faint">Aucun contact enregistré pour ce compte.</p>}
      <div className="flex flex-col gap-2">
        {visibles.map((c) => {
          const initiales = `${c.prenom[0] ?? ''}${c.nom[0] ?? ''}`.toUpperCase()
          return (
            <div key={c.id} className="rounded-kw-xl border border-kw-border-faint bg-kw-subtle p-2.5">
              <div className="flex items-center gap-2.5">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-[1.5px] border-kw-purple/30 bg-kw-purple/10 text-kw-lg font-bold text-kw-purple">
                  {initiales}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <button type="button" onClick={() => navigate(`/contacts/${c.id}`)} className="truncate text-left text-kw-h4 font-bold text-kw-ink hover:text-kw-purple">
                      {c.prenom} {c.nom}
                    </button>
                    {c.contact_principal && (
                      <span title="Signataire des mandats" className="flex h-[15px] w-[15px] shrink-0 items-center justify-center rounded-kw-xs bg-kw-amber-border">
                        <FileCheck2 className="h-2.5 w-2.5 text-kw-amber-dark" />
                      </span>
                    )}
                  </div>
                  <p className="truncate text-kw-lg text-kw-meta">{c.fonction || '—'}{c.sites.length > 0 ? ` · ${c.sites.length} site${c.sites.length > 1 ? 's' : ''}` : ''}</p>
                </div>
              </div>
              <div className="mt-2 flex gap-1.5">
                <a
                  href={c.telephone ? `tel:${c.telephone}` : undefined}
                  className={cn(
                    'flex flex-1 items-center justify-center gap-1.5 rounded-kw-md border border-kw-border-strong bg-kw-surface py-1.5 text-kw-sm font-semibold text-kw-label transition-colors',
                    c.telephone ? 'hover:border-kw-green-border hover:bg-kw-green-light hover:text-kw-green' : 'pointer-events-none opacity-40',
                  )}
                >
                  <Phone className="h-2.5 w-2.5" /> Appeler
                </a>
                <a
                  href={c.email ? `mailto:${c.email}` : undefined}
                  className={cn(
                    'flex flex-1 items-center justify-center gap-1.5 rounded-kw-md border border-kw-border-strong bg-kw-surface py-1.5 text-kw-sm font-semibold text-kw-label transition-colors',
                    c.email ? 'hover:border-kw-blue-light hover:bg-kw-blue-light hover:text-kw-blue' : 'pointer-events-none opacity-40',
                  )}
                >
                  <Mail className="h-2.5 w-2.5" /> Email
                </a>
              </div>
            </div>
          )
        })}
      </div>
      {contacts.length > 3 && (
        <button type="button" onClick={() => setExpanded((v) => !v)} className="mt-2.5 block text-kw-sm font-semibold text-kw-purple hover:underline">
          {expanded ? '← Réduire' : `Voir les ${contacts.length} contacts →`}
        </button>
      )}
    </div>
  )
}

function CommentaireCard({ compte }: { compte: Compte }) {
  const updateClient = useUpdateCompteClient()
  const updateFournisseur = useUpdateCompteFournisseur()
  const updatePartenaire = useUpdateComptePartenaire()
  const isKiwee = compte.type_compte === 'kiwee'
  const initialValue = isKiwee ? '' : compte.type_compte === 'client' ? (compte.note_interne ?? '') : (compte.commentaire_partenariat ?? '')

  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(initialValue)
  const pending = updateClient.isPending || updateFournisseur.isPending || updatePartenaire.isPending

  async function save() {
    if (compte.type_compte === 'client') {
      await updateClient.mutateAsync({
        compteId: compte.id,
        segment_compte_id: compte.segment_compte_id ?? null,
        segment_compte_libelle: compte.segment_compte_libelle ?? null,
        conseiller_referent_id: compte.conseiller_referent_id ?? null,
        conseiller_referent_nom: compte.conseiller_referent_nom ?? null,
        origine_acquisition: compte.origine_acquisition ?? null,
        mandat_cadre_actif: compte.mandat_cadre_actif ?? false,
        note_interne: draft || null,
        apporteur_partenaire_id: compte.apporteur_partenaire_id ?? null,
      })
    } else if (compte.type_compte === 'fournisseur') {
      await updateFournisseur.mutateAsync({
        compteId: compte.id,
        fournit_electricite: compte.fournit_electricite ?? false,
        fournit_gaz: compte.fournit_gaz ?? false,
        contact_commercial_id: compte.contact_commercial_id ?? null,
        contact_commercial_nom: compte.contact_commercial_nom ?? null,
        statut_partenariat: compte.statut_partenariat ?? 'À qualifier',
        conditions_commerciales: compte.conditions_commerciales ?? null,
        commentaire_partenariat: draft || null,
        limite_ellipro: compte.limite_ellipro ?? null,
      })
    } else if (compte.type_compte === 'partenaire') {
      await updatePartenaire.mutateAsync({
        compteId: compte.id,
        type_partenariat: compte.type_partenariat ?? null,
        modele_remuneration: compte.modele_remuneration ?? null,
        contact_referent_id: compte.contact_referent_id ?? null,
        contact_referent_nom: compte.contact_referent_nom ?? null,
        statut_partenariat: compte.statut_partenariat ?? 'À qualifier',
        date_debut_partenariat: compte.date_debut_partenariat ?? null,
        commentaire_partenariat: draft || null,
      })
    }
    setEditing(false)
  }

  if (isKiwee) return null

  return (
    <div className="rounded-kw-2xl border border-kw-border bg-kw-surface p-3.5">
      <div className="mb-2 flex items-center gap-1.5">
        <span className="text-kw-xs font-bold uppercase tracking-wide text-kw-faint">Commentaire</span>
        <div className="flex-1" />
        {!editing && (
          <button type="button" onClick={() => { setDraft(initialValue); setEditing(true) }} title="Modifier" className="rounded p-0.5 text-kw-ghost hover:bg-kw-muted hover:text-kw-ink">
            <Pencil className="h-3 w-3" />
          </button>
        )}
      </div>
      {editing ? (
        <Textarea
          rows={6}
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={save}
          disabled={pending}
          className="text-kw-md"
        />
      ) : (
        <p
          onClick={() => { setDraft(initialValue); setEditing(true) }}
          className="cursor-pointer whitespace-pre-wrap rounded-kw-lg p-1 text-kw-md leading-relaxed text-kw-body hover:bg-kw-muted"
        >
          {initialValue || <span className="text-kw-faint">Cliquer pour ajouter un commentaire…</span>}
        </p>
      )}
    </div>
  )
}

function AddCompteurAutoSiteDialog({
  open,
  onClose,
  compte,
  sites,
  onSaved,
}: {
  open: boolean
  onClose: () => void
  compte: Compte
  sites: Site[]
  onSaved: (message: string) => void
}) {
  const { data: energiesRef } = useReferenceTable('types_energies')
  const energies = energiesRef && energiesRef.length > 0 ? energiesRef : FALLBACK_TYPES_ENERGIES
  const { data: utilisationsRef } = useReferenceTable('types_utilisations_compteur')
  const { data: comptes } = useComptes()
  const { data: contacts } = useContacts()
  const { data: compteurs } = useCompteurs()
  const createSite = useCreateSite()
  const createCompteur = useCreateCompteur()

  const [step, setStep] = useState<'adresse' | 'ambigu' | 'pdl'>('adresse')
  const [libelleSite, setLibelleSite] = useState('')
  const [adresse, setAdresse] = useState('')
  const [ville, setVille] = useState('')
  const [codePostal, setCodePostal] = useState('')
  const [candidats, setCandidats] = useState<Site[]>([])
  const [choixSiteId, setChoixSiteId] = useState<string>('')
  const [siteResolu, setSiteResolu] = useState<{ id: string; nom: string } | null>(null)
  const [siteMessage, setSiteMessage] = useState('')
  const [drafts, setDrafts] = useState<PdlDraft[]>([emptyPdlDraft()])
  const [submitting, setSubmitting] = useState(false)
  const [createdCompteurs, setCreatedCompteurs] = useState<ChainedCompteur[] | null>(null)

  const fournisseurs = (comptes ?? []).filter((c) => c.type_compte === 'fournisseur')
  const contactsDuCompte = (contacts ?? []).filter((c) => c.compte_id === compte.id)

  // Un brouillon non encore créé auquel il manque un champ requis bloque l'enregistrement (Tools).
  const draftsIncomplets = drafts.some((d) => {
    if (d.status === 'saved' || d.status === 'saving') return false
    const code = energies.find((e) => e.id === d.typeEnergieId)?.code?.toLowerCase()
    return champsPdlManquants(d, code !== 'gaz').size > 0
  })

  function reset() {
    setStep('adresse')
    setLibelleSite('')
    setAdresse('')
    setVille('')
    setCodePostal('')
    setCandidats([])
    setChoixSiteId('')
    setSiteResolu(null)
    setSiteMessage('')
    setDrafts([emptyPdlDraft()])
    setSubmitting(false)
    setCreatedCompteurs(null)
  }

  function patchDraft(key: string, patch: Partial<PdlDraft>) {
    setDrafts((prev) => prev.map((d) => (d.key === key ? { ...d, ...patch } : d)))
  }

  async function resoudreEtCreerSite(): Promise<{ id: string; nom: string }> {
    const nomNouveauSite = libelleSite.trim() || ville.trim() || 'Nouveau site'
    const result = await createSite.mutateAsync({
      nom: nomNouveauSite,
      compte_id: compte.id,
      compte_nom: compte.nom,
      type_site_id: null,
      type_site_libelle: '',
      adresse,
      ville,
      code_postal: codePostal,
    })
    return result.site
  }

  async function handleSubmitAdresse(e: React.FormEvent) {
    e.preventDefault()
    const match = matchSitesPourCompteur(sites, compte.id, ville, codePostal)
    if (match.kind === 'auto') {
      setSiteResolu(match.site)
      setSiteMessage(`✓ Compteur(s) rattaché(s) automatiquement au site « ${match.site.nom} »`)
      setStep('pdl')
    } else if (match.kind === 'ambiguous') {
      setCandidats(match.candidates)
      setChoixSiteId(match.candidates[0]?.id ?? '')
      setStep('ambigu')
    } else {
      setSubmitting(true)
      const site = await resoudreEtCreerSite()
      setSubmitting(false)
      setSiteResolu(site)
      setSiteMessage(`✓ Nouveau site « ${site.nom} » créé automatiquement`)
      setStep('pdl')
    }
  }

  async function handleConfirmAmbigu() {
    if (choixSiteId === '__nouveau__') {
      setSubmitting(true)
      const site = await resoudreEtCreerSite()
      setSubmitting(false)
      setSiteResolu(site)
      setSiteMessage(`✓ Nouveau site « ${site.nom} » créé automatiquement`)
      setStep('pdl')
    } else {
      const site = candidats.find((s) => s.id === choixSiteId)
      if (!site) return
      setSiteResolu(site)
      setSiteMessage(`✓ Compteur(s) rattaché(s) au site « ${site.nom} »`)
      setStep('pdl')
    }
  }

  async function handleSubmitPdl(e: React.FormEvent) {
    e.preventDefault()
    if (!siteResolu) return
    setSubmitting(true)
    let created = 0
    const nouveaux: ChainedCompteur[] = []
    for (const d of drafts) {
      if (d.status === 'saved') continue
      const energieChoisie = energies.find((en) => en.id === d.typeEnergieId)
      const typeEnergie = (energieChoisie?.code?.toLowerCase() === 'gaz' ? 'gaz' : 'electricite') as 'electricite' | 'gaz'
      const fournisseur = fournisseurs.find((f) => f.id === d.fournisseurActuelId)
      const responsable = contactsDuCompte.find((c) => c.id === d.responsableContactId)
      patchDraft(d.key, { status: 'saving' })
      try {
        const result = await createCompteur.mutateAsync({
          site_id: siteResolu.id,
          site_nom: siteResolu.nom,
          type_energie_id: d.typeEnergieId || null,
          type_energie: typeEnergie,
          numero_pdl: d.numeroPdl,
          utilisation: d.utilisation,
          type_utilisation_compteur_id: d.typeUtilisationId || null,
          date_echeance: d.dateEcheance || null,
          fournisseur_actuel_compte_id: d.fournisseurActuelId || null,
          fournisseur_actuel_nom: fournisseur?.nom ?? null,
          responsable_contact_id: d.responsableContactId || null,
          responsable_contact_nom: responsable ? `${responsable.prenom} ${responsable.nom}` : null,
          ...buildDraftCharacteristics(d, typeEnergie === 'electricite'),
        })
        patchDraft(d.key, { status: 'saved' })
        created += 1
        nouveaux.push({ id: result.compteur.id, numero_pdl: result.compteur.numero_pdl, responsable_contact_id: result.compteur.responsable_contact_id ?? null })
      } catch (err) {
        patchDraft(d.key, { status: 'error', errorMessage: err instanceof Error ? err.message : 'Erreur inconnue' })
      }
    }
    setSubmitting(false)
    if (created > 0) onSaved(`${siteMessage}${created > 1 ? ` (${created} PDL)` : ''}`)
    setDrafts((prev) => {
      if (prev.every((d) => d.status === 'saved') && nouveaux.length > 0) {
        setCreatedCompteurs(nouveaux)
      }
      return prev
    })
  }

  if (createdCompteurs) {
    return (
      <Dialog open={open} onClose={() => { reset(); onClose() }} title="PDL créé(s) avec succès" description="Que veux-tu faire ensuite ?" className="max-w-xl">
        <MandatChainPrompt
          compteId={compte.id}
          compteNom={compte.nom}
          compteurs={createdCompteurs}
          contacts={contactsDuCompte}
          onDone={() => { reset(); onClose() }}
        />
      </Dialog>
    )
  }

  return (
    <Dialog
      open={open}
      onClose={() => { reset(); onClose() }}
      title="Nouveau compteur"
      className="max-w-xl"
      description={
        step === 'adresse'
          ? "Kimatch retrouve ou crée automatiquement le site correspondant à partir de l'adresse."
          : step === 'ambigu'
            ? 'Plusieurs sites existants pourraient correspondre — confirme le bon rattachement.'
            : `Site : ${siteResolu?.nom}`
      }
    >
      {step === 'adresse' && (
        <form onSubmit={handleSubmitAdresse} className="space-y-3">
          <FormField label="Libellé du site (si connu)">
            <Input value={libelleSite} onChange={(e) => setLibelleSite(e.target.value)} placeholder="Ex. Résidence Les Tilleuls" />
          </FormField>
          <FormField label="Adresse">
            <AddressAutocomplete
              value={adresse}
              onChange={setAdresse}
              onSelect={(a) => { setAdresse(a.rue ?? a.label); if (a.codePostal) setCodePostal(a.codePostal); if (a.ville) setVille(a.ville) }}
            />
          </FormField>
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Ville">
              <Input value={ville} onChange={(e) => setVille(e.target.value)} required />
            </FormField>
            <FormField label="Code postal">
              <Input value={codePostal} onChange={(e) => setCodePostal(e.target.value)} required />
            </FormField>
          </div>
          <p className="text-[10.5px] text-navy-400">Vérifie que l'adresse correspond bien au site existant avant de valider.</p>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={() => { reset(); onClose() }}>Annuler</Button>
            <Button type="submit" disabled={submitting}>Continuer</Button>
          </div>
        </form>
      )}

      {step === 'ambigu' && (
        <div className="space-y-3">
          <div className="max-h-56 space-y-2 overflow-y-auto rounded-lg border border-navy-200 p-2">
            {candidats.map((s) => (
              <label key={s.id} className="flex items-center gap-2 rounded-md p-1.5 text-sm text-navy-700 hover:bg-navy-50">
                <input type="radio" name="site-ambigu" checked={choixSiteId === s.id} onChange={() => setChoixSiteId(s.id)} />
                <span>{s.nom} <span className="text-navy-400">— {s.ville} ({s.code_postal})</span></span>
              </label>
            ))}
            <label className="flex items-center gap-2 rounded-md border-t border-navy-100 p-1.5 pt-2.5 text-sm text-navy-700 hover:bg-navy-50">
              <input type="radio" name="site-ambigu" checked={choixSiteId === '__nouveau__'} onChange={() => setChoixSiteId('__nouveau__')} />
              <span>Créer un nouveau site « {libelleSite.trim() || ville.trim() || 'Nouveau site'} »</span>
            </label>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={() => setStep('adresse')}>Retour</Button>
            <Button type="button" disabled={submitting || !choixSiteId} onClick={handleConfirmAmbigu}>Confirmer</Button>
          </div>
        </div>
      )}

      {step === 'pdl' && (
        <form onSubmit={handleSubmitPdl} className="max-h-[70vh] space-y-4 overflow-y-auto pr-1">
          <PdlDraftRows
            drafts={drafts}
            onChange={patchDraft}
            onRemove={(key) => setDrafts((prev) => prev.filter((d) => d.key !== key))}
            onAdd={() => setDrafts((prev) => [...prev, emptyPdlDraft()])}
            energies={energies}
            utilisationsRef={utilisationsRef}
            fournisseurs={fournisseurs}
            contacts={contactsDuCompte}
            existingCompteurs={compteurs ?? []}
          />
          {draftsIncomplets && (
            <p className="flex items-center gap-1.5 text-xs text-amber-700">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
              Complète les champs marqués d'une astérisque : ils alimentent l'éligibilité fournisseur lors de la cotation.
            </p>
          )}
          <div className="flex justify-end gap-2 border-t border-navy-100 pt-3">
            <Button type="button" variant="ghost" onClick={() => { reset(); onClose() }}>Fermer</Button>
            <Button type="submit" disabled={submitting || draftsIncomplets || drafts.every((d) => d.status === 'saved')}>
              {drafts.length > 1 ? `Créer les ${drafts.length} PDL` : 'Créer le PDL'}
            </Button>
          </div>
        </form>
      )}
    </Dialog>
  )
}

function AddFichierDialog({ open, onClose, compteId, onSaved }: { open: boolean; onClose: () => void; compteId: string; onSaved: () => void }) {
  const { data: typesRef } = useReferenceTable('types_documents')
  const types = typesRef && typesRef.length > 0 ? typesRef : FALLBACK_TYPES_DOCUMENTS
  const createDocument = useCreateDocument()

  const [nom, setNom] = useState('')
  const [url, setUrl] = useState('')
  const [typeDocumentId, setTypeDocumentId] = useState('')
  const [feedback, setFeedback] = useState<string | null>(null)

  function reset() {
    setNom('')
    setUrl('')
    setTypeDocumentId('')
    setFeedback(null)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const type = types.find((t) => t.id === typeDocumentId)
    const result = await createDocument.mutateAsync({
      nom,
      url,
      type_document_id: typeDocumentId || null,
      type_document_libelle: type?.libelle ?? '',
      entite_type: 'compte',
      entite_id: compteId,
    })
    onSaved()
    if (!result.persisted) {
      setFeedback('Ajouté localement (non synchronisé avec Supabase).')
      setTimeout(() => { reset(); onClose() }, 700)
    } else {
      reset()
      onClose()
    }
  }

  return (
    <Dialog open={open} onClose={() => { reset(); onClose() }} title="Ajouter un fichier" description="Rattacher un document à ce compte.">
      <form onSubmit={handleSubmit} className="space-y-3">
        <FormField label="Nom du document">
          <Input value={nom} onChange={(e) => setNom(e.target.value)} required placeholder="Ex. Kbis — Foncia Lyon Rhône" />
        </FormField>
        <FormField label="Lien du document (URL)">
          <Input type="url" value={url} onChange={(e) => setUrl(e.target.value)} required placeholder="https://…" />
        </FormField>
        <FormField label="Type de document">
          <Select value={typeDocumentId} onChange={(e) => setTypeDocumentId(e.target.value)}>
            <option value="">Sélectionner…</option>
            {types.map((t) => <option key={t.id} value={t.id}>{t.libelle}</option>)}
          </Select>
        </FormField>
        {feedback && <p className="text-xs text-navy-500">{feedback}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="ghost" onClick={() => { reset(); onClose() }}>Annuler</Button>
          <Button type="submit" disabled={createDocument.isPending}>Ajouter</Button>
        </div>
      </form>
    </Dialog>
  )
}

function EditCompteClientDialog({ compte, comptes, open, onClose }: { compte: Compte; comptes: Compte[]; open: boolean; onClose: () => void }) {
  const { data: segmentsRef } = useReferenceTable('segments_comptes')
  const update = useUpdateCompteClient()
  const [segmentId, setSegmentId] = useState(compte.segment_compte_id ?? '')
  const [origine, setOrigine] = useState(compte.origine_acquisition ?? '')
  const [mandatCadre, setMandatCadre] = useState(compte.mandat_cadre_actif ?? false)
  const [note, setNote] = useState(compte.note_interne ?? '')
  const [apporteurId, setApporteurId] = useState(compte.apporteur_partenaire_id ?? '')
  const [feedback, setFeedback] = useState<string | null>(null)

  const partenaires = comptes.filter((c) => c.type_compte === 'partenaire')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const segment = segmentsRef?.find((s) => s.id === segmentId)
    const result = await update.mutateAsync({
      compteId: compte.id,
      segment_compte_id: segmentId || null,
      segment_compte_libelle: segment?.libelle ?? null,
      conseiller_referent_id: compte.conseiller_referent_id ?? null,
      conseiller_referent_nom: compte.conseiller_referent_nom ?? null,
      origine_acquisition: origine || null,
      mandat_cadre_actif: mandatCadre,
      note_interne: note || null,
      apporteur_partenaire_id: apporteurId || null,
    })
    setFeedback(result.persisted ? 'Enregistré.' : 'Enregistré localement (non synchronisé avec Supabase).')
    setTimeout(onClose, 700)
  }

  return (
    <Dialog open={open} onClose={onClose} title="Détails client">
      <form onSubmit={handleSubmit} className="space-y-3">
        <FormField label="Segment">
          <Select value={segmentId} onChange={(e) => setSegmentId(e.target.value)}>
            <option value="">—</option>
            {segmentsRef?.map((s) => <option key={s.id} value={s.id}>{s.libelle}</option>)}
          </Select>
        </FormField>
        <FormField label="Origine d'acquisition">
          <Input value={origine} onChange={(e) => setOrigine(e.target.value)} placeholder="Ex. Recommandation, salon, prospection…" />
        </FormField>
        {partenaires.length > 0 && (
          <FormField label="Apporteur d'affaires (optionnel)">
            <Select value={apporteurId} onChange={(e) => setApporteurId(e.target.value)}>
              <option value="">—</option>
              {partenaires.map((p) => <option key={p.id} value={p.id}>{p.nom}</option>)}
            </Select>
          </FormField>
        )}
        <label className="flex items-center gap-2 text-sm text-navy-700">
          <input type="checkbox" checked={mandatCadre} onChange={(e) => setMandatCadre(e.target.checked)} />
          Mandat-cadre actif
        </label>
        <FormField label="Note interne">
          <Textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} />
        </FormField>
        {feedback && <p className="text-xs text-navy-500">{feedback}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="ghost" onClick={onClose}>Annuler</Button>
          <Button type="submit" disabled={update.isPending}>Enregistrer</Button>
        </div>
      </form>
    </Dialog>
  )
}

function EditCompteFournisseurDialog({ compte, contacts, open, onClose }: { compte: Compte; contacts: { id: string; prenom: string; nom: string }[]; open: boolean; onClose: () => void }) {
  const update = useUpdateCompteFournisseur()
  const [electricite, setElectricite] = useState(compte.fournit_electricite ?? false)
  const [gaz, setGaz] = useState(compte.fournit_gaz ?? false)
  const [contactId, setContactId] = useState(compte.contact_commercial_id ?? '')
  const [statut, setStatut] = useState(compte.statut_partenariat ?? 'À qualifier')
  const [conditions, setConditions] = useState(compte.conditions_commerciales ?? '')
  const [commentaire, setCommentaire] = useState(compte.commentaire_partenariat ?? '')
  const [limiteEllipro, setLimiteEllipro] = useState(compte.limite_ellipro != null ? String(compte.limite_ellipro) : '')
  const [feedback, setFeedback] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const contact = contacts.find((c) => c.id === contactId)
    const result = await update.mutateAsync({
      compteId: compte.id,
      fournit_electricite: electricite,
      fournit_gaz: gaz,
      contact_commercial_id: contactId || null,
      contact_commercial_nom: contact ? `${contact.prenom} ${contact.nom}` : null,
      statut_partenariat: statut,
      conditions_commerciales: conditions || null,
      commentaire_partenariat: commentaire || null,
      limite_ellipro: limiteEllipro ? Number(limiteEllipro) : null,
    })
    setFeedback(result.persisted ? 'Enregistré.' : 'Enregistré localement (non synchronisé avec Supabase).')
    setTimeout(onClose, 700)
  }

  return (
    <Dialog open={open} onClose={onClose} title="Détails fournisseur">
      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="flex gap-4">
          <label className="flex items-center gap-2 text-sm text-navy-700">
            <input type="checkbox" checked={electricite} onChange={(e) => setElectricite(e.target.checked)} />
            Fournit l'électricité
          </label>
          <label className="flex items-center gap-2 text-sm text-navy-700">
            <input type="checkbox" checked={gaz} onChange={(e) => setGaz(e.target.checked)} />
            Fournit le gaz
          </label>
        </div>
        {contacts.length > 0 && (
          <FormField label="Contact commercial">
            <Select value={contactId} onChange={(e) => setContactId(e.target.value)}>
              <option value="">—</option>
              {contacts.map((c) => <option key={c.id} value={c.id}>{c.prenom} {c.nom}</option>)}
            </Select>
          </FormField>
        )}
        <FormField label="Statut du partenariat">
          <Input value={statut} onChange={(e) => setStatut(e.target.value)} />
        </FormField>
        <FormField label="Limite Ellipro">
          <Input type="number" value={limiteEllipro} onChange={(e) => setLimiteEllipro(e.target.value)} placeholder="Ex. 5" />
        </FormField>
        <FormField label="Conditions commerciales">
          <Textarea rows={2} value={conditions} onChange={(e) => setConditions(e.target.value)} />
        </FormField>
        <FormField label="Commentaire">
          <Textarea rows={2} value={commentaire} onChange={(e) => setCommentaire(e.target.value)} />
        </FormField>
        {feedback && <p className="text-xs text-navy-500">{feedback}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="ghost" onClick={onClose}>Annuler</Button>
          <Button type="submit" disabled={update.isPending}>Enregistrer</Button>
        </div>
      </form>
    </Dialog>
  )
}

function EditComptePartenaireDialog({ compte, contacts, open, onClose }: { compte: Compte; contacts: { id: string; prenom: string; nom: string }[]; open: boolean; onClose: () => void }) {
  const update = useUpdateComptePartenaire()
  const [typePartenariat, setTypePartenariat] = useState(compte.type_partenariat ?? '')
  const [modeleRemuneration, setModeleRemuneration] = useState(compte.modele_remuneration ?? '')
  const [contactId, setContactId] = useState(compte.contact_referent_id ?? '')
  const [statut, setStatut] = useState(compte.statut_partenariat ?? 'À qualifier')
  const [dateDebut, setDateDebut] = useState(compte.date_debut_partenariat ?? '')
  const [commentaire, setCommentaire] = useState(compte.commentaire_partenariat ?? '')
  const [feedback, setFeedback] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const contact = contacts.find((c) => c.id === contactId)
    const result = await update.mutateAsync({
      compteId: compte.id,
      type_partenariat: typePartenariat || null,
      modele_remuneration: modeleRemuneration || null,
      contact_referent_id: contactId || null,
      contact_referent_nom: contact ? `${contact.prenom} ${contact.nom}` : null,
      statut_partenariat: statut,
      date_debut_partenariat: dateDebut || null,
      commentaire_partenariat: commentaire || null,
    })
    setFeedback(result.persisted ? 'Enregistré.' : 'Enregistré localement (non synchronisé avec Supabase).')
    setTimeout(onClose, 700)
  }

  return (
    <Dialog open={open} onClose={onClose} title="Détails partenaire">
      <form onSubmit={handleSubmit} className="space-y-3">
        <FormField label="Type de partenariat">
          <Input value={typePartenariat} onChange={(e) => setTypePartenariat(e.target.value)} placeholder="Ex. Apporteur d'affaires" />
        </FormField>
        <FormField label="Modèle de rémunération">
          <Input value={modeleRemuneration} onChange={(e) => setModeleRemuneration(e.target.value)} placeholder="Ex. Commission 5%" />
        </FormField>
        {contacts.length > 0 && (
          <FormField label="Contact référent">
            <Select value={contactId} onChange={(e) => setContactId(e.target.value)}>
              <option value="">—</option>
              {contacts.map((c) => <option key={c.id} value={c.id}>{c.prenom} {c.nom}</option>)}
            </Select>
          </FormField>
        )}
        <FormField label="Statut du partenariat">
          <Input value={statut} onChange={(e) => setStatut(e.target.value)} />
        </FormField>
        <FormField label="Date de début">
          <Input type="date" value={dateDebut} onChange={(e) => setDateDebut(e.target.value)} />
        </FormField>
        <FormField label="Commentaire">
          <Textarea rows={2} value={commentaire} onChange={(e) => setCommentaire(e.target.value)} />
        </FormField>
        {feedback && <p className="text-xs text-navy-500">{feedback}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="ghost" onClick={onClose}>Annuler</Button>
          <Button type="submit" disabled={update.isPending}>Enregistrer</Button>
        </div>
      </form>
    </Dialog>
  )
}

function EditCompteDialog({ compte, open, onClose }: { compte: Compte; open: boolean; onClose: () => void }) {
  const updateCompte = useUpdateCompte()
  const isAdmin = useIsAdmin()
  const { data: profilsAdmin } = useProfilsAdmin()
  const [nom, setNom] = useState(compte.nom)
  const [ville, setVille] = useState(compte.ville)
  const [segment, setSegment] = useState(compte.segment)
  const [proprietaireId, setProprietaireId] = useState(compte.proprietaire_id ?? '')
  const [feedback, setFeedback] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setNom(compte.nom)
    setVille(compte.ville)
    setSegment(compte.segment)
    setProprietaireId(compte.proprietaire_id ?? '')
    setFeedback(null)
  }, [open, compte])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    try {
      await updateCompte.mutateAsync({ id: compte.id, nom, ville, segment, proprietaire_id: proprietaireId || null })
      onClose()
    } catch (err) {
      setFeedback(err instanceof Error ? err.message : 'Erreur inconnue')
    }
  }

  return (
    <Dialog open={open} onClose={onClose} title="Modifier le compte" description="Mettre à jour les informations de base du compte.">
      <form onSubmit={handleSubmit} className="space-y-3">
        <FormField label="Nom">
          <Input value={nom} onChange={(e) => setNom(e.target.value)} required />
        </FormField>
        <FormField label="Ville">
          <Input value={ville} onChange={(e) => setVille(e.target.value)} />
        </FormField>
        <FormField label="Segment">
          <Input value={segment} onChange={(e) => setSegment(e.target.value)} />
        </FormField>
        {isAdmin && (
          <FormField label="Propriétaire">
            <Select value={proprietaireId} onChange={(e) => setProprietaireId(e.target.value)}>
              <option value="">Aucun</option>
              {profilsAdmin?.map((p) => <option key={p.id} value={p.id}>{p.prenom} {p.nom}</option>)}
            </Select>
          </FormField>
        )}
        {feedback && <p className="text-xs text-red-600">{feedback}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="ghost" onClick={onClose}>Annuler</Button>
          <Button type="submit" disabled={updateCompte.isPending}>Enregistrer</Button>
        </div>
      </form>
    </Dialog>
  )
}
