import { useMemo, useRef, useState } from 'react'
import { MapPin, RefreshCw, Tag, Zap } from 'lucide-react'
import { CarteLieu } from '@/components/ui/carte-lieu'
import { useQuery } from '@tanstack/react-query'
import { geocoderPrecis, searchAddressBAN, type BanAddress } from '@/lib/banAddress'
import { partMensuelleCar } from '@/lib/profilsGaz'
import { departementFromCodePostal } from '@/lib/departements'
import { cn } from '@/lib/utils'
import type { EcheanceCompteur } from '@/lib/echeance'
import type { Compteur, Consommation } from '@/types/domain'
import {
  Carte, ListeValeurs, MENU_FLOTTANT, Sourcil, ValeurEditable, dateFr, dateHeureFr, joursJusqua, nombreFr, useFermeture,
} from '@/components/compteur/fiche/commun'

/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * FICHE COMPTEUR v4 — LA COLONNE PRINCIPALE (blocs A à D)
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 *
 *   A. Le lieu                     libellé · adresse · localisation, et la vue aérienne
 *   B. Caractéristiques techniques  la plaque : numéro, segment ou tarif, FTA ou profil, échéance
 *   C. Postes horaires              électricité seulement
 *   D. Consommation · 12 mois       barres mensuelles
 */

/** Les deux couleurs d'énergie : électricité dorée, gaz bleuté (le bandeau les inversait). */
export function teintesEnergie(estElec: boolean) {
  return estElec
    ? { acc: '#C8940A', doux: '#FDF1C8', fonce: '#A07404', tresFonce: '#7D5A00' }
    : { acc: '#4A7FA5', doux: '#E9F1F7', fonce: '#2B5F86', tresFonce: '#1F4C6E' }
}

type Enregistrer = (patch: Record<string, unknown>) => Promise<void>

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// A · LE LIEU
// ═══════════════════════════════════════════════════════════════════════════════════════════════

export function BlocLieu({ compteur, modifiable, enregistrer, onToast }: {
  compteur: Compteur
  modifiable: boolean
  enregistrer: Enregistrer
  onToast: (m: string) => void
}) {
  const t = teintesEnergie(compteur.type_energie === 'electricite')
  /* SANS COORDONNÉES EN BASE, on localise l'adresse à l'affichage — voir `geocoderPrecis`. Rien
     n'est écrit : la position enregistrée ne change que quand on modifie l'adresse. */
  const aDesCoordonnees = compteur.latitude != null && compteur.longitude != null
  const { data: localisee } = useQuery({
    queryKey: ['geocodage', compteur.adresse, compteur.code_postal, compteur.ville],
    enabled: !aDesCoordonnees,
    staleTime: Infinity,
    queryFn: () => geocoderPrecis(compteur.adresse, compteur.code_postal, compteur.ville).catch(() => null),
  })
  const lat = aDesCoordonnees ? compteur.latitude : localisee?.latitude
  const lon = aDesCoordonnees ? compteur.longitude : localisee?.longitude
  const ok = () => onToast('✓ enregistré')
  const ko = (e: Error) => onToast(e.message.startsWith('Ce champ') || e.message.startsWith('Format') ? e.message : `Erreur : ${e.message}`)
  const departement = departementFromCodePostal(compteur.code_postal)

  return (
    /* LA CARTE S'ÉLARGIT (William, 30/09/2026) : près de la moitié de la carte, au lieu des 300 px de
       la maquette — assez pour voir le quartier et s'y déplacer. */
    <Carte relief className="grid grid-cols-[minmax(0,1fr)_minmax(320px,48%)] overflow-hidden">
      <div className="flex min-w-0 flex-col justify-center gap-[14px] px-[18px] py-4">
        {/* Le libellé, sans intitulé : c'est le nom du lieu. */}
        <div className="flex items-center gap-3 border-b border-km-line-soft pb-3">
          <span className="flex h-8 w-8 flex-none items-center justify-center rounded-[9px]" style={{ background: t.doux, color: t.acc }}>
            <Tag className="h-[15px] w-[15px]" strokeWidth={2} />
          </span>
          <div className="flex min-w-0 flex-1">
            <ValeurEditable
              valeur={compteur.libelle_site ?? compteur.site_nom ?? ''}
              modifiable={modifiable}
              classeTexte="font-sans text-[20px] font-bold tracking-[-.015em] text-km-text"
              onCommit={async (v) => {
                const propre = v.replace(/\s+/g, ' ').trim()
                if (!propre) throw new Error('Ce champ ne peut pas être vide.')
                await enregistrer({ libelle_site: propre })
              }}
              onSaved={ok}
              onError={ko}
            />
          </div>
        </div>

        {/* ══ L'ADRESSE SUR QUATRE LIGNES — William, 01/10/2026 ══
            « Localisation sur place » est retirée ; l'adresse prend sa place, mise en forme comme une
            adresse postale : n° et rue · complément (masqué s'il est vide) · code postal et ville ·
            n° et nom du département, déduits du code postal. */}
        <div className="group/adresse flex items-start gap-3">
          <span className="mt-0.5 flex h-8 w-8 flex-none items-center justify-center rounded-[9px] bg-km-green-soft text-km-green">
            <MapPin className="h-[14px] w-[14px]" strokeWidth={2} />
          </span>
          <div className="flex min-w-0 flex-1 flex-col gap-[3px]">
            <span className="mb-px text-[10px] font-semibold uppercase tracking-[.05em] text-km-faint">Adresse de consommation</span>
            <RueEditable compteur={compteur} modifiable={modifiable} enregistrer={enregistrer} onSaved={ok} onError={ko} />
            <ComplementEditable compteur={compteur} modifiable={modifiable} enregistrer={enregistrer} onSaved={ok} onError={ko} />
            <ValeurEditable
              valeur={[compteur.code_postal, compteur.ville].filter(Boolean).join(' ')}
              modifiable={modifiable}
              vide="Code postal et ville"
              titre="Cliquer pour modifier — « 68280 Andolsheim »"
              classeTexte="font-sans text-[13px] font-medium text-km-text"
              onCommit={async (v) => {
                const propre = v.replace(/\s+/g, ' ').trim()
                const m = propre.match(/^(\d{5})\s+(.+)$/)
                if (!m) throw new Error('Format attendu : le code postal puis la ville — « 68280 Andolsheim ».')
                const position = await geocoderPrecis(compteur.adresse, m[1], m[2]).catch(() => null)
                await enregistrer({ code_postal: m[1], ville: m[2], ...(position ?? {}) })
              }}
              onSaved={ok}
              onError={ko}
            />
            {departement && (
              <span className="text-[11.5px] text-km-muted">
                <span className="font-mono font-semibold text-km-text">{departement.code}</span> · {departement.nom}
              </span>
            )}
          </div>
        </div>
      </div>
      <CarteLieu lat={lat} lon={lon} hauteurMin={190} />
    </Carte>
  )
}

/**
 * ══ LA RUE SE CHOISIT DANS LA BAN, ET REPLACE LA CARTE ══
 * Le brief : « Modifier l'adresse doit recalculer latitude/longitude (géocodage BAN) ». Une adresse
 * choisie dans les suggestions apporte sa rue, son code postal, sa ville et ses coordonnées ; une
 * rue tapée sans choisir est localisée avec le code postal et la ville déjà connus, et la carte ne
 * bouge que si la BAN en est sûre (`geocoderPrecis`).
 */
function RueEditable({ compteur, modifiable, enregistrer, onSaved, onError }: {
  compteur: Compteur
  modifiable: boolean
  enregistrer: Enregistrer
  onSaved: () => void
  onError: (e: Error) => void
}) {
  const affichee = compteur.adresse ?? ''
  const [edition, setEdition] = useState(false)
  const [brouillon, setBrouillon] = useState('')
  const [suggestions, setSuggestions] = useState<BanAddress[]>([])
  const [actif, setActif] = useState(0)
  const [enCours, setEnCours] = useState(false)
  const minuteur = useRef<ReturnType<typeof setTimeout> | null>(null)
  const envoye = useRef(false)

  function taper(v: string) {
    setBrouillon(v)
    setActif(0)
    if (minuteur.current) clearTimeout(minuteur.current)
    const contexte = [v, compteur.code_postal].filter(Boolean).join(' ')
    minuteur.current = setTimeout(async () => setSuggestions(await searchAddressBAN(contexte).catch(() => [])), 250)
  }

  async function valider(choisie?: BanAddress) {
    if (envoye.current) return
    const texte = brouillon.replace(/\s+/g, ' ').trim()
    if (!choisie && texte === affichee) { setEdition(false); return }
    envoye.current = true
    setEnCours(true)
    setEdition(false)
    try {
      if (choisie) {
        await enregistrer({
          adresse: choisie.rue, code_postal: choisie.codePostal, ville: choisie.ville,
          latitude: choisie.latitude, longitude: choisie.longitude,
        })
      } else {
        const position = texte ? await geocoderPrecis(texte, compteur.code_postal, compteur.ville).catch(() => null) : null
        await enregistrer({ adresse: texte || null, ...(position ?? {}) })
      }
      onSaved()
    } catch (e) {
      onError(e instanceof Error ? e : new Error(String(e)))
    } finally {
      envoye.current = false
      setEnCours(false)
      setSuggestions([])
    }
  }

  if (edition) {
    return (
      <div className="relative">
        <input
          autoFocus
          value={brouillon}
          onChange={(e) => taper(e.target.value)}
          onBlur={() => void valider()}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown' && suggestions.length) { e.preventDefault(); setActif((i) => (i + 1) % suggestions.length) }
            else if (e.key === 'ArrowUp' && suggestions.length) { e.preventDefault(); setActif((i) => (i - 1 + suggestions.length) % suggestions.length) }
            else if (e.key === 'Enter') { e.preventDefault(); void valider(suggestions[actif]) }
            else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); envoye.current = true; setEdition(false); setSuggestions([]); setTimeout(() => { envoye.current = false }, 0) }
          }}
          className="w-full rounded-[8px] border border-km-green px-2 py-0.5 font-sans text-[13.5px] font-semibold text-km-text outline-none shadow-[0_0_0_3px_rgba(13,122,95,.12)]"
        />
        {suggestions.length > 0 && (
          <div className={cn(MENU_FLOTTANT, 'absolute left-0 right-0 top-[calc(100%+4px)]')}>
            {suggestions.map((s, i) => (
              <button
                key={s.label}
                type="button"
                onMouseDown={(e) => { e.preventDefault(); void valider(s) }}
                onMouseEnter={() => setActif(i)}
                className={cn('block w-full truncate rounded-[8px] px-2.5 py-[7px] text-left text-[12.5px] font-semibold text-km-text', i === actif && 'bg-km-soft')}
              >
                {s.label}
              </button>
            ))}
          </div>
        )}
      </div>
    )
  }
  return (
    <div
      role={modifiable ? 'button' : undefined}
      tabIndex={modifiable ? 0 : undefined}
      title={modifiable ? 'Cliquer pour modifier' : undefined}
      onClick={modifiable ? () => { setBrouillon(affichee); setSuggestions([]); setEdition(true) } : undefined}
      onKeyDown={modifiable ? (e) => { if (e.key === 'Enter') { setBrouillon(affichee); setEdition(true) } } : undefined}
      className={cn(
        'max-w-full self-start overflow-hidden text-ellipsis whitespace-nowrap border-b border-dashed border-transparent font-sans text-[13.5px] font-semibold',
        affichee ? 'text-km-text' : 'text-km-faint',
        modifiable && 'cursor-text hover:border-km-green',
        enCours && 'opacity-60',
      )}
    >
      {affichee || 'N° et rue'}
    </div>
  )
}

/** Le complément : masqué s'il est vide — sauf, au survol de l'adresse, le geste pour l'ajouter. */
function ComplementEditable({ compteur, modifiable, enregistrer, onSaved, onError }: {
  compteur: Compteur
  modifiable: boolean
  enregistrer: Enregistrer
  onSaved: () => void
  onError: (e: Error) => void
}) {
  const [ajout, setAjout] = useState(false)
  const valeur = compteur.complement_adresse ?? ''
  if (!valeur && !ajout) {
    if (!modifiable) return null
    return (
      <button
        type="button"
        onClick={() => setAjout(true)}
        className="hidden self-start text-[11px] font-semibold text-km-faint hover:text-km-green group-focus-within/adresse:block group-hover/adresse:block"
      >
        ＋ Complément d’adresse
      </button>
    )
  }
  return (
    <ComplementChamp
      valeur={valeur}
      demarrer={ajout && !valeur}
      modifiable={modifiable}
      onCommit={async (v) => { await enregistrer({ complement_adresse: v.replace(/\s+/g, ' ').trim() || null }) }}
      onFini={() => setAjout(false)}
      onSaved={onSaved}
      onError={onError}
    />
  )
}

function ComplementChamp({ valeur, demarrer, modifiable, onCommit, onFini, onSaved, onError }: {
  valeur: string
  demarrer: boolean
  modifiable: boolean
  onCommit: (v: string) => Promise<void>
  onFini: () => void
  onSaved: () => void
  onError: (e: Error) => void
}) {
  const [edition, setEdition] = useState(demarrer)
  const [brouillon, setBrouillon] = useState(valeur)
  const envoye = useRef(false)
  async function valider() {
    if (envoye.current) return
    envoye.current = true
    setEdition(false)
    try {
      if (brouillon.trim() !== valeur) { await onCommit(brouillon); onSaved() }
    } catch (e) {
      onError(e instanceof Error ? e : new Error(String(e)))
    } finally {
      envoye.current = false
      onFini()
    }
  }
  if (edition) {
    return (
      <input
        autoFocus
        value={brouillon}
        placeholder="Bâtiment, escalier, lieu-dit…"
        onChange={(e) => setBrouillon(e.target.value)}
        onBlur={() => void valider()}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { e.preventDefault(); void valider() }
          if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); envoye.current = true; setEdition(false); setBrouillon(valeur); onFini(); setTimeout(() => { envoye.current = false }, 0) }
        }}
        className="w-full rounded-[8px] border border-km-green px-2 py-0.5 font-sans text-[12.5px] font-medium text-km-text outline-none shadow-[0_0_0_3px_rgba(13,122,95,.12)]"
      />
    )
  }
  return (
    <div
      role={modifiable ? 'button' : undefined}
      tabIndex={modifiable ? 0 : undefined}
      title={modifiable ? 'Cliquer pour modifier' : undefined}
      onClick={modifiable ? () => { setBrouillon(valeur); setEdition(true) } : undefined}
      className={cn(
        'max-w-full self-start overflow-hidden text-ellipsis whitespace-nowrap border-b border-dashed border-transparent font-sans text-[12.5px] font-medium text-km-muted',
        modifiable && 'cursor-text hover:border-km-green',
      )}
    >
      {valeur}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// B · CARACTÉRISTIQUES TECHNIQUES
// ═══════════════════════════════════════════════════════════════════════════════════════════════

const SEGMENTS = ['C1', 'C2', 'C3', 'C4', 'C5']
/* Les formules tarifaires d'acheminement du TURPE — la liste réglementaire, pas celle de la maquette.
   Une valeur déjà en base et absente d'ici reste proposée (voir `optionsAvec`). */
const FTAS = ['BTINFCUST', 'BTINFMUDT', 'BTINFCU4', 'BTINFMU4', 'BTINFLU', 'BTSUPCU4', 'BTSUPLU4', 'HTACU5', 'HTACUPM5', 'HTALU5', 'HTALUPM5']
const TARIFS_GAZ = ['T1', 'T2', 'T3', 'T4', 'TP']
const PROFILS_GAZ = ['P011', 'P012', 'P013', 'P014', 'P015', 'P016', 'P017', 'P018', 'P019']

function optionsAvec(liste: string[], actuelle: string | null | undefined) {
  return actuelle && !liste.includes(actuelle) ? [...liste, actuelle] : liste
}

interface Champ {
  cle: string
  intitule: string
  valeur: string
  unite?: string
  options?: string[]
  /** 15 px pour le numéro, 16 pour l'échéance, 18 pour les autres. */
  taille: 15 | 16 | 18
  flex: string
  min: number
  bordure: boolean
  enregistrer?: (v: string) => Promise<void>
  type?: 'texte' | 'date' | 'nombre'
  /** Une donnée à corriger : l'échéance vide ou dépassée. */
  alerte?: { niveau: 'vide' | 'retard'; texte: string }
}

export function BlocCaracteristiques({
  compteur, echeance, modifiable, enregistrerCompteur, enregistrerTechnique, commitNumero, onToast,
}: {
  compteur: Compteur
  echeance: EcheanceCompteur
  modifiable: boolean
  enregistrerCompteur: Enregistrer
  enregistrerTechnique: Enregistrer
  commitNumero: (v: string) => Promise<void>
  onToast: (m: string) => void
}) {
  const estElec = compteur.type_energie === 'electricite'
  const numero = (compteur.numero_pdl ?? '').replace(/\s+/g, '')
  const champs: Champ[] = [
    {
      cle: 'numero', intitule: estElec ? 'N° PDL' : 'N° PCE', valeur: numero, taille: 15, flex: '1.7 1 0', min: 180, bordure: false,
      enregistrer: commitNumero,
    },
    ...(estElec
      ? [
          { cle: 'segment', intitule: 'Segment', valeur: compteur.segment ?? '', options: optionsAvec(SEGMENTS, compteur.segment), taille: 18 as const, flex: '1 1 0', min: 0, bordure: true,
            enregistrer: (v: string) => enregistrerTechnique({ segment: v }) },
          { cle: 'fta', intitule: 'FTA', valeur: compteur.tarif_distribution ?? '', options: optionsAvec(FTAS, compteur.tarif_distribution), taille: 18 as const, flex: '1 1 0', min: 0, bordure: true,
            enregistrer: (v: string) => enregistrerTechnique({ tarif_distribution: v }) },
        ]
      : [
          { cle: 'tarif', intitule: 'Tarif', valeur: compteur.tarif_distribution ?? '', options: optionsAvec(TARIFS_GAZ, compteur.tarif_distribution), taille: 18 as const, flex: '1 1 0', min: 0, bordure: true,
            enregistrer: (v: string) => enregistrerTechnique({ tarif_distribution: v }) },
          { cle: 'profil', intitule: 'Profil', valeur: compteur.profil_consommation ?? '', options: optionsAvec(PROFILS_GAZ, compteur.profil_consommation), taille: 18 as const, flex: '1 1 0', min: 0, bordure: true,
            enregistrer: (v: string) => enregistrerTechnique({ profil_consommation: v }) },
          { cle: 'car', intitule: 'CAR', valeur: compteur.car_mwh != null ? nombreFr(compteur.car_mwh) : '', unite: 'MWh', taille: 18 as const, flex: '1 1 0', min: 0, bordure: true, type: 'nombre' as const,
            enregistrer: async (v: string) => {
              const n = Number(v.replace(/\s|\u00a0/g, '').replace(',', '.'))
              if (v.trim() && !Number.isFinite(n)) throw new Error('Un nombre est attendu.')
              await enregistrerTechnique({ car_mwh: v.trim() ? n : null })
            } },
        ]),
    /* L'ÉCHÉANCE AFFICHÉE EST CELLE QUI FAIT FOI — la fin du contrat en cours s'il y en a un. La
       modifier écrit la date DÉCLARÉE sur le compteur (`natureEcheance` la retient faute de contrat). */
    {
      cle: 'echeance', intitule: 'Échéance', valeur: echeance.date ?? '', taille: 16, flex: '1.2 1 0', min: 130, bordure: true, type: 'date',
      enregistrer: (v: string) => enregistrerCompteur({ date_echeance: v || null }),
      /* ══ UNE ÉCHÉANCE VIDE OU DÉPASSÉE SE VOIT — William, 01/10/2026 ══
         « Si une échéance est vide ou en retard, un indicateur visuel doit attirer l'attention du
         commercial afin qu'il corrige la data. » C'est elle qui décide quand agir : sans elle, ou
         passée, le compteur sort du radar sans bruit. */
      alerte: (() => {
        if (!echeance.date) return { niveau: 'vide' as const, texte: 'À renseigner' }
        const j = joursJusqua(echeance.date)
        return j != null && j < 0 ? { niveau: 'retard' as const, texte: `Dépassée de ${Math.abs(j)} j` } : undefined
      })(),
    },
  ]

  return (
    <Carte relief>
      <div className="flex items-center gap-2 px-[18px] pt-[14px]">
        <Sourcil>Caractéristiques techniques</Sourcil>
      </div>
      <div className="flex px-1.5 pb-4 pt-3">
        {champs.map((c) => (
          <CelluleTechnique key={c.cle} champ={c} modifiable={modifiable && Boolean(c.enregistrer)} onToast={onToast} />
        ))}
      </div>
    </Carte>
  )
}

/**
 * ══ LA SYNCHRONISATION VIT AVEC LES CONSOMMATIONS ══
 * William, 01/10/2026 : « le bouton de synchronisation GRDF et ENEDIS doit être présent dans le
 * bloc des consommations, pas des caractéristiques techniques ». C'est là qu'on voit ce qu'elle
 * rapporte. Grisé sans mandat KiWee actif et valide — la règle du serveur (`couvertureMandat.ts`).
 */
function BoutonSynchro({ estElec, synchroniser, synchroEnCours, synchroAutorisee }: {
  estElec: boolean
  synchroniser: () => void
  synchroEnCours: boolean
  synchroAutorisee: boolean
}) {
  return (
    <button
      type="button"
      disabled={!synchroAutorisee}
      onClick={() => { if (!synchroEnCours && synchroAutorisee) synchroniser() }}
      aria-busy={synchroEnCours}
      title={synchroAutorisee ? undefined : 'Aucun mandat KiWee actif ne couvre ce compteur : synchronisation impossible.'}
      className={cn(
        'flex h-[30px] items-center gap-[7px] rounded-[10px] border pl-[5px] pr-3 text-[12px] font-semibold transition-all duration-150',
        !synchroAutorisee
          ? 'cursor-not-allowed border-km-line bg-km-soft text-km-faint'
          : synchroEnCours
            ? 'cursor-progress border-km-green bg-km-green-soft text-km-green'
            : 'border-km-line bg-white text-km-green hover:border-km-green hover:bg-km-green-soft',
      )}
    >
      <span className={cn('flex h-[22px] w-[22px] items-center justify-center rounded-[7px]', synchroAutorisee ? 'bg-km-green-soft' : 'bg-white', synchroEnCours && 'animate-[spin_.8s_linear_infinite]')}>
        <RefreshCw className="h-[13px] w-[13px]" strokeWidth={2.2} />
      </span>
      {synchroEnCours ? 'Synchronisation…' : `Synchroniser ${estElec ? 'Enedis' : 'GRDF'}`}
    </button>
  )
}

function CelluleTechnique({ champ: c, modifiable, onToast }: { champ: Champ; modifiable: boolean; onToast: (m: string) => void }) {
  const ref = useRef<HTMLDivElement>(null)
  const [menu, setMenu] = useState(false)
  const [edition, setEdition] = useState(false)
  const [brouillon, setBrouillon] = useState('')
  const [enCours, setEnCours] = useState(false)
  const envoye = useRef(false)
  useFermeture(ref, menu, () => setMenu(false))

  const affichee = c.type === 'date' ? (c.valeur ? dateFr(c.valeur) : '') : c.valeur

  async function ecrire(v: string) {
    if (!c.enregistrer || envoye.current) return
    envoye.current = true
    setEnCours(true)
    setMenu(false)
    setEdition(false)
    try {
      await c.enregistrer(v)
      /* Le numéro prévient lui-même quand son format est inhabituel ; on ne recouvre pas son toast. */
      if (c.cle !== 'numero' || /^(\d{14}|GI\d{6})$/.test(v.replace(/\s+/g, ''))) onToast('✓ enregistré')
    } catch (e) {
      onToast(`Erreur : ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      envoye.current = false
      setEnCours(false)
    }
  }

  function commencer() {
    if (!modifiable) return
    if (c.options) { setMenu((m) => !m); return }
    setBrouillon(c.type === 'date' ? c.valeur.slice(0, 10) : c.valeur)
    setEdition(true)
  }

  function valider() {
    const v = c.cle === 'numero' ? brouillon.replace(/\s+/g, '') : brouillon.trim()
    if (v === (c.type === 'date' ? c.valeur.slice(0, 10) : c.valeur)) { setEdition(false); return }
    void ecrire(v)
  }

  return (
    <div
      ref={ref}
      className={cn('relative px-3 py-1', c.bordure && 'border-l border-km-line-soft')}
      style={{ flex: c.flex, minWidth: c.min }}
    >
      {/* LE FOND TEINTÉ DE L'ALERTE, posé sous la cellule sans en changer la place : la rangée garde
          son alignement, seule la cellule à corriger se colore. */}
      {c.alerte && (
        <span
          aria-hidden="true"
          className={cn('pointer-events-none absolute inset-x-1 -inset-y-1 rounded-[10px] border', c.alerte.niveau === 'retard' ? 'border-km-red/25 bg-km-red-soft/70' : 'border-km-amber/25 bg-km-amber-soft/70')}
        />
      )}
      <div className="relative flex items-center gap-1.5 whitespace-nowrap text-[10px] font-semibold uppercase tracking-[.05em] text-km-faint">
        {c.intitule}
        {c.alerte && (
          <span className={cn('flex items-center gap-1 rounded-full px-1.5 py-px text-[9.5px] font-bold normal-case tracking-normal', c.alerte.niveau === 'retard' ? 'bg-km-red text-white' : 'bg-km-amber text-white')}>
            <span className="h-1 w-1 animate-pulse rounded-full bg-white" aria-hidden="true" />
            {c.alerte.texte}
          </span>
        )}
      </div>
      {edition ? (
        <input
          autoFocus
          type={c.type === 'date' ? 'date' : 'text'}
          value={brouillon}
          onChange={(e) => setBrouillon(e.target.value)}
          onBlur={valider}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { e.preventDefault(); valider() }
            if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); envoye.current = true; setEdition(false); setTimeout(() => { envoye.current = false }, 0) }
          }}
          className="mt-[3px] w-full rounded-[8px] border border-km-green px-2 py-1 font-mono text-[14px] font-semibold outline-none shadow-[0_0_0_3px_rgba(13,122,95,.12)]"
        />
      ) : (
        <div
          role={modifiable ? 'button' : undefined}
          tabIndex={modifiable ? 0 : undefined}
          title={modifiable ? 'Cliquer pour modifier' : undefined}
          onClick={commencer}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); commencer() } }}
          className={cn('relative mt-[5px] flex items-baseline gap-1 whitespace-nowrap', modifiable && 'cursor-pointer', enCours && 'opacity-60')}
        >
          <span
            className={cn(
              'inline-block max-w-full overflow-hidden text-ellipsis border-b border-dashed border-transparent font-mono font-bold tracking-[-.01em]',
              affichee ? (c.alerte?.niveau === 'retard' ? 'text-km-red' : 'text-km-text') : (c.alerte ? 'text-km-amber' : 'text-km-faint'),
              modifiable && 'hover:border-km-green',
            )}
            style={{ fontSize: c.taille }}
          >
            {affichee || '—'}
          </span>
          {c.unite && affichee && <span className="text-[11px] font-semibold text-km-faint">{c.unite}</span>}
          {c.options && <span className="text-[9px] text-[#C9D0CB]">▾</span>}
        </div>
      )}
      {menu && c.options && <ListeValeurs options={c.options} actuelle={c.valeur} onChoisir={(v) => { if (v === c.valeur) setMenu(false); else void ecrire(v) }} />}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// C · POSTES HORAIRES — électricité seulement
// ═══════════════════════════════════════════════════════════════════════════════════════════════

const ORDRE_POSTES = ['POINTE', 'HPH', 'HCH', 'HPE', 'HCE', 'HP', 'HC', 'BASE'] as const

export function BlocPostes({ compteur }: { compteur: Compteur }) {
  const conso = compteur.consoParClasseMwh ?? {}
  const puissances = compteur.puissanceParClasseKva ?? {}
  /* Les postes qui portent une conso OU une puissance ; aucun, et on garde la carte avec les huit
     classes à « — » : c'est dire « personne ne les a remontés », pas « il n'y en a pas » (règle du
     03/09/2026, Naoëlle et Michel). */
  const renseignes = ORDRE_POSTES.filter((p) => conso[p] != null || puissances[p] != null)
  const vide = renseignes.length === 0
  const postes = vide ? [...ORDRE_POSTES] : renseignes
  const total = postes.reduce((s, p) => s + (conso[p] ?? 0), 0)
  const nb = postes.length
  /* DEUX DÉCIMALES AU PLUS — William, 30/09/2026 : Enedis en donne trois (« 5,978 »), illisible. */
  const deux = (v: number) => v.toLocaleString('fr-FR', { maximumFractionDigits: 2 }).replace(/\u202f/g, '\u00a0')

  return (
    <Carte relief>
      <div className="flex items-center gap-2 px-[18px] pt-[14px]">
        <span className="flex h-5 w-5 items-center justify-center rounded-[6px] bg-km-elec-soft text-km-elec">
          <Zap className="h-[11px] w-[11px]" fill="currentColor" strokeWidth={0} />
        </span>
        <Sourcil>Postes horaires — conso &amp; puissance</Sourcil>
      </div>
      <div className="px-[18px] pb-4 pt-3">
        {vide && (
          <p className="mb-3 text-[12px] leading-relaxed text-km-muted">
            Aucune répartition remontée pour ce compteur — ni par la reprise Salesforce, ni par une
            synchronisation. Les huit classes sont listées vides : rien n’est calculé ni supposé ici.
          </p>
        )}
        <div
          className={cn('grid items-center gap-1.5 tabular-nums', vide && 'opacity-55')}
          /* LE TOTAL S'ÉLARGIT AVEC SON CHIFFRE : 92 px au moins, la largeur du nombre au-delà. */
          style={{ gridTemplateColumns: `100px repeat(${nb},minmax(0,1fr)) minmax(92px,max-content)` }}
        >
          <span />
          {postes.map((p) => (
            <span key={p} className="text-center font-mono text-[11px] font-bold text-km-muted">{p === 'POINTE' ? 'Pointe' : p}</span>
          ))}
          <span />

          <span className="text-[12px] font-semibold leading-[1.3]">Conso<br /><span className="font-medium text-km-faint">MWh</span></span>
          {postes.map((p) => {
            const v = conso[p]
            return (
              <div key={p} className="rounded-[10px] bg-[#FBF7E8] px-2 pb-[7px] pt-2 text-center">
                <div className="whitespace-nowrap font-mono text-[13px] font-semibold">
                  {v != null ? deux(v) : '—'}
                  {v != null && total > 0 && (
                    <> <span className="text-[10.5px] font-medium text-km-faint">({Math.round((v / total) * 100)}{'\u202f'}%)</span></>
                  )}
                </div>
              </div>
            )
          })}
          <div className="row-span-2 flex flex-col justify-center gap-0.5 self-stretch rounded-[12px] bg-km-elec-soft p-2 text-center">
            <div className="text-[9px] font-bold uppercase tracking-[.06em] text-km-amber">Total</div>
            <div className="whitespace-nowrap px-1 font-mono text-[24px] font-bold leading-[1.1] tracking-[-.02em] text-[#8A6508]">{total > 0 ? deux(total) : '—'}</div>
            <div className="text-[10px] text-km-amber">MWh</div>
          </div>

          <span className="text-[12px] font-semibold leading-[1.3]">Puissance<br /><span className="font-medium text-km-faint">kVA</span></span>
          {postes.map((p) => (
            <div key={p} className="rounded-[10px] bg-km-soft p-2 text-center font-mono text-[14px] font-semibold">
              {puissances[p] != null ? deux(puissances[p]) : '—'}
            </div>
          ))}
        </div>
      </div>
    </Carte>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// D · CONSOMMATION · 12 DERNIERS MOIS
// ═══════════════════════════════════════════════════════════════════════════════════════════════

const MOIS = ['janv', 'févr', 'mars', 'avr', 'mai', 'juin', 'juil', 'août', 'sept', 'oct', 'nov', 'déc']

/**
 * Douze mois. EN GAZ, ils glissent avec le calendrier jusqu'au mois courant ; EN ÉLECTRICITÉ, ils
 * finissent au mois de la dernière relève synchronisée et ne bougent qu'à la synchronisation
 * suivante (William, 01/10/2026).
 *
 * ÉLECTRICITÉ : les consommations mesurées, une ligne par période de relève (22/08 → 21/09 chez
 * Enedis, pas du 1er au 1er). Une ligne compte si elle fait entre 25 et 35 jours ; elle est rangée
 * sous le mois de son milieu, sans être découpée. Deux lignes pour un même mois, ou un relevé annuel
 * de onze mois d'un coup : le mois reste vide plutôt que faux.
 *
 * GAZ : William, 30/09/2026 — « la consommation des 12 derniers mois on ne peut pas l'avoir. En
 * revanche, par rapport aux profils, on connaît quel pourcentage de la CAR est consommé en moyenne
 * chaque mois. » Chaque mois vaut donc CAR × part du profil (`lib/profilsGaz.ts`), et la pastille
 * dit « Estimé · profil P016 ». Sans CAR ou sans profil, rien n'est dessiné.
 */
export function BlocConsommation({ compteur, consommations, modifiable, synchroniser, synchroEnCours, synchroAutorisee }: {
  compteur: Compteur
  consommations: Consommation[]
  modifiable: boolean
  synchroniser: () => void
  synchroEnCours: boolean
  /** Un mandat KiWee actif et valide couvre-t-il ce compteur ? Sinon, le bouton ne part pas. */
  synchroAutorisee: boolean
}) {
  const estElec = compteur.type_energie === 'electricite'
  const t = teintesEnergie(estElec)

  const { barres, types } = useMemo(() => {
    /* Douze mois finissant au mois `fin` (« AAAA-MM »), du plus ancien au plus récent. */
    const douzeMoisJusqua = (annee: number, mois0: number) => {
      const sortie: string[] = []
      for (let i = 11; i >= 0; i--) {
        const d = new Date(annee, mois0 - i, 1)
        sortie.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
      }
      return sortie
    }
    const maintenant = new Date()

    if (!estElec) {
      /* GAZ : la fenêtre glisse d'elle-même avec le calendrier — le profil donne chaque mois. */
      const cles = douzeMoisJusqua(maintenant.getFullYear(), maintenant.getMonth())
      const car = compteur.car_mwh
      const estimees = cles.map((cle) => {
        const mois = Number(cle.slice(5, 7)) - 1
        const part = partMensuelleCar(compteur.profil_consommation, mois)
        return { cle, mois: MOIS[mois], valeur: car != null && car > 0 && part != null ? (car * part) / 100 : null, part, releve: null as { debut: string; fin: string } | null }
      })
      return { barres: estimees, types: new Set(estimees.some((b) => b.valeur != null) ? ['PROFIL'] : []) }
    }
    /* ══ ÉLECTRICITÉ : LA FENÊTRE EST CELLE DE LA DERNIÈRE SYNCHRONISATION ══
       William, 01/10/2026 : « en électricité, les 12 derniers mois ne doivent s'actualiser que
       lorsque, depuis la synchro, de nouveaux mois sont disponibles. C'est différent du gaz, où le
       passage à un nouveau mois est automatique. » La fenêtre ne suit donc plus le calendrier : elle
       finit au mois de la dernière relève enregistrée, et ne bouge qu'à la synchronisation suivante.
       Sans quoi, chaque 1er du mois, la plus ancienne relève disparaissait et un mois vide
       apparaissait à droite — sans qu'aucune donnée n'ait changé. */
    const milieu = (c: Consommation) => {
      const debut = Date.parse(`${c.date_debut_periode.slice(0, 10)}T00:00:00Z`)
      const fin = Date.parse(`${c.date_fin_periode.slice(0, 10)}T00:00:00Z`)
      const jours = (fin - debut) / 86_400_000
      return jours >= 25 && jours <= 35 ? new Date(debut + (jours / 2) * 86_400_000).toISOString().slice(0, 7) : null
    }
    const derniere = consommations.map(milieu).filter((m): m is string => Boolean(m)).sort().pop()
    const cles = derniere
      ? douzeMoisJusqua(Number(derniere.slice(0, 4)), Number(derniere.slice(5, 7)) - 1)
      : douzeMoisJusqua(maintenant.getFullYear(), maintenant.getMonth())

    const parMois = new Map<string, { mwh: number; debut: string; fin: string; nb: number; type: string }>()
    for (const c of consommations) {
      const debut = Date.parse(`${c.date_debut_periode.slice(0, 10)}T00:00:00Z`)
      const fin = Date.parse(`${c.date_fin_periode.slice(0, 10)}T00:00:00Z`)
      const jours = (fin - debut) / 86_400_000
      if (!(jours >= 25 && jours <= 35)) continue
      const cle = new Date(debut + (jours / 2) * 86_400_000).toISOString().slice(0, 7)
      if (!cles.includes(cle)) continue
      const mwh = (c.unite ?? '').toLowerCase() === 'kwh' ? c.quantite / 1000 : c.quantite
      const deja = parMois.get(cle)
      parMois.set(cle, deja
        ? { ...deja, nb: deja.nb + 1 }
        : { mwh, debut: c.date_debut_periode.slice(0, 10), fin: c.date_fin_periode.slice(0, 10), nb: 1, type: c.type_valeur })
    }
    const vus = new Set<string>()
    const barres = cles.map((cle) => {
      const p = parMois.get(cle)
      const sure = p && p.nb === 1
      if (sure) vus.add(p.type)
      return { cle, mois: MOIS[Number(cle.slice(5, 7)) - 1], valeur: sure ? p.mwh : null, part: null as number | null, releve: sure ? { debut: p.debut, fin: p.fin } : null }
    })
    return { barres, types: vus }
  }, [consommations, estElec, compteur.car_mwh, compteur.profil_consommation])

  const max = Math.max(...barres.map((b) => b.valeur ?? 0), 0) * 1.08
  const source = types.size === 0
    ? null
    : types.has('PROFIL')
      ? `Estimé · profil ${compteur.profil_consommation}`
      : types.size > 1
      ? 'Mixte'
      : types.has('MESUREE')
        ? 'Réel · télérelève'
        : `Estimé${!estElec && compteur.profil_consommation ? ` · profil ${compteur.profil_consommation}` : ''}`

  return (
    <Carte className="px-[18px] py-4">
      {/* L'EN-TÊTE PORTE LA SYNCHRONISATION : ce que dit le graphique (la source), quand il a été
          nourri pour la dernière fois, et le geste qui le nourrit — dans cet ordre de lecture. */}
      <div className="mb-2.5 flex items-center gap-2">
        <Sourcil>Consommation · 12 derniers mois</Sourcil>
        {source && (
          <span className="rounded-[6px] px-2 py-0.5 text-[10px] font-bold" style={{ color: t.acc, background: t.doux }}>{source}</span>
        )}
        <span className="flex-1" />
        <span className="text-[11px] text-km-faint">
          Dernière synchro{' '}
          <span className="font-mono text-km-muted">{compteur.date_derniere_synchro_eneo ? dateHeureFr(compteur.date_derniere_synchro_eneo) : 'jamais'}</span>
        </span>
        {modifiable && (
          <BoutonSynchro estElec={estElec} synchroniser={synchroniser} synchroEnCours={synchroEnCours} synchroAutorisee={synchroAutorisee} />
        )}
      </div>
      <div className="flex h-[170px] items-stretch gap-1.5">
        {barres.map((b, i) => (
          <div
            key={b.cle}
            title={b.valeur != null
              ? `${b.mois} · ${nombreFr(Math.round(b.valeur * 100) / 100)} MWh${b.part != null ? ` (${nombreFr(b.part)}\u202f% de la CAR)` : ''}${b.releve ? ` · relève du ${dateFr(b.releve.debut)} au ${dateFr(b.releve.fin)}` : ''}`
              : `${b.mois} · aucune donnée`}
            className="flex min-w-0 flex-1 flex-col items-center gap-[5px]"
          >
            <div className="flex w-full max-w-[44px] flex-1 items-end overflow-hidden rounded-[10px] bg-km-soft">
              {b.valeur != null && max > 0 && (
                <div
                  className="flex w-full items-start justify-center rounded-[10px] pt-1.5"
                  style={{
                    height: `${Math.max(18, (b.valeur / max) * 100)}%`,
                    background: i === barres.length - 1
                      ? `linear-gradient(180deg,${t.tresFonce},${t.fonce})`
                      : `linear-gradient(180deg,${t.fonce},${t.acc})`,
                  }}
                >
                  {/* L'entier arrondi de la maquette — sauf sous 10 MWh, où l'arrondi écrirait « 0 » sur
                      une vraie consommation d'été : on garde alors une décimale. */}
                  <span className="font-mono text-[10.5px] font-bold text-white">{b.valeur < 10 ? nombreFr(Math.round(b.valeur * 100) / 100) : Math.round(b.valeur)}</span>
                </div>
              )}
            </div>
            <span className={cn('text-[10px]', b.valeur != null ? 'text-km-faint' : 'text-[#C9D0CB]')}>{b.mois}</span>
          </div>
        ))}
      </div>
    </Carte>
  )
}
