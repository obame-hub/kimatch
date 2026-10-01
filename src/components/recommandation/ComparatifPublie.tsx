import { useMemo, useState } from 'react'
import { cn } from '@/lib/utils'
import { auCentime, postesDuCompteur, type BudgetOffre } from '@/lib/pricing/budget'
import {
  budgetLigne, saisieComplete, useChiffrage, useChiffrageMutations,
  type Chiffrage, type CompteurChiffrage, type OffreChiffrage,
} from '@/lib/data/chiffrage'

/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * LE COMPARATIF PUBLIÉ — ce que voit le commercial, sous la version
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * William, 01/10/2026 : « quand le pricing publie l'offre, je veux que le commercial, dans l'encart de
 * la version, puisse voir 3 tableaux (onglets) : le tableau comparatif, le tableau des prix unitaires
 * et le tableau des clauses contractuelles. Ça s'affiche en lieu et place des commandes
 * fournisseurs. » Maquette validée le même jour (canevas « Moteur pricing Kimatch »).
 *
 *   · Les offres INDEXÉES n'y figurent pas, « même pas hors classement » (William, 01/10/2026).
 *   · La MARGE se retouche offre par offre, par pas de 0,10 €/MWh : « c'est eux qui jugeront si les
 *     prix sont assez compétitifs ou si un effort sur la marge est nécessaire ». La marge du pricing
 *     reste en base (`marge_retenue_eur_mwh`) : l'écart dit l'effort, et un clic le défait.
 *   · En multisite, une offre se lit sur le TOTAL de ses compteurs.
 */

/* Deux décimales, toujours : « tous les prix et budgets auront 2 décimales maximum ». */
const eur = (v: number | null | undefined) => (v == null ? '—' : `${v.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`)
const fr2 = (v: number | null | undefined) => (v == null ? '—' : v.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }))
const estIndexe = (type: string | null) => /^index/i.test(type ?? '')

type Onglet = 'comparatif' | 'prix' | 'clauses'

interface Totaux { abonnement: number; energie: number; total: number }

function totaux(compteurs: CompteurChiffrage[], o: OffreChiffrage, marge?: number | null): Totaux | null {
  const t: Totaux = { abonnement: 0, energie: 0, total: 0 }
  for (const c of compteurs) {
    const s = o.saisies[c.vcId]
    if (!s) return null
    const b: BudgetOffre | null = budgetLigne(c, marge == null ? s : { ...s, marge })
    /* Seul un budget complet se présente au client. */
    if (!b?.complet) return null
    t.abonnement += b.abonnement
    t.energie += b.energie
    t.total += b.total
  }
  return { abonnement: auCentime(t.abonnement), energie: auCentime(t.energie), total: auCentime(t.total) }
}

const volumeCompteur = (c: CompteurChiffrage) => (c.energie === 'gaz' ? (c.car ?? 0) : Object.values(c.conso).reduce((t, x) => t + x, 0))

export function ComparatifPublie({ versionId }: { versionId: string }) {
  const { data: chiffrage, isLoading } = useChiffrage(versionId)
  const [onglet, setOnglet] = useState<Onglet>('comparatif')
  if (isLoading || !chiffrage) return <p className="px-[17px] py-4 text-km-body text-km-faint">Chargement du comparatif…</p>
  return (
    <div className="flex flex-col">
      <div className="flex flex-wrap items-center gap-3 border-b border-km-line-soft px-[17px] py-2.5">
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="text-[13px] font-extrabold leading-[19px]">Comparatif publié par le pricing</span>
          <span className="text-[11px] leading-[15px] text-km-faint">
            Le {chiffrage.version.publieeLe ? new Date(chiffrage.version.publieeLe).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' }) : '—'}
            {' · '}{chiffrage.compteurs.length} compteur{chiffrage.compteurs.length > 1 ? 's' : ''}
          </span>
        </span>
      </div>
      <div role="tablist" className="flex gap-0.5 border-b border-km-line px-[17px]">
        {([['comparatif', 'Comparatif'], ['prix', 'Prix unitaires'], ['clauses', 'Clauses contractuelles']] as const).map(([id, nom]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={onglet === id}
            onClick={() => setOnglet(id)}
            className={cn('-mb-px border-b-[2.5px] px-3.5 py-2.5 text-[14px] font-semibold leading-5', onglet === id ? 'border-km-green text-km-text' : 'border-transparent text-km-muted hover:text-km-text')}
          >
            {nom}
          </button>
        ))}
      </div>
      <div className="overflow-x-auto px-[17px] pb-3.5 pt-1">
        {onglet === 'comparatif' && <TableauComparatif chiffrage={chiffrage} versionId={versionId} />}
        {onglet === 'prix' && <TableauPrix chiffrage={chiffrage} />}
        {onglet === 'clauses' && <TableauClauses chiffrage={chiffrage} />}
      </div>
    </div>
  )
}

/** Les offres présentables : disponibles, chiffrées partout, hors indexées. */
function offresPresentees(c: Chiffrage) {
  return c.offres.filter((o) => o.statut === 'DISPONIBLE' && !estIndexe(o.type) && c.compteurs.every((k) => saisieComplete(k, o.saisies[k.vcId])))
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════

function TableauComparatif({ chiffrage, versionId }: { chiffrage: Chiffrage; versionId: string }) {
  const m = useChiffrageMutations(versionId)
  /* La marge affichée réagit au clic avant que la base ne réponde : le recalcul est immédiat. */
  const [locales, setLocales] = useState<Record<string, number>>({})
  const margeDe = (o: OffreChiffrage) => locales[o.id] ?? o.saisies[chiffrage.compteurs[0]?.vcId]?.marge ?? 0
  const margePricingDe = (o: OffreChiffrage) => o.saisies[chiffrage.compteurs[0]?.vcId]?.margePricing ?? o.saisies[chiffrage.compteurs[0]?.vcId]?.marge ?? 0

  const lignes = useMemo(() => offresPresentees(chiffrage)
    .map((o) => ({ o, t: totaux(chiffrage.compteurs, o, margeDe(o)) }))
    .filter((x): x is { o: OffreChiffrage; t: Totaux } => !!x.t)
    .sort((a, b) => a.t.total - b.t.total),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [chiffrage, locales])
  const actuelle = chiffrage.actuelle ? totaux(chiffrage.compteurs, chiffrage.actuelle) : null
  const volume = chiffrage.compteurs.reduce((t, c) => t + volumeCompteur(c), 0)

  const appliquer = (o: OffreChiffrage, marge: number) => {
    const arrondie = Math.max(0, Math.round(marge * 100) / 100)
    setLocales((x) => ({ ...x, [o.id]: arrondie }))
    for (const c of chiffrage.compteurs) {
      const s = o.saisies[c.vcId]
      if (s) void m.enregistrerLigne.mutateAsync({ offre: o, compteur: c, saisie: { ...s, marge: arrondie }, effortCommercial: true })
    }
  }
  const aDesEfforts = lignes.some(({ o }) => Math.abs(margeDe(o) - margePricingDe(o)) > 0.001)
  /* Tient dans l'encart de la version sur un 13 pouces (≈ 760 px) : la marge sur la durée passe
     sous le réglage de marge plutôt que dans une colonne à elle. */
  const grille = '24px minmax(110px,1fr) 74px 86px 100px 104px 104px 104px'

  return (
    <div className="min-w-max">
      <div className="flex items-center gap-3 py-2">
        {lignes[0] && actuelle && (
          <span className="text-[13px]">
            Meilleure offre : <b>{lignes[0].o.fournisseurNom}</b> · {lignes[0].o.duree} mois ·{' '}
            <b className={lignes[0].t.total < actuelle.total ? 'text-km-green' : 'text-km-red'}>
              {lignes[0].t.total < actuelle.total ? '−' : '+'} {eur(Math.abs(lignes[0].t.total - actuelle.total))} / an
            </b>
            {actuelle.total > 0 && <span className="text-km-muted"> ({((Math.abs(lignes[0].t.total - actuelle.total) / actuelle.total) * 100).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} %)</span>}
          </span>
        )}
        <span className="flex-1" />
        {aDesEfforts && (
          <button type="button" onClick={() => lignes.forEach(({ o }) => appliquer(o, margePricingDe(o)))} className="h-7 rounded-km border border-km-line bg-white px-2.5 text-[11px] font-medium text-km-muted hover:bg-km-soft">
            Revenir aux marges du pricing
          </button>
        )}
      </div>
      <div className="grid items-end border-b border-km-line pb-2 text-[9px] font-extrabold uppercase leading-[13px] tracking-[.07em] text-km-faint" style={{ gridTemplateColumns: grille }}>
        <span>#</span><span>Fournisseur</span><span>Prix · durée</span><span className="text-right">Abonnt.</span><span className="text-right">Énergie</span><span className="text-right" title="Hors acheminement et taxes, pour le moment">Total HTVA</span><span className="text-center text-km-green">Marge €/MWh</span><span className="text-right">Écart / an</span>
      </div>
      {actuelle && chiffrage.actuelle && (
        <div className="mt-2 grid items-center rounded-km-md border border-km-line bg-km-soft px-2.5 py-2 text-[13px]" style={{ gridTemplateColumns: grille }}>
          <span className="text-km-faint">—</span>
          <span className="flex flex-col"><b>{chiffrage.actuelle.fournisseurNom}</b><span className="text-[9px] font-extrabold tracking-[.06em] text-km-muted">OFFRE ACTUELLE</span></span>
          <span className="text-[11px] text-km-muted">{chiffrage.actuelle.type ?? 'Fixe'}{chiffrage.actuelle.duree ? ` · ${chiffrage.actuelle.duree} mois` : ''}</span>
          <span className="text-right font-mono text-[12px]">{eur(actuelle.abonnement)}</span>
          <span className="text-right font-mono text-[12px]">{eur(actuelle.energie)}</span>
          <span className="text-right font-mono font-extrabold">{eur(actuelle.total)}</span>
          <span />
          <span className="text-right text-[11px] text-km-muted">Référence</span>
        </div>
      )}
      {lignes.length === 0 && <p className="py-4 text-km-body text-km-faint">Aucune offre disponible dans ce comparatif.</p>}
      {lignes.map(({ o, t }, i) => {
        const marge = margeDe(o)
        const effort = Math.round((marge - margePricingDe(o)) * 100) / 100
        const ecart = actuelle ? t.total - actuelle.total : null
        return (
          <div key={o.id} className={cn('mt-1.5 grid items-center rounded-km-md border px-2.5 py-2 text-[13px]', i === 0 ? 'border-[#9fd0b9] bg-km-green-tint' : 'border-km-line-soft bg-white')} style={{ gridTemplateColumns: grille }}>
            <span><span className={cn('inline-flex h-[22px] w-[22px] items-center justify-center rounded-full text-[10px] font-extrabold', i === 0 ? 'bg-km-green text-white' : 'bg-km-soft text-km-muted')}>{i + 1}</span></span>
            <span className="flex min-w-0 flex-col">
              <span className="flex items-center gap-2"><b className="truncate">{o.fournisseurNom}</b>{i === 0 && <span className="shrink-0 rounded-full bg-km-green px-1.5 py-px text-[9px] font-extrabold tracking-[.06em] text-white">MEILLEUR PRIX</span>}</span>
              {effort !== 0 && <span className="text-[11px] font-semibold text-km-amber">{effort < 0 ? 'Effort' : 'Hausse'} de {fr2(Math.abs(effort))} €/MWh sur la marge du pricing</span>}
            </span>
            <span className="text-[11px] text-km-muted">{o.type} · {o.duree} mois</span>
            <span className="text-right font-mono text-[12px]">{eur(t.abonnement)}</span>
            <span className="text-right font-mono text-[12px]">{eur(t.energie)}</span>
            <span className="text-right font-mono font-extrabold">{eur(t.total)}</span>
            <span className="flex flex-col items-center gap-0.5">
            <span className="flex items-center justify-center gap-1">
              <button type="button" onClick={() => appliquer(o, marge - 0.1)} aria-label={`Baisser la marge de ${o.fournisseurNom}`} className="h-6 w-6 rounded-km-sm border border-km-line bg-white text-[14px] text-km-muted hover:border-km-green hover:text-km-green">−</button>
              <span className={cn('w-11 text-center font-mono text-[12.5px] font-bold', effort !== 0 ? 'text-km-amber' : 'text-km-text')}>{fr2(marge)}</span>
              <button type="button" onClick={() => appliquer(o, marge + 0.1)} aria-label={`Monter la marge de ${o.fournisseurNom}`} className="h-6 w-6 rounded-km-sm border border-km-line bg-white text-[14px] text-km-muted hover:border-km-green hover:text-km-green">+</button>
            </span>
            <span className="font-mono text-[10px] text-km-faint" title="Marge KiWee sur la durée du contrat">{eur(marge * volume * ((o.duree ?? 12) / 12))} / {o.duree ?? '?'} mois</span>
            </span>
            <span className="text-right">
              {ecart != null && (
                <span className={cn('rounded-full px-2 py-0.5 font-mono text-[11px] font-bold', ecart < 0 ? 'bg-km-green-soft text-km-green' : 'bg-km-red-soft text-km-red')}>
                  {ecart < 0 ? '−' : '+'} {eur(Math.abs(ecart))}
                </span>
              )}
            </span>
          </div>
        )
      })}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════

function TableauPrix({ chiffrage }: { chiffrage: Chiffrage }) {
  const [vcId, setVcId] = useState(chiffrage.compteurs[0]?.vcId ?? '')
  const c = chiffrage.compteurs.find((x) => x.vcId === vcId) ?? chiffrage.compteurs[0]
  if (!c) return null
  const gaz = c.energie === 'gaz'
  const postes = gaz ? [] : postesDuCompteur(c.conso)
  const offres = [...(chiffrage.actuelle ? [chiffrage.actuelle] : []), ...offresPresentees(chiffrage)]
  const colonnes = gaz ? ['Abonnt. €/mois', 'Molécule', 'CEE', 'Total €/MWh'] : ['Abonnt. €/mois', ...postes, 'Capa.', 'CEE']
  const grille = `minmax(120px,1fr) ${colonnes.map(() => '68px').join(' ')}`
  return (
    <div className="min-w-max">
      {chiffrage.compteurs.length > 1 && (
        <div className="flex gap-1 py-2">
          {chiffrage.compteurs.map((k, i) => (
            <button key={k.vcId} type="button" onClick={() => setVcId(k.vcId)} className={cn('rounded-full border px-2.5 py-0.5 text-[11px] font-semibold', k.vcId === c.vcId ? 'border-km-green-line bg-km-green-soft text-km-green' : 'border-km-line text-km-muted')}>
              Compteur {i + 1} · <span className="font-mono">{k.numero}</span>
            </button>
          ))}
        </div>
      )}
      <div className="grid items-end border-b border-km-line py-2 text-[9px] font-extrabold uppercase leading-[13px] tracking-[.07em] text-km-faint" style={{ gridTemplateColumns: grille }}>
        <span>Offre</span>
        {colonnes.map((x, i) => <span key={x + i} className={cn('text-right', x === 'Total €/MWh' && 'text-km-green')}>{x}</span>)}
      </div>
      {offres.map((o) => {
        const s = o.saisies[c.vcId]
        if (!s) return null
        const presente = (x: number | null | undefined) => (x == null || s.marge == null ? null : x + s.marge)
        const valeurs = gaz
          ? [fr2(s.abonnementMois), fr2(presente(s.p0)), fr2(s.cee), fr2(budgetLigne(c, s)?.totalMwh)]
          : [fr2(s.abonnementMois), ...postes.map((p) => fr2(presente(s.p0Postes[p]))), fr2(s.capacite), fr2(s.cee)]
        const actuelle = o.nature === 'EN_COURS'
        return (
          <div key={o.id} className={cn('grid items-center border-b py-2 font-mono text-[12.5px]', actuelle ? 'border-dashed border-[#C9D0CB] bg-km-soft' : 'border-km-line-soft')} style={{ gridTemplateColumns: grille }}>
            <span className="flex flex-col pl-1 font-sans"><b className="text-[13px]">{o.fournisseurNom}</b><span className="text-[11px] text-km-muted">{actuelle ? 'Offre actuelle' : `${o.type} · ${o.duree} mois`}</span></span>
            {valeurs.map((v, i) => <span key={i} className={cn('text-right', colonnes[i] === 'Total €/MWh' && 'font-extrabold text-km-green')}>{v}</span>)}
          </div>
        )
      })}
      <p className="pt-2.5 text-[11px] text-km-faint">Prix unitaires HTVA présentés au client, marge comprise. Acheminement et taxes réglementées à venir : identiques pour tous.</p>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════

/* LE SCORE DES CLAUSES — la légende de William : il valorise les protections (contrat sécurisé,
   renégociation anticipée, SWAP) et pénalise les contraintes (dépôt de garantie, engagement de
   consommation, tacite reconduction) ; une protection absente le fait baisser. Pondération
   provisoire, à ajuster quand William la fixera. Le contrat sécurisé se déduit du prix fixe. */
const CLAUSES = [
  { cle: 'securise', nom: 'Contrat sécurisé', protection: true, poids: 25 },
  { cle: 'depot', nom: 'Dépôt de garantie', protection: false, poids: -15 },
  { cle: 'engagement', nom: 'Engagement de conso.', protection: false, poids: -15 },
  { cle: 'renegociation', nom: 'Renégociation anticipée', protection: true, poids: 20 },
  { cle: 'swap', nom: 'SWAP', protection: true, poids: 15 },
  { cle: 'tacite', nom: 'Tacite reconduction', protection: false, poids: -10 },
] as const

function TableauClauses({ chiffrage }: { chiffrage: Chiffrage }) {
  const offres = offresPresentees(chiffrage)
  const grille = `minmax(120px,1fr) ${CLAUSES.map(() => '78px').join(' ')} 90px`
  const lettre = (x: number) => (x >= 85 ? 'A' : x >= 70 ? 'B' : x >= 55 ? 'C' : x >= 40 ? 'D' : 'E')
  const couleur: Record<string, string> = { A: 'text-km-green border-km-green', B: 'text-[#5E9E2F] border-[#5E9E2F]', C: 'text-km-amber border-km-amber', D: 'text-[#C9761E] border-[#C9761E]', E: 'text-km-red border-km-red' }
  return (
    <div className="min-w-max">
      <div className="grid items-end border-b border-km-line py-2 text-[9px] font-extrabold uppercase leading-[13px] tracking-[.05em] text-km-faint" style={{ gridTemplateColumns: grille }}>
        <span>Offre</span>{CLAUSES.map((k) => <span key={k.cle} className="text-center">{k.nom}</span>)}<span className="text-center">Score</span>
      </div>
      {offres.map((o) => {
        const presentes: Record<string, boolean> = { ...o.clauses, securise: /^fixe/i.test(o.type ?? '') }
        const score = Math.max(0, Math.min(100, 50 + CLAUSES.reduce((t, k) => t + (presentes[k.cle] ? k.poids : k.protection ? -5 : 0), 0)))
        const l = lettre(score)
        return (
          <div key={o.id} className="grid items-center border-b border-km-line-soft py-2.5" style={{ gridTemplateColumns: grille }}>
            <span className="flex flex-col pl-1"><b className="text-[13px]">{o.fournisseurNom}</b><span className="text-[11px] text-km-muted">{o.type} · {o.duree} mois</span></span>
            {CLAUSES.map((k) => {
              const on = presentes[k.cle]
              return (
                <span key={k.cle} className="text-center">
                  <span
                    title={on ? (k.protection ? 'Clause favorable présente' : 'Clause défavorable présente') : k.protection ? 'Protection absente' : 'Absente'}
                    className={cn(
                      'inline-flex h-[22px] w-[22px] items-center justify-center rounded-full text-[11px] font-extrabold text-white',
                      on ? (k.protection ? 'bg-[#2E6B3F]' : 'bg-[#C2412D]') : k.protection ? 'border-[1.5px] border-dashed border-[#C2412D] bg-white' : 'border-[1.5px] border-[#C9D0CB] bg-white',
                    )}
                  >
                    {on ? '✓' : ''}
                  </span>
                </span>
              )
            })}
            <span className="flex items-center justify-center gap-2">
              <span className={cn('inline-flex h-[34px] w-[34px] items-center justify-center rounded-full border-[3px] font-mono text-[11.5px] font-extrabold text-km-text', couleur[l])}>{score}</span>
              <b className={cn('text-[14px]', couleur[l].split(' ')[0])}>{l}</b>
            </span>
          </div>
        )
      })}
      <p className="pt-2.5 text-[11px] text-km-faint">Vert : clause favorable présente · rouge : clause défavorable présente · pointillé : protection absente. Score de A (très élevé) à E (très faible).</p>
    </div>
  )
}
