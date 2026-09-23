import type { ReactNode } from 'react'
import { AlertTriangle, MapPin, Plus, Trash2 } from 'lucide-react'
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

   C'EST CE COMPOSANT QUI CHANGE, ET PAS UNE COPIE DE CE COMPOSANT. Il sert aussi la création de
   compteur depuis la fiche compte et depuis la liste des sites. Un second formulaire PDL rien que
   pour la conversion finirait par diverger sur l'éligibilité fournisseur, et c'est la cotation qui
   paierait l'écart.

   L'ORDRE DES CHAMPS EST CELUI QUE WILLIAM A DICTÉ le 23/09/2026 : l'énergie en haut à droite ;
   le libellé et le numéro sur une ligne ; l'adresse en recherche ; segment, tension et utilisation
   sur une ligne ; les puissances ; le fournisseur et l'échéance ; le contact pour finir. C'est
   l'ordre dans lequel on lit une facture, et c'est ce qui le rend fluide.

   CE QUI NE CHANGE PAS : les champs écrits en base, les règles d'obligation, le repérage des
   doublons, le contrôle de format, la reprise d'un site existant. Aucune ligne de
   `champsPdlManquants` n'est touchée. */

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
 * ══ LA VALEUR RETENUE EST EN VERT PLEIN, ET C'EST UNE CORRECTION ══
 *
 * William, 23/09/2026 : « améliore le design des toggles pour rendre la valeur sélectionnée plus
 * lisible ». La première version posait la valeur retenue en blanc sur un fond gris pâle : la
 * différence tenait à une ombre de 1 px, invisible sur un écran mat. Le vert plein est le même
 * signal que l'interrupteur Électricité / Gaz qu'il a retenu, et il se voit de loin.
 *
 * IL NE VAUT QUE JUSQU'À CINQ CHOIX venus d'une liste fermée. Au-delà — les neuf profils gaz, les
 * 52 fournisseurs — il deviendrait une bouillie de pastilles, et la liste déroulante reste la
 * bonne réponse.
 */
function Segments({ valeur, options, onChoisir, manquant }: {
  valeur: string
  options: { valeur: string; libelle: string; titre?: string }[]
  onChoisir: (v: string) => void
  manquant?: boolean
}) {
  return (
    <div className={cn(
      'flex gap-[3px] rounded-[10px] border bg-km-soft p-[3px]',
      manquant ? BORDURE_MANQUANT : 'border-km-line',
    )}>
      {options.map((o) => (
        <button
          key={o.valeur}
          type="button"
          title={o.titre}
          onClick={() => onChoisir(o.valeur === valeur ? '' : o.valeur)}
          className={cn(
            'flex-1 rounded-[7px] px-[6px] py-[7px] text-[12.5px] transition-colors',
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
        // La commune est-elle résolue ? C'est elle qui décide si l'on montre une ligne de confirmation
        // ou les deux champs de repli -- voir le commentaire du bloc adresse.
        const communeResolue = Boolean(d.ville.trim() && d.codePostal.trim())

        return (
          <div
            key={d.key}
            className={cn(
              'rounded-[14px] border p-[18px]',
              d.status === 'saved' ? 'border-km-green-line bg-km-green-tint' : 'border-km-line bg-white',
            )}
          >
            {/* ── L'EN-TÊTE : l'intitulé à gauche, l'énergie à droite ── */}
            <div className="mb-[15px] flex items-center gap-3">
              <span className="text-[11.5px] font-bold uppercase tracking-[0.06em] text-km-green">
                {drafts.length > 1 ? `Compteur ${i + 1}` : 'Le compteur'}
                {d.status === 'saved' && ' — créé'}
              </span>
              <span className="flex-1" />
              {!locked && (
                <div className={cn('flex gap-2', manque('typeEnergieId') && 'rounded-[9px] ring-2 ring-km-amber')}>
                  {energies.map((en) => (
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
                      {(en.code ?? '').toLowerCase() === 'gaz' ? 'Gaz' : en.libelle}
                    </button>
                  ))}
                </div>
              )}
              {!locked && drafts.length > 1 && (
                <button type="button" onClick={() => onRemove(d.key)} aria-label="Retirer ce compteur" className="text-km-faint hover:text-km-red">
                  <Trash2 className="h-[15px] w-[15px]" />
                </button>
              )}
            </div>

            <fieldset disabled={locked} className="flex flex-col gap-[13px] disabled:opacity-60">

              {/* ── LE LIBELLÉ ET LE NUMÉRO, SUR UNE LIGNE ──
                  Ce sont les deux choses qu'on lit sur la facture avant tout le reste : le nom
                  qu'on donne au point, et son identifiant. */}
              <div className="grid grid-cols-[1fr_260px] gap-[13px]">
                {!siteImpose ? (
                  <Champ intitule="Libellé du site" requis>
                    <input
                      value={d.libelleSite}
                      onChange={(e) => onChange(d.key, { libelleSite: e.target.value })}
                      placeholder="Ex. Les Tilleuls — parties communes"
                      className={cn(SAISIE, kManque('libelleSite'))}
                    />
                  </Champ>
                ) : <span />}
                <Champ intitule={estElectricite ? 'Numéro de PDL' : 'Numéro de PCE'} requis>
                  <input
                    value={d.numeroPdl}
                    onChange={(e) => onChange(d.key, { numeroPdl: e.target.value })}
                    placeholder="14 chiffres"
                    className={cn(
                      'w-full rounded-[10px] border bg-white px-[13px] py-[10px] font-mono text-[14px] font-medium tracking-[0.03em] text-km-text outline-none transition-shadow focus:border-km-green focus:shadow-[0_0_0_3px_rgba(13,122,95,.12)]',
                      manque('numeroPdl') ? BORDURE_MANQUANT : 'border-km-line',
                    )}
                  />
                </Champ>
              </div>

              {(doublon || formatSuspect) && (
                <p className="-mt-[5px] flex items-center gap-1.5 text-[11.5px] text-km-amber">
                  <AlertTriangle className="h-[14px] w-[14px] shrink-0" />
                  {doublon ? `Un compteur avec ce numéro existe déjà (${doublon.site_nom}).` : 'Format inhabituel — vérifiez avant de continuer.'}
                </p>
              )}

              {/* ── L'ADRESSE : UN SEUL CHAMP ──
                  William, 23/09/2026 : « une barre de recherche d'adresse […] au clic renseigne
                  l'adresse dans un champ même si en base c'est divisé entre les champs adresse +
                  ville + code postal ».

                  LA BASE GARDE TOUJOURS TROIS COLONNES : `adresse`, `ville` et `code_postal`
                  alimentent `compteurs.adresse_site`, donc la recherche, et le site créé ou
                  retrouvé s'appuie sur les trois. Choisir une suggestion les remplit toutes les
                  trois d'un coup ; la commune se confirme en dessous, en clair.

                  LES DEUX CHAMPS DE REPLI NE S'AFFICHENT QUE S'IL LE FAUT. L'annuaire ne connaît
                  pas toutes les adresses — une zone d'activité récente, un lieu-dit — et l'adresse
                  reste alors tapée à la main, sans commune. Les masquer pour de bon rendrait ces
                  cas-là insaisissables, alors qu'ils sont justement ceux où l'on a besoin d'aide. */}
              {!siteImpose && (
                <div className="flex flex-col gap-[8px]">
                  <Champ intitule="Adresse" requis>
                    <AddressAutocomplete
                      value={d.adresse}
                      className={cn(SAISIE, kManque('adresse'))}
                      placeholder="Chercher une adresse…"
                      onChange={(v) => onChange(d.key, { adresse: v })}
                      onSelect={(a) => onChange(d.key, {
                        adresse: a.rue ?? a.label,
                        ...(a.codePostal ? { codePostal: a.codePostal } : {}),
                        ...(a.ville ? { ville: a.ville } : {}),
                      })}
                    />
                  </Champ>

                  {communeResolue ? (
                    <p className="flex items-center gap-1.5 text-[11.5px] text-km-green">
                      <MapPin className="h-[13px] w-[13px] shrink-0" />
                      <span className="font-mono">{d.codePostal}</span> {d.ville}
                      {siteExistant && <span className="text-km-muted">· rattaché au site « {siteExistant.nom} »</span>}
                    </p>
                  ) : (
                    <div className="grid grid-cols-[1fr_140px] gap-[13px]">
                      <Champ intitule="Ville" requis complement="l'adresse n'a pas été reconnue">
                        <input value={d.ville} onChange={(e) => onChange(d.key, { ville: e.target.value })} className={cn(SAISIE, kManque('ville'))} />
                      </Champ>
                      <Champ intitule="Code postal" requis>
                        <input value={d.codePostal} onChange={(e) => onChange(d.key, { codePostal: e.target.value })} className={cn(SAISIE_MONO, kManque('codePostal'))} />
                      </Champ>
                      {siteExistant && (
                        <p className="col-span-2 flex items-center gap-1.5 text-[11.5px] text-km-green">
                          <MapPin className="h-[13px] w-[13px] shrink-0" />
                          Sera rattaché au site existant « {siteExistant.nom} ».
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* ── SEGMENT, TENSION, UTILISATION : LES TROIS SUR UNE LIGNE ──
                  Les libellés de la table sont « Courte / Moyenne / Longue utilisation » ; sur une
                  pastille de 60 px c'est le code qui se lit, et le libellé entier reste en infobulle. */}
              {estElectricite && (
                <div className="grid grid-cols-[5fr_2fr_3fr] gap-[13px]">
                  <Champ intitule="Segment" requis>
                    <Segments
                      valeur={d.segment}
                      manquant={manque('segment')}
                      options={SEGMENTS_ELEC.map((x) => ({ valeur: x, libelle: x }))}
                      onChoisir={(v) => onChange(d.key, { segment: v })}
                    />
                  </Champ>
                  <Champ intitule="Tension" requis>
                    <Segments
                      valeur={d.tension}
                      manquant={manque('tension')}
                      options={TENSIONS_ELEC.map((x) => ({ valeur: x, libelle: x }))}
                      onChoisir={(v) => onChange(d.key, { tension: v })}
                    />
                  </Champ>
                  {utilisationsRef && utilisationsRef.length > 0 && (
                    <Champ intitule="Utilisation" requis>
                      <Segments
                        valeur={d.typeUtilisationId}
                        manquant={manque('typeUtilisationId')}
                        options={utilisationsRef.map((u) => ({ valeur: u.id, libelle: u.code ?? u.libelle, titre: u.libelle }))}
                        onChoisir={(v) => onChange(d.key, { typeUtilisationId: v })}
                      />
                    </Champ>
                  )}
                </div>
              )}

              {/* ── LES PUISSANCES ── */}
              {estElectricite && (
                d.segment === 'C5' ? (
                  <Champ intitule="PS Unique (kW)" requis className="max-w-[200px]">
                    <input
                      type="number"
                      step="0.1"
                      value={d.puissanceParClasseKva.base ?? ''}
                      onChange={(e) => onChange(d.key, { puissanceParClasseKva: { ...d.puissanceParClasseKva, base: e.target.value } })}
                      className={cn(SAISIE_MONO, kManque('ps:base'))}
                    />
                  </Champ>
                ) : d.segment ? (
                  <div className="flex flex-col gap-[9px]">
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

              {/* ── LE GAZ : tarif, profil, CAR ── */}
              {d.typeEnergieId && !estElectricite && (
                <div className="grid grid-cols-[3fr_4fr_3fr] gap-[13px]">
                  <Champ intitule="Tarif" requis>
                    <Segments
                      valeur={d.tarifDistribution}
                      manquant={manque('tarifDistribution')}
                      options={TARIFS_GAZ.map((x) => ({ valeur: x, libelle: x }))}
                      onChoisir={(v) => onChange(d.key, { tarifDistribution: v })}
                    />
                  </Champ>
                  <Champ intitule="Profil de consommation" requis>
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
                  <Champ intitule="CAR (MWh)" requis>
                    <input
                      type="number"
                      step="0.1"
                      value={d.carMwh}
                      onChange={(e) => onChange(d.key, { carMwh: e.target.value })}
                      className={cn(SAISIE_MONO, kManque('carMwh'))}
                    />
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

              {/* ── LE RESPONSABLE, POUR FINIR ── */}
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
