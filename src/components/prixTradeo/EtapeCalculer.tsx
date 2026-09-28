import { useEffect, useMemo, useState } from 'react'
import { Calculator, FlaskConical, Loader2, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input, Label, Select, Textarea } from '@/components/ui/form'
import { Tableau, TableauTete, TableauCorps } from '@/components/ui/tableau'
import { appelerBanc, useFournisseursKimatch, type FournisseurKimatch, type ReponseBanc } from '@/lib/data/tradeo'
import { comparerMarges, lireOffresTradeo, rapprocherFournisseur, type EcartMarge, type OffreTradeo } from '@/lib/tradeo/prixUnitaires'
import { Aide, ReponseBrute, Verdict } from './commun'

/**
 * ÉTAPE 3 — CALCULER, ET EN SORTIR LES PRIX UNITAIRES.
 *
 * C'est le bouton « Calculer » que Michel a décrit le 28/09/2026 : on peut le relancer autant de
 * fois qu'on veut. Le banc le rejoue sur des compteurs acceptés et montre, à côté du budget que
 * Tradeo calcule, les PRIX qu'il a utilisés — ce que Kimatch doit stocker.
 *
 * LE CORPS DU CALCUL EST ÉDITABLE, en JSON. Il est prérempli par la consommation que Tradeo
 * connaît (`consommation-multiple`), mais c'est un banc d'essai : changer une date, un fournisseur
 * actuel ou une option tarifaire pour voir comment Tradeo réagit est précisément ce qu'on vient y
 * faire.
 */

interface CompteurAccepte { id: number; numCompteur: string; type?: string; parametreCompteur?: string }

const MAX_COMPTEURS = 10

function libellePrix(cle: string): string {
  if (cle === 'abo') return 'Abo'
  if (cle === 'cee') return 'CEE'
  if (cle === 'prixMolecule') return 'Molécule'
  return cle.replace(/^prix/, '').replace(/^Coef/, 'Coef ').replace(/^Capa/, 'Capa ')
}

function format(n: number | null | undefined, decimales = 2): string {
  return n === null || n === undefined ? '—' : n.toLocaleString('fr-FR', { maximumFractionDigits: decimales })
}

function appliquerMarge(payload: Record<string, Record<string, unknown>>, marge: number) {
  const copie: Record<string, Record<string, unknown>> = {}
  for (const [num, c] of Object.entries(payload)) copie[num] = { ...c, marge }
  return copie
}

export function EtapeCalculer({ siretInitial, energieInitiale }: { siretInitial: string; energieInitiale: 'ELEC' | 'GAZ' }) {
  const [siret, setSiret] = useState(siretInitial)
  const [energie, setEnergie] = useState<'ELEC' | 'GAZ'>(energieInitiale)
  useEffect(() => { setSiret(siretInitial); setEnergie(energieInitiale) }, [siretInitial, energieInitiale])

  const [liste, setListe] = useState<ReponseBanc | null>(null)
  const [choisis, setChoisis] = useState<Set<number>>(new Set())
  const [conso, setConso] = useState<ReponseBanc | null>(null)
  const [payload, setPayload] = useState('')
  const [marge, setMarge] = useState(5)
  const [margeB, setMargeB] = useState(10)
  const [calcul, setCalcul] = useState<ReponseBanc | null>(null)
  const [ecarts, setEcarts] = useState<EcartMarge[] | null>(null)
  const [enCours, setEnCours] = useState<string | null>(null)
  const [erreurJson, setErreurJson] = useState<string | null>(null)
  const { data: fournisseurs } = useFournisseursKimatch(true)

  const compteurs = ((liste?.reponse as { listCompteur?: CompteurAccepte[] } | undefined)?.listCompteur ?? [])

  async function lister() {
    setEnCours('liste')
    setConso(null); setCalcul(null); setEcarts(null); setPayload('')
    const r = await appelerBanc('compteurs_par_siret', { siret, energie })
    setListe(r)
    const l = (r.reponse as { listCompteur?: CompteurAccepte[] } | undefined)?.listCompteur ?? []
    setChoisis(new Set(l.slice(0, MAX_COMPTEURS).map((c) => c.id)))
    setEnCours(null)
  }

  async function lireConso() {
    setEnCours('conso')
    setCalcul(null); setEcarts(null)
    const compteurData = compteurs.filter((c) => choisis.has(c.id))
    const r = await appelerBanc('consommation', { compteurData })
    setConso(r)
    const parNum = (r.reponse as { compteur?: Record<string, { id: number; objetConsommation?: unknown; autreFournisseur?: unknown }> } | undefined)?.compteur
    if (r.ok && parNum) {
      const p: Record<string, unknown> = {}
      for (const [num, c] of Object.entries(parNum)) {
        p[num] = { id: c.id, marge, objetConsommation: c.objetConsommation, autreFournisseur: c.autreFournisseur ?? [] }
      }
      setPayload(JSON.stringify(p, null, 2))
    }
    setEnCours(null)
  }

  function lirePayload(): Record<string, Record<string, unknown>> | null {
    try {
      const p = JSON.parse(payload) as Record<string, Record<string, unknown>>
      setErreurJson(null)
      return p
    } catch (err) {
      setErreurJson(`JSON invalide : ${err instanceof Error ? err.message : String(err)}`)
      return null
    }
  }

  async function calculer() {
    const p = lirePayload()
    if (!p) return
    setEnCours('calcul')
    setEcarts(null)
    setCalcul(await appelerBanc('calculer', { compteur: appliquerMarge(p, marge) }))
    setEnCours(null)
  }

  async function mesurerMarge() {
    const p = lirePayload()
    if (!p) return
    setEnCours('marge')
    const [a, b] = await Promise.all([
      appelerBanc('calculer', { compteur: appliquerMarge(p, marge) }),
      appelerBanc('calculer', { compteur: appliquerMarge(p, margeB) }),
    ])
    setCalcul(a)
    setEcarts(a.ok && b.ok ? comparerMarges(lireOffresTradeo(a.reponse).offres, lireOffresTradeo(b.reponse).offres, marge, margeB) : [])
    setEnCours(null)
  }

  const lecture = useMemo(() => (calcul?.reponse ? lireOffresTradeo(calcul.reponse) : null), [calcul])
  const margeValide = marge >= 2 && marge <= 30

  const datesPassees = useMemo(() => {
    if (!payload) return []
    try {
      const auj = new Date().toISOString().slice(0, 10)
      return Object.entries(JSON.parse(payload) as Record<string, { objetConsommation?: { dateDebut?: string } }>)
        .filter(([, c]) => c.objetConsommation?.dateDebut && c.objetConsommation.dateDebut < auj)
        .map(([num]) => num)
    } catch {
      return []
    }
  }, [payload])

  return (
    <div className="space-y-5">
      <Aide>
        Trois temps : lister les compteurs que Tradeo a acceptés pour ce SIRET, relire la consommation qu’il connaît,
        puis calculer. Au plus {MAX_COMPTEURS} compteurs, et une seule énergie par calcul.
      </Aide>

      <section className="flex flex-wrap items-end gap-3">
        <div>
          <Label htmlFor="calc-siret">SIRET</Label>
          <Input id="calc-siret" className="w-[200px] font-mono" value={siret} onChange={(e) => setSiret(e.target.value.replace(/\s/g, ''))} />
        </div>
        <div>
          <Label htmlFor="calc-energie">Énergie</Label>
          <Select id="calc-energie" className="w-[130px]" value={energie} onChange={(e) => setEnergie(e.target.value as 'ELEC' | 'GAZ')}>
            <option value="ELEC">Électricité</option>
            <option value="GAZ">Gaz</option>
          </Select>
        </div>
        <Button onClick={() => void lister()} disabled={enCours !== null || !/^\d{14}$/.test(siret)}>
          {enCours === 'liste' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />} Compteurs acceptés
        </Button>
      </section>

      {liste && !liste.ok && <Verdict reponse={liste} succes="" />}
      {liste?.ok && compteurs.length === 0 && (
        <p className="text-km-muted">Aucun compteur accepté pour ce SIRET. Tant que l’équipe Tradeo n’a pas accepté la demande, rien ne se calcule.</p>
      )}

      {compteurs.length > 0 && (
        <section>
          <div className="flex flex-wrap gap-2">
            {compteurs.map((c) => (
              <label key={c.id} className="flex items-center gap-2 rounded-km border border-km-line px-2.5 py-1.5 text-km-body">
                <input
                  type="checkbox"
                  checked={choisis.has(c.id)}
                  disabled={!choisis.has(c.id) && choisis.size >= MAX_COMPTEURS}
                  onChange={(e) => setChoisis((s) => { const n = new Set(s); if (e.target.checked) n.add(c.id); else n.delete(c.id); return n })}
                />
                <span className="font-mono">{c.numCompteur}</span>
                {c.parametreCompteur && <Badge>{c.parametreCompteur}</Badge>}
              </label>
            ))}
          </div>
          <Button className="mt-3" onClick={() => void lireConso()} disabled={enCours !== null || choisis.size === 0}>
            {enCours === 'conso' && <Loader2 className="h-4 w-4 animate-spin" />} Lire la consommation chez Tradeo
          </Button>
          {conso && !conso.ok && <Verdict reponse={conso} succes="" />}
          <ReponseBrute reponse={conso} titre="Consommation rendue par Tradeo" />
        </section>
      )}

      {payload && (
        <section>
          <Label htmlFor="calc-payload">Corps envoyé à « calculer-budget-energie » (modifiable)</Label>
          <Textarea id="calc-payload" rows={16} className="font-mono text-[11.5px]" value={payload} onChange={(e) => setPayload(e.target.value)} spellCheck={false} />
          {erreurJson && <p className="mt-1 text-km-red">{erreurJson}</p>}
          {datesPassees.length > 0 && (
            <p className="mt-1 text-km-amber">
              Date de début passée pour {datesPassees.join(', ')} : Tradeo exige une date ≥ aujourd’hui. Corrigez « dateDebut » ci-dessus.
            </p>
          )}

          <div className="mt-3 flex flex-wrap items-end gap-3">
            <div>
              <Label htmlFor="calc-marge">Marge (2 à 30)</Label>
              <Input id="calc-marge" type="number" min={2} max={30} step={0.5} className="w-[110px]" value={marge} onChange={(e) => setMarge(Number(e.target.value))} />
            </div>
            <Button variant="primary" onClick={() => void calculer()} disabled={enCours !== null || !margeValide}>
              {enCours === 'calcul' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Calculator className="h-4 w-4" />} Calculer
            </Button>
            <span className="mx-1 h-6 w-px bg-km-line" aria-hidden="true" />
            <div>
              <Label htmlFor="calc-marge-b">Seconde marge</Label>
              <Input id="calc-marge-b" type="number" min={2} max={30} step={0.5} className="w-[110px]" value={margeB} onChange={(e) => setMargeB(Number(e.target.value))} />
            </div>
            <Button onClick={() => void mesurerMarge()} disabled={enCours !== null || !margeValide || margeB === marge || margeB < 2 || margeB > 30}>
              {enCours === 'marge' ? <Loader2 className="h-4 w-4 animate-spin" /> : <FlaskConical className="h-4 w-4" />} Mesurer l’effet de la marge
            </Button>
          </div>
          <p className="mt-1.5 max-w-[760px] text-km-label text-km-muted">
            La documentation ne dit ni l’unité de la marge ni si elle est déjà dans le prix rendu. « Mesurer » lance deux
            calculs identiques à deux marges : si chaque prix bouge exactement de l’écart de marge, elle y est incluse en
            €/MWh, et le P0 que Kimatch stocke s’obtient en la retirant.
          </p>
        </section>
      )}

      {calcul && !calcul.ok && <Verdict reponse={calcul} succes="" />}
      {lecture && lecture.erreurs.length > 0 && (
        <div className="rounded-km bg-km-red-soft px-3 py-2 text-km-red">
          {lecture.erreurs.map((e) => <p key={e.numCompteur}><span className="font-mono">{e.numCompteur}</span> : {e.message}</p>)}
        </div>
      )}
      {lecture && lecture.offres.length > 0 && <TableauOffres offres={lecture.offres} fournisseurs={fournisseurs ?? []} />}
      {ecarts && <TableauEcarts ecarts={ecarts} margeA={marge} margeB={margeB} />}
      <ReponseBrute reponse={calcul} />
    </div>
  )
}

function TableauOffres({ offres, fournisseurs }: { offres: OffreTradeo[]; fournisseurs: FournisseurKimatch[] }) {
  const budgetSeul = offres.filter((o) => o.sansPrixUnitaire).length
  const avecPrix = offres.filter((o) => o.succes && !o.sansPrixUnitaire).length
  const refusees = offres.filter((o) => !o.succes).length
  return (
    <section>
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <h4 className="text-km-name font-semibold text-km-text">Offres rendues</h4>
        <Badge tone="green">{avecPrix} avec prix unitaires</Badge>
        {budgetSeul > 0 && <Badge tone="amber">{budgetSeul} budget seul</Badge>}
        {refusees > 0 && <Badge tone="red">{refusees} refusée(s)</Badge>}
      </div>
      {budgetSeul > 0 && (
        <p className="mb-2 max-w-[760px] text-km-body text-km-amber">
          « Budget seul » : Tradeo n’a rendu aucun prix pour ce fournisseur. Ce budget repose sur la consommation retenue par
          Tradeo : il ne peut pas être comparé aux autres, ni recalculé dans Kimatch.
        </p>
      )}
      <Tableau minWidth={980}>
        <TableauTete>
          <tr><th>Compteur</th><th>Fournisseur</th><th>Offre</th><th>Période</th><th>Prix unitaires (unités Tradeo)</th><th>Marge appliquée</th><th>Budget HT Tradeo</th></tr>
        </TableauTete>
        <TableauCorps>
          {offres.map((o, i) => {
            const kimatch = rapprocherFournisseur(o.fournisseur, fournisseurs)
            const lignes = o.periodes.length > 0 ? o.periodes : [null]
            return lignes.map((p, j) => (
              <tr key={`${i}-${j}`} className={!o.succes ? 'opacity-60' : undefined}>
                {j === 0 && (
                  <>
                    <td rowSpan={lignes.length} className="font-mono text-km-label">{o.numCompteur}</td>
                    <td rowSpan={lignes.length}>
                      <p className="font-semibold">{o.fournisseur}</p>
                      <p className="text-km-label text-km-muted">
                        {kimatch ? <>Kimatch : {kimatch.nom}{kimatch.mode_reponse ? ` · ${kimatch.mode_reponse}` : ''}</> : <span className="text-km-amber">non rapproché dans Kimatch</span>}
                      </p>
                    </td>
                    <td rowSpan={lignes.length}>
                      <div className="flex flex-wrap items-center gap-1">
                        {o.typeOffre && <span>{o.typeOffre}</span>}
                        {o.actuel && <Badge tone="blue">actuel</Badge>}
                        {!o.succes && <Badge tone="red">refusée</Badge>}
                        {o.sansPrixUnitaire && <Badge tone="amber">budget seul</Badge>}
                      </div>
                      {o.message && <p className="mt-1 text-km-label text-km-red">{o.message}</p>}
                    </td>
                  </>
                )}
                <td className="whitespace-nowrap text-km-label">{p ? `${p.debut ?? '?'} → ${p.fin ?? '?'}` : (o.debut ? `${o.debut} → ${o.fin ?? '?'}` : '—')}</td>
                <td>
                  {p && Object.keys(p.prix).length > 0 ? (
                    <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-km-label">
                      {Object.entries(p.prix).map(([cle, v]) => (
                        <span key={cle}><span className="text-km-muted">{libellePrix(cle)}</span> <span className="font-semibold tabular-nums">{format(v, 3)}</span></span>
                      ))}
                    </div>
                  ) : <span className="text-km-muted">—</span>}
                </td>
                <td className="tabular-nums">
                  {p?.margeAppliquee !== null && p?.margeAppliquee !== undefined ? format(p.margeAppliquee) : format(o.marge)}
                  {p?.preMarge ? <span className="text-km-label text-km-muted"> (pré-marge {format(p.preMarge)})</span> : null}
                </td>
                {j === 0 && <td rowSpan={lignes.length} className="tabular-nums text-km-muted">{format(o.budgetHt, 0)} €</td>}
              </tr>
            ))
          })}
        </TableauCorps>
      </Tableau>
    </section>
  )
}

function TableauEcarts({ ecarts, margeA, margeB }: { ecarts: EcartMarge[]; margeA: number; margeB: number }) {
  if (ecarts.length === 0) {
    return <p className="text-km-amber">Aucun prix comparable entre les deux calculs : l’un a échoué, ou aucun fournisseur n’a rendu de prix unitaire.</p>
  }
  const inclus = ecarts.filter((e) => Math.abs(e.residu) < 0.01).length
  const immobiles = ecarts.filter((e) => Math.abs(e.ecartPrix) < 0.01).length
  return (
    <section>
      <h4 className="mb-1 text-km-name font-semibold text-km-text">Effet de la marge : {margeA} → {margeB}</h4>
      <p className="mb-2 text-km-body text-km-text">
        {inclus === ecarts.length
          ? <>Tous les prix bougent exactement de {margeB - margeA} : la marge est <strong>incluse</strong> dans le prix rendu. P0 = prix − marge appliquée.</>
          : immobiles === ecarts.length
            ? <>Aucun prix ne bouge : la marge n’est <strong>pas</strong> dans le prix rendu, elle ne joue que sur le budget.</>
            : <>{inclus} prix sur {ecarts.length} bougent de l’écart de marge, {immobiles} ne bougent pas. Les fournisseurs ne sont pas traités pareil : voir le détail.</>}
      </p>
      <Tableau minWidth={720}>
        <TableauTete>
          <tr><th>Fournisseur</th><th>Période</th><th>Prix</th><th>Marge {margeA}</th><th>Marge {margeB}</th><th>Écart</th><th>Résidu</th></tr>
        </TableauTete>
        <TableauCorps>
          {ecarts.map((e, i) => (
            <tr key={i}>
              <td>{e.fournisseur}</td>
              <td className="text-km-label">{e.periode}</td>
              <td>{libellePrix(e.champ)}</td>
              <td className="tabular-nums">{format(e.prixA, 3)}</td>
              <td className="tabular-nums">{format(e.prixB, 3)}</td>
              <td className="tabular-nums">{format(e.ecartPrix, 3)}</td>
              <td className={Math.abs(e.residu) < 0.01 ? 'tabular-nums text-km-green' : 'tabular-nums text-km-amber'}>{format(e.residu, 3)}</td>
            </tr>
          ))}
        </TableauCorps>
      </Tableau>
    </section>
  )
}
