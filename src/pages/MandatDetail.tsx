import { Suspense, lazy, useMemo, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, FileCheck2, FileSignature, Trash2 } from 'lucide-react'
import { Topbar } from '@/components/layout/Topbar'
import { CheminConversion } from '@/components/mandat/CheminConversion'
import { CarteCompte, CarteSignataire, CarteTypeMandat, CarteValidite } from '@/components/mandat/CartesIdentite'
import { PerimetreCouvert } from '@/components/mandat/PerimetreCouvert'
import { ListeFichiers, CadreVide, fichierParDefaut } from '@/components/mandat/ListeFichiers'
/**
 * LA VISIONNEUSE SE CHARGE QUAND ON OUVRE UN PDF, PAS AVANT.
 *
 * `pdf.js` pèse 330 ko compressés. Embarqué dans le fragment de la fiche mandat, il doublait son
 * poids — 520 ko contre 190 — et se téléchargeait même pour un mandat sans le moindre fichier.
 * `lazy` le sort du chemin critique : la fiche s'ouvre à sa vitesse d'avant, et la visionneuse
 * arrive pendant qu'on choisit le document.
 */
const VisionneusePdf = lazy(() =>
  import('@/components/document/VisionneusePdf').then((m) => ({ default: m.VisionneusePdf })),
)
import { ApercuDocument } from '@/components/document/ApercuDocument'
import { BlocSuiviDocusign } from '@/components/docusign/BlocSuiviDocusign'
import { useContratsParCompte } from '@/lib/data/contrats'
import { Button } from '@/components/ui/button'
import { ZoneDepotFichiers } from '@/components/ui/zone-depot-fichiers'
import { Dialog } from '@/components/ui/dialog'
import { FormField, Input } from '@/components/ui/form'
import { EmailLink } from '@/components/ui/contact-link'
import { HistoriqueDiscret } from '@/components/ui/historique-discret'
import { useMandat, useMandatEnDirect, useMarkMandatEnvoye, useUpdateMandatPartiel, useDeleteMandat, type PatchMandat } from '@/lib/data/mandats'
import { useContacts } from '@/lib/data/contacts'
import { contactsDuCompte as contactsRattaches } from '@/lib/contactsDuCompte'
import { useComptes } from '@/lib/data/comptes'
import { useCompteurs } from '@/lib/data/compteurs'
import { useDeleteDocument, useDocuments, useTeleverserDocuments } from '@/lib/data/documents'
import { useReferenceTable, type ReferenceRow } from '@/lib/data/referenceTables'
import { useCanManage } from '@/lib/data/roles'
import { useSuppression } from '@/lib/useSuppression'
import { FALLBACK_STATUTS_MANDATS, FALLBACK_TYPES_DOCUMENTS } from '@/lib/referenceFallbacks'
import { sendMandatForSignature, connectDocusign, DocusignNonConnecte, useReprendreArchivage } from '@/lib/data/docusign'
import { useValiderMandatManuellement } from '@/lib/data/mandats'
import { useGoBack } from '@/lib/useGoBack'
import { useRaccourcisOnglets } from '@/lib/useRaccourcisOnglets'
import { jourLocalISO } from '@/lib/heureTache'
import { cn } from '@/lib/utils'
import type { Mandat, Contact, Compte, Compteur } from '@/types/domain'
import { generateMandatKiweePdf, generateMandatEnergixPdf } from '@/lib/mandatPdf'

type TabKey = 'mandat' | 'fichiers'

// Le code de reference reste 'KIWI' en base (cle utilisee par tout le pipeline d'import), seul
// le libelle affiche change -- renommer le code casserait les jointures existantes pour rien.
function EnvoyerSignatureDialog({
  open,
  onClose,
  mandat,
  compte,
  compteurs,
  contact,
}: {
  open: boolean
  onClose: () => void
  mandat: Mandat
  compte: Compte | undefined
  compteurs: Compteur[]
  contact: Contact | undefined
}) {
  const [sending, setSending] = useState(false)
  const [feedback, setFeedback] = useState<string | null>(null)
  const [besoinConnexionDocusign, setBesoinConnexionDocusign] = useState(false)
  const markEnvoye = useMarkMandatEnvoye()

  const dureeMois = mandat.duree_mois ?? 36
  const inclutEnergix = mandat.courtier_codes.includes('ENERGIX')

  async function envoyer() {
    if (!compte || !contact?.email) return
    setSending(true)
    setFeedback(null)
    try {
      const kiwee = await generateMandatKiweePdf({ compte, contact, compteurs, dureeMois })
      const documents = [kiwee]
      if (inclutEnergix) {
        const energix = await generateMandatEnergixPdf({ compte, contact, compteurs, dureeMois })
        documents.push(energix)
      }

      const result = await sendMandatForSignature({
        mandatId: mandat.id,
        documents,
        signerEmail: contact.email,
        signerName: `${contact.prenom} ${contact.nom}`,
        emailSubject: `KiWee Énergie — Mandat à signer (${mandat.compte_nom})`,
        draft: true,
        returnUrl: `${window.location.origin}/mandats/${mandat.id}`,
      })
      // Statut inchangé ici : c'est le webhook DocuSign qui fera passer le mandat à ENVOYE une
      // fois qu'un humain aura réellement cliqué "Envoyer" dans l'éditeur DocuSign (mode brouillon).
      await markEnvoye.mutateAsync({ mandatId: mandat.id, envelopeId: result.envelopeId, statutId: null })
      if (result.senderViewUrl) {
        window.location.href = result.senderViewUrl
        return
      }
      setFeedback('Enveloppe créée en brouillon.')
      setTimeout(onClose, 1200)
    } catch (e) {
      // Autorisation DocuSign manquante : geste a faire une fois, pas une panne. On propose la
      // connexion sur place plutot qu'un message que l'utilisateur ne peut pas exploiter.
      if (e instanceof DocusignNonConnecte) setBesoinConnexionDocusign(true)
      setFeedback(e instanceof Error ? e.message : 'Erreur inconnue')
    } finally {
      setSending(false)
    }
  }

  return (
    <Dialog open={open} onClose={onClose} title="Envoyer pour signature" description="Génère le(s) PDF de mandat et ouvre l'éditeur DocuSign pour vérification et envoi.">
      <div className="space-y-3">
        {!contact?.email && (
          <p className="text-xs text-km-red">Le contact signataire de ce mandat n'a pas d'adresse email renseignée.</p>
        )}
        {contact?.email && (
          <p className="text-xs text-km-muted">Signataire : {contact.prenom} {contact.nom} (<EmailLink value={contact.email!} />)</p>
        )}
        <p className="text-xs text-km-muted">
          Document{inclutEnergix ? 's' : ''} généré{inclutEnergix ? 's' : ''} : Mandat KiWee ({dureeMois} mois){inclutEnergix && ', Autorisation Energix'}.
        </p>
        <p className="text-km-xs text-km-faint">Tu seras redirigé·e vers DocuSign pour vérifier puis cliquer "Envoyer" toi-même — rien ne part automatiquement.</p>
        {feedback && <p className="text-xs text-km-muted">{feedback}</p>}
        {besoinConnexionDocusign && (
          <Button type="button" size="sm" onClick={() => { connectDocusign().catch(() => {}) }}>
            Connecter mon compte DocuSign
          </Button>
        )}
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="ghost" onClick={onClose}>Annuler</Button>
          <Button type="button" onClick={envoyer} disabled={sending || !contact?.email || !compte}>
            {sending ? 'Génération…' : 'Générer et vérifier'}
          </Button>
        </div>
      </div>
    </Dialog>
  )
}

/**
 * VALIDER UN MANDAT SIGNÉ AILLEURS.
 *
 * Naoëlle, 27/08/2026 : « certains partenaires passent par leur propre DocuSign » — la signature
 * existe donc, mais dehors, et Kimatch n'avait aucun moyen de l'enregistrer.
 *
 * TROIS CHAMPS, PAS PLUS. La date, d'où vient la signature, et c'est tout. Le reste se déduit :
 * voir `useValiderMandatManuellement` pour le statut et les dates de validité.
 *
 * LA DATE EST MODIFIABLE ET NE VAUT PAS FORCÉMENT AUJOURD'HUI : un mandat signé chez le partenaire
 * il y a trois semaines se saisit avec sa vraie date, sinon la validité court à partir du jour de la
 * saisie et le mandat vaut trois semaines de trop.
 */
function ValiderManuellementDialog({
  open,
  onClose,
  mandat,
  statuts,
  signaler,
}: {
  open: boolean
  onClose: () => void
  mandat: Mandat
  statuts: ReferenceRow[]
  signaler: (message: string) => void
}) {
  const valider = useValiderMandatManuellement()
  const aujourdHui = new Date().toISOString().slice(0, 10)
  const [date, setDate] = useState(jourLocalISO(mandat.date_signature) ?? aujourdHui)
  const [origine, setOrigine] = useState('DocuSign du partenaire')
  const [erreur, setErreur] = useState<string | null>(null)

  const statutActif = statuts.find((st) => st.code === 'ACTIF')
  const statutExpire = statuts.find((st) => st.code === 'EXPIRE')
  // Les tables de référence ont un repli local dont les identifiants ne sont PAS des UUID : écrire
  // avec l'un d'eux échoue en base tout en paraissant réussir. On le refuse explicitement.
  const estUuid = (v: string | undefined) => !!v && /^[0-9a-f-]{36}$/i.test(v)
  const statutsUtilisables = estUuid(statutActif?.id) && estUuid(statutExpire?.id)

  // Ce que la validation va écrire, montré AVANT de cliquer : la date de fin se calcule, et une date
  // calculée qu'on découvre après coup est une date qu'on n'a pas choisie.
  const finPrevue = (() => {
    if (mandat.date_fin_validite) return mandat.date_fin_validite.slice(0, 10)
    if (!mandat.duree_mois) return null
    const d = new Date((mandat.date_debut_validite?.slice(0, 10) ?? date) + 'T12:00:00')
    d.setMonth(d.getMonth() + mandat.duree_mois)
    return d.toISOString().slice(0, 10)
  })()
  const seraExpire = Boolean(finPrevue && finPrevue < aujourdHui)

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Valider ce mandat manuellement"
      description="À utiliser quand la signature s'est faite hors de Kimatch — sur le DocuSign d'un partenaire, par exemple."
    >
      <div className="space-y-3">
        <FormField label="Date de signature" required>
          <Input type="date" value={date} max={aujourdHui} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setDate(e.target.value)} />
        </FormField>

        <FormField label="Où la signature a eu lieu">
          <Input
            value={origine}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setOrigine(e.target.value)}
            placeholder="DocuSign du partenaire, signature papier…"
          />
        </FormField>
        <p className="text-km-xs text-km-faint">
          Cette mention est conservée sur le mandat : sans enveloppe DocuSign à consulter, c'est la
          seule trace de l'endroit où la signature a été recueillie.
        </p>

        <div className="rounded-lg border border-km-line bg-km-bg px-3 py-2">
          <p className="text-km-xs uppercase tracking-wide text-km-faint">Ce qui sera enregistré</p>
          <p className="mt-1 text-xs text-km-text">
            Validité du {new Date(((mandat.date_debut_validite?.slice(0, 10)) ?? date) + 'T12:00:00').toLocaleDateString('fr-FR')}
            {finPrevue ? ` au ${new Date(finPrevue + 'T12:00:00').toLocaleDateString('fr-FR')}` : ', sans date de fin connue'}
            {' · statut '}
            <strong>{seraExpire ? 'Expiré' : 'Actif'}</strong>
          </p>
          {seraExpire && (
            <p className="mt-1 text-km-xs text-amber-700">
              La validité est déjà dépassée : le mandat sera enregistré comme expiré, pas comme actif.
            </p>
          )}
        </div>

        {!statutsUtilisables && (
          <p className="text-xs text-km-red">
            Statuts de mandat indisponibles — rechargez la page avant de valider.
          </p>
        )}
        {erreur && <p className="text-xs text-km-red">{erreur}</p>}

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="ghost" onClick={onClose}>Annuler</Button>
          <Button
            type="button"
            disabled={valider.isPending || !date || !statutsUtilisables}
            onClick={async () => {
              setErreur(null)
              try {
                const r = await valider.mutateAsync({
                  mandatId: mandat.id,
                  dateSignature: date,
                  commentaire: origine.trim() ? `Signé hors Kimatch : ${origine.trim()}` : null,
                  statutActifId: statutActif?.id ?? null,
                  statutExpireId: statutExpire?.id ?? null,
                  dateDebutValidite: mandat.date_debut_validite,
                  dateFinValidite: mandat.date_fin_validite,
                  dureeMois: mandat.duree_mois ?? null,
                })
                signaler(r.expire ? '✓ Mandat validé — expiré' : '✓ Mandat validé — actif')
                onClose()
              } catch (e) {
                setErreur(e instanceof Error ? e.message : 'Erreur inconnue')
              }
            }}
          >
            {valider.isPending ? 'Enregistrement…' : 'Valider le mandat'}
          </Button>
        </div>
      </div>
    </Dialog>
  )
}

/**
 * LE CHEMIN DE CONVERSION DEMANDE À DOCUSIGN OÙ ON EN EST.
 *
 * ── POURQUOI CETTE CARTE A CHANGÉ ─────────────────────────────────────────────────────────────
 *
 * Elle lisait la base, et rien d'autre. Or la base n'apprend qu'un mandat a été signé que si une
 * notification DocuSign nous parvient — et le 31/08/2026 cinq mandats étaient bloqués faute de
 * l'avoir reçue : CABINET MOLINIER et KIWEE ENERGIE FRANCE à « À préparer » depuis le 14 et le 15
 * août, Cabinet Louis Porcheret, TRANTRANYUE et RGR BY CABINET WURM à « Envoyé » depuis le 20 et le
 * 25. La fiche du mandat n'offrait AUCUN moyen de vérifier : ni bouton, ni appel. On ne pouvait que
 * constater le blocage.
 *
 * La fiche du contrat, elle, avait ce bouton depuis le 21/08. Le mandat ne l'a jamais eu — c'est
 * pourtant sur les mandats que les blocages se sont accumulés.
 *
 * ── DEUX PRÉCAUTIONS ──────────────────────────────────────────────────────────────────────────
 *
 * L'appel ne part que si le mandat peut encore bouger. Un mandat actif, signé, refusé, annulé ou
 * expiré ne changera plus : le redemander serait un appel DocuSign par consultation de fiche.
 *
 * Et il se tait quand il ne corrige rien. Une notification « rien n'a changé » à chaque ouverture
 * serait du bruit ; on ne parle que lorsqu'on a rattrapé un retard.
 */

/** Un PDF se reconnaît à son nom de fichier — l'adresse sert de repli pour les reprises Salesforce,
 *  où `nom_fichier` est parfois vide. */
function estPdf(doc: { nom_fichier?: string | null; url?: string | null }): boolean {
  return Boolean(doc.nom_fichier?.toLowerCase().endsWith('.pdf') || doc.url?.toLowerCase().includes('.pdf'))
}

export default function MandatDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  // Perimetre de la fiche, lu cote serveur : ces lectures parcouraient le CRM entier pour en
  // garder une ligne ou quelques-unes (meme correctif que les fiches compte et site).
  const { data: mandat } = useMandat(id)
  // Le statut avance sous les yeux pendant la signature — voir `useMandatEnDirect`.
  useMandatEnDirect(id)
  const { data: statutsRef } = useReferenceTable('statuts_mandats')
  const statuts = statutsRef && statutsRef.length > 0 ? statutsRef : FALLBACK_STATUTS_MANDATS
  const { data: contacts } = useContacts()
  const { data: comptes } = useComptes()
  const { data: compteurs } = useCompteurs()
  const { data: documents } = useDocuments()
  const [showEnvoyer, setShowEnvoyer] = useState(false)
  const [showValider, setShowValider] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const televerser = useTeleverserDocuments()

  const { data: typesDocsRef } = useReferenceTable('types_documents')

  const typesDocs = typesDocsRef && typesDocsRef.length > 0 ? typesDocsRef : FALLBACK_TYPES_DOCUMENTS
  const [tab, setTab] = useState<TabKey>('mandat')
  const reprendreArchivage = useReprendreArchivage()
  const [repriseMessage, setRepriseMessage] = useState<string | null>(null)
  /** Le fichier ouvert dans la visionneuse. `null` = celui que `fichierParDefaut` désigne. */
  const [documentChoisi, setDocumentChoisi] = useState<string | null>(null)
  const supprimerDocument = useDeleteDocument()
  const canManage = useCanManage(mandat?.proprietaire_id)
  /* Les contrats du compte, pas du CRM : le périmètre a besoin du fournisseur de chaque PDL. */
  const { data: contratsDuCompte } = useContratsParCompte(mandat?.compte_id)
  const deleteMandat = useDeleteMandat()
  const goBack = useGoBack('/mandats')

  // Edition en place : la modale « Modifier » disparait.
  const updateMandatPartiel = useUpdateMandatPartiel()

  /* Tous les contacts du compte du mandat : le rattachement principal ET les rattachements
     multiples de `contacts_comptes`. Voir `@/lib/contactsDuCompte`. */
  const contactsPourSignature = useMemo(
    () => contactsRattaches(contacts, mandat?.compte_id),
    [contacts, mandat?.compte_id],
  )
  const majMandat = async (patch: PatchMandat) => {
    await updateMandatPartiel.mutateAsync({ id: id as string, patch })
  }
  const [toast, setToast] = useState<string | null>(null)
  function showToast(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(null), 2200)
  }
  const compte = comptes?.find((c) => c.id === mandat?.compte_id)
  const contactSignataire = contacts?.find((c) => c.id === mandat?.contact_signataire_id)
  const compteursDuMandat = useMemo(() => compteurs?.filter((c) => mandat?.compteur_ids.includes(c.id)) ?? [], [compteurs, mandat])
  const documentsDuMandat = useMemo(() => documents?.filter((d) => d.entite_type === 'mandat' && d.entite_id === mandat?.id) ?? [], [documents, mandat?.id])

  /* Le mandat Kiwee signé s'ouvre de lui-même — voir `fichierParDefaut`. Le choix explicite de
     l'utilisateur prime, et retombe sur le défaut si le fichier choisi vient d'être supprimé. */
  const documentOuvert = useMemo(
    () => documentsDuMandat.find((d) => d.id === documentChoisi) ?? fichierParDefaut(documentsDuMandat),
    [documentsDuMandat, documentChoisi],
  )

  const suppression = useSuppression()

  function handleDelete() {
    if (!mandat) return
    suppression.supprimer(
      () => deleteMandat.mutateAsync(mandat.id),
      () => navigate('/mandats'),
    )
  }

  /**
   * ══ DEUX ONGLETS SUR QUATRE ONT DISPARU LE 09/09/2026 ══
   *
   * William : « supprime l'onglet périmètre et rattachement ».
   *
   * « Rattachements » ne montrait que le compte et le signataire — exactement ce que les cartes
   * d'identité du volet Mandat affichent désormais, en mieux. « Périmètre » listait les compteurs
   * groupés par site, en lecture seule : le groupement par site s'en va avec l'objet Site, et la
   * liste à plat vit maintenant en bas du volet Mandat.
   *
   * Aucune fonction n'est perdue : les deux étaient des vues, pas des outils.
   */
  const TABS: { key: TabKey; label: string; badge?: string }[] = [
    { key: 'mandat', label: 'Mandat' },
    { key: 'fichiers', label: 'Fichiers', badge: documentsDuMandat.length ? String(documentsDuMandat.length) : undefined },
  ]

  // « 1–5 pour naviguer » : le raccourci annonce par la maquette dans la barre d'onglets.
  const clesOnglets = TABS.map((t) => t.key)
  useRaccourcisOnglets(clesOnglets, setTab)

  if (!mandat && id) {
    return (
      <div>
        <Topbar crumb="Mandats" title="Mandat" />
        <div className="p-4 sm:p-6"><p className="text-sm text-km-faint">Chargement…</p></div>
      </div>
    )
  }

  if (!mandat) {
    return (
      <div>
        <Topbar crumb="Mandats" title="Mandat" />
        <div className="p-4 sm:p-6">
          <Button variant="ghost" size="sm" className="mb-4" onClick={goBack}>
            <ArrowLeft className="h-4 w-4" />
            Retour aux mandats
          </Button>
          <p className="text-sm text-km-muted">Mandat introuvable.</p>
        </div>
      </div>
    )
  }

  return (
    <div>
      <Topbar crumb="Mandats" title={`Mandat — ${mandat.compte_nom}`} />

      {/* Bandeau mandat */}
      <div className="flex flex-wrap items-center gap-3.5 border-b border-km-line bg-white px-4 py-3.5 sm:px-6">
        <Button variant="ghost" size="icon" onClick={goBack} title="Retour aux mandats">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] bg-gradient-to-br from-amber-600 to-amber-500 text-white">
          <FileCheck2 className="h-[18px] w-[18px]" />
        </span>
        <div className="min-w-0 flex-1">
          {/* La pastille de statut est partie : la frise « Cycle du mandat » la dit mieux, et la
              garder en aurait fait deux endroits à tenir d'accord (Naoëlle, 03/09/2026). */}
          <p className="truncate text-xl font-bold tracking-tight text-km-text">Mandat {mandat.compte_nom}</p>
          <p className="truncate text-xs text-km-muted">{mandat.nb_sites_couverts} site{mandat.nb_sites_couverts > 1 ? 's' : ''} couvert{mandat.nb_sites_couverts > 1 ? 's' : ''}</p>
          <p className="truncate text-km-xs text-km-faint">
            {/* C'est le créateur qu'on affiche, pas un propriétaire : Mandat__c n'a pas d'OwnerId
                côté Salesforce, donc le mandat n'a jamais eu de propriétaire à reprendre. */}
            {mandat.date_creation && <>Créé le {new Date(mandat.date_creation).toLocaleDateString('fr-FR')} </>}
            par {mandat.createur_nom || mandat.proprietaire_nom || 'un auteur inconnu'}
            {mandat.id_salesforce && <> · <span className="font-mono">{mandat.id_salesforce}</span> (temporaire, pour contrôle)</>}
          </p>
        </div>
        <div className="flex gap-1.5">
          <Button size="sm" onClick={() => setShowEnvoyer(true)}>
            <FileSignature className="h-3.5 w-3.5" />
            Envoyer pour signature
          </Button>
          {canManage && (
            <>
              {/* VALIDER À LA MAIN — proposé tant que le mandat n'est pas signé. Après, il n'y a
                  plus rien à valider, et le bouton ne ferait qu'inviter à écraser une date juste. */}
              {!mandat.date_signature && (
                <Button variant="outline" size="sm" onClick={() => setShowValider(true)}>
                  <FileCheck2 className="h-3.5 w-3.5" />
                  Valider manuellement
                </Button>
              )}
              {/* Plus de bouton « Modifier » : la date de signature s'edite dans « Détail du mandat ». */}
              <Button variant="outline" size="sm" onClick={() => setConfirmDelete(true)}>
                <Trash2 className="h-3.5 w-3.5" />
                Supprimer
              </Button>
            </>
          )}
        </div>
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
          {/* Les objets liés et le contexte du mandat, sortis du volet gauche. */}
          {tab === 'mandat' && (
            /* ══ LE VOLET DU MANDAT, TROIS STRATES DE LECTURE ══
               Maquette de William, 08/09/2026 : où en est le mandat, qui et quoi, sur quoi il porte.
               L'ordre est délibéré et ne doit pas changer — c'est l'ordre des questions qu'on se
               pose en ouvrant la fiche. */
            <div className="flex flex-col gap-3.5">
              <CheminConversion mandat={mandat} onCopie={showToast} />

              {/* QUATRE CARTES SUR UNE RANGÉE — William, 09/09/2026 : la frise de VALIDITÉ quitte le
                  bloc « Détail » pour rejoindre Compte, Signataire et Type de mandat. Le parcours,
                  lui, reste en pleine largeur au-dessus : « il était parfait tout en haut ».
                  En dessous de 1 280 px la rangée se dédouble, puis s'empile. */}
              <div className="grid grid-cols-1 items-stretch gap-3.5 md:grid-cols-2 xl:grid-cols-4">
                <CarteCompte
                  compte={compte}
                  comptes={comptes ?? []}
                  peutModifier={canManage}
                  onChangerCompte={(compte_id) => {
                    void majMandat({ compte_id }).then(() => showToast('✓ compte modifié'))
                  }}
                  onCopie={showToast}
                  nbPdlCouverts={compteursDuMandat.length}
                />
                <CarteSignataire
                  contact={contactSignataire}
                  contacts={contactsPourSignature}
                  peutModifier={canManage}
                  onChangerSignataire={(contact_signataire_id) => {
                    void majMandat({ contact_signataire_id }).then(() => showToast('✓ signataire modifié'))
                  }}
                  onCopie={showToast}
                />
                <CarteTypeMandat mandat={mandat} />
                <CarteValidite
                  debut={mandat.date_debut_validite ?? mandat.date_signature}
                  fin={mandat.date_fin_validite}
                />
              </div>

              <PerimetreCouvert compteurs={compteursDuMandat} contrats={contratsDuCompte} />

              {/* ══ LE SUIVI DOCUSIGN, LE MÊME QUE SUR LE CONTRAT ══
                  Naoëlle, 08/09/2026 : « ce qu'il y avait sur mandat que je ne vois plus ». Le suivi
                  disparaissait dès que le mandat devenait ACTIF — donc sur la quasi-totalité d'entre
                  eux — parce que l'état arrêté coupait le bloc entier et pas seulement son appel
                  automatique. Elle l'a sorti dans `BlocSuiviDocusign`, partagé avec la fiche contrat.

                  J'AVAIS ÉCRIT LE MIEN EN PARALLÈLE, le 08/09 également, sans voir le sien : deux
                  composants pour la même chose, dont l'un aurait cessé d'être relu. Le sien reste —
                  il sert deux fiches, le mien n'en servait qu'une. */}
              <BlocSuiviDocusign
                objet="mandat"
                id={mandat.id}
                envelopeId={mandat.docusign_envelope_id}
                statut={mandat.statut}
                dateEnvoi={mandat.date_envoi}
                dateSignature={mandat.date_signature}
                signataireNom={mandat.contact_signataire_nom}
                signaler={showToast}
                versProfil={() => navigate('/profil')}
              />

              {/* ══ LE BLOC « DÉTAIL » EST PARTI ══
                  William, 09/09/2026 : « tu peux masquer le bloc détail, désormais il n'est pas
                  utile ». La validité a rejoint la rangée du haut, le propriétaire est masqué, et la
                  date de signature se saisit dans « Valider manuellement ». Reste l'historique des
                  modifications, replié, qui répond à « qui a changé ça » — et n'a pas d'autre
                  maison. */}
              <HistoriqueDiscret tableNom="mandats" ligneId={mandat.id} />
            </div>
          )}

          {tab === 'fichiers' && (
            /* ══ UN TIERS POUR CHOISIR, DEUX TIERS POUR LIRE ══
               William, 09/09/2026 : « dans ce volet on va le faire en 1/3 à gauche et 2/3 à droite.
               Dans le volet de gauche la zone de drag & drop ainsi que les différents fichiers
               uploadés, et à droite une visualisatrice de PDF hyper optimisée. »

               La hauteur est celle du volet, pas celle du contenu : la visionneuse doit occuper tout
               ce qui reste sous la barre d'onglets, sinon elle affiche un timbre-poste au milieu
               d'une page vide. D'où `h-full min-h-0` et deux colonnes qui défilent séparément. */
            <div className="grid h-full min-h-0 grid-cols-1 gap-3.5 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
              <div className="flex min-h-0 flex-col gap-3 overflow-y-auto pr-0.5">
                {/* PAS DE BOUTON « Ajouter un fichier ». Naoëlle, 21/08/2026 : « si on peut cliquer
                    ou déposer c'est bon, pas besoin de bruit visuel avec un bouton ». La zone dit
                    les deux gestes et les accepte tous les deux. */}
                <ZoneDepotFichiers
                  types={typesDocs}
                  onDeposer={async (fichiers, typeDocumentId) => {
                    await televerser.mutateAsync({
                      fichiers,
                      entite_type: 'mandat',
                      entite_id: mandat.id,
                      type_document_id: typeDocumentId,
                      type_document_libelle: typesDocs.find((x) => x.id === typeDocumentId)?.libelle ?? '',
                    })
                  }}
                />

                <ListeFichiers
                  documents={documentsDuMandat}
                  selection={documentOuvert?.id ?? null}
                  onSelectionner={(d) => setDocumentChoisi(d.id)}
                  peutSupprimer={canManage}
                  onSupprimer={async (d) => {
                    await supprimerDocument.mutateAsync(d.id)
                    if (documentChoisi === d.id) setDocumentChoisi(null)
                    showToast('✓ fichier supprimé')
                  }}
                />

                {/* ══ REDEMANDER LES PIÈCES SIGNÉES À DOCUSIGN ══
                    N'apparaît que sur un mandat signé passé par DocuSign. Il sert deux cas : les
                    mandats signés avant le 08/09/2026, dont l'archivage déposait un unique PDF
                    combiné, et le jour où un téléchargement échoue en silence. */}
                {mandat.docusign_envelope_id && (mandat.statut === 'ACTIF' || mandat.statut === 'EXPIRE') && (
                  <div className="rounded-km-md border border-dashed border-km-line bg-km-bg/60 px-3 py-2.5">
                    <p className="text-km-label leading-relaxed text-km-muted">
                      Les pièces signées viennent de DocuSign — un PDF par document, plus le certificat.
                    </p>
                    <button
                      type="button"
                      disabled={reprendreArchivage.isPending}
                      onClick={async () => {
                        setRepriseMessage(null)
                        try {
                          const r = await reprendreArchivage.mutateAsync({ mandatIds: [mandat.id] })
                          const pieces = r.rapport?.[0]?.pieces ?? 0
                          const echec = r.rapport?.[0]?.erreur
                          setRepriseMessage(
                            echec
                              ? `Échec : ${echec}`
                              : `${pieces} pièce${pieces > 1 ? 's' : ''} récupérée${pieces > 1 ? 's' : ''} depuis DocuSign.`,
                          )
                        } catch (e) {
                          setRepriseMessage(e instanceof Error ? e.message : 'Reprise impossible')
                        }
                      }}
                      className="mt-1.5 rounded-km border border-km-line bg-km-surface px-2.5 py-1 text-km-label font-semibold text-km-muted transition-colors hover:border-km-green hover:bg-km-green-soft hover:text-km-green disabled:opacity-50"
                    >
                      {reprendreArchivage.isPending ? 'Récupération…' : 'Récupérer à nouveau'}
                    </button>
                    {repriseMessage && (
                      <p className="mt-1.5 text-km-label font-semibold text-km-text">{repriseMessage}</p>
                    )}
                  </div>
                )}
              </div>

              {/* ══ LA COLONNE DE LECTURE ══
                  Un PDF passe par la visionneuse maison ; le reste — six PNG et trois DOCX dans
                  toute la base — garde l'aperçu générique, qui sait afficher une image et proposer
                  le téléchargement pour ce qu'il ne sait pas ouvrir. */}
              <div className="min-h-0">
                {!documentOuvert ? (
                  <CadreVide>
                    <p className="text-km-body font-bold text-km-text">Aucun fichier sélectionné</p>
                    <p className="max-w-[38ch] text-km-label leading-relaxed text-km-muted">
                      Choisissez un document à gauche pour le lire ici.
                    </p>
                  </CadreVide>
                ) : estPdf(documentOuvert) ? (
                  <Suspense fallback={<CadreVide><p className="text-km-label text-km-muted">Préparation de la lecture…</p></CadreVide>}>
                    <VisionneusePdf
                      key={documentOuvert.id}
                      url={documentOuvert.url}
                      nomFichier={documentOuvert.nom_fichier || documentOuvert.nom}
                    />
                  </Suspense>
                ) : (
                  <div className="h-full overflow-y-auto">
                    <ApercuDocument
                      url={documentOuvert.url}
                      nomFichier={documentOuvert.nom_fichier || documentOuvert.nom}
                    />
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      <EnvoyerSignatureDialog
        open={showEnvoyer}
        onClose={() => setShowEnvoyer(false)}
        mandat={mandat}
        compte={compte}
        compteurs={compteursDuMandat}
        contact={contactSignataire}
      />

      <ValiderManuellementDialog
        open={showValider}
        onClose={() => setShowValider(false)}
        mandat={mandat}
        statuts={statuts}
        signaler={showToast}
      />

      <Dialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title="Supprimer ce mandat ?"
        description="Cette action est irréversible. Les recommandations et documents liés à ce mandat ne seront pas supprimés mais perdront leur lien à ce mandat."
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

      {toast && (
        <div className="fixed bottom-[70px] left-1/2 z-50 -translate-x-1/2 whitespace-nowrap rounded-lg bg-ink-800 px-4 py-2.5 text-xs font-semibold text-white shadow-lg lg:bottom-6">
          {toast}
        </div>
      )}
    </div>
  )
}
