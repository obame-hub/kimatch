import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ArrowRight, Check, Loader2, Search, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { WizardConnectionGate } from '@/components/ui/connection-gate'
import { CreationCompteurDialog } from '@/components/compteur/CreationCompteurDialog'
import { MandatEnUnePage } from '@/components/mandat/MandatEnUnePage'
import { optionsCivilite } from '@/lib/civilite'
import { searchCompanies, type CompanyResult } from '@/lib/companyDirectory'
import { useComptes } from '@/lib/data/comptes'
import { useSites } from '@/lib/data/sites'
import {
  chercherCompteParSiren,
  useCreerOpportuniteDepuisPiste,
  useEtablirCompte,
  useEtablirContact,
  type IdentiteLegale,
} from '@/lib/data/conversionPiste'
import { cn } from '@/lib/utils'
import type { Piste } from '@/types/domain'

/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * CONVERTIR UNE PISTE — LE PARCOURS COMPLET
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * William, 23/09/2026, en six points : le SIREN décide du compte ; le contact s'en déduit ; il faut
 * obligatoirement un périmètre ; l'opportunité naît des compteurs ; le mandat s'enchaîne ; et
 * « le process de conversion se termine une fois que le mandat est envoyé ».
 *
 * ══ UNE FENÊTRE, ET NON UN ÉCRAN ══
 *
 * William, 23/09/2026, après avoir vu les trois maquettes : « il faudrait que ce soit en mode pop-up
 * et non pas en full screen — ça donne plus l'impression qu'un process se lance et non pas un
 * changement de page complet. »
 *
 * C'EST UNE DÉCISION DE SENS, PAS DE DÉCORATION. La fiche piste reste visible tout autour, donc on
 * sait qu'on y reviendra, et la conversion se lit comme quelque chose qu'on a DÉCLENCHÉ depuis
 * cette fiche. Un plein écran raconte l'inverse : on a quitté la fiche, et on ne sait plus si elle
 * existe encore.
 *
 * ══ LE RAIL SE SOUVIENT ══
 *
 * La colonne anthracite ne porte pas que les quatre étapes : sous chacune qui est faite, elle porte
 * CE QU'ELLE A PRODUIT — le compte, le contact, les numéros de PDL, la référence de l'opportunité.
 * Quatre écritures partent pendant ce parcours sans que rien ne soit demandé ; les montrer est la
 * seule façon de ne pas les faire dans le dos de celui qui les signe.
 *
 * ══ LES ÉCRANS SONT RÉEMPLOYÉS, PAS RECOPIÉS ══
 *
 * L'étape « périmètre » EST `CreationCompteurDialog` (rendu sans sa propre fenêtre, dans le panneau
 * de droite) et l'étape « mandat » EST `MandatWizard`. Deux écrans de saisie de PDL en parallèle
 * finiraient par diverger sur l'éligibilité fournisseur, et c'est la cotation qui paierait l'écart.
 *
 * ══ CE QUI SE PASSE SI L'ON S'ARRÊTE EN COURS DE ROUTE ══
 *
 * William : « sans compteurs et donc sans opportunité. Si le commercial veut reprendre, il créera
 * les compteurs depuis le compte et lancera l'opportunité ultérieurement. » Le compte et le contact
 * déjà créés restent — ils sont justes — mais LA PISTE NE BASCULE PAS. Elle reste ouverte, dans le
 * plan du jour, avec sa tâche.
 */

const ETAPES = [
  { cle: 'identite', libelle: 'Société & contact' },
  { cle: 'perimetre', libelle: 'Périmètre' },
  { cle: 'opportunite', libelle: 'Opportunité' },
  { cle: 'mandat', libelle: 'Mandat' },
] as const

type CleEtape = (typeof ETAPES)[number]['cle']

/* ══════════════════════════════════════════════════════════════════════════════════════════════
   LA FENÊTRE
   ══════════════════════════════════════════════════════════════════════════════════════════════
   Elle ne passe pas par `Dialog` : celui-ci impose un titre, une description et un fond blanc sur
   toute sa surface, alors qu'ici la moitié gauche est anthracite et que l'en-tête vit DANS le rail.
   Le reste — le portail, le voile, la touche Échap, le compteur de fenêtres ouvertes — est repris
   à l'identique, parce que ce sont eux qui font qu'une fenêtre se comporte comme les autres.

   LE PORTAIL N'EST PAS UN DÉTAIL : un `position: fixed` se place par rapport au viewport SAUF si un
   ancêtre porte une transformation, et l'application en est pleine ne serait-ce que par ses
   animations d'apparition. Sans portail, le voile ne couvre que la boîte de cet ancêtre.
*/
function FenetreParcours({ onFermer, children }: { onFermer: () => void; children: ReactNode }) {
  useEffect(() => {
    const auClavier = (e: KeyboardEvent) => e.key === 'Escape' && onFermer()
    window.addEventListener('keydown', auClavier)
    return () => window.removeEventListener('keydown', auClavier)
  }, [onFermer])

  /* Les pastilles flottantes (appel, notifications) se retirent quand le document porte cette
     marque. Un compteur et non un booléen : la confirmation de sortie s'ouvre par-dessus celle-ci. */
  useEffect(() => {
    const n = Number(document.body.dataset.modalesOuvertes ?? '0') + 1
    document.body.dataset.modalesOuvertes = String(n)
    return () => {
      const reste = Number(document.body.dataset.modalesOuvertes ?? '1') - 1
      if (reste > 0) document.body.dataset.modalesOuvertes = String(reste)
      else delete document.body.dataset.modalesOuvertes
    }
  }, [])

  return createPortal(
    <div
      className="animate-km-fade fixed inset-0 z-50 flex items-center justify-center bg-[rgba(10,14,12,0.62)] p-4 backdrop-blur-[3px]"
      onClick={(e) => { if (e.target === e.currentTarget) onFermer() }}
    >
      <div className="animate-fade-up flex h-[740px] max-h-[calc(100vh-2.5rem)] w-[1000px] max-w-[calc(100vw-2rem)] overflow-hidden rounded-[20px] bg-white shadow-[0_32px_80px_rgba(6,10,8,0.44),0_3px_14px_rgba(6,10,8,0.26)]">
        {children}
      </div>
    </div>,
    document.body,
  )
}

/* ══════════════════════════════════════════════════════════════════════════════════════════════
   LE RAIL
   ══════════════════════════════════════════════════════════════════════════════════════════════ */

/** Ce qu'une étape faite a produit, tel que le rail le rappelle. */
interface Resume { lignes: string[]; mono?: boolean }

/*
  ══ DEUX GRIS DU DESSIN ONT ÉTÉ ÉCLAIRCIS, ET C'EST MESURÉ ══

  La maquette posait les étapes à venir en #6E7A73 sur l'anthracite : 3,8:1, sous les 4,5 exigés
  pour du petit texte. C'est exactement le défaut relevé deux fois déjà dans `index.css` — un gris
  juste sur du blanc cesse de l'être sur du sombre. `km-side-faint` (#86918B) donne 5,2:1 et garde
  la même teinte. Ce qui distingue une étape à venir d'une étape faite reste l'anneau creux et la
  graisse, pas un gris qu'on ne peut pas lire.
*/
const GRIS_A_VENIR = 'text-km-side-faint'

function Pastille({ etat, numero }: { etat: 'faite' | 'courante' | 'avenir'; numero: number }) {
  if (etat === 'faite') {
    return (
      <span className="flex h-[21px] w-[21px] shrink-0 items-center justify-center rounded-full bg-km-side-green">
        <Check className="h-[11px] w-[11px] stroke-[3.4] text-[#10231D]" />
      </span>
    )
  }
  if (etat === 'courante') {
    return (
      <span className="flex h-[21px] w-[21px] shrink-0 items-center justify-center rounded-full bg-km-side-green text-[10.5px] font-bold text-[#10231D]">
        {numero}
      </span>
    )
  }
  return (
    <span className={cn(
      'flex h-[21px] w-[21px] shrink-0 items-center justify-center rounded-full border-[1.5px] border-[#3C453F] text-[10.5px] font-bold',
      GRIS_A_VENIR,
    )}>
      {numero}
    </span>
  )
}

function RailParcours({ titre, reference, courante, sousTitre, resumes, note, onFermer }: {
  titre: string
  reference: string | null
  courante: CleEtape
  /** La ligne sous l'étape en cours — « En cours », « 2 compteurs saisis »… */
  sousTitre?: string
  /** Ce que chaque étape déjà faite a produit. */
  resumes: Partial<Record<CleEtape, Resume>>
  note: { titre: string; texte: string }
  onFermer: () => void
}) {
  const index = ETAPES.findIndex((e) => e.cle === courante)

  return (
    <div className="flex w-[280px] shrink-0 flex-col gap-[22px] bg-km-side-bas px-[22px] py-[26px]">

      <div className="flex items-start gap-[10px]">
        <div className="flex min-w-0 flex-1 flex-col gap-[5px]">
          <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-km-side-faint">Conversion</span>
          <span className="text-[18px] font-semibold leading-[1.25] text-white">{titre}</span>
          {reference && <span className="font-mono text-[10.5px] text-km-side-faint">{reference}</span>}
        </div>
        {/* UNE FENÊTRE SE FERME, UNE PAGE NON. Le geste doit exister, et c'est lui qui déclenche
            l'écran « ce qui est créé reste ». */}
        <button
          type="button"
          aria-label="Fermer"
          onClick={onFermer}
          className="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-[8px] bg-[#2A322D] text-[#9EABA4] transition-colors hover:text-white"
        >
          <X className="h-[13px] w-[13px] stroke-[2.4]" />
        </button>
      </div>

      <div className="h-px bg-km-side-line" />

      <div className="flex flex-1 flex-col gap-[3px]">
        {ETAPES.map((e, i) => {
          const etat = i < index ? 'faite' : i === index ? 'courante' : 'avenir'
          /* LE RÉCAPITULATIF S'AFFICHE AUSSI SUR L'ÉTAPE EN COURS, et c'est nécessaire depuis que
             le formulaire du périmètre repart à zéro à chaque compteur : sans lui, les compteurs
             déjà enregistrés n'apparaîtraient nulle part, et on croirait les avoir perdus. */
          const resume = etat === 'avenir' ? undefined : resumes[e.cle]
          const automatique = e.cle === 'opportunite' && etat === 'avenir'

          return (
            <div
              key={e.cle}
              className={cn(
                'flex gap-[11px] px-[11px] py-[10px]',
                etat === 'courante' && 'rounded-[11px] bg-[#2A322D]',
              )}
            >
              <Pastille etat={etat} numero={i + 1} />
              <div className="flex min-w-0 flex-col gap-[6px]">
                <span className={cn(
                  'text-[12.5px]',
                  etat === 'courante' ? 'font-semibold text-white' : 'font-medium',
                  etat === 'faite' && 'text-[#9EABA4]',
                  etat === 'avenir' && GRIS_A_VENIR,
                )}>
                  {e.libelle}
                </span>

                {etat === 'courante' && sousTitre && (
                  <span className="text-[10.5px] text-[#9EABA4]">{sousTitre}</span>
                )}
                {automatique && <span className={cn('text-[10px]', GRIS_A_VENIR)}>Automatique</span>}

                {resume && resume.lignes.length > 0 && (
                  <div className="flex flex-col gap-[3px] border-l-2 border-km-side-line pl-[9px]">
                    {resume.lignes.map((l) => (
                      <span
                        key={l}
                        className={cn(
                          'leading-[1.35] text-[#D8DFDA]',
                          resume.mono ? 'font-mono text-[10.5px]' : 'text-[11px]',
                        )}
                      >
                        {l}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>

      <div className="flex flex-col gap-[5px] rounded-[12px] border border-km-side-line bg-km-side px-[13px] py-[12px]">
        <span className="text-[10.5px] font-semibold text-[#D8DFDA]">{note.titre}</span>
        <span className="text-[10.5px] leading-[1.45] text-km-side-faint">{note.texte}</span>
      </div>
    </div>
  )
}

/* ══════════════════════════════════════════════════════════════════════════════════════════════
   LE PANNEAU DE DROITE — l'en-tête commun aux quatre écrans
   ══════════════════════════════════════════════════════════════════════════════════════════════ */
function EnTeteEtape({ numero, titre }: { numero: number; titre: string }) {
  return (
    <div className="mb-[22px] flex flex-col gap-[5px]">
      <span className="text-[10.5px] font-bold uppercase tracking-[0.12em] text-km-green">
        Étape {numero} sur 4
      </span>
      <h1 className="text-[26px] font-semibold tracking-[-0.017em] text-km-text">{titre}</h1>
    </div>
  )
}

/** Un champ du formulaire d'identité : intitulé au-dessus, saisie en dessous. */
function Champ({ pour, intitule, complement, children, className }: {
  pour?: string
  intitule: string
  complement?: string
  children: ReactNode
  className?: string
}) {
  return (
    <div className={cn('flex min-w-0 flex-col gap-[7px]', className)}>
      <label htmlFor={pour} className="text-[11.5px] font-semibold text-km-muted">
        {intitule}
        {complement && <span className="font-normal text-km-faint"> — {complement}</span>}
      </label>
      {children}
    </div>
  )
}

const SAISIE = 'w-full rounded-[10px] border border-km-line bg-white px-[13px] py-[10px] text-[13.5px] text-km-text outline-none transition-shadow focus:border-km-green focus:shadow-[0_0_0_3px_rgba(13,122,95,.12)]'
const SAISIE_MONO = 'w-full rounded-[10px] border border-km-line bg-white px-[13px] py-[10px] font-mono text-[12.5px] text-km-text outline-none transition-shadow focus:border-km-green focus:shadow-[0_0_0_3px_rgba(13,122,95,.12)]'

/** Le sélecteur à segments : deux ou trois choix, visibles sans rien ouvrir. */
function Segments<T extends string>({ valeur, options, onChoisir }: {
  valeur: T
  options: { valeur: T; libelle: string }[]
  onChoisir: (v: T) => void
}) {
  return (
    <div className="flex gap-[3px] rounded-[10px] border border-km-line bg-km-soft p-[3px]">
      {options.map((o) => (
        <button
          key={o.valeur}
          type="button"
          onClick={() => onChoisir(o.valeur)}
          className={cn(
            'rounded-[7px] px-[14px] py-[7px] text-[12.5px] transition-colors',
            valeur === o.valeur
              ? 'bg-white font-semibold text-km-text shadow-[0_1px_2px_rgba(20,24,22,.09)]'
              : 'font-medium text-km-muted hover:text-km-text',
          )}
        >
          {o.libelle}
        </button>
      ))}
    </div>
  )
}

/** « Jean Marie DUPONT » → prénom « Jean Marie », nom « DUPONT ». Repli quand la piste n'a que
 *  `contact_nom` d'un seul tenant — 4 490 des 4 827 pistes ouvertes viennent d'un import qui n'a
 *  jamais découpé le nom. */
function separerNom(entier: string | null): { prenom: string; nom: string } {
  const mots = (entier ?? '').trim().split(/\s+/).filter(Boolean)
  if (mots.length === 0) return { prenom: '', nom: '' }
  if (mots.length === 1) return { prenom: '', nom: mots[0] }
  return { prenom: mots.slice(0, -1).join(' '), nom: mots[mots.length - 1] }
}

/** Ce que Kimatch est en train d'écrire, quand il n'y a pas d'écran à montrer. */
type Travail = null | 'compte' | 'contact' | 'opportunite'

const PHRASE_DU_TRAVAIL: Record<Exclude<Travail, null>, string> = {
  compte: 'Rattachement de la société…',
  contact: 'Création du contact…',
  opportunite: "Ouverture de l'opportunité…",
}

const LIBELLE_CIVILITE: Record<string, string> = { 'Mme': 'Madame', 'M.': 'Monsieur' }

/* ══════════════════════════════════════════════════════════════════════════════════════════════
   LE PARCOURS
   ══════════════════════════════════════════════════════════════════════════════════════════════ */

export function ParcoursConversion({ piste, onFermer }: { piste: Piste; onFermer: () => void }) {
  const navigate = useNavigate()
  const { data: comptes } = useComptes()
  const { data: sites } = useSites()

  const etablirCompte = useEtablirCompte()
  const etablirContact = useEtablirContact()
  const creerOpportunite = useCreerOpportuniteDepuisPiste()

  const [etape, setEtape] = useState<CleEtape>('identite')
  const [travail, setTravail] = useState<Travail>(null)
  const [erreur, setErreur] = useState<string | null>(null)
  const [sortieDemandee, setSortieDemandee] = useState(false)

  /* Ce que le parcours a produit, au fur et à mesure. */
  const [compteId, setCompteId] = useState<string | null>(null)
  const [compteNom, setCompteNom] = useState<string | null>(null)
  const [contactId, setContactId] = useState<string | null>(null)
  const [contactNom, setContactNom] = useState<string | null>(null)
  const [opportuniteId, setOpportuniteId] = useState<string | null>(null)
  const [compteurIds, setCompteurIds] = useState<string[]>([])
  const [compteurNumeros, setCompteurNumeros] = useState<string[]>([])

  /* ══ ÉTAPE 1 · LA SOCIÉTÉ ══ */
  const sirenDeLaPiste = (piste.siren ?? piste.siret ?? '').replace(/\D/g, '').slice(0, 9)
  const [entreprise, setEntreprise] = useState<CompanyResult | null>(null)
  const [recherche, setRecherche] = useState(piste.societe ?? '')
  const [resultats, setResultats] = useState<CompanyResult[]>([])
  const [chercheEnCours, setChercheEnCours] = useState(false)

  const siren = entreprise?.siren?.replace(/\D/g, '') || sirenDeLaPiste
  const sirenValide = siren.length === 9

  /* Le compte qui porte déjà ce SIREN — la première question des six points de William. Elle se
     pose dès l'ouverture : dans 99 % des cas la réponse est « aucun », et l'écran doit pouvoir
     l'annoncer sans faire attendre. */
  const { data: compteExistant, isLoading: chercheCompte } = useQuery({
    queryKey: ['conversion', 'compte-par-siren', siren],
    queryFn: () => chercherCompteParSiren(siren),
    enabled: sirenValide,
    staleTime: 30_000,
  })

  // Recherche d'entreprise, seulement quand la piste n'apporte pas de SIREN utilisable.
  useEffect(() => {
    if (sirenDeLaPiste.length === 9 || entreprise) return
    const q = recherche.trim()
    if (q.length < 3) { setResultats([]); return }
    const ctrl = new AbortController()
    const t = setTimeout(async () => {
      setChercheEnCours(true)
      try {
        setResultats(await searchCompanies(q, ctrl.signal))
      } catch {
        /* Abandon volontaire ou annuaire indisponible : la liste reste vide et le dit. */
      } finally {
        setChercheEnCours(false)
      }
    }, 350)
    return () => { clearTimeout(t); ctrl.abort() }
  }, [recherche, sirenDeLaPiste, entreprise])

  /* ══ ÉTAPE 1 · LE CONTACT ══ */
  const nomSepare = useMemo(() => separerNom(piste.contact_nom), [piste.contact_nom])
  const [civilite, setCivilite] = useState(piste.civilite ?? '')
  const [prenom, setPrenom] = useState(piste.prenom ?? nomSepare.prenom)
  const [nom, setNom] = useState(piste.nom ?? nomSepare.nom)
  const [fonction, setFonction] = useState(piste.fonction ?? '')
  const [telephone, setTelephone] = useState(piste.telephone ?? '')
  const [mobile, setMobile] = useState(piste.telephone_mobile ?? '')
  const [email, setEmail] = useState(piste.email ?? '')

  const compte = comptes?.find((c) => c.id === compteId)
  const pret = sirenValide && nom.trim().length > 0

  const nomSociete = compteNom ?? (entreprise ? (entreprise.raisonSociale || entreprise.nomComplet) : null) ?? piste.societe ?? 'Cette piste'

  /* Ce que le rail rappelle sous chaque étape faite. Au-delà de trois PDL on replie : un syndic à
     huit compteurs ferait défiler le rail, et c'est le nombre qui compte alors, pas la liste. */
  const resumes: Partial<Record<CleEtape, Resume>> = {
    identite: { lignes: [compteNom, contactNom].filter((x): x is string => Boolean(x)) },
    perimetre: {
      mono: true,
      lignes: compteurNumeros.length > 3
        ? [...compteurNumeros.slice(0, 3), `et ${compteurNumeros.length - 3} autres`]
        : compteurNumeros,
    },
    opportunite: { mono: true, lignes: opportuniteId ? ['Couverture mandat'] : [] },
  }

  /** Étapes 1 et 2 de William, d'un seul geste : le compte puis le contact, sans écran entre eux. */
  async function lancer() {
    setErreur(null)
    try {
      setTravail('compte')
      const identite: IdentiteLegale = entreprise
        ? {
            nom: entreprise.raisonSociale || entreprise.nomComplet,
            siren: entreprise.siren,
            siret: entreprise.siret,
            rue: entreprise.street,
            codePostal: entreprise.postalCode,
            ville: entreprise.city,
            codeNaf: entreprise.codeApe,
            libelleApe: entreprise.libelleApe,
          }
        : { nom: piste.societe ?? '', siren }
      const resCompte = await etablirCompte.mutateAsync({ piste, identite })
      setCompteId(resCompte.id)
      setCompteNom(resCompte.nom)

      setTravail('contact')
      const resContact = await etablirContact.mutateAsync({
        piste,
        compte: { id: resCompte.id, nom: resCompte.nom },
        identite: {
          civilite: civilite.trim() || null,
          prenom: prenom.trim(),
          nom: nom.trim(),
          fonction: fonction.trim() || null,
          telephone: telephone.trim() || null,
          mobile: mobile.trim() || null,
          email: email.trim() || null,
        },
      })
      setContactId(resContact.id)
      setContactNom(resContact.nom)

      setTravail(null)
      setEtape('perimetre')
    } catch (e) {
      setTravail(null)
      setErreur(e instanceof Error ? e.message : 'Création impossible.')
    }
  }

  /** Étape 4 de William : les compteurs sont là, l'opportunité se crée et la piste bascule. */
  async function ouvrirLOpportunite(ids: string[]) {
    setCompteurIds(ids)
    setEtape('opportunite')
    setTravail('opportunite')
    setErreur(null)
    try {
      const id = await creerOpportunite.mutateAsync({
        piste,
        compteId: compteId!,
        contactId: contactId!,
        compteurIds: ids,
      })
      setOpportuniteId(id)
      setTravail(null)
      setEtape('mandat')
    } catch (e) {
      setTravail(null)
      setErreur(e instanceof Error ? e.message : "Création de l'opportunité impossible.")
    }
  }

  /** La croix, Échap et le clic sur le voile passent tous par ici. */
  function demanderSortie() {
    if (travail) return
    // L'opportunité existe : la conversion a abouti, il n'y a plus rien à confirmer.
    if (opportuniteId) { onFermer(); navigate(`/opportunites/${opportuniteId}`); return }
    // Rien n'a encore été écrit : sortir ne coûte rien.
    if (!compteId) { onFermer(); return }
    setSortieDemandee(true)
  }

  const rail = (props: { courante: CleEtape; sousTitre?: string; note: { titre: string; texte: string } }) => (
    <RailParcours
      titre={nomSociete}
      reference={piste.reference}
      resumes={resumes}
      onFermer={demanderSortie}
      {...props}
    />
  )

  /* ════════ ÉTAPE 2 · LE PÉRIMÈTRE ════════ */
  if (etape === 'perimetre') {
    return (
      <>
        <FenetreParcours onFermer={demanderSortie}>
          {rail({
            courante: 'perimetre',
            sousTitre: compteurNumeros.length > 0
              ? `${compteurNumeros.length} ${compteurNumeros.length > 1 ? 'compteurs enregistrés' : 'compteur enregistré'}`
              : 'Au moins un compteur',
            note: { titre: "Sans compteur, pas d'opportunité", texte: "C'est le périmètre qui fait l'affaire." },
          })}
          <div className="flex min-w-0 flex-1 flex-col px-9 pb-[22px] pt-8">
            <EnTeteEtape numero={2} titre="Quel périmètre couvrir ?" />
            {compte ? (
              <CreationCompteurDialog
                sansCadre
                open
                onClose={demanderSortie}
                compte={compte}
                sites={sites ?? []}
                responsableParDefautId={contactId ?? undefined}
                libelleValidation="Créer le périmètre"
                unParUn
                /* CHAQUE COMPTEUR REJOINT LE RAIL DÈS SA CRÉATION, et non à la fin : c'est ce qui
                   permet au formulaire de repartir à zéro sans qu'on ait l'impression d'avoir perdu
                   le précédent. William, 24/09/2026. */
                onCompteurCree={(c) => setCompteurNumeros((prev) => [...prev, c.numero_pdl])}
                onSaved={() => { /* Le parcours annonce lui-même la suite. */ }}
                onCrees={(compteurs) => ouvrirLOpportunite(compteurs.map((c) => c.id))}
              />
            ) : (
              /* Le compte vient de la liste, pas du résultat de la création : `useCreateCompte` l'y
                 pousse aussitôt, donc il est là — sauf le temps d'un premier chargement. On attend
                 explicitement plutôt que de retomber sur le formulaire d'identité. */
              <div className="flex flex-1 flex-col items-center justify-center gap-3">
                <Loader2 className="h-6 w-6 animate-spin text-km-green" />
                <p className="text-km-body font-semibold text-km-text">Ouverture du compte…</p>
              </div>
            )}
          </div>
        </FenetreParcours>
        {sortieDemandee && <DialogueSortie compteNom={compteNom} onReprendre={() => setSortieDemandee(false)} onArreter={() => { onFermer(); navigate(`/comptes/${compteId}`) }} />}
      </>
    )
  }

  /* ════════ ÉTAPE 4 · LE MANDAT ════════ */
  if (etape === 'mandat' && compteId && opportuniteId) {
    return (
      <FenetreParcours onFermer={demanderSortie}>
        {rail({
          courante: 'mandat',
          sousTitre: 'Dernière étape',
          note: { titre: 'La piste est convertie', texte: 'La relance mandat est posée à J+2.' },
        })}
        <div className="flex min-w-0 flex-1 flex-col px-9 pb-[22px] pt-8">
          <EnTeteEtape numero={4} titre="Le mandat à faire signer" />
          {/* ══ UNE PAGE, PLUS QUATRE ÉTAPES ══
              William, 24/09/2026 : « l'envoi de mandat doit être largement facilité, tout doit
              tenir sur une page ». `MandatWizard` demandait en quatre écrans ce que le parcours
              vient de créer — il reste l'assistant général, lancé depuis une fiche compte ou une
              opportunité, là où rien n'est encore connu. La garde DocuSign reste : mieux vaut
              buter sur l'autorisation avant de remplir que juste avant d'envoyer. */}
          <WizardConnectionGate required={['crm', 'docusign']} feature="demande de mandat">
            <MandatEnUnePage
              compteId={compteId}
              contactId={contactId}
              compteurIds={compteurIds}
            />
          </WizardConnectionGate>
        </div>
      </FenetreParcours>
    )
  }

  /* ════════ ÉTAPE 3 · L'OPPORTUNITÉ N'A PAS PU S'OUVRIR ════════
     Sans cette branche, un échec ici renverrait sur l'écran « société & contact », dont le bouton
     « Continuer » recréerait LE CONTACT une seconde fois : le compte, lui, est retrouvé par son
     SIREN, mais rien ne rattrape un contact en double. */
  if (etape === 'opportunite' && !travail) {
    return (
      <FenetreParcours onFermer={demanderSortie}>
        {rail({
          courante: 'opportunite',
          sousTitre: 'À reprendre',
          note: { titre: 'Les compteurs sont créés', texte: "Il ne manque que l'opportunité." },
        })}
        <div className="flex min-w-0 flex-1 flex-col px-9 pb-[22px] pt-8">
          <EnTeteEtape numero={3} titre="L'opportunité n'a pas pu s'ouvrir" />
          <div className="flex flex-col gap-3">
            <p className="rounded-[10px] border border-km-red-line bg-km-red-soft px-[13px] py-[10px] text-[12.5px] text-red-700">
              {erreur ?? 'Erreur inconnue.'}
            </p>
            <p className="text-[12.5px] leading-snug text-km-muted">
              {compteurIds.length > 1 ? `Les ${compteurIds.length} compteurs sont enregistrés` : 'Le compteur est enregistré'} sur
              le compte <strong className="font-semibold text-km-text">{compteNom}</strong>. Relancer ne les recrée pas.
            </p>
          </div>
          <div className="mt-auto flex items-center justify-end gap-3 border-t border-km-line-soft pt-4">
            <Button variant="ghost" onClick={demanderSortie}>Arrêter là</Button>
            <Button onClick={() => ouvrirLOpportunite(compteurIds)}>Réessayer</Button>
          </div>
        </div>
      </FenetreParcours>
    )
  }

  /* ════════ ÉTAPE 1 · SOCIÉTÉ & CONTACT, et les temps morts ════════ */
  return (
    <>
      <FenetreParcours onFermer={demanderSortie}>
        {rail({
          courante: travail === 'opportunite' ? 'opportunite' : 'identite',
          sousTitre: travail ? 'En cours' : undefined,
          note: {
            titre: 'Vous pouvez vous arrêter',
            texte: "Ce qui est créé reste. La piste ne bascule qu'à l'opportunité.",
          },
        })}

        <div className="flex min-w-0 flex-1 flex-col px-9 pb-[22px] pt-8">
          {travail ? (
            /* LE TEMPS MORT A UN ÉCRAN, parce qu'il en a besoin : trois écritures partent ici sans
               que rien ne soit demandé. Une fenêtre figée ferait croire à un blocage. */
            <div className="flex flex-1 flex-col items-center justify-center gap-3">
              <Loader2 className="h-6 w-6 animate-spin text-km-green" />
              <p className="text-km-body font-semibold text-km-text">{PHRASE_DU_TRAVAIL[travail]}</p>
              <p className="text-km-label text-km-faint">Encore un instant.</p>
            </div>
          ) : (
            <>
              <EnTeteEtape numero={1} titre="À qui rattacher cette affaire ?" />

              {/* ── LA SOCIÉTÉ ── */}
              {sirenValide ? (
                <div className="mb-[24px] flex items-center gap-[15px] rounded-[14px] border border-km-green-line bg-km-green-tint px-[17px] py-[16px]">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[11px] bg-km-green">
                    <Check className="h-[19px] w-[19px] stroke-[2.2] text-white" />
                  </span>
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    {chercheCompte ? (
                      <span className="text-km-label text-km-faint">Recherche du compte…</span>
                    ) : (
                      <>
                        <span className="truncate text-[15px] font-semibold text-km-text">
                          {compteExistant
                            ? compteExistant.nom
                            : (entreprise ? (entreprise.raisonSociale || entreprise.nomComplet) : (piste.societe || 'Nouveau compte'))}
                        </span>
                        <span className="text-[12px] text-km-muted">
                          SIREN <span className="font-mono">{siren}</span>
                          {piste.ville && ` · ${piste.ville}`}
                          {piste.segment && ` · ${piste.segment}`}
                        </span>
                      </>
                    )}
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-[5px]">
                    <span className="text-[10.5px] font-semibold text-km-green">
                      {compteExistant ? 'Compte existant' : 'Nouveau compte'}
                    </span>
                    {!compteExistant && (
                      <span className="inline-flex items-center gap-[5px] text-[10px] text-km-muted">
                        <span className="h-[5px] w-[5px] rounded-full bg-km-amber" /> Score Ellipro en route
                      </span>
                    )}
                    {entreprise && (
                      <button type="button" onClick={() => setEntreprise(null)} className="text-[10.5px] font-semibold text-km-green hover:underline">
                        changer
                      </button>
                    )}
                  </div>
                </div>
              ) : (
                /* ══ PAS DE SIREN : C'EST LA PREMIÈRE CHOSE À REMPLIR ══
                   William, 23/09/2026. 95 pistes ouvertes sur 4 827 sont dans ce cas. On passe par
                   l'annuaire INSEE plutôt que par une saisie libre : un SIREN tapé de mémoire crée
                   un compte faux que plus personne ne rattrape. */
                <div className="mb-[24px] flex flex-col gap-[7px] rounded-[14px] border border-km-line bg-km-bg/40 p-[15px]">
                  <span className="text-[11.5px] leading-snug text-km-muted">
                    Cette piste n'a pas de SIREN. Trouvez la société pour continuer.
                  </span>
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-[11px] top-1/2 h-[14px] w-[14px] -translate-y-1/2 text-km-faint" />
                    <input
                      value={recherche}
                      onChange={(e) => setRecherche(e.target.value)}
                      placeholder="Raison sociale ou SIREN…"
                      className={cn(SAISIE, 'pl-[33px]')}
                    />
                    {chercheEnCours && (
                      <Loader2 className="absolute right-[11px] top-1/2 h-[14px] w-[14px] -translate-y-1/2 animate-spin text-km-faint" />
                    )}
                  </div>
                  {recherche.trim().length >= 3 && (
                    <div className="max-h-[152px] overflow-y-auto rounded-[10px] border border-km-line bg-white">
                      {resultats.map((r) => (
                        <button
                          key={r.siret ?? r.siren}
                          type="button"
                          onClick={() => setEntreprise(r)}
                          className="flex w-full flex-col gap-[2px] border-b border-km-line-soft px-[13px] py-[9px] text-left last:border-b-0 hover:bg-km-bg/60"
                        >
                          <span className="truncate text-[12.5px] font-semibold text-km-text">
                            {r.raisonSociale || r.nomComplet}
                          </span>
                          <span className="truncate font-mono text-[11px] text-km-faint">
                            {r.siren}{r.city && ` · ${r.city}`}
                          </span>
                        </button>
                      ))}
                      {!chercheEnCours && resultats.length === 0 && (
                        <p className="p-3 text-center text-[12px] text-km-faint">Aucune entreprise trouvée.</p>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* ── LE CONTACT ── */}
              <span className="mb-[13px] text-[10.5px] font-bold uppercase tracking-[0.12em] text-km-faint">
                La personne à qui vous avez parlé
              </span>

              <div className="flex flex-col gap-[15px]">
                <div className="flex gap-[13px]">
                  <div className="flex shrink-0 flex-col gap-[7px]">
                    <span className="text-[11.5px] font-semibold text-km-muted">Civilité</span>
                    {/* Les valeurs sont « M. » et « Mme » — celles que le déclencheur écrit. Les
                        libellés sont en toutes lettres ; ce qui part en base ne l'est pas. */}
                    <Segments
                      valeur={civilite}
                      onChoisir={(v) => setCivilite(v === civilite ? '' : v)}
                      options={optionsCivilite(civilite).map((c) => ({
                        valeur: c,
                        libelle: LIBELLE_CIVILITE[c] ?? c,
                      }))}
                    />
                  </div>
                  <Champ pour="conv-prenom" intitule="Prénom" className="flex-1">
                    <input id="conv-prenom" value={prenom} onChange={(e) => setPrenom(e.target.value)} className={SAISIE} />
                  </Champ>
                  <Champ pour="conv-nom" intitule="Nom" className="flex-1">
                    <input
                      id="conv-nom"
                      value={nom}
                      onChange={(e) => setNom(e.target.value)}
                      className={cn(SAISIE, 'font-medium', !nom.trim() && 'border-km-amber')}
                    />
                  </Champ>
                </div>

                <div className="grid grid-cols-3 gap-[13px]">
                  <Champ pour="conv-fonction" intitule="Fonction">
                    <input id="conv-fonction" value={fonction} onChange={(e) => setFonction(e.target.value)} className={SAISIE} />
                  </Champ>
                  <Champ pour="conv-tel" intitule="Téléphone">
                    <input id="conv-tel" value={telephone} onChange={(e) => setTelephone(e.target.value)} className={SAISIE_MONO} />
                  </Champ>
                  <Champ pour="conv-mob" intitule="Portable">
                    <input id="conv-mob" value={mobile} onChange={(e) => setMobile(e.target.value)} className={SAISIE_MONO} />
                  </Champ>
                </div>

                <Champ pour="conv-mail" intitule="Courriel" complement="il recevra le mandat à signer">
                  <input id="conv-mail" type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={SAISIE} />
                </Champ>
              </div>

              {erreur && (
                <p className="mt-[15px] rounded-[10px] border border-km-red-line bg-km-red-soft px-[13px] py-[10px] text-[12.5px] text-red-700">
                  {erreur}
                </p>
              )}

              <div className="mt-auto flex items-center gap-4 border-t border-km-line-soft pt-4">
                <span className="text-[11.5px] text-km-faint">
                  Créé comme <strong className="font-semibold text-km-muted">Décisionnaire</strong>
                </span>
                <span className="flex-1" />
                <button type="button" onClick={demanderSortie} className="rounded-[10px] px-[15px] py-[11px] text-[13px] font-medium text-km-muted hover:bg-km-bg">
                  Annuler
                </button>
                <button
                  type="button"
                  onClick={lancer}
                  disabled={!pret}
                  className="inline-flex items-center gap-[9px] rounded-[11px] bg-km-green px-[19px] py-[12px] text-[13.5px] font-semibold text-white shadow-[0_2px_8px_rgba(13,122,95,.26)] transition-opacity disabled:opacity-40"
                >
                  Continuer
                  <ArrowRight className="h-[15px] w-[15px] stroke-[2.2]" />
                </button>
              </div>
            </>
          )}
        </div>
      </FenetreParcours>

      {sortieDemandee && (
        <DialogueSortie
          compteNom={compteNom}
          onReprendre={() => setSortieDemandee(false)}
          onArreter={() => { onFermer(); navigate(`/comptes/${compteId}`) }}
        />
      )}
    </>
  )
}

/**
 * LA SORTIE EN COURS DE ROUTE.
 *
 * Une petite fenêtre par-dessus la grande, et non un écran du parcours : ce n'est pas une étape,
 * c'est une question. Elle passe par `Dialog`, qui sait déjà s'empiler.
 */
function DialogueSortie({ compteNom, onReprendre, onArreter }: {
  compteNom: string | null
  onReprendre: () => void
  onArreter: () => void
}) {
  return (
    <Dialog
      open
      onClose={onReprendre}
      title="Arrêter la conversion ici ?"
      description="Ce qui est déjà créé ne disparaît pas."
      className="max-w-md"
    >
      <div className="space-y-3">
        <ul className="space-y-1.5 text-km-body leading-snug text-km-text">
          <li className="flex gap-2">
            <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-km-green" />
            <span>Le compte <strong className="font-semibold">{compteNom ?? 'créé'}</strong> et son contact restent en place.</span>
          </li>
          <li className="flex gap-2">
            <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-km-green" />
            <span>La piste <strong className="font-semibold">reste ouverte</strong> : elle garde sa tâche et revient dans le plan du jour.</span>
          </li>
        </ul>
        <p className="rounded-lg border border-km-line bg-km-bg/60 px-3 py-2 text-km-label leading-snug text-km-muted">
          Sans compteur, pas d'opportunité. Pour reprendre, créez les compteurs depuis la fiche du
          compte : l'opportunité se lancera de là.
        </p>
        <div className="flex justify-end gap-2 border-t border-km-line pt-3">
          <Button variant="ghost" onClick={onReprendre}>Reprendre</Button>
          <Button onClick={onArreter}>Arrêter et voir le compte</Button>
        </div>
      </div>
    </Dialog>
  )
}
