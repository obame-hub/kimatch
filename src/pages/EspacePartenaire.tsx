import { useCallback, useEffect, useMemo, useState } from 'react'
import { AlertTriangle, Building2, Gauge, KeyRound, Loader2, MapPin, Search, Sparkle } from 'lucide-react'
import kiweePicto from '@/assets/kiwee-picto.png'
import { cn } from '@/lib/utils'

/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * L'ESPACE PARTENAIRE — UNE PAGE, UNE CLÉ, AUCUN COMPTE KIMATCH
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * Naoëlle, 26/09/2026 : « est-ce qu'ils peuvent passer par l'API et voir une interface visuelle ?
 * comme ça ils ont une interface sans entrer dans Kimatch ».
 *
 * ══ POURQUOI CETTE PAGE PLUTÔT QU'UN ACCÈS KIMATCH ══
 *
 * Faire entrer un externe dans Kimatch, c'est lui donner une session dans une application de 188
 * tables, 25 vues et 69 points d'entrée, dont chacun doit refuser individuellement — et pour
 * toujours. Sept failles ont été mesurées en deux jours, dont une dans une correction écrite la
 * veille. Ce n'est pas un défaut d'attention : la surface est trop grande.
 *
 * Ici, il n'y a pas de session. La page ne parle qu'à `api/partenaire/`, qui ne rend que deux
 * ressources, en lecture, bornées par la clé. Ajouter demain une table ou un écran à Kimatch
 * n'ouvre rien de plus. C'est la même décision que la boîte de dépôt (`/depot/:jeton`), qui sert
 * un client sans compte depuis le 23/09.
 *
 * ══ LA CLÉ VIT DANS LE NAVIGATEUR, PAS DANS L'URL ══
 *
 * Une clé dans l'adresse se retrouve dans l'historique, dans les journaux du serveur, et dans le
 * `Referer` envoyé au moindre lien sortant. On la demande donc une fois, on la garde dans
 * `localStorage`, et l'adresse reste `/partenaire`.
 *
 * ══ CE QU'ELLE MONTRE ══
 *
 * Ses recommandations et son patrimoine, c'est-à-dire exactement ce que l'espace partenaire de
 * Kimatch montrait. Rien de plus : ni marge de KiWee, ni commentaire interne, ni compte qu'il n'a
 * pas apporté — l'API s'en charge, et cette page ne peut pas en demander davantage.
 */

interface Compte {
  id: string
  reference: string | null
  nom: string
  siren: string | null
  ville: string | null
  code_postal: string | null
  segment: string | null
  actif: boolean
}

interface Site {
  id: string
  compte_id: string
  nom: string
  adresse: string | null
  code_postal: string | null
  ville: string | null
}

interface Compteur {
  id: string
  site_id: string
  numero_point: string
  libelle: string | null
  consommation_annuelle_mwh: number | null
  date_echeance: string | null
}

interface Recommandation {
  id: string
  reference: string | null
  nom: string
  compte_id: string
  date_ouverture: string | null
  montant: number | null
  duree_mois: number | null
  marge_apporteur: number | null
  etape: { libelle: string } | null
  compte: { nom: string; ville: string | null } | null
}

const CLE_STOCKAGE = 'kimatch-partenaire-cle'

/** Le stockage peut lever (navigation privée, cookies bloqués) : la page ne doit pas rester blanche. */
function lireCle(): string {
  try {
    return localStorage.getItem(CLE_STOCKAGE) ?? ''
  } catch {
    return ''
  }
}

function euros(n: number | null): string {
  if (n === null || n === undefined) return '—'
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n)
}

function jour(d: string | null): string {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('fr-FR')
}

export default function EspacePartenaire() {
  const [cle, setCle] = useState<string>(lireCle)
  const [saisie, setSaisie] = useState('')
  const [erreur, setErreur] = useState<string | null>(null)
  const [enCours, setEnCours] = useState(false)
  const [onglet, setOnglet] = useState<'recommandations' | 'patrimoine'>('recommandations')
  const [recherche, setRecherche] = useState('')

  const [recommandations, setRecommandations] = useState<Recommandation[] | null>(null)
  const [comptes, setComptes] = useState<Compte[] | null>(null)
  const [sites, setSites] = useState<Site[] | null>(null)
  const [compteurs, setCompteurs] = useState<Compteur[] | null>(null)
  const [nomCle, setNomCle] = useState<string | null>(null)

  const charger = useCallback(async (laCle: string) => {
    setEnCours(true)
    setErreur(null)
    try {
      const entete = { Authorization: 'Bearer ' + laCle }

      /* ON COMMENCE PAR LA RACINE : c'est elle qui valide la clé et dit à qui elle appartient.
         Deux appels qui échouent en parallèle donneraient deux messages pour une seule cause. */
      const racine = await fetch('/api/partenaire', { headers: entete })
      if (racine.status === 401) {
        throw new Error('Cette clé n’est pas reconnue, ou elle a été révoquée. Demandez-en une nouvelle à votre contact KiWee.')
      }
      if (!racine.ok) throw new Error('Le service est momentanément indisponible. Réessayez dans un instant.')
      const info = await racine.json()
      setNomCle(typeof info?.votre_cle === 'string' ? info.votre_cle : null)

      const [rReco, rPat] = await Promise.all([
        fetch('/api/partenaire/recommandations', { headers: entete }),
        fetch('/api/partenaire/patrimoine', { headers: entete }),
      ])
      if (!rReco.ok || !rPat.ok) throw new Error('Vos données n’ont pas pu être chargées. Réessayez dans un instant.')

      const reco = await rReco.json()
      const pat = await rPat.json()
      setRecommandations(reco.recommandations ?? [])
      setComptes(pat.comptes ?? [])
      setSites(pat.sites ?? [])
      setCompteurs(pat.compteurs ?? [])

      try {
        localStorage.setItem(CLE_STOCKAGE, laCle)
      } catch {
        /* tant pis : la clé vaudra pour cette visite */
      }
      setCle(laCle)
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Quelque chose n’a pas fonctionné.')
      setRecommandations(null)
    } finally {
      setEnCours(false)
    }
  }, [])

  useEffect(() => {
    if (cle) void charger(cle)
    // Au premier rendu seulement : la clé déjà mémorisée charge les données sans rien demander.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function seDeconnecter() {
    try {
      localStorage.removeItem(CLE_STOCKAGE)
    } catch {
      /* rien à faire */
    }
    setCle('')
    setSaisie('')
    setRecommandations(null)
    setComptes(null)
    setNomCle(null)
  }

  /* ── LA RECHERCHE PORTE SUR CE QUI EST AFFICHÉ ──
     Tout tient en mémoire : un partenaire a quelques dizaines de lignes, pas des milliers. Une
     recherche serveur ajouterait un aller-retour pour rien. */
  const recoFiltrees = useMemo(() => {
    if (!recommandations) return []
    const q = recherche.trim().toLowerCase()
    if (!q) return recommandations
    return recommandations.filter((r) =>
      [r.nom, r.reference, r.compte?.nom, r.compte?.ville, r.etape?.libelle]
        .some((v) => v && v.toLowerCase().includes(q)))
  }, [recommandations, recherche])

  const comptesFiltres = useMemo(() => {
    if (!comptes) return []
    const q = recherche.trim().toLowerCase()
    if (!q) return comptes
    return comptes.filter((c) =>
      [c.nom, c.reference, c.ville, c.siren].some((v) => v && v.toLowerCase().includes(q)))
  }, [comptes, recherche])

  // ══════════════════════════════════════════════════════════════════════════════════════════════
  // L'ÉCRAN DE LA CLÉ
  // ══════════════════════════════════════════════════════════════════════════════════════════════
  if (!cle || (!recommandations && !enCours)) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-km-bg p-4">
        <div className="w-full max-w-[420px] rounded-km border border-km-line bg-white p-7 shadow-[0_18px_40px_-24px_rgba(6,10,8,.4)]">
          <div className="mb-5 flex items-center gap-2.5">
            <img src={kiweePicto} alt="" className="h-8 w-8" />
            <div>
              <div className="text-km-body font-semibold text-km-text">KiWee Énergie</div>
              <div className="text-km-label text-km-faint">Espace partenaire</div>
            </div>
          </div>

          <p className="mb-4 text-km-xs leading-relaxed text-km-muted">
            Saisissez la clé qui vous a été remise par votre contact KiWee. Elle vous donne accès à
            vos affaires et à votre patrimoine, en lecture.
          </p>

          <form
            onSubmit={(e) => {
              e.preventDefault()
              if (saisie.trim()) void charger(saisie.trim())
            }}
            className="flex flex-col gap-2.5"
          >
            <label className="flex flex-col gap-1.5">
              <span className="text-km-label font-semibold uppercase tracking-wide text-km-faint">
                Votre clé
              </span>
              <div className="relative">
                <KeyRound className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-km-faint" />
                <input
                  value={saisie}
                  onChange={(e) => setSaisie(e.target.value)}
                  placeholder="kw_…"
                  autoFocus
                  className="w-full rounded-km border border-km-line bg-white py-2.5 pl-9 pr-3 font-mono text-[13px] text-km-text outline-none focus:border-km-green focus:ring-1 focus:ring-km-green"
                />
              </div>
            </label>

            {erreur && (
              <p className="flex items-start gap-1.5 rounded-km-sm border border-km-red/30 bg-km-red-soft px-2.5 py-2 text-km-xs leading-snug text-km-red">
                <AlertTriangle className="mt-[1px] h-3.5 w-3.5 shrink-0" />
                {erreur}
              </p>
            )}

            <button
              type="submit"
              disabled={!saisie.trim() || enCours}
              className="flex h-[38px] items-center justify-center gap-2 rounded-km bg-km-green text-km-body font-semibold text-white transition-colors hover:bg-km-green/90 disabled:opacity-50"
            >
              {enCours ? <><Loader2 className="h-4 w-4 animate-spin" /> Vérification…</> : 'Entrer'}
            </button>
          </form>

          <p className="mt-4 text-km-label leading-relaxed text-km-faint">
            Vous n’avez pas de clé ? Elle est remise une seule fois, par KiWee. En cas de perte, une
            nouvelle vous sera émise et l’ancienne cessera de fonctionner.
          </p>
        </div>
      </div>
    )
  }

  // ══════════════════════════════════════════════════════════════════════════════════════════════
  // L'ESPACE
  // ══════════════════════════════════════════════════════════════════════════════════════════════
  const sitesParCompte = new Map<string, Site[]>()
  for (const s of sites ?? []) {
    const l = sitesParCompte.get(s.compte_id) ?? []
    l.push(s)
    sitesParCompte.set(s.compte_id, l)
  }
  const compteursParSite = new Map<string, Compteur[]>()
  for (const c of compteurs ?? []) {
    const l = compteursParSite.get(c.site_id) ?? []
    l.push(c)
    compteursParSite.set(c.site_id, l)
  }

  return (
    <div className="min-h-screen bg-km-bg">
      <header className="border-b border-km-line bg-white">
        <div className="mx-auto flex max-w-[1100px] items-center gap-3 px-4 py-3 sm:px-6">
          <img src={kiweePicto} alt="" className="h-7 w-7" />
          <div className="min-w-0 flex-1">
            <div className="text-km-body font-semibold text-km-text">KiWee Énergie</div>
            <div className="text-km-label text-km-faint">
              Espace partenaire{nomCle ? ` · ${nomCle}` : ''}
            </div>
          </div>
          <button
            type="button"
            onClick={seDeconnecter}
            className="shrink-0 rounded-km-sm border border-km-line px-2.5 py-1.5 text-km-label font-semibold text-km-muted transition-colors hover:border-km-red hover:text-km-red"
          >
            Quitter
          </button>
        </div>
      </header>

      <div className="mx-auto max-w-[1100px] px-4 py-5 sm:px-6">
        {/* ── LES DEUX ONGLETS, exactement ceux de l'espace partenaire de Kimatch ── */}
        <div className="mb-4 flex flex-wrap items-center gap-2">
          {([
            ['recommandations', 'Mes recommandations', Sparkle, recommandations?.length ?? 0],
            ['patrimoine', 'Mon patrimoine', Building2, comptes?.length ?? 0],
          ] as const).map(([cle2, libelle, Icone, n]) => (
            <button
              key={cle2}
              type="button"
              onClick={() => setOnglet(cle2)}
              className={cn(
                'flex items-center gap-1.5 rounded-km px-3 py-1.5 text-km-body font-medium transition-colors',
                onglet === cle2 ? 'bg-kiwi-500/15 text-km-green' : 'text-km-muted hover:bg-white',
              )}
            >
              <Icone className="h-4 w-4" />
              {libelle}
              <span className="text-km-label text-km-faint">{n}</span>
            </button>
          ))}

          <span className="flex-1" />

          <div className="relative min-w-[200px] flex-1 sm:max-w-[280px]">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-km-faint" />
            <input
              value={recherche}
              onChange={(e) => setRecherche(e.target.value)}
              placeholder="Rechercher…"
              className="h-[32px] w-full rounded-km border border-km-line bg-white pl-8 pr-2.5 text-km-body text-km-text outline-none focus:border-km-green"
            />
          </div>
        </div>

        {enCours && (
          <div className="flex items-center gap-2 py-8 text-km-muted">
            <Loader2 className="h-4 w-4 animate-spin" /> Chargement…
          </div>
        )}

        {/* ── MES RECOMMANDATIONS ── */}
        {!enCours && onglet === 'recommandations' && (
          recoFiltrees.length === 0 ? (
            <p className="rounded-km border border-km-line bg-white px-4 py-6 text-center text-km-xs text-km-faint">
              {recherche ? 'Aucune affaire ne correspond à cette recherche.' : 'Aucune affaire en cours pour le moment.'}
            </p>
          ) : (
            <div className="overflow-hidden rounded-km border border-km-line bg-white">
              <table className="w-full text-km-xs">
                <thead>
                  <tr className="border-b border-km-line bg-km-bg/40 text-km-label uppercase tracking-wide text-km-faint">
                    <th className="px-3 py-2 text-left font-semibold">Affaire</th>
                    <th className="px-3 py-2 text-left font-semibold">Compte</th>
                    <th className="px-3 py-2 text-left font-semibold">Étape</th>
                    <th className="px-3 py-2 text-left font-semibold">Ouverte le</th>
                    <th className="px-3 py-2 text-right font-semibold">Montant</th>
                    <th className="px-3 py-2 text-right font-semibold">Votre marge</th>
                  </tr>
                </thead>
                <tbody>
                  {recoFiltrees.map((r) => (
                    <tr key={r.id} className="border-b border-km-line-soft last:border-0">
                      <td className="px-3 py-2">
                        <div className="font-semibold text-km-text">{r.nom}</div>
                        {r.reference && <div className="text-km-label text-km-faint">{r.reference}</div>}
                      </td>
                      <td className="px-3 py-2 text-km-muted">
                        {r.compte?.nom ?? '—'}
                        {r.compte?.ville && <span className="text-km-faint"> · {r.compte.ville}</span>}
                      </td>
                      <td className="px-3 py-2">
                        <span className="rounded-km-sm bg-km-soft px-2 py-0.5 text-km-label font-semibold text-km-muted">
                          {r.etape?.libelle ?? '—'}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-km-muted">{jour(r.date_ouverture)}</td>
                      <td className="px-3 py-2 text-right text-km-muted">{euros(r.montant)}</td>
                      <td className="px-3 py-2 text-right font-semibold text-km-green">{euros(r.marge_apporteur)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        )}

        {/* ── MON PATRIMOINE ── */}
        {!enCours && onglet === 'patrimoine' && (
          comptesFiltres.length === 0 ? (
            <p className="rounded-km border border-km-line bg-white px-4 py-6 text-center text-km-xs text-km-faint">
              {recherche ? 'Aucun compte ne correspond à cette recherche.' : 'Aucun compte pour le moment.'}
            </p>
          ) : (
            <div className="flex flex-col gap-3">
              {comptesFiltres.map((c) => {
                const sesSites = sitesParCompte.get(c.id) ?? []
                return (
                  <div key={c.id} className="overflow-hidden rounded-km border border-km-line bg-white">
                    <div className="flex flex-wrap items-center gap-2 border-b border-km-line-soft px-4 py-3">
                      <Building2 className="h-4 w-4 shrink-0 text-km-muted" />
                      <span className="font-semibold text-km-text">{c.nom}</span>
                      {c.ville && <span className="text-km-xs text-km-faint">{c.code_postal} {c.ville}</span>}
                      {c.segment && (
                        <span className="rounded-km-sm bg-km-soft px-2 py-0.5 text-km-label font-semibold text-km-muted">
                          {c.segment}
                        </span>
                      )}
                      <span className="flex-1" />
                      <span className="text-km-label text-km-faint">
                        {sesSites.length} site{sesSites.length > 1 ? 's' : ''}
                      </span>
                    </div>

                    {sesSites.length === 0 ? (
                      <p className="px-4 py-3 text-km-xs text-km-faint">Aucun site rattaché.</p>
                    ) : (
                      <div className="flex flex-col">
                        {sesSites.map((s) => {
                          const sesCompteurs = compteursParSite.get(s.id) ?? []
                          return (
                            <div key={s.id} className="border-b border-km-line-soft px-4 py-2.5 last:border-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <MapPin className="h-3.5 w-3.5 shrink-0 text-km-faint" />
                                <span className="text-km-xs font-semibold text-km-text">{s.nom}</span>
                                {s.ville && <span className="text-km-label text-km-faint">{s.code_postal} {s.ville}</span>}
                              </div>
                              {sesCompteurs.length > 0 && (
                                <div className="mt-1.5 flex flex-wrap gap-1.5 pl-5">
                                  {sesCompteurs.map((m) => (
                                    <span
                                      key={m.id}
                                      title={m.date_echeance ? `Échéance : ${jour(m.date_echeance)}` : undefined}
                                      className="inline-flex items-center gap-1 rounded-km-sm border border-km-line bg-km-bg/40 px-2 py-0.5 font-mono text-km-label text-km-muted"
                                    >
                                      <Gauge className="h-3 w-3 text-km-faint" />
                                      {m.numero_point}
                                      {m.consommation_annuelle_mwh !== null && (
                                        <span className="font-sans text-km-faint">
                                          · {m.consommation_annuelle_mwh} MWh
                                        </span>
                                      )}
                                    </span>
                                  ))}
                                </div>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )
        )}

        <p className="mt-6 text-center text-km-label leading-relaxed text-km-faint">
          Ces informations sont en lecture seule. Pour toute modification, contactez votre
          interlocuteur KiWee.
        </p>
      </div>
    </div>
  )
}
