import { useState } from 'react'
import { useTranchesAffichage } from '@/lib/useTranchesAffichage'
import { PiedDeListe } from '@/components/ui/pied-de-liste'
import { MessageSquare, Plus } from 'lucide-react'
import { Topbar } from '@/components/layout/Topbar'
import { PageHeader } from '@/components/ui/page-header'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { InteractionSentence } from '@/lib/interactionSentence'
import { Dialog } from '@/components/ui/dialog'
import { FormField, Input, Select, Textarea } from '@/components/ui/form'
import { useInteractionsRecentes, useCreateInteraction } from '@/lib/data/interactions'
import { useComptes } from '@/lib/data/comptes'
import { useSites } from '@/lib/data/sites'
import { useContacts } from '@/lib/data/contacts'
import { useReferenceTable } from '@/lib/data/referenceTables'
import { FALLBACK_TYPES_INTERACTIONS, FALLBACK_ISSUES_INTERACTIONS } from '@/lib/referenceFallbacks'
import { ListToolbar } from '@/components/ui/list-toolbar'
import { useListControls } from '@/lib/useListControls'
import { usePerimetreListe, BasculePerimetre } from '@/lib/perimetre'
import { useOuvrirCreation } from '@/lib/ouvrirCreation'

const SENS_OPTIONS = [
  { value: '', label: '—' },
  { value: 'entrant', label: 'Entrant' },
  { value: 'sortant', label: 'Sortant' },
]

function CreateInteractionDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { data: comptes } = useComptes()
  const { data: sites } = useSites()
  const { data: contacts } = useContacts()
  const { data: typesRef } = useReferenceTable('types_interactions')
  const types = typesRef && typesRef.length > 0 ? typesRef : FALLBACK_TYPES_INTERACTIONS
  const { data: issuesRef } = useReferenceTable('issues_interactions')
  const issues = issuesRef && issuesRef.length > 0 ? issuesRef : FALLBACK_ISSUES_INTERACTIONS
  const createInteraction = useCreateInteraction()

  const [typeId, setTypeId] = useState('')
  const [compteId, setCompteId] = useState('')
  const [siteId, setSiteId] = useState('')
  const [contactId, setContactId] = useState('')
  const [sens, setSens] = useState('')
  const [objet, setObjet] = useState('')
  const [resume, setResume] = useState('')
  const [resultat, setResultat] = useState('')
  const [issueId, setIssueId] = useState('')
  const [feedback, setFeedback] = useState<string | null>(null)

  const sitesDuCompte = sites?.filter((s) => s.compte_id === compteId) ?? []
  const contactsDuCompte = contacts?.filter((c) => c.compte_id === compteId) ?? []

  function reset() {
    setTypeId('')
    setCompteId('')
    setSiteId('')
    setContactId('')
    setSens('')
    setObjet('')
    setResume('')
    setResultat('')
    setIssueId('')
    setFeedback(null)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const type = types.find((t) => t.id === typeId)
    const compte = comptes?.find((c) => c.id === compteId)
    const site = sitesDuCompte.find((s) => s.id === siteId)
    const contact = contactsDuCompte.find((c) => c.id === contactId)
    const issue = issues.find((i) => i.id === issueId)

    const result = await createInteraction.mutateAsync({
      type_interaction_id: typeId || null,
      type_interaction_libelle: type?.libelle ?? '',
      date_interaction: new Date().toISOString(),
      sens: sens || null,
      objet: objet || null,
      resume: resume || null,
      resultat: resultat || null,
      compte_id: compteId || null,
      compte_nom: compte?.nom ?? '',
      site_id: siteId || null,
      site_nom: site?.nom ?? '',
      contact_id: contactId || null,
      contact_nom: contact ? `${contact.prenom} ${contact.nom}` : '',
      issue_interaction_id: issueId || null,
      issue_libelle: issue?.libelle,
    })
    setFeedback(result.persisted ? 'Interaction créée.' : 'Interaction ajoutée localement (non synchronisée avec Supabase).')
    setTimeout(() => {
      reset()
      onClose()
    }, 700)
  }

  return (
    <Dialog open={open} onClose={() => { reset(); onClose() }} title="Nouvelle interaction" description="Enregistrer un échange avec un compte, un site ou un contact.">
      <form onSubmit={handleSubmit} className="max-h-[75vh] space-y-3 overflow-y-auto pr-1">
        <div className="grid grid-cols-2 gap-3">
          <FormField label="Type">
            <Select value={typeId} onChange={(e) => setTypeId(e.target.value)} required>
              <option value="">Sélectionner…</option>
              {types.map((t) => <option key={t.id} value={t.id}>{t.libelle}</option>)}
            </Select>
          </FormField>
          <FormField label="Sens">
            <Select value={sens} onChange={(e) => setSens(e.target.value)}>
              {SENS_OPTIONS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </Select>
          </FormField>
        </div>
        <FormField label="Compte">
          <Select value={compteId} onChange={(e) => { setCompteId(e.target.value); setSiteId(''); setContactId('') }}>
            <option value="">Sélectionner…</option>
            {comptes?.map((c) => <option key={c.id} value={c.id}>{c.nom}</option>)}
          </Select>
        </FormField>
        {compteId && (
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Site">
              <Select value={siteId} onChange={(e) => setSiteId(e.target.value)}>
                <option value="">—</option>
                {sitesDuCompte.map((s) => <option key={s.id} value={s.id}>{s.nom}</option>)}
              </Select>
            </FormField>
            <FormField label="Contact">
              <Select value={contactId} onChange={(e) => setContactId(e.target.value)}>
                <option value="">—</option>
                {contactsDuCompte.map((c) => <option key={c.id} value={c.id}>{c.prenom} {c.nom}</option>)}
              </Select>
            </FormField>
          </div>
        )}
        <FormField label="Objet">
          <Input value={objet} onChange={(e) => setObjet(e.target.value)} placeholder="Ex. Point sur le renouvellement" />
        </FormField>
        <FormField label="Résumé">
          <Textarea rows={2} value={resume} onChange={(e) => setResume(e.target.value)} />
        </FormField>
        <FormField label="Résultat">
          <Input value={resultat} onChange={(e) => setResultat(e.target.value)} />
        </FormField>
        <FormField label="Motif / issue">
          <Select value={issueId} onChange={(e) => setIssueId(e.target.value)}>
            <option value="">Sélectionner…</option>
            {issues.map((i) => <option key={i.id} value={i.id}>{i.libelle}</option>)}
          </Select>
        </FormField>
        {feedback && <p className="text-xs text-km-muted">{feedback}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="ghost" onClick={() => { reset(); onClose() }}>Annuler</Button>
          <Button type="submit" disabled={createInteraction.isPending}>Créer l'interaction</Button>
        </div>
      </form>
    </Dialog>
  )
}

export default function Interactions() {
  const { data: interactions, isLoading } = useInteractionsRecentes()
  const [showCreate, setShowCreate] = useState(false)
  // `?creer=1` ouvre ce formulaire depuis le menu « Créer » de la barre du haut.
  useOuvrirCreation(() => setShowCreate(true))

  /**
   * UN ÉCHANGE DATÉ EN 2029 N'A PAS EU LIEU.
   *
   * 152 interactions portent une date future, jusqu'au 03/09/2029 : ce sont des rappels — « ech
   * 31/12/2028 rappeler Mme FABRE 8 mois avant », « renew 5 p allaire », « Rappeler pour
   * échéance ». Rangés dans la table des échanges faute d'un meilleur endroit au moment de la
   * reprise.
   *
   * Comme cet écran trie du plus récent au plus ancien, ces 152 lignes occupaient TOUTE la première
   * page d'un écran qui s'appelle « Historique des échanges ». On ouvrait l'historique et on
   * tombait sur ce qui n'était pas encore arrivé.
   *
   * Elles sortent donc de la vue par défaut — et surtout PAS de la base : le bouton « À venir » les
   * ramène. Les cacher pour de bon reviendrait à perdre des rappels que quelqu'un a pris la peine
   * d'écrire.
   */
  const [aVenir, setAVenir] = useState(false)
  const maintenant = new Date().toISOString()
  const interactionsVisibles = interactions?.filter((i) =>
    aVenir ? i.date_interaction > maintenant : i.date_interaction <= maintenant,
  )
  const nbAVenir = interactions?.filter((i) => i.date_interaction > maintenant).length ?? 0

  /* Le proprietaire d'un echange n'est renseigne que 3 fois sur 66 645 : la cascade retombe donc
     presque toujours sur le compte, ce qui repond a la vraie question — « cet echange concerne-t-il
     un de mes clients ? » plutot que « qui l'a saisi ? ». */
  const { perimetre, setPerimetre, visibles: interactionsDuPerimetre } = usePerimetreListe(
    'interactions', interactionsVisibles,
    { proprietaireId: (i) => i.proprietaire_id, compteId: (i) => i.compte_id, siteId: (i) => i.site_id },
  )

  const { query, setQuery, sortKey, setSortKey, items: filteredInteractions } = useListControls(interactionsDuPerimetre, {
    searchFields: (i) => [i.objet, i.compte_nom, i.site_nom, i.contact_nom, i.auteur, i.type_interaction],
    sorters: {
      date_interaction: (a, b) => b.date_interaction.localeCompare(a.date_interaction),
      compte_nom: (a, b) => a.compte_nom.localeCompare(b.compte_nom),
      type_interaction: (a, b) => a.type_interaction.localeCompare(b.type_interaction),
    },
    defaultSort: 'date_interaction',
  })

  const tranche = useTranchesAffichage(filteredInteractions, `${query}|${sortKey}`)

  return (
    <div>
      <Topbar title="Interactions" />
      <div className="p-4 sm:p-6">
        <PageHeader
          title="Interactions"
          description="Historique des échanges (appels, emails, réunions) avec les comptes et contacts."
          actions={<Button onClick={() => setShowCreate(true)}><Plus className="h-4 w-4" />Nouvelle interaction</Button>}
        />

        <ListToolbar query={query} onQueryChange={setQuery} placeholder="Rechercher un compte, un contact, un objet…" count={filteredInteractions?.length}>
            <BasculePerimetre
              valeur={perimetre}
              onChange={setPerimetre}
              libelleMien="Mes échanges"
              libelleTous="Tous les échanges"
            />
          <Select value={sortKey} onChange={(e) => setSortKey(e.target.value)} className="w-auto">
            <option value="date_interaction">Trier par date</option>
            <option value="compte_nom">Trier par compte</option>
            <option value="type_interaction">Trier par type</option>
          </Select>
          {nbAVenir > 0 && (
            <button
              type="button"
              onClick={() => setAVenir((v) => !v)}
              aria-pressed={aVenir}
              className={`flex h-9 shrink-0 items-center gap-1.5 rounded-km border px-3 text-km-name font-semibold transition-colors ${
                aVenir
                  ? 'border-kw-ink bg-kw-ink text-white'
                  : 'border-km-line bg-km-surface text-km-muted hover:text-km-text'
              }`}
            >
              À venir
              <span className={`font-mono text-km-label tabular-nums ${aVenir ? 'opacity-70' : 'text-km-muted'}`}>
                {nbAVenir}
              </span>
            </button>
          )}
        </ListToolbar>

        {/* La table compte plus de 66 000 interactions : les charger toutes prenait 30 secondes.
            On s'arrête aux 2000 plus récentes, et on le dit plutôt que de laisser croire que la
            recherche porte sur tout l'historique. */}
        {!isLoading && !aVenir && interactions && interactions.length >= 2000 && (
          <p className="mb-2.5 text-[11px] text-km-faint">
            Les 2000 interactions les plus récentes sont chargées — la recherche ci-dessus porte sur celles-ci.
            Pour l'historique complet d'un compte, ouvre sa fiche.
          </p>
        )}

        <div className="space-y-2.5">
          {isLoading && <p className="text-sm text-km-faint">Chargement…</p>}
          {!isLoading && interactions?.length === 0 && (
            <p className="py-8 text-center text-sm text-km-faint">
              Aucune interaction pour l'instant — chaque appel, email ou réunion noté avec un compte/contact apparaîtra ici.
            </p>
          )}
          {!isLoading && interactions && interactions.length > 0 && filteredInteractions?.length === 0 && (
            <p className="py-8 text-center text-sm text-km-faint">Aucune interaction ne correspond à la recherche.</p>
          )}
          {tranche.visibles.map((i) => (
            <Card
              key={i.id}
              to={`/interactions/${i.id}`}
              className="animate-fade-up flex cursor-pointer items-start justify-between gap-4 p-4 transition-all hover:-translate-y-0.5 hover:shadow-lg"
            >
              <div className="flex items-start gap-3">
                <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-sky-100 text-sky-500">
                  <MessageSquare className="h-4 w-4" />
                </span>
                <div>
                  <p className="text-sm font-medium text-km-text">{i.objet || i.type_interaction}</p>
                  <p className="text-xs text-km-muted">
                    <InteractionSentence interaction={i} />
                  </p>
                </div>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1.5">
                <Badge tone="neutral">{i.type_interaction}</Badge>
                {i.issue_libelle && <Badge tone="amber">{i.issue_libelle}</Badge>}
                <span className="text-xs text-km-faint">{new Date(i.date_interaction).toLocaleDateString('fr-FR')}</span>
              </div>
            </Card>
          ))}
          <PiedDeListe
            affiches={tranche.visibles.length}
            total={tranche.total}
            reste={tranche.reste}
            onAfficherPlus={tranche.afficherPlus}
            tailleTrancheSuivante={tranche.tailleTrancheSuivante}
            libelle="interactions"
          />
        </div>
      </div>
      {showCreate && <CreateInteractionDialog open={showCreate} onClose={() => setShowCreate(false)} />}
    </div>
  )
}
