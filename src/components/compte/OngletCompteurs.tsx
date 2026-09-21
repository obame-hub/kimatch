import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowDown, ArrowUp, ChevronDown, Flame, RotateCcw, Search, SlidersHorizontal, X, Zap } from 'lucide-react'
import type { Compteur } from '@/types/domain'
import { cn } from '@/lib/utils'
import { useCouvertureConseilSyndical } from '@/lib/data/relaisConseilSyndical'

/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * L'ONGLET COMPTEURS : UNE LISTE DE COMPTEURS, PLUS UNE LISTE DE SITES
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * William, 14/09/2026 : « Il faut retravailler largement la liste des compteurs dans l'onglet
 * Compteur. Cette fois je veux bien une liste de compteurs et non pas de sites. »
 *
 * ══ POURQUOI LE REGROUPEMENT PAR SITE NUISAIT ══
 *
 * L'onglet empilait des sites dépliables, chacun contenant ses compteurs. Sur CABINET MICHAU, cela
 * faisait 215 entêtes pour 343 compteurs — deux fois plus de lignes que d'objets, et une par
 * immeuble qu'il fallait ouvrir pour voir un seul PDL. Surtout, l'objet Site est en cours de
 * retrait : continuer à structurer un écran autour de lui, c'était bâtir sur ce qu'on démonte.
 *
 * C'EST LE COMPTEUR QUI CONTRACTUALISE. Il porte son adresse, son responsable, son échéance et son
 * contrat ; le site n'ajoutait qu'un niveau de pliage entre la question et la réponse.
 *
 * ══ CLIENT OU PROSPECT SE DÉDUIT, IL NE SE SAISIT PAS ══
 *
 * Un compteur est CLIENT quand un contrat actif et non échu le couvre — `nature_echeance` vaut
 * alors PROUVEE. Sinon il est PROSPECT : sa date, quand elle existe, n'est qu'une déclaration.
 * C'est la règle posée le 24/08/2026 dans src/lib/echeance.ts, reprise ici sans la réécrire.
 *
 * ══ D'OÙ VIENT LA DONNÉE ══
 *
 * Les compteurs et leurs noms viennent de la fiche, déjà chargés. Le statut contractuel vient de
 * `useCouvertureConseilSyndical`, qui lit `v_compteurs_liste` — la seule source qui porte
 * `nature_echeance`. Son nom parle du conseil syndical parce que c'est sa première utilisation,
 * mais elle rend le parc entier, et l'onglet Contacts l'a déjà mise en cache : réinterroger la base
 * pour la même chose coûterait une requête et n'apprendrait rien.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */

type Colonne = 'energie' | 'libelle' | 'pdl' | 'responsable' | 'echeance' | 'mwh' | 'statut'
type Sens = 'asc' | 'desc'

/** Le sens qu'on veut au premier clic : au plus proche pour une date, au plus gros pour un volume. */
const SENS_NATUREL: Record<Colonne, Sens> = {
  energie: 'asc', libelle: 'asc', pdl: 'asc', responsable: 'asc',
  echeance: 'asc', mwh: 'desc', statut: 'desc',
}

const COLONNES: { cle: Colonne; libelle: string; classe?: string }[] = [
  { cle: 'energie', libelle: '' },
  { cle: 'libelle', libelle: 'Libellé' },
  { cle: 'pdl', libelle: 'Point de livraison' },
  { cle: 'responsable', libelle: 'Responsable' },
  { cle: 'echeance', libelle: 'Échéance' },
  { cle: 'mwh', libelle: 'MWh', classe: 'justify-end' },
  { cle: 'statut', libelle: 'Statut' },
]

type Energie = 'tout' | 'electricite' | 'gaz'
type Statut = 'tout' | 'client' | 'prospect'
type Horizon = 'tout' | 'm3' | 'm12' | 'm18' | 'sans'

const HORIZONS: { cle: Horizon; libelle: string; jours: number | null }[] = [
  { cle: 'tout', libelle: 'Toutes', jours: null },
  { cle: 'm3', libelle: '< 3 mois', jours: 92 },
  { cle: 'm12', libelle: '< 12 mois', jours: 365 },
  { cle: 'm18', libelle: '< 18 mois', jours: 548 },
  { cle: 'sans', libelle: 'Sans date', jours: null },
]

/** Sans accents ni casse : « Résidence » doit se trouver en tapant « residence ». */
function normaliser(v: string): string {
  return v.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
}

function joursAvant(iso: string | null | undefined): number | null {
  if (!iso) return null
  return Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000)
}

function formaterMwh(v: number | null | undefined): string {
  return v == null ? '—' : Math.round(v).toLocaleString('fr-FR')
}

/** Une rubrique du panneau : un intitulé, son contenu, et un trait sauf pour la dernière. */
function Groupe({ titre, dernier, children }: { titre: string; dernier?: boolean; children: React.ReactNode }) {
  return (
    <div className={cn('py-2', !dernier && 'border-b border-km-line-soft')}>
      <p className="mb-1.5 text-km-tiny font-bold uppercase tracking-[0.07em] text-km-faint">{titre}</p>
      {children}
    </div>
  )
}

/**
 * Un choix exclusif, en colonnes égales sur toute la largeur du panneau.
 *
 * LES DÉCOMPTES ONT ÉTÉ RETIRÉS le 14/09/2026, à la demande de William. Ils tassaient les libellés
 * — « Élec. 267 » sur trois colonnes de cent pixels — et surtout ils répondaient à une question que
 * personne ne se pose en ouvrant un panneau de filtres : on y vient pour restreindre, pas pour
 * dénombrer. Le décompte qui compte est celui du résultat, et il est déjà dans la barre.
 *
 * COLONNES ÉGALES ET NON LARGEUR DU TEXTE : trois boutons de tailles différentes font une grille
 * bancale d'une rubrique à l'autre. Alignés, les quatre groupes se lisent comme un seul objet.
 */
function Segment<T extends string>({
  options,
  valeur,
  onChange,
}: {
  options: { cle: T; libelle: string }[]
  valeur: T
  onChange: (v: T) => void
}) {
  return (
    <div className="flex overflow-hidden rounded-km border border-km-line bg-km-surface">
      {options.map((o, i) => (
        <button
          key={o.cle}
          type="button"
          onClick={() => onChange(o.cle)}
          className={cn(
            'flex-1 px-1 py-1.5 text-km-label font-semibold transition-colors',
            i > 0 && 'border-l border-km-line',
            valeur === o.cle ? 'bg-km-green-soft text-km-green' : 'text-km-muted hover:bg-km-soft',
          )}
        >
          {o.libelle}
        </button>
      ))}
    </div>
  )
}

export function OngletCompteurs({ compteId, compteurs }: { compteId: string; compteurs: Compteur[] }) {
  const { data: parc } = useCouvertureConseilSyndical(compteId)

  const [recherche, setRecherche] = useState('')
  const [energie, setEnergie] = useState<Energie>('tout')
  const [statut, setStatut] = useState<Statut>('tout')
  const [horizon, setHorizon] = useState<Horizon>('tout')
  const [responsable, setResponsable] = useState('tout')
  /**
   * ══ LE TRI ══
   *
   * William, 14/09/2026 : « ajoute un système de tri sur les colonnes ».
   *
   * L'ÉCHÉANCE EST LE TRI PAR DÉFAUT, et croissant : c'est l'ordre dans lequel le travail arrive.
   * Une liste ouverte sur l'alphabet ferait chercher l'urgence au lieu de la montrer.
   *
   * CHAQUE COLONNE A SON SENS NATUREL. Une date s'ouvre au plus proche, un volume au plus gros, un
   * texte de A à Z : commencer un tri de MWh par le plus petit ne sert jamais. Le premier clic
   * prend donc ce sens-là, le second l'inverse.
   */
  const [panneau, setPanneau] = useState(false)
  const zonePanneau = useRef<HTMLDivElement>(null)

  /* LE PANNEAU SE FERME COMME ON S'Y ATTEND : un clic ailleurs, ou Échap. Sans ça il faut viser à
     nouveau le bouton, et il reste ouvert par-dessus la liste qu'on veut lire. */
  useEffect(() => {
    if (!panneau) return
    const auClic = (e: MouseEvent) => {
      if (zonePanneau.current && !zonePanneau.current.contains(e.target as Node)) setPanneau(false)
    }
    const auClavier = (e: KeyboardEvent) => { if (e.key === 'Escape') setPanneau(false) }
    document.addEventListener('mousedown', auClic)
    document.addEventListener('keydown', auClavier)
    return () => {
      document.removeEventListener('mousedown', auClic)
      document.removeEventListener('keydown', auClavier)
    }
  }, [panneau])

  const [tri, setTri] = useState<Colonne>('echeance')
  const [sens, setSens] = useState<Sens>('asc')

  function trierPar(colonne: Colonne) {
    if (colonne === tri) { setSens((s) => (s === 'asc' ? 'desc' : 'asc')); return }
    setTri(colonne)
    setSens(SENS_NATUREL[colonne])
  }

  /** Le statut contractuel, par compteur — la seule information que la fiche n'a pas. */
  const sousContratParId = useMemo(
    () => new Map((parc?.compteurs ?? []).map((c) => [c.id, c.sous_contrat])),
    [parc],
  )

  const lignes = useMemo(
    () =>
      compteurs.map((c) => {
        const jours = joursAvant(c.date_echeance)
        return {
          compteur: c,
          client: sousContratParId.get(c.id) ?? false,
          jours,
          // Ce qu'on fouille : tout ce qui est affiché, plus l'adresse, qu'on tape souvent de tête.
          index: normaliser(
            [c.numero_pdl, c.libelle_site, c.utilisation, c.adresse_site, c.responsable_contact_nom]
              .filter(Boolean)
              .join(' '),
          ),
        }
      }),
    [compteurs, sousContratParId],
  )

  const responsables = useMemo(() => {
    const noms = new Set<string>()
    for (const l of lignes) if (l.compteur.responsable_contact_nom) noms.add(l.compteur.responsable_contact_nom)
    return [...noms].sort((a, b) => a.localeCompare(b, 'fr'))
  }, [lignes])

  const filtrees = useMemo(() => {
    /* LA RECHERCHE EST DÉCOUPÉE EN MOTS, ET TOUS DOIVENT ÊTRE PRÉSENTS.
       « tilleuls gaz » trouve le compteur de gaz des Tilleuls, alors qu'une recherche naïve sur la
       chaîne entière n'aurait rien rendu — les deux mots n'étant jamais côte à côte. Les mots
       peuvent venir de champs différents : on cherche un compteur, pas une phrase. */
    const mots = normaliser(recherche).split(/\s+/).filter(Boolean)
    const seuil = HORIZONS.find((h) => h.cle === horizon)?.jours ?? null

    return lignes.filter((l) => {
      if (mots.length > 0 && !mots.every((m) => l.index.includes(m))) return false
      if (energie !== 'tout' && l.compteur.type_energie !== energie) return false
      if (statut === 'client' && !l.client) return false
      if (statut === 'prospect' && l.client) return false
      if (responsable !== 'tout') {
        const nom = l.compteur.responsable_contact_nom ?? ''
        if (responsable === 'aucun' ? nom !== '' : nom !== responsable) return false
      }
      if (horizon === 'sans') return l.jours === null
      // UNE ÉCHÉANCE DÉPASSÉE EST DANS TOUS LES HORIZONS : elle est plus urgente que « dans un
      // mois », pas moins. L'exclure ferait disparaître les cas les plus pressants du filtre le
      // plus serré.
      if (seuil !== null) return l.jours !== null && l.jours <= seuil
      return true
    })
  }, [lignes, recherche, energie, statut, horizon, responsable])

  const triees = useMemo(() => {
    const signe = sens === 'asc' ? 1 : -1
    const texte = (v: string | null | undefined) => (v ?? '').toLocaleLowerCase('fr')
    return [...filtrees].sort((a, b) => {
      switch (tri) {
        case 'energie':
          return signe * texte(a.compteur.type_energie).localeCompare(texte(b.compteur.type_energie), 'fr')
        case 'libelle':
          return signe * texte(a.compteur.libelle_site || a.compteur.utilisation).localeCompare(texte(b.compteur.libelle_site || b.compteur.utilisation), 'fr')
        case 'pdl':
          return signe * texte(a.compteur.numero_pdl).localeCompare(texte(b.compteur.numero_pdl), 'fr')
        case 'responsable': {
          /* SANS RESPONSABLE N'EST PAS UN NOM QUI COMMENCE PAR S. Ces lignes vont toujours en fin
             de liste, quel que soit le sens — c'est un manque, pas une valeur à classer. */
          const na = a.compteur.responsable_contact_nom
          const nb = b.compteur.responsable_contact_nom
          if (!na !== !nb) return na ? -1 : 1
          return signe * texte(na).localeCompare(texte(nb), 'fr')
        }
        case 'mwh':
          return signe * ((a.compteur.consommation_annuelle_mwh ?? 0) - (b.compteur.consommation_annuelle_mwh ?? 0))
        case 'statut':
          return signe * (Number(a.client) - Number(b.client))
        case 'echeance':
        default:
          // Une date absente ferme la marche dans les deux sens : elle n'appelle pas la même action.
          if (a.jours === null || b.jours === null) {
            if (a.jours === b.jours) return 0
            return a.jours === null ? 1 : -1
          }
          if (a.jours !== b.jours) return signe * (a.jours - b.jours)
          // À date égale, le volume départage — c'est lui qui dit par quoi commencer.
          return (b.compteur.consommation_annuelle_mwh ?? 0) - (a.compteur.consommation_annuelle_mwh ?? 0)
      }
    })
  }, [filtrees, tri, sens])

  const mesures = useMemo(() => {
    const total = lignes.length
    const mwh = lignes.reduce((t, l) => t + (l.compteur.consommation_annuelle_mwh ?? 0), 0)
    const elec = lignes.filter((l) => l.compteur.type_energie !== 'gaz').length
    const clients = lignes.filter((l) => l.client)
    const mwhClient = clients.reduce((t, l) => t + (l.compteur.consommation_annuelle_mwh ?? 0), 0)
    const douzeMois = lignes.filter((l) => l.jours !== null && l.jours <= 365)
    const mwhDouze = douzeMois.reduce((t, l) => t + (l.compteur.consommation_annuelle_mwh ?? 0), 0)
    return {
      total,
      mwh,
      elec,
      gaz: total - elec,
      clients: clients.length,
      mwhClient,
      penetration: total === 0 ? 0 : Math.round((clients.length / total) * 100),
      douzeMois: douzeMois.length,
      mwhDouze,
      troisMois: lignes.filter((l) => l.jours !== null && l.jours <= 92).length,
      sansEcheance: lignes.filter((l) => l.jours === null).length,
      sansResponsable: lignes.filter((l) => !l.compteur.responsable_contact_nom).length,
      /* UN COMPTEUR PEUT MANQUER LES DEUX : on compte les FICHES à compléter, pas les manques.
         Additionner les deux colonnes ferait un total supérieur au nombre de compteurs, et un
         chiffre qu'on ne peut pas rapprocher de la liste. */
      aCompleter: lignes.filter((l) => l.jours === null || !l.compteur.responsable_contact_nom).length,
    }
  }, [lignes])

  /**
   * Les filtres actifs, en pastilles retirables.
   *
   * LA RECHERCHE EN FAIT PARTIE, alors qu'elle a déjà sa croix dans le champ : c'est elle qui vide
   * le plus souvent une liste, et la compter avec les autres donne un nombre juste sur le bouton.
   */
  const pastilles = useMemo(() => {
    const p: { cle: string; groupe: string; libelle: string; retirer: () => void }[] = []
    if (recherche.trim()) p.push({ cle: 'q', groupe: 'Recherche', libelle: recherche.trim(), retirer: () => setRecherche('') })
    if (energie !== 'tout') p.push({ cle: 'e', groupe: 'Énergie', libelle: energie === 'gaz' ? 'Gaz' : 'Électricité', retirer: () => setEnergie('tout') })
    if (statut !== 'tout') p.push({ cle: 's', groupe: 'Statut', libelle: statut === 'client' ? 'Client' : 'Prospect', retirer: () => setStatut('tout') })
    if (horizon !== 'tout') p.push({ cle: 'h', groupe: 'Échéance', libelle: HORIZONS.find((x) => x.cle === horizon)?.libelle ?? '', retirer: () => setHorizon('tout') })
    if (responsable !== 'tout') p.push({ cle: 'r', groupe: 'Responsable', libelle: responsable === 'aucun' ? 'Sans responsable' : responsable, retirer: () => setResponsable('tout') })
    return p
  }, [recherche, energie, statut, horizon, responsable])

  const nombreFiltres = pastilles.length

  function reinitialiser() {
    setRecherche(''); setEnergie('tout'); setStatut('tout'); setHorizon('tout'); setResponsable('tout')
  }

  if (compteurs.length === 0) {
    return <p className="rounded-[16px] bg-km-soft px-6 py-10 text-center text-km-lead text-km-muted">Aucun compteur pour ce compte.</p>
  }

  return (
    <div className="flex flex-col gap-3">
      {/* ══ CE QUE LE PARC PÈSE, EN QUATRE CHIFFRES ══
          Quatre, pas huit : chacun doit répondre à une question qu'on se pose vraiment en ouvrant
          l'onglet. La taille du parc, ce qu'on en a gagné, ce qui revient dans l'année, et ce que la
          donnée ne dit pas encore. Le dernier est le seul qui appelle une action immédiate — et
          c'est pour ça qu'il est là. */}
      {/* ══ LES HÉROS SONT REMONTÉS DANS LE BANDEAU ══
          William, 14/09/2026 : « supprime les héros dans l'onglet compteur car c'est redondant du
          coup ». Les quatre mesures — le parc, le taux sous contrat, les échéances à douze mois, les
          fiches à compléter — vivent désormais dans l'en-tête de la fiche, où elles se lisent depuis
          TOUS les onglets et non du seul Compteurs. Les garder ici aurait fait lire deux fois le
          même chiffre à dix centimètres d'écart, avec le risque qu'ils divergent au premier
          correctif. Le calcul, lui, est partagé : `useMesuresDuParc`. */}

      {/* ══ UNE BARRE, UN BOUTON ══
          William, 14/09/2026 : « Mentionne et organise tous les filtres au sein d'un seul bouton
          Filtre à droite de la barre de recherche. »

          J'avais posé les filtres à plat, en argumentant qu'un filtre replié est un filtre qu'on
          oublie d'enlever — on finit par croire la liste vide. L'objection reste vraie, mais elle se
          règle autrement que par l'encombrement : LES FILTRES ACTIFS RESTENT AFFICHÉS SOUS LA BARRE,
          en pastilles qu'on retire d'un clic. Rien ne peut agir en cachette, et la bande retrouve
          une seule ligne.

          Le bouton porte le NOMBRE de filtres actifs : « Filtres 2 » se voit de loin, là où une
          simple pastille colorée demanderait d'ouvrir pour savoir. */}
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[220px] flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-km-faint" />
            <input
              value={recherche}
              onChange={(e) => setRecherche(e.target.value)}
              placeholder="PDL, libellé, adresse, responsable…"
              className="h-9 w-full rounded-km border border-km-line bg-km-surface pl-8 pr-8 text-km-body text-km-text outline-none placeholder:text-km-faint focus:border-km-green"
            />
            {recherche && (
              <button
                type="button"
                onClick={() => setRecherche('')}
                aria-label="Effacer la recherche"
                className="absolute right-2 top-1/2 -translate-y-1/2 text-km-faint hover:text-km-text"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          <div className="relative shrink-0" ref={zonePanneau}>
            <button
              type="button"
              onClick={() => setPanneau((v) => !v)}
              aria-expanded={panneau}
              className={cn(
                'inline-flex h-9 items-center gap-1.5 rounded-km border px-3 text-km-body font-semibold transition-colors',
                nombreFiltres > 0 || panneau
                  ? 'border-km-green bg-km-green-soft text-km-green'
                  : 'border-km-line bg-km-surface text-km-muted hover:bg-km-soft',
              )}
            >
              <SlidersHorizontal className="h-3.5 w-3.5" />
              Filtres
              {nombreFiltres > 0 && (
                <span className="rounded-full bg-km-green px-1.5 text-km-tiny font-bold tabular-nums text-white">{nombreFiltres}</span>
              )}
              <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', panneau && 'rotate-180')} />
            </button>

            {panneau && (
              <div className="absolute right-0 z-30 mt-1.5 w-[320px] animate-km-hub-pop rounded-[16px] border border-km-line bg-km-surface p-3 shadow-kw-panel">
                {/* QUATRE RUBRIQUES, DANS L'ORDRE OÙ ON S'EN SERT : ce qu'est le compteur, où il en
                    est, quand il revient, qui le tient. */}
                <Groupe titre="Énergie">
                  <Segment valeur={energie} onChange={setEnergie} options={[
                    { cle: 'tout', libelle: 'Tout' },
                    { cle: 'electricite', libelle: 'Électricité' },
                    { cle: 'gaz', libelle: 'Gaz' },
                  ]} />
                </Groupe>
                <Groupe titre="Statut">
                  <Segment valeur={statut} onChange={setStatut} options={[
                    { cle: 'tout', libelle: 'Tout' },
                    { cle: 'client', libelle: 'Client' },
                    { cle: 'prospect', libelle: 'Prospect' },
                  ]} />
                </Groupe>
                <Groupe titre="Échéance">
                  {/* CINQ CHOIX SUR UNE GRILLE DE TROIS : en ligne libre, ils se répartissaient
                      3 + 2 avec des largeurs inégales, ce qui donnait l'air d'un débordement plutôt
                      que d'une mise en page. */}
                  <div className="grid grid-cols-3 gap-1">
                    {HORIZONS.map((h) => (
                      <button
                        key={h.cle}
                        type="button"
                        onClick={() => setHorizon(h.cle)}
                        className={cn(
                          'rounded-km border px-1 py-1.5 text-km-label font-semibold transition-colors',
                          horizon === h.cle
                            ? 'border-km-green bg-km-green-soft text-km-green'
                            : 'border-km-line bg-km-surface text-km-muted hover:bg-km-soft',
                        )}
                      >
                        {h.libelle}
                      </button>
                    ))}
                  </div>
                </Groupe>
                <Groupe titre="Responsable" dernier>
                  <select
                    value={responsable}
                    onChange={(e) => setResponsable(e.target.value)}
                    className="h-8 w-full rounded-km border border-km-line bg-km-surface px-2 text-km-label font-semibold text-km-muted outline-none focus:border-km-green"
                  >
                    <option value="tout">Tous</option>
                    <option value="aucun">Sans responsable</option>
                    {responsables.map((n) => <option key={n} value={n}>{n}</option>)}
                  </select>
                </Groupe>

                {/* LE PIED NE RÉPÈTE PLUS LE DÉCOMPTE : il est déjà dans la barre, à trois
                    centimètres, et le lire deux fois ne le rend pas plus vrai. */}
                <button
                  type="button"
                  onClick={reinitialiser}
                  disabled={nombreFiltres === 0}
                  className="mt-2.5 flex w-full items-center justify-center gap-1.5 rounded-km border border-km-line py-1.5 text-km-label font-semibold text-km-muted enabled:hover:border-km-green-line enabled:hover:bg-km-green-soft enabled:hover:text-km-green disabled:opacity-40"
                >
                  <RotateCcw className="h-3 w-3" /> Tout effacer
                </button>
              </div>
            )}
          </div>

          <span className="shrink-0 text-km-label tabular-nums text-km-muted">
            {triees.length === mesures.total
              ? `${mesures.total} compteur${mesures.total > 1 ? 's' : ''}`
              : `${triees.length} sur ${mesures.total}`}
          </span>
        </div>

        {/* ══ CE QUI FILTRE, TOUJOURS VISIBLE ══
            C'est la contrepartie du repli : une pastille par filtre actif, retirable d'un clic. Sans
            elle, une liste vide resterait inexpliquée jusqu'à ce qu'on pense à rouvrir le panneau. */}
        {pastilles.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            {pastilles.map((p) => (
              <button
                key={p.cle}
                type="button"
                onClick={p.retirer}
                className="inline-flex items-center gap-1 rounded-full border border-km-green-line bg-km-green-soft py-0.5 pl-2 pr-1 text-km-label font-semibold text-km-green hover:bg-km-green/15"
              >
                <span className="text-km-tiny font-bold uppercase tracking-[0.05em] opacity-60">{p.groupe}</span>
                {p.libelle}
                <X className="h-3 w-3" />
              </button>
            ))}
            <button type="button" onClick={reinitialiser} className="text-km-label font-semibold text-km-muted hover:text-km-green hover:underline">
              Tout effacer
            </button>
          </div>
        )}
      </div>

      {/* ══ LA LISTE ══ */}
      <div className="overflow-hidden rounded-[16px] border border-km-line bg-km-surface">
        <div className="grid grid-cols-[28px_minmax(0,2.2fr)_minmax(0,1.3fr)_minmax(0,1.2fr)_minmax(0,1fr)_74px_86px] gap-2 border-b border-km-line bg-km-soft px-3 py-1 text-km-tiny font-bold uppercase tracking-[0.06em] text-km-faint">
          {COLONNES.map((c) => (
            <button
              key={c.cle}
              type="button"
              onClick={() => trierPar(c.cle)}
              title={`Trier par ${c.libelle || 'énergie'}`}
              className={cn(
                'flex items-center gap-0.5 py-1 text-left uppercase tracking-[0.06em] transition-colors hover:text-km-green',
                c.classe,
                tri === c.cle && 'text-km-green',
              )}
            >
              <span className="truncate">{c.libelle}</span>
              {/* LA FLÈCHE N'APPARAÎT QUE SUR LA COLONNE ACTIVE. Une flèche grise sur chacune des
                  sept dirait « triable » sept fois, et ferait chercher laquelle trie vraiment. */}
              {tri === c.cle && (sens === 'asc' ? <ArrowUp className="h-3 w-3 shrink-0" /> : <ArrowDown className="h-3 w-3 shrink-0" />)}
            </button>
          ))}
        </div>

        {triees.length === 0 ? (
          <p className="px-4 py-10 text-center text-km-body text-km-muted">
            Aucun compteur ne correspond. <button type="button" onClick={reinitialiser} className="font-semibold text-km-green hover:underline">Réinitialiser les filtres</button>
          </p>
        ) : (
          <div className="max-h-[560px] overflow-y-auto overscroll-contain">
            {triees.map(({ compteur: c, client, jours }) => {
              const gaz = c.type_energie === 'gaz'
              const Icone = gaz ? Flame : Zap
              const urgent = jours !== null && jours <= 92
              return (
                <div
                  key={c.id}
                  className="grid grid-cols-[28px_minmax(0,2.2fr)_minmax(0,1.3fr)_minmax(0,1.2fr)_minmax(0,1fr)_74px_86px] items-center gap-2 border-b border-km-line-soft px-3 py-2 text-km-label last:border-b-0 hover:bg-km-soft"
                  /* Le rail dit l'énergie au bord de la ligne : la même grammaire que les tableaux
                     du tableau de bord, et de quoi repérer une colonne de gaz sans lire. */
                  style={{ boxShadow: `inset 3px 0 0 0 ${gaz ? 'rgb(var(--km-amber))' : 'rgb(var(--km-elec))'}` }}
                >
                  <span
                    className={cn('flex h-5 w-5 items-center justify-center rounded-km-sm', gaz ? 'bg-km-amber-soft text-km-amber' : 'bg-km-elec-soft text-km-elec')}
                    title={gaz ? 'Gaz' : 'Électricité'}
                  >
                    <Icone className="h-3 w-3" strokeWidth={2.4} />
                  </span>

                  {/* LE LIBELLÉ SEUL. L'adresse tenait une seconde ligne sous chaque nom et doublait
                      la hauteur des lignes pour une information qu'on relit rarement — et souvent
                      redondante, le libellé portant déjà le nom de la résidence. Elle reste dans le
                      champ de recherche : on la tape de tête plus souvent qu'on ne la lit. */}
                  <Link
                    to={`/compteurs/${c.id}`}
                    title={c.adresse_site ?? undefined}
                    className="min-w-0 truncate font-semibold text-km-text hover:text-km-green hover:underline"
                  >
                    {c.libelle_site || c.utilisation || 'Sans libellé'}
                  </Link>

                  <span className="truncate font-mono tabular-nums text-km-muted" title={c.numero_pdl}>{c.numero_pdl}</span>

                  <span className={cn('truncate', c.responsable_contact_nom ? 'text-km-muted' : 'text-km-red')}>
                    {c.responsable_contact_nom ?? 'Sans responsable'}
                  </span>

                  <span className="truncate tabular-nums">
                    {c.date_echeance ? (
                      <>
                        <span className={cn('font-semibold', urgent ? 'text-km-red' : 'text-km-text')}>
                          {/* LE JOUR COMPTE (William, 21/09/2026). En « MM/AAAA », deux échéances du
                              même mois se lisaient identiques — or un contrat qui finit le 2 et un
                              autre le 30 ne se consultent pas au même moment, et c'est cette date
                              qui décide de la date de livraison souhaitée d'une version. */}
                          {new Date(c.date_echeance).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                        </span>
                        {jours !== null && (
                          <span className="ml-1 text-km-tiny text-km-faint">
                            {jours < 0 ? 'dépassée' : jours < 31 ? `${jours} j` : `${Math.round(jours / 30.5)} m`}
                          </span>
                        )}
                      </>
                    ) : (
                      <span className="text-km-faint">—</span>
                    )}
                  </span>

                  <span className="text-right tabular-nums text-km-muted">{formaterMwh(c.consommation_annuelle_mwh)}</span>

                  {/* CLIENT OU PROSPECT SE DÉDUIT DU CONTRAT, jamais d'une saisie — voir l'en-tête. */}
                  <span
                    className={cn(
                      'justify-self-start rounded-km-sm px-1.5 py-px text-km-tiny font-bold uppercase tracking-[0.04em]',
                      client ? 'bg-km-green-soft text-km-green' : 'bg-km-soft text-km-muted',
                    )}
                    title={client ? 'Couvert par un contrat en cours' : 'Aucun contrat en cours sur ce compteur'}
                  >
                    {client ? 'Client' : 'Prospect'}
                  </span>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
