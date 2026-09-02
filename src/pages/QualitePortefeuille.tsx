import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Bar, BarChart, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import { PageHeader, Indicateurs } from '@/components/ui/page-header'
import { Card } from '@/components/ui/card'
import { Dialog } from '@/components/ui/dialog'
import { Input } from '@/components/ui/form'
import { MenuChoix } from '@/components/ui/menu-choix'
import { Tableau, TableauTete, TableauCorps, NomDeLigne } from '@/components/ui/tableau'
import { SortableTh } from '@/components/ui/sortable-th'
import { PiedDeListe } from '@/components/ui/pied-de-liste'
import { IconeEnergie } from '@/components/ui/icone-energie'
import { EntityLink } from '@/components/ui/entity-link'
import {
  useCompteursQualite, useComptesQualite, anomaliesCompteur, trancheDe, TRANCHES,
  type CompteurQualite, type TrancheScore,
} from '@/lib/data/qualitePortefeuille'
import { pastilleScore } from '@/lib/niveauScore'
import { usePerimetre, BasculePerimetre } from '@/lib/perimetre'
import { useMonProfil } from '@/lib/data/roles'
import { dateRelative } from '@/lib/dateRelative'
import { cn } from '@/lib/utils'

/**
 * ══ QUALITÉ DU PORTEFEUILLE ══
 *
 * Cadrage validé transmis par Naoëlle le 02/09/2026, et suivi point par point. Il remplace le
 * contenu de l'onglet Synthèse du Patrimoine — « Patrimoine des comptes », qui affichait quatre
 * blocs de comptage sans moyen d'aller voir les lignes derrière.
 *
 * Son objectif, mot pour mot : « suivre la qualité des données du portefeuille au niveau des comptes
 * et des compteurs, puis identifier rapidement les corrections à effectuer ».
 *
 * ══ CE QUE LE CADRAGE DEMANDE, ET OÙ C'EST ══
 *
 *   1. haut       scoring global, nombre de comptes, consommation totale, deux camemberts
 *   2. filtres    échéance · scoring · processus commercial, qui se combinent
 *   3. graphiques deux histogrammes jumeaux — compteurs et consommation par échéance
 *   4. tableau    huit colonnes, le score cliquable ouvrant les anomalies
 *   5. barème     inchangé, déjà en base (migration 20260902100000)
 *
 * ══ LE SCORING GLOBAL EST UNE MOYENNE DE MOYENNES, ET C'EST VOULU ══
 *
 * « Le scoring global correspond à la moyenne des scores de tous les comptes. Le score d'un compte
 * correspond à la moyenne des scores de tous ses compteurs. »
 *
 * Ce n'est donc PAS la moyenne des 7 915 compteurs : un compte à un seul compteur pèse autant qu'un
 * cabinet qui en porte trois cents. Mesuré le 02/09 : la moyenne des comptes donne 49,4, celle des
 * compteurs 55,2 — six points d'écart. Le chiffre du cadrage est le premier, parce que la page parle
 * de la qualité du PORTEFEUILLE : un client mal tenu compte pour un client, pas pour ses compteurs.
 *
 * ══ POURQUOI LES FILTRES TRAVAILLENT DANS LE NAVIGATEUR ══
 *
 * Voir `qualitePortefeuille.ts` : les trois filtres se combinent, et les deux graphiques comme les
 * totaux doivent suivre. Tout charger une fois — un peu plus d'un mégaoctet de lignes plates — rend
 * chaque clic instantané, là où des agrégats en base demanderaient trois requêtes par changement de
 * filtre.
 */

type ModeEcheance = 'toutes' | 'apres' | 'avant' | 'entre' | 'absente_depassee'
type ModeProcessus = 'tous' | 'hors' | 'opportunite' | 'recommandation'

const MWH = (v: number) => Math.round(v).toLocaleString('fr-FR')

/** Le jour d'aujourd'hui en « AAAA-MM-JJ », lu en heure locale. */
function jourIso(): string {
  const d = new Date()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const j = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${j}`
}

/**
 * ══ L'ÉCHELLE TEMPORELLE DES DEUX HISTOGRAMMES ══
 *
 * « Les deux graphiques doivent afficher toutes les dates comprises dans les filtres sélectionnés,
 * avec une échelle temporelle qui s'adapte automatiquement. »
 *
 * Le pas se choisit sur l'étendue réelle des échéances retenues, et non sur le filtre : filtrer
 * « après le 01/01/2027 » sur un portefeuille qui s'arrête en 2028 donne un an et demi, pas
 * l'infini. Trois paliers suffisent, et ils suivent la façon dont on lit un calendrier :
 *
 *     jusqu'à 3 mois     par semaine    on prépare des appels, la semaine est l'unité de travail
 *     jusqu'à 3 ans      par mois       l'horizon commercial habituel d'un renouvellement
 *     au-delà            par an         on regarde la forme du portefeuille, pas un rendez-vous
 *
 * Sans ce choix, un axe par jour sur trois ans donnerait mille barres d'un pixel, et un axe par an
 * sur deux mois en donnerait une seule.
 */
function pasTemporel(jours: number): 'semaine' | 'mois' | 'annee' {
  if (jours <= 92) return 'semaine'
  if (jours <= 1096) return 'mois'
  return 'annee'
}

function clefPeriode(iso: string, pas: 'semaine' | 'mois' | 'annee'): string {
  const [a, m, j] = iso.slice(0, 10).split('-').map(Number)
  if (pas === 'annee') return String(a)
  if (pas === 'mois') return `${a}-${String(m).padStart(2, '0')}`
  // La semaine est ramenée à son lundi : deux échéances de la même semaine doivent tomber dans la
  // même barre, quel que soit le jour.
  const d = new Date(Date.UTC(a, m - 1, j))
  const decalage = (d.getUTCDay() + 6) % 7
  d.setUTCDate(d.getUTCDate() - decalage)
  return d.toISOString().slice(0, 10)
}

function libellePeriode(cle: string, pas: 'semaine' | 'mois' | 'annee'): string {
  if (pas === 'annee') return cle
  if (pas === 'mois') {
    const [a, m] = cle.split('-')
    return new Date(Number(a), Number(m) - 1, 1)
      .toLocaleDateString('fr-FR', { month: 'short', year: '2-digit' })
  }
  return new Date(cle).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' })
}

/** L'étiquette de la barre agrégée. Le cadrage en demande UNE pour les deux cas réunis. */
const CLE_ARRIERE = '__arriere__'

export default function QualitePortefeuille() {
  const navigate = useNavigate()

  /* ══ LA BASCULE DE PÉRIMÈTRE ══
     « Le toggle sera par défaut dans les données du commercial » — et c'est déjà la règle de
     `usePerimetre`, en place depuis le 28/08 sur les recommandations, les opportunités, les mandats
     et les requêtes : « Mes dossiers » par défaut pour tout le monde, administrateurs compris, avec
     la bascule à côté. Rien de neuf à écrire, et le choix se retient d'une visite à l'autre.

     TANT QUE LE PROFIL N'EST PAS CHARGÉ, ON NE FILTRE PAS. Le contraire — filtrer sur `undefined` —
     rendrait une page vide pendant une fraction de seconde, qu'on lirait comme « je n'ai aucun
     compte ». Mieux vaut montrer brièvement l'ensemble que faire croire à un portefeuille vide. */
  const { data: monProfil } = useMonProfil()
  const { perimetre, setPerimetre } = usePerimetre('qualite-portefeuille')
  const filtreProprietaire = perimetre === 'moi' ? monProfil?.id ?? null : null

  const { data: compteurs, isLoading } = useCompteursQualite(filtreProprietaire)
  const { data: comptes } = useComptesQualite(filtreProprietaire)

  const [modeEcheance, setModeEcheance] = useState<ModeEcheance>('toutes')
  const [dateDebut, setDateDebut] = useState('')
  const [dateFin, setDateFin] = useState('')
  const [tranche, setTranche] = useState<TrancheScore | ''>('')
  const [processus, setProcessus] = useState<ModeProcessus>('tous')
  const [tri, setTri] = useState<'score' | 'consommation_annuelle_mwh' | 'date_echeance' | 'compte_nom'>('score')
  const [sens, setSens] = useState<'asc' | 'desc'>('asc')
  const [limite, setLimite] = useState(100)
  const [anomalies, setAnomalies] = useState<CompteurQualite | null>(null)

  const aujourdhui = jourIso()

  /* ══ LES TROIS FILTRES, COMBINÉS ══
     Ils se cumulent par ET, comme le cadrage le demande : « trois filtres qui se combinent entre
     eux ». Chacun est indépendant des deux autres, donc l'ordre d'application n'a pas d'importance —
     seul le résultat compte, et il alimente à la fois les totaux, les deux graphiques et le tableau. */
  const filtres = useMemo(() => {
    let lignes = compteurs ?? []

    if (modeEcheance === 'absente_depassee') {
      lignes = lignes.filter((c) => !c.date_echeance || c.date_echeance < aujourdhui)
    } else if (modeEcheance === 'apres' && dateDebut) {
      lignes = lignes.filter((c) => c.date_echeance && c.date_echeance >= dateDebut)
    } else if (modeEcheance === 'avant' && dateFin) {
      lignes = lignes.filter((c) => c.date_echeance && c.date_echeance <= dateFin)
    } else if (modeEcheance === 'entre' && dateDebut && dateFin) {
      lignes = lignes.filter(
        (c) => c.date_echeance && c.date_echeance >= dateDebut && c.date_echeance <= dateFin,
      )
    }

    if (tranche) lignes = lignes.filter((c) => trancheDe(c.score) === tranche)

    if (processus === 'hors') lignes = lignes.filter((c) => !c.dans_processus_commercial)
    else if (processus === 'opportunite') lignes = lignes.filter((c) => c.opportunite_en_cours)
    else if (processus === 'recommandation') lignes = lignes.filter((c) => c.recommandation_en_cours)

    return lignes
  }, [compteurs, modeEcheance, dateDebut, dateFin, tranche, processus, aujourdhui])

  /* ══ LA PARTIE HAUTE ══
     Le scoring global et le nombre de comptes viennent des COMPTES, pas des compteurs filtrés : ce
     sont des mesures du portefeuille entier, et les faire varier avec les filtres du bas ferait
     lire « le portefeuille vaut 62 » alors qu'on vient juste de masquer les mauvais. */
  const scoringGlobal = useMemo(() => {
    const l = comptes ?? []
    if (l.length === 0) return 0
    return Math.round(l.reduce((t, c) => t + c.score, 0) / l.length)
  }, [comptes])

  const consommationTotale = useMemo(
    () => (compteurs ?? []).reduce((t, c) => t + (c.consommation_annuelle_mwh ?? 0), 0),
    [compteurs],
  )

  const partsComptes = useMemo(() => {
    const l = comptes ?? []
    return TRANCHES.map((t) => ({
      name: t.libelle,
      value: l.filter((c) => trancheDe(c.score) === t.cle).length,
      couleur: t.couleur,
    }))
  }, [comptes])

  const partsCompteurs = useMemo(() => {
    const l = compteurs ?? []
    return TRANCHES.map((t) => ({
      name: t.libelle,
      value: l.filter((c) => trancheDe(c.score) === t.cle).length,
      couleur: t.couleur,
    }))
  }, [compteurs])

  /* ══ LES DEUX HISTOGRAMMES JUMEAUX ══
     Une seule passe construit les deux séries : elles partagent exactement les mêmes barres, et les
     calculer séparément risquerait de les désaligner. Les échéances passées ou absentes forment UNE
     barre agrégée, comme le cadrage le demande. */
  const histogramme = useMemo(() => {
    const aVenir = filtres.filter((c) => c.date_echeance && c.date_echeance >= aujourdhui)
    const arriere = filtres.filter((c) => !c.date_echeance || (c.date_echeance ?? '') < aujourdhui)

    let pas: 'semaine' | 'mois' | 'annee' = 'mois'
    if (aVenir.length > 0) {
      const dates = aVenir.map((c) => c.date_echeance as string).sort()
      const jours =
        (new Date(dates[dates.length - 1]).getTime() - new Date(dates[0]).getTime()) / 86_400_000
      pas = pasTemporel(jours)
    }

    const parPeriode = new Map<string, { compteurs: number; mwh: number }>()
    for (const c of aVenir) {
      const cle = clefPeriode(c.date_echeance as string, pas)
      const e = parPeriode.get(cle) ?? { compteurs: 0, mwh: 0 }
      e.compteurs += 1
      e.mwh += c.consommation_annuelle_mwh ?? 0
      parPeriode.set(cle, e)
    }

    const barres = [...parPeriode.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([cle, v]) => ({ cle, libelle: libellePeriode(cle, pas), ...v }))

    if (arriere.length > 0) {
      // En TÊTE, et non à la fin : l'arriéré est ce qu'on traite d'abord, et l'axe se lit de gauche
      // à droite comme le temps.
      barres.unshift({
        cle: CLE_ARRIERE,
        libelle: 'Dépassées / absentes',
        compteurs: arriere.length,
        mwh: arriere.reduce((t, c) => t + (c.consommation_annuelle_mwh ?? 0), 0),
      })
    }
    return { barres, pas }
  }, [filtres, aujourdhui])

  /* ══ LE TABLEAU ══
     Trié par score croissant par défaut : la page sert à « identifier rapidement les corrections à
     effectuer », donc les pires d'abord. */
  const triees = useMemo(() => {
    const l = [...filtres]
    l.sort((a, b) => {
      let d = 0
      if (tri === 'score') d = a.score - b.score
      else if (tri === 'consommation_annuelle_mwh')
        d = (a.consommation_annuelle_mwh ?? -1) - (b.consommation_annuelle_mwh ?? -1)
      else if (tri === 'date_echeance') d = (a.date_echeance ?? '9999').localeCompare(b.date_echeance ?? '9999')
      else d = (a.compte_nom ?? '').localeCompare(b.compte_nom ?? '')
      // À score égal, le plus gros volume d'abord : la donnée manquante y coûte plus cher.
      if (d === 0) d = (b.consommation_annuelle_mwh ?? 0) - (a.consommation_annuelle_mwh ?? 0)
      return sens === 'asc' ? d : -d
    })
    return l
  }, [filtres, tri, sens])

  function trierPar(colonne: typeof tri) {
    if (colonne === tri) setSens((s) => (s === 'asc' ? 'desc' : 'asc'))
    else { setTri(colonne); setSens(colonne === 'score' ? 'asc' : 'desc') }
    setLimite(100)
  }

  /* LES PRÉCISIONS NOMMENT LE PÉRIMÈTRE. Un « 2 765 comptes » sans mention se lit comme le total
     de Kimatch même quand on est sur son propre portefeuille — et l'écart est grand : Guillaume
     Gilles en a 934, Naoëlle 6. Le mot sous le chiffre évite la mauvaise lecture. */
  const ouPortefeuille = perimetre === 'moi' ? 'de mon patrimoine' : 'de tout Kimatch'
  const mesures = [
    { libelle: 'Scoring global', valeur: `${scoringGlobal}/100`, precision: `Moyenne des comptes ${ouPortefeuille}` },
    { libelle: 'Comptes', valeur: (comptes?.length ?? 0).toLocaleString('fr-FR'), precision: perimetre === 'moi' ? 'Dont je suis propriétaire' : 'Portefeuille entier' },
    { libelle: 'Consommation', valeur: `${MWH(consommationTotale)} MWh`, precision: `Compteurs ${ouPortefeuille}` },
    { libelle: 'Compteurs filtrés', valeur: filtres.length.toLocaleString('fr-FR'), precision: `sur ${(compteurs?.length ?? 0).toLocaleString('fr-FR')}` },
  ]

  return (
    <div className="flex flex-col gap-3.5">
      <PageHeader
        titreMasque
        title="Qualité du portefeuille"
        description="Suivre la qualité des données au niveau des comptes et des compteurs, et repérer les corrections à faire."
      />

      {/* LA BASCULE EN TÊTE, AVANT LES CHIFFRES : elle décide de CE QUE tous les chiffres de la page
          comptent, donc elle se lit avant eux. Placée sous les indicateurs, on lirait « 49/100 » sans
          savoir de quel portefeuille on parle. */}
      <div className="flex flex-wrap items-center gap-2.5">
        <BasculePerimetre
          valeur={perimetre}
          onChange={setPerimetre}
          libelleMien="Mon patrimoine"
          libelleTous="Tout Kimatch"
        />
        <p className="text-km-label text-km-faint">
          {perimetre === 'moi'
            ? 'Les comptes dont vous êtes propriétaire, et leurs compteurs.'
            : 'Tous les comptes de Kimatch, quel qu’en soit le propriétaire.'}
        </p>
      </div>

      <Indicateurs mesures={mesures} />

      {/* ══ 1. LES DEUX CAMEMBERTS ══
          Trois parts chacun — 80-100, 50-79, 0-49 — les tranches du cadrage. Côte à côte parce que
          la question est justement de les comparer : un portefeuille peut avoir de bons comptes et
          de mauvais compteurs si les mauvais sont concentrés sur quelques gros clients. */}
      <div className="grid gap-3 lg:grid-cols-2">
        <CamembertScore titre="Répartition des comptes" parts={partsComptes} unite="comptes" />
        <CamembertScore titre="Répartition des compteurs" parts={partsCompteurs} unite="compteurs" />
      </div>

      {/* ══ 2. LES TROIS FILTRES ══ */}
      <Card className="p-3.5">
        <p className="mb-2.5 text-km-xs font-bold uppercase tracking-[0.08em] text-km-faint">
          Filtrer les compteurs
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <MenuChoix
            valeur={modeEcheance}
            onChange={(v) => { setModeEcheance(v as ModeEcheance); setLimite(100) }}
            ariaLabel="Filtrer par échéance"
            choix={[
              { valeur: 'toutes', libelle: 'Toutes les échéances' },
              { valeur: 'apres', libelle: 'Supérieure à une date' },
              { valeur: 'avant', libelle: 'Inférieure à une date' },
              { valeur: 'entre', libelle: 'Entre deux dates' },
              { valeur: 'absente_depassee', libelle: 'Absente ou dépassée' },
            ]}
          />
          {/* LES CHAMPS DE DATE N'APPARAISSENT QUE SI LE MODE LES DEMANDE. Deux champs vides et
              inertes à côté de « toutes les échéances » invitent à les remplir pour rien. */}
          {(modeEcheance === 'apres' || modeEcheance === 'entre') && (
            <label className="flex items-center gap-1.5 text-km-label text-km-muted">
              après le
              <Input type="date" value={dateDebut} onChange={(e) => setDateDebut(e.target.value)} className="h-[32px] w-[150px]" />
            </label>
          )}
          {(modeEcheance === 'avant' || modeEcheance === 'entre') && (
            <label className="flex items-center gap-1.5 text-km-label text-km-muted">
              avant le
              <Input type="date" value={dateFin} onChange={(e) => setDateFin(e.target.value)} className="h-[32px] w-[150px]" />
            </label>
          )}

          <MenuChoix
            valeur={tranche}
            onChange={(v) => { setTranche(v as TrancheScore | ''); setLimite(100) }}
            ariaLabel="Filtrer par scoring"
            choix={[
              { valeur: '', libelle: 'Tous les scores' },
              ...TRANCHES.map((t) => ({ valeur: t.cle, libelle: t.libelle })),
            ]}
          />

          <MenuChoix
            valeur={processus}
            onChange={(v) => { setProcessus(v as ModeProcessus); setLimite(100) }}
            ariaLabel="Filtrer par processus commercial"
            choix={[
              { valeur: 'tous', libelle: 'Tous les compteurs' },
              { valeur: 'hors', libelle: 'Hors processus commercial', detail: 'ni opportunité ni recommandation ouverte' },
              { valeur: 'opportunite', libelle: 'Opportunité en cours', detail: 'Nouvelle, En qualification, Couverture mandat, Prête à convertir' },
              { valeur: 'recommandation', libelle: 'Recommandation en cours', detail: 'Brouillon, Active, À réactiver' },
            ]}
          />
        </div>
      </Card>

      {/* ══ 3. LES DEUX HISTOGRAMMES JUMEAUX ══ */}
      <div className="grid gap-3 lg:grid-cols-2">
        <HistogrammeEcheance
          titre="Compteurs par échéance"
          barres={histogramme.barres}
          cle="compteurs"
          couleur="#3b5f8a"
          formate={(v) => v.toLocaleString('fr-FR')}
        />
        <HistogrammeEcheance
          titre="Consommation par échéance"
          barres={histogramme.barres}
          cle="mwh"
          couleur="#0d7a5f"
          formate={(v) => `${MWH(v)} MWh`}
        />
      </div>

      {/* ══ 4. LE TABLEAU DÉTAILLÉ ══ */}
      <Card className="p-2.5">
        <Tableau minWidth={1000}>
          <TableauTete>
            <tr>
              <SortableTh label="Compte" sortKey="compte_nom" activeKey={tri} dir={sens} onSort={(k) => trierPar(k as typeof tri)} />
              <th className="px-5 py-3 font-medium">Site</th>
              <th className="px-5 py-3 font-medium">Point de livraison</th>
              <th className="px-5 py-3 font-medium">Énergie</th>
              <SortableTh label="Consommation" sortKey="consommation_annuelle_mwh" activeKey={tri} dir={sens} onSort={(k) => trierPar(k as typeof tri)} />
              <SortableTh label="Échéance" sortKey="date_echeance" activeKey={tri} dir={sens} onSort={(k) => trierPar(k as typeof tri)} />
              <th className="px-5 py-3 font-medium">Responsable</th>
              <SortableTh label="Scoring" sortKey="score" activeKey={tri} dir={sens} onSort={(k) => trierPar(k as typeof tri)} />
            </tr>
          </TableauTete>
          <TableauCorps>
            {isLoading && (
              <tr><td colSpan={8} className="py-6 text-center text-km-muted">Chargement des compteurs…</td></tr>
            )}
            {!isLoading && triees.length === 0 && (
              <tr>
                <td colSpan={8} className="py-10 text-center text-km-muted">
                  Aucun compteur ne correspond à ces trois filtres.
                </td>
              </tr>
            )}
            {triees.slice(0, limite).map((c) => (
              <tr key={c.compteur_id}>
                <td>
                  <NomDeLigne>
                    {c.compte_id ? (
                      <EntityLink to={`/comptes/${c.compte_id}`}>{c.compte_nom}</EntityLink>
                    ) : '—'}
                  </NomDeLigne>
                </td>
                <td className="px-5 py-3 text-km-body text-km-muted">
                  {c.site_id ? <EntityLink to={`/sites/${c.site_id}`}>{c.site_nom}</EntityLink> : '—'}
                </td>
                <td className="px-5 py-3">
                  <EntityLink to={`/compteurs/${c.compteur_id}`}>
                    <span className="font-mono text-km-body">{c.numero_point}</span>
                  </EntityLink>
                </td>
                <td className="px-5 py-3"><IconeEnergie type={c.type_energie} /></td>
                <td className="px-5 py-3 text-km-body tabular-nums text-km-text">
                  {c.consommation_annuelle_mwh != null ? `${MWH(c.consommation_annuelle_mwh)} MWh` : '—'}
                </td>
                <td className="px-5 py-3 text-km-body">
                  {c.date_echeance ? (
                    <>
                      <span className="tabular-nums text-km-text">
                        {new Date(c.date_echeance).toLocaleDateString('fr-FR')}
                      </span>
                      <span className={cn('block text-km-tiny', c.date_echeance < aujourdhui ? 'text-km-amber' : 'text-km-faint')}>
                        {dateRelative(c.date_echeance)}
                      </span>
                    </>
                  ) : (
                    <span className="text-km-amber">absente</span>
                  )}
                </td>
                <td className="px-5 py-3 text-km-body text-km-muted">
                  {c.responsable_nom || <span className="text-km-amber">non renseigné</span>}
                </td>
                {/* LE SCORE EST CLIQUABLE, comme le cadrage le demande : « au clic, ouvrir le détail
                    des anomalies à corriger ». C'est le seul endroit de la ligne où l'on apprend
                    quelque chose de plus — le reste se lit déjà. */}
                <td className="px-5 py-3">
                  <button
                    type="button"
                    onClick={() => setAnomalies(c)}
                    className={cn(
                      'flex h-8 w-8 items-center justify-center rounded-full text-km-label font-extrabold tabular-nums transition-transform hover:scale-110',
                      pastilleScore(c.score),
                    )}
                    title="Voir les anomalies à corriger"
                  >
                    {c.score}
                  </button>
                </td>
              </tr>
            ))}
          </TableauCorps>
        </Tableau>
      </Card>

      <PiedDeListe
        affiches={Math.min(limite, triees.length)}
        total={triees.length}
        reste={Math.max(0, triees.length - limite)}
        onAfficherPlus={() => setLimite((n) => n + 200)}
        tailleTrancheSuivante={200}
        libelle="compteurs"
      />

      {anomalies && (
        <Dialog
          open
          onClose={() => setAnomalies(null)}
          title={`Compteur ${anomalies.numero_point} — ${anomalies.score}/100`}
          description={[anomalies.compte_nom, anomalies.site_nom].filter(Boolean).join(' · ')}
        >
          {(() => {
            const liste = anomaliesCompteur(anomalies)
            if (liste.length === 0) {
              return (
                <p className="text-km-body text-km-green">
                  Rien à corriger : contrat en cours et responsable désigné.
                </p>
              )
            }
            return (
              <>
                <p className="mb-2.5 text-km-body text-km-muted">À corriger sur ce compteur :</p>
                <ul className="flex flex-col gap-1.5">
                  {liste.map((a) => (
                    <li key={a} className="flex items-start gap-2 rounded-km border border-km-amber-line bg-km-amber-soft/40 px-3 py-2">
                      <span className="mt-[3px] h-1.5 w-1.5 shrink-0 rounded-full bg-km-amber" />
                      <span className="text-km-body text-km-text">{a}</span>
                    </li>
                  ))}
                </ul>
              </>
            )
          })()}
          <div className="mt-3.5 flex justify-end">
            <button
              type="button"
              onClick={() => navigate(`/compteurs/${anomalies.compteur_id}`)}
              className="rounded-km bg-km-green px-3 py-1.5 text-km-label font-semibold text-white hover:brightness-95"
            >
              Ouvrir le compteur
            </button>
          </div>
        </Dialog>
      )}
    </div>
  )
}

/** Un camembert de répartition, trois parts, avec sa légende chiffrée à droite. */
function CamembertScore({ titre, parts, unite }: {
  titre: string
  parts: { name: string; value: number; couleur: string }[]
  unite: string
}) {
  const total = parts.reduce((t, p) => t + p.value, 0)
  return (
    <Card className="p-3.5">
      <p className="mb-1 text-km-xs font-bold uppercase tracking-[0.08em] text-km-faint">{titre}</p>
      <div className="flex items-center gap-3">
        <div className="h-[150px] w-[150px] shrink-0">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={parts} dataKey="value" nameKey="name" innerRadius={38} outerRadius={70} paddingAngle={2}>
                {parts.map((p) => <Cell key={p.name} fill={p.couleur} />)}
              </Pie>
              <Tooltip
                /* Recharts passe un `ValueType`, pas un nombre : le typer `number` compile ici
                   et casse à la première version qui resserre ses types. On convertit. */
                formatter={(v) => [`${Number(v ?? 0).toLocaleString('fr-FR')} ${unite}`, '']}
                contentStyle={{ fontSize: 12, borderRadius: 10, border: '1px solid #e6e4df' }}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
        {/* LA LÉGENDE PORTE LES CHIFFRES ET LES PARTS. Un camembert seul se lit « à peu près un
            tiers » ; le pourcentage évite d'avoir à survoler chaque quartier pour comparer. */}
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          {parts.map((p) => (
            <div key={p.name} className="flex items-baseline gap-2">
              <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: p.couleur }} />
              <span className="flex-1 text-km-label text-km-muted">{p.name}</span>
              <span className="font-mono text-km-body font-bold tabular-nums text-km-text">
                {p.value.toLocaleString('fr-FR')}
              </span>
              <span className="w-10 text-right text-km-label tabular-nums text-km-faint">
                {total > 0 ? `${Math.round((p.value / total) * 100)} %` : '—'}
              </span>
            </div>
          ))}
        </div>
      </div>
    </Card>
  )
}

/** Un des deux histogrammes jumeaux. Les deux partagent exactement les mêmes barres. */
function HistogrammeEcheance({ titre, barres, cle, couleur, formate }: {
  titre: string
  barres: { cle: string; libelle: string; compteurs: number; mwh: number }[]
  cle: 'compteurs' | 'mwh'
  couleur: string
  formate: (v: number) => string
}) {
  return (
    <Card className="p-3.5">
      <p className="mb-2 text-km-xs font-bold uppercase tracking-[0.08em] text-km-faint">{titre}</p>
      {barres.length === 0 ? (
        <p className="py-10 text-center text-km-body text-km-faint">Aucune échéance dans ce filtre.</p>
      ) : (
        <div className="h-[220px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={barres} margin={{ top: 4, right: 8, bottom: 4, left: 4 }}>
              <XAxis
                dataKey="libelle"
                tick={{ fontSize: 10, fill: '#83868f' }}
                interval="preserveStartEnd"
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={{ fontSize: 10, fill: '#83868f' }}
                axisLine={false}
                tickLine={false}
                width={46}
                tickFormatter={(v: number) => (v >= 1000 ? `${Math.round(v / 1000)}k` : String(v))}
              />
              <Tooltip
                formatter={(v) => [formate(Number(v ?? 0)), '']}
                contentStyle={{ fontSize: 12, borderRadius: 10, border: '1px solid #e6e4df' }}
              />
              <Bar dataKey={cle} radius={[3, 3, 0, 0]}>
                {barres.map((b) => (
                  /* LA BARRE DE L'ARRIÉRÉ EST AMBRE : elle n'est pas une période comme les autres,
                     et la peindre de la même couleur la ferait lire comme un mois de plus. */
                  <Cell key={b.cle} fill={b.cle === CLE_ARRIERE ? '#b57a24' : couleur} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </Card>
  )
}
