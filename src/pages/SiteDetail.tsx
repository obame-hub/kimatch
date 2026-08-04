import { useEffect, useMemo, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Phone, StickyNote, Plus, Building2, Users, Copy, Zap, Flame, CalendarClock, Sparkle, Pencil, Trash2, FileCheck2, FileText } from 'lucide-react'
import { Topbar } from '@/components/layout/Topbar'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { EntityLink } from '@/components/ui/entity-link'
import { PhoneLink, EmailLink } from '@/components/ui/contact-link'
import { Dialog } from '@/components/ui/dialog'
import { FormField, Input, Select } from '@/components/ui/form'
import { HistoriqueDiscret } from '@/components/ui/historique-discret'
import { AddressAutocomplete } from '@/components/ui/address-autocomplete'
import { PdlDraftRows, emptyPdlDraft, type PdlDraft } from '@/components/compteur/PdlDraftRows'
import { useSites, useUpdateSite, useDeleteSite } from '@/lib/data/sites'
import { useReferenceTable } from '@/lib/data/referenceTables'
import {
  FALLBACK_TYPES_SITES,
  FALLBACK_STATUTS_CONTRATS,
  STATUT_CONTRAT_TONE,
  FALLBACK_STATUTS_MANDATS,
  STATUT_MANDAT_TONE,
  FALLBACK_STATUTS_VERSIONS,
  FALLBACK_ETAPES_RECOMMANDATION,
  ETAPE_TONE,
  FALLBACK_TYPES_DOCUMENTS,
  FALLBACK_TYPES_ENERGIES,
} from '@/lib/referenceFallbacks'
import { useCanManage, useIsAdmin, useProfilsAdmin } from '@/lib/data/roles'
import { useSignaux } from '@/lib/data/signaux'
import { useCompteurs, useCreateCompteur } from '@/lib/data/compteurs'
import { useRecommandations } from '@/lib/data/recommandations'
import { useContrats } from '@/lib/data/contrats'
import { useInteractionsForSite } from '@/lib/data/interactions'
import { useContacts } from '@/lib/data/contacts'
import { useMandats } from '@/lib/data/mandats'
import { useActions, useCreateAction } from '@/lib/data/actions'
import { useDocuments, useCreateDocument } from '@/lib/data/documents'
import { useHistorique } from '@/lib/data/historique'
import { useComptes } from '@/lib/data/comptes'
import { EnergyTimeline } from '@/components/site/EnergyTimeline'
import { CoverageMatrix } from '@/components/site/CoverageMatrix'
import { ActivityFeed } from '@/components/site/ActivityFeed'
import { computeSiteHealth } from '@/lib/siteHealth'
import { cn } from '@/lib/utils'
import { useGoBack } from '@/lib/useGoBack'
import type { Compte, Contact, Site } from '@/types/domain'

type TabKey = 'synthese' | 'contrats' | 'compteurs' | 'recommandations' | 'signaux' | 'mandats' | 'fichiers' | 'historique' | 'activite'

function copyToClipboard(text: string, onDone: (msg: string) => void) {
  if (!text) return
  navigator.clipboard?.writeText(text).catch(() => {})
  onDone(`⧉ Copié — ${text}`)
}

export default function SiteDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { data: sites } = useSites()
  const { data: signaux } = useSignaux()
  const { data: compteurs } = useCompteurs()
  const { data: recommandations } = useRecommandations()
  const { data: contrats } = useContrats()
  const { data: contacts } = useContacts()
  const { data: mandats } = useMandats()
  const { data: actions } = useActions()
  const { data: documents } = useDocuments()
  const { data: comptes } = useComptes()
  const createAction = useCreateAction()
  const deleteSite = useDeleteSite()
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
  const [sheetOpen, setSheetOpen] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [addFichierOpen, setAddFichierOpen] = useState(false)
  const [addCompteurOpen, setAddCompteurOpen] = useState(false)

  function showToast(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(null), 2200)
  }

  const site = sites?.find((s) => s.id === id)
  const canManage = useCanManage(site?.proprietaire_id)
  const goBack = useGoBack('/sites')

  async function handleDelete() {
    if (!site) return
    await deleteSite.mutateAsync(site.id)
    navigate('/sites')
  }

  const compte = comptes?.find((c) => c.id === site?.compte_id)
  const signauxDuSite = useMemo(() => signaux?.filter((s) => s.site_id === id) ?? [], [signaux, id])
  const compteursDuSite = useMemo(() => compteurs?.filter((c) => c.site_id === id) ?? [], [compteurs, id])
  const recommandationsDuSite = useMemo(() => recommandations?.filter((r) => r.sites.some((s) => s.id === id)) ?? [], [recommandations, id])
  const contratsDuSite = useMemo(() => contrats?.filter((c) => c.site_id === id) ?? [], [contrats, id])
  // Fiche site : on ne charge que les interactions de ce site (pas la table entiere).
  const { data: interactionsDuSite = [] } = useInteractionsForSite(id)
  const contactsDuSite = useMemo(() => contacts?.filter((c) => c.sites.some((s) => s.id === id)) ?? [], [contacts, id])
  const actionsDuSite = useMemo(() => actions?.filter((a) => a.site_id === id) ?? [], [actions, id])
  const documentsDuSite = useMemo(() => documents?.filter((d) => d.entite_type === 'site' && d.entite_id === id) ?? [], [documents, id])
  const mandatDuSite = mandats?.find((m) => m.compte_id === site?.compte_id && m.site_ids.includes(id ?? ''))
  const autresMandatsDuCompte = (mandats ?? []).filter((m) => m.compte_id === site?.compte_id && m.id !== mandatDuSite?.id)

  const health = computeSiteHealth({
    signaux: signauxDuSite,
    contrats: contratsDuSite,
    recommandations: recommandationsDuSite,
    mandat: mandatDuSite,
    compteurs: compteursDuSite,
  })

  const { data: historique } = useHistorique('sites', site?.id)

  const contactPrincipal = contactsDuSite.find((c) => c.contact_principal) ?? contactsDuSite[0]
  const adresse = [site?.adresse, site?.code_postal, site?.ville].filter(Boolean).join(' ')
  const mapQuery = site?.latitude != null && site?.longitude != null
    ? `${site.latitude},${site.longitude}`
    : encodeURIComponent(adresse || site?.nom || '')

  const donutColor = health.tone === 'kiwi' ? '#0d7a5f' : health.tone === 'amber' ? '#b0763c' : '#c2452d'

  const TABS: { key: TabKey; label: string; labelMobile?: string; badge?: string; mobileOnly?: boolean }[] = [
    { key: 'synthese', label: 'Site' },
    { key: 'contrats', label: 'Contrats' },
    { key: 'compteurs', label: 'Compteurs', badge: compteursDuSite.length ? String(compteursDuSite.length) : undefined },
    { key: 'recommandations', label: 'Recommandations', labelMobile: 'Recos', badge: recommandationsDuSite.length ? String(recommandationsDuSite.length) : undefined },
    { key: 'signaux', label: 'Signaux', badge: signauxDuSite.length ? String(signauxDuSite.length) : undefined },
    { key: 'mandats', label: 'Mandats', badge: mandatDuSite ? undefined : '!' },
    { key: 'fichiers', label: 'Fichiers', badge: documentsDuSite.length ? String(documentsDuSite.length) : undefined },
    { key: 'historique', label: 'Historique' },
    { key: 'activite', label: 'Activité', mobileOnly: true },
  ]

  function planifierRelance() {
    if (!site) return
    const echeance = new Date()
    echeance.setDate(echeance.getDate() + 7)
    createAction.mutate({
      titre: `Relance — ${site.nom}`,
      type_action_id: null,
      type_action_libelle: 'Relance',
      site_id: site.id,
      site_nom: site.nom,
      contact_id: contactPrincipal?.id ?? null,
      contact_nom: contactPrincipal ? `${contactPrincipal.prenom} ${contactPrincipal.nom}` : '',
      priorite: 2,
      echeance: echeance.toISOString(),
      commentaire: null,
      statut_id: null,
    })
    setSheetOpen(false)
    showToast('✓ Relance planifiée dans 7 jours')
  }

  // Raccourcis clavier — 1-6 pour changer d'onglet, N pour la note, R pour la relance (comme le prototype de William)
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return
      const map: Record<string, TabKey> = { '1': 'synthese', '2': 'contrats', '3': 'compteurs', '4': 'recommandations', '5': 'signaux', '6': 'mandats', '7': 'fichiers', '8': 'historique' }
      if (map[e.key]) setTab(map[e.key])
      if (e.key === 'n' || e.key === 'N') setTab('activite')
      if (e.key === 'r' || e.key === 'R') planifierRelance()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [site?.id])

  if (!sites) {
    return (
      <div>
        <Topbar crumb="Sites" title="Site" />
        <div className="p-4 sm:p-6"><p className="text-sm text-navy-400">Chargement…</p></div>
      </div>
    )
  }

  if (!site) {
    return (
      <div>
        <Topbar crumb="Sites" title="Site" />
        <div className="p-4 sm:p-6">
          <Button variant="ghost" size="sm" className="mb-4" onClick={goBack}>
            <ArrowLeft className="h-4 w-4" />
            Retour aux sites
          </Button>
          <p className="text-sm text-navy-500">Site introuvable.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-[calc(100vh-52px-56px)] flex-col overflow-hidden md:h-[calc(100vh-52px)]">
      <Topbar crumb="Sites" title={site.nom} />

      {/* Bandeau site */}
      <div className="flex flex-wrap items-center gap-3.5 border-b border-navy-100 bg-white px-4 py-3.5 sm:px-6">
        <Button variant="ghost" size="icon" onClick={goBack} title="Retour aux sites">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] bg-gradient-to-br from-kiwi-500 to-kiwi-400 text-white">
          <MapPinIcon />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-xl font-bold tracking-tight text-navy-800">{site.nom}</p>
          <p className="truncate text-xs text-navy-500">{compte?.nom ?? site.compte_nom} · {compteursDuSite.length} compteur{compteursDuSite.length > 1 ? 's' : ''}</p>
          <p className="truncate text-[10.5px] text-navy-400">
            {site.date_creation && <>Créé le {new Date(site.date_creation).toLocaleDateString('fr-FR')} · </>}
            Propriétaire : {site.proprietaire_nom || 'Aucun'}
          </p>
        </div>
        <Badge tone={site.statut === 'actif' ? 'kiwi' : 'neutral'}>{site.statut}</Badge>
        {/* Actions rapides — desktop uniquement, remplacées par le FAB sur mobile comme chez William */}
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
          <Button variant="outline" size="sm" onClick={planifierRelance}>
            <CalendarClock className="h-3.5 w-3.5" />
            Relance
            <span className="font-mono text-[9px] text-navy-300">R</span>
          </Button>
          <Button size="sm" onClick={() => navigate('/recommandations')}>
            <Plus className="h-3.5 w-3.5" />
            Recommandation
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

      {/* Onglets — pilules sur mobile, soulignés sur desktop, comme chez William */}
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
        {/* Colonne gauche — Compte + Contacts (desktop uniquement) */}
        <div className="hidden flex-col gap-3.5 overflow-y-auto border-r border-navy-100 bg-navy-50/60 p-3.5 lg:flex">
          <ComptePanel compte={compte} compteNom={site.compte_nom} compteId={site.compte_id} onCopy={showToast} />
          <ContactsPanel contacts={contactsDuSite} />
        </div>

        {/* Centre — contenu de l'onglet */}
        <div className="overflow-y-auto bg-navy-50 p-4 sm:p-5">
          {tab === 'synthese' && (
            <div className="flex flex-col gap-3.5">
              <HealthCard health={health} donutColor={donutColor} />
              <div className="grid grid-cols-1 gap-3.5 lg:grid-cols-[1fr_1.2fr]">
                <div className="flex flex-col overflow-hidden rounded-xl border border-navy-100 bg-white">
                  <iframe
                    title="Carte du site"
                    src={`https://maps.google.com/maps?q=${mapQuery}&z=${site.latitude != null ? 16 : 13}&output=embed`}
                    className="block h-[200px] w-full flex-1 border-0"
                  />
                  <div className="flex items-center gap-2 px-3.5 py-2.5">
                    <span className="text-xs font-semibold text-navy-800">{adresse || 'Adresse non renseignée'}</span>
                    <div className="flex-1" />
                    {adresse && (
                      <a href={`https://www.google.com/maps/search/?api=1&query=${mapQuery}`} target="_blank" rel="noreferrer" className="whitespace-nowrap text-[10.5px] font-semibold">
                        Itinéraire ↗
                      </a>
                    )}
                  </div>
                </div>
                <div className="rounded-xl border border-navy-100 bg-white p-4">
                  <div className="mb-3 flex items-center">
                    <span className="text-[10px] font-bold uppercase tracking-wide text-navy-400">Informations</span>
                    <div className="flex-1" />
                    <span className="text-[10px] text-navy-300">cliquer ⧉ pour copier</span>
                  </div>
                  <div className="grid grid-cols-2 gap-3.5">
                    <InfoField label="Libellé du site" value={site.nom} onCopy={showToast} />
                    <InfoField label="Type" value={site.type_site || '—'} onCopy={showToast} />
                    <div className="col-span-2">
                      <InfoField label="Adresse" value={site.adresse || '—'} onCopy={showToast} />
                    </div>
                    <InfoField label="Ville" value={site.ville || '—'} onCopy={showToast} />
                    <InfoField label="Code postal" value={site.code_postal || '—'} onCopy={showToast} />
                    {site.annee_construction && <InfoField label="Année de construction" value={String(site.annee_construction)} onCopy={showToast} />}
                    {site.surface_m2 && <InfoField label="Surface" value={`${site.surface_m2.toLocaleString('fr-FR')} m²`} onCopy={showToast} />}
                    {site.date_derniere_ag && (
                      <InfoField label="Dernière AG" value={new Date(site.date_derniere_ag).toLocaleDateString('fr-FR')} onCopy={showToast} />
                    )}
                  </div>
                  {site.latitude == null && (
                    <p className="mt-3 text-[10.5px] italic text-navy-300">Coordonnées précises non renseignées — la carte se positionne sur l'adresse/ville.</p>
                  )}
                  <HistoriqueDiscret tableNom="sites" ligneId={site.id} />
                </div>
              </div>

              {/* Compte + Contacts inline sur mobile uniquement */}
              <div className="flex flex-col gap-3.5 lg:hidden">
                <ComptePanel compte={compte} compteNom={site.compte_nom} compteId={site.compte_id} onCopy={showToast} />
                <ContactsPanel contacts={contactsDuSite} />
              </div>
            </div>
          )}

          {tab === 'contrats' && (
            <div className="flex flex-col gap-3.5">
              {compteursDuSite.length === 0 ? (
                <p className="text-sm text-navy-400">Aucun compteur pour ce site.</p>
              ) : (
                <EnergyTimeline compteurs={compteursDuSite} contrats={contratsDuSite} />
              )}
              <div>
                <p className="mb-2 text-[10px] font-bold uppercase tracking-wide text-navy-400">Historique des contrats par compteur</p>
                <div className="flex flex-col gap-2.5">
                  {compteursDuSite.map((c) => {
                    const historiqueContrats = contratsDuSite
                      .filter((ct) => ct.compteurs.some((cc) => cc.id === c.id))
                      .sort((a, b) => new Date(b.date_debut ?? 0).getTime() - new Date(a.date_debut ?? 0).getTime())
                    const Icon = c.type_energie === 'gaz' ? Flame : Zap
                    return (
                      <div key={c.id} className="overflow-hidden rounded-lg border border-navy-100 bg-white">
                        <div className="flex items-center gap-2 border-b border-navy-50 bg-navy-50/60 px-3.5 py-2.5">
                          <span className={cn('flex h-6 w-6 items-center justify-center rounded-md', c.type_energie === 'gaz' ? 'bg-amber-100 text-amber-600' : 'bg-sky-100 text-sky-500')}>
                            <Icon className="h-3 w-3" />
                          </span>
                          <span className="text-xs font-bold text-navy-800">{c.utilisation || c.numero_pdl}</span>
                          <span className="font-mono text-[10px] text-navy-300">{c.numero_pdl}</span>
                        </div>
                        {historiqueContrats.length === 0 ? (
                          <p className="px-3.5 py-2.5 text-xs text-navy-400">Aucun contrat.</p>
                        ) : (
                          historiqueContrats.map((ct) => (
                            <div
                              key={ct.id}
                              onClick={() => navigate(`/contrats/${ct.id}`)}
                              className="flex cursor-pointer items-center gap-3 border-t border-navy-50 px-3.5 py-2.5 hover:bg-navy-50/60"
                            >
                              <Badge tone={STATUT_CONTRAT_TONE[ct.statut] ?? 'neutral'}>{statutsContrats.find((s) => s.code === ct.statut)?.libelle ?? ct.statut}</Badge>
                              <span className="flex-1 text-xs font-medium text-navy-700">{ct.fournisseur_nom}</span>
                              <span className="font-mono text-[10px] text-navy-400">
                                {ct.date_debut ? new Date(ct.date_debut).toLocaleDateString('fr-FR') : '—'} → {ct.date_fin ? new Date(ct.date_fin).toLocaleDateString('fr-FR') : 'sans échéance'}
                              </span>
                            </div>
                          ))
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          )}

          {tab === 'compteurs' && (
            <div className="flex flex-col gap-2.5">
              <div className="flex items-center justify-end">
                <Button size="sm" onClick={() => setAddCompteurOpen(true)}>
                  <Plus className="h-3.5 w-3.5" />
                  Ajouter un compteur
                </Button>
              </div>
              {compteursDuSite.length === 0 && <p className="text-sm text-navy-400">Aucun compteur pour ce site.</p>}
              {compteursDuSite.map((c) => {
                const contratActif = contratsDuSite.find((ct) => ct.compteurs.some((cc) => cc.id === c.id) && ct.statut === 'ACTIF')
                const Icon = c.type_energie === 'gaz' ? Flame : Zap
                return (
                  <div
                    key={c.id}
                    onClick={() => navigate(`/compteurs/${c.id}`)}
                    className="flex cursor-pointer items-center gap-3 rounded-xl border border-navy-100 bg-white p-3.5 hover:bg-navy-50/60"
                  >
                    <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px]', c.type_energie === 'gaz' ? 'bg-amber-100 text-amber-600' : 'bg-sky-100 text-sky-500')}>
                      <Icon className="h-4 w-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-bold text-navy-800">{c.utilisation || c.numero_pdl}</p>
                      <p className="truncate font-mono text-[10px] text-navy-400">
                        {c.numero_pdl} {contratActif ? `· ${contratActif.fournisseur_nom}` : ''} {c.consommation_annuelle_mwh ? `· ${c.consommation_annuelle_mwh} MWh` : ''}
                      </p>
                    </div>
                    <Badge tone={c.statut === 'actif' ? 'kiwi' : 'neutral'}>{c.statut}</Badge>
                  </div>
                )
              })}
            </div>
          )}

          {tab === 'recommandations' && (
            <div className="flex flex-col gap-2.5">
              {recommandationsDuSite.length === 0 && <p className="text-sm text-navy-400">Aucune recommandation pour ce site.</p>}
              {recommandationsDuSite.map((r) => {
                const derniereVersion = r.versions[r.versions.length - 1]
                return (
                  <div
                    key={r.id}
                    onClick={() => navigate(`/recommandations/${r.id}`)}
                    className="cursor-pointer rounded-xl border border-navy-100 bg-white p-3.5 hover:bg-navy-50/60"
                  >
                    <div className="flex items-center gap-2">
                      <p className="flex-1 text-sm font-bold text-navy-800">{r.titre}</p>
                      <Badge tone={ETAPE_TONE[r.etape] ?? 'amber'}>{etapes.find((e) => e.code === r.etape)?.libelle ?? r.etape}</Badge>
                    </div>
                    {derniereVersion && (
                      <p className="mt-2 text-[11px] text-navy-400">
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
              {signauxDuSite.length === 0 && (
                <div className="rounded-xl border border-dashed border-kiwi-100 bg-white p-6 text-center text-sm font-semibold text-kiwi-600">
                  ✓ Aucun signal ouvert — site sous contrôle
                </div>
              )}
              {signauxDuSite.map((s) => (
                <div key={s.id} className="rounded-xl border border-navy-100 bg-white p-3.5">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold text-navy-800">{s.type_signal}</p>
                    <p className="mt-0.5 text-xs text-navy-500">{s.description}</p>
                  </div>
                  <div className="mt-2.5 flex gap-2 border-t border-navy-50 pt-2.5">
                    <Button variant="ghost" size="sm" className="ml-auto" onClick={() => navigate('/signaux')}>
                      Voir dans Signaux
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {tab === 'mandats' && (
            <div className="flex flex-col gap-3.5">
              {mandatDuSite ? (
                <div className="overflow-hidden rounded-xl border border-navy-100 bg-white">
                  <div className="flex items-center gap-3 border-b border-navy-50 px-4 py-3.5">
                    <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-200 text-amber-700"><FileCheck2 className="h-3.5 w-3.5" /></span>
                    <div className="flex-1">
                      <p className="text-sm font-bold text-navy-800">Mandat {mandatDuSite.compte_nom}</p>
                      <p className="text-[11px] text-navy-500">
                        {mandatDuSite.contact_signataire_nom ? `Signataire ${mandatDuSite.contact_signataire_nom}` : 'Signataire non renseigné'}
                        {mandatDuSite.date_signature ? ` · signé le ${new Date(mandatDuSite.date_signature).toLocaleDateString('fr-FR')}` : ''}
                        {mandatDuSite.docusign_envelope_id ? ' · DocuSign ✓' : ''}
                      </p>
                    </div>
                    <Badge tone={STATUT_MANDAT_TONE[mandatDuSite.statut] ?? 'neutral'}>{statutsMandats.find((s) => s.code === mandatDuSite.statut)?.libelle ?? mandatDuSite.statut}</Badge>
                  </div>
                  <div className="px-4 py-3.5">
                    <div className="mb-2.5 flex items-center gap-2">
                      <span className="text-[10px] font-bold uppercase tracking-wide text-navy-400">Périmètre du mandat</span>
                      <div className="flex-1" />
                      <span className="text-[11px] font-bold text-kiwi-600">{mandatDuSite.nb_sites_couverts} site{mandatDuSite.nb_sites_couverts > 1 ? 's' : ''} couvert{mandatDuSite.nb_sites_couverts > 1 ? 's' : ''}</span>
                    </div>
                    {compteursDuSite.length > 0 && (
                      <CoverageMatrix compteurs={compteursDuSite} contrats={contratsDuSite} recommandations={recommandationsDuSite} mandat={mandatDuSite} />
                    )}
                  </div>
                </div>
              ) : (
                <div className="rounded-xl border border-dashed border-amber-200 bg-amber-50/60 p-4">
                  <p className="text-sm font-bold text-amber-700">Aucun mandat actif ne couvre ce site</p>
                  <p className="mt-1 text-xs text-amber-600">Impossible de lancer une consultation tant qu'un mandat signé ne couvre pas ce site.</p>
                  <Button size="sm" className="mt-2.5" onClick={() => navigate('/mandats')}>
                    <Plus className="h-3.5 w-3.5" />
                    Préparer un mandat
                  </Button>
                </div>
              )}

              {autresMandatsDuCompte.length > 0 && (
                <div>
                  <p className="mb-2 text-[10px] font-bold uppercase tracking-wide text-navy-400">Autres mandats du compte</p>
                  <div className="flex flex-col gap-2">
                    {autresMandatsDuCompte.map((m) => (
                      <div key={m.id} onClick={() => navigate('/mandats')} className="flex cursor-pointer items-center gap-3 rounded-lg border border-navy-100 bg-white p-3 hover:bg-navy-50/60">
                        <Badge tone={STATUT_MANDAT_TONE[m.statut] ?? 'neutral'}>{statutsMandats.find((s) => s.code === m.statut)?.libelle ?? m.statut}</Badge>
                        <span className="flex-1 text-xs font-medium text-navy-700">{m.nb_sites_couverts} site{m.nb_sites_couverts > 1 ? 's' : ''}</span>
                        <span className="text-[10.5px] text-navy-400">{m.contact_signataire_nom ?? '—'}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {tab === 'fichiers' && (
            <div className="flex flex-col gap-3.5">
              <div className="flex items-center justify-end">
                <Button size="sm" onClick={() => setAddFichierOpen(true)}>
                  <Plus className="h-3.5 w-3.5" />
                  Ajouter un fichier
                </Button>
              </div>
              {documentsDuSite.length === 0 ? (
                <p className="text-sm text-navy-400">Aucun fichier pour ce site.</p>
              ) : (
                <div className="overflow-hidden rounded-xl border border-navy-100 bg-white">
                  {documentsDuSite.map((d) => (
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
              siteId={site.id}
              siteNom={site.nom}
              compteId={site.compte_id}
              compteNom={site.compte_nom}
              signaux={signauxDuSite}
              interactions={interactionsDuSite}
              actions={actionsDuSite}
              documents={documentsDuSite}
            />
          )}
        </div>

        {/* Colonne droite — Activité persistante (desktop uniquement) */}
        <div className="hidden flex-col border-l border-navy-100 bg-white lg:flex">
          <div className="flex items-center gap-2 px-3.5 py-3">
            <span className="text-[10px] font-bold uppercase tracking-wide text-navy-400">Activité</span>
          </div>
          <div className="flex-1 overflow-hidden px-3.5 pb-3.5">
            <ActivityFeed
              siteId={site.id}
              siteNom={site.nom}
              compteId={site.compte_id}
              compteNom={site.compte_nom}
              signaux={signauxDuSite}
              interactions={interactionsDuSite}
              actions={actionsDuSite}
              documents={documentsDuSite}
            />
          </div>
        </div>
      </div>

      {/* FAB — mobile uniquement, remplace le bandeau d'actions comme chez William */}
      <button
        type="button"
        onClick={() => setSheetOpen(true)}
        className="fixed bottom-[70px] right-4 z-30 flex h-[52px] w-[52px] items-center justify-center rounded-full bg-kiwi-600 text-white shadow-lg shadow-kiwi-600/40 lg:hidden"
        aria-label="Actions rapides"
      >
        <Plus className="h-6 w-6" />
      </button>

      {sheetOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-black/35" onClick={() => setSheetOpen(false)} />
          <div className="absolute inset-x-2 bottom-[62px] rounded-[18px] bg-white p-2 shadow-2xl">
            <div className="mx-auto mb-1.5 mt-0.5 h-1 w-9 rounded-full bg-navy-200" />
            <button
              type="button"
              onClick={() => { setTab('activite'); setSheetOpen(false) }}
              className="flex w-full items-center gap-3 rounded-xl px-3.5 py-3 text-left hover:bg-navy-50"
            >
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-100 text-amber-700"><StickyNote className="h-3.5 w-3.5" /></span>
              <span className="text-sm font-semibold text-navy-800">Ajouter une note</span>
            </button>
            <button type="button" onClick={planifierRelance} className="flex w-full items-center gap-3 rounded-xl px-3.5 py-3 text-left hover:bg-navy-50">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-100 text-amber-700"><CalendarClock className="h-3.5 w-3.5" /></span>
              <span className="text-sm font-semibold text-navy-800">Planifier une relance dans 7 jours</span>
            </button>
            <button
              type="button"
              onClick={() => { setSheetOpen(false); navigate('/recommandations') }}
              className="flex w-full items-center gap-3 rounded-xl px-3.5 py-3 text-left hover:bg-navy-50"
            >
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-100 text-amber-700"><Sparkle className="h-3.5 w-3.5" /></span>
              <span className="text-sm font-semibold text-navy-800">Nouvelle recommandation</span>
            </button>
            {contactPrincipal?.telephone && (
              <button
                type="button"
                onClick={() => { setSheetOpen(false); window.location.href = `tel:${contactPrincipal.telephone}` }}
                className="flex w-full items-center gap-3 rounded-xl px-3.5 py-3 text-left hover:bg-navy-50"
              >
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-kiwi-100 text-kiwi-600"><Phone className="h-3.5 w-3.5" /></span>
                <span className="text-sm font-semibold text-navy-800">Appeler {contactPrincipal.prenom} {contactPrincipal.nom}</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => setSheetOpen(false)}
              className="mt-1 w-full rounded-xl border-t border-navy-50 py-3 text-center text-sm font-semibold text-navy-400"
            >
              Annuler
            </button>
          </div>
        </div>
      )}

      {toast && (
        <div className="fixed bottom-[70px] left-1/2 z-50 -translate-x-1/2 whitespace-nowrap rounded-lg bg-ink-800 px-4 py-2.5 text-xs font-semibold text-white shadow-lg lg:bottom-6">
          {toast}
        </div>
      )}

      <EditSiteDialog open={editOpen} onClose={() => setEditOpen(false)} site={site} onSaved={() => showToast('✓ Site mis à jour')} />

      <AddFichierDialog
        open={addFichierOpen}
        onClose={() => setAddFichierOpen(false)}
        siteId={site.id}
        onSaved={() => showToast('✓ Fichier ajouté')}
      />

      <AddCompteurDialog
        open={addCompteurOpen}
        onClose={() => setAddCompteurOpen(false)}
        siteId={site.id}
        siteNom={site.nom}
        compteId={site.compte_id}
        onSaved={(message) => showToast(message)}
      />

      <Dialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title="Supprimer ce site ?"
        description="Cette action est irréversible. Les compteurs, contrats et recommandations rattachés ne seront pas supprimés mais perdront leur lien à ce site."
      >
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="ghost" onClick={() => setConfirmDelete(false)}>Annuler</Button>
          <Button type="button" variant="outline" className="border-red-200 text-red-600 hover:bg-red-50" disabled={deleteSite.isPending} onClick={handleDelete}>
            Supprimer définitivement
          </Button>
        </div>
      </Dialog>
    </div>
  )
}

function EditSiteDialog({ open, onClose, site, onSaved }: { open: boolean; onClose: () => void; site: Site; onSaved: () => void }) {
  const { data: typesRef } = useReferenceTable('types_sites')
  const types = typesRef && typesRef.length > 0 ? typesRef : FALLBACK_TYPES_SITES
  const updateSite = useUpdateSite()
  const isAdmin = useIsAdmin()
  const { data: profilsAdmin } = useProfilsAdmin()

  const [nom, setNom] = useState(site.nom)
  const [adresse, setAdresse] = useState(site.adresse)
  const [ville, setVille] = useState(site.ville)
  const [codePostal, setCodePostal] = useState(site.code_postal)
  const [typeSiteId, setTypeSiteId] = useState('')
  const [anneeConstruction, setAnneeConstruction] = useState(site.annee_construction ? String(site.annee_construction) : '')
  const [surfaceM2, setSurfaceM2] = useState(site.surface_m2 ? String(site.surface_m2) : '')
  const [dateDerniereAg, setDateDerniereAg] = useState(site.date_derniere_ag ? site.date_derniere_ag.slice(0, 10) : '')
  const [latitude, setLatitude] = useState(site.latitude != null ? String(site.latitude) : '')
  const [longitude, setLongitude] = useState(site.longitude != null ? String(site.longitude) : '')
  const [proprietaireId, setProprietaireId] = useState(site.proprietaire_id ?? '')
  const [feedback, setFeedback] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setNom(site.nom)
    setAdresse(site.adresse)
    setVille(site.ville)
    setCodePostal(site.code_postal)
    setTypeSiteId('')
    setAnneeConstruction(site.annee_construction ? String(site.annee_construction) : '')
    setSurfaceM2(site.surface_m2 ? String(site.surface_m2) : '')
    setDateDerniereAg(site.date_derniere_ag ? site.date_derniere_ag.slice(0, 10) : '')
    setLatitude(site.latitude != null ? String(site.latitude) : '')
    setLongitude(site.longitude != null ? String(site.longitude) : '')
    setProprietaireId(site.proprietaire_id ?? '')
    setFeedback(null)
  }, [open, site])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    try {
      await updateSite.mutateAsync({
        id: site.id,
        nom,
        adresse,
        ville,
        code_postal: codePostal,
        type_site_id: typeSiteId || null,
        annee_construction: anneeConstruction ? Number(anneeConstruction) : null,
        surface_m2: surfaceM2 ? Number(surfaceM2) : null,
        date_derniere_ag: dateDerniereAg || null,
        latitude: latitude ? Number(latitude) : null,
        longitude: longitude ? Number(longitude) : null,
        proprietaire_id: proprietaireId || null,
      })
      onSaved()
      onClose()
    } catch (err) {
      setFeedback(err instanceof Error ? err.message : 'Erreur inconnue')
    }
  }

  return (
    <Dialog open={open} onClose={onClose} title="Modifier le site" description="Mettre à jour les informations du site.">
      <form onSubmit={handleSubmit} className="space-y-3">
        <FormField label="Nom du site">
          <Input value={nom} onChange={(e) => setNom(e.target.value)} required />
        </FormField>
        <FormField label="Type de site">
          <Select value={typeSiteId} onChange={(e) => setTypeSiteId(e.target.value)}>
            <option value="">{site.type_site || 'Sélectionner un type…'}</option>
            {types.map((t) => <option key={t.id} value={t.id}>{t.libelle}</option>)}
          </Select>
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
            <Input value={ville} onChange={(e) => setVille(e.target.value)} />
          </FormField>
          <FormField label="Code postal">
            <Input value={codePostal} onChange={(e) => setCodePostal(e.target.value)} />
          </FormField>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <FormField label="Année de construction">
            <Input type="number" value={anneeConstruction} onChange={(e) => setAnneeConstruction(e.target.value)} placeholder="Ex. 1998" />
          </FormField>
          <FormField label="Surface (m²)">
            <Input type="number" value={surfaceM2} onChange={(e) => setSurfaceM2(e.target.value)} placeholder="Ex. 1200" />
          </FormField>
        </div>
        <FormField label="Date de la dernière AG">
          <Input type="date" value={dateDerniereAg} onChange={(e) => setDateDerniereAg(e.target.value)} />
        </FormField>
        <div className="grid grid-cols-2 gap-3">
          <FormField label="Latitude">
            <Input type="number" step="any" value={latitude} onChange={(e) => setLatitude(e.target.value)} placeholder="Ex. 48.8566" />
          </FormField>
          <FormField label="Longitude">
            <Input type="number" step="any" value={longitude} onChange={(e) => setLongitude(e.target.value)} placeholder="Ex. 2.3522" />
          </FormField>
        </div>
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
          <Button type="submit" disabled={updateSite.isPending}>Enregistrer</Button>
        </div>
      </form>
    </Dialog>
  )
}

function AddFichierDialog({ open, onClose, siteId, onSaved }: { open: boolean; onClose: () => void; siteId: string; onSaved: () => void }) {
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
      entite_type: 'site',
      entite_id: siteId,
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
    <Dialog open={open} onClose={() => { reset(); onClose() }} title="Ajouter un fichier" description="Rattacher un document à ce site.">
      <form onSubmit={handleSubmit} className="space-y-3">
        <FormField label="Nom du document">
          <Input value={nom} onChange={(e) => setNom(e.target.value)} required placeholder="Ex. Facture EDF — janvier 2026" />
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

function AddCompteurDialog({
  open,
  onClose,
  siteId,
  siteNom,
  compteId,
  onSaved,
}: {
  open: boolean
  onClose: () => void
  siteId: string
  siteNom: string
  compteId: string
  onSaved: (message: string) => void
}) {
  const { data: energiesRef } = useReferenceTable('types_energies')
  const energies = energiesRef && energiesRef.length > 0 ? energiesRef : FALLBACK_TYPES_ENERGIES
  const { data: utilisationsRef } = useReferenceTable('types_utilisations_compteur')
  const { data: comptes } = useComptes()
  const { data: contacts } = useContacts()
  const { data: compteurs } = useCompteurs()
  const createCompteur = useCreateCompteur()

  const [drafts, setDrafts] = useState<PdlDraft[]>([emptyPdlDraft()])
  const [submitting, setSubmitting] = useState(false)

  const fournisseurs = (comptes ?? []).filter((c) => c.type_compte === 'fournisseur')
  const contactsDuCompte = (contacts ?? []).filter((c) => c.compte_id === compteId)

  function reset() {
    setDrafts([emptyPdlDraft()])
    setSubmitting(false)
  }

  function patchDraft(key: string, patch: Partial<PdlDraft>) {
    setDrafts((prev) => prev.map((d) => (d.key === key ? { ...d, ...patch } : d)))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    let created = 0
    for (const d of drafts) {
      if (d.status === 'saved') continue
      const energieChoisie = energies.find((en) => en.id === d.typeEnergieId)
      const typeEnergie = (energieChoisie?.code?.toLowerCase() === 'gaz' ? 'gaz' : 'electricite') as 'electricite' | 'gaz'
      const fournisseur = fournisseurs.find((f) => f.id === d.fournisseurActuelId)
      const responsable = contactsDuCompte.find((c) => c.id === d.responsableContactId)
      patchDraft(d.key, { status: 'saving' })
      try {
        await createCompteur.mutateAsync({
          site_id: siteId,
          site_nom: siteNom,
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
        })
        patchDraft(d.key, { status: 'saved' })
        created += 1
      } catch (err) {
        patchDraft(d.key, { status: 'error', errorMessage: err instanceof Error ? err.message : 'Erreur inconnue' })
      }
    }
    setSubmitting(false)
    if (created > 0) onSaved(created > 1 ? `✓ ${created} compteurs ajoutés` : '✓ Compteur ajouté')
    setDrafts((prev) => {
      if (prev.every((d) => d.status === 'saved')) {
        setTimeout(() => { reset(); onClose() }, 600)
      }
      return prev
    })
  }

  return (
    <Dialog open={open} onClose={() => { reset(); onClose() }} title="Ajouter un ou plusieurs compteurs" description="Rattacher un ou plusieurs points de livraison à ce site." className="max-w-xl">
      <form onSubmit={handleSubmit} className="max-h-[70vh] space-y-4 overflow-y-auto pr-1">
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
        <div className="flex justify-end gap-2 border-t border-navy-100 pt-3">
          <Button type="button" variant="ghost" onClick={() => { reset(); onClose() }}>Fermer</Button>
          <Button type="submit" disabled={submitting || drafts.every((d) => d.status === 'saved')}>
            {drafts.length > 1 ? `Créer les ${drafts.length} PDL` : 'Créer le PDL'}
          </Button>
        </div>
      </form>
    </Dialog>
  )
}

function MapPinIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 21s-7-4.8-7-10.7a7 7 0 0 1 14 0C19 16.2 12 21 12 21z" />
      <circle cx="12" cy="10" r="2.5" />
    </svg>
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

function HealthCard({ health, donutColor }: { health: ReturnType<typeof computeSiteHealth>; donutColor: string }) {
  return (
    <div className="grid grid-cols-1 overflow-hidden rounded-xl border border-navy-100 bg-white sm:grid-cols-[220px_1fr]">
      <div className="flex flex-col items-center justify-center gap-2 border-b border-navy-50 bg-navy-50/60 p-4 sm:border-b-0 sm:border-r">
        <div
          className="relative flex h-[74px] w-[74px] items-center justify-center rounded-full"
          style={{ background: `conic-gradient(${donutColor} 0 ${health.score}%, #eceae6 ${health.score}% 100%)` }}
        >
          <div className="flex h-14 w-14 flex-col items-center justify-center rounded-full bg-white">
            <span className="text-xl font-bold leading-none text-navy-800">{health.score}</span>
            <span className="text-[8.5px] font-bold text-navy-300">/ 100</span>
          </div>
        </div>
        <div className="text-center">
          <p className="text-xs font-bold text-navy-800">Santé du site</p>
          <p className="text-[11px] font-semibold" style={{ color: donutColor }}>{health.label}</p>
        </div>
      </div>
      <div className="p-3.5">
        <p className="mb-2 text-[10px] font-bold uppercase tracking-wide text-navy-400">Détail du calcul</p>
        <div className="flex flex-col">
          {health.raisons.map((r) => (
            <div key={r} className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 hover:bg-navy-50">
              <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: donutColor }} />
              <span className="flex-1 text-[11.5px] font-medium text-navy-700">{r}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function ComptePanel({
  compte,
  compteNom,
  compteId,
  onCopy,
}: {
  compte: Compte | undefined
  compteNom: string
  compteId: string
  onCopy: (msg: string) => void
}) {
  return (
    <div className="rounded-xl border border-navy-100 bg-white p-3.5">
      <div className="mb-2 flex items-center gap-1.5">
        <span className="flex h-5 w-5 items-center justify-center rounded-md bg-sky-100 text-sky-500">
          <Building2 className="h-2.5 w-2.5" />
        </span>
        <span className="text-[10px] font-bold uppercase tracking-wide text-navy-400">Compte</span>
        <div className="flex-1" />
        <EntityLink to={`/comptes/${compteId}`}>ouvrir →</EntityLink>
      </div>
      <p className="text-[13px] font-bold text-sky-500">{compte?.nom ?? compteNom}</p>
      <div className="mt-2 flex flex-col gap-1.5 text-[11.5px]">
        <div className="flex items-center justify-between">
          <span className="text-navy-500">Type</span>
          <span className="font-semibold text-navy-800">{compte?.type_compte ?? '—'}</span>
        </div>
        {compte?.score_ellipro && (
          <div className="flex items-center justify-between">
            <span className="text-navy-500">Note Ellisphere</span>
            <span className="rounded bg-kiwi-50 px-1.5 py-0.5 text-[11px] font-extrabold text-kiwi-600">{compte.score_ellipro}</span>
          </div>
        )}
        {compte?.siren && (
          <div className="flex items-center justify-between">
            <span className="text-navy-500">SIREN</span>
            <button type="button" onClick={() => copyToClipboard(compte.siren ?? '', onCopy)} className="font-mono text-[10.5px] font-semibold hover:text-sky-500">
              {compte.siren} ⧉
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

function ContactsPanel({ contacts }: { contacts: Contact[] | undefined }) {
  const navigate = useNavigate()
  const list = contacts ?? []
  return (
    <div className="rounded-xl border border-navy-100 bg-white p-3.5">
      <div className="mb-2.5 flex items-center gap-1.5">
        <span className="flex h-5 w-5 items-center justify-center rounded-md bg-violet-100 text-violet-500">
          <Users className="h-2.5 w-2.5" />
        </span>
        <span className="text-[10px] font-bold uppercase tracking-wide text-navy-400">Contacts</span>
      </div>
      {list.length === 0 && <p className="text-xs text-navy-400">Aucun contact rattaché à ce site.</p>}
      <div className="flex flex-col gap-3">
        {list.map((c) => {
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
    </div>
  )
}
