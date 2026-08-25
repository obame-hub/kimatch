import { Euro, CheckSquare, TrendingUp, Percent } from 'lucide-react'
import type { MaPerformance as Chiffres } from '@/lib/data/tableauDeBord'
import { cn } from '@/lib/utils'

/**
 * « MA PERFORMANCE » — le second bloc de la maquette révisée de Michel du 25/08/2026.
 *
 * En séparant « Performance globale Kiwee » de « Ma performance », il a réglé sa propre question du
 * matin : il n'y a plus de partage « Commercial 60 % / Kiwee 40 % » à calculer, il y a une équipe et
 * un commercial — deux échelles de la même mesure.
 *
 * CHAQUE TUILE PORTE SA RÉFÉRENCE, et c'est la bonne idée de sa maquette : un chiffre seul ne dit
 * rien. 31 800 € est bon ou mauvais selon ce à quoi on le compare. Mais les références qu'il dessine
 * sont des OBJECTIFS (33 000 € par commercial, 520 000 € pour Kiwee) et aucune table ne les porte.
 * Les tuiles montrent donc les références que la base sait produire — la moyenne de l'équipe, le
 * dénominateur du taux — et aucune barre ne prétend mesurer un objectif absent.
 *
 * LA BARRE N'APPARAÎT QUE QUAND ELLE MESURE QUELQUE CHOSE. Une barre sans référence n'est pas une
 * information, c'est une décoration qui ressemble à une information — et sur un tableau de bord c'est
 * la pire espèce.
 */

const euros = (v: number) => v.toLocaleString('fr-FR', { maximumFractionDigits: 0 }) + ' €'

function Tuile({
  icone: Icone,
  teinte,
  libelle,
  valeur,
  reference,
  part,
}: {
  icone: typeof Euro
  teinte: string
  libelle: string
  valeur: string
  reference: string
  /** Part de 0 à 1 pour la barre. Omise, aucune barre n'est dessinée. */
  part?: number | null
}) {
  return (
    <div className="px-4 py-4">
      <span className={cn('flex h-8 w-8 items-center justify-center rounded-kw-md', teinte)}>
        <Icone className="h-4 w-4" strokeWidth={2.3} />
      </span>
      <p className="mt-3 text-kw-xs font-bold text-kw-body">{libelle}</p>
      <p className="mt-1 font-mono text-[22px] font-extrabold leading-none tabular-nums text-kw-ink">
        {valeur}
      </p>
      <p className="mt-1.5 text-kw-micro text-kw-faint">{reference}</p>
      {part != null && (
        <div className="mt-2.5 h-1 overflow-hidden rounded-kw-pill bg-kw-bloc">
          <span
            className="block h-full bg-kw-green"
            style={{ width: Math.min(100, Math.max(0, part * 100)) + '%' }}
          />
        </div>
      )}
    </div>
  )
}

export function MaPerformance({
  chiffres,
  chargement,
  prenom,
}: {
  chiffres: Chiffres | undefined
  chargement: boolean
  prenom?: string | null
}) {
  const c = chiffres
  const vide = chargement || !c
  const mois = new Date().toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })

  return (
    <div className="overflow-hidden rounded-kw-3xl border border-kw-border bg-white">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-kw-border px-5 pb-3.5 pt-4">
        <div className="mr-auto">
          <h2 className="text-kw-h2 font-extrabold tracking-[-0.01em] text-kw-ink">Ma performance</h2>
          <p className="mt-0.5 text-kw-xs text-kw-meta">
            {/* « Vos comptes » et non « vos dossiers » : l'affaire est créditée au propriétaire du
                compte, parce que le responsable n'est renseigné que sur 10 recommandations sur
                1 708. Le dire évite de laisser croire à un compteur personnel qui ne l'est pas. */}
            Les affaires acceptées sur les comptes dont {prenom ? prenom : 'vous'} {prenom ? 'est' : 'êtes'} propriétaire.
          </p>
        </div>
        <span className="rounded-kw-md border border-kw-border bg-kw-bloc px-2 py-0.5 text-kw-micro font-bold capitalize text-kw-meta">
          {mois}
        </span>
      </div>

      <div className="grid grid-cols-1 divide-y divide-kw-border-faint sm:grid-cols-2 sm:divide-y-0 lg:grid-cols-4">
        <div className="sm:border-b sm:border-kw-border-faint lg:border-b-0 lg:border-r lg:border-kw-border-faint">
          <Tuile
            icone={Euro}
            teinte="bg-kw-green-light text-kw-green"
            libelle="Marge générée"
            valeur={vide ? '—' : euros(c.margeMois)}
            reference={
              vide
                ? 'Ce mois'
                : `sur ${c.nbAcceptees} affaire${c.nbAcceptees > 1 ? 's' : ''} acceptée${c.nbAcceptees > 1 ? 's' : ''}`
            }
          />
        </div>
        <div className="sm:border-b sm:border-l sm:border-kw-border-faint lg:border-b-0 lg:border-r">
          <Tuile
            icone={CheckSquare}
            teinte="bg-kw-green-light text-kw-green"
            libelle="Recommandations acceptées"
            valeur={vide ? '—' : String(c.nbAcceptees)}
            reference={vide ? 'Ce mois' : `sur ${c.nbDecidees} décidée${c.nbDecidees > 1 ? 's' : ''} ce mois`}
            part={vide || c.nbDecidees === 0 ? null : c.nbAcceptees / c.nbDecidees}
          />
        </div>
        <div className="lg:border-r lg:border-kw-border-faint">
          <Tuile
            icone={TrendingUp}
            teinte="bg-sky-50 text-kw-blue"
            libelle="Marge moyenne par affaire"
            valeur={vide || c.margeMoyenne == null ? '—' : euros(c.margeMoyenne)}
            reference={
              vide || c.margeMoyenneEquipe == null
                ? 'Aucune référence d’équipe ce mois'
                : `Moyenne de l’équipe : ${euros(c.margeMoyenneEquipe)}`
            }
            /* La barre compare à la moyenne de l'équipe, plafonnée : au-delà du double, ce qui
               compte est qu'on est très au-dessus, pas de combien exactement. */
            part={
              vide || c.margeMoyenne == null || !c.margeMoyenneEquipe
                ? null
                : c.margeMoyenne / (c.margeMoyenneEquipe * 2)
            }
          />
        </div>
        <div>
          <Tuile
            icone={Percent}
            teinte="bg-kw-amber-light text-kw-amber"
            libelle="Taux de transformation"
            valeur={
              vide || c.tauxTransformation == null
                ? '—'
                : c.tauxTransformation.toLocaleString('fr-FR', { maximumFractionDigits: 0 }) + ' %'
            }
            reference={
              vide
                ? 'Ce mois'
                : /* « sur décidées » et non « sur présentées » comme sa maquette : la base ne garde
                     pas la trace d'un passage par « Présentée ». Voir la note de tableauDeBord.ts. */
                  `${c.nbAcceptees} acceptées sur ${c.nbDecidees} décidées`
            }
            part={vide || c.tauxTransformation == null ? null : c.tauxTransformation / 100}
          />
        </div>
      </div>
    </div>
  )
}
