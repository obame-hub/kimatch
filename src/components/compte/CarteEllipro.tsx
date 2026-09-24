import { AlertTriangle, Building2, CalendarDays, Coins, Landmark, TrendingDown, TrendingUp, UserRound } from 'lucide-react'
import { palierScoreEllipro, scoreEnNombre } from '@/lib/scoreEllipro'
import { cn } from '@/lib/utils'
import type { EllisphereScore } from '@/lib/data/ellisphere'

/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * LA CARTE ELLIPRO
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * William, 24/09/2026 : « je veux que toutes les infos que tu trouves pertinent à indiquer tiennent
 * dans une grosse card Ellipro avec les couleurs conditionnelles ».
 *
 * ══ TOUT CE QUI EST ICI A ÉTÉ VU DANS UN RAPPORT RÉEL ══
 *
 * Le 24/09, quatre sociétés affichaient toutes 10/10 : le code lisait la LÉGENDE de l'échelle. La
 * structure du rapport a donc été relevée section par section, et chaque champ affiché ci-dessous
 * en vient. Rien n'est deviné — c'est ce qui a manqué la première fois.
 *
 * ══ L'ORDRE DE LECTURE ══
 *
 * La note et sa bande, d'abord : c'est la décision. Puis ce qui la nuance — le secteur, l'encours
 * conseillé, l'analyse. Puis ce qui la fonde : la société, ses dirigeants, ses événements légaux.
 *
 * ══ LA COULEUR NE DIT QUE LA BANDE ══
 *
 * Rouge sous 3, jaune jusqu'à 6, vert à partir de 7 — la règle de William, tenue par
 * `palierScoreEllipro` et partagée avec la fiche compte. Elle teinte la carte entière, pas
 * seulement le chiffre : c'est l'impression d'ensemble qui doit être juste avant même la lecture.
 *
 * ══ CE QUI MANQUE NE LAISSE PAS DE TROU ══
 *
 * Un rapport de TPE ne porte ni comptes ni effectif ; un rapport de groupe porte tout. Chaque bloc
 * s'efface s'il est vide. Un dossier pauvre donne une carte plus courte, jamais une carte trouée.
 */

const SEVERITES: Record<string, { texte: string; fond: string; libelle: string }> = {
  RED: { texte: 'text-km-red', fond: 'bg-km-red-soft', libelle: 'Grave' },
  ORANGE: { texte: 'text-km-amber', fond: 'bg-km-amber-soft', libelle: 'À noter' },
  GREEN: { texte: 'text-km-green', fond: 'bg-km-green-soft', libelle: 'Sans gravité' },
}

function euros(v: string | null): string | null {
  if (!v) return null
  const n = Number(v)
  return Number.isFinite(n) ? `${n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €` : null
}

function annee(d: string | null): string | null {
  return d ? d.slice(0, 4) : null
}

function Ligne({ icone: Icone, intitule, valeur }: {
  icone: typeof Building2
  intitule: string
  valeur: string | null
}) {
  if (!valeur) return null
  return (
    <div className="flex items-center gap-[9px]">
      <Icone className="h-[13px] w-[13px] shrink-0 text-km-faint" />
      <span className="text-[11px] text-km-faint">{intitule}</span>
      <span className="ml-auto truncate text-[12.5px] font-semibold text-km-text">{valeur}</span>
    </div>
  )
}

export function CarteEllipro({ donnees, nom }: { donnees: EllisphereScore; nom: string }) {
  const note = scoreEnNombre(donnees.score)
  const palier = palierScoreEllipro(note ?? 0)
  const noteSecteur = scoreEnNombre(donnees.scoreSecteur)
  const max = Number((donnees.scale ?? '0 - 10').split('-').pop()?.trim() ?? 10) || 10

  /* LA COMPARAISON AU SECTEUR EST LE CHIFFRE LE PLUS MAL LU QUAND IL MANQUE : un 6 dans un secteur
     à 4 est une bonne nouvelle, le même 6 dans un secteur à 9 en est une mauvaise. */
  const ecart = note != null && noteSecteur != null ? note - noteSecteur : null

  return (
    <div className={cn('flex min-h-0 flex-1 flex-col overflow-hidden rounded-[18px] border', palier.bordureToken)}>

      {/* ── L'EN-TÊTE : LA NOTE, SA BANDE, SON SECTEUR ── */}
      <div className={cn('flex shrink-0 items-stretch gap-[22px] px-[22px] py-[18px]', palier.fondToken)}>
        <div className="flex flex-col justify-center">
          <span className="text-[10px] font-bold uppercase tracking-[0.1em] text-km-faint">Score Ellipro</span>
          <div className="flex items-baseline gap-1.5">
            <span className={cn('font-mono text-[56px] font-extrabold leading-none tracking-[-0.05em]', palier.texteToken)}>
              {donnees.score ?? '—'}
            </span>
            <span className="font-mono text-[16px] font-bold text-km-faint">/{max}</span>
          </div>
          <span className={cn('mt-1 text-[12px] font-bold uppercase tracking-[0.06em]', palier.texteToken)}>
            {palier.libelle}
            {donnees.classeRisque && <span className="text-km-faint"> · classe {donnees.classeRisque}</span>}
          </span>
        </div>

        <div className="flex min-w-0 flex-1 flex-col justify-center gap-[10px]">
          {donnees.libelleRisque && (
            <span className="text-[15px] font-semibold leading-tight text-km-text">{donnees.libelleRisque}</span>
          )}

          {/* La règle des trois bandes, dessinée : un chiffre seul ne dit pas s'il frôle une frontière. */}
          {note != null && (
            <div className="flex flex-col gap-[5px]">
              <div className="relative h-[7px] w-full overflow-hidden rounded-full">
                <div className="absolute inset-0 flex">
                  <span className="h-full w-[30%] bg-km-red/30" />
                  <span className="h-full w-[40%] bg-km-amber/30" />
                  <span className="h-full w-[30%] bg-km-green/30" />
                </div>
                <span
                  className={cn('absolute top-0 h-full w-[3px] rounded-full', palier.bande === 'vert' ? 'bg-km-green' : palier.bande === 'jaune' ? 'bg-km-amber' : 'bg-km-red')}
                  style={{ left: `calc(${Math.max(0, Math.min(100, (note / max) * 100))}% - 1.5px)` }}
                />
              </div>
              <div className="flex justify-between font-mono text-[9px] text-km-faint">
                <span>0</span><span>3</span><span>7</span><span>{max}</span>
              </div>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-x-[14px] gap-y-[4px] text-[11px] text-km-muted">
            {noteSecteur != null && (
              <span className="inline-flex items-center gap-[5px]">
                {ecart != null && ecart >= 0
                  ? <TrendingUp className="h-[12px] w-[12px] text-km-green" />
                  : <TrendingDown className="h-[12px] w-[12px] text-km-amber" />}
                Secteur <strong className="font-mono font-bold text-km-text">{donnees.scoreSecteur}</strong>
                {ecart != null && ecart !== 0 && (
                  <span className={ecart > 0 ? 'text-km-green' : 'text-km-amber'}>
                    ({ecart > 0 ? '+' : ''}{ecart} pour cette société)
                  </span>
                )}
              </span>
            )}
            {donnees.noteMaj && <span>Revu le {donnees.noteMaj}</span>}
            {donnees.noteDepuis && <span>Suivi depuis {annee(donnees.noteDepuis)}</span>}
          </div>
        </div>
      </div>

      {/* ── LE CORPS ── */}
      <div className="grid min-h-0 flex-1 grid-cols-[1fr_244px] gap-[14px] overflow-y-auto bg-white p-[18px]">

        <div className="flex min-w-0 flex-col gap-[12px]">

          {donnees.paymentIncidents && (
            <div className="flex flex-col gap-[5px]">
              <span className="text-[10px] font-bold uppercase tracking-[0.08em] text-km-faint">L’analyse d’Ellisphere</span>
              <p className="text-[12.5px] leading-relaxed text-km-muted">{donnees.paymentIncidents}</p>
            </div>
          )}

          {/* L'ENCOURS CONSEILLÉ EST LE CHIFFRE LE PLUS ACTIONNABLE : ce qu'Ellisphere estime
              raisonnable de laisser courir, et le plafond du dossier. */}
          {(donnees.encoursConseille || donnees.encoursPlafond) && (
            <div className="flex items-center gap-[18px] rounded-[12px] border border-km-line bg-km-bg/50 px-[15px] py-[12px]">
              {donnees.encoursConseille && (
                <div className="flex flex-col">
                  <span className="text-[10px] font-bold uppercase tracking-[0.08em] text-km-faint">Encours conseillé</span>
                  <span className="font-mono text-[18px] font-bold text-km-text">{euros(donnees.encoursConseille)}</span>
                </div>
              )}
              {donnees.encoursPlafond && (
                <div className="flex flex-col border-l border-km-line pl-[18px]">
                  <span className="text-[10px] font-bold uppercase tracking-[0.08em] text-km-faint">Plafond du dossier</span>
                  <span className="font-mono text-[18px] font-bold text-km-muted">{euros(donnees.encoursPlafond)}</span>
                </div>
              )}
            </div>
          )}

          {/* LES ÉVÉNEMENTS LÉGAUX, LES PLUS GRAVES EN TÊTE. Une procédure collective ne se découvre
              pas après la signature. */}
          {donnees.evenements.length > 0 && (
            <div className="flex flex-col gap-[6px]">
              <span className="text-[10px] font-bold uppercase tracking-[0.08em] text-km-faint">Événements légaux</span>
              <div className="flex flex-col gap-[4px]">
                {donnees.evenements.map((e, i) => {
                  const sev = SEVERITES[e.severite ?? 'GREEN'] ?? SEVERITES.GREEN
                  return (
                    <div key={`${e.libelle}-${i}`} className="flex items-center gap-[9px] rounded-[9px] border border-km-line px-[11px] py-[7px]">
                      <span className={cn('inline-flex shrink-0 items-center gap-[5px] rounded-[6px] px-[7px] py-[2px] text-[9.5px] font-bold uppercase', sev.fond, sev.texte)}>
                        {e.severite === 'RED' && <AlertTriangle className="h-[10px] w-[10px]" />}
                        {sev.libelle}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-[12px] text-km-text">{e.libelle}</span>
                      {e.date && <span className="shrink-0 font-mono text-[10.5px] text-km-faint">{e.date}</span>}
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {donnees.dirigeants.length > 0 && (
            <div className="flex flex-col gap-[6px]">
              <span className="text-[10px] font-bold uppercase tracking-[0.08em] text-km-faint">Dirigeants</span>
              <div className="flex flex-wrap gap-[6px]">
                {donnees.dirigeants.map((d) => (
                  <span key={d.nom} className="inline-flex items-center gap-[7px] rounded-[9px] border border-km-line px-[10px] py-[6px]">
                    <UserRound className="h-[12px] w-[12px] shrink-0 text-km-faint" />
                    <span className="text-[12px] font-semibold text-km-text">{d.nom}</span>
                    {d.role && <span className="text-[11px] text-km-faint">{d.role}</span>}
                    {d.depuis && <span className="font-mono text-[10px] text-km-faint">{annee(d.depuis)}</span>}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* ── LA COLONNE D'IDENTITÉ ── */}
        <div className="flex flex-col gap-[10px] rounded-[12px] border border-km-line bg-km-bg/40 p-[14px]">
          <span className="text-[10px] font-bold uppercase tracking-[0.08em] text-km-faint">La société</span>
          <span className="text-[13.5px] font-bold leading-tight text-km-text">{nom}</span>

          {donnees.statut && (
            <span className={cn(
              'w-fit rounded-[6px] px-[8px] py-[3px] text-[10.5px] font-bold uppercase',
              donnees.statutType === 'active' ? 'bg-km-green-soft text-km-green' : 'bg-km-red-soft text-km-red',
            )}>
              {donnees.statut}
            </span>
          )}

          <div className="flex flex-col gap-[7px] border-t border-km-line pt-[10px]">
            <Ligne icone={CalendarDays} intitule="Créée en" valeur={annee(donnees.dateCreation)} />
            <Ligne icone={Coins} intitule="Capital" valeur={euros(donnees.capital)} />
            <Ligne icone={UserRound} intitule="Effectif" valeur={donnees.effectif} />
            <Ligne icone={Building2} intitule="Établissements" valeur={donnees.etablissements} />
          </div>

          {donnees.historique.length > 1 && (
            <div className="mt-auto flex flex-col gap-[6px] border-t border-km-line pt-[10px]">
              <span className="inline-flex items-center gap-[6px] text-[10px] font-bold uppercase tracking-[0.08em] text-km-faint">
                <Landmark className="h-[11px] w-[11px]" /> Notes passées
              </span>
              <div className="flex flex-wrap gap-[5px]">
                {donnees.historique.slice(1).map((h, i) => {
                  const p = palierScoreEllipro(scoreEnNombre(h.valeur) ?? 0)
                  return (
                    <span key={`${h.valeur}-${i}`} className="inline-flex items-baseline gap-[4px] rounded-[7px] bg-white px-[7px] py-[3px]">
                      <span className={cn('font-mono text-[11.5px] font-bold', p.texteToken)}>{h.valeur}</span>
                      {h.date && <span className="font-mono text-[9px] text-km-faint">{h.date.slice(0, 7)}</span>}
                    </span>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
