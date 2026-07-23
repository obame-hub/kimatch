import { useEffect, useMemo, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, FileCheck2, FileSignature, Pencil, Trash2, Building2, MapPin, FileText, Plus, Phone, Mail } from 'lucide-react'
import { Topbar } from '@/components/layout/Topbar'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { EntityLink } from '@/components/ui/entity-link'
import { Dialog } from '@/components/ui/dialog'
import { EmailLink } from '@/components/ui/contact-link'
import { FormField, Input, Select } from '@/components/ui/form'
import { HistoriqueDiscret } from '@/components/ui/historique-discret'
import { useMandats, useMarkMandatEnvoye, useUpdateMandat, useDeleteMandat } from '@/lib/data/mandats'
import { useContacts } from '@/lib/data/contacts'
import { useComptes } from '@/lib/data/comptes'
import { useSites } from '@/lib/data/sites'
import { useDocuments, useCreateDocument } from '@/lib/data/documents'
import { useReferenceTable } from '@/lib/data/referenceTables'
import { useCanManage, useIsAdmin, useProfilsAdmin } from '@/lib/data/roles'
import { FALLBACK_STATUTS_MANDATS, STATUT_MANDAT_TONE, FALLBACK_TYPES_DOCUMENTS } from '@/lib/referenceFallbacks'
import { sendMandatForSignature } from '@/lib/data/docusign'
import { useGoBack } from '@/lib/useGoBack'
import { cn } from '@/lib/utils'
import type { Mandat, DocumentItem, Contact } from '@/types/domain'

type TabKey = 'mandat' | 'perimetre' | 'fichiers'

function EnvoyerSignatureDialog({
  open,
  onClose,
  mandat,
  documents,
  contact,
}: {
  open: boolean
  onClose: () => void
  mandat: Mandat
  documents: DocumentItem[]
  contact: Contact | undefined
}) {
  const [documentId, setDocumentId] = useState('')
  const [sending, setSending] = useState(false)
  const [feedback, setFeedback] = useState<string | null>(null)
  const { data: statutsRef } = useReferenceTable('statuts_mandats')
  const statuts = statutsRef && statutsRef.length > 0 ? statutsRef : FALLBACK_STATUTS_MANDATS
  const markEnvoye = useMarkMandatEnvoye()

  async function envoyer() {
    const doc = documents.find((d) => d.id === documentId)
    if (!doc || !contact?.email) return
    setSending(true)
    setFeedback(null)
    try {
      const result = await sendMandatForSignature({
        mandatId: mandat.id,
        documentUrl: doc.url,
        documentName: doc.nom_fichier,
        signerEmail: contact.email,
        signerName: `${contact.prenom} ${contact.nom}`,
        emailSubject: `KiWee Énergie — Mandat à signer (${mandat.compte_nom})`,
      })
      const statutEnvoye = statuts.find((s) => s.code === 'ENVOYE')
      await markEnvoye.mutateAsync({ mandatId: mandat.id, envelopeId: result.envelopeId, statutId: statutEnvoye?.id ?? null })
      setFeedback('Enveloppe envoyée pour signature.')
      setTimeout(onClose, 1200)
    } catch (e) {
      setFeedback(e instanceof Error ? e.message : 'Erreur inconnue')
    } finally {
      setSending(false)
    }
  }

  return (
    <Dialog open={open} onClose={onClose} title="Envoyer pour signature" description="Envoie le document choisi via DocuSign au contact signataire du mandat.">
      <div className="space-y-3">
        {!contact?.email && (
          <p className="text-xs text-red-600">Le contact signataire de ce mandat n'a pas d'adresse email renseignée.</p>
        )}
        {documents.length === 0 ? (
          <p className="text-sm text-navy-400">Aucun document lié à ce mandat — ajoutez-en un depuis l'onglet Fichiers.</p>
        ) : (
          <FormField label="Document à envoyer">
            <Select value={documentId} onChange={(e) => setDocumentId(e.target.value)}>
              <option value="">Sélectionner…</option>
              {documents.map((d) => <option key={d.id} value={d.id}>{d.nom}</option>)}
            </Select>
          </FormField>
        )}
        {contact?.email && (
          <p className="text-xs text-navy-500">Signataire : {contact.prenom} {contact.nom} (<EmailLink value={contact.email!} />)</p>
        )}
        {feedback && <p className="text-xs text-navy-600">{feedback}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="ghost" onClick={onClose}>Annuler</Button>
          <Button type="button" onClick={envoyer} disabled={sending || !documentId || !contact?.email}>
            {sending ? 'Envoi…' : 'Envoyer'}
          </Button>
        </div>
      </div>
    </Dialog>
  )
}

function ConversionPathCard({ mandat }: { mandat: Mandat }) {
  const step = mandat.date_signature ? 2 : mandat.docusign_envelope_id ? 1 : 0
  const steps = [
    { label: 'Brouillon', icon: FileCheck2 },
    { label: 'Envoyé', icon: FileSignature },
    { label: 'Signé', icon: FileCheck2 },
  ]
  return (
    <div className="rounded-xl border border-navy-100 bg-white p-4">
      <p className="mb-3 text-[10px] font-bold uppercase tracking-wide text-navy-400">Chemin de conversion</p>
      <div className="flex items-center">
        {steps.map((s, i) => (
          <div key={s.label} className="flex flex-1 items-center last:flex-none">
            <div className="flex flex-col items-center gap-1.5">
              <span
                className={cn(
                  'flex h-8 w-8 shrink-0 items-center justify-center rounded-full',
                  i <= step ? 'bg-gradient-to-br from-amber-600 to-amber-500 text-white shadow-sm' : 'bg-navy-100 text-navy-400',
                )}
              >
                <s.icon className="h-3.5 w-3.5" />
              </span>
              <span className={cn('whitespace-nowrap text-[11px] font-bold', i <= step ? 'text-navy-800' : 'text-navy-400')}>{s.label}</span>
            </div>
            {i < steps.length - 1 && (
              <div className={cn('mx-1 h-1 flex-1 rounded', i < step ? 'bg-gradient-to-r from-amber-600 to-amber-500' : 'bg-navy-100')} />
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

function AddFichierDialog({ open, onClose, mandatId, onSaved }: { open: boolean; onClose: () => void; mandatId: string; onSaved: () => void }) {
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
      entite_type: 'mandat',
      entite_id: mandatId,
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
    <Dialog open={open} onClose={() => { reset(); onClose() }} title="Ajouter un fichier" description="Rattacher un document à ce mandat.">
      <form onSubmit={handleSubmit} className="space-y-3">
        <FormField label="Nom du document">
          <Input value={nom} onChange={(e) => setNom(e.target.value)} required placeholder="Ex. Mandat signé — Cabinet Durand" />
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

export default function MandatDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { data: mandats } = useMandats()
  const { data: statutsRef } = useReferenceTable('statuts_mandats')
  const statuts = statutsRef && statutsRef.length > 0 ? statutsRef : FALLBACK_STATUTS_MANDATS
  const { data: contacts } = useContacts()
  const { data: comptes } = useComptes()
  const { data: sites } = useSites()
  const { data: documents } = useDocuments()
  const [showEnvoyer, setShowEnvoyer] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [addFichierOpen, setAddFichierOpen] = useState(false)
  const [tab, setTab] = useState<TabKey>('mandat')
  const mandat = mandats?.find((m) => m.id === id)
  const canManage = useCanManage(mandat?.proprietaire_id)
  const deleteMandat = useDeleteMandat()
  const goBack = useGoBack('/mandats')
  const compte = comptes?.find((c) => c.id === mandat?.compte_id)
  const contactSignataire = contacts?.find((c) => c.id === mandat?.contact_signataire_id)
  const sitesDuMandat = useMemo(() => sites?.filter((s) => mandat?.site_ids.includes(s.id)) ?? [], [sites, mandat])
  const documentsDuMandat = useMemo(() => documents?.filter((d) => d.entite_type === 'mandat' && d.entite_id === mandat?.id) ?? [], [documents, mandat?.id])

  async function handleDelete() {
    if (!mandat) return
    await deleteMandat.mutateAsync(mandat.id)
    navigate('/mandats')
  }

  const TABS: { key: TabKey; label: string; badge?: string }[] = [
    { key: 'mandat', label: 'Mandat' },
    { key: 'perimetre', label: 'Périmètre', badge: sitesDuMandat.length ? String(sitesDuMandat.length) : undefined },
    { key: 'fichiers', label: 'Fichiers', badge: documentsDuMandat.length ? String(documentsDuMandat.length) : undefined },
  ]

  if (!mandats) {
    return (
      <div>
        <Topbar crumb="Mandats" title="Mandat" />
        <div className="p-4 sm:p-6"><p className="text-sm text-navy-400">Chargement…</p></div>
      </div>
    )
  }

  if (!mandat) {
    return (
      <div>
        <Topbar crumb="Mandats" title="Mandat" />
        <div className="p-4 sm:p-6">
          <Button variant="ghost" size="sm" className="mb-4" onClick={goBack}>
            <ArrowLeft className="h-4 w-4" />
            Retour aux mandats
          </Button>
          <p className="text-sm text-navy-500">Mandat introuvable.</p>
        </div>
      </div>
    )
  }

  return (
    <div>
      <Topbar crumb="Mandats" title={`Mandat — ${mandat.compte_nom}`} />

      {/* Bandeau mandat */}
      <div className="flex flex-wrap items-center gap-3.5 border-b border-navy-100 bg-white px-4 py-3.5 sm:px-6">
        <Button variant="ghost" size="icon" onClick={goBack} title="Retour aux mandats">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] bg-gradient-to-br from-amber-600 to-amber-500 text-white">
          <FileCheck2 className="h-[18px] w-[18px]" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="truncate text-xl font-bold tracking-tight text-navy-800">Mandat {mandat.compte_nom}</p>
            <Badge tone={STATUT_MANDAT_TONE[mandat.statut] ?? 'neutral'}>{statuts.find((s) => s.code === mandat.statut)?.libelle ?? mandat.statut}</Badge>
          </div>
          <p className="truncate text-xs text-navy-500">{mandat.nb_sites_couverts} site{mandat.nb_sites_couverts > 1 ? 's' : ''} couvert{mandat.nb_sites_couverts > 1 ? 's' : ''}</p>
        </div>
        <div className="flex gap-1.5">
          <Button size="sm" onClick={() => setShowEnvoyer(true)}>
            <FileSignature className="h-3.5 w-3.5" />
            Envoyer pour signature
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

      <div className="grid grid-cols-1 lg:grid-cols-[256px_1fr]">
        {/* Colonne gauche (desktop uniquement) */}
        <div className="hidden flex-col gap-3.5 border-r border-navy-100 bg-navy-50/60 p-3.5 lg:flex">
          {compte && (
            <div className="rounded-xl border border-navy-100 bg-white p-3.5">
              <div className="mb-2 flex items-center gap-1.5">
                <span className="flex h-5 w-5 items-center justify-center rounded-md bg-sky-100 text-sky-500"><Building2 className="h-2.5 w-2.5" /></span>
                <span className="text-[10px] font-bold uppercase tracking-wide text-navy-400">Compte</span>
                <div className="flex-1" />
                <EntityLink to={`/comptes/${compte.id}`}>ouvrir →</EntityLink>
              </div>
              <p className="text-[13px] font-bold text-sky-500">{compte.nom}</p>
            </div>
          )}

          {contactSignataire && (
            <div className="rounded-xl border border-violet-200 bg-gradient-to-br from-violet-50/60 to-white p-3.5">
              <div className="mb-2.5 flex items-center gap-1.5">
                <span className="text-[10px] font-bold uppercase tracking-wide text-navy-400">Signataire</span>
                <div className="flex-1" />
                <EntityLink to={`/contacts/${contactSignataire.id}`}>ouvrir →</EntityLink>
              </div>
              <div className="flex items-center gap-2.5">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-violet-500 to-violet-400 text-[11px] font-bold text-white">
                  {`${contactSignataire.prenom[0] ?? ''}${contactSignataire.nom[0] ?? ''}`.toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[12.5px] font-bold text-navy-800">{contactSignataire.prenom} {contactSignataire.nom}</p>
                  {contactSignataire.fonction && <p className="truncate text-[10px] text-navy-500">{contactSignataire.fonction}</p>}
                </div>
              </div>
              <div className="mt-2.5 flex gap-1.5">
                {contactSignataire.telephone && (
                  <a href={`tel:${contactSignataire.telephone}`} title="Appeler" className="flex h-7 flex-1 items-center justify-center rounded-lg border border-navy-200 bg-white text-kiwi-600 hover:bg-kiwi-50">
                    <Phone className="h-3 w-3" />
                  </a>
                )}
                {contactSignataire.email && (
                  <a href={`mailto:${contactSignataire.email}`} title="Envoyer un email" className="flex h-7 flex-1 items-center justify-center rounded-lg border border-navy-200 bg-white text-sky-500 hover:bg-sky-50">
                    <Mail className="h-3 w-3" />
                  </a>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Centre */}
        <div className="bg-navy-50 p-4 sm:p-5">
          {tab === 'mandat' && (
            <div className="flex flex-col gap-3.5">
              <ConversionPathCard mandat={mandat} />
              <div className="rounded-xl border border-navy-100 bg-white p-4">
              <p className="mb-2.5 text-[10px] font-bold uppercase tracking-wide text-navy-400">Détail du mandat</p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <p className="mb-0.5 text-[10px] uppercase tracking-wide text-navy-400">Date de signature</p>
                  <p className="text-xs font-semibold text-navy-800">{mandat.date_signature ? new Date(mandat.date_signature).toLocaleDateString('fr-FR') : '—'}</p>
                </div>
                <div>
                  <p className="mb-0.5 text-[10px] uppercase tracking-wide text-navy-400">Sites couverts</p>
                  <p className="text-xs font-semibold text-navy-800">{mandat.nb_sites_couverts}</p>
                </div>
                {mandat.docusign_envelope_id && (
                  <div className="sm:col-span-2">
                    <p className="mb-0.5 text-[10px] uppercase tracking-wide text-navy-400">Enveloppe DocuSign</p>
                    <p className="font-mono text-xs text-navy-600">{mandat.docusign_envelope_id}</p>
                  </div>
                )}
              </div>
              <p className="mt-3 text-[10.5px] italic text-navy-400">
                Le mandat définit le périmètre de sites que KiWee est autorisé à analyser — une recommandation peut ne porter que sur une partie de ce périmètre.
              </p>
              <HistoriqueDiscret tableNom="mandats" ligneId={mandat.id} />
              </div>
            </div>
          )}

          {tab === 'perimetre' && (
            <div className="flex flex-col gap-2.5">
              {sitesDuMandat.length === 0 ? (
                <p className="text-sm text-navy-400">Aucun site couvert par ce mandat.</p>
              ) : (
                sitesDuMandat.map((s) => (
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
                      <p className="truncate text-[10.5px] text-navy-400">{s.type_site} · {s.ville}</p>
                    </div>
                    <Badge tone={s.statut === 'actif' ? 'kiwi' : 'neutral'}>{s.statut}</Badge>
                  </div>
                ))
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
              {documentsDuMandat.length === 0 ? (
                <p className="text-sm text-navy-400">Aucun fichier lié à ce mandat.</p>
              ) : (
                <div className="overflow-hidden rounded-xl border border-navy-100 bg-white">
                  {documentsDuMandat.map((d) => (
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
        </div>
      </div>

      <EnvoyerSignatureDialog
        open={showEnvoyer}
        onClose={() => setShowEnvoyer(false)}
        mandat={mandat}
        documents={documentsDuMandat}
        contact={contactSignataire}
      />
      <EditMandatDialog open={editOpen} onClose={() => setEditOpen(false)} mandat={mandat} onSaved={() => {}} />
      <AddFichierDialog open={addFichierOpen} onClose={() => setAddFichierOpen(false)} mandatId={mandat.id} onSaved={() => {}} />

      <Dialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title="Supprimer ce mandat ?"
        description="Cette action est irréversible. Les recommandations et documents liés à ce mandat ne seront pas supprimés mais perdront leur lien à ce mandat."
      >
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="ghost" onClick={() => setConfirmDelete(false)}>Annuler</Button>
          <Button type="button" variant="outline" className="border-red-200 text-red-600 hover:bg-red-50" disabled={deleteMandat.isPending} onClick={handleDelete}>
            Supprimer définitivement
          </Button>
        </div>
      </Dialog>
    </div>
  )
}

function EditMandatDialog({
  open,
  onClose,
  mandat,
  onSaved,
}: {
  open: boolean
  onClose: () => void
  mandat: Mandat
  onSaved: () => void
}) {
  const updateMandat = useUpdateMandat()
  const isAdmin = useIsAdmin()
  const { data: profilsAdmin } = useProfilsAdmin()
  const [dateSignature, setDateSignature] = useState(mandat.date_signature ? mandat.date_signature.slice(0, 10) : '')
  const [proprietaireId, setProprietaireId] = useState(mandat.proprietaire_id ?? '')
  const [feedback, setFeedback] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setDateSignature(mandat.date_signature ? mandat.date_signature.slice(0, 10) : '')
    setProprietaireId(mandat.proprietaire_id ?? '')
    setFeedback(null)
  }, [open, mandat])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    try {
      await updateMandat.mutateAsync({ id: mandat.id, date_signature: dateSignature || null, proprietaire_id: proprietaireId || null })
      onSaved()
      onClose()
    } catch (err) {
      setFeedback(err instanceof Error ? err.message : 'Erreur inconnue')
    }
  }

  return (
    <Dialog open={open} onClose={onClose} title="Modifier le mandat" description="Mettre à jour la date de signature du mandat.">
      <form onSubmit={handleSubmit} className="space-y-3">
        <FormField label="Date de signature">
          <Input type="date" value={dateSignature} onChange={(e) => setDateSignature(e.target.value)} />
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
          <Button type="submit" disabled={updateMandat.isPending}>Enregistrer</Button>
        </div>
      </form>
    </Dialog>
  )
}
