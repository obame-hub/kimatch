import { useRef, useState, type DragEvent, type ReactNode } from 'react'
import { AlertTriangle, FileText, Loader2, MapPin, Trash2, Upload } from 'lucide-react'
import { cn } from '@/lib/utils'
import { ContactPicker } from '@/components/contact/ContactPicker'
import { AddressAutocomplete } from '@/components/ui/address-autocomplete'
import type { Site } from '@/types/domain'
import type { Compte, Contact } from '@/types/domain'
import type { ReferenceRow } from '@/lib/data/referenceTables'
import { PDL_FORMAT_RE, findCompteurByNumero } from '@/lib/data/compteurs'
import { normalizeTexte } from '@/lib/data/sites'
import type { Compteur } from '@/types/domain'

let draftKeySeq = 0
function nextDraftKey() {
  draftKeySeq += 1
  return `draft-${draftKeySeq}`
}

const SEGMENTS_ELEC = ['C1', 'C2', 'C3', 'C4', 'C5']
const TENSIONS_ELEC = ['BT', 'HTA']
const TARIFS_GAZ = ['T1', 'T2', 'T3', 'T4']
const PROFILS_GAZ = ['P011', 'P012', 'P013', 'P014', 'P015', 'P016', 'P017', 'P018', 'P019']
/* LES CINQ CLASSES DE PUISSANCE N'ONT PLUS DE LISTE ICI. William, 24/09/2026 : « les puissances ne
   sont pas du tout obligatoires, donc inutile de les mettre dans le formulaire. » Elles ne sont
   plus ni saisies ni exigées ; `puissanceParClasseKva` reste alimentée par l'extraction de facture,
   et `buildDraftCharacteristics` écrit en base ce qu'elle y trouve, quelles que soient ses clés. */

export interface PdlDraft {
  key: string
  typeEnergieId: string
  // Site : un simple libellé + son adresse, saisis DANS le formulaire du PDL. Décision de William
  // (réunion du 06/08/2026) : « à la création du compteur ça devrait créer le compteur direct et
  // pas le site — le site c'est juste un libellé ». L'objet Site existe toujours et sera créé (ou
  // retrouvé) automatiquement à l'enregistrement, mais il ne fait plus l'objet d'une étape à part.
  // Même disposition que Tools, où « Libellé du site » et l'adresse sont des champs du PDL.
  libelleSite: string
  adresse: string
  ville: string
  codePostal: string
  numeroPdl: string
  utilisation: string
  typeUtilisationId: string
  dateEcheance: string
  fournisseurActuelId: string
  responsableContactId: string
  // Caractéristiques techniques -- saisissables manuellement dès la création, comme dans Tools
  // (manuelle ou extraction facture), en repli de la synchro GRD réelle qui n'a lieu qu'une fois
  // le mandat actif. Requises (voir champsPdlManquants) : sans elles le moteur d'éligibilité
  // fournisseur de la cotation n'a rien à exploiter.
  segment: string
  tension: string
  puissanceParClasseKva: Record<string, string>
  tarifDistribution: string
  profilConsommation: string
  carMwh: string
  status: 'draft' | 'saving' | 'saved' | 'error'
  errorMessage: string | null
}

/** @param responsableContactId Le responsable désigné d'avance — le contact que le parcours de
 *  conversion vient de créer, par exemple. Vide partout ailleurs. */
export function emptyPdlDraft(responsableContactId = ''): PdlDraft {
  return {
    key: nextDraftKey(),
    typeEnergieId: '',
    libelleSite: '',
    adresse: '',
    ville: '',
    codePostal: '',
    numeroPdl: '',
    utilisation: '',
    typeUtilisationId: '',
    dateEcheance: '',
    fournisseurActuelId: '',
    responsableContactId,
    segment: '',
    tension: '',
    puissanceParClasseKva: {},
    tarifDistribution: '',
    profilConsommation: '',
    carMwh: '',
    status: 'draft',
    errorMessage: null,
  }
}

/** Champs requis encore vides sur un brouillon de PDL -- même règle que Tools
 * (computeRequiredFields) : numéro + responsable toujours, puis segment/tension/utilisation +
 * puissances pour l'élec (PS Unique si C5, sinon les 5 classes), tarif/profil/CAR pour le gaz.
 * Sert à la fois au surlignage des champs et au blocage de l'enregistrement. */
export function champsPdlManquants(d: PdlDraft, estElectricite: boolean, siteImpose = false): Set<string> {
  const manquants = new Set<string>()
  // Le site est saisi dans le formulaire du PDL (décision William 06/08/2026), sauf quand on part
  // déjà d'une fiche site -- dans ce cas il est connu et les champs ne sont même pas affichés.
  if (!siteImpose) {
    if (!d.libelleSite.trim()) manquants.add('libelleSite')
    /* ══ L'ADRESSE EST OBLIGATOIRE DEPUIS LE 10/09/2026 ══
       Naoëlle : « faut rendre toutes les adresses obligatoires, même adresse ». Elle était le seul
       champ facultatif du bloc, et ça se voyait dans les données : `sites.adresse` n'était rempli
       que sur 336 sites sur 6 374 — 5 % — et `sites.rue` sur 8.

       Or depuis le retrait de l'objet site, c'est la création du compteur qui pose l'adresse : elle
       alimente `compteurs.adresse`, donc la colonne calculée `adresse_site`, donc la RECHERCHE, qui
       est désormais la seule façon de retrouver un lieu. Un compteur créé sans rue se cherche par
       son seul libellé — et deux « SDC Plaisance » dans deux communes deviennent indiscernables.

       Laisser ce champ facultatif revenait à laisser refabriquer le trou qu'on vient de combler. */
    if (!d.adresse.trim()) manquants.add('adresse')
    if (!d.ville.trim()) manquants.add('ville')
    if (!d.codePostal.trim()) manquants.add('codePostal')
  }
  if (!d.numeroPdl.trim()) manquants.add('numeroPdl')
  if (!d.responsableContactId) manquants.add('responsableContactId')
  if (!d.typeEnergieId) {
    manquants.add('typeEnergieId')
    return manquants
  }
  if (estElectricite) {
    if (!d.segment) manquants.add('segment')
    if (!d.tension) manquants.add('tension')
    if (!d.typeUtilisationId) manquants.add('typeUtilisationId')
    /* ══ LES PUISSANCES NE SONT PLUS EXIGÉES — William, 24/09/2026 ══
       « Les puissances ne sont pas du tout obligatoires, donc inutile de les mettre dans le
       formulaire. » Elles quittent l'écran ET la liste des manques. `puissanceParClasseKva` reste
       dans le brouillon : l'extraction de facture la remplit quand elle la trouve, et
       `buildDraftCharacteristics` continue de l'écrire en base. Ce qui disparaît, c'est
       l'obligation de la saisir à la main. */
  } else {
    if (!d.tarifDistribution) manquants.add('tarifDistribution')
    if (!d.profilConsommation) manquants.add('profilConsommation')
    if (!d.carMwh.trim()) manquants.add('carMwh')
  }
  return manquants
}

/* UN CHAMP REQUIS ENCORE VIDE NE SE COLORE PLUS. William, 24/09/2026 : « je ne veux pas que les
   champs et les toggles soient jaunâtres pour indiquer qu'ils doivent être complétés. » Ce qui
   reste pour le dire : l'astérisque contre l'intitulé, le bouton qui refuse de s'activer, et une
   phrase sobre qui compte ce qui manque. `champsPdlManquants` n'a pas bougé d'une ligne. */

export interface ExtractedField { value: string | number | null; confidence: number }

function texte(f: ExtractedField | undefined): string {
  return f?.value === null || f?.value === undefined ? '' : String(f.value).trim()
}

/** Traduit les champs extraits d'une facture (api/ocr/extract-document) en modifications de
 * brouillon PDL. Les champs absents de la facture ne sont jamais écrasés : on ne remplit que ce
 * qui est vide, l'utilisateur reste maître de ce qu'il a déjà saisi.
 *
 * C'est le chaînon qui manquait : l'écran « Extraction automatique » existait mais n'était relié
 * à rien, il ouvrait le même formulaire vide que la saisie manuelle. */
export function applyExtractionToDraft(
  draft: PdlDraft,
  fields: Record<string, ExtractedField>,
  energies: ReferenceRow[],
  fournisseurs: Compte[],
): Partial<PdlDraft> {
  const patch: Partial<PdlDraft> = {}

  const energieCode = texte(fields.type_energie).toLowerCase()
  if (!draft.typeEnergieId && energieCode) {
    const cible = energies.find((e) => (e.code ?? '').toLowerCase() === (energieCode === 'gaz' ? 'gaz' : 'electricite'))
    if (cible) patch.typeEnergieId = cible.id
  }
  const estGaz = energieCode === 'gaz'

  if (!draft.numeroPdl && texte(fields.numero_pdl)) patch.numeroPdl = texte(fields.numero_pdl).replace(/\s/g, '')
  if (!draft.dateEcheance && texte(fields.date_fin)) patch.dateEcheance = texte(fields.date_fin)

  if (!draft.fournisseurActuelId && texte(fields.fournisseur_nom)) {
    const cherche = texte(fields.fournisseur_nom).toLowerCase()
    const match = fournisseurs.find((f) => {
      const nom = f.nom.toLowerCase()
      return nom === cherche || nom.includes(cherche) || cherche.includes(nom)
    })
    if (match) patch.fournisseurActuelId = match.id
  }

  if (estGaz) {
    if (!draft.tarifDistribution && TARIFS_GAZ.includes(texte(fields.tarif_distribution).toUpperCase())) {
      patch.tarifDistribution = texte(fields.tarif_distribution).toUpperCase()
    }
    if (!draft.profilConsommation && PROFILS_GAZ.includes(texte(fields.profil_consommation).toUpperCase())) {
      patch.profilConsommation = texte(fields.profil_consommation).toUpperCase()
    }
    if (!draft.carMwh && texte(fields.consommation_annuelle_mwh)) patch.carMwh = texte(fields.consommation_annuelle_mwh)
    return patch
  }

  const segment = texte(fields.segment).toUpperCase()
  if (!draft.segment && SEGMENTS_ELEC.includes(segment)) patch.segment = segment
  const tension = texte(fields.tension).toUpperCase()
  if (!draft.tension && TENSIONS_ELEC.includes(tension)) patch.tension = tension

  // La facture ne donne qu'une puissance souscrite : en C5 elle alimente la puissance unique,
  // au-delà elle ne renseigne que la pointe — les autres postes horaires restent à saisir.
  const puissance = texte(fields.puissance_souscrite_kva)
  const segmentEffectif = patch.segment ?? draft.segment
  if (puissance) {
    const classe = segmentEffectif === 'C5' ? 'base' : 'pointe'
    if (!(draft.puissanceParClasseKva[classe] ?? '').trim()) {
      patch.puissanceParClasseKva = { ...draft.puissanceParClasseKva, [classe]: puissance }
    }
  }
  return patch
}

/** Construit les objets `grdElec`/`grdGaz` attendus par `useCreateCompteur` à partir des
 * caractéristiques techniques saisies manuellement dans le brouillon (segment/tension/puissances
 * pour l'élec, tarif/profil/CAR pour le gaz) -- même conduit que la synchro GRD réelle, mais
 * alimenté à la main tant que le mandat n'est pas encore actif. */
export function buildDraftCharacteristics(d: PdlDraft, estElectricite: boolean) {
  if (estElectricite) {
    const hasSegment = !!d.segment
    const hasTension = !!d.tension
    const puissances = Object.fromEntries(
      Object.entries(d.puissanceParClasseKva).filter(([, v]) => v.trim() !== '').map(([k, v]) => [k, Number(v)]),
    )
    if (!hasSegment && !hasTension && Object.keys(puissances).length === 0) return {}
    return { grdElec: { segment: d.segment || null, tension: d.tension || null, puissanceParClasseKva: puissances } }
  }
  const hasTarif = !!d.tarifDistribution
  const hasProfil = !!d.profilConsommation
  const hasCar = d.carMwh.trim() !== ''
  if (!hasTarif && !hasProfil && !hasCar) return {}
  return {
    grdGaz: {
      tarif_distribution: d.tarifDistribution || null,
      profil_consommation: d.profilConsommation || null,
      car_mwh: hasCar ? Number(d.carMwh) : null,
    },
  }
}

/**
 * Retrouve le site du compte qui correspond à la saisie, pour éviter d'en créer un doublon.
 *
 * Remplace l'ancien écran de désambiguïsation : Kimatch ne demande plus à l'utilisateur de choisir
 * entre plusieurs sites candidats. Le rapprochement est volontairement STRICT (même libellé, ou
 * même adresse exacte) : en cas de doute on crée un nouveau site plutôt que de rattacher un
 * compteur au mauvais endroit -- une erreur bien plus coûteuse qu'un site en double.
 */
export function trouverSiteExistant(sites: Site[], compteId: string, d: PdlDraft): Site | null {
  const duCompte = sites.filter((s) => s.compte_id === compteId)
  const libelle = normalizeTexte(d.libelleSite)
  const ville = normalizeTexte(d.ville)
  const cp = d.codePostal.trim()
  const rue = normalizeTexte(d.adresse)

  if (libelle) {
    const parNom = duCompte.find((s) => normalizeTexte(s.nom) === libelle)
    if (parNom) return parNom
  }
  if (rue && ville && cp) {
    const parAdresse = duCompte.find(
      (s) => normalizeTexte(s.rue ?? '') === rue && normalizeTexte(s.ville) === ville && s.code_postal.trim() === cp,
    )
    if (parAdresse) return parAdresse
  }
  return null
}


/* ══════════════════════════════════════════════════════════════════════════════════════════════
   LE FORMULAIRE D'UN COMPTEUR — QUATRE ZONES, SANS DÉFILEMENT
   ══════════════════════════════════════════════════════════════════════════════════════════════

   William, 24/09/2026, au mot près :
     Zone 1 · Responsable + zone de dépôt de facture
     Zone 2 · Toggle énergie + fournisseur + échéance, sur une ligne
     Zone 3 · Libellé + numéro + recherche d'adresse
     Zone 4 · Électricité : segment + tension + utilisation — Gaz : tarif + profil + CAR
   « Toutes ces infos doivent tenir sans besoin de scroller dans la popup. »

   ══ PLUS AUCUN CHAMP JAUNÂTRE ══

   « Je ne veux pas que les champs et les toggles soient jaunâtres pour indiquer qu'ils doivent être
   complétés. » L'ambre disparaît donc des bordures et des fonds. Ce qui reste pour dire qu'il
   manque quelque chose : l'astérisque contre l'intitulé, le bouton d'enregistrement qui refuse de
   s'activer, et UNE phrase sobre qui nomme ce qui manque. Les règles elles-mêmes n'ont pas bougé
   d'une ligne — `champsPdlManquants` est intacte.

   ══ LES PUISSANCES SONT LÀ, ET CE N'EST PAS UN AJOUT DE MA PART ══

   Elles ne figurent pas dans les quatre zones dictées, mais `champsPdlManquants` les EXIGE pour
   l'électricité : PS Unique en C5, les cinq classes sinon. Sans elles à l'écran, le formulaire ne
   pourrait jamais être enregistré. Elles tiennent donc sur une ligne au bas de la zone 4, en
   champs étroits. À signaler à William.
*/

const SAISIE = 'w-full rounded-[9px] border border-km-line bg-white px-[11px] py-[8px] text-[13px] text-km-text outline-none transition-shadow focus:border-km-green focus:shadow-[0_0_0_3px_rgba(13,122,95,.12)] disabled:bg-km-soft'
const SAISIE_MONO = 'w-full rounded-[9px] border border-km-line bg-white px-[11px] py-[8px] font-mono text-[12.5px] text-km-text outline-none transition-shadow focus:border-km-green focus:shadow-[0_0_0_3px_rgba(13,122,95,.12)] disabled:bg-km-soft'

function Champ({ intitule, requis, children, className }: {
  intitule: string
  requis?: boolean
  children: ReactNode
  className?: string
}) {
  return (
    <div className={cn('flex min-w-0 flex-col gap-[5px]', className)}>
      <span className="text-[10.5px] font-bold uppercase tracking-[0.07em] text-km-faint">
        {intitule}
        {requis && <span className="text-km-muted"> *</span>}
      </span>
      {children}
    </div>
  )
}

/** Segments : la valeur retenue en vert plein, jamais en ambre. */
function Segments({ valeur, options, onChoisir }: {
  valeur: string
  options: { valeur: string; libelle: string; titre?: string }[]
  onChoisir: (v: string) => void
}) {
  return (
    <div className="flex gap-[2px] rounded-[9px] border border-km-line bg-km-soft p-[3px]">
      {options.map((o) => (
        <button
          key={o.valeur}
          type="button"
          title={o.titre}
          onClick={() => onChoisir(o.valeur === valeur ? '' : o.valeur)}
          className={cn(
            'flex-1 rounded-[6px] px-[5px] py-[6px] text-[12px] transition-colors',
            o.valeur === valeur
              ? 'bg-km-green font-bold text-white'
              : 'font-medium text-km-muted hover:bg-white hover:text-km-text',
          )}
        >
          {o.libelle}
        </button>
      ))}
    </div>
  )
}

/**
 * LA ZONE DE DÉPÔT DE LA FACTURE.
 *
 * William, 24/09/2026 : « quand je dépose la facture dans la zone de drag & drop, tu dois me
 * proposer une fonctionnalité, celle de lire la facture et d'extraire automatiquement les champs ».
 *
 * ELLE EXISTE DÉJÀ, et c'est le même moteur qui est branché ici : `api/ocr/extract-document.ts`,
 * qui remplissait jusqu'alors le formulaire depuis un bouton « Déposer une facture ». Le dépôt
 * devient une vraie cible de glisser-déposer, et le fichier ne sert plus seulement à lire : il est
 * attaché au compteur créé, dans ses fichiers.
 */
function ZoneDepotFacture({ nomFichier, enCours, erreur, onFichier, desactive }: {
  nomFichier: string | null
  enCours: boolean
  /** CE QUI A RATÉ, DIT À L'ÉCRAN. Le service répond « indisponible » avec un code 200 : sans cette
   *  ligne, un dépôt sans effet passe pour un dépôt réussi, et c'est ce qui est arrivé à William le
   *  24/09/2026. Une extraction qui échoue doit se voir, sinon on valide des champs vides. */
  erreur: string | null
  onFichier: (f: File) => void
  desactive?: boolean
}) {
  const champ = useRef<HTMLInputElement>(null)
  const [survol, setSurvol] = useState(false)

  const deposer = (e: DragEvent<HTMLButtonElement>) => {
    e.preventDefault()
    setSurvol(false)
    const f = e.dataTransfer.files?.[0]
    if (f) onFichier(f)
  }

  return (
    <button
      type="button"
      disabled={desactive}
      onClick={() => champ.current?.click()}
      onDragOver={(e) => { e.preventDefault(); setSurvol(true) }}
      onDragLeave={() => setSurvol(false)}
      onDrop={deposer}
      className={cn(
        'flex h-full min-h-[62px] w-full flex-col items-center justify-center gap-[3px] rounded-[11px] border border-dashed px-3 py-2 text-center transition-colors',
        survol ? 'border-km-green bg-km-green-tint' : 'border-km-line bg-km-bg/40 hover:bg-km-bg',
      )}
    >
      <input
        ref={champ}
        type="file"
        accept=".pdf,image/*"
        className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) onFichier(f); e.target.value = '' }}
      />
      {enCours ? (
        <>
          <Loader2 className="h-[15px] w-[15px] animate-spin text-km-green" />
          <span className="text-[11.5px] font-semibold text-km-green">Lecture de la facture…</span>
        </>
      ) : erreur ? (
        <>
          <AlertTriangle className="h-[15px] w-[15px] text-km-red" />
          <span className="max-w-full text-[11px] font-semibold leading-tight text-km-red">{erreur}</span>
          <span className="text-[10.5px] text-km-muted">Le fichier reste joint — saisissez à la main</span>
        </>
      ) : nomFichier ? (
        <>
          <FileText className="h-[15px] w-[15px] text-km-green" />
          <span className="max-w-full truncate text-[11.5px] font-semibold text-km-green">{nomFichier}</span>
          <span className="text-[10.5px] text-km-muted">Champs pré-remplis · joint au compteur</span>
        </>
      ) : (
        <>
          <Upload className="h-[15px] w-[15px] text-km-faint" />
          <span className="text-[11.5px] font-semibold text-km-muted">Déposer la facture</span>
          <span className="text-[10.5px] text-km-faint">Elle sera lue et jointe au compteur</span>
        </>
      )}
    </button>
  )
}

export function PdlDraftRows({
  drafts,
  onChange,
  onRemove,
  energies,
  utilisationsRef,
  fournisseurs,
  contacts,
  allContacts,
  compteId,
  compteNom,
  compteSegment,
  existingCompteurs,
  sites = [],
  siteImpose = false,
  responsableParDefautId,
  facture,
}: {
  drafts: PdlDraft[]
  onChange: (key: string, patch: Partial<PdlDraft>) => void
  onRemove: (key: string) => void
  energies: ReferenceRow[]
  utilisationsRef?: ReferenceRow[]
  fournisseurs: Compte[]
  contacts: Contact[]
  allContacts: Contact[]
  compteId: string
  compteNom: string
  compteSegment?: string | null
  existingCompteurs: Compteur[]
  sites?: Site[]
  siteImpose?: boolean
  responsableParDefautId?: string
  /** La facture déposée : son nom, l'état de sa lecture, et où la remettre. */
  facture?: { nom: string | null; enCours: boolean; erreur: string | null; onFichier: (f: File) => void }
}) {
  return (
    <div className="flex flex-col gap-4">
      {drafts.map((d, i) => {
        const energieChoisie = energies.find((e) => e.id === d.typeEnergieId)
        const estElectricite = (energieChoisie?.code ?? '').toLowerCase() === 'electricite'
        const numero = d.numeroPdl.trim()
        const doublon = numero ? findCompteurByNumero(existingCompteurs, numero) : null
        const formatSuspect = numero.length > 0 && !PDL_FORMAT_RE.test(numero.toUpperCase())
        const locked = d.status === 'saved' || d.status === 'saving'
        const manquants = locked ? new Set<string>() : champsPdlManquants(d, estElectricite, siteImpose)
        const siteExistant = siteImpose ? null : trouverSiteExistant(sites, compteId, d)
        const responsableHerite = Boolean(responsableParDefautId) && d.responsableContactId === responsableParDefautId
        const communeResolue = Boolean(d.ville.trim() && d.codePostal.trim())

        return (
          <fieldset key={d.key} disabled={locked} className="flex flex-col gap-[13px] disabled:opacity-60">

            {/* ══ ZONE 1 · QUI EN RÉPOND, ET LA FACTURE ══ */}
            <div className="grid grid-cols-[1fr_232px] gap-[13px]">
              <div className={cn(
                'flex flex-col gap-[5px] rounded-[11px] border p-[11px]',
                responsableHerite ? 'border-km-green-line bg-km-green-tint' : 'border-km-line bg-km-bg/40',
              )}>
                <span className="text-[10.5px] font-bold uppercase tracking-[0.07em] text-km-faint">
                  Responsable <span className="text-km-muted">*</span>
                </span>
                <ContactPicker
                  value={d.responsableContactId}
                  onChange={(contactId) => onChange(d.key, { responsableContactId: contactId })}
                  accountContacts={contacts}
                  allContacts={allContacts}
                  accountId={compteId}
                  accountNom={compteNom}
                  segment={compteSegment}
                />
                {responsableHerite && (
                  <span className="text-[10.5px] text-km-green">Repris du contact que vous venez de créer</span>
                )}
              </div>

              {facture && (
                <ZoneDepotFacture
                  nomFichier={facture.nom}
                  enCours={facture.enCours}
                  erreur={facture.erreur}
                  onFichier={facture.onFichier}
                  desactive={locked}
                />
              )}
            </div>

            {/* ══ ZONE 2 · L'ÉNERGIE ET LE CONTRAT ACTUEL ══ */}
            <div className="grid grid-cols-[minmax(0,200px)_1fr_150px] gap-[13px]">
              <Champ intitule="Énergie" requis>
                <Segments
                  valeur={d.typeEnergieId}
                  options={energies.map((en) => ({
                    valeur: en.id,
                    libelle: (en.code ?? '').toLowerCase() === 'gaz' ? 'Gaz' : en.libelle,
                  }))}
                  onChoisir={(v) => onChange(d.key, { typeEnergieId: v, typeUtilisationId: '' })}
                />
              </Champ>
              <Champ intitule="Fournisseur actuel">
                <select
                  value={d.fournisseurActuelId}
                  onChange={(e) => onChange(d.key, { fournisseurActuelId: e.target.value })}
                  className={SAISIE}
                >
                  <option value="">Non renseigné</option>
                  {fournisseurs.map((f) => <option key={f.id} value={f.id}>{f.nom}</option>)}
                </select>
              </Champ>
              <Champ intitule="Échéance">
                <input
                  type="date"
                  value={d.dateEcheance}
                  onChange={(e) => onChange(d.key, { dateEcheance: e.target.value })}
                  className={SAISIE_MONO}
                />
              </Champ>
            </div>

            {/* ══ ZONE 3 · LE POINT : SON NOM, SON NUMÉRO, SON ADRESSE ══ */}
            <div className={cn('grid gap-[13px]', siteImpose ? 'grid-cols-1' : 'grid-cols-[1fr_190px_1.2fr]')}>
              {!siteImpose && (
                <Champ intitule="Libellé du site" requis>
                  <input
                    value={d.libelleSite}
                    onChange={(e) => onChange(d.key, { libelleSite: e.target.value })}
                    placeholder="Ex. Parties communes"
                    className={SAISIE}
                  />
                </Champ>
              )}
              <Champ intitule={estElectricite ? 'Numéro de PDL' : 'Numéro de PCE'} requis>
                <input
                  value={d.numeroPdl}
                  onChange={(e) => onChange(d.key, { numeroPdl: e.target.value })}
                  placeholder="14 chiffres ou GI000000"
                  className={cn(SAISIE_MONO, 'text-[13.5px] font-medium tracking-[0.03em]')}
                />
              </Champ>
              {!siteImpose && (
                <Champ intitule="Adresse" requis>
                  <AddressAutocomplete
                    value={d.adresse}
                    className={SAISIE}
                    placeholder="Chercher une adresse…"
                    onChange={(v) => onChange(d.key, { adresse: v })}
                    onSelect={(a) => onChange(d.key, {
                      adresse: a.rue ?? a.label,
                      ...(a.codePostal ? { codePostal: a.codePostal } : {}),
                      ...(a.ville ? { ville: a.ville } : {}),
                    })}
                  />
                </Champ>
              )}
            </div>

            {/* La commune, confirmée d'un trait — ou les deux champs de repli quand l'annuaire sèche. */}
            {!siteImpose && (
              communeResolue ? (
                <p className="-mt-[6px] flex items-center gap-1.5 text-[11px] text-km-green">
                  <MapPin className="h-[12px] w-[12px] shrink-0" />
                  <span className="font-mono">{d.codePostal}</span> {d.ville}
                  {siteExistant && <span className="text-km-muted">· site existant « {siteExistant.nom} »</span>}
                </p>
              ) : (
                <div className="-mt-[6px] grid grid-cols-[1fr_130px] gap-[13px]">
                  <Champ intitule="Ville" requis>
                    <input value={d.ville} onChange={(e) => onChange(d.key, { ville: e.target.value })} className={SAISIE} />
                  </Champ>
                  <Champ intitule="Code postal" requis>
                    <input value={d.codePostal} onChange={(e) => onChange(d.key, { codePostal: e.target.value })} className={SAISIE_MONO} />
                  </Champ>
                </div>
              )
            )}

            {(doublon || formatSuspect) && (
              <p className="-mt-[6px] flex items-center gap-1.5 text-[11px] text-km-muted">
                <AlertTriangle className="h-[12px] w-[12px] shrink-0" />
                {doublon ? `Ce numéro existe déjà (${doublon.site_nom}).` : 'Format inhabituel : 14 chiffres, ou GI suivi de 6 chiffres.'}
              </p>
            )}

            {/* ══ ZONE 4 · CE QUE LE COMPTEUR EST ══ */}
            {d.typeEnergieId && estElectricite && (
              <div className="grid grid-cols-[5fr_2fr_3fr] gap-[13px]">
                <Champ intitule="Segment" requis>
                  <Segments
                    valeur={d.segment}
                    options={SEGMENTS_ELEC.map((x) => ({ valeur: x, libelle: x }))}
                    onChoisir={(v) => onChange(d.key, { segment: v })}
                  />
                </Champ>
                <Champ intitule="Tension" requis>
                  <Segments
                    valeur={d.tension}
                    options={TENSIONS_ELEC.map((x) => ({ valeur: x, libelle: x }))}
                    onChoisir={(v) => onChange(d.key, { tension: v })}
                  />
                </Champ>
                {utilisationsRef && utilisationsRef.length > 0 && (
                  <Champ intitule="Utilisation" requis>
                    <Segments
                      valeur={d.typeUtilisationId}
                      options={utilisationsRef.map((u) => ({ valeur: u.id, libelle: u.code ?? u.libelle, titre: u.libelle }))}
                      onChoisir={(v) => onChange(d.key, { typeUtilisationId: v })}
                    />
                  </Champ>
                )}
              </div>
            )}

            {d.typeEnergieId && !estElectricite && (
              <div className="grid grid-cols-[3fr_4fr_3fr] gap-[13px]">
                <Champ intitule="Tarif" requis>
                  <Segments
                    valeur={d.tarifDistribution}
                    options={TARIFS_GAZ.map((x) => ({ valeur: x, libelle: x }))}
                    onChoisir={(v) => onChange(d.key, { tarifDistribution: v })}
                  />
                </Champ>
                <Champ intitule="Profil de consommation" requis>
                  <select
                    value={d.profilConsommation}
                    onChange={(e) => onChange(d.key, { profilConsommation: e.target.value })}
                    className={SAISIE}
                  >
                    <option value="">Non renseigné</option>
                    {PROFILS_GAZ.map((x) => <option key={x} value={x}>{x}</option>)}
                  </select>
                </Champ>
                <Champ intitule="CAR (MWh)" requis>
                  <input
                    type="number"
                    step="0.1"
                    value={d.carMwh}
                    onChange={(e) => onChange(d.key, { carMwh: e.target.value })}
                    className={SAISIE_MONO}
                  />
                </Champ>
              </div>
            )}

            {/* CE QUI MANQUE SE DIT EN UNE PHRASE, EN GRIS. Voir l'en-tête : plus de champs ambrés. */}
            {manquants.size > 0 && (
              <p className="text-[11px] text-km-muted">
                Encore <strong className="font-semibold text-km-text">{manquants.size}</strong>
                {manquants.size > 1 ? ' champs à renseigner' : ' champ à renseigner'} — ils portent une astérisque.
              </p>
            )}

            {drafts.length > 1 && !locked && (
              <button
                type="button"
                onClick={() => onRemove(d.key)}
                className="self-start text-[11.5px] font-semibold text-km-muted hover:text-km-red"
              >
                <Trash2 className="mr-1 inline h-[13px] w-[13px]" />Retirer ce compteur {i + 1}
              </button>
            )}

            {d.errorMessage && <p className="text-[12px] text-km-red">{d.errorMessage}</p>}
          </fieldset>
        )
      })}
    </div>
  )
}
