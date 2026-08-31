import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowRight, Radio } from 'lucide-react'
import { Dialog } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { FormField, Select, Textarea } from '@/components/ui/form'
import { useSite } from '@/lib/data/sites'
import { useContactsParCompte } from '@/lib/data/contacts'
import { useCreerOpportunite, useStatutsOpportunites } from '@/lib/data/opportunites'
import { useUpdateSignalPartiel } from '@/lib/data/signaux'
import { useReferenceTable } from '@/lib/data/referenceTables'
import { FALLBACK_STATUTS_SIGNAUX } from '@/lib/referenceFallbacks'

/**
 * « VALIDER ET CRÉER L'OPPORTUNITÉ » — diapositive 9 de Michel, troisième temps de la détection :
 *
 *   1 • DÉTECTER  — création automatique
 *   2 • QUALIFIER — « le signal arrive en À qualifier. Le commercial vérifie la pertinence,
 *                    complète le contexte et décide. »
 *   3 • CONVERTIR — « l'action Valider et créer l'opportunité crée une opportunité liée et passe
 *                    le signal à Converti. »
 *
 * CE MAILLON N'EXISTAIT PAS — mais pas pour la raison que j'avais écrite ici. J'ai d'abord affirmé
 * que « `useCreerOpportunite` n'était appelé par aucun écran » : c'était FAUX, la liste des
 * opportunités a son propre dialogue de création (Opportunites.tsx). J'avais cherché
 * `useCreateOpportunite` — le mauvais nom — et conclu d'un résultat vide.
 *
 * Ce qui manquait réellement, et que ce fichier apporte : la conversion DEPUIS UN SIGNAL. La fiche
 * signal n'offrait que « Supprimer », donc la chaîne signal → opportunité de la diapositive 5 ne
 * pouvait pas se parcourir : on pouvait créer une opportunité de toutes pièces, jamais la faire
 * naître du signal qui la justifie — et rien ne reliait alors les deux.
 *
 * LE CONTACT EST OBLIGATOIRE, LE PÉRIMÈTRE NON. Michel, 24/08/2026 : « pour lancer une opportunité
 * il nous faut au minimum un signal et un contact ». Le périmètre, lui, appartient au palier
 * suivant : « En qualification — besoin, périmètre, potentiel ». On ne rattache donc PAS le site du
 * signal à la création, même si on le connaît : le faire ferait sauter le palier « Nouvelle » de sa
 * diapositive 10, qui deviendrait inatteignable puisque le statut se déduit du périmètre. Le lien
 * n'est pas perdu pour autant — l'opportunité garde son `signal_id`, et le signal porte son site.
 */
export function DialogConversionSignal({
  ouvert,
  onFermer,
  signal,
}: {
  ouvert: boolean
  onFermer: () => void
  signal: { id: string; site_id: string; site_nom: string; type_signal: string; description?: string | null }
}) {
  const navigate = useNavigate()
  const { data: site } = useSite(signal.site_id)
  const { data: contacts } = useContactsParCompte(site?.compte_id)
  const { data: statutsOpp } = useStatutsOpportunites()
  const { data: statutsSignauxRef } = useReferenceTable('statuts_signaux')
  const statutsSignaux = statutsSignauxRef && statutsSignauxRef.length > 0 ? statutsSignauxRef : FALLBACK_STATUTS_SIGNAUX
  const creer = useCreerOpportunite()
  const majSignal = useUpdateSignalPartiel()

  const [contactId, setContactId] = useState('')
  const [commentaire, setCommentaire] = useState('')
  const [erreur, setErreur] = useState<string | null>(null)
  const [enCours, setEnCours] = useState(false)

  // Un seul contact sur le compte : on le choisit d'office. Le commercial garde la main, mais ne
  // clique pas pour confirmer une évidence.
  useEffect(() => {
    if (!ouvert) return
    if (contacts?.length === 1) setContactId(contacts[0].id)
  }, [ouvert, contacts])

  useEffect(() => {
    if (ouvert) return
    setContactId('')
    setCommentaire('')
    setErreur(null)
  }, [ouvert])

  const decisionnaires = useMemo(() => {
    if (!contacts) return []
    // Le décisionnaire d'abord : c'est lui qui engage, et c'est le contact que le commercial veut
    // presque toujours. Les autres restent proposés, on ne les cache pas.
    return [...contacts].sort((a, b) => {
      const rang = (r: string | null) => (r === 'Décisionnaire' ? 0 : r === 'Administratif' ? 1 : 2)
      return rang(a.role) - rang(b.role) || a.nom.localeCompare(b.nom)
    })
  }, [contacts])

  const statutNouvelle = statutsOpp?.find((s) => s.code === 'NOUVELLE')?.id ?? null
  const statutConverti = statutsSignaux.find((s) => s.code === 'CONVERTI')?.id ?? null

  async function convertir() {
    if (!contactId || !site) return
    setErreur(null)
    setEnCours(true)
    try {
      const opportuniteId = await creer.mutateAsync({
        compte_id: site.compte_id,
        contact_id: contactId,
        // « Du portefeuille KiWee, lorsqu'un signal positif est détecté » — l'une des origines que
        // Michel énumère.
        origine: 'SIGNAL',
        type_opportunite: null,
        statut_id: statutNouvelle,
        commentaire: commentaire.trim() || null,
        signal_libelle: signal.type_signal,
        signal_id: signal.id,
      })

      // LE SIGNAL PASSE À « CONVERTI » APRÈS, ET SEULEMENT SI L'OPPORTUNITÉ EXISTE. Dans l'autre
      // ordre, un échec de création laisserait un signal marqué converti sans rien derrière —
      // invisible dans la liste des signaux à qualifier, et perdu pour tout le monde.
      if (statutConverti) {
        await majSignal.mutateAsync({ id: signal.id, patch: { statut_id: statutConverti } })
      }

      onFermer()
      navigate(`/opportunites/${opportuniteId}`)
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'La conversion a échoué.')
    } finally {
      setEnCours(false)
    }
  }

  const aucunContact = contacts !== undefined && contacts.length === 0

  return (
    <Dialog
      open={ouvert}
      onClose={onFermer}
      title="Valider et créer l’opportunité"
      description="Le signal passe à « Converti » et l’opportunité s’ouvre sur le palier « Nouvelle »."
    >
      <div className="space-y-4">
        <div className="rounded-km-md border border-km-line bg-km-soft p-3 text-km-body">
          <p className="flex items-center gap-2 font-semibold text-km-text">
            <Radio className="h-3.5 w-3.5 text-km-red" />
            {signal.type_signal}
            <ArrowRight className="h-3.5 w-3.5 text-km-muted" />
            Opportunité
          </p>
          <p className="mt-1 text-km-muted">
            Site : {signal.site_nom}
            {site?.compte_nom ? ` · Compte : ${site.compte_nom}` : ''}
          </p>
        </div>

        {aucunContact ? (
          <p className="rounded-km-md border border-dashed border-km-line bg-km-soft p-3 text-km-body text-km-muted">
            Ce compte n’a aucun contact. Une opportunité ne peut pas être lancée sans contact — c’est
            le minimum posé par Michel. Ajoutez d’abord un contact sur le compte, puis revenez ici.
          </p>
        ) : (
          <FormField label="Contact (obligatoire)">
            <Select value={contactId} onChange={(e) => setContactId(e.target.value)}>
              <option value="">Choisir le contact…</option>
              {decisionnaires.map((c) => (
                <option key={c.id} value={c.id}>
                  {[c.prenom, c.nom].filter(Boolean).join(' ')}
                  {c.role ? ` — ${c.role}` : ''}
                  {c.fonction ? ` (${c.fonction})` : ''}
                </option>
              ))}
            </Select>
          </FormField>
        )}

        <FormField label="Contexte (facultatif)">
          <Textarea
            rows={3}
            value={commentaire}
            onChange={(e) => setCommentaire(e.target.value)}
            placeholder="Ce que le signal révèle, ce qui a été dit au téléphone…"
          />
        </FormField>

        <p className="text-km-label text-km-muted">
          Le périmètre — sites et compteurs — se définit ensuite, au palier « En qualification ».
        </p>

        {erreur && (
          <p className="rounded-km-md border border-red-200 bg-km-red-soft px-3 py-2 text-km-body text-red-700">{erreur}</p>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="ghost" onClick={onFermer}>Annuler</Button>
          <Button type="button" disabled={!contactId || enCours || aucunContact} onClick={convertir}>
            {enCours ? 'Création…' : 'Valider et créer l’opportunité'}
          </Button>
        </div>
      </div>
    </Dialog>
  )
}
