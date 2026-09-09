import { Link } from 'react-router-dom'
import type { Contrat } from '@/types/domain'
import { statutVieContrat, type StatutVie } from '@/lib/statutVieContrat'

/**
 * ══ CE QUE CE COMPTEUR A FAIT, FAIT, ET FERA ══
 *
 * William, appel du 09/09/2026, après avoir refusé la même chose sur la fiche contrat :
 *
 *   « Un contrat, je n'ai pas besoin de savoir ce qui s'est passé avant, ni ce qui se passe après —
 *   la page contrat se focus sur ça. PAR CONTRE UN COMPTEUR, LUI, IL A UNE VIE BEAUCOUP PLUS LONGUE
 *   QUE LE CONTRAT. Donc je veux savoir en effet ce qu'il a fait avant, je veux savoir où il en est
 *   actuellement, et je veux même savoir s'il a déjà prévu un truc après. »
 *
 * La distinction est juste : un contrat est un épisode, le compteur est le fil. Il montrait l'exemple
 * d'un PDL passé d'EDF à Total en février 2024.
 *
 * ── CE QUE LES DONNÉES DISENT DE CE BESOIN ──
 *
 * Relevé du 09/09/2026 : 318 compteurs portent plus d'un contrat (299 en ont deux, 16 en ont trois,
 * 3 en ont quatre). Et surtout **279 compteurs ont déjà un contrat À VENIR** — c'est le « truc prévu
 * après » dont il parle, et c'est le cas le plus fréquent des trois.
 *
 * Un exemple réel, MEMPHIS BRUAY-LA-BUISSIÈRE : 2023-2024 chez un fournisseur inconnu, 2025 chez
 * Gazel Énergie, 2026-2028 chez Gedia, puis 2029-2030 chez Gedia. La liste plate qui précédait
 * affichait ces quatre lignes sans ordre ni époque — il fallait lire les huit dates pour
 * reconstituer la chronologie.
 *
 * ── DEUX ANOMALIES QUE LA FRISE MONTRE AU LIEU DE LES TAIRE ──
 *
 * LES TROUS. Entre deux contrats, une période sans couverture. Ce n'est pas forcément une erreur —
 * le client a pu être ailleurs, ou pas encore chez nous — mais c'est toujours une information
 * commerciale : c'est du volume qu'on n'a pas eu.
 *
 * LES CHEVAUCHEMENTS. Deux contrats actifs le même jour sur le même compteur. Naoëlle a confirmé le
 * 09/09 que la règle de William — « tu ne peux pas avoir deux contrats au statut actif » — vaut au
 * niveau du COMPTEUR et non du compte : 116 comptes en ont plusieurs, ce qui est normal pour un
 * syndic, mais 8 compteurs seulement, et ceux-là sont de vraies anomalies. La frise les signale
 * plutôt que de les empiler en silence.
 */

const TONS: Record<StatutVie, { pastille: string; texte: string; fond: string; bordure: string; libelle: string }> = {
  EXPIRE: { pastille: '#c9cbc6', texte: '#5c5f66', fond: '#f6f6f4', bordure: '#eceae6', libelle: 'Terminé' },
  EN_COURS: { pastille: '#0d7a5f', texte: '#0d7a5f', fond: '#eaf4f0', bordure: '#d3e5de', libelle: 'En cours' },
  A_VENIR: { pastille: '#b57a24', texte: '#b57a24', fond: '#fdf9f0', bordure: '#f0e4cd', libelle: 'À venir' },
  RESILIE: { pastille: '#c2452d', texte: '#c2452d', fond: '#fbeae5', bordure: '#eed7cd', libelle: 'Résilié' },
}

function annee(iso: string | null | undefined): string {
  return iso ? iso.slice(0, 4) : '?'
}

function jourFr(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('fr-FR')
}

/** Des mois entiers entre deux dates ISO, pour dire la taille d'un trou sans fausse précision. */
function moisEntre(depuis: string, jusqua: string): number {
  const a = new Date(depuis.slice(0, 10))
  const b = new Date(jusqua.slice(0, 10))
  return Math.max(0, Math.round((b.getTime() - a.getTime()) / (30.44 * 86_400_000)))
}

export function HistoriqueContrats({ contrats }: { contrats: Contrat[] }) {
  if (contrats.length === 0) {
    return <p className="text-sm text-km-faint">Aucun contrat ne couvre ce compteur.</p>
  }

  const aujourdhui = new Date().toISOString().slice(0, 10)

  /* L'ORDRE EST CHRONOLOGIQUE, et c'est tout l'objet de l'écran. Les contrats sans date de début
     ferment la marche : ils n'ont pas de place dans une chronologie, mais les taire reviendrait à
     cacher un contrat qui couvre bel et bien ce compteur. */
  const ordonnes = [...contrats].sort((a, b) => {
    if (!a.date_debut) return 1
    if (!b.date_debut) return -1
    return a.date_debut.localeCompare(b.date_debut)
  })

  const enCours = ordonnes.filter(
    (c) => statutVieContrat(c.date_debut, c.date_fin, aujourdhui, c.date_resiliation) === 'EN_COURS',
  )

  return (
    <div className="flex flex-col gap-2.5">
      {/* CE QUE LA FRISE RÉSUME AVANT DE LA LIRE : la question de William en une ligne. */}
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-0.5">
        <span className="text-km-xs font-bold uppercase tracking-wide text-km-faint">
          Historique contractuel
        </span>
        <span className="font-mono text-km-xs text-km-muted">
          {ordonnes.length} contrat{ordonnes.length > 1 ? 's' : ''}
          {ordonnes[0]?.date_debut && ` · depuis ${annee(ordonnes[0].date_debut)}`}
        </span>
      </div>

      {/* DEUX CONTRATS EN COURS EN MÊME TEMPS : c'est l'anomalie, on la nomme au lieu de laisser
          deviner. 8 compteurs sont dans ce cas dans toute la base. */}
      {enCours.length > 1 && (
        <div className="rounded-km border border-km-amber-line bg-km-amber-soft px-3 py-2">
          <p className="text-km-label font-bold text-km-amber">
            {enCours.length} contrats en cours en même temps sur ce compteur
          </p>
          <p className="mt-0.5 text-km-label leading-snug text-km-text">
            Un compteur ne peut être fourni que par un contrat à la fois. L’un des deux porte
            probablement une date de fin qui n’a pas été mise à jour.
          </p>
        </div>
      )}

      <ol className="flex flex-col">
        {ordonnes.map((ct, i) => {
          const statut = statutVieContrat(ct.date_debut, ct.date_fin, aujourdhui, ct.date_resiliation)
          const ton = statut ? TONS[statut] : TONS.EXPIRE
          const precedent = ordonnes[i - 1]

          /* LE TROU SE MESURE ENTRE LA FIN DU PRÉCÉDENT ET LE DÉBUT DE CELUI-CI. Un jour d'écart est
             la normale — un contrat finit le 31, le suivant commence le 1er — donc on ne signale
             qu'à partir d'un mois entier, sans quoi la frise crierait au trou sur chaque relais. */
          const trou =
            precedent?.date_fin && ct.date_debut && precedent.date_fin < ct.date_debut
              ? moisEntre(precedent.date_fin, ct.date_debut)
              : 0

          return (
            <li key={ct.id}>
              {trou >= 1 && (
                <div className="flex items-center gap-3 pl-[7px]">
                  <span className="w-px self-stretch border-l border-dashed border-km-line" style={{ minHeight: 26 }} />
                  <span className="py-1 text-km-label text-km-faint">
                    {trou} mois sans contrat
                  </span>
                </div>
              )}

              <div className="flex gap-3">
                {/* LE RAIL : une pastille par contrat, un trait qui les relie. Le trait s'arrête au
                    dernier — il ne pend pas dans le vide sous le contrat le plus lointain. */}
                <div className="flex flex-col items-center">
                  <span
                    className="mt-4 h-[15px] w-[15px] flex-none rounded-full border-[3px] border-white"
                    style={{ background: ton.pastille, boxShadow: `0 0 0 1.5px ${ton.pastille}` }}
                  />
                  {i < ordonnes.length - 1 && <span className="w-px flex-1 bg-km-line" />}
                </div>

                <Link
                  to={`/contrats/${ct.id}`}
                  className="mb-2 min-w-0 flex-1 rounded-xl border border-km-line bg-white p-3 transition-colors hover:bg-km-bg/60"
                >
                  <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                    <span className="truncate text-sm font-bold text-km-text">
                      {ct.fournisseur_nom || 'Fournisseur inconnu'}
                    </span>
                    <span
                      className="rounded-full px-2 py-px text-km-label font-bold uppercase tracking-wide"
                      style={{ color: ton.texte, background: ton.fond, border: `1px solid ${ton.bordure}` }}
                    >
                      {ton.libelle}
                    </span>
                    <span className="flex-1" />
                    {ct.reference && (
                      <span className="font-mono text-km-xs text-km-faint">{ct.reference}</span>
                    )}
                  </div>
                  <p className="mt-0.5 font-mono text-km-xs text-km-muted">
                    {jourFr(ct.date_debut)} → {ct.date_fin ? jourFr(ct.date_fin) : 'sans échéance'}
                    {ct.date_resiliation && ` · résilié le ${jourFr(ct.date_resiliation)}`}
                  </p>
                </Link>
              </div>
            </li>
          )
        })}
      </ol>
    </div>
  )
}
