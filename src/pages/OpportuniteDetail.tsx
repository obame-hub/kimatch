import { useMemo, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Target, Plus, X, Check, AlertTriangle, Building2, User, MapPin, Gauge, FileSignature } from 'lucide-react'
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
import {
  prerequisOpportunite,
  statutDerive,
  TON_PIPELINE,
  useOpportunite,
  useMajOpportunite,
  useMajPerimetreOpportunite,
  useStatutsOpportunites,
  ORIGINES_OPPORTUNITE,
  QUALIFICATIONS_FIN,
  type PatchOpportunite,
} from '@/lib/data/opportunites'
import { useSitesParCompte } from '@/lib/data/sites'
import { useCompteurs } from '@/lib/data/compteurs'
import { useContacts } from '@/lib/data/contacts'
import { useMandats } from '@/lib/data/mandats'
import { MandatWizard } from '@/components/mandat/MandatWizard'
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
  const { data: contacts } = useContacts()
  const { data: compteurs } = useCompteurs()
  const { data: mandats } = useMandats()
  const { data: recommandations } = useRecommandationsListe()
  const { data: sitesDuCompte } = useSitesParCompte(opportunite?.compte_id ?? undefined)
  const maj = useMajOpportunite()
  const majPerimetre = useMajPerimetreOpportunite()

  const [toast, setToast] = useState<string | null>(null)
  const [clotureOuverte, setClotureOuverte] = useState(false)
  const [ajoutOuvert, setAjoutOuvert] = useState(false)
  // « On peut lancer la demande de mandat depuis l'opportunité » (Michel, 23/08/2026). Le bouton
  // renvoyait sur la fiche compte, ce qui faisait perdre le périmètre qu'on vient d'établir.
  const [mandatOuvert, setMandatOuvert] = useState(false)

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

  const recosLiees = useMemo(
    () => (recommandations ?? []).filter((r) => opportunite?.recommandation_ids.includes(r.id)),
    [recommandations, opportunite],
  )

  const compteursDuPerimetre = useMemo(
    () => (compteurs ?? []).filter((c) => opportunite?.compteur_ids.includes(c.id)),
    [compteurs, opportunite],
  )

  if (isLoading) {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <Topbar title="Opportunité" />
        <div className="p-6 text-sm text-navy-400">Chargement…</div>
      </div>
    )
  }
  if (!opportunite) {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <Topbar title="Opportunité" />
        <div className="p-6">
          <p className="text-sm text-navy-500">Cette opportunité n'existe pas ou n'est pas visible.</p>
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
    <div className="flex min-h-0 flex-1 flex-col">
      <Topbar title="Opportunité" crumb={opportunite.compte_nom || 'Opportunité'} />
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 lg:px-6">

        {/* ── L'EN-TÊTE ── */}
        <div className="mb-4 flex flex-wrap items-start gap-3">
          <button
            type="button"
            onClick={() => navigate('/opportunites')}
            className="mt-1 rounded-lg p-1.5 text-navy-400 hover:bg-navy-100 hover:text-navy-700"
            title="Retour aux opportunités"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-600">
            <Target className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="truncate text-xl font-bold tracking-tight text-navy-800">
                {opportunite.compte_nom || 'Compte à identifier'}
              </p>
              <Badge tone={TON_PIPELINE[palier?.code ?? ''] ?? 'neutral'}>{palier?.libelle ?? opportunite.statut_libelle}</Badge>
              {opportunite.qualification_fin && (
                <Badge tone={convertie ? 'kiwi' : 'neutral'}>
                  {QUALIFICATIONS_FIN.find((q) => q.code === opportunite.qualification_fin)?.libelle ?? opportunite.qualification_fin}
                </Badge>
              )}
            </div>
            <p className="truncate text-xs text-navy-500">
              {[opportunite.reference, origine?.libelle, opportunite.type_opportunite].filter(Boolean).join(' · ') || 'Origine à préciser'}
            </p>
            <p className="truncate text-[10.5px] text-navy-400">
              Créée le {new Date(opportunite.date_creation).toLocaleDateString('fr-FR')}
              {opportunite.proprietaire_nom && <> · Propriétaire : {opportunite.proprietaire_nom}</>}
            </p>
          </div>
        </div>

        {/* ══ TROIS COLONNES, COMME LA FICHE RECOMMANDATION ══
            Michel, 23/08/2026 : « je partirais sur la même base que la recommandation : les objets
            rattachés à cette opportunité à gauche et les activités à droite ». Les blocs sont ceux
            d'avant, déplacés et non réécrits. Les largeurs sont celles de la fiche recommandation
            (264 px / reste / 300 px) pour que les deux écrans se ressemblent vraiment. */}
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-[264px_minmax(0,1fr)_300px]">
          {/* ══ LES OBJETS RATTACHÉS ══
              Dans l'ordre où l'opportunité les réunit : le compte, le contact, le périmètre, le
              mandat qui le couvre, puis ce qui en est né. */}
          <div className="flex flex-col gap-3">
            <Card className="p-4">
              <p className="mb-2 text-[10px] font-bold uppercase tracking-wide text-navy-400">Compte</p>
              {opportunite.compte_id ? (
                <div className="flex items-center gap-2">
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-sky-100 text-sky-600">
                    <Building2 className="h-4 w-4" />
                  </span>
                  <EntityLink to={`/comptes/${opportunite.compte_id}`}>{opportunite.compte_nom}</EntityLink>
                </div>
              ) : (
                <p className="text-xs text-navy-500">À identifier — c'est un prérequis de conversion.</p>
              )}
            </Card>

            <Card className="p-4">
              <p className="mb-2 text-[10px] font-bold uppercase tracking-wide text-navy-400">Contact principal</p>
              {contact ? (
                <div className="flex items-center gap-2">
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-100 text-violet-600">
                    <User className="h-4 w-4" />
                  </span>
                  <div className="min-w-0">
                    <EntityLink to={`/contacts/${contact.id}`}>{contact.prenom} {contact.nom}</EntityLink>
                    {contact.fonction && <p className="truncate text-[10.5px] text-navy-400">{contact.fonction}</p>}
                  </div>
                </div>
              ) : (
                <p className="text-xs text-navy-500">À identifier — c'est un prérequis de conversion.</p>
              )}
            </Card>

            {/* ── LE PÉRIMÈTRE ── */}
            <Card className="p-4">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <p className="text-[10px] font-bold uppercase tracking-wide text-navy-400">
                  Périmètre
                </p>
                <div className="flex items-center gap-2">
                  <Badge tone="neutral">
                    {opportunite.site_ids.length} site{opportunite.site_ids.length > 1 ? 's' : ''} ·{' '}
                    {opportunite.compteur_ids.length} compteur{opportunite.compteur_ids.length > 1 ? 's' : ''}
                  </Badge>
                  {opportunite.compte_id && (
                    <Button size="sm" variant="outline" onClick={() => setAjoutOuvert(true)}>
                      <Plus className="h-3.5 w-3.5" /> Ajouter
                    </Button>
                  )}
                </div>
              </div>

              {opportunite.site_ids.length === 0 && opportunite.compteur_ids.length === 0 ? (
                <p className="text-xs text-navy-500">
                  {opportunite.compte_id
                    ? 'Aucun site ni compteur. Ajoutez-en au moins un : c’est un prérequis de conversion.'
                    : 'Identifiez d’abord le compte pour choisir ses sites et ses compteurs.'}
                </p>
              ) : (
                <div className="space-y-1.5">
                  {(sitesDuCompte ?? []).filter((s) => opportunite.site_ids.includes(s.id)).map((s) => (
                    <LignePerimetre
                      key={s.id}
                      icone={<MapPin className="h-3.5 w-3.5" />}
                      libelle={s.nom}
                      lien={`/sites/${s.id}`}
                      onRetirer={async () => {
                        await majPerimetre.mutateAsync({ action: 'retirer', table: 'sites', opportuniteId: opportunite.id, cibleId: s.id })
                        signaler('Site retiré du périmètre')
                      }}
                    />
                  ))}
                  {compteursDuPerimetre.map((c) => (
                    <LignePerimetre
                      key={c.id}
                      icone={<Gauge className="h-3.5 w-3.5" />}
                      libelle={`${c.numero_pdl || c.utilisation || 'Compteur'}${c.site_nom ? ` — ${c.site_nom}` : ''}`}
                      lien={`/compteurs/${c.id}`}
                      alerte={couverture.manquants.includes(c.id) ? 'hors mandat' : undefined}
                      onRetirer={async () => {
                        await majPerimetre.mutateAsync({ action: 'retirer', table: 'compteurs', opportuniteId: opportunite.id, cibleId: c.id })
                        signaler('Compteur retiré du périmètre')
                      }}
                    />
                  ))}
                </div>
              )}
            </Card>


            {/* ── LE MANDAT, VÉRIFIÉ CONTRE LE PÉRIMÈTRE ── */}
            <Card className="p-4">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <p className="text-[10px] font-bold uppercase tracking-wide text-navy-400">Mandat</p>
                <Badge tone={mandatCouvre ? 'kiwi' : 'amber'}>
                  {mandatCouvre ? 'Périmètre couvert' : couverture.mandat ? 'Couverture partielle' : 'Aucun mandat actif'}
                </Badge>
              </div>
              {couverture.mandat ? (
                <>
                  <p className="text-xs text-navy-700">
                    <EntityLink to={`/mandats/${couverture.mandat.id}`}>
                      {couverture.mandat.id_salesforce || 'Mandat actif'}
                    </EntityLink>
                    {couverture.mandat.date_fin_validite && (
                      <> · valide jusqu'au {new Date(couverture.mandat.date_fin_validite).toLocaleDateString('fr-FR')}</>
                    )}
                  </p>
                  {couverture.manquants.length === 0 ? (
                    <p className="mt-1 text-xs text-navy-500">
                      Le périmètre entier ({opportunite.compteur_ids.length} compteur
                      {opportunite.compteur_ids.length > 1 ? 's' : ''}) est couvert. Aucune action nécessaire.
                    </p>
                  ) : (
                    <p className="mt-1 text-xs font-semibold text-amber-800">
                      {couverture.manquants.length} compteur{couverture.manquants.length > 1 ? 's' : ''} du périmètre
                      {couverture.manquants.length > 1 ? ' ne sont pas couverts' : " n'est pas couvert"} par ce mandat.
                      Un nouveau mandat doit être créé et envoyé à {contact ? `${contact.prenom} ${contact.nom}` : 'au signataire'}.
                    </p>
                  )}
                </>
              ) : (
                <p className="text-xs text-navy-500">
                  {opportunite.compte_id
                    ? "Aucun mandat actif sur ce compte. Un mandat est nécessaire avant de lancer une recommandation."
                    : "Le compte n'est pas encore identifié : la couverture du mandat ne peut pas être vérifiée."}
                </p>
              )}
              {opportunite.compte_id && !mandatCouvre && (
                <Button
                  size="sm"
                  variant="outline"
                  className="mt-2.5"
                  onClick={() => setMandatOuvert(true)}
                >
                  <FileSignature className="h-3.5 w-3.5" />
                  Lancer la demande de mandat
                </Button>
              )}
            </Card>


            <Card className="p-4">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <p className="text-[10px] font-bold uppercase tracking-wide text-navy-400">
                  Recommandations liées
                </p>
                {convertie ? (
                  <Button size="sm" onClick={() => navigate(`/recommandations?opportunite=${opportunite.id}`)}>
                    <Plus className="h-3.5 w-3.5" /> Créer une recommandation
                  </Button>
                ) : (
                  <Badge tone="neutral">{recosLiees.length}</Badge>
                )}
              </div>
              {recosLiees.length > 0 && (
                <div className="space-y-1.5">
                  {recosLiees.map((r) => (
                    <div key={r.id} className="flex items-center justify-between gap-2 rounded-lg bg-navy-50/60 px-3 py-2">
                      <span className="min-w-0 truncate text-xs font-medium text-navy-800">{r.titre}</span>
                      <EntityLink to={`/recommandations/${r.id}`}>ouvrir →</EntityLink>
                    </div>
                  ))}
                </div>
              )}
              {!convertie && (
                <p className="text-xs leading-relaxed text-navy-500">
                  Une recommandation ne se crée qu'une fois l'opportunité qualifiée en{' '}
                  <strong className="text-navy-700">Convertie</strong>.
                  {manquants.length > 0 && (
                    <> Il reste {manquants.length} élément{manquants.length > 1 ? 's' : ''} à rassembler.</>
                  )}
                </p>
              )}
            </Card>
          </div>

          {/* ══ L'OPPORTUNITÉ ELLE-MÊME ══ */}
          <div className="flex flex-col gap-3">
            {/* ── LA MATURITÉ DE L'OPPORTUNITÉ ──
                Michel, 23/08/2026 : « la maturité se fait si les objets sont valides ». C'est donc ce
                bloc, et pas une jauge : le cœur de l'écran, l'opportunité n'existant que pour
                rassembler ces six choses. Maquette : « Opportunité incomplète — {champ} à
                renseigner ». */}
            <Card className={cn('p-4', manquants.length === 0 ? 'border-kiwi-200 bg-kiwi-50/60' : 'border-amber-200 bg-amber-50')}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className={cn('text-[10px] font-bold uppercase tracking-wide', manquants.length === 0 ? 'text-kiwi-700' : 'text-amber-700')}>
                  {manquants.length === 0
                    ? 'Opportunité mûre — prête à convertir'
                    : `Maturité — ${listePrerequis.length - manquants.length}/${listePrerequis.length} objets valides`}
                </p>
                {manquants.length === 0 && !opportunite.qualification_fin && (
                  <Button size="sm" onClick={() => setClotureOuverte(true)}>
                    Qualifier la clôture
                  </Button>
                )}
              </div>
              <ul className="mt-2.5 grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                {listePrerequis.map((p) => (
                  <li key={p.cle} className="flex items-start gap-2 text-xs">
                    <span className={cn(
                      'mt-px flex h-4 w-4 shrink-0 items-center justify-center rounded-full',
                      p.ok ? 'bg-kiwi-600 text-white' : 'border border-amber-300 bg-white',
                    )}>
                      {p.ok && <Check className="h-2.5 w-2.5" />}
                    </span>
                    <span className={p.ok ? 'text-navy-600' : 'font-semibold text-amber-800'}>{p.libelle}</span>
                  </li>
                ))}
              </ul>
              {/* L'accord du client ne se déduit d'aucune donnée : il se coche. */}
              {!opportunite.accord_client && (
                <Button
                  size="sm"
                  variant="outline"
                  className="mt-3"
                  onClick={async () => {
                    await majOpp({ accord_client: true })
                    signaler('✓ Accord du client noté')
                  }}
                >
                  <Check className="h-3.5 w-3.5" />
                  Noter l'accord du client
                </Button>
              )}
            </Card>


            <Card className="p-4">
              <p className="mb-2.5 text-[10px] font-bold uppercase tracking-wide text-navy-400">Détail</p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <InlineField
                  variant="select"
                  label="Origine"
                  emptyLabel="à préciser"
                  value={opportunite.origine ?? ''}
                  options={ORIGINES_OPPORTUNITE.map((o) => ({ value: o.code, label: o.libelle }))}
                  onCommit={(v) => majOpp({ origine: v || null })}
                  {...retourInline}
                />
                {/* LE STATUT NE SE CHOISIT PLUS. Il se lisait dans une liste déroulante, ce qui
                    permettait de le poser sur « À valider » alors que le mandat manquait juste à
                    côté. Michel donne à chaque palier un sens qui décrit les objets réunis : il est
                    donc calculé, et affiché en lecture seule avec la tâche du moment. */}
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wide text-navy-400">Statut</p>
                  <p className="mt-0.5 text-sm font-medium text-navy-800">{palier?.libelle}</p>
                  <p className="text-[11px] leading-snug text-navy-500">{palier?.tache}</p>
                </div>
                <InlineField
                  variant="text"
                  label="Type d’opportunité"
                  emptyLabel="à préciser"
                  value={opportunite.type_opportunite ?? ''}
                  onCommit={(v) => majOpp({ type_opportunite: v.trim() || null })}
                  {...retourInline}
                />
                <InlineField
                  variant="select"
                  label="Contact"
                  emptyLabel="à identifier"
                  value={opportunite.contact_id ?? ''}
                  options={(contacts ?? [])
                    .filter((c) => !opportunite.compte_id || c.compte_id === opportunite.compte_id)
                    .map((c) => ({ value: c.id, label: `${c.prenom} ${c.nom}` }))}
                  onCommit={(v) => majOpp({ contact_id: v || null })}
                  {...retourInline}
                />
                <InlineField
                  variant="text"
                  label="Prochaine action"
                  emptyLabel="aucune"
                  value={opportunite.prochaine_action ?? ''}
                  onCommit={(v) => majOpp({ prochaine_action: v.trim() || null, prochaine_action_faite_le: null })}
                  {...retourInline}
                />
                <InlineField
                  variant="date"
                  label="Échéance de l’action"
                  emptyLabel="sans échéance"
                  value={opportunite.prochaine_action_echeance?.slice(0, 10) ?? null}
                  onCommit={(v) => majOpp({ prochaine_action_echeance: v || null })}
                  {...retourInline}
                />
              </div>
              <div className="mt-3">
                <InlineField
                  variant="longtext"
                  label="Commentaire"
                  emptyLabel="aucun"
                  value={opportunite.commentaire ?? ''}
                  onCommit={(v: string) => majOpp({ commentaire: v.trim() || null })}
                  {...retourInline}
                />
              </div>
            </Card>
          </div>

          {/* ══ LES ACTIVITÉS ══
              Pour l'instant l'historique des modifications, qui est l'activité que cet objet
              produit réellement. Les interactions (appels, courriels) sont portées par le compte et
              le contact, pas par l'opportunité : les afficher ici demanderait de décider lesquelles
              lui appartiennent, ce que Michel n'a pas tranché. */}
          <div className="flex flex-col gap-3">
            <Card className="p-4">
              <p className="mb-2 text-[10px] font-bold uppercase tracking-wide text-navy-400">
                Activité · opportunité
              </p>
              <HistoriqueDiscret tableNom="opportunites" ligneId={opportunite.id} />
            </Card>
          </div>
        </div>
      </div>

      {clotureOuverte && (
        <DialogCloture
          opportunite={opportunite}
          statutClotureId={statuts?.find((s) => s.code === 'CLOTUREE')?.id ?? null}
          onFermer={() => setClotureOuverte(false)}
          onValide={(m) => { setClotureOuverte(false); signaler(m) }}
          majOpp={majOpp}
        />
      )}

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

      {toast && (
        <div className="fixed bottom-[70px] left-1/2 z-50 -translate-x-1/2 whitespace-nowrap rounded-lg bg-ink-800 px-4 py-2.5 text-xs font-semibold text-white shadow-lg lg:bottom-6">
          {toast}
        </div>
      )}
    </div>
  )
}

/** Une ligne du périmètre : ce qu'elle est, et le moyen de la retirer. */
function LignePerimetre({ icone, libelle, lien, alerte, onRetirer }: {
  icone: React.ReactNode
  libelle: string
  lien: string
  alerte?: string
  onRetirer: () => void
}) {
  return (
    <div className="flex items-center gap-2 rounded-lg bg-navy-50/60 px-3 py-2">
      <span className="shrink-0 text-navy-400">{icone}</span>
      <span className="min-w-0 flex-1 truncate text-xs font-medium text-navy-800">
        <EntityLink to={lien}>{libelle}</EntityLink>
      </span>
      {alerte && <Badge tone="amber">{alerte}</Badge>}
      <button
        type="button"
        onClick={onRetirer}
        title="Retirer du périmètre"
        className="shrink-0 rounded p-1 text-navy-300 hover:bg-white hover:text-red-500"
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  )
}

/**
 * La qualification de clôture.
 *
 * Maquette : « Quelle qualification finale retenez-vous ? » avec un motif et, pour un report, une
 * date de réactivation. Convertie est la seule qui ouvre la création d'une recommandation — l'écran
 * le dit avant de valider, parce que c'est une décision qu'on ne prend pas par mégarde.
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
          <p className="rounded-lg border border-kiwi-200 bg-kiwi-50 px-3 py-2 text-xs text-kiwi-800">
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
              className="w-full rounded-lg border border-navy-200 bg-white px-3 py-2 text-sm outline-none focus:border-kiwi-500"
            />
          </FormField>
        )}
        {erreur && <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{erreur}</p>}
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
        {erreur && <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{erreur}</p>}

        <div>
          <p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-navy-400">Sites</p>
          {sitesDisponibles.length === 0 ? (
            <p className="text-xs text-navy-400">Tous les sites du compte sont déjà dans le périmètre.</p>
          ) : (
            <div className="max-h-[160px] space-y-1 overflow-y-auto pr-1">
              {sitesDisponibles.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => ajouter('sites', s.id, s.nom)}
                  className="flex w-full items-center gap-2 rounded-lg border border-navy-200 px-3 py-2 text-left text-xs hover:border-kiwi-300 hover:bg-navy-50"
                >
                  <MapPin className="h-3.5 w-3.5 shrink-0 text-navy-400" />
                  <span className="min-w-0 flex-1 truncate font-medium text-navy-800">{s.nom}</span>
                  <Plus className="h-3.5 w-3.5 shrink-0 text-kiwi-600" />
                </button>
              ))}
            </div>
          )}
        </div>

        <div>
          <p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-navy-400">Compteurs</p>
          {compteursDisponibles.length === 0 ? (
            <p className="text-xs text-navy-400">Aucun compteur à ajouter.</p>
          ) : (
            <div className="max-h-[200px] space-y-1 overflow-y-auto pr-1">
              {compteursDisponibles.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => ajouter('compteurs', c.id, c.numero_pdl || 'Compteur')}
                  className="flex w-full items-center gap-2 rounded-lg border border-navy-200 px-3 py-2 text-left text-xs hover:border-kiwi-300 hover:bg-navy-50"
                >
                  <Gauge className="h-3.5 w-3.5 shrink-0 text-navy-400" />
                  <span className="min-w-0 flex-1 truncate">
                    <span className="font-mono font-medium text-navy-800">{c.numero_pdl || 'Sans PDL'}</span>
                    {c.site_nom && <span className="text-navy-400"> — {c.site_nom}</span>}
                  </span>
                  <Plus className="h-3.5 w-3.5 shrink-0 text-kiwi-600" />
                </button>
              ))}
            </div>
          )}
        </div>

        <p className="flex items-start gap-1.5 text-[10.5px] leading-snug text-navy-400">
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
