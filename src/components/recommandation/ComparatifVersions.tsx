import { useMemo, useState } from 'react'
import { cn } from '@/lib/utils'
import type { Recommandation, VersionRecommandation, OffreFournisseur } from '@/types/domain'

/**
 * Comparatif des versions — le tableau central de l'onglet Recommandation.
 *
 * CE QU'IL FAUT SAVOIR AVANT DE LIRE CE FICHIER. Au 17/08/2026, la source des chiffres est vide :
 * `gain_estime_annuel` est nul sur les 2011 versions, `offres_fournisseurs` compte ZÉRO ligne, et
 * les 1791 optimisations sont toutes « Mise en concurrence » sans gain. La reprise Salesforce a
 * amené les versions et les optimisations, jamais les montants ni les offres. Le schéma, lui, est
 * complet : version → optimisation → fournisseur consulté → offre → détail par PDL → prix au MWh.
 *
 * Deux conséquences assumées :
 *
 *  1. Le tableau lit les vraies colonnes, il n'invente rien. Une case sans donnée affiche « — »
 *     avec la raison en infobulle, plutôt qu'un zéro qui passerait pour un chiffre.
 *  2. Seules les ÉCONOMIES ESTIMÉES sont modifiables en place. La maquette rend aussi le
 *     fournisseur, le budget, le prix au MWh et la durée modifiables, mais dans le design ce sont
 *     des champs libres d'une version fictive : chez nous ils appartiennent à l'offre retenue. Les
 *     éditer ici reviendrait à réécrire une offre depuis un tableau de comparaison — ou à les
 *     écrire nulle part. Ils se saisissent là où ils vivent, sur l'offre.
 *
 * Le surlignage « meilleure valeur » est celui du design : le plus d'économies, le budget et le
 * prix les plus bas. Il ne s'affiche que si au moins deux versions ont la valeur, sinon désigner un
 * gagnant parmi une seule colonne remplie n'a aucun sens.
 */

const TAUX_PRESTATION = 0.12

/** Coût de prestation : 12 % des économies estimées, la règle affichée dans la maquette. */
export function coutPrestationEstime(economies: number | null | undefined): number | null {
  if (economies == null) return null
  return Math.round(economies * TAUX_PRESTATION)
}

/**
 * L'offre retenue d'une version : celle marquée recommandée, sinon la moins chère à l'année.
 *
 * `null` QUAND AUCUNE OFFRE N'EST CHIFFRÉE, et c'est le point important. La fonction se rabattait sur
 * `offres[0]`, c'est-à-dire la première que la requête ramenait — l'ordre de la base. Sur un dossier
 * à deux fournisseurs consultés et aucune offre reçue, le comparatif annonçait donc « Fournisseur :
 * OHM ENERGIE » et « 36 mois · Fixe » comme s'il s'agissait d'une conclusion, alors que MET était
 * consulté aussi et que personne n'avait rien décidé (signalé par Naoëlle le 19/08/2026).
 *
 * Mieux vaut ne rien dire que dire au hasard : les lignes chiffrées affichent « — » avec leur raison,
 * et la ligne Fournisseur liste les fournisseurs consultés.
 */
function offreRetenue(version: VersionRecommandation): OffreFournisseur | null {
  const offres = version.optimisations.flatMap((o) => o.offres)
  const recommandee = offres.find((o) => o.est_offre_recommandee)
  if (recommandee) return recommandee
  const chiffrees = offres.filter((o) => o.montant_annuel_ht != null)
  if (chiffrees.length === 0) return null
  return chiffrees.reduce((a, b) => ((a.montant_annuel_ht ?? 0) <= (b.montant_annuel_ht ?? 0) ? a : b))
}

/** Les fournisseurs consultés d'une version, dédoublonnés et dans l'ordre d'affichage. */
function fournisseursConsultes(version: VersionRecommandation): string[] {
  const noms = version.optimisations.flatMap((o) => o.fournisseurs_consultes.map((f) => f.fournisseur_nom))
  return [...new Set(noms.filter(Boolean))]
}

/**
 * Prix au MWh d'une offre.
 *
 * Le prix ANNONCÉ par le fournisseur d'abord (`prix_moyen_mwh`, saisi sous le fournisseur consulté) :
 * c'est la donnée primaire, celle qu'il écrit dans son mail et sur laquelle on compare. À défaut, la
 * moyenne pondérée par les volumes du détail par PDL — une moyenne simple donnerait autant de poids à
 * un PDL de 6 MWh qu'à un de 800.
 */
function prixMoyenMWh(offre: OffreFournisseur | null): number | null {
  if (!offre) return null
  if (offre.prix_moyen_mwh != null) return offre.prix_moyen_mwh
  let cout = 0
  let volume = 0
  for (const d of offre.details_par_compteur) {
    const mwh = d.consommation_annuelle_reference_mwh
    const fourniture = d.cout_fourniture_annuel_ht
    if (mwh == null || mwh <= 0 || fourniture == null) continue
    cout += fourniture
    volume += mwh
  }
  if (volume <= 0) return null
  return cout / volume
}

function euros(n: number): string {
  return `${Math.round(n).toLocaleString('fr-FR')} €`
}

interface Ligne {
  cle: string
  libelle: string
  /** Sens de la meilleure valeur, ou null si la notion n'a pas de sens (un fournisseur). */
  meilleur: 'max' | 'min' | null
  /** Valeur brute, pour le classement. */
  valeur: (v: VersionRecommandation) => number | null
  /** Valeur affichée. */
  texte: (v: VersionRecommandation) => string
  /** Pourquoi la case est vide, quand elle l'est. */
  raisonVide: string
  modifiable?: boolean
}

export function ComparatifVersions({
  reco,
  versionAffichee,
  onChoisirVersion,
  onMajEconomies,
  peutModifier,
}: {
  reco: Recommandation
  versionAffichee: VersionRecommandation | null
  onChoisirVersion: (v: VersionRecommandation) => void
  onMajEconomies: (versionId: string, economies: number | null) => void
  peutModifier: boolean
}) {
  const versions = reco.versions
  const [enEdition, setEnEdition] = useState<string | null>(null)
  const [brouillon, setBrouillon] = useState('')

  const lignes: Ligne[] = useMemo(
    () => [
      {
        cle: 'economies',
        libelle: 'Économies estimées',
        meilleur: 'max',
        valeur: (v) => v.gains_estimes,
        texte: (v) => (v.gains_estimes != null ? `${euros(v.gains_estimes)} / an` : '—'),
        raisonVide: "Aucun gain estimé saisi sur cette version. Cliquer pour l'indiquer.",
        modifiable: true,
      },
      {
        cle: 'budget',
        libelle: 'Budget proposé',
        meilleur: 'min',
        valeur: (v) => offreRetenue(v)?.montant_annuel_ht ?? null,
        texte: (v) => {
          const m = offreRetenue(v)?.montant_annuel_ht
          return m != null ? `${euros(m)} / an` : '—'
        },
        raisonVide: "Vient de l'offre retenue de la version — aucune offre chiffrée pour l'instant.",
      },
      {
        cle: 'fournisseur',
        libelle: 'Fournisseur',
        meilleur: null,
        valeur: () => null,
        // Une offre retenue donne UN fournisseur, c'est une décision. Sinon on liste ceux qu'on a
        // consultés : c'est l'état réel du dossier, et c'est ce que la personne cherche à voir.
        texte: (v) => {
          const retenue = offreRetenue(v)
          if (retenue?.fournisseur_nom) return retenue.fournisseur_nom
          const consultes = fournisseursConsultes(v)
          if (consultes.length === 0) return '—'
          return consultes.join(' · ') + (consultes.length > 1 ? ' (consultés)' : ' (consulté)')
        },
        raisonVide: "Aucun fournisseur consulté sur cette version.",
      },
      {
        cle: 'prix',
        libelle: 'Prix MWh',
        meilleur: 'min',
        valeur: (v) => prixMoyenMWh(offreRetenue(v)),
        texte: (v) => {
          const p = prixMoyenMWh(offreRetenue(v))
          return p != null ? `${p.toLocaleString('fr-FR', { maximumFractionDigits: 2 })} €` : '—'
        },
        raisonVide: 'Prix annoncé par le fournisseur retenu, ou moyenne pondérée du détail par PDL — non chiffré.',
      },
      {
        cle: 'duree',
        libelle: "Durée d'engagement",
        meilleur: null,
        valeur: () => null,
        texte: (v) => {
          const offre = offreRetenue(v)
          // La durée et le type de prix ensemble : c'est le couple qui identifie l'offre retenue.
          if (offre?.duree_mois != null) return [`${offre.duree_mois} mois`, offre.type_prix].filter(Boolean).join(' · ')
          // À défaut d'offre, les durées demandées à la consultation disent déjà l'intention.
          if (v.durees.length > 0) return `${v.durees.join(' / ')} mois (demandé)`
          return '—'
        },
        raisonVide: "Durée de l'offre retenue, ou durées demandées à la consultation.",
      },
      {
        cle: 'prestation',
        libelle: 'Coût de prestation',
        meilleur: null,
        valeur: (v) => coutPrestationEstime(v.gains_estimes),
        texte: (v) => {
          const c = coutPrestationEstime(v.gains_estimes)
          return c != null ? euros(c) : '—'
        },
        raisonVide: 'Calculé : 12 % des économies estimées.',
      },
    ],
    [],
  )

  /**
   * Lignes « Solutions incluses » : les types d'optimisation présents sur au moins une des versions
   * comparées, avec la contribution de chacune. Pas de liste figée comme dans la maquette — les
   * types viennent de `types_optimisations`, et n'en montrer que trois masquerait les autres.
   */
  const solutions = useMemo(() => {
    const libelles: string[] = []
    for (const v of versions) {
      for (const o of v.optimisations) {
        const libelle = o.type_optimisation || o.nom || 'Optimisation'
        if (!libelles.includes(libelle)) libelles.push(libelle)
      }
    }
    return libelles.map((libelle) => ({
      libelle,
      cellules: versions.map((v) => {
        const trouvee = v.optimisations.find((o) => (o.type_optimisation || o.nom || 'Optimisation') === libelle)
        return { incluse: !!trouvee, gain: trouvee?.gain_estime_annuel ?? null }
      }),
    }))
  }, [versions])

  if (versions.length === 0) {
    return (
      <div className="rounded-[13px] border border-kw-border bg-white p-6 text-center">
        <p className="text-kw-lg font-semibold text-kw-ink">Aucune version à comparer</p>
        <p className="mt-1 text-kw-base text-kw-meta">
          Le comparatif apparaît dès la première cotation : lancez-la avec « Nouvelle version ».
        </p>
      </div>
    )
  }

  const grille = `150px ${versions.map(() => 'minmax(120px,1fr)').join(' ')}`

  // Index de la meilleure valeur par ligne. Nul si moins de deux versions renseignées : désigner un
  // gagnant quand une seule colonne porte un chiffre ne compare rien.
  function meilleurIndex(ligne: Ligne): number {
    if (!ligne.meilleur) return -1
    const valeurs = versions.map(ligne.valeur)
    const renseignees = valeurs.filter((v) => v != null) as number[]
    if (renseignees.length < 2) return -1
    const cible = ligne.meilleur === 'max' ? Math.max(...renseignees) : Math.min(...renseignees)
    return valeurs.findIndex((v) => v === cible)
  }

  function commettre(version: VersionRecommandation) {
    const brut = brouillon.trim().replace(/\s/g, '').replace(',', '.')
    setEnEdition(null)
    if (brut === '') return onMajEconomies(version.id, null)
    const nombre = Number.parseFloat(brut)
    if (!Number.isFinite(nombre) || nombre < 0) return
    onMajEconomies(version.id, Math.round(nombre))
  }

  return (
    <div className="overflow-hidden rounded-[13px] border border-kw-border bg-white">
      <div className="flex items-center gap-2 border-b border-kw-border-subtle px-[17px] py-3">
        <span className="text-kw-xs font-bold uppercase tracking-[0.08em] text-kw-faint">Comparatif des versions</span>
        <span className="flex-1" />
        <span className="flex items-center gap-1.5 text-[9.5px] text-kw-meta">
          <span className="h-2.5 w-2.5 rounded-[3px] border border-[#dcc39c] bg-[#f4ecdf]" />
          meilleure valeur
        </span>
      </div>

      <div className="overflow-x-auto">
        <div className="min-w-[560px]">
          {/* En-tête : une colonne par version, la version affichée est cliquable pour la choisir. */}
          <div className="grid border-b border-kw-border-subtle bg-kw-subtle" style={{ gridTemplateColumns: grille }}>
            <span className="px-[17px] py-2" />
            {versions.map((v) => {
              const active = v.version_actuelle
              return (
                <button
                  key={v.id}
                  type="button"
                  onClick={() => onChoisirVersion(v)}
                  title="Afficher cette version"
                  className={cn(
                    'flex items-center gap-[7px] px-2.5 py-2 text-left font-mono text-kw-base font-extrabold',
                    active ? 'bg-[#fdf9f0] text-[#8a4b2a]' : 'text-kw-faint',
                    versionAffichee?.id === v.id && 'ring-1 ring-inset ring-[#dcc39c]',
                  )}
                >
                  {v.nom || `V${v.numero_version ?? '?'}`}
                  <span
                    className={cn(
                      'rounded-kw-xs px-1.5 py-px font-sans text-[7.5px] font-extrabold tracking-[0.06em]',
                      active ? 'bg-[#8a4b2a] text-white' : 'bg-kw-muted text-kw-faint',
                    )}
                  >
                    {active ? 'ACTIVE' : 'REMPLACÉE'}
                  </span>
                </button>
              )
            })}
          </div>

          {lignes.map((ligne, index) => {
            const gagnant = meilleurIndex(ligne)
            return (
              <div
                key={ligne.cle}
                className={cn('grid items-center', index < lignes.length - 1 && 'border-b border-kw-border-faint')}
                style={{ gridTemplateColumns: grille }}
              >
                <span className="px-[17px] py-2.5 text-kw-sm font-bold text-kw-label">{ligne.libelle}</span>
                {versions.map((v, i) => {
                  const active = v.version_actuelle
                  const idEdition = `${v.id}::${ligne.cle}`
                  const modifiable = peutModifier && ligne.modifiable
                  const vide = ligne.texte(v) === '—'
                  return (
                    <div
                      key={v.id}
                      className={cn(
                        'border-l border-kw-border-faint px-2.5 py-2',
                        !active ? 'bg-transparent' : i === gagnant ? 'bg-[#f9f3e8]' : 'bg-[#fdf9f0]',
                      )}
                    >
                      {enEdition === idEdition ? (
                        <input
                          autoFocus
                          value={brouillon}
                          onChange={(e) => setBrouillon(e.target.value)}
                          onBlur={() => commettre(v)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') commettre(v)
                            if (e.key === 'Escape') setEnEdition(null)
                          }}
                          placeholder="€ / an"
                          className="w-[90px] rounded-kw-sm border border-kw-green bg-white px-1.5 py-0.5 font-mono text-kw-base font-extrabold text-kw-ink outline-none ring-[3px] ring-kw-green/10"
                        />
                      ) : (
                        <button
                          type="button"
                          disabled={!modifiable}
                          title={vide ? ligne.raisonVide : modifiable ? 'Cliquer pour modifier' : ligne.raisonVide}
                          onClick={() => {
                            if (!modifiable) return
                            setEnEdition(idEdition)
                            setBrouillon(v.gains_estimes != null ? String(v.gains_estimes) : '')
                          }}
                          className={cn(
                            'font-mono text-kw-md',
                            modifiable ? 'cursor-text border-b border-dashed border-[#d9d0bd]' : 'cursor-help',
                            vide
                              ? 'font-medium text-kw-ghost'
                              : !active
                                ? 'font-medium text-kw-faint'
                                : i === gagnant
                                  ? 'font-extrabold text-[#8a5f22]'
                                  : 'font-bold text-kw-ink',
                          )}
                        >
                          {ligne.texte(v)}
                        </button>
                      )}
                    </div>
                  )
                })}
              </div>
            )
          })}

          {/* ── Solutions incluses ── */}
          <div className="grid" style={{ gridTemplateColumns: '1fr' }}>
            <span className="border-t border-kw-border-subtle bg-kw-subtle px-[17px] py-2 text-kw-tiny font-extrabold uppercase tracking-[0.07em] text-kw-faint">
              Solutions incluses
            </span>
          </div>
          {solutions.length === 0 ? (
            <p className="px-[17px] py-2.5 text-kw-base text-kw-faint">
              Aucune optimisation rattachée à ces versions.
            </p>
          ) : (
            solutions.map((s, si) => (
              <div
                key={s.libelle}
                className={cn('grid items-center', si < solutions.length - 1 && 'border-b border-kw-border-faint')}
                style={{ gridTemplateColumns: grille }}
              >
                <span className="px-[17px] py-2.5 text-kw-sm font-bold text-kw-label">{s.libelle}</span>
                {s.cellules.map((c, i) => {
                  const active = versions[i].version_actuelle
                  return (
                    <div
                      key={versions[i].id}
                      className={cn(
                        'flex items-center gap-[7px] border-l border-kw-border-faint px-2.5 py-2',
                        active ? 'bg-[#fdf9f0]' : 'bg-transparent',
                      )}
                    >
                      <span
                        className={cn(
                          'inline-flex h-[17px] w-[17px] shrink-0 items-center justify-center rounded-full text-kw-xs font-extrabold',
                          c.incluse ? 'bg-kw-green-light text-kw-green' : 'bg-kw-red-light text-kw-red',
                          !active && 'opacity-55',
                        )}
                      >
                        {c.incluse ? '✓' : '✗'}
                      </span>
                      {c.incluse && c.gain != null && (
                        <span
                          className={cn('font-mono text-[10.5px] font-extrabold', active ? 'text-kw-green' : 'text-kw-faint')}
                        >
                          −{Math.round(c.gain).toLocaleString('fr-FR')} €/an
                        </span>
                      )}
                    </div>
                  )
                })}
              </div>
            ))
          )}
        </div>
      </div>

      {/* Dit une fois, en bas du tableau, d'où viennent les cases vides — plutôt que de laisser
          croire à une panne d'affichage. */}
      {versions.every((v) => v.optimisations.every((o) => o.offres.length === 0)) && (
        <p className="border-t border-kw-border-subtle bg-kw-subtle px-[17px] py-2 text-kw-tiny leading-snug text-kw-faint">
          Budget, fournisseur et prix au MWh se lisent sur l'offre retenue de chaque version. Aucune
          offre n'est encore enregistrée ici : elles se remplissent au fil des réponses des
          fournisseurs consultés.
        </p>
      )}
    </div>
  )
}
