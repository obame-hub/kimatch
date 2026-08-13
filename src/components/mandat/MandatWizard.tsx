import { useEffect, useMemo, useState } from 'react'
import { Check, ChevronLeft, ChevronRight, Loader2, Mail, Phone, Search, UserPlus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useComptes } from '@/lib/data/comptes'
import { useSites } from '@/lib/data/sites'
import { useCompteurs } from '@/lib/data/compteurs'
import { useContacts } from '@/lib/data/contacts'
import { useMandats, useCreateMandat, useMarkMandatEnvoye } from '@/lib/data/mandats'
import { useReferenceTable } from '@/lib/data/referenceTables'
import { FALLBACK_TYPES_COURTIERS_MANDAT } from '@/lib/referenceFallbacks'
import { generateMandatKiweePdf, generateMandatEnergixPdf } from '@/lib/mandatPdf'
import { sendMandatForSignature } from '@/lib/data/docusign'
import { cn } from '@/lib/utils'
import type { Compteur } from '@/types/domain'

/**
 * Création d'un mandat — porté depuis `MandatWizard.tsx` de Tools (source fournie le 13/08/2026).
 *
 * Les quatre étapes, leur ordre et leurs libellés sont ceux de Tools (constante STEPS) :
 * Contact → Points de livraison → Durée → Type de mandat. Les durées proposées aussi
 * (DURATION_OPTIONS = 12/24/36/48, défaut 36).
 *
 * LE COMPORTEMENT ATTENDU, ET CE QUI CHANGE
 * Tools ne se contente pas de créer le mandat : il crée l'enveloppe DocuSign EN BROUILLON puis
 * ouvre l'éditeur (Sender View) pour que le commercial vérifie les champs et clique « Envoyer »
 * lui-même. Son commentaire le dit : « préparer l'enveloppe DocuSign et ouvrir l'éditeur (ne pas
 * envoyer directement) ». Kimatch faisait cela depuis la fiche mandat, mais la création s'arrêtait
 * au mandat : il fallait ensuite ouvrir la fiche et cliquer. Les deux temps sont désormais enchaînés.
 *
 * Le compte n'est pas demandé : le bouton part toujours d'une fiche compte.
 */

const ETAPES = [
  { libelle: 'Contact' },
  { libelle: 'Points de livraison' },
  { libelle: 'Durée' },
  { libelle: 'Type de mandat' },
] as const

/** Durées proposées, en mois — DURATION_OPTIONS de Tools. */
const DUREES = [12, 24, 36, 48] as const
const DUREE_DEFAUT = 36

type Echeance = 'expiree' | 'proche' | 'lointaine' | 'aucune'

/** Répartition par échéance, reprise de getEcheanceBucket de Tools. */
function bucketEcheance(iso: string | null | undefined): Echeance {
  if (!iso) return 'aucune'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return 'aucune'
  const jours = Math.floor((d.getTime() - Date.now()) / 86_400_000)
  if (jours < 0) return 'expiree'
  if (jours <= 180) return 'proche'
  return 'lointaine'
}

export function MandatWizard({
  compteId,
  onClose,
  onCree,
}: {
  compteId: string
  onClose: () => void
  /** Appelé après création, avant la redirection vers DocuSign. */
  onCree?: (mandatId: string) => void
}) {
  const { data: comptes } = useComptes()
  const { data: sites } = useSites()
  const { data: compteurs } = useCompteurs()
  const { data: contacts } = useContacts()
  const { data: mandatsExistants } = useMandats()
  const { data: courtiersRef } = useReferenceTable('types_courtiers_mandat')
  const courtiers = courtiersRef && courtiersRef.length > 0 ? courtiersRef : FALLBACK_TYPES_COURTIERS_MANDAT

  const createMandat = useCreateMandat()
  const markEnvoye = useMarkMandatEnvoye()

  const [etape, setEtape] = useState(1)
  const [contactId, setContactId] = useState('')
  const [compteurIds, setCompteurIds] = useState<string[]>([])
  const [dureeMois, setDureeMois] = useState<number>(DUREE_DEFAUT)
  const [avecEnergix, setAvecEnergix] = useState(true)
  const [rechercheContact, setRechercheContact] = useState('')
  const [recherchePdl, setRecherchePdl] = useState('')
  const [montrerActifs, setMontrerActifs] = useState(false)
  const [filtresEnergie, setFiltresEnergie] = useState<string[]>([])
  const [filtresEcheance, setFiltresEcheance] = useState<Echeance[]>([])
  const [enCours, setEnCours] = useState(false)
  const [etat, setEtat] = useState<string | null>(null)
  const [erreur, setErreur] = useState<string | null>(null)

  const compte = comptes?.find((c) => c.id === compteId)
  const sitesDuCompte = useMemo(() => sites?.filter((s) => s.compte_id === compteId) ?? [], [sites, compteId])

  // Le contact peut être rattaché au compte sans y être rattaché à titre principal : on lit
  // `comptes`, pas `compte_id` (reprise AccountContactRelation du 13/08/2026).
  const contactsDuCompte = useMemo(
    () => contacts?.filter((c) => c.comptes.some((l) => l.id === compteId)) ?? [],
    [contacts, compteId],
  )

  /**
   * PDL éligibles. Règle de Tools : on écarte ceux déjà couverts par un mandat ACTIF, sauf si
   * l'utilisateur demande à les voir (« Me montrer les points de livraison disposant d'un ACD
   * actif »). Sans ce filtre, on crée un second mandat sur un périmètre déjà couvert.
   */
  const compteursSousMandatActif = useMemo(
    () => new Set((mandatsExistants ?? []).filter((m) => m.statut === 'ACTIF').flatMap((m) => m.compteur_ids)),
    [mandatsExistants],
  )

  const compteursEligibles = useMemo(() => {
    const duCompte = compteurs?.filter((c) => sitesDuCompte.some((s) => s.id === c.site_id)) ?? []
    return duCompte.filter((c) => montrerActifs || !compteursSousMandatActif.has(c.id))
  }, [compteurs, sitesDuCompte, montrerActifs, compteursSousMandatActif])

  const compteursAffiches = useMemo(() => {
    let liste = compteursEligibles
    const q = recherchePdl.trim().toLowerCase()
    if (q) {
      liste = liste.filter((c) => {
        const site = sitesDuCompte.find((s) => s.id === c.site_id)
        return (
          c.numero_pdl.toLowerCase().includes(q) ||
          (c.utilisation ?? '').toLowerCase().includes(q) ||
          (site?.nom ?? '').toLowerCase().includes(q)
        )
      })
    }
    if (filtresEnergie.length > 0) liste = liste.filter((c) => filtresEnergie.includes(c.type_energie))
    if (filtresEcheance.length > 0) liste = liste.filter((c) => filtresEcheance.includes(bucketEcheance(c.date_echeance)))
    return liste
  }, [compteursEligibles, recherchePdl, sitesDuCompte, filtresEnergie, filtresEcheance])

  const contactsAffiches = useMemo(() => {
    const q = rechercheContact.trim().toLowerCase()
    if (!q) return contactsDuCompte
    return contactsDuCompte.filter((c) =>
      `${c.prenom} ${c.nom} ${c.fonction ?? ''} ${c.email ?? ''}`.toLowerCase().includes(q),
    )
  }, [contactsDuCompte, rechercheContact])

  const contactChoisi = contactsDuCompte.find((c) => c.id === contactId)

  // Un seul contact rattaché : le pré-sélectionner évite un clic sans choix réel.
  useEffect(() => {
    if (!contactId && contactsDuCompte.length === 1) setContactId(contactsDuCompte[0].id)
  }, [contactId, contactsDuCompte])

  const peutAvancer =
    (etape === 1 && !!contactId) ||
    (etape === 2 && compteurIds.length > 0) ||
    (etape === 3 && dureeMois > 0) ||
    etape === 4

  function basculerCompteur(id: string) {
    setCompteurIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }

  function basculerFiltre<T extends string>(valeur: T, liste: T[], set: (v: T[]) => void) {
    set(liste.includes(valeur) ? liste.filter((v) => v !== valeur) : [...liste, valeur])
  }

  /**
   * Crée le mandat, puis prépare l'enveloppe DocuSign en brouillon et ouvre l'éditeur.
   *
   * L'ordre importe et suit Tools : le mandat est enregistré AVANT DocuSign. Si la signature
   * échoue, le travail de saisie n'est pas perdu — le mandat existe, et la signature se relance
   * depuis sa fiche. L'inverse ferait disparaître le périmètre saisi à la moindre erreur DocuSign.
   */
  async function finaliser() {
    if (!compte || !contactChoisi) return
    setEnCours(true)
    setErreur(null)
    try {
      const compteursChoisis = compteursEligibles.filter((c) => compteurIds.includes(c.id))
      const codes = avecEnergix ? ['KIWI', 'ENERGIX'] : ['KIWI']

      setEtat('Création du mandat…')
      const resultat = await createMandat.mutateAsync({
        compte_id: compte.id,
        compte_nom: compte.nom,
        compteur_ids: compteurIds,
        compteurs: compteursChoisis.map((c) => ({ id: c.id, site_id: c.site_id })),
        date_signature: null,
        duree_mois: dureeMois,
        contact_signataire_id: contactChoisi.id,
        contact_signataire_nom: `${contactChoisi.prenom} ${contactChoisi.nom}`,
        courtier_codes: codes,
        courtier_type_ids: courtiers.filter((c) => codes.includes(c.code)).map((c) => c.id),
      })

      onCree?.(resultat.mandat.id)

      if (!resultat.persisted) {
        setErreur('Mandat enregistré localement seulement — la signature ne peut pas être lancée.')
        return
      }
      if (!contactChoisi.email) {
        setErreur(
          `Mandat créé, mais ${contactChoisi.prenom} ${contactChoisi.nom} n'a pas d'adresse e-mail : ajoutez-la puis lancez la signature depuis la fiche du mandat.`,
        )
        return
      }

      setEtat('Génération des documents…')
      const documents = [
        await generateMandatKiweePdf({ compte, contact: contactChoisi, compteurs: compteursChoisis, dureeMois }),
      ]
      if (avecEnergix) {
        documents.push(
          await generateMandatEnergixPdf({ compte, contact: contactChoisi, compteurs: compteursChoisis, dureeMois }),
        )
      }

      setEtat('Préparation de DocuSign…')
      const envoi = await sendMandatForSignature({
        mandatId: resultat.mandat.id,
        documents,
        signerEmail: contactChoisi.email,
        signerName: `${contactChoisi.prenom} ${contactChoisi.nom}`,
        emailSubject: `KiWee Énergie — Mandat à signer (${compte.nom})`,
        // Brouillon : c'est ce qui produit l'éditeur au lieu d'un envoi immédiat.
        draft: true,
        returnUrl: `${window.location.origin}/mandats/${resultat.mandat.id}`,
      })

      // Le statut reste inchangé : c'est le webhook DocuSign qui fera passer le mandat à ENVOYE
      // quand un humain aura réellement cliqué « Envoyer » dans l'éditeur.
      await markEnvoye.mutateAsync({ mandatId: resultat.mandat.id, envelopeId: envoi.envelopeId, statutId: null })

      if (envoi.senderViewUrl) {
        setEtat('Ouverture de l’éditeur DocuSign…')
        window.location.href = envoi.senderViewUrl
        return
      }
      setErreur('Enveloppe créée, mais DocuSign n’a pas renvoyé d’URL d’éditeur. Relancez depuis la fiche du mandat.')
    } catch (e) {
      // Le mandat peut exister malgré l'échec : on le dit, plutôt que de laisser croire à une
      // création manquée qui pousserait à recommencer et à créer un doublon.
      setErreur(
        `${e instanceof Error ? e.message : 'Erreur inconnue'} — si le mandat a été créé, relancez la signature depuis sa fiche plutôt que de recommencer.`,
      )
    } finally {
      setEnCours(false)
      setEtat(null)
    }
  }

  return (
    <div className="flex flex-col gap-5">
      {/*
        Rail des étapes, comme Tools : numéro, libellé, et un trait qui les relie.

        Les libellés des étapes NON courantes disparaissent en dessous de 640px. Les quatre au
        complet demandent environ 520px, ce qui débordait du dialogue et sortait la première étape
        de l'écran derrière une barre de défilement — l'utilisateur ne voyait plus où il en était.
        Le numéro suffit à se repérer, et le libellé de l'étape en cours reste toujours affiché.
      */}
      <div className="flex flex-wrap items-center justify-center gap-y-2">
        {ETAPES.map((e, i) => {
          const numero = i + 1
          const faite = numero < etape
          const courante = numero === etape
          return (
            <div key={e.libelle} className="flex items-center gap-1">
              <button
                type="button"
                // On ne saute pas en avant : les étapes suivantes dépendent des choix faits avant.
                disabled={numero > etape || enCours}
                onClick={() => setEtape(numero)}
                className="flex items-center gap-2 disabled:cursor-default"
              >
                <span
                  className={cn(
                    'flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-bold transition-colors',
                    faite && 'bg-kiwi-600 text-white',
                    courante && 'bg-kiwi-600 text-white ring-4 ring-kiwi-600/20',
                    !faite && !courante && 'bg-navy-100 text-navy-400',
                  )}
                >
                  {faite ? <Check className="h-3.5 w-3.5" /> : numero}
                </span>
                <span
                  className={cn(
                    'whitespace-nowrap text-xs font-semibold',
                    courante ? 'text-navy-800' : 'hidden text-navy-400 sm:inline',
                  )}
                >
                  {e.libelle}
                </span>
              </button>
              {numero < ETAPES.length && <span className="mx-1.5 h-px w-4 bg-navy-100 sm:w-8" />}
            </div>
          )
        })}
      </div>

      <div className="text-center text-xs text-navy-500">
        Compte : <span className="font-bold text-navy-800">{compte?.nom ?? '—'}</span>
      </div>

      {/* ── Étape 1 · Contact ─────────────────────────────────────────────────────────────── */}
      {etape === 1 && (
        <div className="flex flex-col gap-3">
          <div className="text-center">
            <p className="text-base font-bold text-navy-800">Qui est le signataire ?</p>
            <p className="text-xs text-navy-400">Sélectionnez le contact lié au compte</p>
          </div>

          {contactsDuCompte.length > 4 && (
            <div className="flex items-center gap-2 rounded-lg border border-navy-200 px-3 py-2">
              <Search className="h-3.5 w-3.5 shrink-0 text-navy-400" />
              <input
                value={rechercheContact}
                onChange={(e) => setRechercheContact(e.target.value)}
                placeholder="Rechercher un contact…"
                className="flex-1 border-0 bg-transparent text-xs outline-none"
              />
            </div>
          )}

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {contactsAffiches.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setContactId(c.id)}
                className={cn(
                  'flex items-start gap-2.5 rounded-xl border p-3 text-left transition-colors',
                  contactId === c.id
                    ? 'border-kiwi-600 bg-kiwi-50 ring-1 ring-kiwi-600'
                    : 'border-navy-100 bg-white hover:bg-navy-50/60',
                )}
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-navy-100 text-[11px] font-bold text-navy-600">
                  {`${c.prenom?.[0] ?? ''}${c.nom?.[0] ?? ''}`.toUpperCase()}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-bold text-navy-800">
                    {c.prenom} {c.nom}
                  </span>
                  {c.fonction && <span className="block truncate text-[11px] text-navy-400">{c.fonction}</span>}
                  {c.email && (
                    <span className="mt-1 flex items-center gap-1 truncate text-[10.5px] text-navy-500">
                      <Mail className="h-2.5 w-2.5 shrink-0" /> {c.email}
                    </span>
                  )}
                  {c.telephone && (
                    <span className="flex items-center gap-1 truncate text-[10.5px] text-navy-500">
                      <Phone className="h-2.5 w-2.5 shrink-0" /> {c.telephone}
                    </span>
                  )}
                  {!c.email && (
                    <span className="mt-1 block text-[10.5px] font-semibold text-amber-700">
                      Sans e-mail — signature impossible
                    </span>
                  )}
                </span>
              </button>
            ))}
          </div>

          {contactsDuCompte.length === 0 && (
            <div className="rounded-xl border border-dashed border-amber-300 bg-amber-50 p-4 text-center">
              <p className="text-xs font-semibold text-amber-800">Aucun contact sur ce compte</p>
              <p className="mt-1 text-[11px] text-amber-700">
                Un mandat doit être signé par quelqu’un : créez d’abord un contact.
              </p>
            </div>
          )}

          {contactsDuCompte.length > 0 && (
            <button
              type="button"
              onClick={onClose}
              className="flex items-center justify-center gap-1.5 rounded-lg border border-dashed border-navy-200 py-2.5 text-xs font-semibold text-navy-500 transition-colors hover:bg-navy-50"
            >
              <UserPlus className="h-3.5 w-3.5" /> Créer un nouveau contact
            </button>
          )}
        </div>
      )}

      {/* ── Étape 2 · Points de livraison ─────────────────────────────────────────────────── */}
      {etape === 2 && (
        <div className="flex flex-col gap-3">
          <div className="text-center">
            <p className="text-base font-bold text-navy-800">Quels points de livraison ?</p>
            <p className="text-xs text-navy-400">
              {compteurIds.length} sélectionné{compteurIds.length > 1 ? 's' : ''} sur {compteursAffiches.length} affiché
              {compteursAffiches.length > 1 ? 's' : ''}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <div className="flex flex-1 items-center gap-2 rounded-lg border border-navy-200 px-3 py-2">
              <Search className="h-3.5 w-3.5 shrink-0 text-navy-400" />
              <input
                value={recherchePdl}
                onChange={(e) => setRecherchePdl(e.target.value)}
                placeholder="PDL, libellé, site…"
                className="w-full min-w-0 border-0 bg-transparent text-xs outline-none"
              />
            </div>
            <Button type="button" variant="outline" size="sm" onClick={() => setCompteurIds(compteursAffiches.map((c) => c.id))}>
              Tout
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => setCompteurIds([])}>
              Aucun
            </Button>
          </div>

          <div className="flex flex-wrap gap-1.5">
            {(['electricite', 'gaz'] as const).map((e) => (
              <button
                key={e}
                type="button"
                onClick={() => basculerFiltre(e, filtresEnergie, setFiltresEnergie)}
                className={cn(
                  'rounded-lg border px-2.5 py-1 text-[11px] font-semibold transition-colors',
                  filtresEnergie.includes(e)
                    ? 'border-navy-800 bg-navy-800 text-white'
                    : 'border-navy-200 bg-white text-navy-500',
                )}
              >
                {e === 'electricite' ? 'Électricité' : 'Gaz'}
              </button>
            ))}
            {(
              [
                ['expiree', 'Échéance passée'],
                ['proche', '< 6 mois'],
                ['lointaine', '> 6 mois'],
                ['aucune', 'Sans échéance'],
              ] as const
            ).map(([cle, libelle]) => (
              <button
                key={cle}
                type="button"
                onClick={() => basculerFiltre(cle, filtresEcheance, setFiltresEcheance)}
                className={cn(
                  'rounded-lg border px-2.5 py-1 text-[11px] font-semibold transition-colors',
                  filtresEcheance.includes(cle)
                    ? 'border-navy-800 bg-navy-800 text-white'
                    : 'border-navy-200 bg-white text-navy-500',
                )}
              >
                {libelle}
              </button>
            ))}
            <label className="ml-auto flex cursor-pointer items-center gap-1.5 text-[11px] text-navy-500">
              <input type="checkbox" checked={montrerActifs} onChange={(e) => setMontrerActifs(e.target.checked)} />
              Afficher ceux déjà sous mandat actif
            </label>
          </div>

          <div className="max-h-[320px] overflow-y-auto rounded-xl border border-navy-100">
            {compteursAffiches.map((c) => {
              const site = sitesDuCompte.find((s) => s.id === c.site_id)
              const bucket = bucketEcheance(c.date_echeance)
              return (
                <label
                  key={c.id}
                  className="flex cursor-pointer items-center gap-3 border-b border-navy-50 px-3 py-2.5 last:border-b-0 hover:bg-navy-50/60"
                >
                  <input
                    type="checkbox"
                    checked={compteurIds.includes(c.id)}
                    onChange={() => basculerCompteur(c.id)}
                    className="shrink-0"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs font-semibold text-navy-800">
                      {c.utilisation || site?.nom || 'Compteur'}
                    </span>
                    <span className="block truncate font-mono text-[10.5px] text-navy-400">{c.numero_pdl}</span>
                  </span>
                  <span className="shrink-0 rounded bg-navy-50 px-1.5 py-0.5 text-[10px] font-semibold text-navy-500">
                    {c.type_energie === 'gaz' ? 'Gaz' : 'Élec'}
                  </span>
                  {c.date_echeance && (
                    <span
                      className={cn(
                        'shrink-0 font-mono text-[10px] font-bold',
                        bucket === 'expiree' && 'text-red-600',
                        bucket === 'proche' && 'text-amber-700',
                        bucket === 'lointaine' && 'text-navy-400',
                      )}
                    >
                      {new Date(c.date_echeance).toLocaleDateString('fr-FR', { month: '2-digit', year: '2-digit' })}
                    </span>
                  )}
                </label>
              )
            })}
            {compteursAffiches.length === 0 && (
              <p className="p-4 text-center text-xs text-navy-400">
                {compteursEligibles.length === 0
                  ? 'Tous les points de livraison de ce compte sont déjà couverts par un mandat actif.'
                  : 'Aucun point de livraison ne correspond aux filtres.'}
              </p>
            )}
          </div>
        </div>
      )}

      {/* ── Étape 3 · Durée ───────────────────────────────────────────────────────────────── */}
      {etape === 3 && (
        <div className="flex flex-col gap-3">
          <div className="text-center">
            <p className="text-base font-bold text-navy-800">Quelle durée ?</p>
            <p className="text-xs text-navy-400">Durée de validité du mandat</p>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {DUREES.map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setDureeMois(d)}
                className={cn(
                  'flex flex-col items-center gap-0.5 rounded-xl border py-4 transition-colors',
                  dureeMois === d
                    ? 'border-kiwi-600 bg-kiwi-50 ring-1 ring-kiwi-600'
                    : 'border-navy-100 bg-white hover:bg-navy-50/60',
                )}
              >
                <span className="font-mono text-xl font-bold text-navy-800">{d}</span>
                <span className="text-[11px] text-navy-400">mois</span>
                {d === DUREE_DEFAUT && <span className="text-[9.5px] font-bold uppercase text-kiwi-700">habituel</span>}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Étape 4 · Type de mandat ──────────────────────────────────────────────────────── */}
      {etape === 4 && (
        <div className="flex flex-col gap-3">
          <div className="text-center">
            <p className="text-base font-bold text-navy-800">Quel type de mandat ?</p>
            <p className="text-xs text-navy-400">Le mandat KiWee est toujours inclus</p>
          </div>

          <div className="flex flex-col gap-2">
            {/* KiWee non désactivable, comme dans Tools où mandatKiwee est codé à true. */}
            <div className="flex items-center gap-3 rounded-xl border border-kiwi-200 bg-kiwi-50 p-3">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-kiwi-600 text-white">
                <Check className="h-3 w-3" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-bold text-navy-800">Mandat KiWee</span>
                <span className="block text-[11px] text-navy-500">Toujours inclus</span>
              </span>
            </div>

            <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-navy-100 bg-white p-3 hover:bg-navy-50/60">
              <input
                type="checkbox"
                checked={avecEnergix}
                onChange={(e) => setAvecEnergix(e.target.checked)}
                className="h-4 w-4 shrink-0"
              />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-bold text-navy-800">Mandat Energix</span>
                <span className="block text-[11px] text-navy-500">Second document, signé en même temps</span>
              </span>
            </label>
          </div>

          <div className="rounded-xl border border-navy-100 bg-navy-50/60 p-3 text-xs text-navy-600">
            <p className="mb-1.5 font-bold text-navy-800">Récapitulatif</p>
            <p>
              Signataire : <span className="font-semibold">{contactChoisi ? `${contactChoisi.prenom} ${contactChoisi.nom}` : '—'}</span>
            </p>
            <p>
              Périmètre : <span className="font-semibold">{compteurIds.length} point{compteurIds.length > 1 ? 's' : ''} de livraison</span>
            </p>
            <p>
              Durée : <span className="font-semibold">{dureeMois} mois</span>
            </p>
            <p className="mt-2 text-[11px] text-navy-500">
              À la validation, le mandat est créé puis l’éditeur DocuSign s’ouvre : vous vérifiez les
              champs et cliquez sur « Envoyer » vous-même.
            </p>
          </div>
        </div>
      )}

      {etat && (
        <p className="flex items-center justify-center gap-2 text-xs font-semibold text-kiwi-700">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> {etat}
        </p>
      )}
      {erreur && <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{erreur}</p>}

      <div className="flex items-center justify-between gap-2 border-t border-navy-100 pt-3">
        <Button
          type="button"
          variant="ghost"
          disabled={etape === 1 || enCours}
          onClick={() => setEtape((e) => e - 1)}
        >
          <ChevronLeft className="h-4 w-4" /> Précédent
        </Button>

        {etape < ETAPES.length ? (
          <Button type="button" disabled={!peutAvancer || enCours} onClick={() => setEtape((e) => e + 1)}>
            Suivant <ChevronRight className="h-4 w-4" />
          </Button>
        ) : (
          <Button type="button" disabled={enCours || !contactChoisi} onClick={finaliser}>
            {enCours ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Créer et ouvrir DocuSign
          </Button>
        )}
      </div>
    </div>
  )
}

export type { Compteur }
