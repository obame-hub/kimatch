import type { ReactNode } from 'react'
import { AlertTriangle, Check, CheckCircle2, Flame, Plus, Trash2, Zap } from 'lucide-react'
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
const CLASSES_PUISSANCE_ELEC: { key: string; label: string }[] = [
  { key: 'pointe', label: 'PS POINTE (kVA)' },
  { key: 'hph', label: 'PS HPH (kVA)' },
  { key: 'hch', label: 'PS HCH (kVA)' },
  { key: 'hpe', label: 'PS HPE (kVA)' },
  { key: 'hce', label: 'PS HCE (kVA)' },
]

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
    const classes = d.segment === 'C5' ? ['base'] : CLASSES_PUISSANCE_ELEC.map((c) => c.key)
    for (const k of classes) {
      if (!(d.puissanceParClasseKva[k] ?? '').trim()) manquants.add(`ps:${k}`)
    }
  } else {
    if (!d.tarifDistribution) manquants.add('tarifDistribution')
    if (!d.profilConsommation) manquants.add('profilConsommation')
    if (!d.carMwh.trim()) manquants.add('carMwh')
  }
  return manquants
}

/* La bordure d'un champ requis encore vide s'appelle maintenant `BORDURE_MANQUANT`, plus bas, et
   prend ses teintes aux jetons `km-amber` plutôt qu'à la palette Tailwind brute. Même signal. */

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
   LE VOCABULAIRE DU FORMULAIRE — posé une fois, employé partout
   ══════════════════════════════════════════════════════════════════════════════════════════════

   William, 23/09/2026 : « le design du périmètre avec les champs ne correspond pas du tout à ton
   design proposé ». Il avait raison : la fenêtre était au dessin, son contenu non.

   C'EST CE COMPOSANT QUI CHANGE, ET PAS UNE COPIE DE CE COMPOSANT. Il sert aussi la création de
   compteur depuis la fiche compte et depuis la liste des sites. Un second formulaire PDL rien que
   pour la conversion finirait par diverger sur l'éligibilité fournisseur, et c'est la cotation qui
   paierait l'écart. Les trois écrans gagnent donc la même présentation.

   CE QUI CHANGE : les listes déroulantes de deux à cinq choix deviennent des segments — un clic au
   lieu de deux, et on voit les options sans rien ouvrir ; l'énergie devient deux cartes ; le numéro
   de PDL passe en chasse fixe et en grand, parce que quatorze chiffres en police proportionnelle
   ne se vérifient pas d'un coup d'œil.

   CE QUI NE CHANGE PAS : les champs, les règles d'obligation, le repérage des doublons, le contrôle
   de format, la reprise d'un site existant. Aucune ligne de `champsPdlManquants` n'est touchée. */

const SAISIE = 'w-full rounded-[10px] border border-km-line bg-white px-[13px] py-[10px] text-[13.5px] text-km-text outline-none transition-shadow focus:border-km-green focus:shadow-[0_0_0_3px_rgba(13,122,95,.12)] disabled:bg-km-soft'
const SAISIE_MONO = 'w-full rounded-[10px] border border-km-line bg-white px-[13px] py-[10px] font-mono text-[13px] text-km-text outline-none transition-shadow focus:border-km-green focus:shadow-[0_0_0_3px_rgba(13,122,95,.12)] disabled:bg-km-soft'
/** Le manquant se signale par la bordure, comme avant — seule la teinte suit les jetons. */
const BORDURE_MANQUANT = 'border-km-amber bg-km-amber-soft/40'

function Champ({ intitule, requis, complement, children, className }: {
  intitule: string
  requis?: boolean
  complement?: string
  children: ReactNode
  className?: string
}) {
  return (
    <div className={cn('flex min-w-0 flex-col gap-[7px]', className)}>
      <span className="text-[11.5px] font-semibold text-km-muted">
        {intitule}
        {requis && <span className="text-km-amber"> *</span>}
        {complement && <span className="font-normal text-km-faint"> — {complement}</span>}
      </span>
      {children}
    </div>
  )
}

/**
 * Le sélecteur à segments.
 *
 * IL REMPLACE UNE LISTE DÉROULANTE, PAS UN CHAMP LIBRE : il ne vaut que jusqu'à cinq choix venus
 * d'une liste fermée (segment, tension, tarif, utilisation). Au-delà — les 52 fournisseurs — il
 * deviendrait une bouillie de pastilles, et la liste déroulante reste la bonne réponse.
 */
function Segments({ valeur, options, onChoisir, manquant, compact }: {
  valeur: string
  options: { valeur: string; libelle: string }[]
  onChoisir: (v: string) => void
  manquant?: boolean
  /** Chasse fixe : pour les codes alignés (C5, T2, HTA) plutôt que pour des mots. */
  compact?: boolean
}) {
  return (
    <div className={cn(
      'flex gap-[2px] rounded-[10px] border bg-km-soft p-[3px]',
      manquant ? BORDURE_MANQUANT : 'border-km-line',
    )}>
      {options.map((o) => (
        <button
          key={o.valeur}
          type="button"
          onClick={() => onChoisir(o.valeur === valeur ? '' : o.valeur)}
          className={cn(
            'flex-1 rounded-[7px] py-[7px] text-[12.5px] transition-colors',
            compact && 'font-mono',
            o.valeur === valeur
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

/** Le choix de l'énergie : deux cartes, parce que c'est la décision qui commande tout le reste. */
function CarteEnergie({ libelle, aide, choisie, gaz, onChoisir }: {
  libelle: string
  aide: string
  choisie: boolean
  gaz: boolean
  onChoisir: () => void
}) {
  const Icone = gaz ? Flame : Zap
  return (
    <button
      type="button"
      onClick={onChoisir}
      className={cn(
        'flex flex-1 items-center gap-3 rounded-[13px] border p-[14px] text-left transition-colors',
        choisie
          ? 'border-[1.5px] border-km-green bg-km-green-tint shadow-[0_0_0_3px_rgba(13,122,95,.10)]'
          : 'border-km-line bg-white hover:bg-km-bg/60',
      )}
    >
      <span className={cn(
        'flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-[10px]',
        choisie ? 'bg-km-green' : 'bg-km-soft',
      )}>
        <Icone className={cn('h-[18px] w-[18px]', choisie ? 'text-white' : 'text-km-muted')} />
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className={cn('text-[14px] font-semibold', choisie ? 'text-km-text' : 'text-km-muted')}>{libelle}</span>
        <span className="text-[11px] text-km-faint">{aide}</span>
      </span>
      {choisie && (
        <span className="flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full bg-km-green">
          <Check className="h-[10px] w-[10px] stroke-[3.6] text-white" />
        </span>
      )}
    </button>
  )
}

export function PdlDraftRows({
  drafts,
  onChange,
  onRemove,
  onAdd,
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
}: {
  drafts: PdlDraft[]
  onChange: (key: string, patch: Partial<PdlDraft>) => void
  onRemove: (key: string) => void
  onAdd: () => void
  energies: ReferenceRow[]
  utilisationsRef?: ReferenceRow[]
  fournisseurs: Compte[]
  /** Contacts rattachés au compte -- premier onglet du sélecteur de responsable. */
  contacts: Contact[]
  /** Tous les contacts du CRM -- second onglet (« Autre contact ») du sélecteur. */
  allContacts: Contact[]
  compteId: string
  compteNom: string
  compteSegment?: string | null
  existingCompteurs: Compteur[]
  /** Sites du compte -- sert à retrouver un site existant au lieu d'en créer un doublon. */
  sites?: Site[]
  /** Vrai quand on part déjà d'une fiche site : le site est connu, on masque ses champs. */
  siteImpose?: boolean
  /** Le responsable posé d'avance — le contact que la conversion vient de créer. Sert ici à DIRE
   *  d'où il vient, pour qu'on ne croie pas à une valeur tombée du ciel. */
  responsableParDefautId?: string
}) {
  return (
    <div className="space-y-4">
      {drafts.map((d, i) => {
        const energieChoisie = energies.find((e) => e.id === d.typeEnergieId)
        const estElectricite = (energieChoisie?.code ?? '').toLowerCase() === 'electricite'
        const numero = d.numeroPdl.trim()
        const doublon = numero ? findCompteurByNumero(existingCompteurs, numero) : null
        const formatSuspect = numero.length > 0 && !PDL_FORMAT_RE.test(numero.toUpperCase())
        const locked = d.status === 'saved' || d.status === 'saving'
        // Champs requis encore vides -- surlignés en ambre tant qu'ils ne sont pas remplis (Tools).
        const manquants = locked ? new Set<string>() : champsPdlManquants(d, estElectricite, siteImpose)
        // Site existant correspondant à la saisie -- on le signale plutôt que de créer un doublon.
        const siteExistant = siteImpose ? null : trouverSiteExistant(sites, compteId, d)
        const manque = (f: string) => manquants.has(f)
        const kManque = (f: string) => (manque(f) ? BORDURE_MANQUANT : undefined)
        const responsableHerite = Boolean(responsableParDefautId) && d.responsableContactId === responsableParDefautId

        return (
          <div
            key={d.key}
            className={cn(
              'rounded-[14px] border p-[18px]',
              d.status === 'saved' ? 'border-km-green-line bg-km-green-tint' : 'border-km-line bg-white',
            )}
          >
            <div className="mb-[15px] flex items-center gap-3">
              <span className="text-[11.5px] font-bold uppercase tracking-[0.06em] text-km-green">
                {drafts.length > 1 ? `Compteur ${i + 1}` : 'Le compteur'}
                {d.status === 'saved' && ' — créé'}
              </span>
              <span className="flex-1" />
              {/* L'énergie se choisit ici, en tête : c'est elle qui commande tous les champs du bas. */}
              {!locked && (
                <div className="flex gap-2">
                  {energies.map((en) => {
                    const gaz = (en.code ?? '').toLowerCase() === 'gaz'
                    return (
                      <button
                        key={en.id}
                        type="button"
                        onClick={() => onChange(d.key, { typeEnergieId: en.id, typeUtilisationId: '' })}
                        className={cn(
                          'rounded-[8px] px-[13px] py-[6px] text-[12px] transition-colors',
                          d.typeEnergieId === en.id
                            ? 'bg-km-green font-semibold text-white'
                            : 'bg-km-soft font-medium text-km-muted hover:text-km-text',
                        )}
                      >
                        {gaz ? 'Gaz' : en.libelle}
                      </button>
                    )
                  })}
                </div>
              )}
              {!locked && drafts.length > 1 && (
                <button type="button" onClick={() => onRemove(d.key)} aria-label="Retirer ce compteur" className="text-km-faint hover:text-km-red">
                  <Trash2 className="h-[15px] w-[15px]" />
                </button>
              )}
            </div>

            <fieldset disabled={locked} className="flex flex-col gap-[15px] disabled:opacity-60">

              {/* ── L'ÉNERGIE, EN DEUX CARTES, TANT QU'ELLE N'EST PAS CHOISIE ── */}
              {!d.typeEnergieId && (
                <div className="flex gap-[11px]">
                  {energies.map((en) => {
                    const gaz = (en.code ?? '').toLowerCase() === 'gaz'
                    return (
                      <CarteEnergie
                        key={en.id}
                        libelle={gaz ? 'Gaz' : en.libelle}
                        aide={gaz ? 'PCE à 14 chiffres' : 'PDL à 14 chiffres'}
                        gaz={gaz}
                        choisie={false}
                        onChoisir={() => onChange(d.key, { typeEnergieId: en.id, typeUtilisationId: '' })}
                      />
                    )
                  })}
                </div>
              )}
              {manque('typeEnergieId') && (
                <p className="text-[11.5px] text-km-amber">Choisissez l'énergie : elle commande le reste du formulaire.</p>
              )}

              {/* ── LE NUMÉRO, EN GRAND ET EN CHASSE FIXE ── */}
              {d.typeEnergieId && (
                <Champ intitule={estElectricite ? 'Numéro de PDL' : 'Numéro de PCE'} requis>
                  <input
                    value={d.numeroPdl}
                    onChange={(e) => onChange(d.key, { numeroPdl: e.target.value })}
                    placeholder="14 chiffres"
                    className={cn(
                      'w-full rounded-[10px] border bg-white px-[14px] py-[12px] font-mono text-[15.5px] font-medium tracking-[0.04em] text-km-text outline-none transition-shadow focus:border-km-green focus:shadow-[0_0_0_3px_rgba(13,122,95,.12)]',
                      manque('numeroPdl') ? BORDURE_MANQUANT : 'border-km-line',
                    )}
                  />
                  {(doublon || formatSuspect) && (
                    <p className="flex items-center gap-1.5 text-[11.5px] text-km-amber">
                      <AlertTriangle className="h-[14px] w-[14px] shrink-0" />
                      {doublon ? `Un compteur avec ce numéro existe déjà (${doublon.site_nom}).` : 'Format inhabituel — vérifiez avant de continuer.'}
                    </p>
                  )}
                </Champ>
              )}

              {/* ── LE SITE ── */}
              {!siteImpose && (
                <div className="flex flex-col gap-[13px] rounded-[12px] border border-km-line bg-km-bg/40 p-[14px]">
                  <span className="text-[10.5px] font-bold uppercase tracking-[0.1em] text-km-faint">Où se trouve ce compteur</span>
                  <div className="grid grid-cols-2 gap-[13px]">
                    <Champ intitule="Libellé du site" requis>
                      <input
                        value={d.libelleSite}
                        onChange={(e) => onChange(d.key, { libelleSite: e.target.value })}
                        placeholder="Ex. Les Tilleuls — parties communes"
                        className={cn(SAISIE, kManque('libelleSite'))}
                      />
                    </Champ>
                    <Champ intitule="Adresse" requis>
                      <AddressAutocomplete
                        value={d.adresse}
                        className={cn(SAISIE, kManque('adresse'))}
                        onChange={(v) => onChange(d.key, { adresse: v })}
                        onSelect={(a) => onChange(d.key, {
                          adresse: a.rue ?? a.label,
                          ...(a.codePostal ? { codePostal: a.codePostal } : {}),
                          ...(a.ville ? { ville: a.ville } : {}),
                        })}
                      />
                    </Champ>
                    <Champ intitule="Ville" requis>
                      <input value={d.ville} onChange={(e) => onChange(d.key, { ville: e.target.value })} className={cn(SAISIE, kManque('ville'))} />
                    </Champ>
                    <Champ intitule="Code postal" requis>
                      <input value={d.codePostal} onChange={(e) => onChange(d.key, { codePostal: e.target.value })} className={cn(SAISIE_MONO, kManque('codePostal'))} />
                    </Champ>
                  </div>
                  {siteExistant && (
                    <p className="flex items-start gap-1.5 text-[11.5px] text-km-green">
                      <CheckCircle2 className="mt-0.5 h-3 w-3 shrink-0" />
                      Sera rattaché au site existant « {siteExistant.nom} ».
                    </p>
                  )}
                </div>
              )}

              {/* ── LES CARACTÉRISTIQUES ── */}
              {d.typeEnergieId && estElectricite && (
                <div className="grid grid-cols-2 gap-[13px]">
                  <Champ intitule="Segment" requis>
                    <Segments
                      compact
                      valeur={d.segment}
                      manquant={manque('segment')}
                      options={SEGMENTS_ELEC.map((x) => ({ valeur: x, libelle: x }))}
                      onChoisir={(v) => onChange(d.key, { segment: v })}
                    />
                  </Champ>
                  <Champ intitule="Tension" requis>
                    <Segments
                      compact
                      valeur={d.tension}
                      manquant={manque('tension')}
                      options={TENSIONS_ELEC.map((x) => ({ valeur: x, libelle: x }))}
                      onChoisir={(v) => onChange(d.key, { tension: v })}
                    />
                  </Champ>
                  {utilisationsRef && utilisationsRef.length > 0 && (
                    <Champ intitule="Type d'utilisation" requis className="col-span-2">
                      <Segments
                        valeur={d.typeUtilisationId}
                        manquant={manque('typeUtilisationId')}
                        options={utilisationsRef.map((u) => ({ valeur: u.id, libelle: u.libelle }))}
                        onChoisir={(v) => onChange(d.key, { typeUtilisationId: v })}
                      />
                    </Champ>
                  )}
                </div>
              )}

              {d.typeEnergieId && estElectricite && (
                d.segment === 'C5' ? (
                  <Champ intitule="PS Unique (kW)" requis className="max-w-[220px]">
                    <input
                      type="number"
                      step="0.1"
                      value={d.puissanceParClasseKva.base ?? ''}
                      onChange={(e) => onChange(d.key, { puissanceParClasseKva: { ...d.puissanceParClasseKva, base: e.target.value } })}
                      className={cn(SAISIE_MONO, kManque('ps:base'))}
                    />
                  </Champ>
                ) : d.segment ? (
                  <div className="flex flex-col gap-[10px]">
                    <div className="grid grid-cols-5 gap-[9px]">
                      {CLASSES_PUISSANCE_ELEC.map((c) => (
                        <Champ key={c.key} intitule={c.label.replace('PS ', '').replace(' (kVA)', '')} requis>
                          <input
                            type="number"
                            step="0.1"
                            value={d.puissanceParClasseKva[c.key] ?? ''}
                            onChange={(e) => onChange(d.key, { puissanceParClasseKva: { ...d.puissanceParClasseKva, [c.key]: e.target.value } })}
                            className={cn(SAISIE_MONO, 'px-[9px]', kManque(`ps:${c.key}`))}
                          />
                        </Champ>
                      ))}
                    </div>
                    {/* Réclamé par William : la plupart des PDL ont la même puissance sur les cinq
                        classes, et les ressaisir une par une est fastidieux. */}
                    <button
                      type="button"
                      onClick={() => {
                        const source = d.puissanceParClasseKva[CLASSES_PUISSANCE_ELEC[0].key] ?? ''
                        if (!source.trim()) return
                        onChange(d.key, {
                          puissanceParClasseKva: Object.fromEntries(CLASSES_PUISSANCE_ELEC.map((c) => [c.key, source])),
                        })
                      }}
                      disabled={!(d.puissanceParClasseKva[CLASSES_PUISSANCE_ELEC[0].key] ?? '').trim()}
                      className="self-start text-[11.5px] font-medium text-km-green hover:underline disabled:cursor-not-allowed disabled:text-km-faint disabled:no-underline"
                    >
                      ⇊ Appliquer la valeur de POINTE à toutes les classes
                    </button>
                  </div>
                ) : null
              )}

              {d.typeEnergieId && !estElectricite && (
                <div className="grid grid-cols-2 gap-[13px]">
                  <Champ intitule="Tarif d'acheminement" requis>
                    <Segments
                      compact
                      valeur={d.tarifDistribution}
                      manquant={manque('tarifDistribution')}
                      options={TARIFS_GAZ.map((x) => ({ valeur: x, libelle: x }))}
                      onChoisir={(v) => onChange(d.key, { tarifDistribution: v })}
                    />
                  </Champ>
                  <Champ intitule="CAR (MWh)" requis>
                    <input
                      type="number"
                      step="0.1"
                      value={d.carMwh}
                      onChange={(e) => onChange(d.key, { carMwh: e.target.value })}
                      className={cn(SAISIE_MONO, kManque('carMwh'))}
                    />
                  </Champ>
                  <Champ intitule="Profil de consommation" requis className="col-span-2">
                    {/* Neuf profils : trop pour des segments, et ils se lisent en liste. */}
                    <select
                      value={d.profilConsommation}
                      onChange={(e) => onChange(d.key, { profilConsommation: e.target.value })}
                      className={cn(SAISIE, kManque('profilConsommation'))}
                    >
                      <option value="">Non renseigné</option>
                      {PROFILS_GAZ.map((x) => <option key={x} value={x}>{x}</option>)}
                    </select>
                  </Champ>
                </div>
              )}

              {/* ── LE CONTRAT ACTUEL : c'est lui qui dit quand l'affaire se joue ── */}
              {d.typeEnergieId && (
                <div className="grid grid-cols-2 gap-[13px]">
                  <Champ intitule="Fournisseur actuel">
                    {/* Cinquante-deux fournisseurs : la liste déroulante reste la bonne réponse. */}
                    <select
                      value={d.fournisseurActuelId}
                      onChange={(e) => onChange(d.key, { fournisseurActuelId: e.target.value })}
                      className={SAISIE}
                    >
                      <option value="">Non renseigné</option>
                      {fournisseurs.map((f) => <option key={f.id} value={f.id}>{f.nom}</option>)}
                    </select>
                  </Champ>
                  <Champ intitule="Échéance du contrat" complement="elle commande la relance">
                    <input
                      type="date"
                      value={d.dateEcheance}
                      onChange={(e) => onChange(d.key, { dateEcheance: e.target.value })}
                      className={SAISIE_MONO}
                    />
                  </Champ>
                </div>
              )}

              {/* ── LE RESPONSABLE ── */}
              <div className={cn(
                'flex flex-col gap-[7px] rounded-[12px] border p-[14px]',
                responsableHerite ? 'border-km-green-line bg-km-green-tint'
                  : manque('responsableContactId') ? 'border-km-amber bg-km-amber-soft/40'
                  : 'border-km-line bg-km-bg/40',
              )}>
                <Champ intitule="Responsable de ce compteur" requis>
                  <ContactPicker
                    value={d.responsableContactId}
                    onChange={(contactId) => onChange(d.key, { responsableContactId: contactId })}
                    accountContacts={contacts}
                    allContacts={allContacts}
                    accountId={compteId}
                    accountNom={compteNom}
                    segment={compteSegment}
                  />
                </Champ>
                {responsableHerite ? (
                  <p className="text-[11.5px] text-km-green">Repris du contact que vous venez de créer — vous pouvez en désigner un autre.</p>
                ) : manque('responsableContactId') ? (
                  <p className="text-[11.5px] text-km-amber">La sélection d'un responsable est obligatoire.</p>
                ) : (
                  <p className="text-[11.5px] text-km-faint">
                    Contacts liés au compte. Si le bon n'apparaît pas, cherchez dans tous les contacts du CRM.
                  </p>
                )}
              </div>
            </fieldset>
            {d.errorMessage && <p className="mt-2 text-[12px] text-km-red">{d.errorMessage}</p>}
          </div>
        )
      })}
      <button
        type="button"
        onClick={onAdd}
        className="flex w-full items-center justify-center gap-2 rounded-[12px] border border-dashed border-km-line py-[13px] text-[12.5px] font-semibold text-km-muted transition-colors hover:bg-km-bg"
      >
        <Plus className="h-[15px] w-[15px]" /> Ajouter un compteur
      </button>
    </div>
  )
}
