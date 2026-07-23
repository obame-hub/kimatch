import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, User, Star, Pencil, Trash2, CheckSquare } from 'lucide-react'
import { Topbar } from '@/components/layout/Topbar'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { EntityLink } from '@/components/ui/entity-link'
import { PhoneLink, EmailLink } from '@/components/ui/contact-link'
import { Dialog } from '@/components/ui/dialog'
import { FormField, Input, Select } from '@/components/ui/form'
import { HistoriqueDiscret } from '@/components/ui/historique-discret'
import { ActivityCard } from '@/components/ui/activity-card'
import { useContacts, useUpdateContact, useDeleteContact } from '@/lib/data/contacts'
import { useActions } from '@/lib/data/actions'
import { useCanManage, useIsAdmin, useProfilsAdmin } from '@/lib/data/roles'
import { useGoBack } from '@/lib/useGoBack'
import { useReferenceTable } from '@/lib/data/referenceTables'
import { FALLBACK_STATUTS_ACTIONS, STATUT_ACTION_TONE } from '@/lib/referenceFallbacks'
import type { Contact } from '@/types/domain'

const CIVILITE_OPTIONS = ['M.', 'Mme', 'Autre']

export default function ContactDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { data: contacts } = useContacts()
  const { data: actions } = useActions()
  const { data: statutsRef } = useReferenceTable('statuts_actions')
  const statuts = statutsRef && statutsRef.length > 0 ? statutsRef : FALLBACK_STATUTS_ACTIONS
  const contact = contacts?.find((c) => c.id === id)
  const tachesDuContact = (actions ?? []).filter((a) => a.contact_id === id)
  const deleteContact = useDeleteContact()
  const goBack = useGoBack('/contacts')

  const canManage = useCanManage(contact?.proprietaire_id)
  const [editOpen, setEditOpen] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  async function handleDelete() {
    if (!contact) return
    await deleteContact.mutateAsync(contact.id)
    navigate('/contacts')
  }

  return (
    <div>
      <Topbar crumb="Contacts" title={contact ? `${contact.prenom} ${contact.nom}` : 'Contact'} />
      <div className="p-4 sm:p-6">
        <Button variant="ghost" size="sm" className="mb-4" onClick={goBack}>
          <ArrowLeft className="h-4 w-4" />
          Retour aux contacts
        </Button>

        {!contact ? (
          <p className="text-sm text-navy-500">Contact introuvable.</p>
        ) : (
          <Card className="max-w-xl p-6">
            <CardHeader className="px-0 pt-0">
              <div className="flex items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-violet-100 text-violet-500">
                    <User className="h-5 w-5" />
                  </span>
                  <CardTitle className="truncate font-display text-base">{contact.civilite ? `${contact.civilite} ` : ''}{contact.prenom} {contact.nom}</CardTitle>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {contact.contact_principal && (
                    <Badge tone="amber"><Star className="h-3 w-3" /> Contact principal</Badge>
                  )}
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
            </CardHeader>
            <CardContent className="px-0 space-y-3 text-sm">
              <p><span className="text-navy-400">Compte :</span> <EntityLink to={`/comptes/${contact.compte_id}`}>{contact.compte_nom}</EntityLink></p>
              <p><span className="text-navy-400">Fonction :</span> {contact.fonction || '—'}</p>
              <p><span className="text-navy-400">Téléphone :</span> {contact.telephone ? <PhoneLink value={contact.telephone} /> : '—'}</p>
              <p><span className="text-navy-400">Email :</span> {contact.email ? <EmailLink value={contact.email} /> : '—'}</p>
              <p><span className="text-navy-400">Statut :</span> <Badge tone={contact.actif ? 'kiwi' : 'neutral'}>{contact.actif ? 'actif' : 'inactif'}</Badge></p>
              {contact.sites.length > 0 && (
                <div>
                  <span className="text-navy-400">Sites :</span>
                  <div className="mt-1.5 space-y-1">
                    {contact.sites.map((s) => (
                      <p key={s.id}>
                        <EntityLink to={`/sites/${s.id}`}>{s.nom}</EntityLink>
                        {s.fonction_sur_site && <span className="text-navy-400"> — {s.fonction_sur_site}</span>}
                      </p>
                    ))}
                  </div>
                </div>
              )}
              {tachesDuContact.length > 0 && (
                <div>
                  <span className="text-navy-400">Tâches :</span>
                  <div className="mt-1.5 space-y-1.5">
                    {tachesDuContact.map((t) => (
                      <ActivityCard
                        key={t.id}
                        styleKey="action"
                        icon={CheckSquare}
                        title={t.titre}
                        subtitle={t.type_action}
                        trailing={<Badge tone={STATUT_ACTION_TONE[t.statut] ?? 'neutral'}>{statuts.find((s) => s.code === t.statut)?.libelle ?? t.statut}</Badge>}
                        onClick={() => navigate(`/taches/${t.id}`)}
                      />
                    ))}
                  </div>
                </div>
              )}
              <HistoriqueDiscret tableNom="contacts" ligneId={contact.id} />
            </CardContent>
          </Card>
        )}
      </div>

      {contact && (
        <>
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
        </>
      )}
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
