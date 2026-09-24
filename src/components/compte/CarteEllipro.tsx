import { AlertTriangle, TrendingDown, TrendingUp } from 'lucide-react'
import { palierScoreEllipro, scoreEnNombre } from '@/lib/scoreEllipro'
import { cn } from '@/lib/utils'
import type { EllisphereScore } from '@/lib/data/ellisphere'

/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * LA CARTE ELLIPRO — « LE TABLEAU DE BORD »
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * Direction retenue par William le 24/09/2026 parmi trois maquettes : « ta proposition C me paraît
 * la plus conforme », avec une exigence — « un affichage optimisé pour s'afficher dans la popup
 * sans besoin de scroll ».
 *
 * ══ UNE TUILE MAÎTRESSE, PUIS UNE GRILLE ══
 *
 * La tuile du haut est EN COULEUR PLEINE et porte tout ce qui décide : la note, sa position sur
 * l'échelle, l'écart au secteur, l'encours conseillé. Sur un dossier à risque elle est impossible à
 * ne pas voir — c'est ce qui l'a fait préférer aux deux autres directions, qui disaient le risque
 * là où celle-ci le crie.
 *
 * En dessous, des tuiles inégales : ce qui est long (l'analyse, les comptes) prend deux colonnes,
 * ce qui est court (l'historique, l'identité) en prend une.
 *
 * ══ TOUT TIENT SANS DÉFILEMENT, ET C'EST UNE CONTRAINTE DE HAUTEUR ══
 *
 * La fenêtre fait 740 px ; l'en-tête d'étape et la barre d'action en prennent 195. Il reste 545 px,
 * et la carte est bâtie pour eux : hauteurs fixes en haut et en bas, la rangée du milieu absorbe le
 * reste. Les tailles de texte sont serrées d'un cran par rapport au reste de Kimatch — c'est le prix
 * du « sans scroll », et il se paie une fois ici plutôt qu'à chaque consultation.
 *
 * ══ CE QUI MANQUE NE LAISSE PAS DE TROU ══
 *
 * Une société créée l'an dernier n'a ni comptes, ni dirigeant déclaré, ni événement. Chaque tuile
 * s'efface si elle est vide, et la grille se referme. Un dossier pauvre donne une carte plus courte,
 * jamais une carte trouée.
 */

const SEVERITES: Record<string, { texte: string; fond: string; libelle: string }> = {
  RED: { texte: 'text-km-red', fond: 'bg-km-red-soft', libelle: 'Grave' },
  ORANGE: { texte: 'text-km-amber', fond: 'bg-km-amber-soft', libelle: 'À noter' },
  GREEN: { texte: 'text-km-green', fond: 'bg-km-green-soft', libelle: 'Sans gravité' },
}

/** Les montants du rapport sont en euros pleins : au-delà du million, les centimes sont du bruit. */
function montant(v: number | null | undefined): string {
  if (v == null) return '—'
  const abs = Math.abs(v)
  if (abs >= 1_000_000) return `${(v / 1_000_000).toLocaleString('fr-FR', { maximumFractionDigits: 2 })} M€`
  if (abs >= 10_000) return `${(v / 1000).toLocaleString('fr-FR', { maximumFractionDigits: 0 })} k€`
  return `${v.toLocaleString('fr-FR', { maximumFractionDigits: 0 })} €`
}

function Tuile({ titre, className, children }: { titre: string; className?: string; children: React.ReactNode }) {
  return (
    <div className={cn('flex min-w-0 flex-col gap-[6px] rounded-[12px] border border-km-line bg-white px-[13px] py-[11px]', className)}>
      <span className="text-[9.5px] font-extrabold uppercase tracking-[0.08em] text-km-faint">{titre}</span>
      {children}
    </div>
  )
}

export function CarteEllipro({ donnees, nom }: { donnees: EllisphereScore; nom: string }) {
  const note = scoreEnNombre(donnees.score)
  const palier = palierScoreEllipro(note ?? 0)
  const noteSecteur = scoreEnNombre(donnees.scoreSecteur)
  const max = Number((donnees.scale ?? '0 - 10').split('-').pop()?.trim() ?? 10) || 10
  const ecart = note != null && noteSecteur != null ? note - noteSecteur : null

  /* La tuile maîtresse est en couleur pleine : le texte y est blanc, donc la teinte doit être la
     couleur SATURÉE et non le fond pâle des blocs. */
  const fondMaitre = palier.bande === 'vert' ? 'bg-km-green' : palier.bande === 'jaune' ? 'bg-km-amber' : 'bg-km-red'

  const comptes = donnees.comptes
  /* Le chiffre d'affaires porte la tendance : c'est lui qui dit si l'affaire grandit ou se réduit. */
  const ca = comptes?.lignes.find((l) => l.code === 'KC01')
  const tendanceCa = ca && ca.valeurs[0] != null && ca.valeurs[2] != null && ca.valeurs[2] !== 0
    ? Math.round(((ca.valeurs[0] - ca.valeurs[2]) / Math.abs(ca.valeurs[2])) * 100)
    : null

  return (
    <div className={cn('flex min-h-0 flex-1 flex-col gap-[9px] rounded-[16px] border p-[12px]', palier.bordureToken, palier.fondToken)}>

      {/* ══ LA TUILE MAÎTRESSE ══ */}
      <div className={cn('flex shrink-0 items-center gap-[18px] rounded-[13px] px-[16px] py-[13px] text-white', fondMaitre)}>
        <div className="flex flex-col">
          <span className="text-[9.5px] font-extrabold uppercase tracking-[0.1em] text-white/70">Score Ellipro</span>
          <div className="flex items-baseline gap-1">
            <span className="font-mono text-[46px] font-extrabold leading-none tracking-[-0.05em]">{donnees.score ?? '—'}</span>
            <span className="font-mono text-[14px] font-bold text-white/70">/{max}</span>
          </div>
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-[6px]">
          <span className="truncate text-[14px] font-bold">
            {donnees.libelleRisque ?? palier.libelle}
            {donnees.classeRisque && <span className="font-medium text-white/75"> · classe {donnees.classeRisque}</span>}
          </span>
          {note != null && (
            <div className="flex flex-col gap-[3px]">
              <div className="relative h-[5px] rounded-full bg-white/25">
                <span
                  className="absolute top-0 h-full w-[4px] rounded-full bg-white"
                  style={{ left: `calc(${Math.max(0, Math.min(100, (note / max) * 100))}% - 2px)` }}
                />
              </div>
              <div className="flex justify-between font-mono text-[8.5px] text-white/70">
                <span>0</span><span>3</span><span>7</span><span>{max}</span>
              </div>
            </div>
          )}
          <span className="flex flex-wrap items-center gap-x-[10px] text-[10.5px] text-white/85">
            {noteSecteur != null && (
              <span className="inline-flex items-center gap-[4px]">
                {ecart != null && ecart >= 0 ? <TrendingUp className="h-[11px] w-[11px]" /> : <TrendingDown className="h-[11px] w-[11px]" />}
                Secteur {donnees.scoreSecteur}
                {ecart != null && ecart !== 0 && <strong className="font-bold">({ecart > 0 ? '+' : ''}{ecart})</strong>}
              </span>
            )}
            {donnees.noteMaj && <span>Revu le {donnees.noteMaj}</span>}
          </span>
        </div>

        {donnees.encoursConseille && (
          <div className="flex shrink-0 flex-col items-end gap-[1px] border-l border-white/25 pl-[16px]">
            <span className="text-[9.5px] font-extrabold uppercase tracking-[0.08em] text-white/70">Encours conseillé</span>
            <span className="font-mono text-[19px] font-extrabold leading-tight">{montant(Number(donnees.encoursConseille))}</span>
            {donnees.encoursPlafond && (
              <span className="text-[10px] text-white/75">plafond {montant(Number(donnees.encoursPlafond))}</span>
            )}
          </div>
        )}
      </div>

      {/* ══ LA GRILLE ══

          William, 24/09/2026 : « le dernier bloc en bas ne rentre pas dans la fenêtre, autant le
          supprimer ou l'intégrer dans le bloc Chiffres clés qui dispose de beaucoup d'espace
          libre ».

          LES ÉVÉNEMENTS DESCENDENT DANS LA COLONNE DE GAUCHE, sous les chiffres clés, au lieu de
          prendre une rangée à eux sur toute la largeur. Ils ne débordent plus, et l'espace vide
          sous les trois montants est enfin employé — deux problèmes que la même colonne règle.

          ON NE LES SUPPRIME PAS : c'est le seul bloc qui puisse annoncer une procédure collective,
          et l'apprendre après la signature coûte infiniment plus cher que la place qu'il prend. */}
      <div className="grid min-h-0 flex-1 grid-cols-3 grid-rows-[auto_1fr] gap-[9px]">

        {donnees.paymentIncidents && (
          <Tuile titre="L’analyse d’Ellisphere" className="col-span-2">
            <p className="line-clamp-3 text-[11.5px] leading-[1.45] text-km-muted">{donnees.paymentIncidents}</p>
          </Tuile>
        )}

        {donnees.historique.length > 1 && (
          <Tuile titre="Notes passées">
            {/* LE GRAPHIQUE SE CENTRE DANS SA TUILE. Sa hauteur est décidée par la tuile voisine,
                l'analyse, qui fait trois lignes : sans centrage, cinq barres restaient collées en
                haut avec du vide dessous. */}
            <div className="flex min-h-0 flex-1 items-center">
              <div className="flex w-full items-end gap-[5px]">
                {donnees.historique.slice(0, 5).reverse().map((h, i) => {
                  const v = scoreEnNombre(h.valeur) ?? 0
                  const p = palierScoreEllipro(v)
                  return (
                    <div key={`${h.valeur}-${i}`} className="flex min-w-0 flex-1 flex-col items-center gap-[2px]">
                      {/* LA NOTE SE LIT, la barre se compare : la première dit combien, la seconde
                          dit le sens. Cinq barres de même hauteur ne racontaient rien. */}
                      <span className={cn('font-mono text-[10.5px] font-extrabold leading-none', p.texteToken)}>
                        {h.valeur}
                      </span>
                      <span
                        className={cn('w-full rounded-[2px]', p.bande === 'vert' ? 'bg-km-green' : p.bande === 'jaune' ? 'bg-km-amber' : 'bg-km-red')}
                        style={{ height: `${Math.max(4, (v / max) * 24)}px` }}
                      />
                      <span className="font-mono text-[8px] text-km-faint">{h.date?.slice(2, 7) ?? ''}</span>
                    </div>
                  )
                })}
              </div>
            </div>
          </Tuile>
        )}

        {/* ── LA COLONNE DE GAUCHE : LES CHIFFRES, PUIS CE QUI S'EST PASSÉ ── */}
        <div className="col-span-2 flex min-h-0 min-w-0 flex-col gap-[9px]">
          {comptes && (
            <Tuile titre={`Chiffres clés · exercice ${comptes.exercices[0] ?? ''}`}>
              <div className="flex gap-[14px]">
                {comptes.lignes.slice(0, 3).map((l) => (
                  <div key={l.code} className="flex min-w-0 flex-1 flex-col gap-[1px]">
                    <span className="truncate text-[10px] text-km-faint">{l.nom}</span>
                    <span className={cn(
                      'font-mono text-[15px] font-extrabold leading-tight',
                      (l.valeurs[0] ?? 0) < 0 ? 'text-km-red' : 'text-km-text',
                    )}>
                      {montant(l.valeurs[0])}
                    </span>
                    {l.code === 'KC01' && tendanceCa != null && (
                      <span className={cn('text-[9.5px] font-semibold', tendanceCa >= 0 ? 'text-km-green' : 'text-km-red')}>
                        {tendanceCa >= 0 ? '▲' : '▼'} {Math.abs(tendanceCa)} % sur {comptes.exercices.length} ans
                      </span>
                    )}
                    {l.code !== 'KC01' && l.valeurs[1] != null && (
                      <span className="font-mono text-[9.5px] text-km-faint">{comptes.exercices[1]} · {montant(l.valeurs[1])}</span>
                    )}
                  </div>
                ))}
              </div>
            </Tuile>
          )}

          {donnees.evenements.length > 0 && (
            <Tuile titre="Événements légaux · les plus graves d’abord" className="min-h-0 flex-1">
              {/* IL DÉFILE PLUTÔT QUE DE SE COUPER. Une société qui accumule les inscriptions est
                  précisément celle dont on veut tout voir : en tronquer la liste effacerait les
                  dernières, et l'ordre met les plus graves en tête mais pas les plus récentes. */}
              <div className="flex min-h-0 flex-1 flex-col gap-[4px] overflow-y-auto pr-[3px]">
                {donnees.evenements.map((e, i) => {
                  const sev = SEVERITES[e.severite ?? 'GREEN'] ?? SEVERITES.GREEN
                  return (
                    <div key={`${e.libelle}-${i}`} className="flex items-center gap-[8px]">
                      <span className={cn('inline-flex shrink-0 items-center gap-[4px] rounded-[5px] px-[6px] py-[1px] text-[9px] font-extrabold uppercase', sev.fond, sev.texte)}>
                        {e.severite === 'RED' && <AlertTriangle className="h-[9px] w-[9px]" />}
                        {sev.libelle}
                      </span>
                      <span className={cn('min-w-0 flex-1 truncate text-[11.5px]', e.severite === 'RED' ? 'font-semibold text-km-text' : 'text-km-text')}>
                        {e.libelle}
                      </span>
                      {e.date && <span className="shrink-0 font-mono text-[10px] text-km-faint">{e.date}</span>}
                    </div>
                  )
                })}
              </div>
            </Tuile>
          )}
        </div>

        <Tuile titre="La société" className="min-h-0">
          <span className="truncate text-[12.5px] font-bold leading-tight text-km-text">{nom}</span>
          {donnees.statut && (
            <span className={cn(
              'w-fit rounded-[5px] px-[6px] py-[1px] text-[9.5px] font-extrabold uppercase',
              donnees.statutType === 'active' ? 'bg-km-green-soft text-km-green' : 'bg-km-red-soft text-km-red',
            )}>
              {donnees.statut}
            </span>
          )}
          <div className="flex flex-col gap-[2px] border-t border-km-line-soft pt-[6px]">
            {([
              ['Créée en', donnees.dateCreation?.slice(0, 4) ?? null],
              ['Capital', donnees.capital ? montant(Number(donnees.capital)) : null],
              ['Effectif', donnees.effectif],
              ['Établissements', donnees.etablissements],
            ] as [string, string | null][]).filter(([, v]) => v).map(([cle, v]) => (
              <div key={cle} className="flex items-baseline justify-between gap-2">
                <span className="text-[10px] text-km-faint">{cle}</span>
                <span className="font-mono text-[11px] font-semibold text-km-text">{v}</span>
              </div>
            ))}
            {donnees.dirigeants[0] && (
              <div className="flex items-baseline justify-between gap-2">
                <span className="shrink-0 text-[10px] text-km-faint">{donnees.dirigeants[0].role ?? 'Dirigeant'}</span>
                <span className="truncate text-[11px] font-semibold text-km-text">{donnees.dirigeants[0].nom}</span>
              </div>
            )}
          </div>
        </Tuile>
      </div>
    </div>
  )
}
