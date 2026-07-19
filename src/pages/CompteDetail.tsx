import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Gauge, Loader2, Pencil } from 'lucide-react'
import { Topbar } from '@/components/layout/Topbar'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Dialog } from '@/components/ui/dialog'
import { FormField, Input, Select, Textarea } from '@/components/ui/form'
import {
  useComptes,
  useUpdateCompteScore,
  useUpdateCompteClient,
  useUpdateCompteFournisseur,
  useUpdateComptePartenaire,
} from '@/lib/data/comptes'
import { useSites } from '@/lib/data/sites'
import { useContacts } from '@/lib/data/contacts'
import { useEllisphereScore } from '@/lib/data/ellisphere'
import { useReferenceTable } from '@/lib/data/referenceTables'
import type { Compte, TypeCompte } from '@/types/domain'

const typeMeta: Record<TypeCompte, { label: string; tone: 'kiwi' | 'blue' | 'amber' | 'neutral' }> = {
  client: { label: 'Client', tone: 'kiwi' },
  fournisseur: { label: 'Fournisseur', tone: 'blue' },
  partenaire: { label: 'Partenaire', tone: 'amber' },
  kiwee: { label: 'KiWee', tone: 'neutral' },
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
  const [statut, setStatut] = useState(compte.statut_partenariat ?? 'A_QUALIFIER')
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
  const [statut, setStatut] = useState(compte.statut_partenariat ?? 'A_QUALIFIER')
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

export default function CompteDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { data: comptes } = useComptes()
  const { data: sites } = useSites()
  const { data: contacts } = useContacts()
  const ellisphereScore = useEllisphereScore()
  const updateScore = useUpdateCompteScore()
  const compte = comptes?.find((c) => c.id === id)
  const sitesDuCompte = sites?.filter((s) => s.compte_nom === compte?.nom) ?? []
  const contactsDuCompte = contacts?.filter((c) => c.compte_id === id) ?? []
  const [showEditSubtype, setShowEditSubtype] = useState(false)

  async function handleScoreClick() {
    if (!compte?.siren) return
    const score = await ellisphereScore.mutateAsync(compte.siren)
    updateScore.mutate({ compteId: compte.id, score })
  }

  return (
    <div>
      <Topbar title={compte?.nom ?? 'Compte'} />
      <div className="p-4 sm:p-6">
        <Button variant="ghost" size="sm" className="mb-4" onClick={() => navigate('/comptes')}>
          <ArrowLeft className="h-4 w-4" />
          Retour aux comptes
        </Button>

        {!compte ? (
          <p className="text-sm text-navy-500">Compte introuvable.</p>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle>Informations générales</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  <p><span className="text-navy-400">Type :</span> <Badge tone={typeMeta[compte.type_compte].tone}>{typeMeta[compte.type_compte].label}</Badge></p>
                  <p><span className="text-navy-400">Segment :</span> {compte.segment}</p>
                  <p><span className="text-navy-400">Ville :</span> {compte.ville}</p>
                  <p><span className="text-navy-400">Sites rattachés :</span> {compte.nb_sites}</p>
                  {compte.siren && <p><span className="text-navy-400">SIREN :</span> {compte.siren}</p>}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Score Ellisphere</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  {!compte.siren ? (
                    <p className="text-navy-400">Aucun SIREN renseigné pour ce compte — impossible d'interroger Ellisphere.</p>
                  ) : (
                    <>
                      {compte.score_ellipro ? (
                        <div className="flex items-center gap-2 rounded-lg bg-kiwi-50 px-3 py-2">
                          <Gauge className="h-4 w-4 text-kiwi-700" />
                          <p className="text-kiwi-800">
                            Score actuel : <span className="font-semibold">{compte.score_ellipro}</span>
                            {compte.score_ellipro_scale && ` / ${compte.score_ellipro_scale}`}
                          </p>
                        </div>
                      ) : (
                        <p className="text-navy-400">Aucun score interrogé pour le moment.</p>
                      )}
                      {compte.score_ellipro_maj && (
                        <p className="text-xs text-navy-400">
                          Dernière interrogation : {new Date(compte.score_ellipro_maj).toLocaleString('fr-FR')}
                        </p>
                      )}

                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={handleScoreClick}
                        disabled={ellisphereScore.isPending}
                      >
                        {ellisphereScore.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Gauge className="h-4 w-4" />}
                        {ellisphereScore.isPending ? 'Interrogation…' : 'Interroger Ellisphere'}
                      </Button>

                      {ellisphereScore.isError && (
                        <p className="text-xs text-red-600">{(ellisphereScore.error as Error).message}</p>
                      )}
                      {updateScore.isSuccess && (
                        <p className="text-xs text-navy-400">
                          {updateScore.data.changed ? 'Score mis à jour.' : 'Score inchangé depuis la dernière interrogation.'}
                          {!updateScore.data.persisted && ' (enregistré localement uniquement — écriture Supabase indisponible)'}
                        </p>
                      )}
                    </>
                  )}
                </CardContent>
              </Card>
            </div>

            {compte.type_compte !== 'kiwee' && (
              <Card>
                <CardHeader>
                  <CardTitle>Détails {typeMeta[compte.type_compte].label.toLowerCase()}</CardTitle>
                  <Button type="button" size="sm" variant="outline" onClick={() => setShowEditSubtype(true)}>
                    <Pencil className="h-3.5 w-3.5" /> Modifier
                  </Button>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
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
                      <p><span className="text-navy-400">Statut partenariat :</span> <Badge tone="neutral">{compte.statut_partenariat || 'A_QUALIFIER'}</Badge></p>
                      {compte.conditions_commerciales && <p><span className="text-navy-400">Conditions :</span> {compte.conditions_commerciales}</p>}
                      {compte.commentaire_partenariat && <p><span className="text-navy-400">Commentaire :</span> {compte.commentaire_partenariat}</p>}
                    </>
                  )}
                  {compte.type_compte === 'partenaire' && (
                    <>
                      <p><span className="text-navy-400">Type de partenariat :</span> {compte.type_partenariat || '—'}</p>
                      <p><span className="text-navy-400">Modèle de rémunération :</span> {compte.modele_remuneration || '—'}</p>
                      <p><span className="text-navy-400">Contact référent :</span> {compte.contact_referent_nom || '—'}</p>
                      <p><span className="text-navy-400">Statut partenariat :</span> <Badge tone="neutral">{compte.statut_partenariat || 'A_QUALIFIER'}</Badge></p>
                      <p><span className="text-navy-400">Début du partenariat :</span> {compte.date_debut_partenariat ? new Date(compte.date_debut_partenariat).toLocaleDateString('fr-FR') : '—'}</p>
                      {compte.commentaire_partenariat && <p><span className="text-navy-400">Commentaire :</span> {compte.commentaire_partenariat}</p>}
                    </>
                  )}
                </CardContent>
              </Card>
            )}

            <Card>
              <CardHeader>
                <CardTitle>Sites rattachés</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {sitesDuCompte.length === 0 && <p className="text-sm text-navy-400">Aucun site rattaché à ce compte.</p>}
                {sitesDuCompte.map((site) => (
                  <div
                    key={site.id}
                    className="cursor-pointer rounded-lg border border-navy-100 p-3 transition-colors hover:bg-navy-50"
                    onClick={() => navigate(`/sites/${site.id}`)}
                  >
                    <p className="text-sm font-medium text-navy-800">{site.nom}</p>
                    <p className="text-xs text-navy-500">{site.type_site} · {site.ville} ({site.code_postal})</p>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Contacts</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {contactsDuCompte.length === 0 && <p className="text-sm text-navy-400">Aucun contact enregistré pour ce compte.</p>}
                {contactsDuCompte.map((contact) => (
                  <div
                    key={contact.id}
                    className="cursor-pointer rounded-lg border border-navy-100 p-3 transition-colors hover:bg-navy-50"
                    onClick={() => navigate(`/contacts/${contact.id}`)}
                  >
                    <p className="text-sm font-medium text-navy-800">{contact.prenom} {contact.nom}</p>
                    <p className="text-xs text-navy-500">{contact.fonction || '—'} {contact.email ? `· ${contact.email}` : ''}</p>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        )}
      </div>
      {compte?.type_compte === 'client' && (
        <EditCompteClientDialog compte={compte} open={showEditSubtype} onClose={() => setShowEditSubtype(false)} />
      )}
      {compte?.type_compte === 'fournisseur' && (
        <EditCompteFournisseurDialog compte={compte} contacts={contactsDuCompte} open={showEditSubtype} onClose={() => setShowEditSubtype(false)} />
      )}
      {compte?.type_compte === 'partenaire' && (
        <EditComptePartenaireDialog compte={compte} contacts={contactsDuCompte} open={showEditSubtype} onClose={() => setShowEditSubtype(false)} />
      )}
    </div>
  )
}
