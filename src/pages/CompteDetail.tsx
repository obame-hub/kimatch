import { useEffect, useMemo, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  ArrowLeft,
  Phone,
  StickyNote,
  Plus,
  Building2,
  Users,
  Copy,
  Zap,
  Flame,
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
} from 'lucide-react'
import { Topbar } from '@/components/layout/Topbar'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { EntityLink } from '@/components/ui/entity-link'
import { PhoneLink, EmailLink } from '@/components/ui/contact-link'
import { Dialog } from '@/components/ui/dialog'
import { FormField, Input, Select, Textarea } from '@/components/ui/form'
import { HistoriqueDiscret } from '@/components/ui/historique-discret'
import {
  useComptes,
  useUpdateCompteScore,
  useUpdateCompteClient,
  useUpdateCompteFournisseur,
  useUpdateComptePartenaire,
  useUpdateCompte,
  useDeleteCompte,
} from '@/lib/data/comptes'
import { useSites } from '@/lib/data/sites'
import { useContacts } from '@/lib/data/contacts'
import { useSignaux } from '@/lib/data/signaux'
import { useCompteurs } from '@/lib/data/compteurs'
import { useRecommandations } from '@/lib/data/recommandations'
import { useContrats } from '@/lib/data/contrats'
import { useInteractions } from '@/lib/data/interactions'
import { useMandats } from '@/lib/data/mandats'
import { useActions } from '@/lib/data/actions'
import { useDocuments, useCreateDocument } from '@/lib/data/documents'
import { useHistorique } from '@/lib/data/historique'
import { useEllisphereScore } from '@/lib/data/ellisphere'
import { useReferenceTable } from '@/lib/data/referenceTables'
import {
  FALLBACK_STATUTS_CONTRATS,
  STATUT_CONTRAT_TONE,
  FALLBACK_STATUTS_MANDATS,
  STATUT_MANDAT_TONE,
  FALLBACK_STATUTS_VERSIONS,
  FALLBACK_ETAPES_RECOMMANDATION,
  ETAPE_TONE,
  FALLBACK_TYPES_DOCUMENTS,
} from '@/lib/referenceFallbacks'
import { useCanManage, useIsAdmin, useProfilsAdmin } from '@/lib/data/roles'
import { ActivityFeed } from '@/components/site/ActivityFeed'
import { cn } from '@/lib/utils'
import { useGoBack } from '@/lib/useGoBack'
import type { Compte, Contact, Site, TypeCompte } from '@/types/domain'

const typeMeta: Record<TypeCompte, { label: string; tone: 'kiwi' | 'blue' | 'amber' | 'neutral' }> = {
  client: { label: 'Client', tone: 'kiwi' },
  fournisseur: { label: 'Fournisseur', tone: 'blue' },
  partenaire: { label: 'Partenaire', tone: 'amber' },
  kiwee: { label: 'KiWee', tone: 'neutral' },
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
  const { data: comptes } = useComptes()
  const { data: sites } = useSites()
  const { data: contacts } = useContacts()
  const { data: signaux } = useSignaux()
  const { data: compteurs } = useCompteurs()
  const { data: recommandations } = useRecommandations()
  const { data: contrats } = useContrats()
  const { data: interactions } = useInteractions()
  const { data: mandats } = useMandats()
  const { data: actions } = useActions()
  const { data: documents } = useDocuments()
  const ellisphereScore = useEllisphereScore()
  const updateScore = useUpdateCompteScore()
  const deleteCompte = useDeleteCompte()
  const goBack = useGoBack('/comptes')

  const { data: statutsContratsRef } = useReferenceTable('statuts_contrats')
  const statutsContrats = statutsContratsRef && statutsContratsRef.length > 0 ? statutsContratsRef : FALLBACK_STATUTS_CONTRATS
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

  function showToast(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(null), 2200)
  }

  const compte = comptes?.find((c) => c.id === id)
  const canManage = useCanManage(compte?.proprietaire_id)
  const { data: historique } = useHistorique('comptes', compte?.id)

  const sitesDuCompte = useMemo(() => sites?.filter((s) => s.compte_id === id) ?? [], [sites, id])
  const siteIdsDuCompte = useMemo(() => new Set(sitesDuCompte.map((s) => s.id)), [sitesDuCompte])
  const contactsDuCompte = useMemo(() => contacts?.filter((c) => c.compte_id === id) ?? [], [contacts, id])
  const signauxDuCompte = useMemo(() => signaux?.filter((s) => siteIdsDuCompte.has(s.site_id)) ?? [], [signaux, siteIdsDuCompte])
  const compteursDuCompte = useMemo(() => compteurs?.filter((c) => siteIdsDuCompte.has(c.site_id)) ?? [], [compteurs, siteIdsDuCompte])
  const contratsDuCompte = useMemo(() => contrats?.filter((c) => siteIdsDuCompte.has(c.site_id)) ?? [], [contrats, siteIdsDuCompte])
  const recommandationsDuCompte = useMemo(() => recommandations?.filter((r) => r.compte_id === id) ?? [], [recommandations, id])
  const mandatsDuCompte = useMemo(() => mandats?.filter((m) => m.compte_id === id) ?? [], [mandats, id])
  const interactionsDuCompte = useMemo(
    () => interactions?.filter((i) => i.compte_id === id || siteIdsDuCompte.has(i.site_id ?? '')) ?? [],
    [interactions, id, siteIdsDuCompte],
  )
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
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [compte?.id])

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
      <div className="flex flex-wrap items-center gap-3.5 border-b border-navy-100 bg-white px-4 py-3.5 sm:px-6">
        <Button variant="ghost" size="icon" onClick={goBack} title="Retour aux comptes">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] bg-gradient-to-br from-sky-500 to-sky-400 text-white">
          <Building2 className="h-[18px] w-[18px]" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="truncate text-xl font-bold tracking-tight text-navy-800">{compte.nom}</p>
            <Badge tone={typeMeta[compte.type_compte].tone}>{typeMeta[compte.type_compte].label}</Badge>
          </div>
          <p className="truncate text-xs text-navy-500">{compte.segment} · {sitesDuCompte.length} site{sitesDuCompte.length > 1 ? 's' : ''} géré{sitesDuCompte.length > 1 ? 's' : ''}</p>
        </div>
        <div className="hidden gap-1.5 lg:flex">
          <Button
            variant="outline"
            size="sm"
            disabled={!contactPrincipal?.telephone}
            onClick={() => contactPrincipal?.telephone && (window.location.href = `tel:${contactPrincipal.telephone}`)}
          >
            <Phone className="h-3.5 w-3.5" />
            Appeler
          </Button>
          <Button variant="outline" size="sm" onClick={() => setTab('activite')}>
            <StickyNote className="h-3.5 w-3.5" />
            Note
            <span className="font-mono text-[9px] text-navy-300">N</span>
          </Button>
          <Button size="sm" onClick={() => navigate('/sites', { state: { openCreateForCompteId: compte.id } })}>
            <Plus className="h-3.5 w-3.5" />
            Site
          </Button>
          {canManage && (
            <>
              <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
                <Pencil className="h-3.5 w-3.5" />
                Modifier
              </Button>
              <Button variant="outline" size="sm" onClick={() => setConfirmDelete(true)}>
                <Trash2 className="h-3.5 w-3.5" />
                Supprimer
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Onglets */}
      <div className="flex gap-1.5 overflow-x-auto border-b border-navy-100 bg-white px-4 pt-2.5 lg:gap-0.5 lg:pt-0 sm:px-6">
        {TABS.map((t) => {
          const isActive = tab === t.key
          const badgeTone = t.key === 'signaux' ? 'bg-red-500 text-white' : t.key === 'mandats' ? 'bg-amber-200 text-amber-700' : 'bg-navy-100 text-navy-500'
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={cn(
                'mb-2.5 inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 py-2 text-[12.5px] font-semibold transition-colors lg:mb-0 lg:rounded-none lg:border-b-2 lg:px-3 lg:py-2.5 lg:font-normal',
                t.mobileOnly && 'lg:hidden',
                isActive
                  ? 'bg-ink-800 text-white lg:border-navy-800 lg:bg-transparent lg:font-semibold lg:text-navy-800'
                  : 'border border-navy-200 bg-white text-navy-600 hover:bg-navy-50 lg:border-0 lg:border-b-2 lg:border-transparent lg:text-navy-500 lg:hover:bg-transparent lg:hover:text-navy-700',
              )}
            >
              <span className="lg:hidden">{t.labelMobile ?? t.label}</span>
              <span className="hidden lg:inline">{t.label}</span>
              {t.badge && (
                <span className={cn('rounded px-1.5 py-0.5 text-[9.5px] font-bold', isActive ? 'bg-white/20 text-white lg:bg-navy-100 lg:text-navy-500' : badgeTone)}>
                  {t.badge}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* 3 zones */}
      <div className="grid flex-1 grid-cols-1 overflow-hidden lg:grid-cols-[280px_1fr_304px]">
        {/* Colonne gauche — Contacts (desktop uniquement) */}
        <div className="hidden flex-col gap-3.5 overflow-y-auto border-r border-navy-100 bg-navy-50/60 p-3.5 lg:flex">
          <ContactsPanel contacts={contactsDuCompte} />
          <CommentaireCard compte={compte} />
        </div>

        {/* Centre — contenu de l'onglet */}
        <div className="overflow-y-auto bg-navy-50 p-4 sm:p-5">
          {tab === 'synthese' && (
            <div className="flex flex-col gap-3.5">
              <div className="grid grid-cols-1 gap-3.5 lg:grid-cols-2">
                <div className="rounded-xl border border-navy-100 bg-white p-4">
                  <div className="mb-3 flex items-center">
                    <span className="text-[10px] font-bold uppercase tracking-wide text-navy-400">Identité</span>
                    <div className="flex-1" />
                    <span className="text-[10px] text-navy-300">cliquer ⧉ pour copier</span>
                  </div>
                  <div className="grid grid-cols-2 gap-3.5">
                    <InfoField label="Segment" value={compte.segment || '—'} onCopy={showToast} />
                    <InfoField label="Ville" value={compte.ville || '—'} onCopy={showToast} />
                    {compte.siren && <InfoField label="SIREN" value={compte.siren} onCopy={showToast} />}
                    {compte.siret && <InfoField label="SIRET" value={compte.siret} onCopy={showToast} />}
                    {compte.telephone && <InfoField label="Téléphone" value={compte.telephone} onCopy={showToast} />}
                    {compte.email && <InfoField label="Email" value={compte.email} onCopy={showToast} />}
                    {compte.site_web && <InfoField label="Site web" value={compte.site_web} onCopy={showToast} />}
                    {compte.score_ellipro && (
                      <div>
                        <div className="mb-0.5 text-[10px] uppercase tracking-wide text-navy-400">Note Ellisphere</div>
                        <span className="rounded bg-kiwi-50 px-1.5 py-0.5 text-[11px] font-extrabold text-kiwi-600">
                          {compte.score_ellipro}{compte.score_ellipro_scale ? ` / ${compte.score_ellipro_scale}` : ''}
                        </span>
                      </div>
                    )}
                  </div>
                  <HistoriqueDiscret tableNom="comptes" ligneId={compte.id} />
                </div>

                <div className="rounded-xl border border-navy-100 bg-white p-4">
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
                </div>
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
                        {compte.note_interne && <p><span className="text-navy-400">Note interne :</span> {compte.note_interne}</p>}
                      </>
                    )}
                    {compte.type_compte === 'fournisseur' && (
                      <>
                        <p><span className="text-navy-400">Fournit :</span> {[compte.fournit_electricite && 'Électricité', compte.fournit_gaz && 'Gaz'].filter(Boolean).join(', ') || '—'}</p>
                        <p><span className="text-navy-400">Contact commercial :</span> {compte.contact_commercial_nom || '—'}</p>
                        <p><span className="text-navy-400">Statut partenariat :</span> <Badge tone="neutral">{compte.statut_partenariat || 'À qualifier'}</Badge></p>
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

              <div>
                <p className="mb-2 text-[10px] font-bold uppercase tracking-wide text-navy-400">Sites rattachés</p>
                {sitesDuCompte.length === 0 ? (
                  <p className="text-sm text-navy-400">Aucun site rattaché à ce compte.</p>
                ) : (
                  <div className="flex flex-col gap-2.5">
                    {sitesDuCompte.map((site) => (
                      <div
                        key={site.id}
                        onClick={() => navigate(`/sites/${site.id}`)}
                        className="flex cursor-pointer items-center gap-3 rounded-xl border border-navy-100 bg-white p-3.5 hover:bg-navy-50/60"
                      >
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-kiwi-100 text-kiwi-600">
                          <Building2 className="h-4 w-4" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-bold text-navy-800">{site.nom}</p>
                          <p className="truncate text-[10.5px] text-navy-400">{site.type_site} · {site.ville} ({site.code_postal})</p>
                        </div>
                        <Badge tone={site.statut === 'actif' ? 'kiwi' : 'neutral'}>{site.statut}</Badge>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {tab === 'contrats' && (
            <GroupedBySite
              sites={sitesDuCompte}
              itemsBySiteId={(siteId) => contratsDuCompte.filter((ct) => ct.site_id === siteId)}
              renderItem={(ct: (typeof contratsDuCompte)[number]) => {
                const Icon = ct.type_energie === 'gaz' ? Flame : Zap
                return (
                  <div
                    key={ct.id}
                    onClick={() => navigate(`/contrats/${ct.id}`)}
                    className="flex cursor-pointer items-center gap-3 px-3.5 py-2.5 hover:bg-navy-50/60"
                  >
                    <span className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-lg', ct.type_energie === 'gaz' ? 'bg-amber-100 text-amber-600' : 'bg-sky-100 text-sky-500')}>
                      <Icon className="h-3.5 w-3.5" />
                    </span>
                    <p className="min-w-0 flex-1 truncate text-sm font-semibold text-navy-800">{ct.fournisseur_nom}</p>
                    <Badge tone={STATUT_CONTRAT_TONE[ct.statut] ?? 'neutral'}>{statutsContrats.find((s) => s.code === ct.statut)?.libelle ?? ct.statut}</Badge>
                  </div>
                )
              }}
              emptyLabel="Aucun contrat pour ce compte."
            />
          )}

          {tab === 'compteurs' && (
            <GroupedBySite
              sites={sitesDuCompte}
              itemsBySiteId={(siteId) => compteursDuCompte.filter((c) => c.site_id === siteId)}
              renderItem={(c: (typeof compteursDuCompte)[number]) => {
                const Icon = c.type_energie === 'gaz' ? Flame : Zap
                return (
                  <div
                    key={c.id}
                    onClick={() => navigate(`/compteurs/${c.id}`)}
                    className="flex cursor-pointer items-center gap-3 px-3.5 py-2.5 hover:bg-navy-50/60"
                  >
                    <span className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-lg', c.type_energie === 'gaz' ? 'bg-amber-100 text-amber-600' : 'bg-sky-100 text-sky-500')}>
                      <Icon className="h-3.5 w-3.5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-navy-800">{c.utilisation || c.numero_pdl}</p>
                      <p className="truncate font-mono text-[10px] text-navy-400">{c.numero_pdl}</p>
                    </div>
                    <Badge tone={c.statut === 'actif' ? 'kiwi' : 'neutral'}>{c.statut}</Badge>
                  </div>
                )
              }}
              emptyLabel="Aucun compteur pour ce compte."
            />
          )}

          {tab === 'recommandations' && (
            <div className="flex flex-col gap-2.5">
              {recommandationsDuCompte.length === 0 && <p className="text-sm text-navy-400">Aucune recommandation pour ce compte.</p>}
              {recommandationsDuCompte.map((r) => {
                const derniereVersion = r.versions[r.versions.length - 1]
                return (
                  <div
                    key={r.id}
                    onClick={() => navigate(`/recommandations/${r.id}`)}
                    className="cursor-pointer rounded-xl border border-navy-100 bg-white p-3.5 hover:bg-navy-50/60"
                  >
                    <div className="flex items-center gap-2">
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-amber-100 text-amber-600">
                        <Sparkle className="h-3.5 w-3.5" />
                      </span>
                      <p className="flex-1 truncate text-sm font-bold text-navy-800">{r.titre}</p>
                      <Badge tone={ETAPE_TONE[r.etape] ?? 'amber'}>{etapes.find((e) => e.code === r.etape)?.libelle ?? r.etape}</Badge>
                    </div>
                    {derniereVersion && (
                      <p className="ml-9 mt-1.5 text-[11px] text-navy-400">
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
                <div className="rounded-xl border border-dashed border-kiwi-100 bg-white p-6 text-center text-sm font-semibold text-kiwi-600">
                  ✓ Aucun signal ouvert — compte sous contrôle
                </div>
              ) : (
                signauxDuCompte.map((s) => (
                  <div key={s.id} className="rounded-xl border border-navy-100 bg-white p-3.5">
                    <div className="flex items-start gap-3">
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-red-100 text-red-600">
                        <Radio className="h-3.5 w-3.5" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-bold text-navy-800">{s.type_signal}</p>
                        <p className="mt-0.5 text-xs text-navy-500">{s.description}</p>
                        <span className="mt-1 inline-block text-[10.5px]"><EntityLink to={`/sites/${s.site_id}`}>{s.site_nom}</EntityLink></span>
                      </div>
                    </div>
                    <div className="mt-2.5 flex gap-2 border-t border-navy-50 pt-2.5">
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
                <div className="rounded-xl border border-dashed border-amber-200 bg-amber-50/60 p-4">
                  <p className="text-sm font-bold text-amber-700">Aucun mandat pour ce compte</p>
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
                    className="flex cursor-pointer items-center gap-3 rounded-xl border border-navy-100 bg-white p-3.5 hover:bg-navy-50/60"
                  >
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-amber-100 text-amber-600">
                      <FileCheck2 className="h-4 w-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-bold text-navy-800">{m.nb_sites_couverts} site{m.nb_sites_couverts > 1 ? 's' : ''} couvert{m.nb_sites_couverts > 1 ? 's' : ''}</p>
                      <p className="truncate text-[10.5px] text-navy-400">{m.contact_signataire_nom ?? 'Signataire non renseigné'}</p>
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
                  className={cn('rounded-full px-2.5 py-1 text-[11px] font-semibold', ficCategorie === null ? 'bg-ink-800 text-white' : 'bg-navy-100 text-navy-600 hover:bg-navy-200')}
                >
                  Tous
                </button>
                {categoriesFichiers.map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setFicCategorie(cat)}
                    className={cn('rounded-full px-2.5 py-1 text-[11px] font-semibold', ficCategorie === cat ? 'bg-ink-800 text-white' : 'bg-navy-100 text-navy-600 hover:bg-navy-200')}
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
                className="flex flex-col items-center gap-1.5 rounded-xl border-2 border-dashed border-navy-200 bg-white py-6 text-navy-400 hover:border-kiwi-300 hover:text-kiwi-600"
              >
                <UploadCloud className="h-[18px] w-[18px]" />
                <span className="text-xs font-bold text-navy-700">Glissez-déposez vos fichiers ici</span>
                <span className="text-[10.5px]">PDF, images, emails — catégorisés ensuite en un clic</span>
              </button>
              {documentsFiltresParCategorie.length === 0 ? (
                <p className="text-sm text-navy-400">{ficCategorie ? 'Aucun fichier dans cette catégorie.' : 'Aucun fichier pour ce compte.'}</p>
              ) : (
                <div className="overflow-hidden rounded-xl border border-navy-100 bg-white">
                  {documentsFiltresParCategorie.map((d) => (
                    <div
                      key={d.id}
                      onClick={() => navigate(`/documents/${d.id}`)}
                      className="flex cursor-pointer items-center gap-3 border-b border-navy-50 px-4 py-3 last:border-b-0 hover:bg-navy-50/60"
                    >
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-navy-100 text-navy-500">
                        <FileText className="h-4 w-4" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-bold text-navy-800">{d.nom}</p>
                        <p className="truncate text-[10.5px] text-navy-400">{d.auteur} · {new Date(d.date_creation).toLocaleDateString('fr-FR')}</p>
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
              <p className="text-[11px] text-navy-400">{historique?.length ?? 0} changement{(historique?.length ?? 0) > 1 ? 's' : ''} tracé{(historique?.length ?? 0) > 1 ? 's' : ''} · tous horodatés</p>
              <div className="overflow-hidden rounded-xl border border-navy-100 bg-white">
                {!historique || historique.length === 0 ? (
                  <p className="p-4 text-sm text-navy-400">Aucune modification enregistrée.</p>
                ) : (
                  historique.map((h) => (
                    <div key={h.id} className="grid grid-cols-[110px_1fr] gap-3 border-b border-navy-50 px-4 py-3 last:border-b-0 sm:grid-cols-[110px_140px_140px_1fr]">
                      <span className="font-mono text-[10.5px] text-navy-500">{new Date(h.date_modification).toLocaleString('fr-FR')}</span>
                      <span className="hidden text-[11.5px] font-semibold text-navy-700 sm:block">{h.modifie_par_nom ?? 'Quelqu\'un'}</span>
                      <span className="hidden text-[11.5px] font-medium text-navy-600 sm:block">{h.champ}</span>
                      <span className="flex flex-wrap items-center gap-2 text-[11.5px]">
                        {h.ancienne_valeur && (
                          <>
                            <span className="text-navy-400 line-through">{h.ancienne_valeur}</span>
                            <span className="text-navy-300">→</span>
                          </>
                        )}
                        <span className="font-semibold text-kiwi-600">{h.nouvelle_valeur ?? '—'}</span>
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
        <div className="hidden flex-col border-l border-navy-100 bg-white lg:flex">
          <div className="flex items-center gap-2 px-3.5 py-3">
            <span className="text-[10px] font-bold uppercase tracking-wide text-navy-400">Activité · portefeuille</span>
          </div>
          <div className="flex-1 overflow-hidden px-3.5 pb-3.5">
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
        <EditCompteClientDialog compte={compte} open={showEditSubtype} onClose={() => setShowEditSubtype(false)} />
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

function InfoField({ label, value, onCopy }: { label: string; value: string; onCopy: (msg: string) => void }) {
  return (
    <div>
      <div className="mb-0.5 text-[10px] uppercase tracking-wide text-navy-400">{label}</div>
      <div className="flex items-center gap-1.5">
        <span className="truncate text-xs font-semibold text-navy-800">{value}</span>
        <button type="button" onClick={() => copyToClipboard(value, onCopy)} title="Copier" className="shrink-0 rounded p-0.5 text-navy-300 hover:bg-navy-100 hover:text-navy-700">
          <Copy className="h-3 w-3" />
        </button>
      </div>
    </div>
  )
}

function GroupedBySite<T>({
  sites,
  itemsBySiteId,
  renderItem,
  emptyLabel,
}: {
  sites: Site[]
  itemsBySiteId: (siteId: string) => T[]
  renderItem: (item: T) => React.ReactNode
  emptyLabel: string
}) {
  const navigate = useNavigate()
  const groups = sites.map((s) => ({ site: s, items: itemsBySiteId(s.id) })).filter((g) => g.items.length > 0)

  if (groups.length === 0) return <p className="text-sm text-navy-400">{emptyLabel}</p>

  return (
    <div className="flex flex-col gap-3.5">
      {groups.map(({ site, items }) => (
        <div key={site.id} className="overflow-hidden rounded-xl border border-navy-100 bg-white">
          <div
            onClick={() => navigate(`/sites/${site.id}`)}
            className="flex cursor-pointer items-center gap-2.5 border-b border-navy-50 bg-navy-50/60 px-4 py-2.5 hover:bg-navy-50"
          >
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-kiwi-100 text-kiwi-600">
              <MapPin className="h-3.5 w-3.5" />
            </span>
            <p className="min-w-0 flex-1 truncate text-[13px] font-bold text-navy-800">{site.nom}</p>
            <span className="text-[10.5px] text-navy-400">{items.length} élément{items.length > 1 ? 's' : ''}</span>
          </div>
          <div className="divide-y divide-navy-50">{items.map((item) => renderItem(item))}</div>
        </div>
      ))}
    </div>
  )
}

function ContactsPanel({ contacts }: { contacts: Contact[] }) {
  const navigate = useNavigate()
  const [expanded, setExpanded] = useState(false)
  const visibles = expanded ? contacts : contacts.slice(0, 3)
  return (
    <div className="rounded-xl border border-navy-100 bg-white p-3.5">
      <div className="mb-2.5 flex items-center gap-1.5">
        <span className="flex h-5 w-5 items-center justify-center rounded-md bg-violet-100 text-violet-500">
          <Users className="h-2.5 w-2.5" />
        </span>
        <span className="text-[10px] font-bold uppercase tracking-wide text-navy-400">Contacts</span>
      </div>
      {contacts.length === 0 && <p className="text-xs text-navy-400">Aucun contact enregistré pour ce compte.</p>}
      <div className="flex flex-col gap-3">
        {visibles.map((c) => {
          const initiales = `${c.prenom[0] ?? ''}${c.nom[0] ?? ''}`.toUpperCase()
          return (
            <div key={c.id}>
              <div className="flex items-center gap-2.5">
                <div className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-full border-[1.5px] border-violet-200 bg-violet-50 text-[10px] font-bold text-violet-600">
                  {initiales}
                </div>
                <div className="min-w-0 flex-1">
                  <button type="button" onClick={() => navigate(`/contacts/${c.id}`)} className="truncate text-left text-[12.5px] font-bold text-navy-800 hover:text-violet-600">
                    {c.prenom} {c.nom}
                  </button>
                  <p className="truncate text-[10.5px] text-navy-400">{c.fonction || '—'}</p>
                </div>
                {c.telephone && (
                  <a href={`tel:${c.telephone}`} title="Appeler" className="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-md border border-kiwi-100 bg-kiwi-50 text-kiwi-600">
                    <Phone className="h-3 w-3" />
                  </a>
                )}
              </div>
              <div className="ml-[39px] mt-1.5 flex flex-col gap-1 text-[11px]">
                {c.email && <EmailLink value={c.email} className="text-navy-600" />}
                {c.telephone && <PhoneLink value={c.telephone} className="text-[10.5px] text-navy-600" />}
              </div>
            </div>
          )
        })}
      </div>
      {contacts.length > 3 && (
        <button type="button" onClick={() => setExpanded((v) => !v)} className="mt-2.5 block text-[10.5px] font-semibold text-violet-600 hover:underline">
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
    <div className="rounded-xl border border-navy-100 bg-white p-3.5">
      <div className="mb-2 flex items-center gap-1.5">
        <span className="text-[10px] font-bold uppercase tracking-wide text-navy-400">Commentaire</span>
        <div className="flex-1" />
        {!editing && (
          <button type="button" onClick={() => { setDraft(initialValue); setEditing(true) }} title="Modifier" className="rounded p-0.5 text-navy-300 hover:bg-navy-100 hover:text-navy-700">
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
          className="text-[11.5px]"
        />
      ) : (
        <p
          onClick={() => { setDraft(initialValue); setEditing(true) }}
          className="cursor-pointer whitespace-pre-wrap rounded-lg p-1 text-[11.5px] leading-relaxed text-navy-700 hover:bg-navy-50"
        >
          {initialValue || <span className="text-navy-300">Cliquer pour ajouter un commentaire…</span>}
        </p>
      )}
    </div>
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

function EditCompteClientDialog({ compte, open, onClose }: { compte: Compte; open: boolean; onClose: () => void }) {
  const { data: segmentsRef } = useReferenceTable('segments_comptes')
  const update = useUpdateCompteClient()
  const [segmentId, setSegmentId] = useState(compte.segment_compte_id ?? '')
  const [origine, setOrigine] = useState(compte.origine_acquisition ?? '')
  const [mandatCadre, setMandatCadre] = useState(compte.mandat_cadre_actif ?? false)
  const [note, setNote] = useState(compte.note_interne ?? '')
  const [feedback, setFeedback] = useState<string | null>(null)

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
