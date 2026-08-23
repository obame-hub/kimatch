import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Target } from 'lucide-react'
import { Topbar } from '@/components/layout/Topbar'
import { PageHeader } from '@/components/ui/page-header'
import { Card } from '@/components/ui/card'
import { ChoixParRecherche } from '@/components/ui/choix-recherche'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Dialog } from '@/components/ui/dialog'
import { FormField, Input, Select, Textarea } from '@/components/ui/form'
import { ListToolbar } from '@/components/ui/list-toolbar'
import { PiedDeListe } from '@/components/ui/pied-de-liste'
import { EntityLink } from '@/components/ui/entity-link'
import { useTranchesAffichage } from '@/lib/useTranchesAffichage'
import { useListControls } from '@/lib/useListControls'
import {
  statutDerive,
  TON_PIPELINE,
  type MandatPourCouverture,
  useOpportunites,
  useStatutsOpportunites,
  useCreerOpportunite,
  ORIGINES_OPPORTUNITE,
} from '@/lib/data/opportunites'
import { useContacts } from '@/lib/data/contacts'
import { useMandats } from '@/lib/data/mandats'
import { cn } from '@/lib/utils'
import type { Opportunite } from '@/types/domain'

/**
 * Les signaux positifs, tels que Michel les énumère : « échéance connue à moins de 2 ans, demande
 * explicite du client, marché favorable, potentiel d'optimisation TURPE, autre besoin commercial
 * concret ». Proposés en un clic parce que ce sont les quatre cinquièmes des cas ; le champ reste
 * libre pour le reste.
 */
const SIGNAUX_EXEMPLES = [
  'Échéance de contrat à moins de 2 ans',
  'Demande explicite du client',
  'Marché favorable',
  "Potentiel d'optimisation TURPE",
  'Autre besoin commercial',
]

/**
 * La liste des opportunités.
 *
 * Mémo de Michel, 23/08/2026 : « la priorité est d'avoir une première version simple et
 * opérationnelle de l'objet Opportunité afin que l'équipe puisse commencer à travailler dessus la
 * semaine prochaine. »
 *
 * CE QUE LA CARTE MONTRE, ET POURQUOI. Le compte et l'origine disent d'où vient l'affaire ; le
 * statut, où elle en est ; le périmètre, son ampleur ; la prochaine action et son échéance, ce qu'il
 * reste à faire. Une opportunité dont l'échéance est passée le dit en rouge : c'est le seul chiffre
 * qui commande une action aujourd'hui.
 */

/** Le ton de la pastille par statut : le vert pour ce qui avance, l'ambre pour ce qui attend. */

function CarteOpportunite({ opportunite, mandats }: { opportunite: Opportunite; mandats: MandatPourCouverture[] }) {
  const navigate = useNavigate()
  // LE MÊME PALIER QUE SUR LA FICHE, calculé par la même fonction : une liste qui annoncerait
  // « À valider » sur une opportunité que la fiche montre « À compléter » ne servirait à rien.
  const palier = statutDerive(opportunite, mandats)
  const origine = ORIGINES_OPPORTUNITE.find((o) => o.code === opportunite.origine)
  const retard = echeanceEnRetard(opportunite.prochaine_action_echeance, opportunite.prochaine_action_faite_le)

  return (
    <Card
      className="animate-fade-up cursor-pointer p-3.5 transition-all hover:-translate-y-0.5 hover:shadow-lg"
      onClick={() => navigate(`/opportunites/${opportunite.id}`)}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-navy-800">
            {opportunite.compte_id ? (
              <EntityLink to={`/comptes/${opportunite.compte_id}`}>{opportunite.compte_nom}</EntityLink>
            ) : (
              <span className="text-navy-400">Compte à identifier</span>
            )}
          </p>
          <p className="mt-0.5 truncate text-xs text-navy-500">
            {[opportunite.reference, origine?.libelle, opportunite.type_opportunite].filter(Boolean).join(' · ') || '—'}
          </p>
        </div>
        <Badge tone={TON_PIPELINE[palier.code] ?? 'neutral'}>{palier.libelle}</Badge>
      </div>

      <div className="mt-2.5 space-y-1 text-xs text-navy-500">
        <p>
          {opportunite.site_ids.length} site{opportunite.site_ids.length > 1 ? 's' : ''} ·{' '}
          {opportunite.compteur_ids.length} compteur{opportunite.compteur_ids.length > 1 ? 's' : ''}
          {opportunite.recommandation_ids.length > 0 && (
            <> · {opportunite.recommandation_ids.length} recommandation{opportunite.recommandation_ids.length > 1 ? 's' : ''}</>
          )}
        </p>
        <p className="text-navy-400">{palier.tache}</p>
        {opportunite.prochaine_action && (
          <p className={cn(retard && 'font-semibold text-red-600')}>
            {opportunite.prochaine_action}
            {opportunite.prochaine_action_echeance && (
              <> — {new Date(opportunite.prochaine_action_echeance).toLocaleDateString('fr-FR')}</>
            )}
          </p>
        )}
        {opportunite.qualification_fin && (
          <p className="text-navy-400">Clôturée : {opportunite.qualification_fin.toLowerCase().replace('_', ' ')}</p>
        )}
      </div>
    </Card>
  )
}

/** Une échéance dépassée et non faite : le seul état de la liste qui commande d'agir aujourd'hui. */
function echeanceEnRetard(echeance: string | null, faiteLe: string | null): boolean {
  if (!echeance || faiteLe) return false
  const j = new Date(echeance)
  if (Number.isNaN(j.getTime())) return false
  const aujourdhui = new Date()
  aujourdhui.setHours(0, 0, 0, 0)
  return j.getTime() < aujourdhui.getTime()
}

export default function Opportunites() {
  const { data: opportunites, isLoading } = useOpportunites()
  // Les mandats disent si le périmètre est couvert, donc où se situe chaque opportunité dans le
  // pipeline. Le même hook alimente les fiches : la requête est le plus souvent déjà en cache.
  const { data: mandats } = useMandats()
  const [creation, setCreation] = useState(false)

  const controles = useListControls(opportunites, {
    searchFields: (o) => [o.compte_nom, o.reference, o.contact_nom, o.type_opportunite],
    sorters: {
      recentes: (a, b) => (b.date_creation ?? '').localeCompare(a.date_creation ?? ''),
      compte: (a, b) => (a.compte_nom ?? '').localeCompare(b.compte_nom ?? ''),
      echeance: (a, b) => (a.prochaine_action_echeance ?? '9999').localeCompare(b.prochaine_action_echeance ?? '9999'),
    },
    defaultSort: 'recentes',
  })
  const filtrees = controles.items ?? []
  const tranche = useTranchesAffichage(filtrees, controles.query + controles.sortKey)

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <Topbar title="Opportunités" />
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 lg:px-6">
        <PageHeader
          icone={<Target className="h-[19px] w-[19px]" strokeWidth={2.1} />}
          teinte="from-opp-600 to-opp-400"
          title="Opportunités"
          description="Un potentiel commercial concret, à faire mûrir jusqu'à la recommandation."
          actions={
            <Button size="sm" onClick={() => setCreation(true)}>
              <Plus className="h-3.5 w-3.5" />
              Nouvelle opportunité
            </Button>
          }
        />

        <ListToolbar
          query={controles.query}
          onQueryChange={controles.setQuery}
          placeholder="Rechercher un compte, une référence…"
          count={filtrees.length}
        >
          <Select value={controles.sortKey} onChange={(e) => controles.setSortKey(e.target.value)} className="w-auto">
            <option value="recentes">Les plus récentes</option>
            <option value="compte">Par compte</option>
            <option value="echeance">Par échéance</option>
          </Select>
        </ListToolbar>

        {isLoading ? (
          <p className="mt-4 text-sm text-navy-400">Chargement…</p>
        ) : filtrees.length === 0 ? (
          <Card className="mt-4 flex flex-col items-center gap-2 p-8 text-center">
            <Target className="h-6 w-6 text-navy-300" />
            <p className="text-sm font-medium text-navy-700">Aucune opportunité</p>
            <p className="max-w-md text-xs text-navy-400">
              Une opportunité naît d'une piste convertie, d'un signal sur le portefeuille, d'une demande
              entrante ou d'un partenaire. Créez-en une pour commencer à rassembler ses prérequis.
            </p>
          </Card>
        ) : (
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {tranche.visibles.map((o) => <CarteOpportunite key={o.id} opportunite={o} mandats={mandats ?? []} />)}
          </div>
        )}

        <PiedDeListe
          affiches={tranche.visibles.length}
          total={tranche.total}
          reste={tranche.reste}
          onAfficherPlus={tranche.afficherPlus}
          tailleTrancheSuivante={tranche.tailleTrancheSuivante}
          libelle="opportunités"
        />
      </div>

      {creation && <DialogCreation onFermer={() => setCreation(false)} />}
    </div>
  )
}

/**
 * La création : le strict nécessaire.
 *
 * On ne demande ni le périmètre ni le mandat : « tant qu'un de ces éléments manque, l'Opportunité
 * reste active, soit en qualification, soit en attente ». Rassembler les prérequis EST le travail de
 * l'opportunité — les exiger à la création reviendrait à interdire d'en créer une.
 */
function DialogCreation({ onFermer }: { onFermer: () => void }) {
  const navigate = useNavigate()
  const { data: contacts } = useContacts()
  const { data: statuts } = useStatutsOpportunites()
  const creer = useCreerOpportunite()

  const [compteId, setCompteId] = useState('')
  const [contactId, setContactId] = useState('')
  const [origine, setOrigine] = useState('')
  const [type, setType] = useState('')
  const [signal, setSignal] = useState('')
  const [commentaire, setCommentaire] = useState('')
  const [erreur, setErreur] = useState<string | null>(null)

  // LE MINIMUM POUR LANCER UNE OPPORTUNITÉ. Michel, 23/08/2026 : « il nous faut au minimum un signal
  // et un contact ». Deux, et seulement deux : le compte, le périmètre et le mandat se rassemblent
  // ensuite — c'est le travail de l'opportunité. Le compte suit toutefois le contact, puisqu'on
  // choisit un contact, qui appartient deja a un compte.
  const signalDonne = signal.trim().length > 0
  const minimumTenu = signalDonne && Boolean(contactId)

  async function valider() {
    setErreur(null)
    try {
      const id = await creer.mutateAsync({
        compte_id: compteId || null,
        contact_id: contactId || null,
        origine: origine || null,
        type_opportunite: type.trim() || null,
        statut_id: statuts?.find((s) => s.code === 'NOUVELLE')?.id ?? null,
        commentaire: commentaire.trim() || null,
        signal_libelle: signal.trim() || null,
      })
      onFermer()
      navigate(`/opportunites/${id}`)
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Création impossible')
    }
  }

  return (
    <Dialog
      open
      onClose={onFermer}
      title="Nouvelle opportunité"
      description="Un signal et un contact suffisent à la lancer. Le compte, le périmètre et le mandat se rassemblent ensuite : c'est le travail de l'opportunité."
    >
      <div className="space-y-3">
        {/* LE SIGNAL EN PREMIER, parce que c'est lui qui justifie l'opportunité. Les cinq exemples
            sont ceux de Michel, mot pour mot ; le champ reste libre pour le reste. */}
        <FormField label="Signal positif">
          <div className="flex flex-wrap gap-1.5">
            {SIGNAUX_EXEMPLES.map((e) => (
              <button
                key={e}
                type="button"
                onClick={() => setSignal(e)}
                className={cn(
                  'rounded-lg border px-2.5 py-1 text-xs transition-colors',
                  signal === e
                    ? 'border-kiwi-500 bg-kiwi-50 font-semibold text-kiwi-800'
                    : 'border-navy-200 text-navy-600 hover:bg-navy-50',
                )}
              >
                {e}
              </button>
            ))}
          </div>
          <Input
            value={signal}
            onChange={(e) => setSignal(e.target.value)}
            placeholder="…ou décrire le signal"
            className="mt-2"
          />
        </FormField>
        {/* DEUX PAR RANGÉE. Sur une seule colonne, le formulaire faisait 700 px de haut : le bouton
            « Créer l'opportunité » tombait sous la ligne de flottaison et n'était jamais visible à
            l'ouverture (mesuré à l'écran, viewport de 709 px). */}
        {/* LE CONTACT SE CHERCHE, ET LE COMPTE EN DÉCOULE.
            Deux listes déroulantes de 2 765 et 3 387 options (mesuré à l'écran) — le défaut signalé
            le 21/08 sur l'assistant de recommandation : « c'est encore une liste de sélection
            déroulante ». Et deux champs pour une seule information : un contact appartient à un
            compte, donc le choisir suffit à connaître les deux. C'est aussi ce que dit la règle de
            Michel — « au minimum un signal et un contact » : le compte n'est pas demandé, il suit. */}
        <FormField label="Contact">
          <ChoixParRecherche
            items={contacts ?? []}
            valeur={contactId}
            onChoisir={(c) => { setContactId(c?.id ?? ''); setCompteId(c?.compte_id ?? '') }}
            placeholder="Nom, compte ou courriel…"
            principal={(c) => `${c.prenom} ${c.nom}`}
            secondaire={(c) => [c.compte_nom, c.fonction].filter(Boolean).join(' · ') || null}
            filtre={(c, q) => [c.prenom, c.nom, c.compte_nom, c.email].some((v) => (v ?? '').toLowerCase().includes(q))}
            aucun="Aucun contact. Créez-le depuis Contacts, puis revenez ici."
            totalLibelle={`${(contacts ?? []).length} contacts`}
          />
        </FormField>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <FormField label="Origine">
            <Select value={origine} onChange={(e) => setOrigine(e.target.value)}>
              <option value="">Choisir…</option>
              {ORIGINES_OPPORTUNITE.map((o) => <option key={o.code} value={o.code}>{o.libelle}</option>)}
            </Select>
          </FormField>
          <FormField label="Type d’opportunité">
            <Select value={type} onChange={(e) => setType(e.target.value)}>
              <option value="">Choisir…</option>
              <option value="Captation">Captation</option>
              <option value="Renouvellement">Renouvellement</option>
              <option value="Optimisation">Optimisation</option>
            </Select>
          </FormField>
        </div>
        <FormField label="Commentaire">
          <Textarea value={commentaire} onChange={(e) => setCommentaire(e.target.value)} rows={2} placeholder="Le contexte, ce qu'on sait déjà…" />
        </FormField>

        {erreur && <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{erreur}</p>}

        {/* On dit CE QUI MANQUE, plutôt que de griser un bouton sans explication. */}
        {!minimumTenu && (
          <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            Il manque {!signalDonne && 'le signal'}
            {!signalDonne && !contactId && ' et '}
            {!contactId && 'le contact'} : c'est le minimum pour lancer une opportunité.
          </p>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="ghost" onClick={onFermer}>Annuler</Button>
          <Button type="button" onClick={valider} disabled={creer.isPending || !minimumTenu}>
            {creer.isPending ? 'Création…' : 'Créer l’opportunité'}
          </Button>
        </div>
      </div>
    </Dialog>
  )
}
