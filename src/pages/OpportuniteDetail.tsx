import { useMemo, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Target, Plus, Check, AlertTriangle, Building2, User, MapPin, Gauge, FileSignature, Trash2, Layers } from 'lucide-react'
import { Topbar } from '@/components/layout/Topbar'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Dialog } from '@/components/ui/dialog'
import { WizardConnectionGate } from '@/components/ui/connection-gate'
import { FormField, Select, Textarea } from '@/components/ui/form'
import { InlineField } from '@/components/ui/inline-field'
import { EntityLink } from '@/components/ui/entity-link'
import { HistoriqueDiscret } from '@/components/ui/historique-discret'
import { ActivityFeed } from '@/components/site/ActivityFeed'
import { OngletFichiers } from '@/components/compte/OngletFichiers'
import { useDocumentsParEntites, useTeleverserDocuments } from '@/lib/data/documents'
import { useReferenceTable } from '@/lib/data/referenceTables'
import { FriseStatut } from '@/components/opportunite/FriseStatut'
import { useInteractionsParOpportunite } from '@/lib/data/interactions'
import { useActionsParOpportunite } from '@/lib/data/actions'
import {
  prerequisOpportunite,
  statutDerive,
  PIPELINE_OPPORTUNITE,
  useOpportunite,
  useMajOpportunite,
  useMajPerimetreOpportunite,
  useDeleteOpportunite,
  useStatutsOpportunites,
  ORIGINES_OPPORTUNITE,
  QUALIFICATIONS_FIN,
  type PatchOpportunite,
} from '@/lib/data/opportunites'
import { useSitesParCompte } from '@/lib/data/sites'
import { useCompteurs } from '@/lib/data/compteurs'
import { useCanManage } from '@/lib/data/roles'
import { DialogSuppression } from '@/components/ui/dialog-suppression'
import { useSuppression } from '@/lib/useSuppression'
import { useContacts } from '@/lib/data/contacts'
import { useMandats } from '@/lib/data/mandats'
import { MandatWizard } from '@/components/mandat/MandatWizard'
import { CreateRecommandationDialog } from '@/components/opportunite/CreationRecommandationWizard'
import { DialogConversionOpportunite } from '@/components/opportunite/DialogConversionOpportunite'
import { useRecommandationsListe } from '@/lib/data/recommandations'
import { cn } from '@/lib/utils'
import type { Opportunite } from '@/types/domain'

/**
 * La fiche Opportunité, d'après la maquette « Fiche Opportunite » du 23/08/2026.
 *
 * CE QUE LA MAQUETTE APPORTE ET QUE JE N'AURAIS PAS DEVINÉ : le mandat vérifié CONTRE le périmètre
 * (« le périmètre entier est couvert » ou « un nouveau mandat doit être créé et envoyé à… »), le bloc
 * qui liste ce qui manque, et la règle de conversion affichée là où elle s'applique —
 * « une recommandation ne se crée qu'une fois l'opportunité qualifiée en Convertie ».
 *
 * PAS DE SCORE, ET CE N'EST PLUS UNE ATTENTE. La maquette décrivait une jauge — points par nature du
 * déclencheur × urgence, décote journalière. Michel a tranché le 23/08/2026 : « je ne préfère pas
 * utiliser le concept de score pour le moment, ça va nous embrouiller. Je préfère qu'on gère des
 * scores uniquement un peu plus tard, avec de l'historique. » Et il donne la mesure qui la remplace :
 * « la maturité se fait si les objets sont valides : un signal positif, un contact, un compte et des
 * compteurs avec des mandats, un accord ». La maturité n'est donc plus un chiffre mais une liste de
 * cases, celle-là même qui commande la conversion : un seul bloc, pas deux.
 */

export default function OpportuniteDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { data: opportunite, isLoading } = useOpportunite(id)
  const { data: statuts } = useStatutsOpportunites()
  const canManage = useCanManage()
  const deleteOpportunite = useDeleteOpportunite()
  const suppression = useSuppression()
  const [confirmerSuppression, setConfirmerSuppression] = useState(false)
  const { data: contacts } = useContacts()
  const { data: compteurs } = useCompteurs()
  const { data: mandats } = useMandats()
  const { data: recommandations } = useRecommandationsListe()
  const { data: sitesDuCompte } = useSitesParCompte(opportunite?.compte_id ?? undefined)
  const maj = useMajOpportunite()
  const majPerimetre = useMajPerimetreOpportunite()

  const [toast, setToast] = useState<string | null>(null)
  const [clotureOuverte, setClotureOuverte] = useState(false)
  const [conversionOuverte, setConversionOuverte] = useState(false)
  const [ajoutOuvert, setAjoutOuvert] = useState(false)
  // « On peut lancer la demande de mandat depuis l'opportunité » (Michel, 23/08/2026). Le bouton
  // renvoyait sur la fiche compte, ce qui faisait perdre le périmètre qu'on vient d'établir.
  const [mandatOuvert, setMandatOuvert] = useState(false)
  const [recoOuverte, setRecoOuverte] = useState(false)
  const [onglet, setOnglet] = useState<'opportunite' | 'rattachements' | 'fichiers' | 'historique'>('opportunite')
  const [hubOuvert, setHubOuvert] = useState(false)
  // L'action qu'on est en train de consigner : la maquette dit « chaque action est consignée dans le
  // flux », et une ligne sans un mot d'explication n'apprendrait rien à celui qui la relira.
  /* Le formulaire de tâche. `echeance` prérempli quand on arrive par « Planifier un rappel » :
     un rappel EST une tâche datée, inutile d'en faire un objet à part. */
  const { data: interactionsOpp } = useInteractionsParOpportunite(id)
  /* Les tâches de cette opportunité. La colonne `actions.opportunite_id` existait depuis toujours,
     rien ne la lisait — donc une tâche prise sur une opportunité disparaissait de sa fiche. */
  const { data: actionsOpp } = useActionsParOpportunite(id)
  const { data: documents } = useDocumentsParEntites(id ? [id] : undefined)
  const { data: typesDocumentsRef } = useReferenceTable('types_documents')
  const typesDocuments = typesDocumentsRef ?? []
  const televerser = useTeleverserDocuments()
  // `useDocumentsParEntites` interroge par identifiant d'entité : on retient ceux qui portent bien
  // le type `opportunite`, sinon un site et une opportunité de même identifiant se mélangeraient.
  const documentsDeLOpportunite = useMemo(
    () => (documents ?? []).filter((d) => d.entite_type === 'opportunite'),
    [documents],
  )

  function signaler(m: string) {
    setToast(m)
    setTimeout(() => setToast(null), 2600)
  }

  async function majOpp(patch: PatchOpportunite) {
    if (!opportunite) return
    await maj.mutateAsync({ id: opportunite.id, patch })
  }

  const retourInline = {
    onSaved: () => signaler('✓ Enregistré'),
    onError: (e: Error) => signaler(e.message),
  }

  // LE MÊME CALCUL QUE LA LISTE, ET AU MÊME ENDROIT. Prérequis, couverture du mandat et palier du
  // pipeline sortent de `prerequisOpportunite` et `statutDerive` : deux copies auraient fini par
  // afficher deux états différents du même dossier.
  const bilan = useMemo(
    () => (opportunite ? prerequisOpportunite(opportunite, mandats ?? []) : null),
    [opportunite, mandats],
  )
  const palier = useMemo(
    () => (opportunite ? statutDerive(opportunite, mandats ?? []) : null),
    [opportunite, mandats],
  )
  const couverture = {
    mandat: bilan?.mandat ?? null,
    couverts: bilan?.couverts ?? [],
    manquants: bilan?.manquantsDuMandat ?? [],
  }
  const mandatCouvre = bilan?.mandatCouvre ?? false
  const listePrerequis = bilan?.liste ?? []
  const manquants = bilan?.manquants ?? []
  const convertie = opportunite?.qualification_fin === 'CONVERTIE'
  /**
   * QUAND LA CONVERSION EST POSSIBLE. Palier 4 de la diapositive 10 — « Prête à convertir : données
   * et conditions réunies » — ou déjà convertie, puisque « une opportunité convertie peut créer
   * plusieurs recommandations selon les périmètres à traiter ». Une opportunité abandonnée, non.
   */
  const peutConvertir = palier?.code === 'PRETE_A_CONVERTIR' || palier?.code === 'CONVERTIE'

  const recosLiees = useMemo(
    () => (recommandations ?? []).filter((r) => opportunite?.recommandation_ids.includes(r.id)),
    [recommandations, opportunite],
  )

  const compteursDuPerimetre = useMemo(
    () => (compteurs ?? []).filter((c) => opportunite?.compteur_ids.includes(c.id)),
    [compteurs, opportunite],
  )

  // LE PÉRIMÈTRE EN ARBRE, comme dans la maquette : l'immeuble porte ses compteurs. Un compteur du
  // périmètre dont le site n'est pas retenu est affiché à part plutôt que caché — sinon on ne
  // comprendrait pas pourquoi le décompte ne tombe pas juste.
  const sitesDuPerimetre = useMemo(
    () => (sitesDuCompte ?? []).filter((st) => opportunite?.site_ids.includes(st.id)),
    [sitesDuCompte, opportunite],
  )
  const compteursHorsSite = useMemo(
    () => compteursDuPerimetre.filter((c) => !opportunite?.site_ids.includes(c.site_id ?? '')),
    [compteursDuPerimetre, opportunite],
  )
  const compteursParSite = (siteId: string) => compteursDuPerimetre.filter((c) => c.site_id === siteId)


  async function retirer(table: 'sites' | 'compteurs', cible: string, libelle: string) {
    if (!opportunite) return
    try {
      await majPerimetre.mutateAsync({ opportuniteId: opportunite.id, table, action: 'retirer', cibleId: cible })
      signaler('✓ ' + libelle + ' retiré du périmètre')
    } catch (e) {
      signaler(e instanceof Error ? e.message : 'Retrait impossible')
    }
  }

  if (isLoading) {
    return (
      <div className="flex h-full flex-col overflow-hidden">
        <Topbar title="Opportunité" />
        <div className="p-6 text-sm text-km-faint">Chargement…</div>
      </div>
    )
  }
  if (!opportunite) {
    return (
      <div className="flex h-full flex-col overflow-hidden">
        <Topbar title="Opportunité" />
        <div className="p-6">
          <p className="text-sm text-km-muted">Cette opportunité n'existe pas ou n'est pas visible.</p>
          <Button size="sm" variant="outline" className="mt-3" onClick={() => navigate('/opportunites')}>
            <ArrowLeft className="h-3.5 w-3.5" /> Retour aux opportunités
          </Button>
        </div>
      </div>
    )
  }

  const origine = ORIGINES_OPPORTUNITE.find((o) => o.code === opportunite.origine)
  const contact = (contacts ?? []).find((c) => c.id === opportunite.contact_id)

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <Topbar title="Opportunité" crumb={opportunite.compte_nom || 'Opportunité'} />

      {/* ══ BANDEAU D'IDENTITÉ ══
          Relevé dans le fichier source de William : pastille de 40 px au dégradé magenta, référence
          en JetBrains Mono à 20 px, l'origine en pastille magenta cliquable, le type en pastille
          neutre, puis le compte et le résumé du périmètre en seconde ligne. À droite, le
          propriétaire et les dates dans un cartouche. */}
      <div className="flex flex-none flex-wrap items-center gap-4 border-b border-km-line bg-white px-4 pb-3 pt-3.5 lg:px-6">
        <button
          type="button"
          onClick={() => navigate('/opportunites')}
          className="rounded-lg p-1.5 text-km-faint hover:bg-km-soft hover:text-km-text"
          title="Retour aux opportunités"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] bg-gradient-to-br from-opp-600 to-opp-400 text-white shadow-[0_4px_12px_rgba(168,49,127,.28)]">
          <Target className="h-[19px] w-[19px]" strokeWidth={2.1} />
        </span>

        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-2">
            <span className="text-km-metric font-bold tabular-nums text-km-text">
              {opportunite.reference || 'Sans référence'}
            </span>
            <InlineField
              variant="select"
              label=""
              emptyLabel="origine à préciser"
              value={opportunite.origine ?? ''}
              options={ORIGINES_OPPORTUNITE.map((o) => ({ value: o.code, label: o.libelle }))}
              onCommit={(v) => majOpp({ origine: v || null })}
              className="inline-flex rounded-lg border border-opp-200 bg-opp-100 px-2 py-0.5 text-km-xs font-medium text-opp-600"
              {...retourInline}
            />
            <InlineField
              variant="text"
              label=""
              emptyLabel="type à préciser"
              value={opportunite.type_opportunite ?? ''}
              onCommit={(v) => majOpp({ type_opportunite: v.trim() || null })}
              className="inline-flex rounded-lg border border-km-line bg-km-bg px-2 py-0.5 text-km-xs font-medium text-km-muted"
              {...retourInline}
            />
            {opportunite.qualification_fin && (
              <Badge tone={convertie ? 'kiwi' : 'neutral'}>
                {QUALIFICATIONS_FIN.find((q) => q.code === opportunite.qualification_fin)?.libelle ?? opportunite.qualification_fin}
              </Badge>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2 text-km-label text-km-muted">
            {opportunite.compte_id ? (
              <span className="inline-flex items-center gap-1.5 font-bold text-sky-700">
                <Building2 className="h-3 w-3" />
                <EntityLink to={`/comptes/${opportunite.compte_id}`}>{opportunite.compte_nom}</EntityLink>
              </span>
            ) : (
              <span className="font-semibold text-amber-700">Compte à identifier</span>
            )}
            <span className="text-navy-200">·</span>
            <span>
              {opportunite.compteur_ids.length} compteur{opportunite.compteur_ids.length > 1 ? 's' : ''} ·{' '}
              {opportunite.site_ids.length} immeuble{opportunite.site_ids.length > 1 ? 's' : ''}
            </span>
          </div>
        </div>

        {/* ══ CONVERTIR — LE GESTE QUI CLÔT L'OPPORTUNITÉ ══
            Michel, 11/09/2026 : « c'est quand tu mets convertir cette opportunité que les
            recommandations se créent », et « ça se fait manuellement », dit deux fois.

            Il n'apparaît que si le périmètre existe : convertir un périmètre vide ne produirait
            aucune recommandation, et proposer le geste ferait chercher ce qui manque ailleurs. */}
        {canManage && opportunite.compteur_ids.length > 0 && !convertie && (
          <Button
            variant="outline"
            size="sm"
            className="flex-none border-opp-200 text-opp-600 hover:bg-opp-100"
            onClick={() => setConversionOuverte(true)}
            title="Découper le périmètre en recommandations"
          >
            <Layers className="h-3.5 w-3.5" />
            Convertir
          </Button>
        )}

        {/* SUPPRIMER — le geste destructeur se tient À GAUCHE de l'action principale et en
            variante discrète. William, 10/09/2026 : l'opportunité était le seul objet principal
            sans bouton de suppression. Il n'efface rien lui-même : il ouvre la popup qui inventorie
            ce que la base va vraiment emporter, et c'est elle qui laisse confirmer. */}
        {canManage && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setConfirmerSuppression(true)}
            title="Supprimer cette opportunité"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Supprimer
          </Button>
        )}

        {/* LE BOUTON « + CRÉER » DE LA MAQUETTE, et il ouvre vraiment quelque chose : les quatre
            gestes qui font avancer cette opportunité, chacun déjà implémenté ailleurs sur l'écran.
            Un bouton d'en-tête qui ne fait rien est pire que pas de bouton. Chaque entrée
            s'éteint quand elle n'a pas de sens — pas de mandat sans compte, pas de recommandation
            avant la conversion. */}
        <div className="relative flex-none">
          <Button size="sm" onClick={() => setHubOuvert((v) => !v)}>
            <Plus className="h-3.5 w-3.5" /> Créer
          </Button>
          {hubOuvert && (
            <>
              {/* Un voile transparent ferme le menu au premier clic ailleurs, sans écouteur global. */}
              <div className="fixed inset-0 z-40" onClick={() => setHubOuvert(false)} />
              <div className="absolute right-0 top-full z-50 mt-1.5 w-[248px] animate-km-hub-pop rounded-[13px] border border-km-line bg-white p-1.5 shadow-[0_18px_44px_-12px_rgba(22,24,29,.22)]">
                {[
                  {
                    cle: 'perimetre',
                    libelle: 'Ajouter au périmètre',
                    dispo: Boolean(opportunite.compte_id),
                    raison: 'Il faut d’abord un compte.',
                    action: () => setAjoutOuvert(true),
                  },
                  {
                    cle: 'mandat',
                    libelle: 'Lancer la demande de mandat',
                    dispo: Boolean(opportunite.compte_id) && !mandatCouvre,
                    raison: mandatCouvre ? 'Le périmètre est déjà couvert.' : 'Il faut d’abord un compte.',
                    action: () => setMandatOuvert(true),
                  },
                  {
                    cle: 'accord',
                    libelle: 'Noter l’accord du client',
                    dispo: !opportunite.accord_client,
                    raison: 'L’accord est déjà noté.',
                    action: async () => {
                      await majOpp({ accord_client: true })
                      signaler('✓ Accord du client noté')
                    },
                  },
                  {
                    cle: 'cloture',
                    libelle: 'Qualifier la clôture',
                    dispo: !opportunite.qualification_fin,
                    raison: 'Déjà qualifiée.',
                    action: () => setClotureOuverte(true),
                  },
                ].map((a) => (
                  <button
                    key={a.cle}
                    type="button"
                    disabled={!a.dispo}
                    title={a.dispo ? undefined : a.raison}
                    onClick={() => { setHubOuvert(false); void a.action() }}
                    className={cn(
                      'flex w-full items-center gap-2.5 rounded-[9px] px-2.5 py-2 text-left text-km-body font-semibold transition-colors',
                      a.dispo ? 'text-km-text hover:bg-km-bg' : 'cursor-not-allowed text-km-faint',
                    )}
                  >
                    <span
                      className={cn(
                        'flex h-6 w-6 shrink-0 items-center justify-center rounded-md',
                        a.dispo ? 'bg-opp-100 text-opp-600' : 'bg-km-bg text-km-faint',
                      )}
                    >
                      <Plus className="h-3 w-3" />
                    </span>
                    {a.libelle}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        <div className="flex flex-none flex-col items-start gap-0.5 rounded-[10px] border border-km-line bg-km-surface px-3 py-1.5">
          <span className="text-km-xs font-bold text-km-muted">
            {opportunite.proprietaire_nom || 'Sans propriétaire'}
          </span>
          <span className="whitespace-nowrap font-mono text-km-tiny text-km-faint">
            Créée {new Date(opportunite.date_creation).toLocaleDateString('fr-FR')} · Modifiée{' '}
            {new Date(opportunite.date_modification).toLocaleDateString('fr-FR')}
          </span>
        </div>
      </div>

      {/* ══ ONGLETS ══ Opportunité · Fichiers · Historique, comme la maquette. */}
      {/* La barre d'onglets reprend la grille du contenu : la seconde cellule commence exactement
          là où commence le volet. Le liseré sous le titre reprend la couleur de l'onglet actif de
          cette fiche — c'est un repère de section, pas un onglet cliquable. */}
      <div className="grid flex-none grid-cols-1 border-b border-km-line bg-white lg:grid-cols-fiche-activite">
        <div className="flex min-w-0 items-center gap-0.5 overflow-x-auto px-4 pt-2.5 lg:px-6">
        {ONGLETS.map((o) => (
          <button
            key={o.cle}
            type="button"
            onClick={() => setOnglet(o.cle)}
            className={cn(
              'flex items-center gap-1.5 border-b-2 px-3 pb-2 pt-1.5 text-km-body transition-colors',
              onglet === o.cle
                ? 'border-opp-500 font-bold text-km-text'
                : 'border-transparent font-medium text-km-muted hover:text-km-text',
            )}
          >
            {o.libelle}
            {o.cle === 'fichiers' && documentsDeLOpportunite.length > 0 && (
              <span className="rounded-md bg-km-soft px-1.5 py-0.5 text-km-tiny font-extrabold text-km-muted">
                {documentsDeLOpportunite.length}
              </span>
            )}
          </button>
        ))}
        </div>
        <div className="hidden items-center border-b-2 border-opp-500 px-3 lg:flex">
          <span className="truncate text-km-label font-bold uppercase tracking-[0.08em] text-km-faint">
            Activité · opportunité
          </span>
        </div>
      </div>

      {/* Le volet des objets liés est désormais un onglet : le plan de travail garde toute la
          largeur disponible, à côté du flux d'activité permanent. */}
      <div className="grid min-h-0 flex-1 grid-cols-1 overflow-hidden lg:grid-cols-fiche-activite">

        {/* Contenu de l'onglet Rattachements. */}
        <div className={cn('col-start-1 row-start-1 min-h-0 space-y-3 overflow-y-auto bg-km-soft p-3.5 lg:px-5', onglet !== 'rattachements' && 'hidden')}>
          <BlocLateral
            titre="Compte"
            couleurIcone="bg-sky-100 text-sky-700"
            icone={<Building2 className="h-[11px] w-[11px]" />}
            lien={opportunite.compte_id ? `/comptes/${opportunite.compte_id}` : undefined}
            couleurLien="text-sky-700"
          >
            {opportunite.compte_id ? (
              <div className="flex items-center gap-2">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-sky-100 text-km-tiny font-bold text-sky-700">
                  {(opportunite.compte_nom || '?').slice(0, 2).toUpperCase()}
                </span>
                <EntityLink to={`/comptes/${opportunite.compte_id}`}>{opportunite.compte_nom}</EntityLink>
              </div>
            ) : (
              <p className="text-km-label text-km-muted">À identifier — c'est un prérequis de conversion.</p>
            )}
          </BlocLateral>

          <BlocLateral
            titre="Contact principal"
            couleurIcone="bg-violet-100 text-violet-500"
            icone={<User className="h-[11px] w-[11px]" />}
            lien={contact ? `/contacts/${contact.id}` : undefined}
            couleurLien="text-violet-500"
          >
            {contact ? (
              <div className="flex items-center gap-2">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-violet-500 to-violet-400 text-km-label font-bold text-white">
                  {`${contact.prenom[0] ?? ''}${contact.nom[0] ?? ''}`.toUpperCase()}
                </span>
                <div className="min-w-0">
                  <EntityLink to={`/contacts/${contact.id}`}>{contact.prenom} {contact.nom}</EntityLink>
                  {contact.fonction && <p className="truncate text-km-xs text-km-faint">{contact.fonction}</p>}
                </div>
              </div>
            ) : (
              <p className="text-km-label text-km-muted">À identifier — c'est un prérequis de conversion.</p>
            )}
          </BlocLateral>

          {/* LE PÉRIMÈTRE EN ARBRE, comme la maquette : l'immeuble, puis ses compteurs indentés
              derrière un filet, chacun avec sa croix pour sortir du périmètre. */}
          <BlocLateral
            titre="Périmètre"
            couleurIcone="bg-indigo-50 text-indigo-600"
            icone={<Gauge className="h-[11px] w-[11px]" />}
            compteur={opportunite.site_ids.length + opportunite.compteur_ids.length}
          >
            {sitesDuPerimetre.length === 0 && compteursHorsSite.length === 0 ? (
              <p className="text-km-label text-km-muted">
                Aucun site ni compteur. Ajoutez-en au moins un : c'est un prérequis de conversion.
              </p>
            ) : (
              <div className="flex flex-col gap-2">
                {sitesDuPerimetre.map((site) => (
                  <div key={site.id}>
                    <div className="mb-1 flex items-center gap-1.5">
                      <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-[5px] bg-kiwi-50 text-km-green">
                        <MapPin className="h-2.5 w-2.5" />
                      </span>
                      <span className="min-w-0 flex-1 truncate text-km-label font-bold">
                        <EntityLink to={`/sites/${site.id}`}>{site.nom}</EntityLink>
                      </span>
                      <button
                        type="button"
                        onClick={() => retirer('sites', site.id, site.nom)}
                        title="Retirer du périmètre"
                        className="shrink-0 px-0.5 text-km-label text-km-faint hover:text-km-red"
                      >
                        ×
                      </button>
                    </div>
                    <div className="ml-[7px] flex flex-col gap-0.5 border-l-[1.5px] border-km-line pl-2">
                      {compteursParSite(site.id).map((c) => (
                        <LigneCompteur
                          key={c.id}
                          compteur={c}
                          horsMandat={couverture.manquants.includes(c.id)}
                          onRetirer={() => retirer('compteurs', c.id, c.numero_pdl)}
                        />
                      ))}
                      {compteursParSite(site.id).length === 0 && (
                        <p className="py-0.5 text-km-xs text-km-faint">aucun compteur retenu</p>
                      )}
                    </div>
                  </div>
                ))}
                {compteursHorsSite.length > 0 && (
                  <div className="flex flex-col gap-0.5">
                    {compteursHorsSite.map((c) => (
                      <LigneCompteur
                        key={c.id}
                        compteur={c}
                        horsMandat={couverture.manquants.includes(c.id)}
                        onRetirer={() => retirer('compteurs', c.id, c.numero_pdl)}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}
            {opportunite.compte_id && (
              <button
                type="button"
                onClick={() => setAjoutOuvert(true)}
                className="mt-2 text-km-label font-bold text-indigo-600 hover:underline"
              >
                ＋ Ajouter au périmètre
              </button>
            )}
          </BlocLateral>

          {/* LE MANDAT, VÉRIFIÉ CONTRE LE PÉRIMÈTRE — l'apport de la maquette : la question n'est
              pas « y a-t-il un mandat » mais « le périmètre est-il couvert ». */}
          <BlocLateral
            titre="Mandat"
            couleurIcone={mandatCouvre ? 'bg-kiwi-50 text-km-green' : 'bg-km-amber-soft text-amber-700'}
            icone={<FileSignature className="h-[11px] w-[11px]" />}
            badge={mandatCouvre ? 'couvert' : couverture.mandat ? 'partiel' : 'absent'}
            badgeTon={mandatCouvre ? 'kiwi' : 'amber'}
          >
            {couverture.mandat ? (
              <>
                <p className="text-km-label text-km-text">
                  <EntityLink to={`/mandats/${couverture.mandat.id}`}>
                    {couverture.mandat.id_salesforce || 'Mandat actif'}
                  </EntityLink>
                  {couverture.mandat.date_fin_validite && (
                    <span className="block text-km-xs text-km-faint">
                      valide jusqu'au {new Date(couverture.mandat.date_fin_validite).toLocaleDateString('fr-FR')}
                    </span>
                  )}
                </p>
                {couverture.manquants.length > 0 && (
                  <p className="mt-1 text-km-xs font-semibold leading-snug text-km-amber">
                    {couverture.manquants.length} compteur{couverture.manquants.length > 1 ? 's' : ''} non couvert
                    {couverture.manquants.length > 1 ? 's' : ''} — un nouveau mandat doit être envoyé à{' '}
                    {contact ? `${contact.prenom} ${contact.nom}` : 'au signataire'}.
                  </p>
                )}
              </>
            ) : (
              <p className="text-km-label leading-snug text-km-muted">
                {opportunite.compte_id
                  ? 'Aucun mandat actif sur ce compte.'
                  : "Le compte n'est pas identifié : la couverture ne peut pas être vérifiée."}
              </p>
            )}
            {opportunite.compte_id && !mandatCouvre && (
              <button
                type="button"
                onClick={() => setMandatOuvert(true)}
                className="mt-2 text-km-label font-bold text-opp-500 hover:underline"
              >
                ＋ Lancer la demande de mandat
              </button>
            )}
          </BlocLateral>
        </div>

        {/* ── COLONNE CENTRALE ── */}
        <div className={cn('col-start-1 row-start-1 min-h-0 overflow-y-auto p-3.5 lg:px-5', onglet === 'rattachements' && 'hidden')}>
          {onglet === 'opportunite' && (
            <div className="flex animate-km-fade-slide flex-col gap-3.5">


              {/* LA FRISE DE STATUT */}
              <Card className="px-4 pb-2.5 pt-3">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-km-xs font-bold uppercase tracking-[0.08em] text-km-faint">
                    Statut de l'opportunité
                  </p>
                  <span className="flex-1" />
                  {!opportunite.qualification_fin && manquants.length === 0 && (
                    <button
                      type="button"
                      onClick={() => setClotureOuverte(true)}
                      className="rounded-lg border-[1.5px] border-opp-500 bg-opp-50 px-3 py-1.5 text-km-label font-bold text-km-text transition-colors hover:bg-opp-100"
                    >
                      Qualifier la clôture… ▾
                    </button>
                  )}
                </div>
                <FriseStatut
                  // « Abandonnée » N'EST PAS UN CRAN DU RAIL : c'est une issue, au même titre que
                  // les qualifications finales. L'afficher à la suite de « Convertie » donnait à
                  // lire qu'on passe de l'une à l'autre. La frise ferme sur la finalité, qu'elle
                  // sait déjà rendre en rouge ou en vert.
                  jalons={PIPELINE_OPPORTUNITE.filter((p) => p.code !== 'ABANDONNEE').map((p) => ({ code: p.code, libelle: p.libelle }))}
                  courant={palier?.code ?? 'NOUVELLE'}
                  finalite={
                    opportunite.qualification_fin
                      ? {
                          libelle: QUALIFICATIONS_FIN.find((q) => q.code === opportunite.qualification_fin)?.libelle ?? '',
                          perdue: !convertie,
                        }
                      : null
                  }
                />
                <p className="border-t border-km-line pt-2 text-km-label text-km-muted">
                  <span className="font-semibold text-km-text">{palier?.libelle}</span> — {palier?.tache}
                </p>
                {opportunite.motif_cloture && (
                  <div className="mt-2 flex items-start gap-2 border-t border-km-line pt-2">
                    <span className="shrink-0 pt-px text-km-tiny font-extrabold uppercase tracking-[0.06em] text-km-faint">
                      Motif
                    </span>
                    <span className="text-km-label leading-relaxed text-km-text">{opportunite.motif_cloture}</span>
                  </div>
                )}
              </Card>

              {/* LA MATURITÉ — l'anneau de la maquette, mais il compte des objets valides et non des
                  points : Michel a écarté le score le 23/08/2026. */}
              <Card className="p-4">
                <p className="mb-1 text-km-xs font-bold uppercase tracking-[0.08em] text-km-faint">
                  Maturité de l'opportunité
                </p>
                <div className="grid grid-cols-1 items-center gap-5 pt-1.5 sm:grid-cols-[270px_minmax(0,1fr)]">
                  <div className="flex items-center gap-3.5">
                    <AnneauMaturite valides={listePrerequis.length - manquants.length} total={listePrerequis.length} />
                    <div className="min-w-0">
                      <p className="text-km-body font-bold leading-snug text-km-text">
                        {manquants.length === 0 ? 'Prête à convertir' : `${manquants.length} objet${manquants.length > 1 ? 's' : ''} à réunir`}
                      </p>
                      <p className="mt-0.5 text-km-xs leading-relaxed text-km-muted">
                        La maturité se lit à la validité des objets, pas à un score.
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-col gap-1 border-navy-50 sm:border-l sm:pl-5">
                    {listePrerequis.map((p) => (
                      <div key={p.cle} className="flex items-center gap-2">
                        <span
                          className={cn(
                            'h-1.5 w-1.5 shrink-0 rounded-full',
                            p.ok ? 'bg-km-green' : 'bg-amber-400',
                          )}
                        />
                        <span className={cn('min-w-0 flex-1 text-km-xs', p.ok ? 'text-km-muted' : 'font-semibold text-km-text')}>
                          {p.libelle}
                        </span>
                        <span className={cn('font-mono text-km-xs font-bold', p.ok ? 'text-km-green' : 'text-amber-600')}>
                          {p.ok ? 'ok' : 'à faire'}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
                {!opportunite.accord_client && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="mt-3"
                    onClick={async () => {
                      await majOpp({ accord_client: true })
                      signaler("✓ Accord du client noté")
                    }}
                  >
                    <Check className="h-3.5 w-3.5" /> Noter l'accord du client
                  </Button>
                )}
              </Card>


              {/* LES RECOMMANDATIONS LIÉES, ET LA RÈGLE DE CONVERSION */}
              <Card className="p-4">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <p className="text-km-xs font-bold uppercase tracking-[0.08em] text-km-faint">
                    Recommandations liées
                  </p>
                  <Badge tone="neutral">{recosLiees.length}</Badge>
                </div>
                {recosLiees.length > 0 && (
                  <div className="mb-2.5 flex flex-col gap-1.5">
                    {recosLiees.map((r) => (
                      <div key={r.id} className="flex items-center justify-between gap-2 rounded-lg border border-km-line px-3 py-2">
                        <EntityLink to={`/recommandations/${r.id}`}>{r.titre || 'Recommandation'}</EntityLink>
                        <span className="text-km-xs text-km-faint">{r.etape}</span>
                      </div>
                    ))}
                  </div>
                )}

                {/* ══════════ LA CONVERSION PAR PÉRIMÈTRE — diapositive 10 ══════════
                    « Convertie : recommandations par périmètre » et « une opportunité convertie peut
                    créer PLUSIEURS recommandations selon les périmètres à traiter ».

                    LE MESSAGE D'AVANT ÉTAIT CIRCULAIRE, et il n'y avait aucun bouton : il disait
                    « une recommandation ne se crée qu'une fois l'opportunité qualifiée en Convertie »
                    alors que « Convertie » se DÉDUIT de l'existence d'une recommandation. On ne
                    pouvait donc jamais convertir, et l'action rapide « recommandation » renvoyait sur
                    la liste des recommandations, où le lien vers l'opportunité était perdu.

                    Ce qui débloque la conversion, c'est le palier 4 — « Prête à convertir : données
                    et conditions réunies ». Et une opportunité déjà convertie garde le bouton, pour
                    le périmètre suivant. */}
                {peutConvertir ? (
                  <button
                    type="button"
                    onClick={() => setRecoOuverte(true)}
                    className="w-full rounded-lg bg-gradient-to-br from-opp-600 to-opp-400 px-3 py-2 text-xs font-bold text-white shadow-[0_3px_10px_rgba(140,33,104,.22)] hover:brightness-105"
                  >
                    ＋ {recosLiees.length > 0 ? 'Créer une autre recommandation' : 'Créer la recommandation'}
                  </button>
                ) : (
                  <p className="text-xs leading-relaxed text-km-muted">
                    {manquants.length > 0 ? (
                      <>
                        Il reste à rassembler{' '}
                        <strong className="font-semibold text-km-text">
                          {manquants.map((m) => m.libelle.toLowerCase()).join(', ')}
                        </strong>{' '}
                        avant de pouvoir convertir.
                      </>
                    ) : (
                      <>Cette opportunité est fermée : elle ne peut plus produire de recommandation.</>
                    )}
                  </p>
                )}
                {peutConvertir && recosLiees.length > 0 && (
                  <p className="mt-2 text-km-xs leading-snug text-km-faint">
                    Une recommandation par périmètre à traiter : on peut n'en couvrir qu'une partie et
                    revenir ici pour le reste.
                  </p>
                )}
              </Card>


              {/* L'ORIGINE DE L'OPPORTUNITÉ, DESCENDUE DU VOLET.
                  Elle y était épinglée au-dessus du flux et repoussait vers le bas les deux boutons
                  de création. Ce n'est pas une activité mais une propriété du dossier : sa place est
                  parmi les autres propriétés, dans cet onglet. */}
              <Card className="relative overflow-hidden border-[1.5px] border-opp-200 bg-gradient-to-br from-opp-50 to-white px-3 py-2.5">
                <span className="absolute -right-3.5 -top-3.5 h-[52px] w-[52px] rounded-full bg-[radial-gradient(circle,rgba(168,49,127,.13),transparent_70%)]" />
                <p className="mb-1.5 text-km-tiny font-extrabold uppercase tracking-[0.07em] text-opp-500">
                  📌 Origine de l'opportunité
                </p>
                <div className="flex items-start gap-2">
                  <span className="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-opp-600 to-opp-400 p-1 text-white">
                    <Target className="h-3 w-3" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-km-label font-bold leading-snug text-km-text">
                      {opportunite.signal_libelle || origine?.libelle || 'Origine à préciser'}
                    </p>
                    <p className="mt-0.5 font-mono text-km-tiny text-km-faint">
                      {new Date(opportunite.date_creation).toLocaleDateString('fr-FR')} ·{' '}
                      {new Date(opportunite.date_creation).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                </div>
              </Card>

              {/* Le fil sur petit écran, où la troisième colonne n'a pas la place d'exister. */}
              <Card className="p-4 lg:hidden">
                <p className="mb-2 text-km-xs font-bold uppercase tracking-[0.08em] text-km-faint">
                  Activité · opportunité
                </p>
                <ActivityFeed
                  compteId={opportunite.compte_id ?? ''}
                  compteNom={opportunite.compte_nom ?? ''}
                  interactions={interactionsOpp ?? []}
                  actions={actionsOpp ?? []}
                  documents={documentsDeLOpportunite}
                  opportuniteId={opportunite.id}
                />
              </Card>

              <Card className="p-4">
                <p className="mb-2 text-km-xs font-bold uppercase tracking-[0.08em] text-km-faint">Commentaire</p>
                <InlineField
                  variant="longtext"
                  label=""
                  emptyLabel="aucun"
                  value={opportunite.commentaire ?? ''}
                  onCommit={(v: string) => majOpp({ commentaire: v.trim() || null })}
                  {...retourInline}
                />
                {/* Le « signal positif » saisi à la conversion de la piste — PAS le module Signaux,
                    retiré le 02/09/2026 (voir `cycleNavItems`). Le lien `signal_id` vers ce module
                    ne conditionne donc plus l'affichage : il n'est renseigné sur aucune
                    opportunité, et il n'a plus d'écran où mener. Le libellé, lui, reste — c'est ce
                    que Michel a rendu obligatoire pour ouvrir une opportunité. */}
                {opportunite.signal_libelle && (
                  <p className="mt-3 border-t border-km-line pt-2 text-km-label text-km-muted">
                    <span className="font-bold uppercase tracking-wide text-opp-500">Signal positif</span>{' '}
                    {opportunite.signal_libelle}
                  </p>
                )}
              </Card>
            </div>
          )}

          {onglet === 'historique' && (
            <div className="animate-km-fade-slide">
              <Card className="p-4">
                <p className="mb-2 text-km-xs font-bold uppercase tracking-[0.08em] text-km-faint">
                  Historique des modifications
                </p>
                <HistoriqueDiscret tableNom="opportunites" ligneId={opportunite.id} />
              </Card>
            </div>
          )}

          {onglet === 'fichiers' && (
            <div className="animate-km-fade-slide">
              {/* LE MÊME COMPOSANT QUE LA FICHE COMPTE, pas une copie : dépôt par glisser ou par
                  parcours du poste, catégories, ouverture de la fiche document. La table
                  `documents` était déjà générique (`entite_type` + `entite_id`) ; seule sa
                  contrainte CHECK refusait `opportunite`, levée par la migration 20260823200000 —
                  exactement le blocage d'Agathe sur les compteurs, même cause. */}
              <OngletFichiers
                documents={documentsDeLOpportunite}
                onOuvrir={(d) => navigate(`/documents/${d.id}`)}
                typesDocuments={typesDocuments}
                nomEntite="cette opportunité"
                onDeposer={async (fichiers, typeDocumentId) => {
                  await televerser.mutateAsync({
                    fichiers,
                    entite_type: 'opportunite',
                    entite_id: opportunite.id,
                    type_document_id: typeDocumentId,
                    type_document_libelle: typesDocuments.find((t) => t.id === typeDocumentId)?.libelle ?? '',
                  })
                  signaler(`✓ ${fichiers.length} fichier${fichiers.length > 1 ? 's' : ''} déposé${fichiers.length > 1 ? 's' : ''}`)
                }}
              />
            </div>
          )}
        </div>

        {/* ══ LE VOLET D'ACTIVITÉ, AU MODÈLE DE LA FICHE RECOMMANDATION ══
            William, 07/09/2026 : « les fiches Opportunité, Piste, Requête et Suivi de contrat
            doivent avoir exactement les mêmes fonctionnalités et la même logique ».

            DEUX CHOSES QUITTENT CE VOLET. Son en-tête, dont le titre est monté sur la ligne des
            onglets. Et le bloc « Origine de l'opportunité », qui poussait vers le bas les deux
            boutons de création alors qu'il ne décrit pas une activité mais une propriété du
            dossier : il reprend sa place dans l'onglet Opportunité. `FluxActualite` cède la place à
            `ActivityFeed` — l'historique des modifications reste sous l'onglet Historique.

            Le fond est celui de la page, comme la colonne de gauche : c'est ce qui rend visible
            l'espace sous la barre d'onglets, blanc sur blanc ne se voyant pas. */}
        <div className="hidden min-h-0 flex-col border-l border-km-line bg-km-bg lg:flex">
          <div className="min-h-0 flex-1 overflow-hidden px-3 pb-3 pt-3.5">
            <ActivityFeed
              compteId={opportunite.compte_id ?? ''}
              compteNom={opportunite.compte_nom ?? ''}
              interactions={interactionsOpp ?? []}
              actions={actionsOpp ?? []}
              documents={documentsDeLOpportunite}
              opportuniteId={opportunite.id}
              rattachementTache={
                canManage
                  ? {
                      opportunite_id: opportunite.id,
                      contact_id: opportunite.contact_id ?? null,
                      contact_nom: contact ? `${contact.prenom} ${contact.nom}` : '',
                      compte_id: opportunite.compte_id ?? null,
                      objet_nom: opportunite.compte_nom || '',
                    }
                  : undefined
              }
            />
          </div>
        </div>
      </div>
      {clotureOuverte && (
        <DialogCloture
          opportunite={opportunite}
          // « Abandonnée » a remplacé « Clôturée » : c'est le sixième palier de Michel, et la
          // qualification finale dit laquelle des raisons a fermé le dossier.
          statutClotureId={statuts?.find((s) => s.code === 'ABANDONNEE')?.id ?? null}
          onFermer={() => setClotureOuverte(false)}
          onValide={(m) => { setClotureOuverte(false); signaler(m) }}
          majOpp={majOpp}
        />
      )}

      {/* L'ASSISTANT DE RECOMMANDATION, LANCÉ DEPUIS L'OPPORTUNITÉ.
          Le compte est imposé — on sait de qui il s'agit — et le périmètre part de celui de
          l'opportunité, tout en restant modifiable : c'est précisément le geste de découper en
          plusieurs recommandations, une par périmètre à traiter (diapositive 10). La recommandation
          créée garde `opportunite_id`, sans quoi elle ne reviendrait jamais à son opportunité. */}
      <CreateRecommandationDialog
        open={recoOuverte}
        onClose={() => setRecoOuverte(false)}
        opportuniteId={opportunite.id}
        initialCompteId={opportunite.compte_id ?? undefined}
        initialCompteurIds={opportunite.compteur_ids}
        onCreated={(recoId) => {
          setRecoOuverte(false)
          navigate(`/recommandations/${recoId}`)
        }}
      />

      {/* L'ASSISTANT MANDAT, LANCÉ DEPUIS L'OPPORTUNITÉ. Pré-rempli avec le contact de
          l'opportunité et les compteurs du périmètre QUI NE SONT PAS COUVERTS : ce sont eux qui
          motivent la demande, et les ressaisir serait le moyen de se tromper. L'assistant crée le
          mandat puis ouvre le brouillon DocuSign pour vérification avant envoi. */}
      <Dialog
        open={mandatOuvert && Boolean(opportunite.compte_id)}
        onClose={() => setMandatOuvert(false)}
        title="Demande de mandat"
        description="Le mandat autorise KiWee à intervenir sur le périmètre de cette opportunité. Le contact et les compteurs non couverts sont déjà sélectionnés."
        className="max-w-2xl"
      >
        {/* MONTÉ SEULEMENT À L'OUVERTURE : l'assistant appelle six tables entières. Et enveloppé
            dans un Dialog, parce qu'il rend un simple div — monté nu, son contenu était bien dans
            le DOM mais invisible à l'écran (constaté sur kimatch.fr). La garde de connexion évite
            de remplir quatre étapes pour échouer sur DocuSign à la fin. */}
        {mandatOuvert && opportunite.compte_id && (
          <WizardConnectionGate required={['crm', 'docusign']} feature="demande de mandat">
            <MandatWizard
              compteId={opportunite.compte_id}
              contactInitialId={opportunite.contact_id ?? undefined}
              compteursInitiaux={couverture.manquants.length > 0 ? couverture.manquants : opportunite.compteur_ids}
              onClose={() => setMandatOuvert(false)}
              onCree={() => signaler('✓ Mandat créé — ouverture de DocuSign')}
            />
          </WizardConnectionGate>
        )}
      </Dialog>



      {ajoutOuvert && opportunite.compte_id && (
        <DialogAjoutPerimetre
          opportunite={opportunite}
          onFermer={() => setAjoutOuvert(false)}
          onAjoute={(m) => signaler(m)}
        />
      )}

      {/* ON NE NAVIGUE QU'EN CAS DE SUCCÈS, et sans attendre les invalidations : `useSuppression`
          s'en charge, et affiche un message lisible si la base refuse. */}
      <DialogSuppression
        ouvert={confirmerSuppression}
        onFermer={() => { suppression.reinitialiser(); setConfirmerSuppression(false) }}
        type="opportunite"
        id={opportunite.id}
        nom={opportunite.reference || opportunite.compte_nom || 'Opportunité'}
        onConfirmer={() => suppression.supprimer(
          () => deleteOpportunite.mutateAsync(opportunite.id),
          () => navigate('/opportunites'),
        )}
        enCours={suppression.enCours}
        erreur={suppression.erreur}
      />

      {/* Le découpage du périmètre en lots : rien n'est créé tant qu'on n'a pas confirmé, et l'on
          ne peut pas confirmer tant qu'un compteur n'est ni placé ni écarté. */}
      <DialogConversionOpportunite
        opportunite={opportunite}
        ouvert={conversionOuverte}
        onFermer={() => setConversionOuverte(false)}
        onConverti={(n) => {
          setConversionOuverte(false)
          setToast(`${n} recommandation${n > 1 ? 's' : ''} créée${n > 1 ? 's' : ''}`)
        }}
      />

      {toast && (
        <div className="fixed bottom-[70px] left-1/2 z-50 -translate-x-1/2 whitespace-nowrap rounded-lg bg-ink-800 px-4 py-2.5 text-xs font-semibold text-white shadow-lg lg:bottom-6">
          {toast}
        </div>
      )}
    </div>
  )
}

/**
 * Un bloc de la colonne de gauche, au format de la maquette : pastille d'icône colorée à la teinte
 * de l'objet, intitulé en petites capitales espacées, puis à droite le compteur, le badge ou le lien
 * « ouvrir → ». C'est ce gabarit répété qui donne à la colonne son unité.
 */
function BlocLateral({ titre, icone, couleurIcone, lien, couleurLien, compteur, badge, badgeTon, children }: {
  titre: string
  icone: React.ReactNode
  couleurIcone: string
  lien?: string
  couleurLien?: string
  compteur?: number
  badge?: string
  badgeTon?: 'kiwi' | 'amber'
  children: React.ReactNode
}) {
  const navigate = useNavigate()
  return (
    <div className="rounded-[11px] border border-km-line bg-white px-3.5 py-3">
      <div className="mb-2 flex items-center gap-1.5">
        <span className={cn('flex h-5 w-5 shrink-0 items-center justify-center rounded-md', couleurIcone)}>
          {icone}
        </span>
        <span className="text-km-xs font-bold uppercase tracking-[0.08em] text-km-faint">{titre}</span>
        <span className="flex-1" />
        {typeof compteur === 'number' && (
          <span className="rounded-[5px] bg-indigo-50 px-1.5 py-0.5 text-km-tiny font-extrabold text-indigo-600">
            {compteur}
          </span>
        )}
        {badge && (
          <span
            className={cn(
              'rounded-[5px] px-1.5 py-0.5 text-km-tiny font-extrabold',
              badgeTon === 'kiwi' ? 'bg-kiwi-50 text-km-green' : 'bg-km-amber-soft text-amber-700',
            )}
          >
            {badge}
          </span>
        )}
        {lien && (
          <button
            type="button"
            onClick={() => navigate(lien)}
            className={cn('text-km-xs font-semibold hover:underline', couleurLien ?? 'text-km-green')}
          >
            ouvrir →
          </button>
        )}
      </div>
      {children}
    </div>
  )
}

/** Un compteur du périmètre : son PDL en chiffres fixes, son énergie, et la croix pour l'en sortir. */
function LigneCompteur({ compteur, horsMandat, onRetirer }: {
  compteur: { id: string; numero_pdl: string; type_energie: string }
  horsMandat: boolean
  onRetirer: () => void
}) {
  const gaz = compteur.type_energie === 'gaz'
  return (
    <div className="flex items-center gap-1.5 py-0.5">
      <span
        className={cn(
          'flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-[4px] text-km-micro font-extrabold',
          gaz ? 'bg-sky-100 text-sky-700' : 'bg-km-amber-soft text-amber-700',
        )}
      >
        {gaz ? 'G' : 'E'}
      </span>
      <span className="min-w-0 flex-1 truncate font-mono text-km-xs font-semibold">
        <EntityLink to={`/compteurs/${compteur.id}`}>{compteur.numero_pdl}</EntityLink>
      </span>
      {horsMandat && (
        <span className="shrink-0 rounded-[4px] bg-km-amber-soft px-1 text-km-micro font-extrabold text-amber-700">
          hors mandat
        </span>
      )}
      <button
        type="button"
        onClick={onRetirer}
        title="Retirer du périmètre"
        className="shrink-0 px-0.5 text-km-label text-km-faint hover:text-km-red"
      >
        ×
      </button>
    </div>
  )
}

/**
 * L'anneau de la maquette, mais il compte des OBJETS VALIDES et non des points.
 *
 * William dessinait un score sur 100 dans un anneau de 78 px. Michel a écarté le score le
 * 23/08/2026 ; l'anneau reste, parce qu'il donne d'un coup d'œil l'avancement, et il porte
 * maintenant « 3 / 6 objets ». Le tracé est un cercle SVG dont on découpe la circonférence : plus
 * lisible qu'un dégradé conique, et net à toutes les tailles.
 */
function AnneauMaturite({ valides, total }: { valides: number; total: number }) {
  const rayon = 33
  const circonference = 2 * Math.PI * rayon
  const part = total > 0 ? valides / total : 0
  const complet = valides === total && total > 0
  return (
    <div className="relative h-[78px] w-[78px] shrink-0">
      <svg viewBox="0 0 78 78" className="h-full w-full -rotate-90">
        <circle cx="39" cy="39" r={rayon} fill="none" stroke="#f0efec" strokeWidth="7" />
        <circle
          cx="39"
          cy="39"
          r={rayon}
          fill="none"
          stroke={complet ? '#0d7a5f' : '#a8317f'}
          strokeWidth="7"
          strokeLinecap="round"
          strokeDasharray={`${circonference * part} ${circonference}`}
          className="transition-[stroke-dasharray] duration-500 ease-out"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className={cn('text-km-metric font-bold tabular-nums leading-none', complet ? 'text-km-green' : 'text-opp-500')}>
          {valides}
        </span>
        <span className="font-mono text-km-xs text-km-faint">/ {total}</span>
      </div>
    </div>
  )
}

/** Une ligne de la carte « prochaine action » : intitulé fixe à gauche, valeur modifiable à droite. */

/** Les trois onglets de la maquette. */
const ONGLETS = [
  { cle: 'opportunite' as const, libelle: 'Opportunité' },
  { cle: 'rattachements' as const, libelle: 'Rattachements' },
  { cle: 'fichiers' as const, libelle: 'Fichiers' },
  { cle: 'historique' as const, libelle: 'Historique' },
]

/**
 * La note qui accompagne une action rapide. Un champ, deux boutons : tout ce qu'il faut pour que
 * l'action laisse une trace utile plutôt qu'une ligne muette.
 */

function DialogCloture({ opportunite, statutClotureId, onFermer, onValide, majOpp }: {
  opportunite: Opportunite
  statutClotureId: string | null
  onFermer: () => void
  onValide: (message: string) => void
  majOpp: (patch: PatchOpportunite) => Promise<void>
}) {
  const [qualification, setQualification] = useState('')
  const [motif, setMotif] = useState('')
  const [reactivation, setReactivation] = useState('')
  const [erreur, setErreur] = useState<string | null>(null)
  const [enCours, setEnCours] = useState(false)

  const choisie = QUALIFICATIONS_FIN.find((q) => q.code === qualification)

  async function valider() {
    if (!qualification) return
    setEnCours(true)
    setErreur(null)
    try {
      await majOpp({
        qualification_fin: qualification,
        motif_cloture: motif.trim() || null,
        date_cloture: new Date().toISOString(),
        date_reactivation: qualification === 'REPORTEE' && reactivation ? reactivation : null,
        ...(statutClotureId ? { statut_id: statutClotureId } : {}),
      })
      onValide(choisie?.convertie
        ? '★ Opportunité convertie — vous pouvez créer une recommandation'
        : `Opportunité clôturée : ${choisie?.libelle}`)
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Clôture impossible')
    } finally {
      setEnCours(false)
    }
  }

  return (
    <Dialog open onClose={onFermer} title="Qualifier la clôture" description={opportunite.compte_nom}>
      <div className="space-y-3">
        <FormField label="Quelle qualification finale retenez-vous ?">
          <Select value={qualification} onChange={(e) => setQualification(e.target.value)}>
            <option value="">Choisir…</option>
            {QUALIFICATIONS_FIN.map((q) => <option key={q.code} value={q.code}>{q.libelle}</option>)}
          </Select>
        </FormField>
        {choisie?.convertie && (
          <p className="rounded-lg border border-kiwi-200 bg-kiwi-50 px-3 py-2 text-xs text-km-green">
            Convertie ouvre la création d'une recommandation sur cette opportunité. C'est la seule
            qualification qui le permette.
          </p>
        )}
        <FormField label="Motif">
          <Textarea value={motif} onChange={(e) => setMotif(e.target.value)} rows={2} placeholder="Ce qui a décidé de l'issue…" />
        </FormField>
        {qualification === 'REPORTEE' && (
          <FormField label="Réactivation">
            <input
              type="date"
              value={reactivation}
              onChange={(e) => setReactivation(e.target.value)}
              className="w-full rounded-lg border border-km-line bg-white px-3 py-2 text-sm outline-none focus:border-km-green"
            />
          </FormField>
        )}
        {erreur && <p className="rounded-lg border border-red-200 bg-km-red-soft px-3 py-2 text-xs text-red-700">{erreur}</p>}
        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="ghost" onClick={onFermer}>Annuler</Button>
          <Button type="button" onClick={valider} disabled={!qualification || enCours}>
            {enCours ? 'Clôture…' : 'Valider la clôture'}
          </Button>
        </div>
      </div>
    </Dialog>
  )
}

/** L'ajout au périmètre : les sites et compteurs du compte, en un clic. */
function DialogAjoutPerimetre({ opportunite, onFermer, onAjoute }: {
  opportunite: Opportunite
  onFermer: () => void
  onAjoute: (message: string) => void
}) {
  const { data: sites } = useSitesParCompte(opportunite.compte_id ?? undefined)
  const { data: compteurs } = useCompteurs()
  const majPerimetre = useMajPerimetreOpportunite()
  const [erreur, setErreur] = useState<string | null>(null)

  const sitesDisponibles = (sites ?? []).filter((s) => !opportunite.site_ids.includes(s.id))
  const siteIdsDuCompte = new Set((sites ?? []).map((s) => s.id))
  const compteursDisponibles = (compteurs ?? []).filter(
    (c) => siteIdsDuCompte.has(c.site_id) && !opportunite.compteur_ids.includes(c.id),
  )

  async function ajouter(table: 'sites' | 'compteurs', cibleId: string, libelle: string) {
    setErreur(null)
    try {
      await majPerimetre.mutateAsync({ action: 'ajouter', table, opportuniteId: opportunite.id, cibleId })
      onAjoute(`✓ ${libelle} ajouté au périmètre`)
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Ajout impossible')
    }
  }

  return (
    <Dialog open onClose={onFermer} title="Ajouter au périmètre" description={opportunite.compte_nom}>
      <div className="space-y-3">
        {erreur && <p className="rounded-lg border border-red-200 bg-km-red-soft px-3 py-2 text-xs text-red-700">{erreur}</p>}

        <div>
          <p className="mb-1 text-km-xs font-bold uppercase tracking-wide text-km-faint">Sites</p>
          {sitesDisponibles.length === 0 ? (
            <p className="text-xs text-km-faint">Tous les sites du compte sont déjà dans le périmètre.</p>
          ) : (
            <div className="max-h-[160px] space-y-1 overflow-y-auto pr-1">
              {sitesDisponibles.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => ajouter('sites', s.id, s.nom)}
                  className="flex w-full items-center gap-2 rounded-lg border border-km-line px-3 py-2 text-left text-xs hover:border-kiwi-300 hover:bg-km-bg"
                >
                  <MapPin className="h-3.5 w-3.5 shrink-0 text-km-faint" />
                  <span className="min-w-0 flex-1 truncate font-medium text-km-text">{s.nom}</span>
                  <Plus className="h-3.5 w-3.5 shrink-0 text-km-green" />
                </button>
              ))}
            </div>
          )}
        </div>

        <div>
          <p className="mb-1 text-km-xs font-bold uppercase tracking-wide text-km-faint">Compteurs</p>
          {compteursDisponibles.length === 0 ? (
            <p className="text-xs text-km-faint">Aucun compteur à ajouter.</p>
          ) : (
            <div className="max-h-[200px] space-y-1 overflow-y-auto pr-1">
              {compteursDisponibles.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => ajouter('compteurs', c.id, c.numero_pdl || 'Compteur')}
                  className="flex w-full items-center gap-2 rounded-lg border border-km-line px-3 py-2 text-left text-xs hover:border-kiwi-300 hover:bg-km-bg"
                >
                  <Gauge className="h-3.5 w-3.5 shrink-0 text-km-faint" />
                  <span className="min-w-0 flex-1 truncate">
                    <span className="font-mono font-medium text-km-text">{c.numero_pdl || 'Sans PDL'}</span>
                    {c.site_nom && <span className="text-km-faint"> — {c.site_nom}</span>}
                  </span>
                  <Plus className="h-3.5 w-3.5 shrink-0 text-km-green" />
                </button>
              ))}
            </div>
          )}
        </div>

        <p className="flex items-start gap-1.5 text-km-xs leading-snug text-km-faint">
          <AlertTriangle className="mt-px h-3 w-3 shrink-0" />
          Un compteur ajouté hors du mandat actif est signalé dans le périmètre : c'est ce qui déclenche
          la création d'un nouveau mandat.
        </p>

        <div className="flex justify-end pt-1">
          <Button type="button" variant="outline" onClick={onFermer}>Terminer</Button>
        </div>
      </div>
    </Dialog>
  )
}
