import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, FileSignature } from 'lucide-react'
import { Topbar } from '@/components/layout/Topbar'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { EntityLink } from '@/components/ui/entity-link'
import { Dialog } from '@/components/ui/dialog'
import { EmailLink } from '@/components/ui/contact-link'
import { FormField, Select } from '@/components/ui/form'
import { HistoriqueDiscret } from '@/components/ui/historique-discret'
import { useMandats, useMarkMandatEnvoye } from '@/lib/data/mandats'
import { useContacts } from '@/lib/data/contacts'
import { useDocuments } from '@/lib/data/documents'
import { useReferenceTable } from '@/lib/data/referenceTables'
import { FALLBACK_STATUTS_MANDATS, STATUT_MANDAT_TONE } from '@/lib/referenceFallbacks'
import { sendMandatForSignature } from '@/lib/data/docusign'
import type { Mandat, DocumentItem, Contact } from '@/types/domain'

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
          <p className="text-sm text-navy-400">Aucun document lié à ce mandat — ajoutez-en un depuis l'écran Documents (entité "mandat").</p>
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

export default function MandatDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { data: mandats } = useMandats()
  const { data: statutsRef } = useReferenceTable('statuts_mandats')
  const statuts = statutsRef && statutsRef.length > 0 ? statutsRef : FALLBACK_STATUTS_MANDATS
  const { data: contacts } = useContacts()
  const { data: documents } = useDocuments()
  const [showEnvoyer, setShowEnvoyer] = useState(false)
  const mandat = mandats?.find((m) => m.id === id)
  const contactSignataire = contacts?.find((c) => c.id === mandat?.contact_signataire_id)
  const documentsDuMandat = documents?.filter((d) => d.entite_type === 'mandat' && d.entite_id === mandat?.id) ?? []

  return (
    <div>
      <Topbar crumb="Mandats" title={mandat ? `Mandat — ${mandat.compte_nom}` : 'Mandat'} />
      <div className="p-4 sm:p-6">
        <Button variant="ghost" size="sm" className="mb-4" onClick={() => navigate('/mandats')}>
          <ArrowLeft className="h-4 w-4" />
          Retour aux mandats
        </Button>

        {!mandat ? (
          <p className="text-sm text-navy-500">Mandat introuvable.</p>
        ) : (
          <div className="grid max-w-3xl grid-cols-1 gap-4 lg:grid-cols-2">
            <Card className="p-6">
              <CardHeader className="px-0 pt-0">
                <CardTitle><EntityLink to={`/comptes/${mandat.compte_id}`}>{mandat.compte_nom}</EntityLink></CardTitle>
              </CardHeader>
              <CardContent className="px-0 space-y-3 text-sm">
                <p>
                  <span className="text-navy-400">Statut :</span>{' '}
                  <Badge tone={STATUT_MANDAT_TONE[mandat.statut] ?? 'neutral'}>
                    {statuts.find((s) => s.code === mandat.statut)?.libelle ?? mandat.statut}
                  </Badge>
                </p>
                <p><span className="text-navy-400">Sites couverts :</span> {mandat.nb_sites_couverts}</p>
                <p><span className="text-navy-400">Date de signature :</span> {mandat.date_signature ? new Date(mandat.date_signature).toLocaleDateString('fr-FR') : '—'}</p>
                {mandat.contact_signataire_nom && (
                  <p>
                    <span className="text-navy-400">Contact signataire :</span>{' '}
                    {mandat.contact_signataire_id ? (
                      <EntityLink to={`/contacts/${mandat.contact_signataire_id}`}>{mandat.contact_signataire_nom}</EntityLink>
                    ) : (
                      mandat.contact_signataire_nom
                    )}
                  </p>
                )}
                {mandat.docusign_envelope_id && (
                  <p className="text-xs text-navy-400">Enveloppe DocuSign : <code className="text-navy-500">{mandat.docusign_envelope_id}</code></p>
                )}
                <p className="text-xs text-navy-400">
                  Le mandat définit le périmètre de sites que KiWee est autorisé à analyser — une recommandation peut ne porter que sur une partie de ce périmètre.
                </p>
                <Button size="sm" onClick={() => setShowEnvoyer(true)}>
                  <FileSignature className="h-4 w-4" />
                  Envoyer pour signature
                </Button>
                <HistoriqueDiscret tableNom="mandats" ligneId={mandat.id} />
              </CardContent>
            </Card>

            <Card className="p-6">
              <CardHeader className="px-0 pt-0">
                <CardTitle>Documents liés</CardTitle>
              </CardHeader>
              <CardContent className="px-0 space-y-2">
                {documentsDuMandat.length === 0 && <p className="text-sm text-navy-400">Aucun document lié à ce mandat.</p>}
                {documentsDuMandat.map((d) => (
                  <div
                    key={d.id}
                    className="cursor-pointer rounded-lg border border-navy-100 p-3 transition-colors hover:bg-navy-50"
                    onClick={() => navigate(`/documents/${d.id}`)}
                  >
                    <p className="text-sm font-medium text-navy-800">{d.nom}</p>
                    <p className="text-xs text-navy-500">{d.type_document}</p>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        )}
      </div>
      {mandat && (
        <EnvoyerSignatureDialog
          open={showEnvoyer}
          onClose={() => setShowEnvoyer(false)}
          mandat={mandat}
          documents={documentsDuMandat}
          contact={contactSignataire}
        />
      )}
    </div>
  )
}
