import { useMemo } from 'react'
import { useChargeEcheances, type MoisDEcheance } from '@/lib/data/ficheCompte'
import { cn } from '@/lib/utils'

/**
 * ══ « LE PORTEFEUILLE » — QUAND LES CONTRATS TOMBENT ══
 *
 * William, 11/09/2026 : « être en mesure de monitorer la santé des compteurs de ce compte », et
 * « masquer la map, elle n'apporte rien de très important ».
 *
 * LA FRISE PREND LA PLACE DE LA CARTE, et ce n'est pas un remplacement de circonstance. La carte
 * montrait OÙ sont les immeubles — une information que l'adresse donne déjà, et qui ne se décide
 * pas. Les échéances, elles, se décident : elles disent quand il faudra consulter, et donc quand il
 * faut s'y prendre. C'est la même donnée que l'onglet Compteurs, dans la dimension qui compte pour
 * un commercial : le temps.
 *
 * ── DEUX ENCODAGES, DEUX QUESTIONS ──
 *
 *   LA HAUTEUR dit le VOLUME en jeu ce mois-là. C'est ce qui distingue un mois où tombent trois
 *   petits compteurs de copropriété d'un mois où tombe un site industriel.
 *
 *   LA COULEUR dit si c'est COUVERT. Un mois entièrement repris par des opportunités ou des
 *   recommandations ouvertes est vert, même s'il est proche ; un mois sans rien de lancé vire à
 *   l'ambre puis au rouge à mesure qu'il approche. La proximité seule ne suffirait pas : un mois
 *   proche et déjà traité n'appelle aucune action.
 *
 * ── LES MOIS VIDES RESTENT ──
 *
 * Ils occupent leur place, sans barre. Ne rendre que les mois peuplés donnerait un axe irrégulier
 * où deux barres voisines pourraient être séparées de onze mois — et la première chose qu'on
 * demande à une frise, c'est de montrer les trous. Sur ce portefeuille, le trou de janvier à
 * novembre 2027 est une information : rien à renouveler pendant dix mois.
 *
 * ── LES QUATRE PREMIERS MOIS SONT NOMMÉS, LES AUTRES NON ──
 *
 * Vingt-quatre étiquettes dans la largeur d'un tiers de page seraient illisibles. Les changements
 * d'année et les mois porteurs gardent leur nom ; le survol donne le détail exact de chaque mois.
 */

/** Deux ans : au-delà, une échéance ne se planifie pas, elle se surveille. */
const MOIS_COURTS = ['jan', 'fév', 'mar', 'avr', 'mai', 'juin', 'juil', 'aoû', 'sep', 'oct', 'nov', 'déc']

/**
 * La teinte d'un mois : couvert, à couvrir, urgent.
 *
 * LE ROUGE EST RÉSERVÉ AUX TROIS PREMIERS MOIS NON COUVERTS — le même seuil que la zone « À
 * traiter », et pour la même raison : c'est le temps qu'il faut pour consulter, négocier et signer.
 * Au-delà, un mois non couvert est un plan de charge, pas une alerte.
 */
function teinte(m: MoisDEcheance, rang: number): { barre: string; libelle: string } {
  if (m.compteurs === 0) return { barre: 'transparent', libelle: 'text-km-faint' }
  if (m.sans_suite === 0) return { barre: '#9FC9B8', libelle: 'text-km-faint' }
  if (rang <= 3) return { barre: '#DF8578', libelle: 'text-km-red' }
  if (rang <= 11) return { barre: '#E3B878', libelle: 'text-km-amber' }
  return { barre: '#CBD5D0', libelle: 'text-km-faint' }
}

export function ZonePortefeuille({
  compteId,
  nbCompteurs,
  nbContrats,
}: {
  compteId: string
  nbCompteurs: number
  nbContrats: number
}) {
  const { data: mois, isLoading } = useChargeEcheances(compteId)

  const { pic, totalCompteurs, totalMwh, premierTrou } = useMemo(() => {
    const m = mois ?? []
    const pic = Math.max(1, ...m.map((x) => x.mwh))
    const totalCompteurs = m.reduce((t, x) => t + x.compteurs, 0)
    const totalMwh = m.reduce((t, x) => t + x.mwh, 0)
    /* Le plus long silence à venir : c'est la fenêtre où l'on peut travailler autre chose, et
       personne ne la voit en lisant une liste de dates. */
    let meilleur = { debut: -1, longueur: 0 }
    let courant = { debut: -1, longueur: 0 }
    m.forEach((x, i) => {
      if (x.compteurs === 0) {
        if (courant.debut < 0) courant = { debut: i, longueur: 1 }
        else courant.longueur++
        if (courant.longueur > meilleur.longueur) meilleur = { ...courant }
      } else courant = { debut: -1, longueur: 0 }
    })
    return { pic, totalCompteurs, totalMwh, premierTrou: meilleur }
  }, [mois])

  if (isLoading || !mois || mois.length === 0) return null

  return (
    <section
      aria-labelledby="zone-portefeuille"
      className="rounded-[22px] bg-[#EAF2EE] p-2.5 ring-1 ring-inset ring-[#D8E8E1] sm:p-3"
    >
      <div className="mb-2.5 flex flex-wrap items-baseline gap-x-2.5 gap-y-0.5 px-1.5">
        <h2 id="zone-portefeuille" className="text-km-name font-semibold text-[#0A5F4A]">Le portefeuille</h2>
        <p className="min-w-0 truncate text-km-body text-km-muted">
          {nbCompteurs} compteur{nbCompteurs > 1 ? 's' : ''} · {nbContrats} contrat{nbContrats > 1 ? 's' : ''}
          {totalCompteurs > 0 && (
            <> · {totalCompteurs} échéance{totalCompteurs > 1 ? 's' : ''} sur 24 mois pour {Math.round(totalMwh).toLocaleString('fr-FR')} MWh</>
          )}
        </p>
      </div>

      <div className="rounded-[16px] bg-km-surface px-4 py-3">
        <div className="mb-2 flex flex-wrap items-baseline gap-x-2.5">
          <h3 className="text-km-body font-semibold text-km-text">Quand les contrats tombent</h3>
          <span className="text-km-label text-km-faint">24 mois · la hauteur dit les MWh</span>
        </div>

        {totalCompteurs === 0 ? (
          <p className="py-6 text-center text-km-body text-km-muted">
            Aucune échéance dans les deux prochaines années.
          </p>
        ) : (
          <>
            {/* LA FRISE. Chaque mois garde sa place, même vide — voir l'en-tête. */}
            <div className="flex h-[86px] items-end gap-[3px]">
              {mois.map((m, i) => {
                const t = teinte(m, i)
                const d = new Date(m.mois)
                const hauteur = m.compteurs === 0 ? 0 : Math.max(6, Math.round((m.mwh / pic) * 100))
                const nomme = i === 0 || d.getMonth() === 0 || m.compteurs > 0
                return (
                  <div key={m.mois} className="flex min-w-0 flex-1 flex-col items-center justify-end gap-1">
                    <div
                      title={`${MOIS_COURTS[d.getMonth()]} ${d.getFullYear()} — ${m.compteurs} compteur${m.compteurs > 1 ? 's' : ''}, ${Math.round(m.mwh).toLocaleString('fr-FR')} MWh${m.sans_suite > 0 ? `, dont ${m.sans_suite} sans rien de lancé` : m.compteurs > 0 ? ', tous couverts' : ''}`}
                      className="flex w-full items-end justify-center"
                      style={{ height: 62 }}
                    >
                      {m.compteurs > 0 && (
                        <span
                          className="w-full rounded-t-[3px] transition-[height] duration-500 ease-out"
                          style={{ height: `${hauteur}%`, background: t.barre }}
                        />
                      )}
                    </div>
                    <span className={cn('truncate text-[8.5px] font-semibold leading-none', t.libelle)}>
                      {nomme ? MOIS_COURTS[d.getMonth()] : '·'}
                    </span>
                  </div>
                )
              })}
            </div>

            {/* LA LÉGENDE EST AUSSI UNE PHRASE. Trois pastilles ne disent pas ce qu'il faut en
                faire ; la fenêtre libre, si. */}
            <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-km-line pt-2.5 text-km-label text-km-muted">
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-[2px]" style={{ background: '#DF8578' }} />sous 3 mois, rien de lancé
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-[2px]" style={{ background: '#E3B878' }} />dans l’année, rien de lancé
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-[2px]" style={{ background: '#9FC9B8' }} />couvert
              </span>
              {premierTrou.longueur >= 3 && (
                <span className="ml-auto text-km-faint">
                  {premierTrou.longueur} mois sans échéance à partir de{' '}
                  {new Date(mois[premierTrou.debut].mois).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })}
                </span>
              )}
            </div>
          </>
        )}
      </div>
    </section>
  )
}
