import { useEffect, useMemo, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Phone, StickyNote, Plus, Building2, Users, Zap, Flame, Sparkle, Trash2, FileCheck2, FileText, AlertTriangle } from 'lucide-react'
import { Topbar } from '@/components/layout/Topbar'
import { Button } from '@/components/ui/button'
import { ZoneDepotFichiers } from '@/components/ui/zone-depot-fichiers'
import { Badge } from '@/components/ui/badge'
import { EntityLink } from '@/components/ui/entity-link'
import { PhoneLink, EmailLink } from '@/components/ui/contact-link'
import { Dialog } from '@/components/ui/dialog'
import { HistoriqueDiscret } from '@/components/ui/historique-discret'
import { InlineField } from '@/components/ui/inline-field'
import { PdlDraftRows, emptyPdlDraft, buildDraftCharacteristics, champsPdlManquants, applyExtractionToDraft, type PdlDraft, type ExtractedField } from '@/components/compteur/PdlDraftRows'
import { ExtractDocumentButton } from '@/components/ui/document-extraction'
import { MandatChainPrompt, type ChainedCompteur } from '@/components/compteur/MandatChainPrompt'
import { useSite, useUpdateSitePartiel, useDeleteSite, type PatchSite } from '@/lib/data/sites'
import { useCompteursParSites } from '@/lib/data/compteurs'
import { useCompte } from '@/lib/data/comptes'
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
  FALLBACK_TYPES_ENERGIES,
} from '@/lib/referenceFallbacks'
import { useCanManage, useIsAdmin, useProfilsAdmin } from '@/lib/data/roles'
import { useSignauxParSites } from '@/lib/data/signaux'
import { useCompteurs, useCreateCompteur } from '@/lib/data/compteurs'
import { useRecommandationsParCompte } from '@/lib/data/recommandations'
import { useContratsParCompte } from '@/lib/data/contrats'
import { useInteractionsForSite } from '@/lib/data/interactions'
import { useContactsParCompte, useContacts } from '@/lib/data/contacts'
import { useMandatsParCompte } from '@/lib/data/mandats'
import { useActionsParSites } from '@/lib/data/actions'
import { useDocumentsParEntites, useTeleverserDocuments } from '@/lib/data/documents'
import { useHistorique } from '@/lib/data/historique'
import { useComptes } from '@/lib/data/comptes'
import { EnergyTimeline } from '@/components/site/EnergyTimeline'
import { CoverageMatrix } from '@/components/site/CoverageMatrix'
import { ActivityFeed } from '@/components/site/ActivityFeed'
import { computeSiteHealth } from '@/lib/siteHealth'
import { cn } from '@/lib/utils'
import { useGoBack } from '@/lib/useGoBack'
import { useRaccourcisOnglets } from '@/lib/useRaccourcisOnglets'
import type { Compte, Contact } from '@/types/domain'
import { appelerNumero, numeroLisible } from '@/lib/telephonie'

type TabKey = 'synthese' | 'contrats' | 'compteurs' | 'recommandations' | 'signaux' | 'mandats' | 'fichiers' | 'historique' | 'activite'

function copyToClipboard(text: string, onDone: (msg: string) => void) {
  if (!text) return
  navigator.clipboard?.writeText(text).catch(() => {})
  onDone(`⧉ Copié — ${text}`)
}

export default function SiteDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  // Tout est lu au perimetre du site, cote serveur : ces dix lectures chargeaient le CRM entier
  // pour afficher une fiche (meme motif que la fiche compte, corrige le 14/08/2026).
  const { data: site } = useSite(id)
  const { data: compte } = useCompte(site?.compte_id)
  const siteIdsPourFiltre = useMemo(() => (id ? [id] : undefined), [id])
  const { data: signaux } = useSignauxParSites(siteIdsPourFiltre)
  const { data: compteurs } = useCompteursParSites(siteIdsPourFiltre)
  const { data: actions } = useActionsParSites(siteIdsPourFiltre)
  const { data: documents } = useDocumentsParEntites(siteIdsPourFiltre)
  // Recommandations, contrats, mandats et contacts se rattachent au COMPTE : on lit son perimetre,
  // puis on garde ce qui concerne ce site. Un mandat couvre d'ailleurs plusieurs sites, et la fiche
  // affiche explicitement « les autres mandats du compte ».
  const { data: recommandations } = useRecommandationsParCompte(site?.compte_id)
  const { data: contrats } = useContratsParCompte(site?.compte_id)
  const { data: mandats } = useMandatsParCompte(site?.compte_id)
  const { data: contacts } = useContactsParCompte(site?.compte_id)
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
  const [confirmDelete, setConfirmDelete] = useState(false)

  const televerser = useTeleverserDocuments()

  const { data: typesDocsRef } = useReferenceTable('types_documents')
  const { data: typesSites } = useReferenceTable('types_sites')

  // Mise a jour partielle : un champ modifie n'en reecrit pas douze. L'ancienne modale renvoyait
  // TOUTES les colonnes a chaque validation, ce qui ecrasait au passage ce qu'un collegue venait
  // de changer sur un autre champ depuis un autre poste.
  const updateSitePartiel = useUpdateSitePartiel()
  const majSite = async (patch: PatchSite) => {
    await updateSitePartiel.mutateAsync({ id: id as string, patch })
  }

  const typesDocs = typesDocsRef && typesDocsRef.length > 0 ? typesDocsRef : FALLBACK_TYPES_DOCUMENTS
  const [addCompteurOpen, setAddCompteurOpen] = useState(false)

  function showToast(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(null), 2200)
  }

  const canManage = useCanManage(site?.proprietaire_id)
  const isAdmin = useIsAdmin()
  const { data: profilsAdmin } = useProfilsAdmin()
  const goBack = useGoBack('/sites')

  async function handleDelete() {
    if (!site) return
    await deleteSite.mutateAsync(site.id)
    navigate('/sites')
  }

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

  // « 1–5 pour naviguer » : le raccourci annonce par la maquette dans la barre d'onglets.
  const clesOnglets = TABS.filter((t) => !t.mobileOnly).map((t) => t.key)
  useRaccourcisOnglets(clesOnglets, setTab)

  /**
   * Raccourcis clavier — 1 à 8 pour changer d'onglet.
   *
   * N et R ont ete retires le 16/08/2026 avec les boutons « Note » et « Relance » qu'ils
   * doublaient (demande de Naoelle : « enlever les boutons Note et Relance partout ou c'est
   * affiche »). Garder R aurait ete pire que le supprimer : il CREAIT une action de relance en
   * base, et sans bouton visible pour l'annoncer, une frappe malencontreuse l'aurait declenchee
   * sans que personne comprenne d'ou venait la tache.
   */
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return
      const map: Record<string, TabKey> = { '1': 'synthese', '2': 'contrats', '3': 'compteurs', '4': 'recommandations', '5': 'signaux', '6': 'mandats', '7': 'fichiers', '8': 'historique' }
      if (map[e.key]) setTab(map[e.key])
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [site?.id])

  if (!site && !id) {
    return (
      <div>
        <Topbar crumb="Sites" title="Site" />
        <div className="p-4 sm:p-6"><p className="text-sm text-km-faint">Chargement…</p></div>
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
          <p className="text-sm text-km-muted">Site introuvable.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <Topbar crumb="Sites" title={site.nom} />

      {/* Bandeau site */}
      <div className="flex flex-none flex-wrap items-center gap-3.5 border-b border-km-line bg-white px-4 py-3.5 sm:px-6">
        <Button variant="ghost" size="icon" onClick={goBack} title="Retour aux sites">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] bg-gradient-to-br from-kiwi-500 to-kiwi-400 text-white">
          <MapPinIcon />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-xl font-bold tracking-tight text-km-text">{site.nom}</p>
          <p className="truncate text-xs text-km-muted">{compte?.nom ?? site.compte_nom} · {compteursDuSite.length} compteur{compteursDuSite.length > 1 ? 's' : ''}</p>
          <p className="truncate text-km-xs text-km-faint">
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
            onClick={() => contactPrincipal?.telephone && void appelerNumero(contactPrincipal.telephone)}
          >
            <Phone className="h-3.5 w-3.5" />
            Appeler
          </Button>
          {/* Les boutons « Note » et « Relance » ont ete retires le 16/08/2026 (demande de
              Naoelle). La note s'ecrit dans l'onglet Activite, ou le champ est deja sous les yeux ;
              une relance se cree comme n'importe quelle tache. */}
          <Button size="sm" onClick={() => navigate('/recommandations')}>
            <Plus className="h-3.5 w-3.5" />
            Recommandation
          </Button>
          {canManage && (
            <>
              {/* Plus de bouton « Modifier » : les champs s'editent la ou ils s'affichent, dans le
                  panneau Informations. Un bouton qui ouvre une modale pour retrouver les memes
                  champs deux clics plus loin n'apportait rien. */}
              <Button variant="outline" size="sm" onClick={() => setConfirmDelete(true)}>
                <Trash2 className="h-3.5 w-3.5" />
                Supprimer
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Onglets — pilules sur mobile, soulignés sur desktop, comme chez William */}
      <div className="flex gap-1.5 overflow-x-auto border-b border-km-line bg-white px-4 pt-2.5 lg:gap-0.5 lg:pt-0 sm:px-6">
        {TABS.map((t) => {
          const isActive = tab === t.key
          const badgeTone = t.key === 'signaux' ? 'bg-red-500 text-white' : t.key === 'mandats' ? 'bg-amber-200 text-amber-700' : 'bg-km-soft text-km-muted'
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={cn(
                'mb-2.5 inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 py-2 text-km-body font-semibold transition-colors lg:mb-0 lg:rounded-none lg:border-b-2 lg:px-3 lg:py-2.5 lg:font-normal',
                t.mobileOnly && 'lg:hidden',
                isActive
                  ? 'bg-ink-800 text-white lg:border-navy-800 lg:bg-transparent lg:font-semibold lg:text-km-text'
                  : 'border border-km-line bg-white text-km-muted hover:bg-km-bg lg:border-0 lg:border-b-2 lg:border-transparent lg:text-km-muted lg:hover:bg-transparent lg:hover:text-km-text',
              )}
            >
              <span className="lg:hidden">{t.labelMobile ?? t.label}</span>
              <span className="hidden lg:inline">{t.label}</span>
              {t.badge && (
                <span className={cn('rounded px-1.5 py-0.5 text-km-tiny font-bold', isActive ? 'bg-white/20 text-white lg:bg-km-soft lg:text-km-muted' : badgeTone)}>
                  {t.badge}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* 3 zones */}
      <div className="grid min-h-0 flex-1 grid-cols-1 overflow-hidden lg:grid-cols-[300px_minmax(0,1fr)_340px]">
        {/* Colonne gauche — Compte + Contacts (desktop uniquement) */}
        <div className="hidden min-h-0 flex-col gap-3.5 overflow-y-auto border-r border-km-line bg-km-bg/60 p-3.5 lg:flex">
          <ComptePanel compte={compte} compteNom={site.compte_nom} compteId={site.compte_id} onCopy={showToast} />
          <ContactsPanel contacts={contactsDuSite} />
        </div>

        {/* Centre — contenu de l'onglet */}
        <div className="min-h-0 overflow-y-auto bg-km-bg p-4 sm:p-5">
          {tab === 'synthese' && (
            <div className="flex flex-col gap-3.5">
              <HealthCard health={health} donutColor={donutColor} />
              <div className="grid grid-cols-1 gap-3.5 lg:grid-cols-[1fr_1.2fr]">
                <div className="flex flex-col overflow-hidden rounded-xl border border-km-line bg-white">
                  <iframe
                    title="Carte du site"
                    src={`https://maps.google.com/maps?q=${mapQuery}&z=${site.latitude != null ? 16 : 13}&output=embed`}
                    className="block h-[200px] w-full flex-1 border-0"
                  />
                  <div className="flex items-center gap-2 px-3.5 py-2.5">
                    <span className="text-xs font-semibold text-km-text">{adresse || 'Adresse non renseignée'}</span>
                    <div className="flex-1" />
                    {adresse && (
                      <a href={`https://www.google.com/maps/search/?api=1&query=${mapQuery}`} target="_blank" rel="noreferrer" className="whitespace-nowrap text-km-xs font-semibold">
                        Itinéraire ↗
                      </a>
                    )}
                  </div>
                </div>
                <div className="rounded-xl border border-km-line bg-white p-4">
                  <div className="mb-3 flex items-center">
                    <span className="text-km-xs font-bold uppercase tracking-wide text-km-faint">Informations</span>
                    <div className="flex-1" />
                    <span className="text-km-xs text-km-faint">cliquer ⧉ pour copier</span>
                  </div>
                  {/* Edition en place, plus aucune modale : « le commercial passe ses journees dans
                      l'outil, chaque modale est un clic et une rupture d'attention de trop »
                      (brief). Un clic ouvre le champ, Entree valide, Echap annule.
                      Un champ vide affiche un placeholder pointille cliquable au lieu d'un blanc
                      muet : rien n'indiquait auparavant qu'il etait modifiable.
                      L'adresse se lit concatenee et s'eclate au clic en rue / code postal / ville,
                      avec la recherche BAN qui remplit les trois d'un coup. */}
                  <div className="grid grid-cols-2 gap-3.5">
                    <InlineField
                      variant="text"
                      label="Libellé du site"
                      value={site.nom}
                      // `nom` est NOT NULL en base, mais une chaine vide y passerait : on aurait
                      // un site sans libelle, introuvable dans les listes et la recherche.
                      onCommit={async (nom) => {
                        if (nom.trim() === '') throw new Error('Le libellé du site est obligatoire.')
                        await majSite({ nom: nom.trim() })
                      }}
                      onSaved={() => showToast('✓ enregistré')}
                      onError={(e) => showToast(`Erreur : ${e.message}`)}
                    />
                    <InlineField
                      variant="select"
                      label="Type"
                      value={site.type_site_id ?? ''}
                      options={(typesSites ?? []).map((t) => ({ value: t.id, label: t.libelle }))}
                      // `|| null` : la colonne est un uuid, une chaine vide y ferait un 22P02.
                      onCommit={(type_site_id) => majSite({ type_site_id: type_site_id || null })}
                      onSaved={() => showToast('✓ enregistré')}
                      onError={(e) => showToast(`Erreur : ${e.message}`)}
                    />
                    <div className="col-span-2">
                      <InlineField
                        variant="address"
                        label="Adresse"
                        rue={site.adresse ?? ''}
                        codePostal={site.code_postal ?? ''}
                        ville={site.ville ?? ''}
                        onCommit={({ rue, codePostal, ville }) =>
                          majSite({ adresse: rue, code_postal: codePostal, ville })
                        }
                        onSaved={() => showToast('✓ enregistré')}
                        onError={(e) => showToast(`Erreur : ${e.message}`)}
                      />
                    </div>
                    <InlineField
                      variant="number"
                      label="Année de construction"
                      value={site.annee_construction ?? null}
                      unit=""
                      onCommit={(annee_construction) => majSite({ annee_construction })}
                      onSaved={() => showToast('✓ enregistré')}
                      onError={(e) => showToast(`Erreur : ${e.message}`)}
                    />
                    <InlineField
                      variant="number"
                      label="Surface"
                      value={site.surface_m2 ?? null}
                      unit="m²"
                      onCommit={(surface_m2) => majSite({ surface_m2 })}
                      onSaved={() => showToast('✓ enregistré')}
                      onError={(e) => showToast(`Erreur : ${e.message}`)}
                    />
                    <InlineField
                      variant="date"
                      label="Dernière AG"
                      value={site.date_derniere_ag ?? null}
                      onCommit={(date_derniere_ag) => majSite({ date_derniere_ag })}
                      onSaved={() => showToast('✓ enregistré')}
                      onError={(e) => showToast(`Erreur : ${e.message}`)}
                    />
                    {/* Le proprietaire commande la visibilite du site (useCanManage) : il reste
                        reserve aux administrateurs, comme dans l'ancienne modale. */}
                    {isAdmin && (
                      <InlineField
                        variant="select"
                        label="Propriétaire"
                        value={site.proprietaire_id ?? ''}
                        options={(profilsAdmin ?? []).map((p) => ({ value: p.id, label: `${p.prenom} ${p.nom}` }))}
                        emptyLabel="aucun"
                        onCommit={(proprietaire_id) => majSite({ proprietaire_id: proprietaire_id || null })}
                        onSaved={() => showToast('✓ enregistré')}
                        onError={(e) => showToast(`Erreur : ${e.message}`)}
                      />
                    )}
                  </div>
                  {site.latitude == null ? (
                    <p className="mt-3 text-km-xs italic text-km-faint">Coordonnées précises non renseignées — la carte se positionne sur l'adresse/ville.</p>
                  ) : null}
                  {/* Coordonnees editables : la geolocalisation par l'adresse suffit dans la
                      quasi-totalite des cas, mais certains sites (parkings, ZAC, batiments en
                      fond de cour) tombent a cote et il faut pouvoir corriger a la main. */}
                  {canManage && (
                    <div className="mt-3 grid grid-cols-2 gap-3.5 border-t border-km-line pt-3">
                      <InlineField
                        variant="number"
                        label="Latitude"
                        value={site.latitude}
                        unit=""
                        onCommit={(latitude) => majSite({ latitude })}
                        onSaved={() => showToast('✓ enregistré')}
                        onError={(e) => showToast(`Erreur : ${e.message}`)}
                      />
                      <InlineField
                        variant="number"
                        label="Longitude"
                        value={site.longitude}
                        unit=""
                        onCommit={(longitude) => majSite({ longitude })}
                        onSaved={() => showToast('✓ enregistré')}
                        onError={(e) => showToast(`Erreur : ${e.message}`)}
                      />
                    </div>
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
                <p className="text-sm text-km-faint">Aucun compteur pour ce site.</p>
              ) : (
                <EnergyTimeline compteurs={compteursDuSite} contrats={contratsDuSite} />
              )}
              <div>
                <p className="mb-2 text-km-xs font-bold uppercase tracking-wide text-km-faint">Historique des contrats par compteur</p>
                <div className="flex flex-col gap-2.5">
                  {compteursDuSite.map((c) => {
                    const historiqueContrats = contratsDuSite
                      .filter((ct) => ct.compteurs.some((cc) => cc.id === c.id))
                      .sort((a, b) => new Date(b.date_debut ?? 0).getTime() - new Date(a.date_debut ?? 0).getTime())
                    const Icon = c.type_energie === 'gaz' ? Flame : Zap
                    return (
                      <div key={c.id} className="overflow-hidden rounded-lg border border-km-line bg-white">
                        <div className="flex items-center gap-2 border-b border-navy-50 bg-km-bg/60 px-3.5 py-2.5">
                          <span className={cn('flex h-6 w-6 items-center justify-center rounded-md', c.type_energie === 'gaz' ? 'bg-km-amber-soft text-amber-600' : 'bg-sky-100 text-sky-500')}>
                            <Icon className="h-3 w-3" />
                          </span>
                          <span className="text-xs font-bold text-km-text">{c.utilisation || c.numero_pdl}</span>
                          <span className="font-mono text-km-xs text-km-faint">{c.numero_pdl}</span>
                        </div>
                        {historiqueContrats.length === 0 ? (
                          <p className="px-3.5 py-2.5 text-xs text-km-faint">Aucun contrat.</p>
                        ) : (
                          historiqueContrats.map((ct) => (
                            <div
                              key={ct.id}
                              onClick={() => navigate(`/contrats/${ct.id}`)}
                              className="flex cursor-pointer items-center gap-3 border-t border-navy-50 px-3.5 py-2.5 hover:bg-km-bg/60"
                            >
                              <Badge tone={STATUT_CONTRAT_TONE[ct.statut] ?? 'neutral'}>{statutsContrats.find((s) => s.code === ct.statut)?.libelle ?? ct.statut}</Badge>
                              <span className="flex-1 text-xs font-medium text-km-text">{ct.fournisseur_nom}</span>
                              <span className="font-mono text-km-xs text-km-faint">
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
              {compteursDuSite.length === 0 && <p className="text-sm text-km-faint">Aucun compteur pour ce site.</p>}
              {compteursDuSite.map((c) => {
                const contratActif = contratsDuSite.find((ct) => ct.compteurs.some((cc) => cc.id === c.id) && ct.statut === 'ACTIF')
                const Icon = c.type_energie === 'gaz' ? Flame : Zap
                return (
                  <div
                    key={c.id}
                    onClick={() => navigate(`/compteurs/${c.id}`)}
                    className="flex cursor-pointer items-center gap-3 rounded-xl border border-km-line bg-white p-3.5 hover:bg-km-bg/60"
                  >
                    <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px]', c.type_energie === 'gaz' ? 'bg-km-amber-soft text-amber-600' : 'bg-sky-100 text-sky-500')}>
                      <Icon className="h-4 w-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-bold text-km-text">{c.utilisation || c.numero_pdl}</p>
                      <p className="truncate font-mono text-km-xs text-km-faint">
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
              {recommandationsDuSite.length === 0 && <p className="text-sm text-km-faint">Aucune recommandation pour ce site.</p>}
              {recommandationsDuSite.map((r) => {
                // versions[0] est la plus récente : la liste est triée décroissant depuis le 12/08/2026.
                const derniereVersion = r.versions[0]
                return (
                  <div
                    key={r.id}
                    onClick={() => navigate(`/recommandations/${r.id}`)}
                    className="cursor-pointer rounded-xl border border-km-line bg-white p-3.5 hover:bg-km-bg/60"
                  >
                    <div className="flex items-center gap-2">
                      <p className="flex-1 text-sm font-bold text-km-text">{r.titre}</p>
                      <Badge tone={ETAPE_TONE[r.etape] ?? 'amber'}>{etapes.find((e) => e.code === r.etape)?.libelle ?? r.etape}</Badge>
                    </div>
                    {derniereVersion && (
                      <p className="mt-2 text-km-label text-km-faint">
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
                <div className="rounded-xl border border-dashed border-kiwi-100 bg-white p-6 text-center text-sm font-semibold text-km-green">
                  ✓ Aucun signal ouvert — site sous contrôle
                </div>
              )}
              {signauxDuSite.map((s) => (
                <div key={s.id} className="rounded-xl border border-km-line bg-white p-3.5">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold text-km-text">{s.type_signal}</p>
                    <p className="mt-0.5 text-xs text-km-muted">{s.description}</p>
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
                <div className="overflow-hidden rounded-xl border border-km-line bg-white">
                  <div className="flex items-center gap-3 border-b border-navy-50 px-4 py-3.5">
                    <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-200 text-amber-700"><FileCheck2 className="h-3.5 w-3.5" /></span>
                    <div className="flex-1">
                      <p className="text-sm font-bold text-km-text">Mandat {mandatDuSite.compte_nom}</p>
                      <p className="text-km-label text-km-muted">
                        {mandatDuSite.contact_signataire_nom ? `Signataire ${mandatDuSite.contact_signataire_nom}` : 'Signataire non renseigné'}
                        {mandatDuSite.date_signature ? ` · signé le ${new Date(mandatDuSite.date_signature).toLocaleDateString('fr-FR')}` : ''}
                        {mandatDuSite.docusign_envelope_id ? ' · DocuSign ✓' : ''}
                      </p>
                    </div>
                    <Badge tone={STATUT_MANDAT_TONE[mandatDuSite.statut] ?? 'neutral'}>{statutsMandats.find((s) => s.code === mandatDuSite.statut)?.libelle ?? mandatDuSite.statut}</Badge>
                  </div>
                  <div className="px-4 py-3.5">
                    <div className="mb-2.5 flex items-center gap-2">
                      <span className="text-km-xs font-bold uppercase tracking-wide text-km-faint">Périmètre du mandat</span>
                      <div className="flex-1" />
                      <span className="text-km-label font-bold text-km-green">{mandatDuSite.nb_sites_couverts} site{mandatDuSite.nb_sites_couverts > 1 ? 's' : ''} couvert{mandatDuSite.nb_sites_couverts > 1 ? 's' : ''}</span>
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
                  <p className="mb-2 text-km-xs font-bold uppercase tracking-wide text-km-faint">Autres mandats du compte</p>
                  <div className="flex flex-col gap-2">
                    {autresMandatsDuCompte.map((m) => (
                      <div key={m.id} onClick={() => navigate('/mandats')} className="flex cursor-pointer items-center gap-3 rounded-lg border border-km-line bg-white p-3 hover:bg-km-bg/60">
                        <Badge tone={STATUT_MANDAT_TONE[m.statut] ?? 'neutral'}>{statutsMandats.find((s) => s.code === m.statut)?.libelle ?? m.statut}</Badge>
                        <span className="flex-1 text-xs font-medium text-km-text">{m.nb_sites_couverts} site{m.nb_sites_couverts > 1 ? 's' : ''}</span>
                        <span className="text-km-xs text-km-faint">{m.contact_signataire_nom ?? '—'}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {tab === 'fichiers' && (
            <div className="flex flex-col gap-3.5">
              {/* PAS DE BOUTON « Ajouter un fichier ». Naoelle, 21/08/2026 : « si on peut cliquer
                  ou deposer c'est bon, pas besoin de bruit visuel avec un bouton », puis « fais le
                  menage partout ». La zone juste en dessous dit les deux gestes et les accepte tous
                  les deux ; le bouton doublait l'un d'eux. Le rattachement par lien, qui n'etait
                  accessible que par lui, se fait desormais dans la zone — en y glissant le lien, ou
                  en le collant. */}
              {/* Depot reel de fichiers — possible depuis que le bucket « documents » a des
                  politiques d'ecriture (migration 20260816130000). */}
              <ZoneDepotFichiers
                types={typesDocs}
                onDeposer={async (fichiers, typeDocumentId) => {
                  await televerser.mutateAsync({
                    fichiers,
                    entite_type: 'site',
                    entite_id: site.id,
                    type_document_id: typeDocumentId,
                    type_document_libelle: typesDocs.find((x) => x.id === typeDocumentId)?.libelle ?? '',
                  })
                showToast(`✓ ${fichiers.length} fichier${fichiers.length > 1 ? 's' : ''} déposé${fichiers.length > 1 ? 's' : ''}`)
                }}
              />
              {documentsDuSite.length === 0 ? (
                <p className="text-sm text-km-faint">Aucun fichier pour ce site.</p>
              ) : (
                <div className="overflow-hidden rounded-xl border border-km-line bg-white">
                  {documentsDuSite.map((d) => (
                    <div
                      key={d.id}
                      onClick={() => navigate(`/documents/${d.id}`)}
                      className="flex cursor-pointer items-center gap-3 border-b border-navy-50 px-4 py-3 last:border-b-0 hover:bg-km-bg/60"
                    >
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-km-soft text-km-muted">
                        <FileText className="h-4 w-4" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-bold text-km-text">{d.nom}</p>
                        <p className="truncate text-km-xs text-km-faint">{d.auteur} · {new Date(d.date_creation).toLocaleDateString('fr-FR')}</p>
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
              <p className="text-km-label text-km-faint">{historique?.length ?? 0} changement{(historique?.length ?? 0) > 1 ? 's' : ''} tracé{(historique?.length ?? 0) > 1 ? 's' : ''} · tous horodatés</p>
              <div className="overflow-hidden rounded-xl border border-km-line bg-white">
                {!historique || historique.length === 0 ? (
                  <p className="p-4 text-sm text-km-faint">Aucune modification enregistrée.</p>
                ) : (
                  historique.map((h) => (
                    <div key={h.id} className="grid grid-cols-[110px_1fr] gap-3 border-b border-navy-50 px-4 py-3 last:border-b-0 sm:grid-cols-[110px_140px_140px_1fr]">
                      <span className="font-mono text-km-xs text-km-muted">{new Date(h.date_modification).toLocaleString('fr-FR')}</span>
                      <span className={`hidden text-km-label sm:block ${h.estUnePersonne ? 'font-semibold text-km-text' : 'italic text-km-faint'}`}>{h.auteur}</span>
                      <span className="hidden text-km-label font-medium text-km-muted sm:block">{h.champ}</span>
                      <span className="flex flex-wrap items-center gap-2 text-km-label">
                        {h.ancienne_valeur && (
                          <>
                            <span className="text-km-faint line-through">{h.ancienne_valeur}</span>
                            <span className="text-km-faint">→</span>
                          </>
                        )}
                        <span className="font-semibold text-km-green">{h.nouvelle_valeur ?? '—'}</span>
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
        <div className="hidden min-h-0 flex-col border-l border-km-line bg-white lg:flex">
          <div className="flex flex-none items-center gap-2 px-3.5 py-3">
            <span className="text-km-xs font-bold uppercase tracking-wide text-km-faint">Activité</span>
          </div>
          <div className="min-h-0 flex-1 overflow-hidden px-3.5 pb-3.5">
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
        className="fixed bottom-[70px] right-4 z-30 flex h-[52px] w-[52px] items-center justify-center rounded-full bg-km-green text-white shadow-lg shadow-kiwi-600/40 lg:hidden"
        aria-label="Actions rapides"
      >
        <Plus className="h-6 w-6" />
      </button>

      {sheetOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-black/35" onClick={() => setSheetOpen(false)} />
          <div className="absolute inset-x-2 bottom-[62px] rounded-[18px] bg-white p-2 shadow-2xl">
            <div className="mx-auto mb-1.5 mt-0.5 h-1 w-9 rounded-full bg-km-line" />
            <button
              type="button"
              onClick={() => { setTab('activite'); setSheetOpen(false) }}
              className="flex w-full items-center gap-3 rounded-xl px-3.5 py-3 text-left hover:bg-km-bg"
            >
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-km-amber-soft text-amber-700"><StickyNote className="h-3.5 w-3.5" /></span>
              <span className="text-sm font-semibold text-km-text">Ajouter une note</span>
            </button>
            <button
              type="button"
              onClick={() => { setSheetOpen(false); navigate('/recommandations') }}
              className="flex w-full items-center gap-3 rounded-xl px-3.5 py-3 text-left hover:bg-km-bg"
            >
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-km-amber-soft text-amber-700"><Sparkle className="h-3.5 w-3.5" /></span>
              <span className="text-sm font-semibold text-km-text">Nouvelle recommandation</span>
            </button>
            {contactPrincipal?.telephone && (
              <button
                type="button"
                onClick={() => { setSheetOpen(false); void appelerNumero(contactPrincipal.telephone) }}
                className="flex w-full items-center gap-3 rounded-xl px-3.5 py-3 text-left hover:bg-km-bg"
              >
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-km-green-soft text-km-green"><Phone className="h-3.5 w-3.5" /></span>
                <span className="text-sm font-semibold text-km-text">Appeler {contactPrincipal.prenom} {contactPrincipal.nom}</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => setSheetOpen(false)}
              className="mt-1 w-full rounded-xl border-t border-navy-50 py-3 text-center text-sm font-semibold text-km-faint"
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


      {/* Monte seulement a l'ouverture : ce dialogue lit useComptes, useContacts et useCompteurs
          pour detecter un PDL deja existant ailleurs dans le CRM. Monte en permanence, chaque
          affichage d'une fiche site payait ces trois tables -- meme piege que sur la fiche compte. */}
      {addCompteurOpen && (
        <AddCompteurDialog
          open
          onClose={() => setAddCompteurOpen(false)}
          siteId={site.id}
          siteNom={site.nom}
          compteId={site.compte_id}
          onSaved={(message) => showToast(message)}
        />
      )}

      <Dialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title="Supprimer ce site ?"
        description="Cette action est irréversible. Les compteurs, contrats et recommandations rattachés ne seront pas supprimés mais perdront leur lien à ce site."
      >
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="ghost" onClick={() => setConfirmDelete(false)}>Annuler</Button>
          <Button type="button" variant="outline" className="border-red-200 text-km-red hover:bg-km-red-soft" disabled={deleteSite.isPending} onClick={handleDelete}>
            Supprimer définitivement
          </Button>
        </div>
      </Dialog>
    </div>
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
  const [createdCompteurs, setCreatedCompteurs] = useState<ChainedCompteur[] | null>(null)

  const fournisseurs = (comptes ?? []).filter((c) => c.type_compte === 'fournisseur')
  const contactsDuCompte = (contacts ?? []).filter((c) => c.compte_id === compteId)
  const compteDuSite = comptes?.find((c) => c.id === compteId)

  // Un brouillon non encore créé auquel il manque un champ requis bloque l'enregistrement (Tools).
  const draftsIncomplets = drafts.some((d) => {
    if (d.status === 'saved' || d.status === 'saving') return false
    const code = energies.find((e) => e.id === d.typeEnergieId)?.code?.toLowerCase()
    return champsPdlManquants(d, code !== 'gaz', true).size > 0
  })

  function reset() {
    setDrafts([emptyPdlDraft()])
    setSubmitting(false)
    setCreatedCompteurs(null)
  }

  function patchDraft(key: string, patch: Partial<PdlDraft>) {
    setDrafts((prev) => prev.map((d) => (d.key === key ? { ...d, ...patch } : d)))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    let created = 0
    const nouveaux: ChainedCompteur[] = []
    for (const d of drafts) {
      if (d.status === 'saved') continue
      const energieChoisie = energies.find((en) => en.id === d.typeEnergieId)
      const typeEnergie = (energieChoisie?.code?.toLowerCase() === 'gaz' ? 'gaz' : 'electricite') as 'electricite' | 'gaz'
      const fournisseur = fournisseurs.find((f) => f.id === d.fournisseurActuelId)
      // Cherché dans TOUS les contacts : le sélecteur permet de désigner un responsable rattaché
      // à un autre compte (onglet « Autre contact »).
      const responsable = (contacts ?? []).find((c) => c.id === d.responsableContactId)
      patchDraft(d.key, { status: 'saving' })
      try {
        const result = await createCompteur.mutateAsync({
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
    if (created > 0) onSaved(created > 1 ? `✓ ${created} compteurs ajoutés` : '✓ Compteur ajouté')
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
          compteId={compteId}
          compteNom={comptes?.find((c) => c.id === compteId)?.nom ?? siteNom}
          compteurs={createdCompteurs}
          contacts={contactsDuCompte}
          onDone={() => { reset(); onClose() }}
        />
      </Dialog>
    )
  }

  return (
    <Dialog open={open} onClose={() => { reset(); onClose() }} title="Ajouter un ou plusieurs compteurs" description="Rattacher un ou plusieurs points de livraison à ce site." className="max-w-xl">
      <form onSubmit={handleSubmit} className="max-h-[70vh] space-y-4 overflow-y-auto pr-1">
        {/* Le site est déjà connu ici : la facture ne sert qu'à pré-remplir le point de livraison. */}
        <ExtractDocumentButton
          onExtracted={(fields: Record<string, ExtractedField>) =>
            setDrafts((prev) => prev.map((d, i) => (i === 0 ? { ...d, ...applyExtractionToDraft(d, fields, energies, fournisseurs) } : d)))
          }
        />
        <PdlDraftRows
          siteImpose
          drafts={drafts}
          onChange={patchDraft}
          onRemove={(key) => setDrafts((prev) => prev.filter((d) => d.key !== key))}
          onAdd={() => setDrafts((prev) => [...prev, emptyPdlDraft()])}
          energies={energies}
          utilisationsRef={utilisationsRef}
          fournisseurs={fournisseurs}
          contacts={contactsDuCompte}
          allContacts={contacts ?? []}
          compteId={compteId}
          compteNom={compteDuSite?.nom ?? siteNom}
          compteSegment={compteDuSite?.segment}
          existingCompteurs={compteurs ?? []}
        />
        {draftsIncomplets && (
          <p className="flex items-center gap-1.5 text-xs text-amber-700">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
            Complète les champs marqués d'une astérisque : ils alimentent l'éligibilité fournisseur lors de la cotation.
          </p>
        )}
        <div className="flex justify-end gap-2 border-t border-km-line pt-3">
          <Button type="button" variant="ghost" onClick={() => { reset(); onClose() }}>Fermer</Button>
          <Button type="submit" disabled={submitting || draftsIncomplets || drafts.every((d) => d.status === 'saved')}>
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

function HealthCard({ health, donutColor }: { health: ReturnType<typeof computeSiteHealth>; donutColor: string }) {
  return (
    <div className="grid grid-cols-1 overflow-hidden rounded-xl border border-km-line bg-white sm:grid-cols-[220px_1fr]">
      <div className="flex flex-col items-center justify-center gap-2 border-b border-navy-50 bg-km-bg/60 p-4 sm:border-b-0 sm:border-r">
        <div
          className="relative flex h-[74px] w-[74px] items-center justify-center rounded-full"
          style={{ background: `conic-gradient(${donutColor} 0 ${health.score}%, #eceae6 ${health.score}% 100%)` }}
        >
          <div className="flex h-14 w-14 flex-col items-center justify-center rounded-full bg-white">
            <span className="text-xl font-bold leading-none text-km-text">{health.score}</span>
            <span className="text-km-micro font-bold text-km-faint">/ 100</span>
          </div>
        </div>
        <div className="text-center">
          <p className="text-xs font-bold text-km-text">Santé du site</p>
          <p className="text-km-label font-semibold" style={{ color: donutColor }}>{health.label}</p>
        </div>
      </div>
      <div className="p-3.5">
        <p className="mb-2 text-km-xs font-bold uppercase tracking-wide text-km-faint">Détail du calcul</p>
        <div className="flex flex-col">
          {health.raisons.map((r) => (
            <div key={r} className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 hover:bg-km-bg">
              <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: donutColor }} />
              <span className="flex-1 text-km-label font-medium text-km-text">{r}</span>
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
    <div className="rounded-xl border border-km-line bg-white p-3.5">
      <div className="mb-2 flex items-center gap-1.5">
        <span className="flex h-5 w-5 items-center justify-center rounded-md bg-sky-100 text-sky-500">
          <Building2 className="h-2.5 w-2.5" />
        </span>
        <span className="text-km-xs font-bold uppercase tracking-wide text-km-faint">Compte</span>
        <div className="flex-1" />
        <EntityLink to={`/comptes/${compteId}`}>ouvrir →</EntityLink>
      </div>
      <p className="text-km-body font-bold text-sky-500">{compte?.nom ?? compteNom}</p>
      <div className="mt-2 flex flex-col gap-1.5 text-km-label">
        <div className="flex items-center justify-between">
          <span className="text-km-muted">Type</span>
          <span className="font-semibold text-km-text">{compte?.type_compte ?? '—'}</span>
        </div>
        {compte?.score_ellipro && (
          <div className="flex items-center justify-between">
            <span className="text-km-muted">Note Ellisphere</span>
            <span className="rounded bg-kiwi-50 px-1.5 py-0.5 text-km-label font-extrabold text-km-green">{compte.score_ellipro}</span>
          </div>
        )}
        {compte?.siren && (
          <div className="flex items-center justify-between">
            <span className="text-km-muted">SIREN</span>
            <button type="button" onClick={() => copyToClipboard(compte.siren ?? '', onCopy)} className="font-mono text-km-xs font-semibold hover:text-sky-500">
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
    <div className="rounded-xl border border-km-line bg-white p-3.5">
      <div className="mb-2.5 flex items-center gap-1.5">
        <span className="flex h-5 w-5 items-center justify-center rounded-md bg-violet-100 text-violet-500">
          <Users className="h-2.5 w-2.5" />
        </span>
        <span className="text-km-xs font-bold uppercase tracking-wide text-km-faint">Contacts</span>
      </div>
      {list.length === 0 && <p className="text-xs text-km-faint">Aucun contact rattaché à ce site.</p>}
      <div className="flex flex-col gap-3">
        {list.map((c) => {
          const initiales = `${c.prenom[0] ?? ''}${c.nom[0] ?? ''}`.toUpperCase()
          return (
            <div key={c.id}>
              <div className="flex items-center gap-2.5">
                <div className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-full border-[1.5px] border-violet-200 bg-violet-50 text-km-xs font-bold text-violet-600">
                  {initiales}
                </div>
                <div className="min-w-0 flex-1">
                  <button type="button" onClick={() => navigate(`/contacts/${c.id}`)} className="truncate text-left text-km-body font-bold text-km-text hover:text-violet-600">
                    {c.prenom} {c.nom}
                  </button>
                  <p className="truncate text-km-xs text-km-faint">{c.fonction || '—'}</p>
                  {/* LE NUMÉRO S'AFFICHE, ET CE N'EST PAS COSMÉTIQUE. L'extension Allo décore les
                      numéros qu'elle VOIT : derrière une icône, elle n'a rien à détecter et son
                      bouton d'appel n'apparaît jamais. */}
                  {c.telephone && (
                    <p className="truncate font-mono text-km-xs text-km-muted">{numeroLisible(c.telephone)}</p>
                  )}
                </div>
                {c.telephone && (
                  <button
                    type="button"
                    onClick={() => void appelerNumero(c.telephone)}
                    title="Appeler"
                    className="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-md border border-kiwi-100 bg-kiwi-50 text-km-green"
                  >
                    <Phone className="h-3 w-3" />
                  </button>
                )}
              </div>
              <div className="ml-[39px] mt-1.5 flex flex-col gap-1 text-km-label">
                {c.email && <EmailLink value={c.email} className="text-km-muted" />}
                {c.telephone && <PhoneLink value={c.telephone} className="text-km-xs text-km-muted" />}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
