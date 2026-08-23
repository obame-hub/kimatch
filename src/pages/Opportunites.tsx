import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Target } from 'lucide-react'
import { Topbar } from '@/components/layout/Topbar'
import { PageHeader } from '@/components/ui/page-header'
import { Card } from '@/components/ui/card'
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
  useOpportunites,
  useStatutsOpportunites,
  useCreerOpportunite,
  ORIGINES_OPPORTUNITE,
} from '@/lib/data/opportunites'
import { useContacts } from '@/lib/data/contacts'
import { cn } from '@/lib/utils'
import type { Contact, Opportunite } from '@/types/domain'

/**
 * Choisir un contact parmi quelques milliers — et, avec lui, son compte.
 *
 * Reprend le motif de recherche de l'assistant mandat (`Mandats.tsx`) plutôt que d'en inventer un :
 * une recherche, cinquante résultats au plus, le total annoncé tant qu'on n'a rien tapé. On cherche
 * sur le nom, le prénom, le compte et le courriel, parce qu'on se souvient rarement de la même
 * chose. Une fois le contact choisi, il s'affiche seul avec son compte et le moyen d'en changer.
 */
function ChoixContact({ contacts, contactId, onChange }: {
  contacts: Contact[]
  contactId: string
  onChange: (id: string, compteId: string) => void
}) {
  const [recherche, setRecherche] = useState('')
  const choisi = contacts.find((c) => c.id === contactId)

  if (choisi) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-navy-200 bg-white px-3 py-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-navy-800">{choisi.prenom} {choisi.nom}</p>
          <p className="truncate text-[11px] text-navy-400">
            {[choisi.compte_nom, choisi.fonction].filter(Boolean).join(' · ')}
          </p>
        </div>
        <button
          type="button"
          onClick={() => { onChange('', ''); setRecherche('') }}
          className="shrink-0 text-xs font-semibold text-kiwi-700 hover:underline"
        >
          changer
        </button>
      </div>
    )
  }

  const q = recherche.trim().toLowerCase()
  const filtres = q
    ? contacts
        .filter((c) => [c.prenom, c.nom, c.compte_nom, c.email].some((v) => (v ?? '').toLowerCase().includes(q)))
        .slice(0, 50)
    : []

  return (
    <div className="space-y-1.5">
      <Input value={recherche} onChange={(e) => setRecherche(e.target.value)} placeholder="Nom, compte ou courriel…" />
      {q && (
        <div className="max-h-[152px] overflow-y-auto rounded-lg border border-navy-100">
          {filtres.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => onChange(c.id, c.compte_id)}
              className="flex w-full items-center gap-2 border-b border-navy-50 px-3 py-2 text-left last:border-b-0 hover:bg-navy-50/60"
            >
              <span className="min-w-0 flex-1 truncate text-xs font-semibold text-navy-800">{c.prenom} {c.nom}</span>
              <span className="shrink-0 truncate text-[10.5px] text-navy-400">{c.compte_nom}</span>
            </button>
          ))}
          {filtres.length === 0 && <p className="p-3 text-center text-xs text-navy-400">Aucun contact trouvé.</p>}
        </div>
      )}
      {!q && <p className="text-[10.5px] text-navy-400">{contacts.length} contacts — tapez pour chercher.</p>}
    </div>
  )
}

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
const TON_STATUT: Record<string, 'kiwi' | 'amber' | 'neutral'> = {
  NOUVELLE: 'neutral',
  EN_QUALIFICATION: 'amber',
  EN_ATTENTE: 'amber',
  QUALIFIEE: 'kiwi',
  CLOTUREE: 'neutral',
}

function CarteOpportunite({ opportunite }: { opportunite: Opportunite }) {
  const navigate = useNavigate()
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
        <Badge tone={TON_STATUT[opportunite.statut] ?? 'neutral'}>{opportunite.statut_libelle}</Badge>
      </div>

      <div className="mt-2.5 space-y-1 text-xs text-navy-500">
        <p>
          {opportunite.site_ids.length} site{opportunite.site_ids.length > 1 ? 's' : ''} ·{' '}
          {opportunite.compteur_ids.length} compteur{opportunite.compteur_ids.length > 1 ? 's' : ''}
          {opportunite.recommandation_ids.length > 0 && (
            <> · {opportunite.recommandation_ids.length} recommandation{opportunite.recommandation_ids.length > 1 ? 's' : ''}</>
          )}
        </p>
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
            {tranche.visibles.map((o) => <CarteOpportunite key={o.id} opportunite={o} />)}
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
          <ChoixContact
            contacts={contacts ?? []}
            contactId={contactId}
            onChange={(id, compte) => { setContactId(id); setCompteId(compte) }}
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
