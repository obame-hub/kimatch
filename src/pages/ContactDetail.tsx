import { useEffect, useMemo, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Star, Trash2, Building2, FileCheck2, FileText, Sparkle } from 'lucide-react'
import { Topbar } from '@/components/layout/Topbar'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { EntityLink } from '@/components/ui/entity-link'
import { HubCreation } from '@/components/compte/HubCreation'
import { InlineField } from '@/components/ui/inline-field'
import { RattachementsContact } from '@/components/contact/RattachementsContact'
import { PhoneLink, EmailLink } from '@/components/ui/contact-link'
import { Dialog } from '@/components/ui/dialog'
import { FormField, Input, Select, Textarea } from '@/components/ui/form'
import { HistoriqueDiscret } from '@/components/ui/historique-discret'
import { ActivityFeed } from '@/components/site/ActivityFeed'
import { useContact, useUpdateContact, useDeleteContact, useUpdateContactField } from '@/lib/data/contacts'
import { useComptes } from '@/lib/data/comptes'
import { useSites } from '@/lib/data/sites'
import { useCompteurs } from '@/lib/data/compteurs'
import { useActions } from '@/lib/data/actions'
import { useInteractionsForContact } from '@/lib/data/interactions'
import { useContrats } from '@/lib/data/contrats'
import { useMandats } from '@/lib/data/mandats'
import { useRecommandationsListe } from '@/lib/data/recommandations'
import { useCanManageEnregistrement, useIsAdmin, useProfilsAdmin } from '@/lib/data/roles'
import { useSuppression } from '@/lib/useSuppression'
import { useGoBack } from '@/lib/useGoBack'
import { useDocumentsParEntites } from '@/lib/data/documents'
import { useRaccourcisOnglets } from '@/lib/useRaccourcisOnglets'
import { useReferenceTable } from '@/lib/data/referenceTables'
import { formatPhoneFR } from '@/lib/textFormat'
import { contactRoleOptions } from '@/lib/contactRoles'
import {
  STATUT_MANDAT_TONE,
  FALLBACK_STATUTS_MANDATS,
  ETAPE_TONE,
  FALLBACK_ETAPES_RECOMMANDATION,
  FALLBACK_STATUTS_VERSIONS,
} from '@/lib/referenceFallbacks'
import { cn } from '@/lib/utils'
import type { Contact } from '@/types/domain'

const CIVILITE_OPTIONS = ['M.', 'Mme', 'Autre']

type TabKey = 'contact' | 'rattachements' | 'contrats' | 'mandats' | 'recommandations' | 'documents'

export default function ContactDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  // Perimetre de la fiche, lu cote serveur : ces lectures parcouraient le CRM entier pour en
  // garder une ligne ou quelques-unes (meme correctif que les fiches compte et site).
  const { data: contact } = useContact(id)
  // Pieces rattachees a CE contact, lues a son perimetre : `useDocumentsParEntites` filtre
  // cote serveur sur l'identifiant, il ne charge pas la table entiere.
  const idsPourDocuments = useMemo(() => (id ? [id] : undefined), [id])
  const { data: documentsDuContact = [] } = useDocumentsParEntites(idsPourDocuments)
  const { data: comptes } = useComptes()
  const { data: sites } = useSites()
  const { data: compteurs } = useCompteurs()
  const { data: actions } = useActions()
  const { data: contrats } = useContrats()
  const { data: mandats } = useMandats()
  const { data: recommandations } = useRecommandationsListe()
  const { data: statutsMandatsRef } = useReferenceTable('statuts_mandats')
  const statutsMandats = statutsMandatsRef && statutsMandatsRef.length > 0 ? statutsMandatsRef : FALLBACK_STATUTS_MANDATS
  const { data: etapesRef } = useReferenceTable('etapes_recommandation')
  const etapes = etapesRef && etapesRef.length > 0 ? etapesRef : FALLBACK_ETAPES_RECOMMANDATION
  const { data: statutsVersionsRef } = useReferenceTable('statuts_versions_recommandation')
  const statutsVersions = statutsVersionsRef && statutsVersionsRef.length > 0 ? statutsVersionsRef : FALLBACK_STATUTS_VERSIONS

  const compte = comptes?.find((c) => c.id === contact?.compte_id)
  const deleteContact = useDeleteContact()
  const goBack = useGoBack('/contacts')

  // Voir useCanManageEnregistrement : les contacts sans propriétaire — 3378 sur 3380 — étaient
  // réservés aux administrateurs, ce que William a demandé d'ouvrir le 13/08/2026.
  const canManage = useCanManageEnregistrement(contact?.proprietaire_id)
  const [tab, setTab] = useState<TabKey>('contact')
  const [editOpen, setEditOpen] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [toast, setToast] = useState<string | null>(null)

  const majContact = useUpdateContactField()

  function majChamp(patch: Parameters<typeof majContact.mutateAsync>[0]['patch']) {
    if (!contact) return Promise.resolve()
    return majContact.mutateAsync({ id: contact.id, patch })
  }

  function showToast(message: string) {
    setToast(message)
    window.setTimeout(() => setToast(null), 2600)
  }

  const siteIdsDuContact = useMemo(() => new Set((contact?.sites ?? []).map((s) => s.id)), [contact])
  const tachesDuContact = useMemo(() => (actions ?? []).filter((a) => a.contact_id === id), [actions, id])
  // Fiche contact : on ne charge que les interactions de ce contact (pas la table entiere).
  const { data: interactionsDuContact = [] } = useInteractionsForContact(id)
  // Signataire = source de verite (releve QA William sur Kelly Patchez, 31/07/2026) --
  // avant, on affichait tous les contrats des sites rattaches, pas ceux vraiment signes par ce contact.
  const contratsSignataire = useMemo(() => (contrats ?? []).filter((ct) => ct.contact_signataire_id === id), [contrats, id])
  const contratsDuSite = useMemo(
    () => (contrats ?? []).filter((ct) => siteIdsDuContact.has(ct.site_id ?? '') && ct.contact_signataire_id !== id),
    [contrats, siteIdsDuContact, id],
  )
  const contratsDuContact = useMemo(() => [...contratsSignataire, ...contratsDuSite], [contratsSignataire, contratsDuSite])
  const mandatsSignataire = useMemo(() => (mandats ?? []).filter((m) => m.contact_signataire_id === id), [mandats, id])
  const mandatsDuCompte = useMemo(
    () => (mandats ?? []).filter((m) => m.compte_id === contact?.compte_id && m.contact_signataire_id !== id),
    [mandats, contact?.compte_id, id],
  )
  const recommandationsSignataire = useMemo(() => (recommandations ?? []).filter((r) => r.contact_signataire_id === id), [recommandations, id])
  const recommandationsAutresDuCompte = useMemo(
    () => (recommandations ?? []).filter((r) => r.compte_id === contact?.compte_id && r.contact_signataire_id !== id),
    [recommandations, contact?.compte_id, id],
  )
  const recommandationsDuCompte = useMemo(() => [...recommandationsSignataire, ...recommandationsAutresDuCompte], [recommandationsSignataire, recommandationsAutresDuCompte])
  const estSignataire = mandatsSignataire.length > 0 || contratsSignataire.length > 0 || recommandationsSignataire.length > 0

  const suppression = useSuppression()

  function handleDelete() {
    if (!contact) return
    suppression.supprimer(
      () => deleteContact.mutateAsync(contact.id),
      () => navigate('/contacts'),
    )
  }

  const TABS: { key: TabKey; label: string; badge?: string }[] = [
    { key: 'contact', label: 'Contact' },
    { key: 'rattachements', label: 'Rattachements', badge: contact?.sites.length ? String(contact.sites.length) : undefined },
    { key: 'contrats', label: 'Contrats', badge: contratsDuContact.length ? String(contratsDuContact.length) : undefined },
    { key: 'mandats', label: 'Mandats', badge: (mandatsSignataire.length + mandatsDuCompte.length) ? String(mandatsSignataire.length + mandatsDuCompte.length) : undefined },
    { key: 'recommandations', label: 'Recommandations', badge: recommandationsDuCompte.length ? String(recommandationsDuCompte.length) : undefined },
    // Sixieme onglet de la maquette. Il manquait : les pieces rattachees a un contact (piece
    // d'identite du signataire, pouvoir, courrier) n'etaient visibles nulle part depuis sa fiche.
    { key: 'documents', label: 'Documents', badge: documentsDuContact.length ? String(documentsDuContact.length) : undefined },
  ]

  // « 1–5 pour naviguer » : le raccourci annonce par la maquette dans la barre d'onglets.
  const clesOnglets = TABS.map((t) => t.key)
  useRaccourcisOnglets(clesOnglets, setTab)

  if (!contact && id) {
    return (
      <div>
        <Topbar crumb="Contacts" title="Contact" />
        <div className="p-4 sm:p-6"><p className="text-sm text-km-faint">Chargement…</p></div>
      </div>
    )
  }

  if (!contact) {
    return (
      <div>
        <Topbar crumb="Contacts" title="Contact" />
        <div className="p-4 sm:p-6">
          <Button variant="ghost" size="sm" className="mb-4" onClick={goBack}>
            <ArrowLeft className="h-4 w-4" />
            Retour aux contacts
          </Button>
          <p className="text-sm text-km-muted">Contact introuvable.</p>
        </div>
      </div>
    )
  }

  const initiales = `${contact.prenom[0] ?? ''}${contact.nom[0] ?? ''}`.toUpperCase()
  const dernierEchange = interactionsDuContact
    .slice()
    .sort((a, b) => new Date(b.date_interaction).getTime() - new Date(a.date_interaction).getTime())[0]

  return (
    <div>
      <Topbar crumb="Contacts" title={`${contact.prenom} ${contact.nom}`} />

      {/* Bandeau contact */}
      <div className="flex flex-wrap items-center gap-3.5 border-b border-km-line bg-white px-4 py-3.5 sm:px-6">
        <Button variant="ghost" size="icon" onClick={goBack} title="Retour aux contacts">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-violet-500 to-violet-400 text-sm font-bold text-white">
          {initiales}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="truncate text-xl font-bold tracking-tight text-km-text">{contact.civilite ? `${contact.civilite} ` : ''}{contact.prenom} {contact.nom}</p>
            {contact.contact_principal && <Badge tone="amber"><Star className="h-3 w-3" /> Contact principal</Badge>}
            {estSignataire && (
              <span className="inline-flex items-center gap-1 rounded-full bg-km-amber-soft px-2.5 py-0.5 text-[10px] font-bold text-amber-700">
                <FileCheck2 className="h-3 w-3" /> SIGNATAIRE
              </span>
            )}
          </div>
          <p className="truncate text-xs text-km-muted">
            {contact.fonction || '—'} · <EntityLink to={`/comptes/${contact.compte_id}`}>{contact.compte_nom}</EntityLink>
          </p>
          <p className="truncate text-[10.5px] text-km-faint">
            {contact.date_creation && <>Créé le {new Date(contact.date_creation).toLocaleDateString('fr-FR')} · </>}
            Propriétaire : {contact.proprietaire_nom || 'Aucun'}
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          {/* Le hub de création, comme sur la fiche compte : « il faut également le mettre sur les
              autres objets, parce que c'est un bouton que de n'importe où je peux venir faire
              quelque chose » (William, 13/08/2026). */}
          <HubCreation
            onAction={(cle) => {
              if (cle === 'compte') navigate('/comptes', { state: { openCreate: true } })
              if (cle === 'site') navigate('/sites', { state: { openCreateForCompteId: contact.compte_id } })
              if (cle === 'contact') navigate('/contacts', { state: { openCreateForCompteId: contact.compte_id } })
              if (cle === 'compteur') navigate(`/comptes/${contact.compte_id}`)
              if (cle === 'mandat') navigate(`/comptes/${contact.compte_id}`)
              if (cle === 'recommandation') navigate(`/comptes/${contact.compte_id}`)
            }}
          />
          {canManage && (
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              title="Supprimer ce contact"
              className="inline-flex cursor-pointer items-center gap-1.5 rounded-[9px] border border-[#e0dfdb] bg-white px-3 py-2 text-[11.5px] font-semibold text-[#5c5f66] transition-all duration-[140ms] hover:border-[#f0c8bd] hover:bg-[#fbeae5] hover:text-[#c2452d]"
            >
              <Trash2 className="h-3 w-3" /> Supprimer
            </button>
          )}
        </div>
      </div>

      {/* Onglets */}
      <div className="flex gap-1.5 overflow-x-auto border-b border-km-line bg-white px-4 pt-2.5 lg:gap-0.5 lg:pt-0 sm:px-6">
        {TABS.map((t) => {
          const isActive = tab === t.key
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={cn(
                'mb-2.5 inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 py-2 text-[12.5px] font-semibold transition-colors lg:mb-0 lg:rounded-none lg:border-b-2 lg:px-3 lg:py-2.5 lg:font-normal',
                isActive
                  ? 'bg-ink-800 text-white lg:border-navy-800 lg:bg-transparent lg:font-semibold lg:text-km-text'
                  : 'border border-km-line bg-white text-km-muted hover:bg-km-bg lg:border-0 lg:border-b-2 lg:border-transparent lg:text-km-muted lg:hover:bg-transparent lg:hover:text-km-text',
              )}
            >
              {t.label}
              {t.badge && (
                <span className={cn('rounded px-1.5 py-0.5 text-[9.5px] font-bold', isActive ? 'bg-white/20 text-white lg:bg-km-soft lg:text-km-muted' : 'bg-km-soft text-km-muted')}>
                  {t.badge}
                </span>
              )}
            </button>
          )
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr_304px]">
        {/* Colonne gauche — Compte (desktop uniquement) */}
        <div className="hidden flex-col gap-3.5 border-r border-km-line bg-km-bg/60 p-3.5 lg:flex">
          {compte && (
            <div className="rounded-xl border border-km-line bg-white p-3.5">
              <div className="mb-2 flex items-center gap-1.5">
                <span className="flex h-5 w-5 items-center justify-center rounded-md bg-sky-100 text-sky-500">
                  <Building2 className="h-2.5 w-2.5" />
                </span>
                <span className="text-[10px] font-bold uppercase tracking-wide text-km-faint">Compte</span>
                <div className="flex-1" />
                <EntityLink to={`/comptes/${compte.id}`}>ouvrir →</EntityLink>
              </div>
              <p className="text-[13px] font-bold text-sky-500">{compte.nom}</p>
              <p className="mt-1 text-[11px] text-km-muted">{compte.segment} · {compte.nb_sites} site{compte.nb_sites > 1 ? 's' : ''}</p>
            </div>
          )}

          <div className="rounded-xl border border-km-line bg-white p-3.5">
            <div className="mb-2.5 flex items-center gap-1.5">
              <span className="text-[10px] font-bold uppercase tracking-wide text-km-faint">Nos échanges</span>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold tracking-tight text-km-text">{interactionsDuContact.length}</span>
              <span className="text-[10.5px] text-km-muted">
                échange{interactionsDuContact.length > 1 ? 's' : ''}
                {dernierEchange && (
                  <>
                    <br />dernier : <span className="font-semibold text-km-green">{new Date(dernierEchange.date_interaction).toLocaleDateString('fr-FR')}</span>
                  </>
                )}
              </span>
            </div>
          </div>
        </div>

        {/* Centre */}
        <div className="bg-km-bg p-4 sm:p-5">
          {tab === 'contact' && (
            <div className="flex flex-col gap-3.5">
              <div className="rounded-xl border border-km-line bg-white p-4">
                <p className="mb-2.5 text-[10px] font-bold uppercase tracking-wide text-km-faint">Coordonnées</p>
                {/* Édition au clic sur la valeur, et non par un bouton « Modifier » : « c'était pas
                    d'appuyer sur le bouton, c'était d'appuyer sur le champ » (William, 13/08/2026).
                    Les liens tel: et mailto: restent affichés à côté, sinon on perdrait l'appel en
                    un clic en rendant le champ éditable. */}
                {canManage ? (
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <InlineField
                      variant="select"
                      label="Rôle"
                      value={contact.role ?? ''}
                      options={[
                        { value: '', label: '—' },
                        { value: 'Décisionnaire', label: 'Décisionnaire' },
                        { value: 'Administratif', label: 'Administratif' },
                        { value: 'Conseil syndical', label: 'Conseil syndical' },
                      ]}
                      onCommit={(v) => majChamp({ role: v || null })}
                      onSaved={() => showToast('✓ enregistré')}
                      onError={(err) => showToast(`Erreur : ${err.message}`)}
                    />
                    <InlineField
                      variant="text"
                      label="Fonction"
                      value={contact.fonction ?? ''}
                      emptyLabel="ajouter"
                      onCommit={(v) => majChamp({ fonction: v || null })}
                      onSaved={() => showToast('✓ enregistré')}
                      onError={(err) => showToast(`Erreur : ${err.message}`)}
                    />
                    <div>
                      <InlineField
                        variant="text"
                        label="Téléphone"
                        value={contact.telephone ?? ''}
                        emptyLabel="ajouter"
                        mono
                        onCommit={(v) => majChamp({ telephone: v || null })}
                        onSaved={() => showToast('✓ enregistré')}
                        onError={(err) => showToast(`Erreur : ${err.message}`)}
                      />
                      {contact.telephone && <PhoneLink value={contact.telephone} />}
                    </div>
                    <div>
                      <InlineField
                        variant="text"
                        label="Mobile"
                        value={contact.telephone_mobile ?? ''}
                        emptyLabel="ajouter"
                        mono
                        onCommit={(v) => majChamp({ telephone_mobile: v || null })}
                        onSaved={() => showToast('✓ enregistré')}
                        onError={(err) => showToast(`Erreur : ${err.message}`)}
                      />
                      {contact.telephone_mobile && <PhoneLink value={contact.telephone_mobile} />}
                    </div>
                    <div>
                      <InlineField
                        variant="text"
                        label="Email"
                        value={contact.email ?? ''}
                        emptyLabel="ajouter"
                        onCommit={(v) => majChamp({ email: v || null })}
                        onSaved={() => showToast('✓ enregistré')}
                        onError={(err) => showToast(`Erreur : ${err.message}`)}
                      />
                      {contact.email && <EmailLink value={contact.email} />}
                    </div>
                  </div>
                ) : (
                <div className="space-y-2 text-sm">
                  {contact.role && <p><span className="text-km-faint">Rôle :</span> <Badge tone={contact.role === 'Décisionnaire' ? 'kiwi' : 'neutral'}>{contact.role}</Badge></p>}
                  <p><span className="text-km-faint">Téléphone :</span> {contact.telephone ? <PhoneLink value={contact.telephone} /> : '—'}</p>
                  <p><span className="text-km-faint">Mobile :</span> {contact.telephone_mobile ? <PhoneLink value={contact.telephone_mobile} /> : '—'}</p>
                  <p><span className="text-km-faint">Email :</span> {contact.email ? <EmailLink value={contact.email} /> : '—'}</p>
                  <p><span className="text-km-faint">Statut :</span> <Badge tone={contact.actif ? 'kiwi' : 'neutral'}>{contact.actif ? 'actif' : 'inactif'}</Badge></p>
                </div>
                )}

                {/* Champs annexes, en lecture dans les deux cas : ils sortent du formulaire de
                    création et se modifient rarement. */}
                <div className="mt-3 space-y-2 text-sm">
                  {contact.linkedin_url && (
                    <p><span className="text-km-faint">LinkedIn :</span> <a href={contact.linkedin_url} target="_blank" rel="noreferrer" className="text-sky-600 hover:underline">{contact.linkedin_url}</a></p>
                  )}
                  {contact.canal_communication && <p><span className="text-km-faint">Canal préféré :</span> {contact.canal_communication}</p>}
                  {contact.disponibilites && <p><span className="text-km-faint">Disponibilités :</span> {contact.disponibilites}</p>}
                  {canManage && <p><span className="text-km-faint">Statut :</span> <Badge tone={contact.actif ? 'kiwi' : 'neutral'}>{contact.actif ? 'actif' : 'inactif'}</Badge></p>}
                </div>
                <HistoriqueDiscret tableNom="contacts" ligneId={contact.id} />
              </div>
            </div>
          )}

          {tab === 'rattachements' && (
            <RattachementsContact
              contact={contact}
              comptes={comptes ?? []}
              sites={sites ?? []}
              compteurs={compteurs ?? []}
              peutModifier={canManage}
              onToast={showToast}
            />
          )}

          {tab === 'contrats' && (
            <div className="flex flex-col gap-2.5">
              {contratsDuContact.length === 0 && <p className="text-sm text-km-faint">Aucun contrat signé par ce contact ou sur ses sites rattachés.</p>}
              {contratsDuContact.map((ct) => (
                <div
                  key={ct.id}
                  onClick={() => navigate(`/contrats/${ct.id}`)}
                  className="flex cursor-pointer items-center gap-3 rounded-xl border border-km-line bg-white p-3.5 hover:bg-km-bg/60"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold text-km-text">{ct.fournisseur_nom}</p>
                    <p className="truncate text-[10.5px] text-km-faint">{ct.site_nom}</p>
                  </div>
                </div>
              ))}
            </div>
          )}

          {tab === 'mandats' && (
            <div className="flex flex-col gap-2.5">
              {mandatsSignataire.length === 0 && mandatsDuCompte.length === 0 && <p className="text-sm text-km-faint">Aucun mandat pour ce contact.</p>}
              {[...mandatsSignataire, ...mandatsDuCompte].map((m) => (
                <div
                  key={m.id}
                  onClick={() => navigate(`/mandats/${m.id}`)}
                  className="flex cursor-pointer items-center gap-3 rounded-xl border border-km-line bg-white p-3.5 hover:bg-km-bg/60"
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-km-amber-soft text-amber-600">
                    <FileCheck2 className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold text-km-text">
                      {m.nb_sites_couverts} site{m.nb_sites_couverts > 1 ? 's' : ''} couvert{m.nb_sites_couverts > 1 ? 's' : ''}
                    </p>
                    <p className="truncate text-[10.5px] text-km-faint">{m.contact_signataire_id === id ? 'Signataire de ce mandat' : m.contact_signataire_nom ?? '—'}</p>
                  </div>
                  <Badge tone={STATUT_MANDAT_TONE[m.statut] ?? 'neutral'}>{statutsMandats.find((s) => s.code === m.statut)?.libelle ?? m.statut}</Badge>
                </div>
              ))}
            </div>
          )}

          {tab === 'recommandations' && (
            <div className="flex flex-col gap-2.5">
              {recommandationsDuCompte.length === 0 && <p className="text-sm text-km-faint">Aucune recommandation pour ce compte.</p>}
              {recommandationsDuCompte.map((r) => {
                // versions[0] est la plus récente : la liste est triée décroissant depuis le 12/08/2026.
                const derniereVersion = r.versions[0]
                return (
                  <div
                    key={r.id}
                    onClick={() => navigate(`/recommandations/${r.id}`)}
                    className="cursor-pointer rounded-xl border border-km-line bg-white p-3.5 hover:bg-km-bg/60"
                  >
                    <div className="flex items-center gap-2">
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-km-amber-soft text-amber-600">
                        <Sparkle className="h-3.5 w-3.5" />
                      </span>
                      <p className="flex-1 truncate text-sm font-bold text-km-text">{r.titre}</p>
                      <Badge tone={ETAPE_TONE[r.etape] ?? 'amber'}>{etapes.find((e) => e.code === r.etape)?.libelle ?? r.etape}</Badge>
                    </div>
                    {derniereVersion && (
                      <p className="ml-9 mt-1.5 text-[11px] text-km-faint">
                        {derniereVersion.nom || 'Version'} · {statutsVersions.find((s) => s.code === derniereVersion.statut)?.libelle ?? derniereVersion.statut}
                      </p>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          {tab === 'documents' && (
            <div className="flex flex-col gap-2.5">
              {documentsDuContact.length === 0 && (
                <p className="text-sm text-km-faint">Aucun document rattaché à ce contact.</p>
              )}
              {documentsDuContact.map((d) => (
                <div
                  key={d.id}
                  onClick={() => navigate(`/documents/${d.id}`)}
                  className="cursor-pointer rounded-xl border border-km-line bg-white p-3.5 hover:bg-km-bg/60"
                >
                  <div className="flex items-center gap-2">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-km-soft text-km-muted">
                      <FileText className="h-3.5 w-3.5" />
                    </span>
                    <p className="flex-1 truncate text-sm font-bold text-km-text">{d.nom}</p>
                    {d.type_document && <Badge tone="neutral">{d.type_document}</Badge>}
                  </div>
                  <p className="ml-9 mt-1.5 text-[11px] text-km-faint">
                    {d.auteur ? `${d.auteur} · ` : ''}
                    {new Date(d.date_creation).toLocaleDateString('fr-FR')}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Colonne droite — Activité persistante (desktop uniquement) */}
        <div className="hidden flex-col border-l border-km-line bg-white lg:flex">
          <div className="flex items-center gap-2 px-3.5 py-3">
            <span className="text-[10px] font-bold uppercase tracking-wide text-km-faint">Activité</span>
          </div>
          <div className="min-h-0 flex-1 overflow-hidden px-3.5 pb-3.5">
            <ActivityFeed
              compteId={contact.compte_id}
              compteNom={contact.compte_nom}
              signaux={[]}
              interactions={interactionsDuContact}
              actions={tachesDuContact}
              documents={[]}
            />
          </div>
        </div>
      </div>

      {editOpen && <EditContactDialog open={editOpen} onClose={() => setEditOpen(false)} contact={contact} compteSegment={compte?.segment ?? null} />}

      <Dialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title="Supprimer ce contact ?"
        description="Cette action est irréversible."
      >
        {suppression.erreur && (
          <p className="rounded-lg border border-red-200 bg-km-red-soft px-3 py-2 text-xs text-red-700">{suppression.erreur}</p>
        )}
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="ghost" onClick={() => { suppression.reinitialiser(); setConfirmDelete(false) }}>Annuler</Button>
          <Button type="button" variant="outline" className="border-red-200 text-km-red hover:bg-km-red-soft" disabled={suppression.enCours} onClick={handleDelete}>
                {suppression.enCours ? 'Suppression…' : 'Supprimer définitivement'}
              </Button>
        </div>
      </Dialog>
      {toast && (
        <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 whitespace-nowrap rounded-lg bg-ink-800 px-4 py-2.5 text-xs font-semibold text-white shadow-lg">
          {toast}
        </div>
      )}
    </div>
  )
}

function EditContactDialog({ open, onClose, contact, compteSegment }: { open: boolean; onClose: () => void; contact: Contact; compteSegment: string | null }) {
  const updateContact = useUpdateContact()
  const isAdmin = useIsAdmin()
  const { data: profilsAdmin } = useProfilsAdmin()

  const [civilite, setCivilite] = useState(contact.civilite ?? '')
  const [prenom, setPrenom] = useState(contact.prenom)
  const [nom, setNom] = useState(contact.nom)
  const [fonction, setFonction] = useState(contact.fonction ?? '')
  const [telephone, setTelephone] = useState(contact.telephone ?? '')
  const [telephoneMobile, setTelephoneMobile] = useState(contact.telephone_mobile ?? '')
  const [email, setEmail] = useState(contact.email ?? '')
  const [role, setRole] = useState(contact.role ?? '')
  const roleOptions = contactRoleOptions(compteSegment)
  const [actif, setActif] = useState(contact.actif)
  const [proprietaireId, setProprietaireId] = useState(contact.proprietaire_id ?? '')
  const [linkedinUrl, setLinkedinUrl] = useState(contact.linkedin_url ?? '')
  const [disponibilites, setDisponibilites] = useState(contact.disponibilites ?? '')
  const [typeCanalId, setTypeCanalId] = useState(contact.type_canal_communication_id ?? '')
  const { data: canauxRef } = useReferenceTable('types_canaux_communication')
  const [feedback, setFeedback] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setCivilite(contact.civilite ?? '')
    setPrenom(contact.prenom)
    setNom(contact.nom)
    setFonction(contact.fonction ?? '')
    setTelephone(contact.telephone ?? '')
    setTelephoneMobile(contact.telephone_mobile ?? '')
    setEmail(contact.email ?? '')
    setRole(contact.role ?? '')
    setActif(contact.actif)
    setProprietaireId(contact.proprietaire_id ?? '')
    setLinkedinUrl(contact.linkedin_url ?? '')
    setDisponibilites(contact.disponibilites ?? '')
    setTypeCanalId(contact.type_canal_communication_id ?? '')
    setFeedback(null)
  }, [open, contact])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    try {
      await updateContact.mutateAsync({
        id: contact.id,
        civilite: civilite || null,
        prenom,
        nom,
        fonction: fonction || null,
        telephone: telephone || null,
        telephone_mobile: telephoneMobile || null,
        email: email || null,
        role: role || null,
        contact_principal: role === 'Décisionnaire',
        actif,
        proprietaire_id: proprietaireId || null,
        linkedin_url: linkedinUrl || null,
        disponibilites: disponibilites || null,
        type_canal_communication_id: typeCanalId || null,
      })
      onClose()
    } catch (err) {
      setFeedback(err instanceof Error ? err.message : 'Erreur inconnue')
    }
  }

  return (
    <Dialog open={open} onClose={onClose} title="Modifier le contact" description="Mettre à jour les informations du contact.">
      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="grid grid-cols-3 gap-3">
          <FormField label="Civilité">
            <Select value={civilite} onChange={(e) => setCivilite(e.target.value)}>
              <option value="">—</option>
              {CIVILITE_OPTIONS.map((c) => <option key={c} value={c}>{c}</option>)}
            </Select>
          </FormField>
          <FormField label="Prénom">
            <Input value={prenom} onChange={(e) => setPrenom(e.target.value)} required />
          </FormField>
          <FormField label="Nom">
            <Input value={nom} onChange={(e) => setNom(e.target.value)} required />
          </FormField>
        </div>
        <FormField label="Fonction">
          <Input value={fonction} onChange={(e) => setFonction(e.target.value)} placeholder="Ex. Directeur technique" />
        </FormField>
        <FormField label="Rôle">
          <Select value={role} onChange={(e) => setRole(e.target.value)}>
            <option value="">—</option>
            {roleOptions.map((r) => <option key={r} value={r}>{r}</option>)}
          </Select>
        </FormField>
        <div className="grid grid-cols-2 gap-3">
          <FormField label="Téléphone fixe">
            <Input value={telephone} onChange={(e) => setTelephone(e.target.value)} onBlur={(e) => setTelephone(e.target.value ? formatPhoneFR(e.target.value) : '')} />
          </FormField>
          <FormField label="Mobile">
            <Input value={telephoneMobile} onChange={(e) => setTelephoneMobile(e.target.value)} onBlur={(e) => setTelephoneMobile(e.target.value ? formatPhoneFR(e.target.value) : '')} />
          </FormField>
        </div>
        <FormField label="Email">
          <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </FormField>
        <div className="grid grid-cols-2 gap-3">
          <FormField label="LinkedIn">
            <Input value={linkedinUrl} onChange={(e) => setLinkedinUrl(e.target.value)} placeholder="https://linkedin.com/in/…" />
          </FormField>
          <FormField label="Canal de communication préféré">
            <Select value={typeCanalId} onChange={(e) => setTypeCanalId(e.target.value)}>
              <option value="">—</option>
              {canauxRef?.map((c) => <option key={c.id} value={c.id}>{c.libelle}</option>)}
            </Select>
          </FormField>
        </div>
        <FormField label="Disponibilités">
          <Textarea rows={2} value={disponibilites} onChange={(e) => setDisponibilites(e.target.value)} placeholder="Ex. Disponible en matinée, à privilégier le mardi/jeudi…" />
        </FormField>
        <label className="flex items-center gap-2 text-sm text-km-text">
          <input type="checkbox" checked={actif} onChange={(e) => setActif(e.target.checked)} />
          Actif
        </label>
        {isAdmin && (
          <FormField label="Propriétaire">
            <Select value={proprietaireId} onChange={(e) => setProprietaireId(e.target.value)}>
              <option value="">Aucun</option>
              {profilsAdmin?.map((p) => <option key={p.id} value={p.id}>{p.prenom} {p.nom}</option>)}
            </Select>
          </FormField>
        )}
        {feedback && <p className="text-xs text-km-red">{feedback}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="ghost" onClick={onClose}>Annuler</Button>
          <Button type="submit" disabled={updateContact.isPending}>Enregistrer</Button>
        </div>
      </form>
    </Dialog>
  )
}
