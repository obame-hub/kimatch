import { useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { AlertTriangle, ArrowRight, Eye, FileText, Flame, Loader2, Mail, Search, Upload, UserPlus, X, Zap } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ChoixParRecherche } from '@/components/ui/choix-recherche'
import { WizardConnectionGate } from '@/components/ui/connection-gate'
import { ChoixDureeMandats, DUREE_DEFAUT } from '@/components/mandat/ChoixDureeMandats'
import { FenetreApercu } from '@/components/document/FenetreApercu'
import {
  EnTeteEtape, FenetreParcours, PanneauParcours, RailParcours, useSortieParcours,
  type EtapeParcours, type ResumeEtape,
} from '@/components/parcours/Parcours'
import { useComptes } from '@/lib/data/comptes'
import { useContacts } from '@/lib/data/contacts'
import { useCompteursParCompte } from '@/lib/data/compteurs'
import { addMonthsISO, useCreateMandat, useMandats } from '@/lib/data/mandats'
import { useTeleverserDocuments } from '@/lib/data/documents'
import { useEnvoiMandat } from '@/lib/data/envoiMandat'
import { useReferenceTable } from '@/lib/data/referenceTables'
import { FALLBACK_TYPES_COURTIERS_MANDAT } from '@/lib/referenceFallbacks'
import { connectDocusign } from '@/lib/data/docusign'
import { useCreerUnContact } from '@/lib/creationContact'
import { cn } from '@/lib/utils'
import type { Compte, Contact } from '@/types/domain'

/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * CRÉER UN MANDAT — LE PARCOURS À PART ENTIÈRE
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * William, 29/09/2026 : « on va passer au process de création de mandat. Là encore le process
 * existe déjà sous le nouveau design dans la conversion de piste. J'aimerais que tu t'en inspires
 * pour l'implémenter dans le process pur de création de mandat. »
 *
 * ══ CE QUI VIENT DE LA CONVERSION, ET CE QUI S'Y AJOUTE ══
 *
 * La conversion CONFIRME : elle vient de créer le contact et les compteurs, il ne reste qu'à dire
 * oui (`MandatEnUnePage`). Ici, rien n'est connu d'avance — il faut DEMANDER : pour quel compte,
 * qui signe, quels compteurs parmi tout le patrimoine. D'où les étapes, dans la coquille commune
 * des parcours. La dernière est celle de la conversion : la même zone durée et mandats
 * (`ChoixDureeMandats`), la même chaîne création → PDF → DocuSign en brouillon (`useEnvoiMandat`).
 *
 * ══ QUATRE ÉTAPES, DANS L'ORDRE OÙ L'ON CONNAÎT LES RÉPONSES ══
 *
 *   LE COMPTE       passée d'elle-même quand on part d'une fiche compte ou d'une opportunité.
 *   LE SIGNATAIRE   un contact du compte, ou un contact créé sur place.
 *   LE PÉRIMÈTRE    les compteurs du compte encore sans mandat actif.
 *   LE MANDAT       durée, KiWee et Energix, puis « Préparer le mandat » : DocuSign s'ouvre en
 *                   brouillon, c'est le commercial qui clique « Envoyer ».
 *
 * ══ LE MANDAT D'UN TIERS — une cinquième étape, 30/09/2026 ══
 *
 * William : « si le compte lié est celui d'un partenaire ou d'une vente indirecte, alors à l'étape 4
 * je dois avoir un bouton "Enregistrer le mandat d'un tiers". Aucun envoi via DocuSign mais […] joindre
 * le ou les fichiers signés, renseigner la date de signature (et donc la date de début). En fonction
 * de la durée, cela déduira la date de fin. »
 *
 * Le mandat a été recueilli ailleurs, il arrive signé : il naît donc au statut de sa période —
 * `ACTIF`, ou `EXPIRE` si elle est déjà écoulée, la même règle que le retour de DocuSign
 * (`api/docusign/_decision.ts`) — et ses fichiers rejoignent ses documents. La fin se calcule comme
 * à la signature DocuSign (`addMonthsISO`, qui s'arrête au dernier jour du mois).
 * Le signataire reste obligatoire, et le choix KiWee / Energix reste le même (décisions de William).
 *
 * Ce que l'appelant sait se reprend (une opportunité connaît son contact et ses compteurs) mais
 * reste modifiable : règle du 18/09/2026, un rattachement affiché se change là où il s'affiche.
 */

const ETAPES_DE_BASE: EtapeParcours[] = [
  { cle: 'compte', libelle: 'Le compte' },
  { cle: 'signataire', libelle: 'Le signataire' },
  { cle: 'perimetre', libelle: 'Le périmètre' },
  { cle: 'mandat', libelle: 'Le mandat' },
]
/* LA CINQUIÈME ÉTAPE N'APPARAÎT QUE POUR UN MANDAT DE TIERS, au moment où on le choisit. */
const ETAPE_SIGNATURE: EtapeParcours = { cle: 'signature', libelle: 'La signature' }
type CleEtape = 'compte' | 'signataire' | 'perimetre' | 'mandat' | 'signature'

/** Aujourd'hui, à Paris — la borne haute d'une date de signature. */
function aujourdhuiParis(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
}
const dateFr = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString('fr-FR')

type Echeance = 'expiree' | 'proche' | 'lointaine' | 'aucune'
function bucketEcheance(iso: string | null | undefined): Echeance {
  if (!iso) return 'aucune'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return 'aucune'
  const jours = Math.floor((d.getTime() - Date.now()) / 86_400_000)
  if (jours < 0) return 'expiree'
  if (jours <= 180) return 'proche'
  return 'lointaine'
}
const FILTRES_ECHEANCE: [Echeance, string][] = [
  ['expiree', 'Échéance passée'],
  ['proche', '< 6 mois'],
  ['lointaine', '> 6 mois'],
  ['aucune', 'Sans échéance'],
]

export interface DemandeMandat {
  compte?: { id: string; nom: string } | null
  contactId?: string | null
  compteurIds?: string[]
  onCree?: (mandatId: string) => void
}

export function ParcoursCreationMandat({ demande, onFermer }: { demande: DemandeMandat; onFermer: () => void }) {
  const navigate = useNavigate()
  const location = useLocation()
  const creerUnContact = useCreerUnContact()
  const { data: comptes } = useComptes()
  const { data: contacts } = useContacts()
  const { data: mandats } = useMandats()
  const { data: courtiersRef } = useReferenceTable('types_courtiers_mandat')
  const courtiers = courtiersRef && courtiersRef.length > 0 ? courtiersRef : FALLBACK_TYPES_COURTIERS_MANDAT

  const [compteId, setCompteId] = useState(demande.compte?.id ?? '')
  const [etape, setEtape] = useState<CleEtape>(demande.compte ? 'signataire' : 'compte')
  const [signataireId, setSignataireId] = useState(demande.contactId ?? '')
  const [retenus, setRetenus] = useState<string[]>(demande.compteurIds ?? [])
  const [dureeMois, setDureeMois] = useState<number>(DUREE_DEFAUT)
  const [avecEnergix, setAvecEnergix] = useState(true)
  const [rechercheContact, setRechercheContact] = useState('')
  const [recherchePdl, setRecherchePdl] = useState('')
  const [montrerActifs, setMontrerActifs] = useState(false)
  const [filtreEnergie, setFiltreEnergie] = useState<'electricite' | 'gaz' | null>(null)
  const [filtresEcheance, setFiltresEcheance] = useState<Echeance[]>([])
  const [mandatCreeId, setMandatCreeId] = useState<string | null>(null)
  /* Le mandat d'un tiers : ses fichiers signés, sa date de signature, et l'état de l'enregistrement. */
  const [modeTiers, setModeTiers] = useState(false)
  const [fichiersSignes, setFichiersSignes] = useState<File[]>([])
  const [dateSignature, setDateSignature] = useState('')
  const [enregistrement, setEnregistrement] = useState<{ enCours: boolean; erreur: string | null }>({ enCours: false, erreur: null })
  const [apercu, setApercu] = useState<{ url: string; nom: string } | null>(null)
  const creerMandat = useCreateMandat()
  const televerser = useTeleverserDocuments()

  const { envoyer, etat } = useEnvoiMandat((id) => {
    setMandatCreeId(id)
    demande.onCree?.(id)
  })

  const comptesPossibles = useMemo(() => (comptes ?? []).filter((c) => c.type_compte !== 'fournisseur'), [comptes])
  const compte: Compte | undefined = comptesPossibles.find((c) => c.id === compteId)
  const nomCompte = compte?.nom ?? (demande.compte?.id === compteId ? demande.compte?.nom : undefined)
  /* UN COMPTE PARTENAIRE OU DE VENTE INDIRECTE peut apporter un mandat déjà signé ailleurs. */
  const peutEtreDeTiers = compte?.type_compte === 'partenaire' || compte?.type_compte === 'vente_indirecte'
  const ETAPES = modeTiers ? [...ETAPES_DE_BASE, ETAPE_SIGNATURE] : ETAPES_DE_BASE
  const { data: compteursDuCompte } = useCompteursParCompte(compteId || undefined)

  /* Un contact rattaché au compte à quelque titre que ce soit — on lit `comptes`, pas `compte_id`. */
  const contactsDuCompte = useMemo(
    () => (contacts ?? []).filter((c) => c.comptes.some((l) => l.id === compteId)),
    [contacts, compteId],
  )
  const signataire = (contacts ?? []).find((c) => c.id === signataireId) ?? null

  /* UN SEUL CONTACT SUR LE COMPTE : le choisir d'avance épargne un clic qui n'est pas un choix. */
  useEffect(() => {
    if (!signataireId && contactsDuCompte.length === 1) setSignataireId(contactsDuCompte[0].id)
  }, [signataireId, contactsDuCompte])

  /* ══ LE PÉRIMÈTRE : CE QUI N'EST PAS DÉJÀ COUVERT ══
     Règle de Tools : un compteur sous mandat ACTIF n'est pas proposé, sauf à le demander — sans
     quoi on signe un second mandat sur un périmètre déjà couvert. */
  const sousMandatActif = useMemo(
    () => new Set((mandats ?? []).filter((m) => m.statut === 'ACTIF').flatMap((m) => m.compteur_ids)),
    [mandats],
  )
  const eligibles = useMemo(
    () => (compteursDuCompte ?? []).filter((c) => montrerActifs || !sousMandatActif.has(c.id) || retenus.includes(c.id)),
    [compteursDuCompte, montrerActifs, sousMandatActif, retenus],
  )
  const affiches = useMemo(() => {
    const q = recherchePdl.trim().toLowerCase()
    return eligibles.filter((c) =>
      (!q || [c.numero_pdl, c.site_nom, c.utilisation].some((v) => (v ?? '').toLowerCase().includes(q)))
      && (!filtreEnergie || c.type_energie === filtreEnergie)
      && (filtresEcheance.length === 0 || filtresEcheance.includes(bucketEcheance(c.date_echeance))),
    )
  }, [eligibles, recherchePdl, filtreEnergie, filtresEcheance])
  const compteursRetenus = (compteursDuCompte ?? []).filter((c) => retenus.includes(c.id))

  const contactsAffiches = useMemo(() => {
    const q = rechercheContact.trim().toLowerCase()
    if (!q) return contactsDuCompte
    return contactsDuCompte.filter((c) => `${c.prenom} ${c.nom} ${c.fonction ?? ''} ${c.email ?? ''}`.toLowerCase().includes(q))
  }, [contactsDuCompte, rechercheContact])

  /* ══ UNE NAVIGATION FERME LE PARCOURS ══ — comme les autres parcours posés sur toute l'application. */
  const cheminInitial = useRef(location.pathname)
  useEffect(() => {
    if (location.pathname !== cheminInitial.current) onFermer()
  }, [location.pathname, onFermer])

  function choisirCompte(c: Compte | null) {
    setCompteId(c?.id ?? '')
    /* CHANGER DE COMPTE REMET À ZÉRO ce qui lui appartenait : un signataire et des compteurs d'un
       autre compte n'ont rien à faire sur ce mandat. */
    if (c && c.id !== compteId) {
      setSignataireId('')
      setRetenus([])
    }
    if (c) setEtape('signataire')
  }

  function preparer() {
    if (!compte || !signataire) return
    void envoyer({
      compte,
      signataire,
      compteurs: compteursRetenus,
      dureeMois,
      avecEnergix,
      courtierTypeIds: courtiers
        .filter((c) => (avecEnergix ? ['KIWI', 'ENERGIX'] : ['KIWI']).includes(c.code))
        .map((c) => c.id),
    })
  }

  /* ══ LA PÉRIODE DU MANDAT DE TIERS ══ — du jour de signature, pour la durée choisie. */
  const finTiers = dateSignature && dureeMois > 0 ? addMonthsISO(dateSignature, dureeMois) : null
  const statutTiers: 'ACTIF' | 'EXPIRE' = finTiers && finTiers < aujourdhuiParis() ? 'EXPIRE' : 'ACTIF'
  const dateInvalide = Boolean(dateSignature) && dateSignature > aujourdhuiParis()

  async function enregistrerTiers() {
    if (!compte || !signataire || fichiersSignes.length === 0 || !dateSignature || dateInvalide) return
    setEnregistrement({ enCours: true, erreur: null })
    let mandatId = mandatCreeId
    try {
      if (!mandatId) {
        const codes = avecEnergix ? ['KIWI', 'ENERGIX'] : ['KIWI']
        const r = await creerMandat.mutateAsync({
          compte_id: compte.id,
          compte_nom: compte.nom,
          compteur_ids: compteursRetenus.map((c) => c.id),
          compteurs: compteursRetenus.map((c) => ({ id: c.id, site_id: c.site_id })),
          date_signature: dateSignature,
          duree_mois: dureeMois,
          contact_signataire_id: signataire.id,
          contact_signataire_nom: `${signataire.prenom} ${signataire.nom}`,
          courtier_codes: codes,
          courtier_type_ids: courtiers.filter((c) => codes.includes(c.code)).map((c) => c.id),
          statut_code: statutTiers,
        })
        if (!r.persisted) throw new Error('Le mandat n’a pas pu être enregistré dans la base.')
        mandatId = r.mandat.id
        setMandatCreeId(mandatId)
        demande.onCree?.(mandatId)
      }
      /* LES FICHIERS APRÈS LE MANDAT : ils ont besoin de son identifiant. S'ils échouent, le mandat
         existe déjà — on le dit, et on ne le recrée pas au clic suivant. */
      await televerser.mutateAsync({
        fichiers: fichiersSignes,
        entite_type: 'mandat',
        entite_id: mandatId,
        type_document_id: null,
        type_document_libelle: 'Mandat signé',
      })
      onFermer()
      navigate(`/mandats/${mandatId}`)
    } catch (e) {
      setEnregistrement({
        enCours: false,
        erreur: `${e instanceof Error ? e.message : 'Erreur inconnue'}${mandatId ? ' — le mandat est créé : réessayez, seuls les fichiers repartiront.' : ''}`,
      })
      return
    }
    setEnregistrement({ enCours: false, erreur: null })
  }

  function voirFichier(f: File) {
    setApercu({ url: URL.createObjectURL(f), nom: f.name })
  }
  function fermerApercu() {
    if (apercu) URL.revokeObjectURL(apercu.url)
    setApercu(null)
  }

  /* ══ CE QUE FERMER FERAIT PERDRE ══ — voir `useSortieParcours`. Ce qui a été repris de l'appelant
     ne compte pas : fermer sans y avoir touché ne perd rien. Une fois le mandat créé, il existe. */
  const initial = useRef({ signataireId, retenus: [...retenus].sort().join(',') })
  const entame = !mandatCreeId && (
    (etape !== 'compte' && !demande.compte)
    || signataireId !== initial.current.signataireId
    || [...retenus].sort().join(',') !== initial.current.retenus
    || dureeMois !== DUREE_DEFAUT
    || !avecEnergix
    || fichiersSignes.length > 0
    || dateSignature !== ''
  )
  const sortie = useSortieParcours({
    entame,
    bloque: etat.enCours || enregistrement.enCours,
    onFermer: () => {
      onFermer()
      if (mandatCreeId) navigate(`/mandats/${mandatCreeId}`)
    },
    titre: 'Fermer sans créer le mandat ?',
    lignes: [{ perdu: true, texte: 'Le signataire, le périmètre et la durée choisis seront perdus.' }],
    libelleFermer: 'Fermer sans créer',
  })

  const numero = (cle: CleEtape) => ETAPES.findIndex((e) => e.cle === cle) + 1
  const resumes: Record<string, ResumeEtape | undefined> = {
    compte: { lignes: nomCompte ? [nomCompte] : [] },
    signataire: { lignes: signataire ? [`${signataire.prenom} ${signataire.nom}`] : [] },
    perimetre: {
      lignes: retenus.length > 0 ? [`${retenus.length} compteur${retenus.length > 1 ? 's' : ''}`] : [],
    },
    mandat: { lignes: [`${dureeMois} mois`, avecEnergix ? 'KiWee et Energix' : 'KiWee seul'] },
    signature: {
      lignes: [
        ...(dateSignature ? [`Signé le ${dateFr(dateSignature)}`] : []),
        ...(fichiersSignes.length > 0 ? [`${fichiersSignes.length} fichier${fichiersSignes.length > 1 ? 's' : ''}`] : []),
      ],
    },
  }

  const piedEtape = (contenu: React.ReactNode) => (
    <div className="mt-auto flex items-center gap-3 border-t border-km-line-soft pt-4">{contenu}</div>
  )

  return (
    <FenetreParcours sortie={sortie}>
      <RailParcours
        titre={nomCompte ?? 'Nouveau mandat'}
        etapes={ETAPES}
        courante={etape}
        sousTitre={
          etape === 'compte' ? 'Pour quel client ?'
          : etape === 'signataire' ? 'Qui signe ?'
          : etape === 'perimetre' ? `${retenus.length} compteur${retenus.length > 1 ? 's' : ''} retenu${retenus.length > 1 ? 's' : ''}`
          : etape === 'signature' ? 'Le mandat d’un tiers, déjà signé'
          : 'Durée et mandats'
        }
        resumes={resumes}
        note={
          mandatCreeId
            ? { titre: 'Le mandat est créé', texte: 'La signature se relance depuis sa fiche si DocuSign ne s’est pas ouvert.' }
            : { titre: 'Rien n’est écrit avant « Préparer le mandat »', texte: 'DocuSign s’ouvre alors en brouillon : c’est vous qui cliquez « Envoyer ».' }
        }
        onFermer={sortie.demander}
      />

      <PanneauParcours>
        {/* LA CONNEXION DOCUSIGN SE VÉRIFIE D'ABORD : mieux vaut buter sur l'autorisation avant de
            remplir que juste avant d'envoyer. SAUF pour un compte qui peut apporter un mandat de
            tiers : celui-là s'enregistre sans DocuSign, la garde l'empêcherait pour rien. Le choix
            du compte, lui, n'est jamais bloqué — c'est lui qui dit de quel cas il s'agit. */}
        <GardeDocusign active={etape !== 'compte' && !peutEtreDeTiers}>
          {/* ════════ ÉTAPE 1 · LE COMPTE ════════ */}
          {etape === 'compte' && (
            <>
              <EnTeteEtape numero={numero('compte')} total={ETAPES.length} titre="Pour quel compte ?" />
              <ChoixParRecherche<Compte>
                items={comptesPossibles}
                valeur={compteId}
                onChoisir={choisirCompte}
                placeholder="Chercher un compte par son nom, son SIRET ou son SIREN…"
                principal={(c) => c.nom}
                secondaire={(c) => [c.ville, c.siret ? `SIRET ${c.siret}` : null].filter(Boolean).join(' · ') || null}
                filtre={(c, q) => c.nom.toLowerCase().includes(q) || (c.siret ?? '').includes(q) || (c.siren ?? '').includes(q)}
                totalLibelle={`${comptesPossibles.length} comptes`}
              />
              {piedEtape(
                <>
                  <span className="text-[11.5px] text-km-faint">Choisir le compte vous emmène à l’étape suivante.</span>
                  <span className="flex-1" />
                  <Button variant="ghost" onClick={sortie.demander}>Annuler</Button>
                </>,
              )}
            </>
          )}

          {/* ════════ ÉTAPE 2 · LE SIGNATAIRE ════════ */}
          {etape === 'signataire' && (
            <>
              <EnTeteEtape numero={numero('signataire')} total={ETAPES.length} titre="Qui signe le mandat ?" />
              {nomCompte && (
                <p className="mb-[12px] text-[13px] text-km-muted">
                  Un contact de <b className="font-semibold text-km-text">{nomCompte}</b>
                  {' · '}
                  <button type="button" onClick={() => setEtape('compte')} className="font-semibold text-km-green hover:underline">
                    changer de compte
                  </button>
                </p>
              )}
              {contactsDuCompte.length > 4 && (
                <div className="mb-[10px] flex items-center gap-2 rounded-[10px] border border-km-line bg-white px-[11px] py-[8px]">
                  <Search className="h-3.5 w-3.5 shrink-0 text-km-faint" />
                  <input
                    value={rechercheContact}
                    onChange={(e) => setRechercheContact(e.target.value)}
                    placeholder="Chercher un contact…"
                    className="flex-1 border-0 bg-transparent text-[13px] outline-none"
                  />
                </div>
              )}
              <div className="grid min-h-0 grid-cols-2 content-start gap-[9px] overflow-y-auto pr-1">
                {/* UN CHOIX UNIQUE, UN SEUL CLIC — William, 29/09/2026 : « c'est un choix unique donc le
                    clic doit faire passer à l'étape suivante ». « Continuer » ne reste que pour
                    valider un signataire déjà posé (repris de l'opportunité, ou seul du compte). */}
                {contactsAffiches.map((c) => (
                  <CarteSignataire
                    key={c.id}
                    contact={c}
                    choisi={c.id === signataireId}
                    onChoisir={() => { setSignataireId(c.id); setEtape('perimetre') }}
                  />
                ))}
                {compte && (
                  <button
                    type="button"
                    onClick={() => creerUnContact({ compte: { id: compte.id, nom: compte.nom }, onCree: (ct) => { setSignataireId(ct.id); setEtape('perimetre') } })}
                    className="flex min-h-[74px] items-center justify-center gap-2 rounded-[12px] border border-dashed border-km-line text-[12.5px] font-semibold text-km-muted transition-colors hover:border-km-green hover:text-km-green"
                  >
                    <UserPlus className="h-4 w-4" /> Créer un contact
                  </button>
                )}
              </div>
              {contactsDuCompte.length === 0 && (
                <p className="mt-[10px] text-[12px] text-km-muted">
                  Ce compte n’a encore aucun contact : un mandat doit être signé par quelqu’un.
                </p>
              )}
              {piedEtape(
                <>
                  {signataire && !signataire.email && (
                    <span className="flex items-center gap-1.5 text-[11.5px] font-semibold text-km-red">
                      <AlertTriangle className="h-3.5 w-3.5" /> Sans courriel, la signature ne partira pas
                    </span>
                  )}
                  <span className="flex-1" />
                  {!demande.compte && <Button variant="ghost" onClick={() => setEtape('compte')}>Précédent</Button>}
                  <Button disabled={!signataire} onClick={() => setEtape('perimetre')}>
                    Continuer <ArrowRight className="h-3.5 w-3.5" />
                  </Button>
                </>,
              )}
            </>
          )}

          {/* ════════ ÉTAPE 3 · LE PÉRIMÈTRE ════════ */}
          {etape === 'perimetre' && (
            <>
              <EnTeteEtape numero={numero('perimetre')} total={ETAPES.length} titre="Quels compteurs couvrir ?" />
              <div className="mb-[10px] flex flex-wrap items-center gap-[6px]">
                <div className="flex min-w-[220px] flex-1 items-center gap-2 rounded-[10px] border border-km-line bg-white px-[11px] py-[7px]">
                  <Search className="h-3.5 w-3.5 shrink-0 text-km-faint" />
                  <input
                    value={recherchePdl}
                    onChange={(e) => setRecherchePdl(e.target.value)}
                    placeholder="PDL, site, usage…"
                    className="w-full min-w-0 border-0 bg-transparent text-[13px] outline-none"
                  />
                </div>
                <Button type="button" variant="outline" size="sm" onClick={() => setRetenus((p) => [...new Set([...p, ...affiches.map((c) => c.id)])])}>
                  Tout
                </Button>
                <Button type="button" variant="ghost" size="sm" onClick={() => setRetenus([])}>Aucun</Button>
              </div>
              <div className="mb-[10px] flex flex-wrap items-center gap-[5px]">
                {(['electricite', 'gaz'] as const).map((e) => (
                  <Pastille key={e} actif={filtreEnergie === e} onClick={() => setFiltreEnergie((f) => (f === e ? null : e))}>
                    {e === 'gaz' ? 'Gaz' : 'Électricité'}
                  </Pastille>
                ))}
                <span className="mx-1 h-4 w-px bg-km-line" />
                {FILTRES_ECHEANCE.map(([cle, libelle]) => (
                  <Pastille
                    key={cle}
                    actif={filtresEcheance.includes(cle)}
                    onClick={() => setFiltresEcheance((l) => (l.includes(cle) ? l.filter((x) => x !== cle) : [...l, cle]))}
                  >
                    {libelle}
                  </Pastille>
                ))}
                <label className="ml-auto flex cursor-pointer items-center gap-1.5 text-[11.5px] text-km-muted">
                  <input type="checkbox" checked={montrerActifs} onChange={(e) => setMontrerActifs(e.target.checked)} className="accent-km-green" />
                  Afficher ceux déjà sous mandat actif
                </label>
              </div>
              <div className="flex min-h-0 flex-1 flex-col gap-[5px] overflow-y-auto pr-1">
                {affiches.map((c) => {
                  const coche = retenus.includes(c.id)
                  const b = bucketEcheance(c.date_echeance)
                  return (
                    <label
                      key={c.id}
                      className={cn(
                        'flex cursor-pointer items-center gap-[10px] rounded-[9px] border px-[11px] py-[8px] transition-colors',
                        coche ? 'border-km-green-line bg-km-green-tint' : 'border-km-line bg-white hover:bg-km-bg/60',
                      )}
                    >
                      <input
                        type="checkbox"
                        checked={coche}
                        onChange={() => setRetenus((p) => (coche ? p.filter((x) => x !== c.id) : [...p, c.id]))}
                        className="h-[15px] w-[15px] shrink-0 accent-km-green"
                      />
                      {c.type_energie === 'gaz'
                        ? <Flame className="h-[13px] w-[13px] shrink-0 text-km-muted" />
                        : <Zap className="h-[13px] w-[13px] shrink-0 text-km-muted" />}
                      <span className="font-mono text-[12.5px] tabular-nums text-km-text">{c.numero_pdl}</span>
                      <span className="min-w-0 flex-1 truncate text-[11.5px] text-km-muted">{c.site_nom}</span>
                      {sousMandatActif.has(c.id) && (
                        <span className="shrink-0 rounded-km-pill bg-km-soft px-[7px] py-[1px] text-[10px] font-semibold text-km-muted">sous mandat actif</span>
                      )}
                      {c.date_echeance && (
                        <span className={cn(
                          'shrink-0 font-mono text-[11px] tabular-nums',
                          b === 'expiree' ? 'font-bold text-km-red' : b === 'proche' ? 'font-bold text-amber-700' : 'text-km-faint',
                        )}>
                          {new Date(c.date_echeance).toLocaleDateString('fr-FR', { month: '2-digit', year: '2-digit' })}
                        </span>
                      )}
                    </label>
                  )
                })}
                {affiches.length === 0 && (
                  <p className="py-6 text-center text-[12.5px] text-km-faint">
                    {compteursDuCompte === undefined
                      ? 'Chargement des compteurs…'
                      : eligibles.length === 0
                        ? (compteursDuCompte.length === 0
                            ? 'Ce compte n’a encore aucun compteur.'
                            : 'Tous les compteurs de ce compte sont déjà couverts par un mandat actif.')
                        : 'Aucun compteur ne correspond aux filtres.'}
                  </p>
                )}
              </div>
              {piedEtape(
                <>
                  <span className="text-[11.5px] text-km-faint">
                    {retenus.length} retenu{retenus.length > 1 ? 's' : ''} sur {eligibles.length}
                  </span>
                  <span className="flex-1" />
                  <Button variant="ghost" onClick={() => setEtape('signataire')}>Précédent</Button>
                  <Button disabled={retenus.length === 0} onClick={() => setEtape('mandat')}>
                    Continuer <ArrowRight className="h-3.5 w-3.5" />
                  </Button>
                </>,
              )}
            </>
          )}

          {/* ════════ ÉTAPE 4 · LE MANDAT — celle de la conversion d'une piste ════════ */}
          {etape === 'mandat' && (
            <>
              <EnTeteEtape numero={numero('mandat')} total={ETAPES.length} titre="Le mandat à faire signer" />
              <div className="flex flex-col gap-[14px]">
                {signataire && (
                  <div className="flex items-center gap-[11px] rounded-[12px] border border-km-line bg-km-bg/40 p-[13px]">
                    <span className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-full bg-km-green text-[12px] font-bold text-white">
                      {`${signataire.prenom?.[0] ?? ''}${signataire.nom?.[0] ?? ''}`.toUpperCase()}
                    </span>
                    <div className="flex min-w-0 flex-1 flex-col gap-[2px]">
                      <span className="truncate text-[13.5px] font-semibold text-km-text">{signataire.prenom} {signataire.nom}</span>
                      <span className="truncate text-[11.5px] text-km-muted">
                        {retenus.length} compteur{retenus.length > 1 ? 's' : ''} · {nomCompte}
                      </span>
                      {!signataire.email && (
                        <span className="flex items-center gap-1 text-[11px] font-semibold text-km-red">
                          <AlertTriangle className="h-3 w-3" /> Sans courriel, la signature ne partira pas
                        </span>
                      )}
                    </div>
                    <button type="button" onClick={() => setEtape('signataire')} className="shrink-0 text-[11.5px] font-semibold text-km-green hover:underline">
                      Modifier
                    </button>
                  </div>
                )}
                <ChoixDureeMandats dureeMois={dureeMois} onDuree={setDureeMois} avecEnergix={avecEnergix} onEnergix={setAvecEnergix} />

                {etat.erreur && (
                  <div className="flex items-start gap-2 rounded-[10px] border border-km-red-line bg-km-red-soft px-[13px] py-[9px]">
                    <AlertTriangle className="mt-0.5 h-[14px] w-[14px] shrink-0 text-km-red" />
                    <div className="flex min-w-0 flex-col gap-1.5">
                      <span className="text-[12px] text-red-700">{etat.erreur}</span>
                      <div className="flex gap-2">
                        {etat.besoinConnexionDocusign && (
                          <button type="button" onClick={() => void connectDocusign()} className="rounded-[8px] bg-km-green px-[11px] py-[5px] text-[11.5px] font-semibold text-white">
                            Autoriser DocuSign
                          </button>
                        )}
                        {mandatCreeId && (
                          <button type="button" onClick={() => { onFermer(); navigate(`/mandats/${mandatCreeId}`) }} className="rounded-[8px] border border-km-line bg-white px-[11px] py-[5px] text-[11.5px] font-semibold text-km-green">
                            Ouvrir le mandat
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
              {piedEtape(
                <>
                  <span className="text-[11.5px] leading-tight text-km-faint">
                    DocuSign s’ouvre en brouillon.<br />C’est vous qui cliquez « Envoyer ».
                  </span>
                  <span className="flex-1" />
                  <Button variant="ghost" disabled={etat.enCours} onClick={() => setEtape('perimetre')}>Précédent</Button>
                  {peutEtreDeTiers && (
                    <Button
                      variant="outline"
                      disabled={!compte || !signataire || retenus.length === 0 || dureeMois <= 0 || etat.enCours || Boolean(mandatCreeId)}
                      onClick={() => { setModeTiers(true); setEtape('signature') }}
                    >
                      Enregistrer le mandat d’un tiers
                    </Button>
                  )}
                  <Button
                    disabled={!compte || !signataire || retenus.length === 0 || dureeMois <= 0 || etat.enCours || Boolean(mandatCreeId)}
                    onClick={preparer}
                  >
                    {etat.enCours
                      ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> {etat.etape ?? 'Préparation…'}</>
                      : 'Préparer le mandat'}
                  </Button>
                </>,
              )}
            </>
          )}
          {/* ════════ ÉTAPE 5 · LA SIGNATURE D'UN MANDAT DE TIERS ════════ */}
          {etape === 'signature' && (
            <>
              <EnTeteEtape numero={numero('signature')} total={ETAPES.length} titre="Le mandat signé" />
              <p className="mb-[14px] text-[13px] leading-snug text-km-muted">
                Le mandat a été signé en dehors de Kimatch : pas d’envoi DocuSign. Joignez le ou les
                fichiers signés et la date de signature — c’est elle qui ouvre la période du mandat.
              </p>
              <div className="flex flex-col gap-[14px]">
                <DepotFichiersSignes
                  fichiers={fichiersSignes}
                  onAjouter={(fs) => setFichiersSignes((p) => [...p, ...fs.filter((f) => !p.some((x) => x.name === f.name && x.size === f.size))])}
                  onRetirer={(f) => setFichiersSignes((p) => p.filter((x) => x !== f))}
                  onVoir={voirFichier}
                />
                <div className="grid grid-cols-2 gap-[13px]">
                  <label className="flex flex-col gap-[7px] rounded-[12px] border border-km-line bg-km-bg/40 p-[13px]">
                    <span className="text-[10.5px] font-bold uppercase tracking-[0.07em] text-km-faint">
                      Date de signature <span className="text-km-muted">*</span>
                    </span>
                    <input
                      type="date"
                      value={dateSignature}
                      max={aujourdhuiParis()}
                      onChange={(e) => setDateSignature(e.target.value)}
                      className="rounded-[9px] border border-km-line bg-white px-[11px] py-[7px] font-mono text-[13px] text-km-text outline-none focus:border-km-green"
                    />
                    {dateInvalide && <span className="text-[11px] font-semibold text-km-red">Une signature ne peut pas être dans le futur.</span>}
                  </label>
                  <div className="flex flex-col gap-[7px] rounded-[12px] border border-km-line bg-km-bg/40 p-[13px]">
                    <span className="text-[10.5px] font-bold uppercase tracking-[0.07em] text-km-faint">Période du mandat</span>
                    {dateSignature && finTiers && !dateInvalide ? (
                      <>
                        <span className="font-mono text-[13px] tabular-nums text-km-text">
                          {dateFr(dateSignature)} → {dateFr(finTiers)}
                        </span>
                        <span className={cn('text-[11px] font-semibold', statutTiers === 'ACTIF' ? 'text-km-green' : 'text-km-red')}>
                          {statutTiers === 'ACTIF' ? `Actif · ${dureeMois} mois` : 'Déjà échu : il sera enregistré « Expiré »'}
                        </span>
                      </>
                    ) : (
                      <span className="text-[11.5px] text-km-faint">Se calcule avec la date de signature et la durée ({dureeMois} mois).</span>
                    )}
                  </div>
                </div>
                {enregistrement.erreur && (
                  <div className="flex items-start gap-2 rounded-[10px] border border-km-red-line bg-km-red-soft px-[13px] py-[9px]">
                    <AlertTriangle className="mt-0.5 h-[14px] w-[14px] shrink-0 text-km-red" />
                    <span className="text-[12px] text-red-700">{enregistrement.erreur}</span>
                  </div>
                )}
              </div>
              {piedEtape(
                <>
                  <span className="text-[11.5px] leading-tight text-km-faint">
                    Enregistré directement signé,<br />sans passer par DocuSign.
                  </span>
                  <span className="flex-1" />
                  <Button variant="ghost" disabled={enregistrement.enCours || Boolean(mandatCreeId)} onClick={() => { setModeTiers(false); setEtape('mandat') }}>
                    Précédent
                  </Button>
                  <Button
                    disabled={fichiersSignes.length === 0 || !dateSignature || dateInvalide || enregistrement.enCours}
                    onClick={() => void enregistrerTiers()}
                  >
                    {enregistrement.enCours
                      ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Enregistrement…</>
                      : 'Enregistrer le mandat signé'}
                  </Button>
                </>,
              )}
            </>
          )}
        </GardeDocusign>
        {apercu && (
          <FenetreApercu document={{ id: 'mandat-signe-local', nom: apercu.nom, nom_fichier: apercu.nom, url: apercu.url }} onFermer={fermerApercu} />
        )}
      </PanneauParcours>
    </FenetreParcours>
  )
}

function CarteSignataire({ contact: c, choisi, onChoisir }: { contact: Contact; choisi: boolean; onChoisir: () => void }) {
  return (
    <button
      type="button"
      onClick={onChoisir}
      aria-pressed={choisi}
      className={cn(
        'flex min-h-[74px] items-start gap-[10px] rounded-[12px] border p-[12px] text-left transition-colors',
        choisi ? 'border-[1.5px] border-km-green bg-km-green-tint' : 'border-km-line bg-white hover:bg-km-bg/60',
      )}
    >
      <span className={cn(
        'flex h-[32px] w-[32px] shrink-0 items-center justify-center rounded-full text-[11.5px] font-bold',
        choisi ? 'bg-km-green text-white' : 'bg-km-soft text-km-muted',
      )}>
        {`${c.prenom?.[0] ?? ''}${c.nom?.[0] ?? ''}`.toUpperCase()}
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-[2px]">
        <span className="truncate text-[13px] font-semibold text-km-text">{c.prenom} {c.nom}</span>
        {c.fonction && <span className="truncate text-[11px] text-km-faint">{c.fonction}</span>}
        {c.email
          ? <span className="flex items-center gap-1 truncate text-[11px] text-km-muted"><Mail className="h-[10px] w-[10px] shrink-0" />{c.email}</span>
          : <span className="text-[11px] font-semibold text-km-red">Sans courriel — signature impossible</span>}
      </span>
    </button>
  )
}

function Pastille({ actif, onClick, children }: { actif: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={actif}
      className={cn(
        'rounded-km-pill border px-[10px] py-[3px] text-[11.5px] font-semibold transition-colors',
        actif ? 'border-km-green bg-km-green-tint text-km-green' : 'border-km-line bg-white text-km-muted hover:text-km-text',
      )}
    >
      {children}
    </button>
  )
}

/** ══ LES FICHIERS SIGNÉS ══ — une zone de dépôt qui accepte plusieurs fichiers, et leur liste. */
function DepotFichiersSignes({ fichiers, onAjouter, onRetirer, onVoir }: {
  fichiers: File[]
  onAjouter: (f: File[]) => void
  onRetirer: (f: File) => void
  onVoir: (f: File) => void
}) {
  const champ = useRef<HTMLInputElement>(null)
  const [survol, setSurvol] = useState(false)
  return (
    <div className="flex flex-col gap-[7px] rounded-[12px] border border-km-line bg-km-bg/40 p-[13px]">
      <span className="text-[10.5px] font-bold uppercase tracking-[0.07em] text-km-faint">
        Fichiers signés <span className="text-km-muted">*</span>
      </span>
      <button
        type="button"
        onClick={() => champ.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setSurvol(true) }}
        onDragLeave={() => setSurvol(false)}
        onDrop={(e) => {
          e.preventDefault()
          setSurvol(false)
          const fs = Array.from(e.dataTransfer.files ?? [])
          if (fs.length > 0) onAjouter(fs)
        }}
        className={cn(
          'flex min-h-[62px] flex-col items-center justify-center gap-[3px] rounded-[11px] border border-dashed px-3 py-2 text-center transition-colors',
          survol ? 'border-km-green bg-km-green-tint' : 'border-km-line bg-white hover:bg-km-bg',
        )}
      >
        <input
          ref={champ}
          type="file"
          accept=".pdf,image/*"
          multiple
          className="hidden"
          onChange={(e) => { const fs = Array.from(e.target.files ?? []); if (fs.length > 0) onAjouter(fs); e.target.value = '' }}
        />
        <Upload className="h-[15px] w-[15px] text-km-faint" />
        <span className="text-[11.5px] font-semibold text-km-muted">Déposer le ou les fichiers signés</span>
        <span className="text-[10.5px] text-km-faint">PDF ou photo — ils rejoignent les documents du mandat</span>
      </button>
      {fichiers.map((f) => (
        <div key={`${f.name}-${f.size}`} className="flex items-center gap-[9px] rounded-[9px] border border-km-green-line bg-km-green-tint px-[11px] py-[7px]">
          <FileText className="h-[13px] w-[13px] shrink-0 text-km-green" />
          <span className="min-w-0 flex-1 truncate text-[12.5px] font-semibold text-km-text">{f.name}</span>
          <button type="button" onClick={() => onVoir(f)} className="inline-flex items-center gap-1 text-[11px] font-semibold text-km-green hover:underline">
            <Eye className="h-[12px] w-[12px]" /> Voir
          </button>
          <button type="button" aria-label={`Retirer ${f.name}`} onClick={() => onRetirer(f)} className="text-km-muted hover:text-km-red">
            <X className="h-[13px] w-[13px]" />
          </button>
        </div>
      ))}
    </div>
  )
}

function GardeDocusign({ active, children }: { active: boolean; children: React.ReactNode }) {
  if (!active) return <>{children}</>
  return <WizardConnectionGate required={['crm', 'docusign']} feature="création de mandat">{children}</WizardConnectionGate>
}
