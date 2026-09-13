import { useMemo, useState } from 'react'
import { useChargeEcheances, type MoisDEcheance } from '@/lib/data/ficheCompte'
import { cn } from '@/lib/utils'

/**
 * ══ « LE PORTEFEUILLE » — QUAND LES CONTRATS TOMBENT ══
 *
 * William, 11/09/2026 : « monitorer la santé des compteurs de ce compte », et « masquer la map,
 * elle n'apporte rien de très important ».
 *
 * LA FRISE PREND LA PLACE DE LA CARTE, et ce n'est pas un remplacement de circonstance. La carte
 * montrait OÙ sont les immeubles — une information que l'adresse donne déjà, et qui ne se décide
 * pas. Les échéances, elles, se décident : elles disent quand il faudra consulter, et donc quand il
 * faut s'y prendre. C'est la même donnée que l'onglet Compteurs, dans la dimension qui compte pour
 * un commercial : le temps.
 *
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 * TRENTE-SIX MOIS, DEUX PORTEFEUILLES, ET UNE FRISE QUI DÉFILE
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 *
 * William, 13/09/2026 : « montrer les échéances de tous les compteurs, peu importe s'ils sont
 * engagés dans une opportunité ouverte ou non. Un toggle client/prospect […] couvrir 36 mois, et
 * donc rendre la frise scrollable horizontalement. »
 *
 * ── LE CLIENT ET LE PROSPECT ÉTAIENT DÉJÀ DANS LA DONNÉE ──
 *
 * `nature_echeance` vaut PROUVEE quand la date vient d'un contrat en base — on tient le compteur —
 * et ESTIMEE quand elle a seulement été déclarée. C'est la frontière exacte, et elle est plus juste
 * qu'un statut posé sur le compte : UN MÊME SYNDIC PEUT TENIR DOUZE RÉSIDENCES SOUS CONTRAT ET EN
 * DÉMARCHER TROIS AUTRES. Le portefeuille se lit par compteur, pas par compte.
 *
 * ── LES TROIS VUES NE SE VALENT PAS ──
 *
 * « Tout » sert à voir la charge de travail du compte. « Client » répond à « que dois-je
 * renouveler ? », « Prospect » à « que puis-je gagner ? ». Ce sont trois questions, pas trois
 * filtres — d'où trois onglets nommés, et non une case à cocher.
 *
 * ── LA FRISE DÉFILE, ET L'ÉCHELLE NE BOUGE PAS AVEC ELLE ──
 *
 * Trente-six mois dans un tiers de page feraient des colonnes de six pixels. Chaque mois a donc une
 * largeur MINIMALE en pixels et la frise déborde ; le conteneur défile. Le prix à payer serait une
 * échelle verticale qui change selon la vue — la hauteur se calcule sur le pic des TROIS vues, pas
 * de celle affichée, sinon basculer de « tout » à « prospect » ferait grandir les barres restantes
 * et laisserait croire à plus de volume.
 */

const MOIS_COURTS = ['jan', 'fév', 'mar', 'avr', 'mai', 'juin', 'juil', 'aoû', 'sep', 'oct', 'nov', 'déc']

/** Assez large pour qu'un nom de mois tienne, assez étroit pour en montrer une quinzaine. */
const LARGEUR_MOIS = 30

type Vue = 'tout' | 'client' | 'prospect'

const VUES: { cle: Vue; libelle: string; aide: string }[] = [
  { cle: 'tout',     libelle: 'Tout',     aide: 'Toutes les échéances datées du compte' },
  { cle: 'client',   libelle: 'Client',   aide: 'Échéances prouvées par un contrat en base — à renouveler' },
  { cle: 'prospect', libelle: 'Prospect', aide: 'Échéances seulement déclarées, sans contrat — à gagner' },
]

function valeurs(m: MoisDEcheance, vue: Vue): { compteurs: number; mwh: number } {
  if (vue === 'client') return { compteurs: m.compteurs_client, mwh: m.mwh_client }
  if (vue === 'prospect') return { compteurs: m.compteurs_prospect, mwh: m.mwh_prospect }
  return { compteurs: m.compteurs, mwh: m.mwh }
}

/**
 * La teinte d'un mois.
 *
 * LE ROUGE EST RÉSERVÉ AUX TROIS PREMIERS MOIS NON COUVERTS — même seuil que la zone « À traiter »,
 * et pour la même raison : c'est le temps qu'il faut pour consulter, négocier et signer. Au-delà,
 * un mois non couvert est un plan de charge, pas une alerte.
 *
 * EN VUE « CLIENT » OU « PROSPECT », LA COUVERTURE NE SE CALCULE PLUS. `sans_suite` porte sur le
 * mois entier, pas sur le sous-ensemble affiché : l'appliquer à une vue filtrée ferait dire à la
 * couleur quelque chose de faux. Les deux vues séparées gardent donc leur propre teinte, neutre.
 */
function teinte(m: MoisDEcheance, rang: number, vue: Vue): { barre: string; libelle: string } {
  const v = valeurs(m, vue)
  if (v.compteurs === 0) return { barre: 'transparent', libelle: 'text-km-faint' }
  if (vue === 'client') return { barre: '#6FAF97', libelle: 'text-km-faint' }
  if (vue === 'prospect') return { barre: '#B08FC9', libelle: 'text-km-faint' }
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
  const [vue, setVue] = useState<Vue>('tout')

  const { pic, totaux, premierTrou } = useMemo(() => {
    const m = mois ?? []
    /* L'ÉCHELLE EST COMMUNE AUX TROIS VUES — voir l'en-tête : une hauteur qui se recalcule à chaque
       bascule mentirait sur les volumes. */
    const pic = Math.max(1, ...m.map((x) => x.mwh))
    const totaux: Record<Vue, { compteurs: number; mwh: number }> = {
      tout:     { compteurs: 0, mwh: 0 },
      client:   { compteurs: 0, mwh: 0 },
      prospect: { compteurs: 0, mwh: 0 },
    }
    for (const x of m) {
      totaux.tout.compteurs += x.compteurs;         totaux.tout.mwh += x.mwh
      totaux.client.compteurs += x.compteurs_client; totaux.client.mwh += x.mwh_client
      totaux.prospect.compteurs += x.compteurs_prospect; totaux.prospect.mwh += x.mwh_prospect
    }
    /* Le plus long silence à venir : la fenêtre où l'on peut travailler autre chose, et que
       personne ne voit en lisant une liste de dates. */
    let meilleur = { debut: -1, longueur: 0 }
    let courant = { debut: -1, longueur: 0 }
    m.forEach((x, i) => {
      if (x.compteurs === 0) {
        if (courant.debut < 0) courant = { debut: i, longueur: 1 }
        else courant.longueur++
        if (courant.longueur > meilleur.longueur) meilleur = { ...courant }
      } else courant = { debut: -1, longueur: 0 }
    })
    return { pic, totaux, premierTrou: meilleur }
  }, [mois])

  if (isLoading || !mois || mois.length === 0) return null

  const t = totaux[vue]

  return (
    <section
      aria-labelledby="zone-portefeuille"
      className="rounded-[22px] bg-[#EAF2EE] p-2.5 ring-1 ring-inset ring-[#D8E8E1] sm:p-3"
    >
      <div className="mb-2.5 flex flex-wrap items-baseline gap-x-2.5 gap-y-0.5 px-1.5">
        <h2 id="zone-portefeuille" className="text-km-name font-semibold text-[#0A5F4A]">Le portefeuille</h2>
        <p className="min-w-0 truncate text-km-body text-km-muted">
          {nbCompteurs} compteur{nbCompteurs > 1 ? 's' : ''} · {nbContrats} contrat{nbContrats > 1 ? 's' : ''}
          {totaux.tout.compteurs > 0 && (
            <> · {totaux.tout.compteurs} échéance{totaux.tout.compteurs > 1 ? 's' : ''} datée{totaux.tout.compteurs > 1 ? 's' : ''} sur 36 mois</>
          )}
        </p>
      </div>

      <div className="rounded-[16px] bg-km-surface px-4 py-3">
        <div className="mb-2.5 flex flex-wrap items-center gap-x-3 gap-y-2">
          <h3 className="text-km-body font-semibold text-km-text">Quand les contrats tombent</h3>

          {/* ══ LES TROIS VUES ══
              Trois questions plutôt qu'un filtre — voir l'en-tête. Le décompte de chacune est
              écrit sur son onglet : on choisit en sachant ce qu'on va trouver, et une vue vide se
              voit avant d'être ouverte. */}
          <div role="tablist" aria-label="Portefeuille affiché" className="flex items-center gap-1 rounded-full bg-km-bg p-0.5">
            {VUES.map((v) => {
              const actif = vue === v.cle
              const n = totaux[v.cle].compteurs
              return (
                <button
                  key={v.cle}
                  type="button"
                  role="tab"
                  aria-selected={actif}
                  title={v.aide}
                  onClick={() => setVue(v.cle)}
                  className={cn(
                    'flex items-center gap-1.5 rounded-full px-2.5 py-1 text-km-label font-semibold transition-colors',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-km-green/45',
                    actif ? 'bg-km-surface text-km-text shadow-kw-card' : 'text-km-muted hover:text-km-text',
                    n === 0 && !actif && 'opacity-50',
                  )}
                >
                  {v.libelle}
                  <span className={cn('tabular-nums', actif ? 'text-km-muted' : 'text-km-faint')}>{n}</span>
                </button>
              )
            })}
          </div>

          <span className="ml-auto text-km-label text-km-faint">36 mois · la hauteur dit les MWh</span>
        </div>

        {t.compteurs === 0 ? (
          <p className="py-6 text-center text-km-body text-km-muted">
            {vue === 'tout'
              ? 'Aucune échéance datée dans les trois prochaines années.'
              : vue === 'client'
                ? 'Aucun compteur sous contrat n’arrive à échéance sur la période.'
                : 'Aucun compteur hors contrat n’a d’échéance déclarée sur la période.'}
          </p>
        ) : (
          <>
            {/* LA FRISE DÉFILE. Chaque mois garde sa place, même vide : ne rendre que les mois
                peuplés donnerait un axe irrégulier où deux barres voisines pourraient être séparées
                de onze mois — et la première chose qu'on demande à une frise, c'est de montrer les
                trous. */}
            <div className="-mx-1 overflow-x-auto px-1 pb-1">
              <div className="flex h-[92px] items-end gap-[3px]" style={{ minWidth: mois.length * (LARGEUR_MOIS + 3) }}>
                {mois.map((m, i) => {
                  const v = valeurs(m, vue)
                  const c = teinte(m, i, vue)
                  const d = new Date(m.mois)
                  const hauteur = v.compteurs === 0 ? 0 : Math.max(6, Math.round((v.mwh / pic) * 100))
                  const janvier = d.getMonth() === 0
                  return (
                    <div
                      key={m.mois}
                      className="flex flex-col items-center justify-end gap-1"
                      style={{ width: LARGEUR_MOIS, flex: '0 0 auto' }}
                    >
                      <div
                        title={`${MOIS_COURTS[d.getMonth()]} ${d.getFullYear()} — ${v.compteurs} compteur${v.compteurs > 1 ? 's' : ''}, ${Math.round(v.mwh).toLocaleString('fr-FR')} MWh${vue === 'tout' && m.sans_suite > 0 ? `, dont ${m.sans_suite} sans rien de lancé` : ''}`}
                        className="flex w-full items-end justify-center"
                        style={{ height: 64 }}
                      >
                        {v.compteurs > 0 && (
                          <span
                            className="w-full rounded-t-[3px] transition-[height] duration-500 ease-out"
                            style={{ height: `${hauteur}%`, background: c.barre }}
                          />
                        )}
                      </div>
                      {/* L'ANNÉE REMPLACE LE MOIS EN JANVIER : sur trente-six colonnes, c'est le
                          seul repère qui empêche de se perdre. */}
                      <span className={cn('truncate text-[8.5px] font-semibold leading-none', janvier ? 'text-km-text' : c.libelle)}>
                        {janvier ? `'${String(d.getFullYear()).slice(2)}` : MOIS_COURTS[d.getMonth()]}
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>

            <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-km-line pt-2.5 text-km-label text-km-muted">
              {vue === 'tout' ? (
                <>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-[2px]" style={{ background: '#DF8578' }} />sous 3 mois, rien de lancé
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-[2px]" style={{ background: '#E3B878' }} />dans l’année, rien de lancé
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-[2px]" style={{ background: '#9FC9B8' }} />couvert
                  </span>
                </>
              ) : (
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-[2px]" style={{ background: vue === 'client' ? '#6FAF97' : '#B08FC9' }} />
                  {Math.round(t.mwh).toLocaleString('fr-FR')} MWh sur {t.compteurs} compteur{t.compteurs > 1 ? 's' : ''}
                </span>
              )}
              {vue === 'tout' && premierTrou.longueur >= 3 && (
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
