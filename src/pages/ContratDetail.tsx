import { useEffect, useMemo, useState } from 'react'
import { ApercuDocument } from '@/components/document/ApercuDocument'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { ArrowLeft, Zap, Flame, Lightbulb, Trash2, Building2, MapPin, Gauge, FileText, Plus, Euro, X, Eye, PenLine, Check, LifeBuoy} from 'lucide-react'
import { Topbar } from '@/components/layout/Topbar'
import { Button } from '@/components/ui/button'
import { ZoneDepotFichiers } from '@/components/ui/zone-depot-fichiers'
import { Badge } from '@/components/ui/badge'
import { CheminSignature } from '@/components/contrat/CheminSignature'
import { CycleDeVie } from '@/components/contrat/CycleDeVie'
import { EntityLink } from '@/components/ui/entity-link'
import { useSuiviDuContrat, SANTE_LIBELLE } from '@/lib/data/suivisContrats'
import { Dialog } from '@/components/ui/dialog'
import { DialogSuppression } from '@/components/ui/dialog-suppression'
import { FormField, Input, Select } from '@/components/ui/form'
import { HistoriqueDiscret } from '@/components/ui/historique-discret'
import { InlineField } from '@/components/ui/inline-field'
import { useContrat, useUpdateContratPartiel, useDeleteContrat, type PatchContrat } from '@/lib/data/contrats'
import { useSites } from '@/lib/data/sites'
import { useComptes } from '@/lib/data/comptes'
import { useContacts } from '@/lib/data/contacts'
import { contactsDuCompte as contactsRattaches, libelleContactPourCompte, peutRecevoirUneSignature } from '@/lib/contactsDuCompte'
import { useDocuments, useTeleverserDocuments } from '@/lib/data/documents'
import { sendContratForSignature, connectDocusign, DocusignNonConnecte } from '@/lib/data/docusign'
import { BlocSuiviDocusign } from '@/components/docusign/BlocSuiviDocusign'
import { useReferenceTable } from '@/lib/data/referenceTables'
import { useFormulesTarifaires, useTarifsByContratCompteurs, useCreateTarif, useDeleteTarif } from '@/lib/data/tarifs'
import { useCanManage, useIsAdmin, useMonProfil, useProfilsAdmin } from '@/lib/data/roles'
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

/* ══ `CycleDeVieCard` EST PARTI DANS `@/components/contrat/CycleDeVie` ══
   Il calculait lui-même « à venir / en cours / expiré » avec `Date.now()` et des millisecondes —
   une TROISIÈME écriture de la même règle, après `src/lib/statutVieContrat.ts` (épinglé par ses
   tests) et la vue SQL `v_contrats_liste`. Trois écritures d'une règle finissent par diverger, et
   celle-ci divergeait déjà : elle ignorait la résiliation, qui n'existait pas encore.

   Le composant reprend le dessin de la maquette montrée par William le 09/09/2026 — les trois
   pastilles À venir / En cours / Expiré, la barre, le repère du jour, les jours restants — et il
   délègue le calcul à `statutVieContrat`. */

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
/* `JALONS_CONTRAT` A DISPARU AVEC LA FRISE QU'IL DÉCRIVAIT. C'était l'ordre des neuf statuts
   mélangés — « En préparation, À signer, Signé, À venir, Actif, Terminé » — dont William disait le
   09/09/2026 : « ça n'a rien à voir, et c'est ça le problème, je ne sais pas d'où ça vient ce
   chemin-là ». Les deux vrais chemins vivent maintenant dans `CheminSignature` et `CycleDeVie`. */

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
  /* LE RÉFÉRENTIEL DU CYCLE DE SIGNATURE — celui que les deux boutons manuels de la frise
     écrivent. Pas de repli codé en dur : contrairement aux statuts mélangés, ces cinq lignes
     existent en base depuis l'origine et la sixième (« Consulté ») depuis la migration
     20260910180000. Sans elles, les boutons ne s'affichent simplement pas. */
  const { data: avancementsRef } = useReferenceTable('statuts_contrats_avancement')
  const avancements = avancementsRef ?? []
  /* `courantContrat` ET `finaliteContrat` SONT PARTIS AVEC LA FRISE DES NEUF STATUTS.
     Ils traduisaient le mélange en un jalon courant et une issue — « Résilié » en perte,
     « Annulé » en neutre. William, 09/09/2026 : « annuler, ça n'a pas de sens ; à partir du moment
     où il a été validé, il ne peut plus être annulé ». Et la résiliation est devenue une DATE sur
     le contrat, lue par `CycleDeVie`, plutôt qu'une issue de frise. */

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
  // Qui valide : son identifiant est écrit sur le contrat, et son nom s'affiche sur la ligne close.
  const { data: monProfil } = useMonProfil()
  const { data: tousContacts } = useContacts()

  /* ══ TOUS LES CONTACTS DU COMPTE, PAS SEULEMENT CEUX DONT C'EST LE COMPTE PRINCIPAL ══

     William, 07/09/2026, sur ce contrat précis : « on ne peut sélectionner que Christian, pas Arnaud
     qui est lui lié via MEMPHIS LENS 2. Guillaume voulait envoyer à Arnaud à la base mais il pouvait
     pas le sélectionner. » Le filtre lisait `contacts.compte_id`, qui ne porte que le rattachement
     PRINCIPAL ; les rattachements multiples vivent dans `contacts_comptes` depuis le 13/08/2026.

     Mesuré : 233 contrats gagnent des signataires, dont 68 qui n'en avaient aucun. */
  const contactsDuCompte = useMemo(
    () => contactsRattaches(tousContacts, contrat?.compte_id),
    [tousContacts, contrat?.compte_id],
  )

  /* CEUX QUI PEUVENT VRAIMENT RECEVOIR : DocuSign envoie par email. Les autres ne disparaissent plus
     de la liste, ils s'y affichent désactivés — sur CT-01606, le seul contact proposé n'avait pas
     d'email et la modale se contentait d'être vide, sans dire lequel ni pourquoi. */
  const contactsSignataires = useMemo(
    () => contactsDuCompte.filter(peutRecevoirUneSignature),
    [contactsDuCompte],
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
      <Topbar crumb="Contrats" title={contrat.reference ?? contrat.fournisseur_nom} />

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
          {/* ══ LE NUMÉRO EN GROS, LE FOURNISSEUR EN DESSOUS ══
              Naoëlle, 08/09/2026 : « dans contrat, j'aimerais que ce qui se voit en gros ce soit le
              numéro du contrat, pas le fournisseur, mets le fournisseur en dessous. »
              Elle a raison, et c'est la suite logique du 03/09 — « il faut donner un numéro généré à
              nos contrats pour les retrouver facilement ». Un numéro qu'on se donne pour se repérer
              n'a pas sa place en petit sous le nom du fournisseur : c'est lui qu'on cherche dans une
              liste et qu'on lit à voix haute au téléphone. Le fournisseur, lui, ne distingue pas
              deux contrats — il y en a des dizaines chez le même. */}
          <p className="truncate font-mono text-xl font-bold tracking-tight text-km-text">
            {contrat.reference ?? 'Contrat sans numéro'}
          </p>
          <p className="truncate text-km-body font-semibold text-km-text">
            {contrat.fournisseur_nom}
          </p>
          <p className="truncate text-xs text-km-muted">
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
              {/* ══ DEUX CHEMINS, ET NON UNE SEULE FRISE ══════════════════════════════════════

                  William, appel du 09/09/2026, en regardant cette page : « brouillon, demandé,
                  réceptionné, envoyé — et là, en préparation, à signer, signé, à venir, actif : ça
                  n'a rien à voir. Et c'est ça le problème, je ne sais pas d'où ça vient, ce
                  chemin-là. »

                  Il vient des neuf valeurs de `statuts_contrats`, qui mélangent deux dimensions
                  sans le dire : où en est la SIGNATURE, et où en est la VIE du contrat. Un contrat
                  signé qui démarre dans six mois devait choisir entre « Signé » et « À venir »,
                  alors que les deux sont vrais. C'est ce mélange qui a produit les deux pannes du
                  jour — deux contrats signés sur DocuSign restés « Nouveau », et 19 contrats dont
                  le statut contredit ses propres dates.

                  Sa règle de séparation : « TANT QU'IL N'EST PAS SIGNÉ, TU NE PEUX PAS LUI DONNER
                  UN STATUT [de vie] — il est encore dans le cycle de signature. » D'où le second
                  chemin qui ne s'affiche qu'une fois le premier clos. */}
              <CheminSignature
                contrat={contrat}
                onCopie={showToast}
                onAvancer={
                  canManage
                    ? (code, libelle) => {
                        const etape = avancements.find((a) => a.code === code)
                        if (!etape) return
                        majContrat({ statut_avancement_id: etape.id })
                          .then(() => showToast(`✓ ${libelle}`))
                          .catch((e) =>
                            showToast(e instanceof Error ? `Erreur : ${e.message}` : 'Enregistrement impossible'),
                          )
                      }
                    : undefined
                }
                /* ── QUI VALIDE, ET CE QUE ÇA ÉCRIT ──
                   La date et l'auteur, en une écriture. `valide_par_id` n'est pas décoratif :
                   William décrit la validation comme un engagement personnel — « je vérifiais que
                   toutes les données étaient correctes, et vu que le fournisseur avait validé,
                   j'appuyais sur valider » — et la ligne repliée l'affiche (« validé par Thomas M.
                   le 21/02/2024 »). Sans le nom, elle dirait juste « validé », ce qui n'engage
                   personne.

                   Le profil peut manquer une fraction de seconde au premier rendu ; on écrit alors
                   la date seule plutôt que de refuser le geste. */
                onValider={
                  canManage
                    ? () => {
                        majContrat({
                          date_validation: new Date().toISOString(),
                          valide_par_id: monProfil?.id ?? null,
                        })
                          .then(() => showToast('✓ Contrat validé — cycle de signature clôturé'))
                          .catch((e) =>
                            showToast(e instanceof Error ? `Erreur : ${e.message}` : 'Validation impossible'),
                          )
                      }
                    : undefined
                }
                /* ── LE SUIVI DOCUSIGN REMONTE DANS LA CARTE DU CYCLE ──
                   Naoëlle, 09/09/2026, maquette à l'appui : « où est-ce que t'as mis le bouton voir
                   le détail qui plie et déplie le détail que Will avait mis dans la maquette ? »

                   Il était en bas de la fiche, après les clauses, à trois écrans de la frise qu'il
                   commente. Or c'est le même sujet : la frise dit OÙ en est la signature, le suivi
                   dit COMMENT on y est arrivé — envoyé à qui, livré quand, ouvert combien de fois,
                   quelles relances. Les séparer obligeait à faire le rapprochement de tête.

                   Et c'est ce détail-là que le bouton replie : un cycle clôturé se réduit à une
                   ligne, un cycle en cours reste ouvert. */
                detail={
                  /* ── CE QUI EST PARTI À LA SIGNATURE ──
                      Naoëlle, 21/08/2026, après avoir envoyé le contrat de SDC AMPLITUDE 2 : « j'ai
                      envoyé ce contrat mais j'ai rien qui me montre s'il a bien été envoyé. Comment je
                      suis sûre que ça a envoyé ? »

                      Elle avait la pastille de l'en-tête et rien d'autre : ni la date, ni le
                      destinataire, ni moyen de vérifier. Or une pastille qui vient d'un webhook ne
                      prouve rien — si la notification n'arrive pas, elle affiche un état périmé sans le
                      savoir. D'où ce bloc, qui montre à qui et quand, et le bouton qui va le demander à
                      DocuSign plutôt que de se croire. */
                  <BlocSuiviDocusign
                    objet="contrat"
                    id={contrat.id}
                    envelopeId={contrat.docusign_envelope_id}
                    statut={contrat.statut_signature}
                    dateEnvoi={contrat.date_envoi_signature}
                    dateSignature={contrat.date_signature}
                    signataireNom={contrat.contact_signataire_nom}
                    signaler={showToast}
                    versProfil={() => navigate('/profil')}
                  />
                }
              />
              {/* LE CYCLE DE VIE N'APPARAÎT QU'UNE FOIS LE CONTRAT SIGNÉ. Avant, il n'a pas de vie
                  à raconter — et en annoncer une ferait croire à une affaire acquise. */}
              {(contrat.date_signature || contrat.avancement === 'SIGNE') && <CycleDeVie contrat={contrat} />}
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
                      // Mais TOUS ceux du compte, y compris rattaches via un autre compte principal
                      // (demande de William, 07/09/2026) -- avec leur societe d'origine en clair,
                      // sinon on ne sait pas pourquoi cette personne est proposee.
                      options={contactsDuCompte.map((c) => ({
                        value: c.id,
                        label: libelleContactPourCompte(c, compte?.id),
                      }))}
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
                          <p className="truncate text-sm font-bold text-km-text">
                            <Link to={`/compteurs/${c.id}`} onClick={(e) => e.stopPropagation()} className="hover:underline">
                              {c.utilisation || c.numero_pdl}
                            </Link>
                          </p>
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
                        <p className="truncate text-sm font-bold text-km-text">
                          <Link to={`/documents/${d.id}`} onClick={(e) => e.stopPropagation()} className="hover:underline">
                            {d.nom}
                          </Link>
                        </p>
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

      <DialogSuppression
        ouvert={confirmDelete}
        onFermer={() => { suppression.reinitialiser(); setConfirmDelete(false) }}
        type="contrat"
        id={contrat.id}
        nom={contrat.fournisseur_nom}
        onConfirmer={handleDelete}
        enCours={suppression.enCours}
        erreur={suppression.erreur}
      />

      <DialogSignatureContrat
        ouvert={signatureOuverte}
        onFermer={() => setSignatureOuverte(false)}
        contrat={contrat}
        documents={documentsDuContrat}
        contacts={contactsSignataires}
        contactsSansEmail={contactsDuCompte.filter((c) => !peutRecevoirUneSignature(c))}
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
  contactsSansEmail,
  signaler,
}: {
  ouvert: boolean
  onFermer: () => void
  contrat: Contrat
  documents: DocumentItem[]
  /** Ceux qui peuvent recevoir : rattachés au compte ET porteurs d'une adresse email. */
  contacts: Contact[]
  /**
   * Ceux qui sont rattachés au compte mais SANS adresse email.
   *
   * Ils ne sont pas proposés — DocuSign envoie par email — mais ils s'affichent, nommés, avec la
   * raison. Sur le contrat CT-01606 le seul contact du compte était dans ce cas : la modale
   * annonçait « aucun contact du compte n'a d'adresse email » sans dire lequel, et il a fallu aller
   * chercher dans la base pour comprendre que c'était Christian SCHROTTER.
   */
  contactsSansEmail: Contact[]
  signaler: (message: string) => void
}) {
  /* ══ PLUSIEURS DOCUMENTS, ET TOUS COCHÉS PAR DÉFAUT ══
     William, 09/09/2026 : « très souvent un contrat c'est quatre PDF différents ou trois PDF
     différents. Quand tu fais Envoyer via DocuSign on te dit oui mais quel fichier tu veux envoyer,
     ALORS QU'EN RÉALITÉ JE VAIS TOUT ENVOYER. » Faute de pouvoir, Thomas fusionnait les PDF à la
     main avant d'envoyer.

     Tout est donc coché à l'ouverture : décocher l'exception coûte un clic, cocher la règle en
     coûtait quatre. `null` tant que la modale n'a pas été ouverte, pour distinguer « pas encore
     initialisé » de « l'utilisateur a tout décoché ». */
  const [choisis, setChoisis] = useState<Set<string> | null>(null)
  const [contactId, setContactId] = useState('')
  const [envoiEnCours, setEnvoiEnCours] = useState(false)
  const [besoinConnexion, setBesoinConnexion] = useState(false)

  useEffect(() => {
    if (ouvert) setChoisis(new Set(documents.map((d) => d.id)))
  }, [ouvert, documents])

  // Choix par défaut du signataire : celui déjà désigné sur le contrat. Un clic de moins.
  const contactRetenu = contacts.find((c) => c.id === (contactId || contrat.contact_signataire_id)) ?? null
  /* L'ORDRE D'ENVOI EST CELUI DE LA LISTE AFFICHÉE, pas celui des clics : DocuSign empile les
     documents dans l'ordre reçu, et c'est l'ordre des pages que le signataire verra défiler. */
  const documentsRetenus = documents.filter((d) => choisis?.has(d.id))
  const basculer = (id: string) =>
    setChoisis((s) => {
      const n = new Set(s ?? [])
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })

  async function envoyer() {
    if (documentsRetenus.length === 0 || !contactRetenu?.email) return
    setEnvoiEnCours(true)
    setBesoinConnexion(false)
    try {
      const resultat = await sendContratForSignature({
        contratId: contrat.id,
        documents: documentsRetenus.map((d) => ({
          url: d.url,
          nom: d.nom_fichier || d.nom || 'Contrat.pdf',
        })),
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
      description="Les documents cochés partent en une seule enveloppe, en brouillon : vous placez les zones de signature dans DocuSign, puis vous envoyez."
    >
      {documents.length === 0 ? (
        <p className="text-xs text-km-muted">
          Aucun fichier sur ce contrat. Déposez d'abord le PDF du fournisseur dans l'onglet Fichiers :
          c'est ce document-là qui part à la signature.
        </p>
      ) : contacts.length === 0 ? (
        <div className="rounded-km border border-km-amber-line bg-km-amber-soft px-3 py-2.5">
          <p className="text-km-body font-bold text-km-amber">Personne ne peut recevoir ce contrat</p>
          {contactsSansEmail.length === 0 ? (
            <p className="mt-1 text-km-label leading-snug text-km-text">
              Aucun contact n'est rattaché au compte de ce contrat. Rattachez la personne qui doit
              signer depuis sa fiche, ou depuis l'onglet Contacts du compte.
            </p>
          ) : (
            <>
              <p className="mt-1 text-km-label leading-snug text-km-text">
                DocuSign envoie par email. {contactsSansEmail.length > 1 ? 'Ces contacts sont' : 'Ce contact est'}{' '}
                rattaché{contactsSansEmail.length > 1 ? 's' : ''} au compte mais n'{contactsSansEmail.length > 1 ? 'ont' : 'a'} pas
                d'adresse :
              </p>
              <ul className="mt-1.5 flex flex-col gap-1">
                {contactsSansEmail.map((c) => (
                  <li key={c.id} className="text-km-body text-km-text">
                    <EntityLink to={`/contacts/${c.id}`} className="font-semibold">
                      {`${c.prenom ?? ''} ${c.nom ?? ''}`.trim()}
                    </EntityLink>
                    {c.compte_nom && c.compte_id !== contrat.compte_id && (
                      <span className="text-km-muted"> — {c.compte_nom}</span>
                    )}
                    <span className="text-km-faint"> · pas d'email</span>
                  </li>
                ))}
              </ul>
              <p className="mt-1.5 text-km-label leading-snug text-km-muted">
                Renseignez une adresse sur la fiche de celui qui doit signer, ou rattachez au compte
                une personne qui en a une.
              </p>
            </>
          )}
        </div>
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
            {/* LE TITRE COMPTE, ET IL DIT COMBIEN. Un contrat part souvent en trois ou quatre PDF ;
                afficher « 3 sur 4 » évite d'envoyer une enveloppe incomplète sans s'en apercevoir,
                et le raccourci « tout / aucun » remet d'aplomb en un clic. */}
            <div className="mb-1 flex items-baseline gap-2">
              <p className="text-km-xs font-bold uppercase tracking-wide text-km-faint">
                Documents à faire signer
              </p>
              <span className="font-mono text-km-xs text-km-muted">
                {documentsRetenus.length} sur {documents.length}
              </span>
              <span className="flex-1" />
              {documents.length > 1 && (
                <button
                  type="button"
                  onClick={() =>
                    setChoisis(
                      documentsRetenus.length === documents.length
                        ? new Set()
                        : new Set(documents.map((d) => d.id)),
                    )
                  }
                  className="text-km-xs font-semibold text-km-green hover:underline"
                >
                  {documentsRetenus.length === documents.length ? 'tout décocher' : 'tout cocher'}
                </button>
              )}
            </div>
            {documentsRetenus.length === 0 && (
              <p className="mb-1.5 text-km-label text-km-amber">
                Aucun document coché — l’enveloppe partirait vide.
              </p>
            )}
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
                const choisi = Boolean(choisis?.has(d.id))
                const ext = extensionFichier(d.nom_fichier || d.nom)
                const plaque = PLAQUES_FICHIER[ext] ?? { couleur: '#5c5f66', fond: '#f2f1ee' }
                return (
                  <button
                    key={d.id}
                    type="button"
                    onClick={() => basculer(d.id)}
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
              {/* LA SOCIÉTÉ D'ORIGINE FIGURE quand ce n'est pas celle du contrat : depuis le
                  07/09/2026 la liste couvre les contacts rattachés via un autre compte principal
                  (demande de William), et sans cette mention on ne saurait pas pourquoi cette
                  personne est proposée. */}
              {contacts.map((c) => (
                <option key={c.id} value={c.id}>
                  {`${c.prenom ?? ''} ${c.nom ?? ''}`.trim()}
                  {c.compte_nom && c.compte_id !== contrat.compte_id ? ` (${c.compte_nom})` : ''}
                  {` — ${c.email}`}
                </option>
              ))}
            </Select>
            {/* CEUX QU'ON NE PEUT PAS PROPOSER SE DISENT QUAND MÊME. Un contact absent de la liste
                sans explication envoie chercher pourquoi ailleurs — c'est exactement ce qui s'est
                passé sur CT-01606. */}
            {contactsSansEmail.length > 0 && (
              <p className="mt-1 text-km-label leading-snug text-km-faint">
                Non proposé{contactsSansEmail.length > 1 ? 's' : ''}, faute d'adresse email :{' '}
                {contactsSansEmail
                  .map((c) => `${c.prenom ?? ''} ${c.nom ?? ''}`.trim())
                  .join(', ')}
                .
              </p>
            )}
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
              disabled={envoiEnCours || documentsRetenus.length === 0 || !contactRetenu?.email}
            >
              {envoiEnCours ? 'Préparation…' : 'Ouvrir DocuSign'}
            </Button>
          </div>
        </div>
      )}
    </Dialog>
  )
}

