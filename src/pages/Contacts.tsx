import { useEffect } from 'react'
import { useTranchesAffichage } from '@/lib/useTranchesAffichage'
import { PiedDeListe } from '@/components/ui/pied-de-liste'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { User, Star } from 'lucide-react'
import { TitreOnglet } from '@/components/layout/TitreOnglet'
import { PageHeader } from '@/components/ui/page-header'
import { HubCreation } from '@/components/compte/HubCreation'
import { useCreerUnCompte } from '@/lib/creationCompte'
import { useCreerUnContact } from '@/lib/creationContact'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { EntityLink } from '@/components/ui/entity-link'
import { PhoneLink, EmailLink } from '@/components/ui/contact-link'
import { Select } from '@/components/ui/form'
import { useContacts } from '@/lib/data/contacts'
import { useCompte } from '@/lib/data/comptes'
import { ListToolbar } from '@/components/ui/list-toolbar'
import { useListControls } from '@/lib/useListControls'
import { usePerimetreListe, BasculePerimetre } from '@/lib/perimetre'
import { useOuvrirCreation } from '@/lib/ouvrirCreation'
import { LIBELLE_ROLE } from '@/lib/contactRoles'

/**
 * ENCAPSULABLE DANS LA PAGE PATRIMOINE. `sansEntete` masque la barre du haut quand cette liste est
 * affichée comme onglet de /patrimoine (diapositive 8 de Michel : « la page Patrimoine rassemble ces
 * objets et permet de naviguer du compte jusqu'au compteur et au contrat »). L'en-tête de page, lui,
 * reste : il porte le bouton de création et la phrase qui dit ce qu'est l'objet.
 */
export default function Contacts({ sansEntete }: { sansEntete?: boolean }) {
  const creerUnCompte = useCreerUnCompte()
  const creerUnContact = useCreerUnContact()
  const { data: contacts, isLoading } = useContacts()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  /* ══ LA CRÉATION D'UN CONTACT A QUITTÉ CETTE PAGE ══
     William, 24/09/2026 : même modèle que le compte — une fenêtre à rail, montée dans la coque,
     qui s'ouvre par-dessus l'écran courant. Le dialogue en trois étapes qui vivait ici est parti
     dans `ParcoursCreationContact`, et les sept boutons de Kimatch ouvrent le même.

     LES DEUX ADRESSES SURVIVENT : `?creer=1`, depuis le menu « Créer », et `?compte=<id>`, qui
     préremplit le compte — c'est le lien que posaient les onglets d'une fiche. Le nom du compte
     n'est lu que dans ce second cas. */
  const compteFromUrl = searchParams.get('compte')
  const { data: compteDeLUrl } = useCompte(compteFromUrl ?? undefined)
  useOuvrirCreation(() => creerUnContact())

  useEffect(() => {
    if (!compteDeLUrl) return
    creerUnContact({ compte: { id: compteDeLUrl.id, nom: compteDeLUrl.nom } })
    setSearchParams((prev) => { prev.delete('compte'); return prev }, { replace: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [compteDeLUrl?.id])

  const { perimetre, setPerimetre, visibles: contactsDuPerimetre } = usePerimetreListe(
    'contacts', contacts, { proprietaireId: (c) => c.proprietaire_id, compteId: (c) => c.compte_id },
  )

  const { query, setQuery, sortKey, setSortKey, items: filteredContacts } = useListControls(contactsDuPerimetre, {
    searchFields: (c) => [c.prenom, c.nom, c.fonction, c.compte_nom, c.email, c.telephone],
    sorters: {
      nom: (a, b) => a.nom.localeCompare(b.nom),
      compte_nom: (a, b) => a.compte_nom.localeCompare(b.compte_nom),
      fonction: (a, b) => (a.fonction ?? '').localeCompare(b.fonction ?? ''),
    },
    defaultSort: 'nom',
  })

  const tranche = useTranchesAffichage(filteredContacts, `${query}|${sortKey}`)

  return (
    <div>
      {!sansEntete && <TitreOnglet title="Contacts" />}
      <div className="p-4 sm:p-6">
        <PageHeader
          titreMasque={sansEntete}
          title="Contacts"
          description="Les personnes chez vos comptes — signataires, interlocuteurs commerciaux ou techniques."
          actions={sansEntete ? undefined : (
            /* Le hub de création SEUL : « il faut également le mettre sur les autres objets, parce
               que c'est un bouton que de n'importe où je peux venir faire quelque chose »
               (William, 13/08/2026). Le bouton « Nouveau contact » qui doublonnait à côté a été
               retiré le 16/08/2026 — le hub propose déjà la création de contact, et deux boutons
               pour la même action encombraient l'en-tête. */
            <HubCreation
              onAction={(cle) => {
                if (cle === 'contact') creerUnContact()
                if (cle === 'compte') creerUnCompte()
                /* `?creer=1` ET NON `/compteurs` TOUT COURT : depuis le 10/09/2026 la liste des
                   compteurs porte le formulaire de création, et c'est ce paramètre qui l'ouvre.
                   Sans lui, le hub déposait sur une liste sans rien proposer. */
                if (cle === 'compteur') navigate('/compteurs?creer=1')
                if (cle === 'mandat') navigate('/mandats')
                if (cle === 'recommandation') navigate('/recommandations')
              }}
            />
          )}
        />

        <ListToolbar query={query} onQueryChange={setQuery} placeholder="Rechercher un contact, un compte…" count={filteredContacts?.length}>
            <BasculePerimetre
              valeur={perimetre}
              onChange={setPerimetre}
              libelleMien="Mes contacts"
              libelleTous="Tous les contacts"
            />
          <Select value={sortKey} onChange={(e) => setSortKey(e.target.value)} className="w-auto">
            <option value="nom">Trier par nom</option>
            <option value="compte_nom">Trier par compte</option>
            <option value="fonction">Trier par fonction</option>
          </Select>
        </ListToolbar>

        {!isLoading && contacts?.length === 0 && (
          <p className="mb-4 text-sm text-km-faint">
            Aucun contact pour l'instant — un contact est une personne chez un compte (signataire, gestionnaire, interlocuteur technique…). Utilise « Créer » pour en ajouter un.
          </p>
        )}
        {!isLoading && contacts && contacts.length > 0 && filteredContacts?.length === 0 && (
          <p className="mb-4 text-sm text-km-faint">Aucun contact ne correspond à la recherche.</p>
        )}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {isLoading && <p className="text-sm text-km-faint">Chargement…</p>}
          {tranche.visibles.map((c) => (
            <Card
              key={c.id}
              to={`/contacts/${c.id}`}
              className="animate-fade-up cursor-pointer p-5 transition-all hover:-translate-y-0.5 hover:shadow-lg"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-violet-100 text-violet-500">
                    <User className="h-4 w-4" />
                  </span>
                  <div>
                    <p className="font-display font-medium text-km-text">{c.civilite ? `${c.civilite} ` : ''}{c.prenom} {c.nom}</p>
                    <p className="text-xs text-km-muted">{c.fonction || '—'}</p>
                  </div>
                </div>
                {c.contact_principal && <Star className="h-4 w-4 shrink-0 text-amber-500" />}
              </div>
              {/* Un badge par rôle, l'or pour le signataire : la même grammaire que l'onglet
                  Contacts d'une fiche compte, pour qu'on reconnaisse la même chose partout. */}
              {c.roles.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {c.roles.map((r) => (
                    <Badge key={r} tone={r === 'SIGNATAIRE' ? 'amber' : r === 'DECISIONNAIRE' ? 'kiwi' : 'neutral'}>
                      {LIBELLE_ROLE[r]}
                    </Badge>
                  ))}
                </div>
              )}
              <div className="mt-4 space-y-1 text-xs text-km-muted">
                <p><EntityLink to={`/comptes/${c.compte_id}`}>{c.compte_nom}</EntityLink></p>
                {c.email && <p><EmailLink value={c.email} /></p>}
                {c.telephone && <p><PhoneLink value={c.telephone} /></p>}
                {c.telephone_mobile && <p><PhoneLink value={c.telephone_mobile} /></p>}
              </div>
              {c.sites.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {c.sites.map((s) => <Badge key={s.id} tone="neutral">{s.nom}</Badge>)}
                </div>
              )}
            </Card>
          ))}
          <PiedDeListe
            affiches={tranche.visibles.length}
            total={tranche.total}
            reste={tranche.reste}
            onAfficherPlus={tranche.afficherPlus}
            tailleTrancheSuivante={tranche.tailleTrancheSuivante}
            libelle="contacts"
          />
        </div>
      </div>
    </div>
  )
}
