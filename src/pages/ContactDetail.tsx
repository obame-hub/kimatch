import { useEffect, useMemo, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Star, Pencil, Trash2, Building2, FileCheck2, Sparkle, MapPin } from 'lucide-react'
import { Topbar } from '@/components/layout/Topbar'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { EntityLink } from '@/components/ui/entity-link'
import { PhoneLink, EmailLink } from '@/components/ui/contact-link'
import { Dialog } from '@/components/ui/dialog'
import { FormField, Input, Select } from '@/components/ui/form'
import { HistoriqueDiscret } from '@/components/ui/historique-discret'
import { ActivityFeed } from '@/components/site/ActivityFeed'
import { useContacts, useUpdateContact, useDeleteContact } from '@/lib/data/contacts'
import { useComptes } from '@/lib/data/comptes'
import { useActions } from '@/lib/data/actions'
import { useInteractions } from '@/lib/data/interactions'
import { useContrats } from '@/lib/data/contrats'
import { useMandats } from '@/lib/data/mandats'
import { useRecommandations } from '@/lib/data/recommandations'
import { useCanManage, useIsAdmin, useProfilsAdmin } from '@/lib/data/roles'
import { useGoBack } from '@/lib/useGoBack'
import { useReferenceTable } from '@/lib/data/referenceTables'
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

type TabKey = 'contact' | 'rattachements' | 'contrats' | 'mandats' | 'recommandations'

export default function ContactDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { data: contacts } = useContacts()
  const { data: comptes } = useComptes()
  const { data: actions } = useActions()
  const { data: interactions } = useInteractions()
  const { data: contrats } = useContrats()
  const { data: mandats } = useMandats()
  const { data: recommandations } = useRecommandations()
  const { data: statutsMandatsRef } = useReferenceTable('statuts_mandats')
  const statutsMandats = statutsMandatsRef && statutsMandatsRef.length > 0 ? statutsMandatsRef : FALLBACK_STATUTS_MANDATS
  const { data: etapesRef } = useReferenceTable('etapes_recommandation')
  const etapes = etapesRef && etapesRef.length > 0 ? etapesRef : FALLBACK_ETAPES_RECOMMANDATION
  const { data: statutsVersionsRef } = useReferenceTable('statuts_versions_recommandation')
  const statutsVersions = statutsVersionsRef && statutsVersionsRef.length > 0 ? statutsVersionsRef : FALLBACK_STATUTS_VERSIONS

  const contact = contacts?.find((c) => c.id === id)
  const compte = comptes?.find((c) => c.id === contact?.compte_id)
  const deleteContact = useDeleteContact()
  const goBack = useGoBack('/contacts')

  const canManage = useCanManage(contact?.proprietaire_id)
  const [tab, setTab] = useState<TabKey>('contact')
  const [editOpen, setEditOpen] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const siteIdsDuContact = useMemo(() => new Set((contact?.sites ?? []).map((s) => s.id)), [contact])
  const tachesDuContact = useMemo(() => (actions ?? []).filter((a) => a.contact_id === id), [actions, id])
  const interactionsDuContact = useMemo(() => (interactions ?? []).filter((i) => i.contact_id === id), [interactions, id])
  const contratsDuContact = useMemo(() => (contrats ?? []).filter((ct) => siteIdsDuContact.has(ct.site_id)), [contrats, siteIdsDuContact])
  const mandatsSignataire = useMemo(() => (mandats ?? []).filter((m) => m.contact_signataire_id === id), [mandats, id])
  const mandatsDuCompte = useMemo(
    () => (mandats ?? []).filter((m) => m.compte_id === contact?.compte_id && m.contact_signataire_id !== id),
    [mandats, contact?.compte_id, id],
  )
  const recommandationsDuCompte = useMemo(() => (recommandations ?? []).filter((r) => r.compte_id === contact?.compte_id), [recommandations, contact?.compte_id])
  const estSignataire = mandatsSignataire.length > 0

  async function handleDelete() {
    if (!contact) return
    await deleteContact.mutateAsync(contact.id)
    navigate('/contacts')
  }

  const TABS: { key: TabKey; label: string; badge?: string }[] = [
    { key: 'contact', label: 'Contact' },
    { key: 'rattachements', label: 'Rattachements', badge: contact?.sites.length ? String(contact.sites.length) : undefined },
    { key: 'contrats', label: 'Contrats', badge: contratsDuContact.length ? String(contratsDuContact.length) : undefined },
    { key: 'mandats', label: 'Mandats', badge: (mandatsSignataire.length + mandatsDuCompte.length) ? String(mandatsSignataire.length + mandatsDuCompte.length) : undefined },
    { key: 'recommandations', label: 'Recommandations', badge: recommandationsDuCompte.length ? String(recommandationsDuCompte.length) : undefined },
  ]

  if (!contacts) {
    return (
      <div>
        <Topbar crumb="Contacts" title="Contact" />
        <div className="p-4 sm:p-6"><p className="text-sm text-navy-400">Chargement…</p></div>
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
          <p className="text-sm text-navy-500">Contact introuvable.</p>
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
      <div className="flex flex-wrap items-center gap-3.5 border-b border-navy-100 bg-white px-4 py-3.5 sm:px-6">
        <Button variant="ghost" size="icon" onClick={goBack} title="Retour aux contacts">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-violet-500 to-violet-400 text-sm font-bold text-white">
          {initiales}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="truncate text-xl font-bold tracking-tight text-navy-800">{contact.civilite ? `${contact.civilite} ` : ''}{contact.prenom} {contact.nom}</p>
            {contact.contact_principal && <Badge tone="amber"><Star className="h-3 w-3" /> Contact principal</Badge>}
            {estSignataire && (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-0.5 text-[10px] font-bold text-amber-700">
                <FileCheck2 className="h-3 w-3" /> SIGNATAIRE
              </span>
            )}
          </div>
          <p className="truncate text-xs text-navy-500">
            {contact.fonction || '—'} · <EntityLink to={`/comptes/${contact.compte_id}`}>{contact.compte_nom}</EntityLink>
          </p>
        </div>
        {canManage && (
          <div className="flex gap-1.5">
            <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
              <Pencil className="h-3.5 w-3.5" />
              Modifier
            </Button>
            <Button variant="outline" size="sm" onClick={() => setConfirmDelete(true)}>
              <Trash2 className="h-3.5 w-3.5" />
              Supprimer
            </Button>
          </div>
        )}
      </div>

      {/* Onglets */}
      <div className="flex gap-1.5 overflow-x-auto border-b border-navy-100 bg-white px-4 pt-2.5 lg:gap-0.5 lg:pt-0 sm:px-6">
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
                  ? 'bg-navy-800 text-white lg:border-navy-800 lg:bg-transparent lg:font-semibold lg:text-navy-800'
                  : 'border border-navy-200 bg-white text-navy-600 hover:bg-navy-50 lg:border-0 lg:border-b-2 lg:border-transparent lg:text-navy-500 lg:hover:bg-transparent lg:hover:text-navy-700',
              )}
            >
              {t.label}
              {t.badge && (
                <span className={cn('rounded px-1.5 py-0.5 text-[9.5px] font-bold', isActive ? 'bg-white/20 text-white lg:bg-navy-100 lg:text-navy-500' : 'bg-navy-100 text-navy-500')}>
                  {t.badge}
                </span>
              )}
            </button>
          )
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr_304px]">
        {/* Colonne gauche — Compte (desktop uniquement) */}
        <div className="hidden flex-col gap-3.5 border-r border-navy-100 bg-navy-50/60 p-3.5 lg:flex">
          {compte && (
            <div className="rounded-xl border border-navy-100 bg-white p-3.5">
              <div className="mb-2 flex items-center gap-1.5">
                <span className="flex h-5 w-5 items-center justify-center rounded-md bg-sky-100 text-sky-500">
                  <Building2 className="h-2.5 w-2.5" />
                </span>
                <span className="text-[10px] font-bold uppercase tracking-wide text-navy-400">Compte</span>
                <div className="flex-1" />
                <EntityLink to={`/comptes/${compte.id}`}>ouvrir →</EntityLink>
              </div>
              <p className="text-[13px] font-bold text-sky-500">{compte.nom}</p>
              <p className="mt-1 text-[11px] text-navy-500">{compte.segment} · {compte.nb_sites} site{compte.nb_sites > 1 ? 's' : ''}</p>
            </div>
          )}

          <div className="rounded-xl border border-navy-100 bg-white p-3.5">
            <div className="mb-2.5 flex items-center gap-1.5">
              <span className="text-[10px] font-bold uppercase tracking-wide text-navy-400">Nos échanges</span>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold tracking-tight text-navy-800">{interactionsDuContact.length}</span>
              <span className="text-[10.5px] text-navy-500">
                échange{interactionsDuContact.length > 1 ? 's' : ''}
                {dernierEchange && (
                  <>
                    <br />dernier : <span className="font-semibold text-kiwi-600">{new Date(dernierEchange.date_interaction).toLocaleDateString('fr-FR')}</span>
                  </>
                )}
              </span>
            </div>
          </div>
        </div>

        {/* Centre */}
        <div className="bg-navy-50 p-4 sm:p-5">
          {tab === 'contact' && (
            <div className="flex flex-col gap-3.5">
              <div className="rounded-xl border border-navy-100 bg-white p-4">
                <p className="mb-2.5 text-[10px] font-bold uppercase tracking-wide text-navy-400">Coordonnées</p>
                <div className="space-y-2 text-sm">
                  <p><span className="text-navy-400">Téléphone :</span> {contact.telephone ? <PhoneLink value={contact.telephone} /> : '—'}</p>
                  <p><span className="text-navy-400">Email :</span> {contact.email ? <EmailLink value={contact.email} /> : '—'}</p>
                  <p><span className="text-navy-400">Statut :</span> <Badge tone={contact.actif ? 'kiwi' : 'neutral'}>{contact.actif ? 'actif' : 'inactif'}</Badge></p>
                </div>
                <HistoriqueDiscret tableNom="contacts" ligneId={contact.id} />
              </div>
            </div>
          )}

          {tab === 'rattachements' && (
            <div className="flex flex-col gap-2.5">
              {contact.sites.length === 0 ? (
                <p className="text-sm text-navy-400">Aucun site rattaché à ce contact.</p>
              ) : (
                contact.sites.map((s) => (
                  <div
                    key={s.id}
                    onClick={() => navigate(`/sites/${s.id}`)}
                    className="flex cursor-pointer items-center gap-3 rounded-xl border border-navy-100 bg-white p-3.5 hover:bg-navy-50/60"
                  >
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-kiwi-100 text-kiwi-600">
                      <MapPin className="h-4 w-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-bold text-navy-800">{s.nom}</p>
                      {s.fonction_sur_site && <p className="truncate text-[10.5px] text-navy-400">{s.fonction_sur_site}</p>}
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {tab === 'contrats' && (
            <div className="flex flex-col gap-2.5">
              {contratsDuContact.length === 0 && <p className="text-sm text-navy-400">Aucun contrat sur les sites rattachés à ce contact.</p>}
              {contratsDuContact.map((ct) => (
                <div
                  key={ct.id}
                  onClick={() => navigate(`/contrats/${ct.id}`)}
                  className="flex cursor-pointer items-center gap-3 rounded-xl border border-navy-100 bg-white p-3.5 hover:bg-navy-50/60"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold text-navy-800">{ct.fournisseur_nom}</p>
                    <p className="truncate text-[10.5px] text-navy-400">{ct.site_nom}</p>
                  </div>
                </div>
              ))}
            </div>
          )}

          {tab === 'mandats' && (
            <div className="flex flex-col gap-2.5">
              {mandatsSignataire.length === 0 && mandatsDuCompte.length === 0 && <p className="text-sm text-navy-400">Aucun mandat pour ce contact.</p>}
              {[...mandatsSignataire, ...mandatsDuCompte].map((m) => (
                <div
                  key={m.id}
                  onClick={() => navigate(`/mandats/${m.id}`)}
                  className="flex cursor-pointer items-center gap-3 rounded-xl border border-navy-100 bg-white p-3.5 hover:bg-navy-50/60"
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-amber-100 text-amber-600">
                    <FileCheck2 className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold text-navy-800">
                      {m.nb_sites_couverts} site{m.nb_sites_couverts > 1 ? 's' : ''} couvert{m.nb_sites_couverts > 1 ? 's' : ''}
                    </p>
                    <p className="truncate text-[10.5px] text-navy-400">{m.contact_signataire_id === id ? 'Signataire de ce mandat' : m.contact_signataire_nom ?? '—'}</p>
                  </div>
                  <Badge tone={STATUT_MANDAT_TONE[m.statut] ?? 'neutral'}>{statutsMandats.find((s) => s.code === m.statut)?.libelle ?? m.statut}</Badge>
                </div>
              ))}
            </div>
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
                      </p>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Colonne droite — Activité persistante (desktop uniquement) */}
        <div className="hidden flex-col border-l border-navy-100 bg-white lg:flex">
          <div className="flex items-center gap-2 px-3.5 py-3">
            <span className="text-[10px] font-bold uppercase tracking-wide text-navy-400">Activité</span>
          </div>
          <div className="flex-1 overflow-hidden px-3.5 pb-3.5">
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

      <EditContactDialog open={editOpen} onClose={() => setEditOpen(false)} contact={contact} />

      <Dialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title="Supprimer ce contact ?"
        description="Cette action est irréversible."
      >
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="ghost" onClick={() => setConfirmDelete(false)}>Annuler</Button>
          <Button type="button" variant="outline" className="border-red-200 text-red-600 hover:bg-red-50" disabled={deleteContact.isPending} onClick={handleDelete}>
            Supprimer définitivement
          </Button>
        </div>
      </Dialog>
    </div>
  )
}

function EditContactDialog({ open, onClose, contact }: { open: boolean; onClose: () => void; contact: Contact }) {
  const updateContact = useUpdateContact()
  const isAdmin = useIsAdmin()
  const { data: profilsAdmin } = useProfilsAdmin()

  const [civilite, setCivilite] = useState(contact.civilite ?? '')
  const [prenom, setPrenom] = useState(contact.prenom)
  const [nom, setNom] = useState(contact.nom)
  const [fonction, setFonction] = useState(contact.fonction ?? '')
  const [telephone, setTelephone] = useState(contact.telephone ?? '')
  const [email, setEmail] = useState(contact.email ?? '')
  const [contactPrincipal, setContactPrincipal] = useState(contact.contact_principal)
  const [actif, setActif] = useState(contact.actif)
  const [proprietaireId, setProprietaireId] = useState(contact.proprietaire_id ?? '')
  const [feedback, setFeedback] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setCivilite(contact.civilite ?? '')
    setPrenom(contact.prenom)
    setNom(contact.nom)
    setFonction(contact.fonction ?? '')
    setTelephone(contact.telephone ?? '')
    setEmail(contact.email ?? '')
    setContactPrincipal(contact.contact_principal)
    setActif(contact.actif)
    setProprietaireId(contact.proprietaire_id ?? '')
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
        email: email || null,
        contact_principal: contactPrincipal,
        actif,
        proprietaire_id: proprietaireId || null,
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
        <div className="grid grid-cols-2 gap-3">
          <FormField label="Téléphone">
            <Input value={telephone} onChange={(e) => setTelephone(e.target.value)} />
          </FormField>
          <FormField label="Email">
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </FormField>
        </div>
        <label className="flex items-center gap-2 text-sm text-navy-700">
          <input type="checkbox" checked={contactPrincipal} onChange={(e) => setContactPrincipal(e.target.checked)} />
          Contact principal du compte
        </label>
        <label className="flex items-center gap-2 text-sm text-navy-700">
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
        {feedback && <p className="text-xs text-red-600">{feedback}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="ghost" onClick={onClose}>Annuler</Button>
          <Button type="submit" disabled={updateContact.isPending}>Enregistrer</Button>
        </div>
      </form>
    </Dialog>
  )
}
