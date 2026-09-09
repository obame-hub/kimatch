import type { Contrat } from '@/types/domain'
import { LIBELLE_STATUT_VIE, statutVieContrat, type StatutVie } from '@/lib/statutVieContrat'

/**
 * ══ LE CYCLE DE VIE D'UN CONTRAT — SECOND DES DEUX CHEMINS ══
 *
 * Maquette de William, montrée pendant l'appel du 09/09/2026 : trois pastilles à droite — À VENIR,
 * EN COURS, EXPIRÉ — et sous elles une barre qui va de la date de début à la date de fin, avec le
 * jour d'aujourd'hui marqué dessus et le nombre de jours restants au milieu.
 *
 * « Là c'était soit sous un format frise, ça pourrait être en forme de chemin. Tu voyais la date de
 * début le 1er mars, la date de fin le 28 février, une proportion pour dire on est quasi à la fin.
 * Il reste 171 jours. T'avais deux infos qui étaient quand même bien. »
 *
 * ── IL NE S'AFFICHE QU'UNE FOIS LE CONTRAT SIGNÉ ──
 *
 * C'est sa règle, et elle est nette : « TANT QU'IL N'EST PAS SIGNÉ, TU NE PEUX PAS LUI DONNER UN
 * STATUT. Il est encore dans le cycle de signature. » Un contrat en préparation qui annoncerait
 * « à venir » ferait croire à une affaire acquise qui n'est pas encore signée.
 *
 * ── RIEN N'EST STOCKÉ ICI ──
 *
 * Les trois états se déduisent des deux dates, à la lecture (`statutVieContrat`, épinglé par ses
 * tests, et la même règle en SQL dans `v_contrats_liste`). La preuve que c'est la bonne voie est
 * dans les données : sur les 1 561 contrats dont l'ancienne colonne `statut_vie_id` était remplie,
 * 14 la contredisaient — 8 marqués « à venir » qui avaient commencé, 6 marqués « en cours » qui
 * étaient expirés. Personne ne les avait saisis de travers : la valeur stockée avait simplement
 * vieilli, faute de quiconque pour la réécrire.
 *
 * La seule exception est la RÉSILIATION, qui ne se déduit d'aucune date de contrat et porte donc la
 * sienne. William : « tu peux garder résilié, parfois on nous résilie un contrat avant son terme ».
 * Et sur l'autre : « annuler, ça n'a pas de sens ».
 */

const COULEURS: Record<StatutVie, { texte: string; fond: string; bordure: string; barre: string }> = {
  A_VENIR: { texte: '#5c5f66', fond: '#f0efec', bordure: '#e0dfdb', barre: '#c9cbc6' },
  EN_COURS: { texte: '#0d7a5f', fond: '#eaf4f0', bordure: '#d3e5de', barre: '#0d7a5f' },
  EXPIRE: { texte: '#5c5f66', fond: '#f0efec', bordure: '#dcdad5', barre: '#a3a5a0' },
  RESILIE: { texte: '#c2452d', fond: '#fbeae5', bordure: '#eed7cd', barre: '#c2452d' },
}

const ORDRE_AFFICHE: StatutVie[] = ['A_VENIR', 'EN_COURS', 'EXPIRE']

function jourFr(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('fr-FR')
}

/** Un nombre de jours entiers entre deux dates ISO, sans passer par les fuseaux. */
function joursEntre(depuis: string, jusqua: string): number {
  const a = Date.UTC(+depuis.slice(0, 4), +depuis.slice(5, 7) - 1, +depuis.slice(8, 10))
  const b = Date.UTC(+jusqua.slice(0, 4), +jusqua.slice(5, 7) - 1, +jusqua.slice(8, 10))
  return Math.round((b - a) / 86_400_000)
}

export function CycleDeVie({ contrat }: { contrat: Contrat }) {
  const aujourdhui = new Date().toISOString().slice(0, 10)
  const statut = statutVieContrat(contrat.date_debut, contrat.date_fin, aujourdhui, contrat.date_resiliation)
  if (!statut) return null

  const couleurs = COULEURS[statut]
  const debut = contrat.date_debut?.slice(0, 10) ?? null
  const fin = contrat.date_fin?.slice(0, 10) ?? null

  /* LA PROPORTION ÉCOULÉE. Bornée entre 0 et 1 : un contrat expiré depuis six mois ne doit pas
     dessiner une barre qui déborde, et un contrat à venir ne doit pas en dessiner une négative.
     Sans date de fin, aucune proportion n'a de sens — la barre reste pleine à moitié et on ne
     prétend rien. */
  const total = debut && fin ? joursEntre(debut, fin) : null
  const ecoule = debut ? joursEntre(debut, aujourdhui) : null
  const part =
    total && total > 0 && ecoule !== null ? Math.min(1, Math.max(0, ecoule / total)) : statut === 'EXPIRE' ? 1 : 0

  const restants = fin ? joursEntre(aujourdhui, fin) : null

  return (
    <div style={{ background: '#fff', border: '1px solid #e7e6e2', borderRadius: 13, padding: '14px 24px 18px' }}>
      <div className="flex flex-wrap items-center gap-2" style={{ marginBottom: 14 }}>
        <span
          className="uppercase"
          style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: '.08em', color: '#a3a5a0' }}
        >
          Cycle de vie
        </span>
        <span style={{ fontSize: 9.5, color: '#c0c2bd' }}>calculé automatiquement selon la date du jour</span>
        <span className="flex-1" />

        {/* LES TROIS PASTILLES, TOUJOURS LES TROIS. Celle qui s'applique est allumée, les autres
            restent grises : on lit d'un coup où en est le contrat ET ce qu'il lui reste à faire.
            Une résiliation s'ajoute en quatrième — elle sort du parcours normal, donc elle ne le
            remplace pas, elle le termine. */}
        {ORDRE_AFFICHE.map((s) => {
          const actif = s === statut
          const c = COULEURS[s]
          return (
            <span
              key={s}
              className="uppercase"
              style={{
                fontSize: 8.5,
                fontWeight: 800,
                letterSpacing: '.05em',
                borderRadius: 11,
                padding: '2px 9px',
                color: actif ? c.texte : '#c0c2bd',
                background: actif ? c.fond : 'transparent',
                border: `1px solid ${actif ? c.bordure : '#eceae6'}`,
              }}
            >
              {LIBELLE_STATUT_VIE[s]}
            </span>
          )
        })}
        {statut === 'RESILIE' && (
          <span
            className="uppercase"
            style={{
              fontSize: 8.5,
              fontWeight: 800,
              letterSpacing: '.05em',
              borderRadius: 11,
              padding: '2px 9px',
              color: couleurs.texte,
              background: couleurs.fond,
              border: `1px solid ${couleurs.bordure}`,
            }}
          >
            Résilié
          </span>
        )}
      </div>

      {/* LA BARRE. Le repère « aujourd'hui » n'est dessiné que lorsqu'il tombe DANS la période :
          posé au bord sur un contrat expiré, il donnerait l'impression que la fin est aujourd'hui. */}
      <div className="relative" style={{ height: 10, borderRadius: 5, background: '#f0efec' }}>
        <div
          style={{
            position: 'absolute',
            inset: 0,
            width: `${part * 100}%`,
            borderRadius: 5,
            background: couleurs.barre,
            transition: 'width .3s ease',
          }}
        />
        {statut === 'EN_COURS' && part > 0 && part < 1 && (
          <div
            title="aujourd’hui"
            style={{
              position: 'absolute',
              left: `${part * 100}%`,
              top: -4,
              bottom: -4,
              width: 2,
              borderRadius: 1,
              background: '#c2452d',
              transform: 'translateX(-1px)',
            }}
          />
        )}
      </div>

      <div className="mt-2 flex items-baseline gap-2 font-mono" style={{ fontSize: 10.5 }}>
        <span style={{ fontWeight: 700, color: '#16181d' }}>{jourFr(contrat.date_debut)}</span>
        <span style={{ color: '#a3a5a0' }}>début</span>
        <span className="flex-1 text-center" style={{ color: '#83868f' }}>
          {statut === 'RESILIE'
            ? `résilié le ${jourFr(contrat.date_resiliation)}`
            : restants === null
              ? 'sans échéance'
              : restants > 0
                ? `reste ${restants} j`
                : restants === 0
                  ? 'dernier jour'
                  : `expiré depuis ${-restants} j`}
        </span>
        <span style={{ color: '#a3a5a0' }}>fin</span>
        <span style={{ fontWeight: 700, color: statut === 'EXPIRE' ? '#c2452d' : '#16181d' }}>
          {jourFr(contrat.date_fin)}
        </span>
      </div>
    </div>
  )
}
