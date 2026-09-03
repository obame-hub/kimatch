import { useEffect, useMemo, useState } from 'react'
import { ApercuDocument } from '@/components/document/ApercuDocument'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Zap, Flame, Lightbulb, Trash2, Building2, MapPin, Gauge, FileText, Plus, Euro, X, Eye, PenLine, Check, ExternalLink, Send, MailOpen, FileSignature, PenTool, LifeBuoy} from 'lucide-react'
import { Topbar } from '@/components/layout/Topbar'
import { Button } from '@/components/ui/button'
import { ZoneDepotFichiers } from '@/components/ui/zone-depot-fichiers'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { FriseStatut } from '@/components/opportunite/FriseStatut'
import { EntityLink } from '@/components/ui/entity-link'
import { useSuiviDuContrat, SANTE_LIBELLE } from '@/lib/data/suivisContrats'
import { Dialog } from '@/components/ui/dialog'
import { FormField, Input, Select } from '@/components/ui/form'
import { HistoriqueDiscret } from '@/components/ui/historique-discret'
import { InlineField } from '@/components/ui/inline-field'
import { useContrat, useUpdateContratPartiel, useDeleteContrat, type PatchContrat } from '@/lib/data/contrats'
import { useSites } from '@/lib/data/sites'
import { useComptes } from '@/lib/data/comptes'
import { useContacts } from '@/lib/data/contacts'
import { useDocuments, useTeleverserDocuments } from '@/lib/data/documents'
import {
  sendContratForSignature,
  connectDocusign,
  etatEnveloppeContrat,
  lienEnveloppeDocusign,
  DocusignNonConnecte,
  type EtatEnveloppe,
} from '@/lib/data/docusign'
import { useReferenceTable } from '@/lib/data/referenceTables'
import { useFormulesTarifaires, useTarifsByContratCompteurs, useCreateTarif, useDeleteTarif } from '@/lib/data/tarifs'
import { useCanManage, useIsAdmin, useProfilsAdmin } from '@/lib/data/roles'
import { useSuppression } from '@/lib/useSuppression'
import { FALLBACK_STATUTS_CONTRATS, FALLBACK_TYPES_DOCUMENTS } from '@/lib/referenceFallbacks'
import { useGoBack } from '@/lib/useGoBack'
import { useRaccourcisOnglets } from '@/lib/useRaccourcisOnglets'
import { cn } from '@/lib/utils'
import type { Contact, Contrat, DocumentItem, TarifContratCompteur } from '@/types/domain'

const FORMULE_CHAMPS: Record<string, { key: string; label: string }[]> = {
  BASE: [{ key: 'prix_base_eur_mwh', label: 'Prix Base (€/MWh)' }],
  HP_HC: [
    { key: 'prix_hp_eur_mwh', label: 'Prix HP (€/MWh)' },
    { key: 'prix_hc_eur_mwh', label: 'Prix HC (€/MWh)' },
  ],
  QUATRE_POSTES: [
    { key: 'prix_hph_eur_mwh', label: 'Prix HPH (€/MWh)' },
    { key: 'prix_hch_eur_mwh', label: 'Prix HCH (€/MWh)' },
    { key: 'prix_hpe_eur_mwh', label: 'Prix HPE (€/MWh)' },
    { key: 'prix_hce_eur_mwh', label: 'Prix HCE (€/MWh)' },
  ],
  CINQ_POSTES: [
    { key: 'prix_hph_eur_mwh', label: 'Prix HPH (€/MWh)' },
    { key: 'prix_hch_eur_mwh', label: 'Prix HCH (€/MWh)' },
    { key: 'prix_hpe_eur_mwh', label: 'Prix HPE (€/MWh)' },
    { key: 'prix_hce_eur_mwh', label: 'Prix HCE (€/MWh)' },
    { key: 'prix_pointe_eur_mwh', label: 'Prix Pointe (€/MWh)' },
  ],
  GAZ_UNIQUE: [{ key: 'prix_gaz_eur_mwh', label: 'Prix gaz (€/MWh)' }],
}

function tarifResume(t: TarifContratCompteur): string {
  const parts: string[] = []
  if (t.prix_base_eur_mwh != null) parts.push(`Base ${t.prix_base_eur_mwh}€`)
  if (t.prix_hp_eur_mwh != null) parts.push(`HP ${t.prix_hp_eur_mwh}€`)
  if (t.prix_hc_eur_mwh != null) parts.push(`HC ${t.prix_hc_eur_mwh}€`)
  if (t.prix_hph_eur_mwh != null) parts.push(`HPH ${t.prix_hph_eur_mwh}€`)
  if (t.prix_hch_eur_mwh != null) parts.push(`HCH ${t.prix_hch_eur_mwh}€`)
  if (t.prix_hpe_eur_mwh != null) parts.push(`HPE ${t.prix_hpe_eur_mwh}€`)
  if (t.prix_hce_eur_mwh != null) parts.push(`HCE ${t.prix_hce_eur_mwh}€`)
  if (t.prix_pointe_eur_mwh != null) parts.push(`Pointe ${t.prix_pointe_eur_mwh}€`)
  if (t.prix_gaz_eur_mwh != null) parts.push(`Gaz ${t.prix_gaz_eur_mwh}€`)
  return parts.join(' · ') || '—'
}

type TabKey = 'contrat' | 'rattachements' | 'perimetre' | 'fichiers'

function CycleDeVieCard({ dateDebut, dateFin }: { dateDebut: string; dateFin: string | null }) {
  const debut = new Date(dateDebut).getTime()
  const fin = dateFin ? new Date(dateFin).getTime() : null
  const now = Date.now()
  const pct = fin ? Math.min(100, Math.max(0, ((now - debut) / (fin - debut)) * 100)) : 0
  const statutLabel = fin == null ? 'sans échéance' : now < debut ? 'à venir' : now > fin ? 'expiré' : 'en cours'
  const joursRestants = fin != null ? Math.round((fin - now) / 86400000) : null

  return (
    <div className="rounded-xl border border-km-line bg-white p-4">
      <div className="mb-2 flex items-center gap-2">
        <span className="text-km-xs font-bold uppercase tracking-wide text-km-faint">Cycle de vie</span>
        <div className="flex-1" />
        {joursRestants != null && joursRestants >= 0 && (
          <span className="text-km-label font-bold text-amber-600">expire dans {joursRestants} jour{joursRestants > 1 ? 's' : ''}</span>
        )}
        {joursRestants != null && joursRestants < 0 && <span className="text-km-label font-bold text-km-faint">{statutLabel}</span>}
      </div>
      {fin != null ? (
        <>
          <div className="relative h-2.5 rounded-full bg-km-soft">
            <div className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-kiwi-500 to-kiwi-400" style={{ width: `${pct}%` }} />
            {now >= debut && now <= fin && (
              <div className="absolute -top-0.5 h-3.5 w-0.5 rounded bg-red-500" style={{ left: `${pct}%` }} />
            )}
          </div>
          <div className="mt-1.5 flex justify-between font-mono text-km-xs text-km-faint">
            <span>{new Date(dateDebut).toLocaleDateString('fr-FR')}</span>
            {now >= debut && now <= fin && <span className="font-bold text-red-500">aujourd'hui</span>}
            <span>{new Date(fin).toLocaleDateString('fr-FR')}</span>
          </div>
        </>
      ) : (
        <p className="text-xs text-km-faint">Débuté le {new Date(dateDebut).toLocaleDateString('fr-FR')} · sans date de fin renseignée.</p>
      )}
    </div>
  )
}

const CLAUSES: { key: keyof Pick<Contrat, 'clause_tacite_reconduction' | 'clause_renegociation_anticipee' | 'clause_engagement_consommation' | 'clause_energie_verte' | 'clause_indexation_prix' | 'clause_penalites_resiliation'>; label: string }[] = [
  { key: 'clause_tacite_reconduction', label: 'Tacite reconduction' },
  { key: 'clause_renegociation_anticipee', label: 'Renégociation anticipée' },
  { key: 'clause_engagement_consommation', label: 'Engagement de consommation' },
  { key: 'clause_energie_verte', label: 'Énergie verte' },
  { key: 'clause_indexation_prix', label: 'Indexation de prix' },
  { key: 'clause_penalites_resiliation', label: 'Pénalités de résiliation anticipée' },
]

/**
 * LE DÉLAI D'ALERTE PAR DÉFAUT, quand le contrat n'en porte pas.
 *
 * Michel, 21/08/2026 : « dépend du fournisseur, on peut pas calculer, c'est le commercial qui le
 * met. » Le délai est donc une donnée du contrat — `jours_alerte_tacite` — et non une règle de
 * l'application. Celle-ci ne garde qu'un repli, pour qu'un contrat non renseigné alerte quand même
 * plutôt que de rester muet, et l'écran dit alors que c'est un repli.
 *
 * Quatre-vingt-dix jours parce que les préavis connus valent le plus souvent 60 jours, parfois 30 :
 * il reste ainsi un mois pour reconsulter avant que la fenêtre se referme. C'est une valeur d'attente,
 * pas une vérité.
 */
const JOURS_ALERTE_DEFAUT = 90

/**
 * Où en est la reconduction tacite de ce contrat.
 *
 * `null` quand il n'y a rien à dire — pas de date connue. On ne devine pas : un contrat dont on
 * ignore s'il se reconduit tout seul ne doit pas afficher une échéance inventée. Sur les 1 599
 * contrats, 465 portent cette date après la reprise du 21/08/2026 ; pour les autres, l'information
 * n'existe ni dans Kimatch ni dans Salesforce, et c'est cela qu'il faut aller chercher.
 */
function echeanceTacite(contrat: Contrat): {
  jour: Date
  jours: number
  /** Le délai d'alerte retenu : celui du contrat, ou le repli. */
  seuil: number
  /** Vrai quand le contrat n'en porte pas et qu'on a pris le repli. */
  seuilParDefaut: boolean
  passee: boolean
  urgent: boolean
  texte: string
} | null {
  if (!contrat.date_declenchement_tacite) return null
  const jour = new Date(contrat.date_declenchement_tacite)
  if (Number.isNaN(jour.getTime())) return null
  const aujourdhui = new Date()
  aujourdhui.setHours(0, 0, 0, 0)
  const jours = Math.round((jour.getTime() - aujourdhui.getTime()) / 86400000)
  const affichee = jour.toLocaleDateString('fr-FR')
  const seuil = contrat.jours_alerte_tacite ?? JOURS_ALERTE_DEFAUT
  if (jours < 0) {
    return {
      jour,
      jours,
      seuil,
      seuilParDefaut: contrat.jours_alerte_tacite == null,
      passee: true,
      urgent: false,
      texte: `La date limite de résiliation est passée depuis le ${affichee} : ce contrat s'est reconduit, ou va le faire, sans qu'on puisse s'y opposer.`,
    }
  }
  return {
    jour,
    jours,
    seuil,
    seuilParDefaut: contrat.jours_alerte_tacite == null,
    passee: false,
    urgent: jours <= seuil,
    texte:
      jours === 0
        ? `Dernier jour pour résilier : c'est aujourd'hui. Demain, le contrat est reconduit.`
        : `Il reste ${jours} jour${jours > 1 ? 's' : ''} pour résilier — jusqu'au ${affichee}. Passé ce jour, le contrat se reconduit tout seul.`,
  }
}

function ClausesCard({ contrat }: { contrat: Contrat }) {
  const renseignees = CLAUSES.filter((c) => contrat[c.key] != null)
  if (renseignees.length === 0) return null
  return (
    <div className="rounded-xl border border-km-line bg-white p-4">
      <p className="mb-2.5 text-km-xs font-bold uppercase tracking-wide text-km-faint">Clauses</p>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {renseignees.map((c) => (
          <div key={c.key} className="flex items-center justify-between gap-2 rounded-lg bg-km-bg/60 px-3 py-2">
            <span className="text-xs text-km-text">{c.label}</span>
            <Badge tone={contrat[c.key] ? 'kiwi' : 'neutral'}>{contrat[c.key] ? 'Oui' : 'Non'}</Badge>
          </div>
        ))}
      </div>
    </div>
  )
}

function AddTarifDialog({
  open,
  onClose,
  contratCompteurId,
  typeEnergie,
}: {
  open: boolean
  onClose: () => void
  contratCompteurId: string
  typeEnergie: 'electricite' | 'gaz'
}) {
  const { data: formules } = useFormulesTarifaires()
  const createTarif = useCreateTarif()
  const formulesFiltrees = useMemo(
    () => (formules ?? []).filter((f) => (typeEnergie === 'gaz' ? f.code === 'GAZ_UNIQUE' : f.code !== 'GAZ_UNIQUE')),
    [formules, typeEnergie],
  )

  const [formuleId, setFormuleId] = useState('')
  const [prix, setPrix] = useState<Record<string, string>>({})
  const [abonnementMensuel, setAbonnementMensuel] = useState('')
  const [abonnementAnnuel, setAbonnementAnnuel] = useState('')
  const [dateDebut, setDateDebut] = useState('')
  const [dateFin, setDateFin] = useState('')
  const [indexation, setIndexation] = useState('')
  const [feedback, setFeedback] = useState<string | null>(null)

  function reset() {
    setFormuleId('')
    setPrix({})
    setAbonnementMensuel('')
    setAbonnementAnnuel('')
    setDateDebut('')
    setDateFin('')
    setIndexation('')
    setFeedback(null)
  }

  const formuleActuelle = formulesFiltrees.find((f) => f.id === formuleId)
  const champsPrix = formuleActuelle ? (FORMULE_CHAMPS[formuleActuelle.code] ?? []) : []

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    try {
      await createTarif.mutateAsync({
        contrat_compteur_id: contratCompteurId,
        type_formule_tarifaire_id: formuleId || null,
        indexation: indexation || null,
        prix_base_eur_mwh: prix.prix_base_eur_mwh ? Number(prix.prix_base_eur_mwh) : null,
        prix_hp_eur_mwh: prix.prix_hp_eur_mwh ? Number(prix.prix_hp_eur_mwh) : null,
        prix_hc_eur_mwh: prix.prix_hc_eur_mwh ? Number(prix.prix_hc_eur_mwh) : null,
        prix_pointe_eur_mwh: prix.prix_pointe_eur_mwh ? Number(prix.prix_pointe_eur_mwh) : null,
        prix_hph_eur_mwh: prix.prix_hph_eur_mwh ? Number(prix.prix_hph_eur_mwh) : null,
        prix_hch_eur_mwh: prix.prix_hch_eur_mwh ? Number(prix.prix_hch_eur_mwh) : null,
        prix_hpe_eur_mwh: prix.prix_hpe_eur_mwh ? Number(prix.prix_hpe_eur_mwh) : null,
        prix_hce_eur_mwh: prix.prix_hce_eur_mwh ? Number(prix.prix_hce_eur_mwh) : null,
        prix_gaz_eur_mwh: prix.prix_gaz_eur_mwh ? Number(prix.prix_gaz_eur_mwh) : null,
        abonnement_mensuel_ht: abonnementMensuel ? Number(abonnementMensuel) : null,
        abonnement_annuel_ht: abonnementAnnuel ? Number(abonnementAnnuel) : null,
        date_debut_validite: dateDebut || null,
        date_fin_validite: dateFin || null,
      })
      reset()
      onClose()
    } catch (err) {
      setFeedback(err instanceof Error ? err.message : 'Erreur inconnue')
    }
  }

  return (
    <Dialog open={open} onClose={() => { reset(); onClose() }} title="Ajouter un tarif" description="Renseigner la grille tarifaire applicable à ce compteur.">
      <form onSubmit={handleSubmit} className="space-y-3">
        <FormField label="Formule tarifaire">
          <Select
            value={formuleId}
            onChange={(e) => { setFormuleId(e.target.value); setPrix({}) }}
            required
          >
            <option value="">Sélectionner…</option>
            {formulesFiltrees.map((f) => <option key={f.id} value={f.id}>{f.libelle}</option>)}
          </Select>
        </FormField>
        {champsPrix.length > 0 && (
          <div className="grid grid-cols-2 gap-3">
            {champsPrix.map((c) => (
              <FormField key={c.key} label={c.label}>
                <Input
                  type="number"
                  step="0.001"
                  value={prix[c.key] ?? ''}
                  onChange={(e) => setPrix((p) => ({ ...p, [c.key]: e.target.value }))}
                />
              </FormField>
            ))}
          </div>
        )}
        <div className="grid grid-cols-2 gap-3">
          <FormField label="Abonnement mensuel HT (€)">
            <Input type="number" step="0.01" value={abonnementMensuel} onChange={(e) => setAbonnementMensuel(e.target.value)} />
          </FormField>
          <FormField label="Abonnement annuel HT (€)">
            <Input type="number" step="0.01" value={abonnementAnnuel} onChange={(e) => setAbonnementAnnuel(e.target.value)} />
          </FormField>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <FormField label="Début de validité">
            <Input type="date" value={dateDebut} onChange={(e) => setDateDebut(e.target.value)} />
          </FormField>
          <FormField label="Fin de validité">
            <Input type="date" value={dateFin} onChange={(e) => setDateFin(e.target.value)} />
          </FormField>
        </div>
        <FormField label="Indexation">
          <Input value={indexation} onChange={(e) => setIndexation(e.target.value)} placeholder="Ex. fixe, indexé marché…" />
        </FormField>
        {feedback && <p className="text-xs text-km-red">{feedback}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="ghost" onClick={() => { reset(); onClose() }}>Annuler</Button>
          <Button type="submit" disabled={createTarif.isPending}>Ajouter</Button>
        </div>
      </form>
    </Dialog>
  )
}

/**
 * ══ LE CHEMIN D'UN CONTRAT, EN SIX JALONS ══════════════════════════════════════════════════════
 *
 * `statuts_contrats` en porte neuf, ordonnés de 5 à 80. Les six retenus sont la progression ; les
 * trois autres n'en font pas partie :
 *
 *   · NOUVEAU (4 contrats) est fondu dans « En préparation » — c'est le même moment vu deux fois,
 *     et deux premiers jalons qui disent la même chose n'apprennent rien.
 *   · RESILIE et ANNULE sont des SORTIES, pas des étapes : un contrat résilié n'est pas « plus
 *     avancé » qu'un contrat actif. La frise sait fermer sur une issue, c'est fait pour ça.
 *
 * L'ordre est celui de la colonne `ordre` en base, donc celui que le métier a posé.
 */
const JALONS_CONTRAT = ['EN_PREPARATION', 'A_SIGNER', 'SIGNE', 'A_VENIR', 'ACTIF', 'TERMINE'] as const

export default function ContratDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  // Perimetre de la fiche, lu cote serveur : ces lectures parcouraient le CRM entier pour en
  // garder une ligne ou quelques-unes (meme correctif que les fiches compte et site).
  const { data: contrat } = useContrat(id)
  /* Le suivi ouvert à la signature de ce contrat, s'il existe (objet créé le 31/08/2026). */
  const { data: suivi } = useSuiviDuContrat(id)
  const { data: sites } = useSites()
  const { data: comptes } = useComptes()
  const { data: documents } = useDocuments()
  const { data: statutsRef } = useReferenceTable('statuts_contrats')
  const statuts = statutsRef && statutsRef.length > 0 ? statutsRef : FALLBACK_STATUTS_CONTRATS
  /* ══ OÙ EN EST LE CONTRAT, POUR LA FRISE ══
     NOUVEAU se lit « En préparation » (même moment, deux noms), et un statut inconnu — une ligne
     de référence ajoutée demain — retombe sur le premier jalon plutôt que de vider la frise. */
  const statutContrat = contrat?.statut ?? ''
  const courantContrat = statutContrat === 'NOUVEAU' ? 'EN_PREPARATION' : statutContrat
  /* Résilié et annulé ferment la frise. Résilié est une PERTE — le client est parti avant terme ;
     annulé est neutre — le contrat n'a jamais commencé, il n'y a rien à regretter. */
  const finaliteContrat =
    statutContrat === 'RESILIE'
      ? { libelle: 'Résilié', perdue: true }
      : statutContrat === 'ANNULE'
        ? { libelle: 'Annulé', perdue: false, neutre: true }
        : null

  const site = sites?.find((s) => s.id === contrat?.site_id)
  const compte = comptes?.find((c) => c.id === site?.compte_id)
  const fournisseur = comptes?.find((c) => c.id === contrat?.fournisseur_compte_id)
  // Aperçu d'un fichier sans quitter la fiche contrat (demande d'Agathe, 07/08/2026).
  const [apercu, setApercu] = useState<{ url: string; nom: string; nomFichier: string } | null>(null)
  const [signatureOuverte, setSignatureOuverte] = useState(false)
  const documentsDuContrat = useMemo(() => documents?.filter((d) => d.entite_type === 'contrat' && d.entite_id === id) ?? [], [documents, id])
  const canManage = useCanManage(contrat?.proprietaire_id)
  const isAdmin = useIsAdmin()
  const { data: profilsAdmin } = useProfilsAdmin()
  const { data: tousContacts } = useContacts()
  // Les contacts qui peuvent signer : ceux du compte porteur du contrat, et seulement s'ils ont une
  // adresse — DocuSign envoie par email, un contact sans email ne peut rien recevoir.
  const contactsDuCompte = useMemo(
    () => (tousContacts ?? []).filter((c) => c.compte_id === contrat?.compte_id && !!c.email),
    [tousContacts, contrat?.compte_id],
  )
  const deleteContrat = useDeleteContrat()

  // Edition en place : un champ se corrige la ou il se lit, sans modale.
  const updateContratPartiel = useUpdateContratPartiel()
  const majContrat = async (patch: PatchContrat) => {
    await updateContratPartiel.mutateAsync({ id: id as string, patch })
  }
  const [toast, setToast] = useState<string | null>(null)
  function showToast(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(null), 2200)
  }
  const retourInline = {
    onSaved: () => showToast('✓ enregistré'),
    onError: (e: Error) => showToast(`Erreur : ${e.message}`),
  }
  const deleteTarif = useDeleteTarif()
  const goBack = useGoBack('/contrats')

  const contratCompteurIds = useMemo(
    () => (contrat?.compteurs.map((c) => c.contrat_compteur_id).filter((v): v is string => !!v) ?? []),
    [contrat],
  )
  const { data: tarifs } = useTarifsByContratCompteurs(contratCompteurIds)

  const [tab, setTab] = useState<TabKey>('contrat')
  const [confirmDelete, setConfirmDelete] = useState(false)

  const televerser = useTeleverserDocuments()

  const { data: typesDocsRef } = useReferenceTable('types_documents')

  const typesDocs = typesDocsRef && typesDocsRef.length > 0 ? typesDocsRef : FALLBACK_TYPES_DOCUMENTS
  const [addTarifFor, setAddTarifFor] = useState<string | null>(null)

  const suppression = useSuppression()

  function handleDelete() {
    if (!contrat) return
    suppression.supprimer(
      () => deleteContrat.mutateAsync(contrat.id),
      () => navigate('/contrats'),
    )
  }

  const TABS: { key: TabKey; label: string; badge?: string }[] = [
    { key: 'contrat', label: 'Contrat' },
    /* Michel et Naoëlle, 31/08/2026 : « plus aucun volet de gauche sur aucun objet ; à la place on
       leur crée un onglet destiné dans l'objet s'il n'existe pas déjà ». Un contrat est rattaché à
       un compte, à un fournisseur, à la recommandation qui l'a produit et au suivi qu'il a ouvert. */
    { key: 'rattachements', label: 'Rattachements' },
    { key: 'perimetre', label: 'Périmètre', badge: contrat?.compteurs.length ? String(contrat.compteurs.length) : undefined },
    { key: 'fichiers', label: 'Fichiers', badge: documentsDuContrat.length ? String(documentsDuContrat.length) : undefined },
  ]

  // « 1–5 pour naviguer » : le raccourci annonce par la maquette dans la barre d'onglets.
  const clesOnglets = TABS.map((t) => t.key)
  useRaccourcisOnglets(clesOnglets, setTab)

  if (!contrat && id) {
    return (
      <div>
        <Topbar crumb="Contrats" title="Contrat" />
        <div className="p-4 sm:p-6"><p className="text-sm text-km-faint">Chargement…</p></div>
      </div>
    )
  }

  if (!contrat) {
    return (
      <div>
        <Topbar crumb="Contrats" title="Contrat" />
        <div className="p-4 sm:p-6">
          <Button variant="ghost" size="sm" className="mb-4" onClick={goBack}>
            <ArrowLeft className="h-4 w-4" />
            Retour aux contrats
          </Button>
          <p className="text-sm text-km-muted">Contrat introuvable.</p>
        </div>
      </div>
    )
  }

  const Icon = contrat.type_energie === 'gaz' ? Flame : Zap
  const energyClasses = contrat.type_energie === 'gaz' ? 'bg-km-amber-soft text-amber-600' : 'bg-sky-100 text-sky-500'

  return (
    <div>
      <Topbar crumb="Contrats" title={contrat.fournisseur_nom} />

      {/* Bandeau contrat */}
      <div className="flex flex-wrap items-center gap-3.5 border-b border-km-line bg-white px-4 py-3.5 sm:px-6">
        <Button variant="ghost" size="icon" onClick={goBack} title="Retour aux contrats">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <span className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px]', energyClasses)}>
          <Icon className="h-[18px] w-[18px]" />
        </span>
        <div className="min-w-0 flex-1">
          {/* ══ LES DEUX PASTILLES SONT PARTIES, UNE FRISE LES REMPLACE ═══════════════════════

              Naoëlle, 03/09/2026 : « c'est quoi ces deux statuts à côté du nom ? c'est
              incompréhensible pourquoi y a deux statuts et pourquoi aucun des deux n'est signé si
              le contrat est vraiment signé. »

              ELLE A RAISON SUR LES DEUX POINTS. Il y avait « À signer » (le statut du contrat) et
              « Envoyé à signer » (celui de l'enveloppe DocuSign) posés côte à côte, sans rien qui
              dise lequel prime ni pourquoi ils diffèrent. Or ils ne sont PAS deux dimensions : les
              neuf statuts de `statuts_contrats` forment un seul chemin ordonné — Nouveau, En
              préparation, À signer, Signé, À venir, Actif, Terminé — dont « À signer » et « Signé »
              recouvrent exactement ce que disait la seconde pastille.

              Deux étiquettes pour une seule progression demandent au lecteur de faire la synthèse.
              La frise la fait : elle montre le chemin, où l'on est, et ce qui reste. Le détail de
              l'enveloppe — envoyée à qui, ouverte quand — reste sous « Envoi à la signature », qui
              existe déjà et qui est le bon endroit pour ce niveau de zoom. */}
          <p className="truncate text-xl font-bold tracking-tight text-km-text">{contrat.fournisseur_nom}</p>
          {/* NOTRE NUMÉRO, JUSTE SOUS LE NOM DU FOURNISSEUR. Naoëlle, 03/09/2026 : « il faut donner
              un numéro généré à nos contrats pour les retrouver facilement ». C'est ce qu'on lit à
              voix haute au téléphone — donc en tête, en chasse fixe, et pas noyé dans le détail
              avec la référence du fournisseur. */}
          <p className="truncate text-xs text-km-muted">
            {contrat.reference && (
              <span className="font-mono font-semibold text-km-text">{contrat.reference} · </span>
            )}
            {contrat.type_energie === 'gaz' ? 'Gaz' : 'Électricité'} · {site?.nom ?? contrat.site_nom}
          </p>
          <p className="truncate text-km-xs text-km-faint">
            {contrat.date_creation && <>Créé le {new Date(contrat.date_creation).toLocaleDateString('fr-FR')} · </>}
            Propriétaire : {contrat.proprietaire_nom || 'Aucun'}
            {contrat.id_salesforce && <> · <span className="font-mono">{contrat.id_salesforce}</span> (temporaire, pour contrôle)</>}
          </p>
        </div>
        {canManage && (
          <div className="flex gap-1.5">
            {/* Plus de bouton « Modifier » : les champs s'editent dans « Détail du contrat ». */}
            <Button size="sm" onClick={() => setSignatureOuverte(true)}>
              <PenLine className="h-3.5 w-3.5" />
              Envoyer via DocuSign
            </Button>
            <Button variant="outline" size="sm" onClick={() => setConfirmDelete(true)}>
              <Trash2 className="h-3.5 w-3.5" />
              Supprimer
            </Button>
          </div>
        )}
      </div>

      {/* Onglets */}
      <div className="flex gap-1.5 overflow-x-auto border-b border-km-line bg-white px-4 pt-2.5 lg:gap-0.5 lg:pt-0 sm:px-6">
        {TABS.map((t) => {
          const isActive = tab === t.key
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={cn(
                'mb-2.5 inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 py-2 text-km-body font-semibold transition-colors lg:mb-0 lg:rounded-none lg:border-b-2 lg:px-3 lg:py-2.5 lg:font-normal',
                isActive
                  ? 'bg-ink-800 text-white lg:border-navy-800 lg:bg-transparent lg:font-semibold lg:text-km-text'
                  : 'border border-km-line bg-white text-km-muted hover:bg-km-bg lg:border-0 lg:border-b-2 lg:border-transparent lg:text-km-muted lg:hover:bg-transparent lg:hover:text-km-text',
              )}
            >
              {t.label}
              {t.badge && (
                <span className={cn('rounded px-1.5 py-0.5 text-km-tiny font-bold', isActive ? 'bg-white/20 text-white lg:bg-km-soft lg:text-km-muted' : 'bg-km-soft text-km-muted')}>
                  {t.badge}
                </span>
              )}
            </button>
          )
        })}
      </div>

      <div className="grid grid-cols-1">
        {/* Centre */}
        <div className="bg-km-bg p-4 sm:p-5">
          {tab === 'rattachements' && (
            <div className="flex max-w-[560px] flex-col gap-3.5">
        {compte && (
          <div className="rounded-xl border border-km-line bg-white p-3.5">
            <div className="mb-2 flex items-center gap-1.5">
              <span className="flex h-5 w-5 items-center justify-center rounded-md bg-sky-100 text-sky-500"><Building2 className="h-2.5 w-2.5" /></span>
              <span className="text-km-xs font-bold uppercase tracking-wide text-km-faint">Compte</span>
              <div className="flex-1" />
              <EntityLink to={`/comptes/${compte.id}`}>ouvrir →</EntityLink>
            </div>
            <p className="text-km-body font-bold text-sky-500">{compte.nom}</p>
          </div>
        )}

        {site && (
          <div className="rounded-xl border border-km-line bg-white p-3.5">
            <div className="mb-2 flex items-center gap-1.5">
              <span className="flex h-5 w-5 items-center justify-center rounded-md bg-km-green-soft text-km-green"><MapPin className="h-2.5 w-2.5" /></span>
              <span className="text-km-xs font-bold uppercase tracking-wide text-km-faint">Site</span>
              <div className="flex-1" />
              <EntityLink to={`/sites/${site.id}`}>ouvrir →</EntityLink>
            </div>
            <p className="text-km-body font-bold text-km-green">{site.nom}</p>
          </div>
        )}

        <div className="rounded-xl border border-km-line bg-white p-3.5">
          <div className="mb-2 flex items-center gap-1.5">
            <span className={cn('flex h-5 w-5 items-center justify-center rounded-md', energyClasses)}><Icon className="h-2.5 w-2.5" /></span>
            <span className="text-km-xs font-bold uppercase tracking-wide text-km-faint">Fournisseur retenu</span>
          </div>
          {contrat.fournisseur_compte_id ? (
            <EntityLink to={`/comptes/${contrat.fournisseur_compte_id}`}>{contrat.fournisseur_nom}</EntityLink>
          ) : (
            <p className="text-km-body font-bold text-km-text">{contrat.fournisseur_nom}</p>
          )}
          {fournisseur && <p className="mt-1 text-km-xs text-km-muted">{fournisseur.segment}</p>}
        </div>

        {/* ══ D'OÙ VIENT CE CONTRAT ══

            Le lien contrat → recommandation existait en colonne mais n'était renseigné que sur
            TROIS contrats sur 1 598 : la reprise Salesforce ne l'avait pas importé. Rétabli le
            27/08/2026 sur 697 contrats depuis `Contract.Opportunit__c` (migration 20260827120000).

            Il ne s'affichait nulle part, et c'est ce qui manquait le plus : sans lui on ne peut pas
            remonter d'un contrat signé à l'étude qui l'a emporté — donc ni relire les conditions
            proposées, ni savoir quel travail a produit quel résultat. La carte se tait quand le
            lien est absent plutôt que d'afficher un « Aucune » qui n'apprendrait rien. */}
        {contrat.recommandation_id && (
          <div className="rounded-xl border border-km-line bg-white p-3.5">
            <div className="mb-2 flex items-center gap-1.5">
              <span className="flex h-5 w-5 items-center justify-center rounded-md bg-km-amber-soft text-amber-600"><Lightbulb className="h-2.5 w-2.5" /></span>
              <span className="text-km-xs font-bold uppercase tracking-wide text-km-faint">Issu de la recommandation</span>
              <div className="flex-1" />
              <EntityLink to={`/recommandations/${contrat.recommandation_id}`}>ouvrir →</EntityLink>
            </div>
            <p className="text-km-body font-bold text-km-text">
              {contrat.recommandation_nom || 'Recommandation'}
            </p>
          </div>
        )}

        {/* ══ CE QUE CE CONTRAT EST DEVENU ══
            Le suivi ouvert à sa signature. La carte se tait quand il n'y en a pas — un contrat non
            signé n'en a pas, et un « Aucun suivi » n'apprendrait rien. Elle porte l'étape et la
            santé parce que c'est ce qu'on vient chercher depuis un contrat : où en est la vie de
            cette affaire. */}
        {suivi && (
          <div className="rounded-xl border border-km-line bg-white p-3.5">
            <div className="mb-2 flex items-center gap-1.5">
              <span className="flex h-5 w-5 items-center justify-center rounded-md bg-km-green-soft text-km-green">
                <LifeBuoy className="h-2.5 w-2.5" />
              </span>
              <span className="text-km-xs font-bold uppercase tracking-wide text-km-faint">Suivi de contrat</span>
              <div className="flex-1" />
              <EntityLink to={`/suivis-contrats/${suivi.id}`}>ouvrir →</EntityLink>
            </div>
            <p className="text-km-body font-bold text-km-text">{suivi.etape_libelle}</p>
            <p className="mt-0.5 text-km-label text-km-muted">
              {SANTE_LIBELLE[suivi.sante] ?? suivi.sante}
              {suivi.actions_ouvertes > 0 && ` · ${suivi.actions_ouvertes} action(s) à faire`}
            </p>
          </div>
        )}
            </div>
          )}

          {tab === 'contrat' && (
            <div className="flex flex-col gap-3.5">
              <Card className="px-4 pb-1 pt-1">
                <FriseStatut
                  teinte="contrat"
                  jalons={JALONS_CONTRAT.map((code) => ({
                    code,
                    libelle: statuts.find((s) => s.code === code)?.libelle ?? code,
                  }))}
                  courant={courantContrat}
                  finalite={finaliteContrat}
                  /* ══ ON CLIQUE LA FRISE POUR AVANCER LE CONTRAT ═══════════════════════════════

                     Naoëlle, 03/09/2026, une fois la frise en place : « et du coup comment je
                     change le statut ». Il était déjà modifiable — en cliquant sa valeur sous
                     « Statut », dans le détail plus bas — mais plus personne ne l'y cherchait :
                     quand une frise montre le chemin en haut de page, c'est sur elle qu'on veut
                     agir. Un contrôle qu'on ne trouve pas équivaut à un contrôle qui n'existe pas.

                     LES SIX JALONS SEULEMENT. Résilier ou annuler ne se fait pas d'un clic sur une
                     frise dont ils sont absents tant que le contrat vit : ces deux-là restent dans
                     le sélecteur du détail, qui propose les neuf statuts. Avancer d'une étape est
                     un geste courant ; sortir un contrat en est un autre, et il vaut mieux qu'il
                     demande d'aller le chercher. */
                  onJalon={
                    canManage
                      ? (code) => {
                          const statut = statuts.find((s) => s.code === code)
                          if (!statut || statut.code === contrat.statut) return
                          majContrat({ statut_id: statut.id })
                            .then(() => showToast(`✓ ${statut.libelle}`))
                            .catch((e) =>
                              showToast(e instanceof Error ? `Erreur : ${e.message}` : 'Enregistrement impossible'),
                            )
                        }
                      : undefined
                  }
                />
              </Card>
              {contrat.date_debut && (
                <CycleDeVieCard dateDebut={contrat.date_debut} dateFin={contrat.date_fin} />
              )}
              <div className="rounded-xl border border-km-line bg-white p-4">
              <p className="mb-2.5 text-km-xs font-bold uppercase tracking-wide text-km-faint">Détail du contrat</p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <p className="mb-0.5 text-km-xs uppercase tracking-wide text-km-faint">Énergie</p>
                  <Badge tone="neutral">{contrat.type_energie === 'gaz' ? 'Gaz' : 'Électricité'}</Badge>
                </div>
                {/* Edition en place : ces champs se corrigeaient dans une modale « Modifier »,
                    alors qu'un contrat se rectifie surtout au fil de l'eau (une date de fin qui
                    bouge, un preavis qu'on decouvre en lisant le PDF). Les champs vides
                    s'affichent desormais en pointille cliquable au lieu de disparaitre : la
                    reference fournisseur et le preavis n'apparaissaient PAS tant qu'ils etaient
                    vides, donc rien n'invitait a les renseigner. */}
                {canManage ? (
                  <>
                    <InlineField
                      variant="select"
                      label="Statut"
                      value={contrat.statut}
                      options={statuts.map((s) => ({ value: s.code, label: s.libelle }))}
                      onCommit={(code) => {
                        const statut = statuts.find((s) => s.code === code)
                        if (!statut) throw new Error('Statut de contrat introuvable.')
                        return majContrat({ statut_id: statut.id })
                      }}
                      {...retourInline}
                    />
                    <InlineField
                      variant="text" mono
                      label="Référence fournisseur"
                      value={contrat.reference_fournisseur ?? ''}
                      onCommit={(v) => majContrat({ reference_fournisseur: v.trim() || null })}
                      {...retourInline}
                    />
                    <InlineField
                      variant="date"
                      label="Début"
                      value={contrat.date_debut ?? null}
                      onCommit={(date_debut) => majContrat({ date_debut })}
                      {...retourInline}
                    />
                    <InlineField
                      variant="date"
                      label="Fin"
                      emptyLabel="sans échéance"
                      value={contrat.date_fin ?? null}
                      onCommit={(date_fin) => majContrat({ date_fin })}
                      {...retourInline}
                    />
                    <InlineField
                      variant="number"
                      label="Préavis de résiliation"
                      unit="jours"
                      value={contrat.preavis_resiliation_jours ?? null}
                      onCommit={(preavis_resiliation_jours) => majContrat({ preavis_resiliation_jours })}
                      {...retourInline}
                    />
                    <InlineField
                      variant="select"
                      label="Signataire"
                      emptyLabel="choisir un signataire"
                      value={contrat.contact_signataire_id ?? ''}
                      // Restreint aux contacts du compte du contrat : proposer les 3000 contacts
                      // du CRM ferait choisir un signataire qui n'a rien a voir avec le client.
                      options={(tousContacts ?? [])
                        .filter((c) => c.compte_id === compte?.id)
                        .map((c) => ({ value: c.id, label: `${c.prenom ?? ''} ${c.nom ?? ''}`.trim() }))}
                      onCommit={(v) => majContrat({ contact_signataire_id: v || null })}
                      {...retourInline}
                    />
                    {/* Le proprietaire commande la visibilite du contrat : administrateurs seuls,
                        comme dans l'ancienne modale. */}
                    {isAdmin && (
                      <InlineField
                        variant="select"
                        label="Propriétaire"
                        emptyLabel="aucun"
                        value={contrat.proprietaire_id ?? ''}
                        options={(profilsAdmin ?? []).map((p) => ({ value: p.id, label: `${p.prenom} ${p.nom}` }))}
                        onCommit={(v) => majContrat({ proprietaire_id: v || null })}
                        {...retourInline}
                      />
                    )}
                  </>
                ) : (
                  <>
                    {contrat.reference_fournisseur && (
                      <div>
                        <p className="mb-0.5 text-km-xs uppercase tracking-wide text-km-faint">Référence fournisseur</p>
                        <p className="font-mono text-xs font-semibold text-km-text">{contrat.reference_fournisseur}</p>
                      </div>
                    )}
                    <div>
                      <p className="mb-0.5 text-km-xs uppercase tracking-wide text-km-faint">Début</p>
                      <p className="text-xs font-semibold text-km-text">{contrat.date_debut ? new Date(contrat.date_debut).toLocaleDateString('fr-FR') : '—'}</p>
                    </div>
                    <div>
                      <p className="mb-0.5 text-km-xs uppercase tracking-wide text-km-faint">Fin</p>
                      <p className="text-xs font-semibold text-km-text">{contrat.date_fin ? new Date(contrat.date_fin).toLocaleDateString('fr-FR') : 'sans échéance'}</p>
                    </div>
                    {contrat.preavis_resiliation_jours != null && (
                      <div>
                        <p className="mb-0.5 text-km-xs uppercase tracking-wide text-km-faint">Préavis de résiliation</p>
                        <p className="text-xs font-semibold text-km-text">{contrat.preavis_resiliation_jours} jours</p>
                      </div>
                    )}
                    {contrat.contact_signataire_nom && (
                      <div>
                        <p className="mb-0.5 text-km-xs uppercase tracking-wide text-km-faint">Signataire</p>
                        {contrat.contact_signataire_id ? (
                          <EntityLink to={`/contacts/${contrat.contact_signataire_id}`} className="text-xs font-semibold">{contrat.contact_signataire_nom}</EntityLink>
                        ) : (
                          <p className="text-xs font-semibold text-km-text">{contrat.contact_signataire_nom}</p>
                        )}
                      </div>
                    )}
                  </>
                )}
                {contrat.interlocuteur_pricing_nom && (
                  <div>
                    <p className="mb-0.5 text-km-xs uppercase tracking-wide text-km-faint">Interlocuteur pricing</p>
                    <p className="text-xs font-semibold text-km-text">{contrat.interlocuteur_pricing_nom}</p>
                  </div>
                )}
                {contrat.date_signature && (
                  <div>
                    <p className="mb-0.5 text-km-xs uppercase tracking-wide text-km-faint">Date de signature</p>
                    <p className="text-xs font-semibold text-km-text">{new Date(contrat.date_signature).toLocaleDateString('fr-FR')}</p>
                  </div>
                )}
                {contrat.date_debut && contrat.date_fin && (
                  <div>
                    <p className="mb-0.5 text-km-xs uppercase tracking-wide text-km-faint">Durée</p>
                    <p className="text-xs font-semibold text-km-text">
                      {Math.round((new Date(contrat.date_fin).getTime() - new Date(contrat.date_debut).getTime()) / (1000 * 60 * 60 * 24 * 30.44))} mois
                    </p>
                  </div>
                )}
                {contrat.type_prix && (
                  <div>
                    <p className="mb-0.5 text-km-xs uppercase tracking-wide text-km-faint">Type de prix</p>
                    <Badge tone={contrat.type_prix === 'Fixe' ? 'kiwi' : 'amber'}>{contrat.type_prix}</Badge>
                  </div>
                )}
                {contrat.prix_molecule_eur_mwh != null && (
                  <div>
                    <p className="mb-0.5 text-km-xs uppercase tracking-wide text-km-faint">Prix molécule</p>
                    <p className="font-mono text-xs font-semibold text-km-text">{contrat.prix_molecule_eur_mwh.toLocaleString('fr-FR')} €/MWh</p>
                  </div>
                )}
                {contrat.strategie_tarifaire && (
                  <div>
                    <p className="mb-0.5 text-km-xs uppercase tracking-wide text-km-faint">Stratégie tarifaire</p>
                    <p className="text-xs text-km-text">{contrat.strategie_tarifaire === 'prix_cible' ? 'Prix cible' : 'Marge fixe'}</p>
                  </div>
                )}
              </div>
              <HistoriqueDiscret tableNom="contrats" ligneId={contrat.id} />
              </div>

              {/* ── LA RECONDUCTION TACITE ──
                  Ce que Kimatch ignorait jusqu'au 21/08/2026 : la DATE au-delà de laquelle le contrat
                  se reconduit tout seul. Salesforce la portait, sur 505 contrats ; Kimatch n'avait
                  même pas de colonne pour l'accueillir. Elle décide de tout — passé ce jour, il n'y a
                  plus rien à négocier pendant toute la durée du contrat suivant.

                  Le bandeau s'allume quand l'échéance approche ou qu'elle est passée, parce qu'une
                  date rangée dans une grille de champs ne se voit pas. */}
              {(() => {
                const e = echeanceTacite(contrat)

                // LA SAISIE, TOUJOURS DISPONIBLE. Michel, 21/08/2026 : la tacite se renseigne
                // « par contrat », et l'information se lit « sur le contrat ou l'ancien contrat en
                // cours ». C'est donc ici, sur la fiche où l'on a le PDF sous les yeux, que ça se
                // remplit — et pour 1 134 contrats sur 1 599, tout reste à remplir.
                const saisie = (
                  <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
                    <InlineField
                      variant="select"
                      label="Reconduction tacite"
                      emptyLabel="on ne sait pas"
                      value={contrat.clause_tacite_reconduction == null ? '' : contrat.clause_tacite_reconduction ? 'oui' : 'non'}
                      options={[{ value: 'oui', label: 'Oui' }, { value: 'non', label: 'Non' }]}
                      onCommit={(v) => majContrat({ clause_tacite_reconduction: v === '' ? null : v === 'oui' })}
                      {...retourInline}
                    />
                    <InlineField
                      variant="date"
                      label="Date limite de résiliation"
                      value={contrat.date_declenchement_tacite ?? null}
                      onCommit={(v) => majContrat({ date_declenchement_tacite: v || null })}
                      {...retourInline}
                    />
                    {/* LE DÉLAI D'ALERTE EST UNE DONNÉE DU CONTRAT. « Dépend du fournisseur, on peut
                        pas calculer, c'est le commercial qui le met. » */}
                    <InlineField
                      variant="number"
                      label="Prévenir X jours avant"
                      unit="jours"
                      emptyLabel={`${JOURS_ALERTE_DEFAUT} par défaut`}
                      value={contrat.jours_alerte_tacite ?? null}
                      onCommit={(v) => majContrat({ jours_alerte_tacite: v })}
                      {...retourInline}
                    />
                  </div>
                )

                // Quatre situations, et chacune dit quoi faire.
                if (contrat.clause_tacite_reconduction === false) {
                  // Pas de tacite : rien à surveiller, on ne prend pas de place. La saisie reste
                  // accessible au cas où l'information serait fausse.
                  return (
                    <div className="rounded-xl border border-km-line bg-white p-4">
                      <p className="text-km-xs font-bold uppercase tracking-wide text-km-faint">
                        Reconduction tacite
                      </p>
                      <p className="mt-1 text-xs text-km-muted">
                        Ce contrat ne se reconduit pas tout seul : il s'arrête à sa date de fin.
                      </p>
                      {saisie}
                    </div>
                  )
                }

                if (!e) {
                  const inconnu = contrat.clause_tacite_reconduction == null
                  return (
                    <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
                      <p className="text-km-xs font-bold uppercase tracking-wide text-amber-700">
                        Reconduction tacite
                      </p>
                      <p className="mt-1 text-xs leading-relaxed text-km-amber">
                        {inconnu
                          ? "On ne sait pas si ce contrat se reconduit tout seul. L'information est écrite dans le contrat lui-même, ou dans le précédent : reportez-la ici, sinon personne ne peut savoir s'il faut agir ni quand."
                          : "Ce contrat se reconduit tacitement, mais sa date limite de résiliation n'est pas renseignée : personne ne peut savoir quand il faut agir. Elle est écrite dans le contrat, autour de la date de fin moins le préavis — mais elle ne se calcule pas, reportez celle qui y figure."}
                      </p>
                      {saisie}
                    </div>
                  )
                }

                return (
                  <div
                    className={cn(
                      'rounded-xl border p-4',
                      e.passee
                        ? 'border-red-200 bg-km-red-soft'
                        : e.urgent
                          ? 'border-amber-200 bg-amber-50'
                          : 'border-km-line bg-white',
                    )}
                  >
                    <p
                      className={cn(
                        'text-km-xs font-bold uppercase tracking-wide',
                        e.passee ? 'text-red-700' : e.urgent ? 'text-amber-700' : 'text-km-faint',
                      )}
                    >
                      Reconduction tacite
                    </p>
                    <p
                      className={cn(
                        'mt-1 text-xs leading-relaxed',
                        e.passee ? 'text-red-800' : e.urgent ? 'text-km-amber' : 'text-km-text',
                      )}
                    >
                      {e.texte}
                      {!e.passee && (
                        <>
                          {' '}
                          <span className={e.urgent ? 'text-amber-700' : 'text-km-faint'}>
                            Signalé à {e.seuil} jours
                            {e.seuilParDefaut && ' (valeur par défaut, à confirmer)'}.
                          </span>
                        </>
                      )}
                    </p>
                    <p className="mt-1.5 text-km-xs text-km-faint">
                      Fin du contrat :{' '}
                      {contrat.date_fin ? new Date(contrat.date_fin).toLocaleDateString('fr-FR') : '—'}
                      {contrat.preavis_resiliation_jours != null && (
                        <> · {contrat.preavis_resiliation_jours} jours de préavis</>
                      )}
                    </p>
                    {saisie}
                  </div>
                )
              })()}

              <ClausesCard contrat={contrat} />

              {/* ── CE QUI EST PARTI À LA SIGNATURE ──
                  Naoëlle, 21/08/2026, après avoir envoyé le contrat de SDC AMPLITUDE 2 : « j'ai
                  envoyé ce contrat mais j'ai rien qui me montre s'il a bien été envoyé. Comment je
                  suis sûre que ça a envoyé ? »

                  Elle avait la pastille de l'en-tête et rien d'autre : ni la date, ni le
                  destinataire, ni moyen de vérifier. Or une pastille qui vient d'un webhook ne
                  prouve rien — si la notification n'arrive pas, elle affiche un état périmé sans le
                  savoir. D'où ce bloc, qui montre à qui et quand, et le bouton qui va le demander à
                  DocuSign plutôt que de se croire. */}
              <BlocEnvoiSignature contrat={contrat} signaler={showToast} />
            </div>
          )}

          {tab === 'perimetre' && (
            <div className="flex flex-col gap-2.5">
              {contrat.compteurs.length === 0 ? (
                <p className="text-sm text-km-faint">Aucun compteur couvert par ce contrat.</p>
              ) : (
                contrat.compteurs.map((c) => {
                  const tarifsDuCompteur = (tarifs ?? []).filter((t) => t.contrat_compteur_id === c.contrat_compteur_id)
                  return (
                    <div key={c.id} className="rounded-xl border border-km-line bg-white p-3.5">
                      <div
                        onClick={() => navigate(`/compteurs/${c.id}`)}
                        className="flex cursor-pointer items-center gap-3 hover:opacity-80"
                      >
                        <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px]', energyClasses)}>
                          <Gauge className="h-4 w-4" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-bold text-km-text">{c.utilisation || c.numero_pdl}</p>
                          <p className="truncate font-mono text-km-xs text-km-faint">{c.numero_pdl}</p>
                        </div>
                      </div>

                      <div className="mt-3 border-t border-navy-50 pt-3">
                        <div className="mb-2 flex items-center gap-1.5">
                          <span className="text-km-xs font-bold uppercase tracking-wide text-km-faint">Tarification</span>
                          <div className="flex-1" />
                          {canManage && c.contrat_compteur_id && (
                            <Button size="sm" variant="outline" onClick={() => setAddTarifFor(c.contrat_compteur_id)}>
                              <Plus className="h-3 w-3" />
                              Ajouter un tarif
                            </Button>
                          )}
                        </div>
                        {tarifsDuCompteur.length === 0 ? (
                          <p className="text-xs text-km-faint">Aucun tarif renseigné.</p>
                        ) : (
                          <div className="flex flex-col gap-1.5">
                            {tarifsDuCompteur.map((t) => (
                              <div key={t.id} className="flex items-center gap-2 rounded-lg bg-km-bg/60 px-2.5 py-2">
                                <Euro className="h-3 w-3 shrink-0 text-km-faint" />
                                <div className="min-w-0 flex-1">
                                  <div className="flex flex-wrap items-center gap-1.5">
                                    {t.formule_libelle && <Badge tone="neutral">{t.formule_libelle}</Badge>}
                                    {!t.actif && <Badge tone="amber">inactif</Badge>}
                                  </div>
                                  <p className="mt-1 truncate text-km-label font-semibold text-km-text">{tarifResume(t)}</p>
                                  {(t.abonnement_mensuel_ht != null || t.abonnement_annuel_ht != null) && (
                                    <p className="text-km-xs text-km-faint">
                                      Abonnement {t.abonnement_mensuel_ht != null ? `${t.abonnement_mensuel_ht}€/mois` : ''}
                                      {t.abonnement_mensuel_ht != null && t.abonnement_annuel_ht != null ? ' · ' : ''}
                                      {t.abonnement_annuel_ht != null ? `${t.abonnement_annuel_ht}€/an` : ''}
                                    </p>
                                  )}
                                  {(t.date_debut_validite || t.date_fin_validite) && (
                                    <p className="text-km-xs text-km-faint">
                                      Valide du {t.date_debut_validite ? new Date(t.date_debut_validite).toLocaleDateString('fr-FR') : '…'} au{' '}
                                      {t.date_fin_validite ? new Date(t.date_fin_validite).toLocaleDateString('fr-FR') : 'sans échéance'}
                                    </p>
                                  )}
                                </div>
                                {canManage && (
                                  <button
                                    type="button"
                                    onClick={() => deleteTarif.mutate(t.id)}
                                    className="shrink-0 rounded p-1 text-km-faint hover:bg-white hover:text-red-500"
                                    title="Supprimer ce tarif"
                                  >
                                    <X className="h-3 w-3" />
                                  </button>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          )}

          {tab === 'fichiers' && (
            <div className="flex flex-col gap-3.5">
              {/* PAS DE BOUTON « Ajouter un fichier ». Naoelle, 21/08/2026 : « si on peut cliquer
                  ou deposer c'est bon, pas besoin de bruit visuel avec un bouton », puis « fais le
                  menage partout ». La zone juste en dessous dit les deux gestes et les accepte tous
                  les deux ; le bouton doublait l'un d'eux. Le rattachement par lien, qui n'etait
                  accessible que par lui, se fait desormais dans la zone — en y glissant le lien, ou
                  en le collant. */}
              {/* Depot reel de fichiers — possible depuis que le bucket « documents » a des
                  politiques d'ecriture (migration 20260816130000). */}
              <ZoneDepotFichiers
                types={typesDocs}
                onDeposer={async (fichiers, typeDocumentId) => {
                  await televerser.mutateAsync({
                    fichiers,
                    entite_type: 'contrat',
                    entite_id: contrat.id,
                    type_document_id: typeDocumentId,
                    type_document_libelle: typesDocs.find((x) => x.id === typeDocumentId)?.libelle ?? '',
                  })
                }}
              />
              {documentsDuContrat.length === 0 ? (
                <p className="text-sm text-km-faint">Aucun fichier pour ce contrat.</p>
              ) : (
                <div className="overflow-hidden rounded-xl border border-km-line bg-white">
                  {documentsDuContrat.map((d) => (
                    <div
                      key={d.id}
                      onClick={() => navigate(`/documents/${d.id}`)}
                      className="flex cursor-pointer items-center gap-3 border-b border-navy-50 px-4 py-3 last:border-b-0 hover:bg-km-bg/60"
                    >
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-km-soft text-km-muted">
                        <FileText className="h-4 w-4" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-bold text-km-text">{d.nom}</p>
                        <p className="truncate text-km-xs text-km-faint">{d.auteur} · {new Date(d.date_creation).toLocaleDateString('fr-FR')}</p>
                      </div>
                      <Badge tone="neutral">{d.type_document}</Badge>
                      {d.url && (
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={(e) => { e.stopPropagation(); setApercu({ url: d.url, nom: d.nom, nomFichier: d.nom_fichier || d.nom }) }}
                        >
                          <Eye className="h-3.5 w-3.5" />
                          Aperçu
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {addTarifFor && (
        <AddTarifDialog
          open
          onClose={() => setAddTarifFor(null)}
          contratCompteurId={addTarifFor}
          typeEnergie={contrat.type_energie}
        />
      )}

      <Dialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title="Supprimer ce contrat ?"
        description="Cette action est irréversible. Les compteurs rattachés ne seront pas supprimés mais perdront leur lien à ce contrat."
      >
        {suppression.erreur && (
          <p className="rounded-lg border border-red-200 bg-km-red-soft px-3 py-2 text-xs text-red-700">{suppression.erreur}</p>
        )}
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="ghost" onClick={() => { suppression.reinitialiser(); setConfirmDelete(false) }}>Annuler</Button>
          <Button type="button" variant="outline" className="border-red-200 text-km-red hover:bg-km-red-soft" disabled={suppression.enCours} onClick={handleDelete}>
                {suppression.enCours ? 'Suppression…' : 'Supprimer définitivement'}
              </Button>
        </div>
      </Dialog>

      <DialogSignatureContrat
        ouvert={signatureOuverte}
        onFermer={() => setSignatureOuverte(false)}
        contrat={contrat}
        documents={documentsDuContrat}
        contacts={contactsDuCompte}
        signaler={showToast}
      />

      {/* Aperçu du fichier sans quitter la fiche : monté seulement à l'ouverture, sinon il
          téléchargerait le document à chaque affichage de la page. */}
      {apercu && (
        <Dialog
          open
          onClose={() => setApercu(null)}
          title={apercu.nom}
          description={apercu.nomFichier}
          className="max-w-4xl"
        >
          <ApercuDocument url={apercu.url} nomFichier={apercu.nomFichier} />
        </Dialog>
      )}

      {toast && (
        <div className="fixed bottom-[70px] left-1/2 z-50 -translate-x-1/2 whitespace-nowrap rounded-lg bg-ink-800 px-4 py-2.5 text-xs font-semibold text-white shadow-lg lg:bottom-6">
          {toast}
        </div>
      )}
    </div>
  )
}

/**
 * Envoyer le contrat à la signature, et suivre où il en est.
 *
 * DEUX RÈGLES QUI NE SE NÉGOCIENT PAS.
 *
 * On envoie le PDF DU FOURNISSEUR, celui déposé sur la fiche : Kimatch ne fabrique pas de contrat.
 * S'il n'y a aucun fichier, il n'y a rien à faire signer, et on le dit plutôt que d'offrir un bouton
 * qui échouerait.
 *
 * Et l'enveloppe part en BROUILLON. Naoëlle, 21/08/2026 : « il faut envoyer au signataire, mais bien
 * sûr ouvrir DocuSign pour vérifier avant et bien placer toutes les ancres. » Un contrat de
 * fournisseur ne porte pas nos ancres de signature — sans passage par l'éditeur, le signataire
 * recevrait un document où rien n'indique où signer. C'est donc l'expéditeur qui place les champs,
 * puis qui clique « Envoyer » lui-même : rien ne part automatiquement.
 */
/**
 * Teinte de la plaque d'extension, par famille de fichier — même code couleur que l'onglet Fichiers
 * du compte, pour qu'un PDF ait la même tête partout dans l'application.
 */
const PLAQUES_FICHIER: Record<string, { couleur: string; fond: string }> = {
  pdf: { couleur: '#c2452d', fond: '#fbeae5' },
  jpg: { couleur: '#7c5bb0', fond: '#f1ecf8' },
  jpeg: { couleur: '#7c5bb0', fond: '#f1ecf8' },
  png: { couleur: '#7c5bb0', fond: '#f1ecf8' },
  eml: { couleur: '#3b5f8a', fond: '#e9eff6' },
  msg: { couleur: '#3b5f8a', fond: '#e9eff6' },
  xlsx: { couleur: '#0d7a5f', fond: '#eaf4f0' },
  csv: { couleur: '#0d7a5f', fond: '#eaf4f0' },
  docx: { couleur: '#4f5aa8', fond: '#eef0fa' },
}

function extensionFichier(nom: string): string {
  const point = nom.lastIndexOf('.')
  return point > 0 ? nom.slice(point + 1).toLowerCase() : 'fic'
}

/**
 * L'état de la signature, en trois mots et une infobulle.
 *
 * Le bloc de bas de page est parti (Naoëlle, 21/08/2026 : « enlève le bloc en bas de page »). Ce qu'il
 * portait d'utile — où en est la signature, et depuis quand — tient dans une pastille près du statut
 * du contrat : c'est là qu'on regarde en arrivant sur la fiche.
 */
function etatSignature(contrat: Contrat): { libelle: string; detail: string } {
  const jour = (d: string | null | undefined) => (d ? new Date(d).toLocaleDateString('fr-FR') : null)
  const envoye = jour(contrat.date_envoi_signature)
  const signe = jour(contrat.date_signature)
  switch (contrat.statut_signature) {
    case 'BROUILLON':
      /* ══ CETTE PHRASE AFFIRMAIT PLUS QU'ELLE NE SAVAIT ══════════════════════════════════════

         Elle disait « l'enveloppe n'a pas encore été envoyée ». C'est ce que Michel a lu le
         31/08/2026 sur le contrat gaz de SDC 77 Joffre — alors que Marie l'avait signé.

         Kimatch ne sait rien de tel. Il sait seulement qu'il n'a rien appris depuis qu'il a créé
         l'enveloppe : l'envoi se fait DANS DocuSign, par la personne qui place les ancres, et la
         seule chose qui nous en informe est une notification Connect qui peut ne jamais arriver —
         elle a déjà lâché deux fois.

         Une phrase qui affirme à la place de DocuSign ne ressemble pas à une panne : elle
         ressemble à un contrat pas encore envoyé, donc personne ne va chercher. Elle dit
         maintenant ce qu'elle sait, et où trouver la réponse. */
      return {
        libelle: 'Signature préparée',
        detail:
          "L'enveloppe est prête dans DocuSign. Nous n'avons reçu aucune nouvelle depuis : elle " +
          "attend peut-être d'être envoyée, ou elle a bougé sans que la notification nous parvienne. " +
          "« Vérifier auprès de DocuSign » tranche.",
      }
    case 'ENVOYE':
      return { libelle: 'Envoyé à signer', detail: envoye ? `Envoyé le ${envoye}.` : 'Envoyé à la signature.' }
    case 'SIGNE':
      return { libelle: 'Signé', detail: signe ? `Signé le ${signe}.` : 'Signé.' }
    case 'REFUSE':
      return { libelle: 'Signature refusée', detail: 'Le signataire a refusé de signer.' }
    case 'ANNULE':
      return { libelle: 'Signature annulée', detail: "L'enveloppe a été annulée dans DocuSign." }
    default:
      return { libelle: contrat.statut_signature ?? '—', detail: '' }
  }
}

/**
 * Envoyer le contrat à la signature.
 *
 * DEUX RÈGLES QUI NE SE NÉGOCIENT PAS.
 *
 * On envoie le PDF DU FOURNISSEUR, celui déposé sur la fiche : Kimatch ne fabrique pas de contrat.
 * S'il n'y a aucun fichier, il n'y a rien à faire signer, et on le dit plutôt que d'offrir un bouton
 * qui échouerait.
 *
 * Et l'enveloppe part en BROUILLON. Naoëlle, 21/08/2026 : « il faut envoyer au signataire, mais bien
 * sûr ouvrir DocuSign pour vérifier avant et bien placer toutes les ancres. » Un contrat de
 * fournisseur ne porte pas nos ancres de signature — sans passage par l'éditeur, le signataire
 * recevrait un document où rien n'indique où signer. C'est donc l'expéditeur qui place les champs,
 * puis qui clique « Envoyer » lui-même : rien ne part automatiquement.
 */
function DialogSignatureContrat({
  ouvert,
  onFermer,
  contrat,
  documents,
  contacts,
  signaler,
}: {
  ouvert: boolean
  onFermer: () => void
  contrat: Contrat
  documents: DocumentItem[]
  contacts: Contact[]
  signaler: (message: string) => void
}) {
  const [documentId, setDocumentId] = useState('')
  const [contactId, setContactId] = useState('')
  const [envoiEnCours, setEnvoiEnCours] = useState(false)
  const [besoinConnexion, setBesoinConnexion] = useState(false)

  // Choix par défaut : le signataire déjà désigné sur le contrat, et l'unique document s'il n'y en a
  // qu'un. Deux clics de moins dans le cas courant.
  const contactRetenu = contacts.find((c) => c.id === (contactId || contrat.contact_signataire_id)) ?? null
  const documentRetenu = documents.find((d) => d.id === documentId) ?? (documents.length === 1 ? documents[0] : null)

  async function envoyer() {
    if (!documentRetenu || !contactRetenu?.email) return
    setEnvoiEnCours(true)
    setBesoinConnexion(false)
    try {
      const resultat = await sendContratForSignature({
        contratId: contrat.id,
        documentUrl: documentRetenu.url,
        documentName: documentRetenu.nom_fichier || documentRetenu.nom || 'Contrat.pdf',
        signerEmail: contactRetenu.email,
        signerName: `${contactRetenu.prenom} ${contactRetenu.nom}`,
        emailSubject: `KiWee Énergie — Contrat à signer (${contrat.compte_nom || contrat.site_nom || ''})`.trim(),
        returnUrl: `${window.location.origin}/contrats/${contrat.id}`,
      })
      if (resultat.senderViewUrl) {
        // On quitte Kimatch pour l'éditeur DocuSign : c'est là que les champs se posent et que
        // l'envoi se déclenche.
        window.location.href = resultat.senderViewUrl
        return
      }
      signaler('Enveloppe créée en brouillon dans DocuSign.')
      onFermer()
    } catch (e) {
      if (e instanceof DocusignNonConnecte) setBesoinConnexion(true)
      signaler(e instanceof Error ? e.message : 'Erreur DocuSign inconnue')
    } finally {
      setEnvoiEnCours(false)
    }
  }

  return (
    <Dialog
      open={ouvert}
      onClose={onFermer}
      title="Envoyer via DocuSign"
      description="Le document part en brouillon : vous placez les zones de signature dans DocuSign, puis vous envoyez."
    >
      {documents.length === 0 ? (
        <p className="text-xs text-km-muted">
          Aucun fichier sur ce contrat. Déposez d'abord le PDF du fournisseur dans l'onglet Fichiers :
          c'est ce document-là qui part à la signature.
        </p>
      ) : contacts.length === 0 ? (
        <p className="text-xs text-km-muted">
          Aucun contact du compte n'a d'adresse email. DocuSign envoie par email : renseignez-en une
          sur le contact qui doit signer.
        </p>
      ) : (
        <div className="space-y-3">
          {/* LE FICHIER SE CHOISIT D'UN CLIC, pas dans un déroulant. Naoëlle, 21/08/2026 : « fais en
              sorte que le bouton ouvre un bloc où tu choisis avec un clic le fichier que tu veux
              envoyer, ça montre les fichiers qui se trouvent dans l'onglet Fichiers de l'objet
              contrat. »

              Ce sont donc exactement les mêmes lignes que l'onglet Fichiers — même vignette, même
              nom, même catégorie — pour qu'on reconnaisse le document sans avoir à le relire. Un
              déroulant n'aurait montré que des noms de fichiers, souvent illisibles quand ils
              sortent d'un téléchargement. */}
          <div>
            <p className="mb-1 text-km-xs font-bold uppercase tracking-wide text-km-faint">
              Document à faire signer
            </p>
            {/* DES VIGNETTES, PAS UNE LISTE. Naoëlle, 21/08/2026 : « je veux que ce soit un genre de
                bloc avec des icônes modernes de fichier à cliquer dessus pour sélectionner. » Une
                vignette par fichier, en grille : la plaque d'extension porte la couleur de sa famille
                — le même code que l'onglet Fichiers du compte — et se coche quand on la choisit.

                LE NOM AFFICHÉ EST CELUI DU DOCUMENT, pas celui du fichier. C'est ce qui manquait :
                l'onglet Fichiers montre « Contrat envoyé » et « 500074230 — SDC AMPLITUDE 2 … »,
                là où le déroulant affichait « Contrat_envoye_1_contrat.pdf » et
                « 571f3e56-93f8-…pdf ». Mêmes documents, noms différents — de quoi croire qu'il
                s'agissait d'autres fichiers. */}
            <div className="grid max-h-[260px] grid-cols-1 gap-2 overflow-y-auto pr-1 sm:grid-cols-2">
              {documents.map((d) => {
                const choisi = documentRetenu?.id === d.id
                const ext = extensionFichier(d.nom_fichier || d.nom)
                const plaque = PLAQUES_FICHIER[ext] ?? { couleur: '#5c5f66', fond: '#f2f1ee' }
                return (
                  <button
                    key={d.id}
                    type="button"
                    onClick={() => setDocumentId(d.id)}
                    title={d.nom_fichier || d.nom}
                    className={cn(
                      'relative flex flex-col items-start gap-2 rounded-xl border-2 p-3 text-left transition-all',
                      choisi
                        ? 'border-km-green bg-kiwi-50'
                        : 'border-km-line bg-white hover:-translate-y-0.5 hover:border-kiwi-300 hover:shadow-md',
                    )}
                  >
                    {choisi && (
                      <span className="absolute right-2 top-2 flex h-5 w-5 items-center justify-center rounded-full bg-km-green text-white">
                        <Check className="h-3 w-3" />
                      </span>
                    )}
                    <span
                      className="flex h-11 w-11 items-center justify-center rounded-xl text-km-xs font-extrabold uppercase"
                      style={{ background: plaque.fond, color: plaque.couleur }}
                    >
                      {ext}
                    </span>
                    <span className="min-w-0 self-stretch">
                      <span className="block truncate text-sm font-bold text-km-text">{d.nom}</span>
                      <span className="block truncate text-km-xs text-km-faint">
                        {[d.type_document, new Date(d.date_creation).toLocaleDateString('fr-FR')]
                          .filter(Boolean)
                          .join(' · ')}
                      </span>
                    </span>
                  </button>
                )
              })}
            </div>
          </div>
          <FormField label="Signataire">
            <Select value={contactRetenu?.id ?? ''} onChange={(e) => setContactId(e.target.value)}>
              <option value="">Choisir…</option>
              {contacts.map((c) => (
                <option key={c.id} value={c.id}>{c.prenom} {c.nom} — {c.email}</option>
              ))}
            </Select>
          </FormField>
          <p className="text-km-xs leading-snug text-km-faint">
            Un contrat vient du fournisseur : il ne porte pas nos repères de signature. C'est pourquoi
            DocuSign s'ouvre — vous y placez les zones sur le document, puis vous cliquez « Envoyer ».
            Rien ne part automatiquement.
          </p>
          {besoinConnexion && (
            <Button type="button" size="sm" onClick={() => { connectDocusign().catch(() => {}) }}>
              Connecter mon compte DocuSign
            </Button>
          )}
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="ghost" onClick={onFermer}>Annuler</Button>
            <Button
              type="button"
              onClick={envoyer}
              disabled={envoiEnCours || !documentRetenu || !contactRetenu?.email}
            >
              {envoiEnCours ? 'Préparation…' : 'Ouvrir DocuSign'}
            </Button>
          </div>
        </div>
      )}
    </Dialog>
  )
}

/**
 * Ce qui est parti à la signature : à qui, quand, et où en est-ce.
 *
 * Le bloc ne s'affiche que s'il y a quelque chose à dire — une enveloppe existe. Sinon il n'apporte
 * rien et le bouton de l'en-tête suffit.
 *
 * DEUX SOURCES, ET C'EST VOULU. Ce qui est affiché d'emblée vient de la base, donc du webhook :
 * gratuit et immédiat. « Vérifier auprès de DocuSign » interroge DocuSign en direct et remet la base
 * d'accord avec lui. La deuxième existe parce que la première peut mentir sans le savoir.
 */
function BlocEnvoiSignature({ contrat, signaler }: { contrat: Contrat; signaler: (m: string) => void }) {
  const navigate = useNavigate()
  const [etat, setEtat] = useState<EtatEnveloppe | null>(null)
  const [enCours, setEnCours] = useState(false)
  /* ══ POURQUOI MICHEL ÉTAIT LE SEUL À VOIR « ENVOYÉ » ═══════════════════════════════════════════

     Naoëlle, 03/09/2026 : « pourquoi sur ce contrat Michel est le seul à ne pas voir le statut
     signé, pour lui c'est encore envoyé » — puis « pourtant Matthieu et moi on voit bien signé ».

     LA CAUSE ÉTAIT DANS L'API, et elle est corrigée là-bas : `etat-enveloppe` prenait la session
     DocuSign DE L'APPELANT. Sept personnes en ont une, Michel n'en a pas — il recevait donc
     NON_CONNECTE et restait sur le statut stocké pendant que les autres lisaient l'état réel.

     « Une personne qui utilise Kimatch devrait voir les statuts à jour même si elle n'utilise pas
     DocuSign » : l'endpoint se rabat désormais sur une autre session de l'équipe, toutes pointant
     le même compte « KIWEE ENERGIE ». Michel voit maintenant la même chose que tout le monde.

     CE BANDEAU RESTE POUR L'AUTRE MOITIÉ DU PROBLÈME : le silence. Le `catch` était muet
     « volontairement », pour ne pas jeter une erreur au visage de quelqu'un qui vient lire une
     fiche. L'intention était bonne, le résultat non : un statut périmé qui a l'air normal se croit,
     et deux collègues finissent par se contredire au téléphone. Il ne se déclenche plus que si
     PERSONNE dans l'équipe n'a de session utilisable, ou si DocuSign ne répond pas. */
  const [verification, setVerification] = useState<'non_connecte' | 'echec' | null>(null)

  /* ══ ON DEMANDE À DOCUSIGN DÈS L'OUVERTURE DE LA FICHE ═══════════════════════════════════════

     Naoëlle, 31/08/2026 : « il faut que quand la personne signe le contrat ou le mandat, ça passe
     direct au statut signé, il faut pas attendre quelques heures ». Elle a raison, et l'attente
     n'était pas le bon compromis.

     Le chemin immédiat est la notification DocuSign, et il est désormais fiable : chaque enveloppe
     porte sa propre demande de notification (voir `demandeDeNotification` dans _client.ts), au lieu
     de dépendre d'un réglage de compte que personne ne peut vérifier.

     Ce contrôle-ci couvre l'autre moitié du problème : les enveloppes DÉJÀ parties, créées avant ce
     changement, et le cas où la notification se perd malgré tout. Ouvrir la fiche est exactement le
     moment où quelqu'un a besoin de la vérité — c'est même la seule raison d'ouvrir la fiche d'un
     contrat en attente de signature.

     IL NE PART QUE SI L'ÉTAT PEUT ENCORE CHANGER. Un contrat signé, refusé ou annulé ne bougera
     plus : le redemander serait un appel DocuSign par consultation de fiche, pour rien. Et il ne
     dit rien à l'écran quand il ne trouve aucun écart — une notification « rien n'a changé » à
     chaque ouverture serait du bruit. Il ne parle que lorsqu'il corrige quelque chose. */
  const envelopeId = contrat.docusign_envelope_id
  const etatFige = ['SIGNE', 'REFUSE', 'ANNULE'].includes(contrat.statut_signature ?? '')
  useEffect(() => {
    if (!envelopeId || etatFige) return
    let vivant = true
    void etatEnveloppeContrat(contrat.id)
      .then((r) => {
        if (!vivant) return
        setEtat(r)
        if (r.corrige) signaler('Statut corrigé d’après DocuSign — la notification n’était pas arrivée.')
      })
      .catch((err) => {
        /* Toujours pas d'erreur jetée au visage de quelqu'un qui vient lire une fiche — mais on
           note que l'état affiché vient de la base et n'a pas été confronté à DocuSign. Le compte
           non connecté se distingue du reste : c'est le seul cas que la personne peut réparer
           elle-même, en une minute, depuis son profil. */
        if (!vivant) return
        setVerification(err instanceof DocusignNonConnecte ? 'non_connecte' : 'echec')
      })
    return () => {
      vivant = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contrat.id, envelopeId, etatFige])

  if (!contrat.docusign_envelope_id) return null

  const e = etatSignature(contrat)
  const envoyeLe = etat?.envoyeLe ?? contrat.date_envoi_signature
  const signeLe = etat?.signeLe ?? contrat.date_signature

  async function verifier() {
    setEnCours(true)
    try {
      const r = await etatEnveloppeContrat(contrat.id)
      setEtat(r)
      signaler(
        r.corrige
          ? 'Statut corrigé d’après DocuSign — la notification n’était pas arrivée.'
          : 'DocuSign confirme : rien n’a changé depuis.',
      )
    } catch (err) {
      if (err instanceof DocusignNonConnecte) {
        signaler('Connectez votre compte DocuSign pour vérifier.')
      } else {
        signaler(err instanceof Error ? err.message : 'Vérification impossible')
      }
    } finally {
      setEnCours(false)
    }
  }

  return (
    <div className="rounded-xl border border-km-line bg-white p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-km-xs font-bold uppercase tracking-wide text-km-faint">Envoi à la signature</p>
        <Badge tone={contrat.statut_signature === 'SIGNE' ? 'kiwi' : 'amber'}>{e.libelle}</Badge>
      </div>

      {/* La mention ne s'affiche QUE si la confrontation a échoué : quand elle réussit, le statut
          est à jour et l'écrire serait du bruit à chaque ouverture de fiche. */}
      {verification && !etat && (
        <p className="mb-2.5 rounded-km border border-km-amber-line bg-km-amber-soft px-2.5 py-1.5 text-km-label text-amber-800">
          {verification === 'non_connecte' ? (
            <>
              Ce statut vient de la dernière notification reçue : aucun compte DocuSign de l’équipe
              n’est utilisable en ce moment, il n’a donc pas pu être vérifié.{' '}
              <button
                type="button"
                onClick={() => navigate('/profil')}
                className="font-bold underline decoration-dotted"
              >
                Reconnecter DocuSign
              </button>
            </>
          ) : (
            <>
              Ce statut vient de la dernière notification reçue : DocuSign n’a pas répondu à
              l’ouverture de la fiche. « Vérifier auprès de DocuSign » ci-dessous dira pourquoi.
            </>
          )}
        </p>
      )}

      {/* ── LA FRISE DE L'ENVOI ──
          Naoëlle, 21/08/2026 : « il faudrait créer une frise de l'état de l'envoi ». Même montage
          que le « chemin de conversion » du mandat — cercles, libellés, barres de liaison — pour
          qu'une signature se lise de la même façon sur les deux objets.

          QUATRE ÉTAPES ET NON TROIS : « Ouvert » s'ajoute entre l'envoi et la signature. C'est
          l'information qui manque le plus quand on attend : le client a-t-il au moins ouvert le
          document ? DocuSign la connaît, elle arrive avec « Vérifier auprès de DocuSign ».

          Un refus ou une annulation ne sont pas une étape de plus : ils arrêtent la frise là où elle
          en était et la passent au rouge — ce n'est pas un avancement. */}
      <FriseEnvoi contrat={contrat} etat={etat} />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <p className="mb-0.5 text-km-xs uppercase tracking-wide text-km-faint">Envoyé le</p>
          <p className="text-xs font-semibold text-km-text">
            {envoyeLe ? new Date(envoyeLe).toLocaleString('fr-FR') : 'pas encore envoyé'}
          </p>
        </div>
        <div>
          <p className="mb-0.5 text-km-xs uppercase tracking-wide text-km-faint">Destinataire</p>
          <p className="truncate text-xs font-semibold text-km-text">
            {etat?.signataire?.nom
              ? `${etat.signataire.nom}${etat.signataire.email ? ` — ${etat.signataire.email}` : ''}`
              : contrat.contact_signataire_nom || '—'}
          </p>
        </div>
        {signeLe && (
          <div>
            <p className="mb-0.5 text-km-xs uppercase tracking-wide text-km-faint">Signé le</p>
            <p className="text-xs font-semibold text-km-text">{new Date(signeLe).toLocaleString('fr-FR')}</p>
          </div>
        )}
        {etat?.signataire?.recuLe && (
          <div>
            <p className="mb-0.5 text-km-xs uppercase tracking-wide text-km-faint">Ouvert par le signataire</p>
            <p className="text-xs font-semibold text-km-text">
              {new Date(etat.signataire.recuLe).toLocaleString('fr-FR')}
            </p>
          </div>
        )}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button type="button" size="sm" variant="outline" onClick={verifier} disabled={enCours}>
          {enCours ? 'Vérification…' : 'Vérifier auprès de DocuSign'}
        </Button>
        {/* LE LIEN EST LÀ D'EMBLÉE, sans attendre la vérification : c'est quand on doute qu'on le
            cherche, et douter n'est pas un clic de plus à mériter. */}
        <a
          href={etat?.lien ?? lienEnveloppeDocusign(contrat.docusign_envelope_id)}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 text-xs font-semibold text-km-green underline decoration-dotted hover:text-km-green"
        >
          Voir l’enveloppe dans DocuSign
          <ExternalLink className="h-3 w-3" />
        </a>
        <span className="font-mono text-km-xs text-km-faint">{contrat.docusign_envelope_id}</span>
      </div>
    </div>
  )
}

/**
 * L'avancement de l'envoi, en quatre temps.
 *
 * L'étape atteinte se déduit d'abord de ce que DocuSign vient de dire, à défaut de ce que la base
 * porte. « Ouvert » ne peut venir que de DocuSign : la base ne sait pas si le client a ouvert le
 * document, et c'est pourtant ce qu'on veut savoir en attendant une signature.
 */
function FriseEnvoi({ contrat, etat }: { contrat: Contrat; etat: EtatEnveloppe | null }) {
  const statut = etat?.statut ?? contrat.statut_signature
  const arrete = statut === 'REFUSE' || statut === 'ANNULE'
  const ouvert = Boolean(etat?.signataire?.recuLe)

  const atteinte =
    statut === 'SIGNE' ? 3 : ouvert ? 2 : statut === 'ENVOYE' ? 1 : 0

  const etapes = [
    { libelle: 'Préparé', icone: PenTool },
    { libelle: 'Envoyé', icone: Send },
    { libelle: 'Ouvert', icone: MailOpen },
    { libelle: 'Signé', icone: FileSignature },
  ]

  return (
    <div>
      <div className="flex items-center">
        {etapes.map((s, i) => {
          const faite = i <= atteinte
          return (
            <div key={s.libelle} className="flex flex-1 items-center last:flex-none">
              <div className="flex flex-col items-center gap-1.5">
                <span
                  className={cn(
                    'flex h-8 w-8 shrink-0 items-center justify-center rounded-full',
                    !faite
                      ? 'bg-km-soft text-km-faint'
                      : arrete
                        ? 'bg-gradient-to-br from-red-600 to-red-500 text-white shadow-sm'
                        : 'bg-gradient-to-br from-kiwi-600 to-kiwi-500 text-white shadow-sm',
                  )}
                >
                  <s.icone className="h-3.5 w-3.5" />
                </span>
                <span
                  className={cn(
                    'whitespace-nowrap text-km-label font-bold',
                    faite ? (arrete ? 'text-red-700' : 'text-km-text') : 'text-km-faint',
                  )}
                >
                  {s.libelle}
                </span>
              </div>
              {i < etapes.length - 1 && (
                <div
                  /* LE SEGMENT EN COURS EST HACHURÉ ET DÉFILE, comme sur la frise de l'opportunité.
                     Signalé par Naoëlle le 27/08 : « il faut que tous les statuts des objets aient
                     cette animation ». Cette frise n'avait que du plein ou du gris — elle disait où
                     l'on en était sans montrer que quelque chose était en train de se passer.

                     Rien ne défile quand l'envoi est ARRÊTÉ : un refus ou une annulation ne sont pas
                     une étape en cours, et une hachure qui avancerait derrière eux annoncerait une
                     progression qui n'aura pas lieu. */
                  style={
                    !arrete && i === atteinte
                      ? {
                          backgroundImage:
                            'repeating-linear-gradient(90deg,#c3ddd4 0px,#c3ddd4 7px,#eef5f2 7px,#eef5f2 14px)',
                          backgroundSize: '36px 100%',
                        }
                      : undefined
                  }
                  className={cn(
                    'mx-1 h-1 flex-1 rounded',
                    i < atteinte
                      ? arrete
                        ? 'bg-gradient-to-r from-red-600 to-red-500'
                        : 'bg-gradient-to-r from-kiwi-600 to-kiwi-500'
                      : !arrete && i === atteinte
                        ? 'animate-km-stripe motion-reduce:animate-none'
                        : 'bg-km-soft',
                  )}
                />
              )}
            </div>
          )
        })}
      </div>

      {arrete && (
        <p className="mt-2 text-km-label font-semibold text-red-700">
          {statut === 'REFUSE'
            ? 'Le signataire a refusé de signer : la frise s’arrête là.'
            : 'L’enveloppe a été annulée dans DocuSign : la frise s’arrête là.'}
        </p>
      )}
      {!arrete && !etat && (
        <p className="mt-2 text-km-xs leading-snug text-km-faint">
          « Ouvert » ne peut venir que de DocuSign : cliquez sur « Vérifier auprès de DocuSign » pour
          savoir si le signataire a ouvert le document.
        </p>
      )}
    </div>
  )
}
