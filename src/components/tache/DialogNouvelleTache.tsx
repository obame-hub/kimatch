import { useState } from 'react'
import { Dialog } from '@/components/ui/dialog'
import { FormField, Input, Select, Textarea } from '@/components/ui/form'
import { Button } from '@/components/ui/button'
import { instantTache } from '@/lib/heureTache'
import { estIdReel } from '@/lib/referenceFallbacks'
import { useCreateAction } from '@/lib/data/actions'
import { useSites } from '@/lib/data/sites'
import { useContacts } from '@/lib/data/contacts'
import { useReferenceTable } from '@/lib/data/referenceTables'
import { FALLBACK_TYPES_ACTIONS, FALLBACK_STATUTS_ACTIONS } from '@/lib/referenceFallbacks'

/**
 * CRÉER UNE TÂCHE, DEPUIS N'IMPORTE QUEL OBJET DU CYCLE.
 *
 * Michel, 31/08/2026 : « permettre de créer et de suivre des actions dans les recommandations, les
 * opportunités et les pistes ».
 *
 * CE QUI NE MARCHAIT PAS, ET POURQUOI PERSONNE NE L'AVAIT VU. Le bouton « Créer une tâche » du bloc
 * « Actions rapides » d'une opportunité écrivait une INTERACTION de type NOTE_INTERNE. L'écran
 * répondait « consigné dans le flux », la note apparaissait, tout avait l'air de fonctionner — mais
 * la table `actions` ne recevait rien. Mesure du 31/08/2026 : 11 tâches en base, 11 rattachées à une
 * recommandation, ZÉRO à une opportunité, ZÉRO à une piste. Le bouton mentait.
 *
 * UN SEUL FORMULAIRE POUR LES TROIS OBJETS. Il vivait en local dans la page Tâches. Le recopier trois
 * fois aurait produit trois formulaires qui divergent — et les deux garde-fous ci-dessous (statut et
 * type obligatoires en base) sont exactement le genre de détail qu'une copie perd.
 *
 * LE RATTACHEMENT N'EST PAS UN CHAMP À REMPLIR. Quand on ouvre ce dialogue depuis une fiche, l'objet
 * est connu : on l'affiche, on ne le redemande pas. Le site et le contact sont pré-remplis par la
 * fiche, et les sélecteurs ne réapparaissent qu'en création libre, depuis la page Tâches.
 */
export interface RattachementTache {
  recommandation_id?: string | null
  recommandation_titre?: string
  opportunite_id?: string | null
  piste_id?: string | null
  site_id?: string | null
  site_nom?: string
  contact_id?: string | null
  contact_nom?: string
  /** Ce qu'on affiche à la place des sélecteurs : « l'opportunité Boulangerie Martin ». */
  libelle_cible: string
}

export function DialogNouvelleTache({
  open,
  onClose,
  rattachement,
  titrePrerempli,
  echeanceParDefaut,
  signaler,
}: {
  open: boolean
  onClose: () => void
  /** Absent : création libre (page Tâches), avec sélecteurs de site et de contact. */
  rattachement?: RattachementTache
  titrePrerempli?: string
  /** Date ISO pour préremplir l'échéance — sert au « Planifier un rappel » (demain 9 h). */
  echeanceParDefaut?: string
  signaler?: (message: string) => void
}) {
  const libre = !rattachement
  const { data: sites } = useSites()
  const { data: contacts } = useContacts()
  const { data: typesRef } = useReferenceTable('types_actions')
  const types = typesRef && typesRef.length > 0 ? typesRef : FALLBACK_TYPES_ACTIONS
  const { data: statutsRef } = useReferenceTable('statuts_actions')
  const statuts = statutsRef && statutsRef.length > 0 ? statutsRef : FALLBACK_STATUTS_ACTIONS
  const createAction = useCreateAction()

  const defautDate = echeanceParDefaut ? echeanceParDefaut.slice(0, 10) : ''
  const defautHeure = echeanceParDefaut ? echeanceParDefaut.slice(11, 16) : ''

  const [titre, setTitre] = useState(titrePrerempli ?? '')
  const [typeId, setTypeId] = useState('')
  const [siteId, setSiteId] = useState(rattachement?.site_id ?? '')
  const [contactId, setContactId] = useState(rattachement?.contact_id ?? '')
  const [echeance, setEcheance] = useState(defautDate)
  // L'HEURE EST FACULTATIVE : la plupart des tâches sont des « à faire », pas des rendez-vous.
  // Laissée vide, l'échéance vaut minuit local et « Ma journée » n'affiche pas d'heure.
  const [heure, setHeure] = useState(defautHeure)
  const [commentaire, setCommentaire] = useState('')
  const [feedback, setFeedback] = useState<string | null>(null)

  function reset() {
    setTitre(titrePrerempli ?? '')
    setTypeId('')
    setSiteId(rattachement?.site_id ?? '')
    setContactId(rattachement?.contact_id ?? '')
    setEcheance(defautDate)
    setHeure(defautHeure)
    setCommentaire('')
    setFeedback(null)
  }

  function fermer() {
    reset()
    onClose()
  }

  async function envoyer(e: React.FormEvent) {
    e.preventDefault()
    const type = types.find((t) => t.id === typeId)
    const site = sites?.find((s) => s.id === siteId)
    const contact = contacts?.find((c) => c.id === contactId)
    const statutAFaire = statuts.find((s) => s.code === 'A_FAIRE')

    // LE STATUT EST OBLIGATOIRE EN BASE (`actions.statut_id` NOT NULL, sans valeur par défaut) et il
    // vient d'une table de référence. Si cette table n'a pas répondu, on tient un identifiant de
    // repli que Postgres refusera — mieux vaut le dire tout de suite que créer une tâche fantôme.
    if (!estIdReel(statutAFaire?.id)) {
      setFeedback('Les statuts de tâche ne sont pas chargés : rechargez la page avant de créer la tâche.')
      return
    }

    try {
      const result = await createAction.mutateAsync({
        titre,
        type_action_id: typeId || null,
        type_action_libelle: type?.libelle ?? '',
        site_id: siteId || null,
        site_nom: site?.nom ?? rattachement?.site_nom ?? '',
        contact_id: contactId || null,
        contact_nom: contact ? `${contact.prenom} ${contact.nom}` : (rattachement?.contact_nom ?? ''),
        priorite: 50,
        echeance: instantTache(echeance, heure),
        commentaire: commentaire || null,
        statut_id: statutAFaire?.id ?? null,
        recommandation_id: rattachement?.recommandation_id ?? null,
        recommandation_titre: rattachement?.recommandation_titre ?? '',
        opportunite_id: rattachement?.opportunite_id ?? null,
        piste_id: rattachement?.piste_id ?? null,
      })
      const message = result.persisted
        ? '✓ Tâche créée'
        : 'Tâche ajoutée localement (non synchronisée avec Supabase).'
      if (signaler) {
        signaler(message)
        fermer()
        return
      }
      setFeedback(message)
      setTimeout(fermer, 700)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Création impossible'
      if (signaler) signaler(`Erreur : ${message}`)
      else setFeedback(message)
    }
  }

  return (
    <Dialog
      open={open}
      onClose={fermer}
      title="Nouvelle tâche"
      description={rattachement ? `Rattachée à ${rattachement.libelle_cible}` : 'Ajouter une tâche à faire.'}
    >
      <form onSubmit={envoyer} className="space-y-3">
        <FormField label="Titre">
          <Input value={titre} onChange={(e) => setTitre(e.target.value)} required placeholder="Ex. Relancer le client" />
        </FormField>
        <div className="grid grid-cols-2 gap-3">
          <FormField label="Type">
            {/* OBLIGATOIRE : `actions.type_action_id` est NOT NULL sans valeur par défaut. Laissé
                vide, il était simplement omis de l'insertion, la base refusait la ligne, et l'écran
                annonçait « ajoutée localement » — la tâche n'existait pas. */}
            <Select value={typeId} onChange={(e) => setTypeId(e.target.value)} required>
              <option value="">Sélectionner…</option>
              {types.map((t) => <option key={t.id} value={t.id}>{t.libelle}</option>)}
            </Select>
          </FormField>
          <FormField label="Échéance">
            <div className="flex gap-2">
              <Input type="date" value={echeance} onChange={(e) => setEcheance(e.target.value)} />
              {/* L'heure ne s'active qu'une fois la date posée : une heure sans jour ne veut rien
                  dire, et un champ actif qui ne sera pas enregistré est un piège. */}
              <Input
                type="time"
                value={heure}
                disabled={!echeance}
                onChange={(e) => setHeure(e.target.value)}
                className="w-[110px]"
                title="Heure facultative — sans elle, la tâche est simplement datée du jour"
              />
            </div>
          </FormField>
        </div>
        {libre ? (
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Site (optionnel)">
              <Select value={siteId} onChange={(e) => setSiteId(e.target.value)}>
                <option value="">—</option>
                {sites?.map((s) => <option key={s.id} value={s.id}>{s.nom}</option>)}
              </Select>
            </FormField>
            <FormField label="Contact (optionnel)">
              <Select value={contactId} onChange={(e) => setContactId(e.target.value)}>
                <option value="">—</option>
                {contacts?.map((c) => <option key={c.id} value={c.id}>{c.prenom} {c.nom}</option>)}
              </Select>
            </FormField>
          </div>
        ) : (
          /* Le rattachement est déjà connu : on le montre, on ne le redemande pas. Le rappeler ici
             répond à la seule question qui reste au moment de valider — où va cette tâche. */
          <p className="rounded-km border border-km-line bg-km-soft px-2.5 py-2 text-km-label text-km-muted">
            Cette tâche sera rattachée à <span className="font-bold text-km-text">{rattachement.libelle_cible}</span>
            {rattachement.site_nom ? ` · site ${rattachement.site_nom}` : ''}
            {rattachement.contact_nom ? ` · ${rattachement.contact_nom}` : ''}
          </p>
        )}
        <FormField label="Commentaire">
          <Textarea rows={2} value={commentaire} onChange={(e) => setCommentaire(e.target.value)} />
        </FormField>
        {feedback && <p className="text-xs text-km-muted">{feedback}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="ghost" onClick={fermer}>Annuler</Button>
          <Button type="submit" disabled={createAction.isPending}>Créer la tâche</Button>
        </div>
      </form>
    </Dialog>
  )
}
