import { useMemo, useRef, useState } from 'react'
import { Building, MapPin, RefreshCw, Tag, Zap } from 'lucide-react'
import { CarteLieu } from '@/components/ui/carte-lieu'
import { useQuery } from '@tanstack/react-query'
import { geocoderPrecis, searchAddressBAN, type BanAddress } from '@/lib/banAddress'
import { partMensuelleCar } from '@/lib/profilsGaz'
import { cn } from '@/lib/utils'
import type { EcheanceCompteur } from '@/lib/echeance'
import type { Compteur, Consommation } from '@/types/domain'
import {
  Carte, ListeValeurs, MENU_FLOTTANT, Sourcil, ValeurEditable, dateFr, dateHeureFr, nombreFr, useFermeture,
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

function adresseAffichee(c: Compteur): string {
  const commune = [c.code_postal, c.ville].filter(Boolean).join(' ')
  const complete = [c.adresse, commune].filter(Boolean).join(', ')
  return complete || c.adresse_site || ''
}

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
  const ko = (e: Error) => onToast(e.message.startsWith('Ce champ') ? e.message : `Erreur : ${e.message}`)

  return (
    <Carte relief className="grid grid-cols-[minmax(0,1fr)_minmax(220px,300px)] overflow-hidden">
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

        <div className="flex items-center gap-3">
          <span className="flex h-8 w-8 flex-none items-center justify-center rounded-[9px] bg-km-green-soft text-km-green">
            <MapPin className="h-[14px] w-[14px]" strokeWidth={2} />
          </span>
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="text-[10px] font-semibold uppercase tracking-[.05em] text-km-faint">Adresse de consommation</span>
            <AdresseEditable compteur={compteur} modifiable={modifiable} enregistrer={enregistrer} onSaved={ok} onError={ko} />
          </div>
        </div>

        <div className="flex items-center gap-3">
          <span className="flex h-8 w-8 flex-none items-center justify-center rounded-[9px] bg-km-soft text-km-muted">
            <Building className="h-[14px] w-[14px]" strokeWidth={2} />
          </span>
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="text-[10px] font-semibold uppercase tracking-[.05em] text-km-faint">Localisation sur place</span>
            <ValeurEditable
              valeur={compteur.localisation_site ?? ''}
              modifiable={modifiable}
              vide="Non renseignée"
              classeTexte="font-sans text-[13px] font-medium text-km-text"
              onCommit={(v) => enregistrer({ localisation_site: v.replace(/\s+/g, ' ').trim() || null })}
              onSaved={ok}
              onError={ko}
            />
          </div>
        </div>
      </div>
      <CarteLieu lat={lat} lon={lon} hauteurMin={170} />
    </Carte>
  )
}

/**
 * ══ L'ADRESSE SE CHOISIT DANS LA BAN, ET REPLACE LA CARTE ══
 * Le brief : « Modifier l'adresse doit recalculer latitude/longitude (géocodage BAN) ». Une adresse
 * choisie dans les suggestions porte ses coordonnées ; une adresse tapée sans choisir est géocodée
 * à l'enregistrement, sur la première réponse de la BAN. Sans réponse, le texte est gardé tel quel
 * et la carte ne bouge pas — on ne place pas un point au hasard.
 */
function AdresseEditable({ compteur, modifiable, enregistrer, onSaved, onError }: {
  compteur: Compteur
  modifiable: boolean
  enregistrer: Enregistrer
  onSaved: () => void
  onError: (e: Error) => void
}) {
  const affichee = adresseAffichee(compteur)
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
    minuteur.current = setTimeout(async () => setSuggestions(await searchAddressBAN(v).catch(() => [])), 250)
  }

  async function valider(choisie?: BanAddress) {
    if (envoye.current) return
    const texte = brouillon.replace(/\s+/g, ' ').trim()
    if (!choisie && texte === affichee) { setEdition(false); return }
    envoye.current = true
    setEnCours(true)
    setEdition(false)
    try {
      const b = choisie ?? (texte ? (await searchAddressBAN(texte).catch(() => []))[0] : undefined)
      if (b) {
        await enregistrer({
          adresse: b.rue, code_postal: b.codePostal, ville: b.ville,
          latitude: b.latitude, longitude: b.longitude,
        })
      } else {
        await enregistrer({ adresse: texte || null })
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
      {affichee || 'Non renseignée'}
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
}

export function BlocCaracteristiques({
  compteur, echeance, modifiable, enregistrerCompteur, enregistrerTechnique, commitNumero, onToast,
  synchroniser, synchroEnCours, synchroAutorisee,
}: {
  compteur: Compteur
  echeance: EcheanceCompteur
  modifiable: boolean
  enregistrerCompteur: Enregistrer
  enregistrerTechnique: Enregistrer
  commitNumero: (v: string) => Promise<void>
  onToast: (m: string) => void
  synchroniser: () => void
  synchroEnCours: boolean
  /** Un mandat KiWee actif et valide couvre-t-il ce compteur ? Sinon, le bouton ne part pas. */
  synchroAutorisee: boolean
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
    },
  ]

  return (
    <Carte relief>
      <div className="flex items-center gap-2 px-[18px] pt-[14px]">
        <Sourcil>Caractéristiques techniques</Sourcil>
        <span className="flex-1" />
        <span className="text-[11px] text-km-faint">
          Dernière synchro{' '}
          <span className="font-mono text-km-muted">{compteur.date_derniere_synchro_eneo ? dateHeureFr(compteur.date_derniere_synchro_eneo) : 'jamais'}</span>
        </span>
        {modifiable && (
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
        )}
      </div>
      <div className="flex px-1.5 pb-4 pt-3">
        {champs.map((c) => (
          <CelluleTechnique key={c.cle} champ={c} modifiable={modifiable && Boolean(c.enregistrer)} onToast={onToast} />
        ))}
      </div>
    </Carte>
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
      <div className="whitespace-nowrap text-[10px] font-semibold uppercase tracking-[.05em] text-km-faint">{c.intitule}</div>
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
          className={cn('mt-[5px] flex items-baseline gap-1 whitespace-nowrap', modifiable && 'cursor-pointer', enCours && 'opacity-60')}
        >
          <span
            className={cn(
              'inline-block max-w-full overflow-hidden text-ellipsis border-b border-dashed border-transparent font-mono font-bold tracking-[-.01em]',
              affichee ? 'text-km-text' : 'text-km-faint',
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
 * Douze mois glissants, jusqu'au mois courant.
 *
 * ÉLECTRICITÉ : les consommations mesurées. Une ligne ne compte que si elle décrit UN mois (au plus
 * 31 jours) : les relevés annuels d'Enedis couvrent onze ou douze mois d'un coup, et les répartir
 * entre les mois serait inventer une saisonnalité. Un mois sans donnée garde sa piste vide.
 *
 * GAZ : William, 30/09/2026 — « la consommation des 12 derniers mois on ne peut pas l'avoir. En
 * revanche, par rapport aux profils, on connaît quel pourcentage de la CAR est consommé en moyenne
 * chaque mois. » Chaque mois vaut donc CAR × part du profil (`lib/profilsGaz.ts`), et la pastille
 * dit « Estimé · profil P016 ». Sans CAR ou sans profil, rien n'est dessiné.
 */
export function BlocConsommation({ compteur, consommations }: { compteur: Compteur; consommations: Consommation[] }) {
  const estElec = compteur.type_energie === 'electricite'
  const t = teintesEnergie(estElec)

  const { barres, types } = useMemo(() => {
    const maintenant = new Date()
    const cles: string[] = []
    for (let i = 11; i >= 0; i--) {
      const d = new Date(maintenant.getFullYear(), maintenant.getMonth() - i, 1)
      cles.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
    }
    if (!estElec) {
      const car = compteur.car_mwh
      const estimees = cles.map((cle) => {
        const mois = Number(cle.slice(5, 7)) - 1
        const part = partMensuelleCar(compteur.profil_consommation, mois)
        return { cle, mois: MOIS[mois], valeur: car != null && car > 0 && part != null ? (car * part) / 100 : null, part }
      })
      return { barres: estimees, types: new Set(estimees.some((b) => b.valeur != null) ? ['PROFIL'] : []) }
    }
    const somme = new Map<string, number>()
    const vus = new Set<string>()
    for (const c of consommations) {
      const debut = new Date(c.date_debut_periode)
      const fin = new Date(c.date_fin_periode)
      if ((fin.getTime() - debut.getTime()) / 86_400_000 > 31) continue
      const cle = c.date_debut_periode.slice(0, 7)
      if (!cles.includes(cle)) continue
      const mwh = (c.unite ?? '').toLowerCase() === 'kwh' ? c.quantite / 1000 : c.quantite
      somme.set(cle, (somme.get(cle) ?? 0) + mwh)
      vus.add(c.type_valeur)
    }
    return {
      barres: cles.map((cle) => ({ cle, mois: MOIS[Number(cle.slice(5, 7)) - 1], valeur: somme.get(cle) ?? null, part: null as number | null })),
      types: vus,
    }
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
      <div className="mb-2.5 flex items-center gap-2">
        <Sourcil>Consommation · 12 derniers mois</Sourcil>
        <span className="flex-1" />
        {source && (
          <span className="rounded-[6px] px-2 py-0.5 text-[10px] font-bold" style={{ color: t.acc, background: t.doux }}>{source}</span>
        )}
      </div>
      <div className="flex h-[170px] items-stretch gap-1.5">
        {barres.map((b, i) => (
          <div
            key={b.cle}
            title={b.valeur != null
              ? `${b.mois} · ${nombreFr(Math.round(b.valeur * 10) / 10)} MWh${b.part != null ? ` (${nombreFr(b.part)}\u202f% de la CAR)` : ''}`
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
                  <span className="font-mono text-[10.5px] font-bold text-white">{b.valeur < 10 ? nombreFr(Math.round(b.valeur * 10) / 10) : Math.round(b.valeur)}</span>
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
