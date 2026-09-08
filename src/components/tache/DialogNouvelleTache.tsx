import { useEffect, useState } from 'react'
import { Check, Clock, FileText, Mail, Phone, X } from 'lucide-react'
import { Dialog } from '@/components/ui/dialog'
import { FormField, Input, Select, Textarea } from '@/components/ui/form'
import { ChoixParRecherche } from '@/components/ui/choix-recherche'
import type { Contact, Site } from '@/types/domain'
import { Button } from '@/components/ui/button'
import { instantTache } from '@/lib/heureTache'
import { estIdReel } from '@/lib/referenceFallbacks'
import { useCreateAction } from '@/lib/data/actions'
import { useSites } from '@/lib/data/sites'
import { useContacts, useContactsParCompte } from '@/lib/data/contacts'
import { useReferenceTable } from '@/lib/data/referenceTables'
import { FALLBACK_TYPES_ACTIONS, FALLBACK_STATUTS_ACTIONS } from '@/lib/referenceFallbacks'
import { cn } from '@/lib/utils'

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
 * UN SEUL FORMULAIRE POUR LES QUATRE OBJETS. Il vivait en local dans la page Tâches. Le recopier
 * aurait produit des formulaires qui divergent — et les garde-fous ci-dessous (statut et type
 * obligatoires en base) sont exactement le genre de détail qu'une copie perd.
 */
export interface RattachementTache {
  recommandation_id?: string | null
  recommandation_titre?: string
  opportunite_id?: string | null
  piste_id?: string | null
  suivi_contrat_id?: string | null
  requete_id?: string | null
  site_id?: string | null
  site_nom?: string
  contact_id?: string | null
  contact_nom?: string
  /** Le compte du dossier : il restreint la liste des contacts proposés à ceux qui le concernent. */
  compte_id?: string | null
  /** Le nom de l'objet, seul — « KIWEE ENERGIE FRANCE », pas « la recommandation KIWEE… ». */
  objet_nom?: string
}

/**
 * ══ TROIS TYPES, ET TROIS SEULEMENT ══
 *
 * William, 07/09/2026 : « le champ type doit avoir uniquement 3 valeurs possibles : Appel / Mail /
 * Livrable et doit être obligatoire ».
 *
 * LA RESTRICTION EST CELLE DU FORMULAIRE, PAS CELLE DE LA BASE. Le référentiel compte 22 types, et
 * les dix-neuf autres sont les étapes du suivi de contrat, écrites par la fonction
 * `creer_suivi_contrat` — 142 tâches en portent. Les désactiver aurait arrêté cette automatisation.
 * Un humain choisit donc entre trois gestes, la machine suit son processus en vingt-deux étapes, et
 * les deux écrivent dans la même table. Voir la migration 20260907320000.
 *
 * ON DÉSIGNE PAR LE CODE, JAMAIS PAR LE LIBELLÉ : les libellés ont justement été raccourcis
 * (« Appeler le contact » → « Appel ») et le seront peut-être encore ; les codes, non.
 */
const TYPES_MANUELS = [
  {
    code: 'APPELER',
    libelle: 'Appel',
    aide: 'Joindre le contact',
    icone: Phone,
    choisi: 'border-km-green bg-km-green-soft text-km-green',
    pastille: 'bg-km-green/20 text-km-green',
  },
  {
    code: 'ENVOYER_EMAIL',
    libelle: 'Mail',
    aide: 'Écrire au contact',
    icone: Mail,
    choisi: 'border-km-blue bg-km-blue-soft text-km-blue',
    pastille: 'bg-km-blue/20 text-km-blue',
  },
  {
    // « Un document à produire et à envoyer » — définition donnée par William le 07/09/2026. Aucun
    // autre type ne décrivait la NATURE du travail : les dix-neuf autres décrivent des étapes.
    code: 'LIVRABLE',
    libelle: 'Livrable',
    aide: 'Produire un document',
    icone: FileText,
    choisi: 'border-km-violet bg-km-violet/10 text-km-violet',
    pastille: 'bg-km-violet/20 text-km-violet',
  },
]

/**
 * LE FORMULAIRE SEUL, SANS SON HABILLAGE.
 *
 * Il s'affiche dans deux contextes depuis le 07/09/2026 : dans le panneau qui monte du bas du volet
 * d'activité (`ActivityFeed`), et dans la fenêtre modale ci-dessous — que gardent la page Tâches et
 * les fiches qui n'ont pas de volet. Un formulaire recopié dans les deux aurait divergé au premier
 * champ ajouté, et les garde-fous du type et du statut sont précisément ce qu'une copie perd.
 */
export function FormulaireTache({
  rattachement,
  titrePrerempli,
  echeanceParDefaut,
  signaler,
  onFini,
  compact,
}: {
  /** Absent : création libre (page Tâches), avec sélecteurs de site et de contact. */
  rattachement?: RattachementTache
  titrePrerempli?: string
  /** Date ISO pour préremplir l'échéance. */
  echeanceParDefaut?: string
  signaler?: (message: string) => void
  /** Appelé à la création réussie comme à l'annulation : c'est l'appelant qui sait quoi refermer. */
  onFini: () => void
  /** Vrai dans le panneau du volet, large de 324 px : les lignes d'aide des types y sont retirées. */
  compact?: boolean
}) {
  const libre = !rattachement
  const { data: sites } = useSites()
  const { data: tousContacts } = useContacts()
  // LES CONTACTS DU COMPTE, PAS LES 3 000 DE LA BASE. Depuis une fiche, le compte est connu : offrir
  // la liste entière obligerait à chercher un nom parmi tous les clients de KiWee.
  const { data: contactsDuCompte } = useContactsParCompte(rattachement?.compte_id ?? undefined)
  const contacts = rattachement?.compte_id ? contactsDuCompte : tousContacts
  const { data: typesRef } = useReferenceTable('types_actions')
  const types = typesRef && typesRef.length > 0 ? typesRef : FALLBACK_TYPES_ACTIONS
  const { data: statutsRef } = useReferenceTable('statuts_actions')
  const statuts = statutsRef && statutsRef.length > 0 ? statutsRef : FALLBACK_STATUTS_ACTIONS
  const createAction = useCreateAction()

  const defautDate = echeanceParDefaut ? echeanceParDefaut.slice(0, 10) : ''
  const defautHeure = echeanceParDefaut ? echeanceParDefaut.slice(11, 16) : ''

  const [titre, setTitre] = useState(titrePrerempli ?? '')
  const [codeType, setCodeType] = useState('')
  const [siteId, setSiteId] = useState(rattachement?.site_id ?? '')
  const [contactId, setContactId] = useState(rattachement?.contact_id ?? '')
  const [echeance, setEcheance] = useState(defautDate)
  const [heure, setHeure] = useState(defautHeure)
  // L'HEURE EST FACULTATIVE, ET C'EST MAINTENANT UN CHOIX VISIBLE. La plupart des tâches sont des
  // « à faire », pas des rendez-vous : sans heure, l'échéance vaut minuit et ne s'affiche nulle
  // part comme une heure (voir `TachesOuvertes`).
  const [heureActive, setHeureActive] = useState(Boolean(defautHeure))
  const [commentaire, setCommentaire] = useState('')
  const [feedback, setFeedback] = useState<string | null>(null)

  // Le contact du dossier arrive parfois APRÈS l'ouverture du formulaire — la requête des contacts
  // n'a pas toujours répondu quand on clique. Sans cet effet, le champ resterait vide alors que la
  // fiche connaît son contact principal.
  useEffect(() => {
    if (!contactId && rattachement?.contact_id) setContactId(rattachement.contact_id)
  }, [contactId, rattachement?.contact_id])

  function reset() {
    setTitre(titrePrerempli ?? '')
    setCodeType('')
    setSiteId(rattachement?.site_id ?? '')
    setContactId(rattachement?.contact_id ?? '')
    setEcheance(defautDate)
    setHeure(defautHeure)
    setHeureActive(Boolean(defautHeure))
    setCommentaire('')
    setFeedback(null)
  }

  function fermer() {
    reset()
    onFini()
  }

  async function envoyer(e: React.FormEvent) {
    e.preventDefault()
    const type = types.find((t) => t.code === codeType)
    const site = sites?.find((s) => s.id === siteId)
    const contact = contacts?.find((c) => c.id === contactId)
    const statutAFaire = statuts.find((s) => s.code === 'A_FAIRE')

    // LE TYPE EST OBLIGATOIRE EN BASE (`actions.type_action_id` NOT NULL sans valeur par défaut), et
    // les trois cartes ne sont pas un `<select required>` : c'est donc ici que la règle se tient.
    if (!estIdReel(type?.id)) {
      setFeedback('Choisissez un type de tâche : Appel, Mail ou Livrable.')
      return
    }
    // Même garde pour le statut, qui vient aussi d'une table de référence : un identifiant de repli
    // serait refusé par Postgres, et l'écran annoncerait une tâche qui n'existe pas.
    if (!estIdReel(statutAFaire?.id)) {
      setFeedback('Les statuts de tâche ne sont pas chargés : rechargez la page avant de créer la tâche.')
      return
    }

    try {
      const result = await createAction.mutateAsync({
        titre,
        type_action_id: type?.id ?? null,
        type_action_libelle: type?.libelle ?? '',
        site_id: siteId || null,
        site_nom: site?.nom ?? rattachement?.site_nom ?? '',
        contact_id: contactId || null,
        contact_nom: contact ? `${contact.prenom} ${contact.nom}` : (rattachement?.contact_nom ?? ''),
        priorite: 50,
        echeance: instantTache(echeance, heureActive ? heure : ''),
        commentaire: commentaire || null,
        statut_id: statutAFaire?.id ?? null,
        recommandation_id: rattachement?.recommandation_id ?? null,
        recommandation_titre: rattachement?.recommandation_titre ?? '',
        opportunite_id: rattachement?.opportunite_id ?? null,
        piste_id: rattachement?.piste_id ?? null,
        suivi_contrat_id: rattachement?.suivi_contrat_id ?? null,
        requete_id: rattachement?.requete_id ?? null,
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
    /* ══ LE FORMULAIRE TIENT DANS LA HAUTEUR QU'ON LUI DONNE ══
       William, 07/09/2026 : « je dois toujours pouvoir voir les boutons Annuler et Créer la tâche
       en bas de l'écran, jamais coupés ou masqués ».

       D'où trois étages : les champs défilent seuls au milieu, le pied reste collé en bas. Dans le
       panneau du volet, `h-full` prend la hauteur disponible ; dans la fenêtre modale, où rien ne
       borne la hauteur, `flex-1` se contente du contenu et le pied suit naturellement. Le même
       balisage sert les deux, sans réglage à choisir. */
    <form onSubmit={envoyer} className="flex h-full min-h-0 flex-col">
      <div className="min-h-0 flex-1 space-y-3.5 overflow-y-auto pr-0.5">
        <FormField label="Titre" required>
          <Input value={titre} onChange={(e) => setTitre(e.target.value)} required placeholder="Ex. Relancer le client" />
        </FormField>

        {/* ══ LE TYPE SE CHOISIT, IL NE SE DÉROULE PAS ══
            Trois valeurs derrière un menu, c'est un clic pour découvrir ce qu'on aurait pu lire
            d'emblée — et un `<select>` ouvert est dessiné par le système, hors de la page, donc
            hors de notre charte (c'est la raison d'être de `MenuChoix` ailleurs dans l'app).
            Chaque carte porte sa couleur : le vert de l'appel, le bleu du courriel, le violet du
            livrable — les mêmes teintes que le fil d'activité leur donne. */}
        <div>
          <p className="mb-1.5 block text-km-label font-semibold text-km-muted">
            Type<span className="ml-0.5 text-red-500">*</span>
          </p>
          <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Type de tâche">
            {TYPES_MANUELS.map((t) => {
              const actif = codeType === t.code
              const Icone = t.icone
              return (
                <button
                  key={t.code}
                  type="button"
                  role="radio"
                  aria-checked={actif}
                  onClick={() => setCodeType(t.code)}
                  title={t.aide}
                  className={cn(
                    'group relative flex flex-col items-center gap-1 rounded-km-md border px-1.5 py-2.5 transition-all duration-150',
                    'hover:-translate-y-px hover:shadow-km-card active:translate-y-0 active:scale-[0.98]',
                    actif ? t.choisi : 'border-km-line bg-km-surface text-km-muted',
                  )}
                >
                  {actif && (
                    <span className="animate-km-fade absolute right-1 top-1">
                      <Check className="h-3 w-3" />
                    </span>
                  )}
                  <span
                    className={cn(
                      'flex h-7 w-7 items-center justify-center rounded-full transition-colors',
                      actif ? t.pastille : 'bg-km-soft text-km-faint group-hover:text-km-muted',
                    )}
                  >
                    <Icone className="h-3.5 w-3.5" />
                  </span>
                  <span className="text-km-label font-semibold">{t.libelle}</span>
                  {/* LA LIGNE D'AIDE DISPARAÎT DANS LE VOLET. William, 07/09/2026 : « quand le volet
                      est trop étroit, masque les textes sous les boutons ». À 95 px de large, « Joindre
                      le contact » tient sur trois lignes et pousse la carte à 90 px de haut, pour dire
                      ce que l'icône du téléphone disait déjà. Elle survit en info-bulle. */}
                  {!compact && <span className="text-km-tiny leading-tight text-km-faint">{t.aide}</span>}
                </button>
              )
            })}
          </div>
        </div>

        {/* ══ L'ÉCHÉANCE ET SON HEURE SUR UNE SEULE LIGNE ══
            Demandé par William le 07/09/2026. Le bouton « + heure » occupe la place du champ tant
            qu'on n'en veut pas : la ligne ne change jamais de hauteur, et l'heure n'apparaît que
            lorsqu'elle a un sens. Il reste désactivé sans date — une heure sans jour ne dit rien. */}
        <div>
          <p className="mb-1.5 block text-km-label font-semibold text-km-muted">Échéance</p>
          <div className="flex items-center gap-2">
            <Input
              type="date"
              value={echeance}
              onChange={(e) => setEcheance(e.target.value)}
              className="min-w-0 flex-1"
              aria-label="Date d’échéance"
            />
            {heureActive ? (
              <div className="animate-km-fade flex shrink-0 items-center gap-1">
                <Input
                  type="time"
                  value={heure}
                  onChange={(e) => setHeure(e.target.value)}
                  className="w-[92px]"
                  aria-label="Heure de rappel"
                />
                <button
                  type="button"
                  onClick={() => { setHeureActive(false); setHeure('') }}
                  aria-label="Retirer l’heure"
                  className="flex h-6 w-6 items-center justify-center rounded-km-sm text-km-faint transition-colors hover:bg-km-soft hover:text-km-text"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => { setHeureActive(true); if (!heure) setHeure('09:00') }}
                disabled={!echeance}
                title={echeance ? 'Ajouter une heure de rappel' : 'Posez d’abord une date'}
                className="inline-flex h-[34px] shrink-0 items-center gap-1.5 rounded-km border border-km-line bg-km-surface px-2.5 text-km-label font-semibold text-km-muted transition-colors hover:bg-km-soft hover:text-km-text disabled:opacity-40"
              >
                <Clock className="h-3.5 w-3.5" />
                Heure
              </button>
            )}
          </div>
        </div>

        {/* LE RATTACHEMENT NE S'AFFICHE PLUS. Il tenait une ligne entière pour répéter le nom du
            dossier qu'on a sous les yeux — la fiche est ouverte derrière le panneau. La tâche y est
            toujours rattachée, c'est simplement l'écran qui cesse de le redire (William, 07/09). */}
        {/* ══ UNE TÂCHE LIBRE CHERCHE DANS TOUT LE PARC ════════════════════════════════════════
            Sans dossier derrière elle, ces deux champs portaient les 6 374 sites et les 3 401
            contacts de la base — deux listes déroulantes impraticables. Voir `ChoixParRecherche`.
            Le champ Contact du cas contraire reste un `<select>` : il est déjà restreint aux
            contacts du compte du dossier, et une poignée de noms se lit mieux déroulée. */}
        {libre ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <FormField label="Site (optionnel)">
              <ChoixParRecherche<Site>
                items={sites ?? []}
                valeur={siteId}
                onChoisir={(s) => setSiteId(s?.id ?? '')}
                placeholder="Chercher un site…"
                principal={(s) => s.nom}
                secondaire={(s) => [s.compte_nom, [s.code_postal, s.ville].filter(Boolean).join(' ')].filter(Boolean).join(' · ') || null}
                filtre={(s, q) => s.nom.toLowerCase().includes(q) || (s.ville ?? '').toLowerCase().includes(q) || (s.code_postal ?? '').includes(q) || (s.compte_nom ?? '').toLowerCase().includes(q)}
                totalLibelle={`${(sites ?? []).length} sites`}
              />
            </FormField>
            <FormField label="Contact (optionnel)">
              <ChoixParRecherche<Contact>
                items={contacts ?? []}
                valeur={contactId}
                onChoisir={(c) => setContactId(c?.id ?? '')}
                placeholder="Chercher un contact…"
                principal={(c) => `${c.prenom ?? ''} ${c.nom ?? ''}`.trim() || '(sans nom)'}
                secondaire={(c) => [c.fonction, c.compte_nom].filter(Boolean).join(' · ') || null}
                filtre={(c, q) =>
                  `${c.prenom ?? ''} ${c.nom ?? ''}`.toLowerCase().includes(q) ||
                  (c.compte_nom ?? '').toLowerCase().includes(q) ||
                  (c.email ?? '').toLowerCase().includes(q)
                }
                totalLibelle={`${(contacts ?? []).length} contacts`}
              />
            </FormField>
          </div>
        ) : (
          <FormField label="Contact">
            <Select value={contactId} onChange={(e) => setContactId(e.target.value)}>
              <option value="">Aucun contact</option>
              {contacts?.map((c) => <option key={c.id} value={c.id}>{c.prenom} {c.nom}</option>)}
            </Select>
          </FormField>
        )}

        <FormField label="Commentaire">
          <Textarea rows={2} value={commentaire} onChange={(e) => setCommentaire(e.target.value)} />
        </FormField>

        {feedback && <p className="text-xs text-km-muted">{feedback}</p>}
      </div>

      <div className="mt-3 flex shrink-0 justify-end gap-2 border-t border-km-line pt-3">
        <Button type="button" variant="ghost" onClick={fermer}>Annuler</Button>
        <Button type="submit" variant="primary" disabled={createAction.isPending}>
          {createAction.isPending ? 'Création…' : 'Créer la tâche'}
        </Button>
      </div>
    </form>
  )
}

/**
 * LE MÊME FORMULAIRE, EN FENÊTRE MODALE.
 *
 * C'est le chemin de la page Tâches (création libre, sans dossier de rattachement) et le repli des
 * écrans étroits, où le volet d'activité n'existe pas — en dessous de 1024 px il disparaît et le fil
 * repasse dans la colonne principale, sans zone à recouvrir.
 */
export function DialogNouvelleTache({
  open,
  onClose,
  ...reste
}: {
  open: boolean
  onClose: () => void
  rattachement?: RattachementTache
  titrePrerempli?: string
  echeanceParDefaut?: string
  signaler?: (message: string) => void
}) {
  return (
    <Dialog open={open} onClose={onClose} title="Nouvelle tâche">
      <FormulaireTache {...reste} onFini={onClose} />
    </Dialog>
  )
}
