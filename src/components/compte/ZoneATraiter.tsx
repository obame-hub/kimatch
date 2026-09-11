import { Link } from 'react-router-dom'
import { Flame, Zap, Plus, ArrowRight } from 'lucide-react'
import { useEcheancesATraiter, type EcheanceATraiter } from '@/lib/data/echeancesATraiter'
import { cn } from '@/lib/utils'

/**
 * ══ « À TRAITER » — CE QUE CE COMPTE VA PERDRE SI PERSONNE NE BOUGE ══
 *
 * William, 11/09/2026 : « il est très important d'avoir des infos sur ce qui doit être fait sur ce
 * compte […] ressortir les urgences à traiter vis-à-vis des échéances ».
 *
 * Les compteurs dont le contrat tombe dans l'année ET sur lesquels rien n'est lancé. Sur les 2 782
 * comptes actifs, 541 en ont au moins un — 969 compteurs au total.
 *
 * ── LA ZONE N'EXISTE QUE SI ELLE A QUELQUE CHOSE À DIRE ──
 *
 * Rien à traiter, rien à l'écran. C'est le parti pris de toute la page, et il vient d'un comptage :
 * quatre comptes sur cinq n'ont aucune échéance en souffrance. Un cadre vide occupe autant de place
 * qu'un cadre plein tout en n'apprenant rien, et il use le signal — on finit par ne plus regarder
 * une zone qu'on a vue vide vingt fois.
 *
 * ── DEUX CHIFFRES, ET LE SECOND EST CELUI QUI COMPTE ──
 *
 * Le NOMBRE de compteurs dit l'ampleur du travail. Les MÉGAWATTHEURES disent ce qu'il y a à perdre,
 * et ce n'est pas la même échelle : vingt-deux petits compteurs de copropriété ne valent pas deux
 * gros sites industriels. À l'écran, le volume est aussi gros que le décompte pour cette raison.
 *
 * ── LE ROUGE EST RÉSERVÉ AUX TROIS MOIS ──
 *
 * Une échéance à onze mois n'est pas une urgence, c'est un plan de charge : elle s'affiche en ambre.
 * Tout peindre en rouge sous prétexte que tout est « dans l'année » rendrait le rouge muet au moment
 * où il devrait crier. Le seuil des trois mois est celui du cycle de consultation : en deçà, il
 * devient difficile de consulter, négocier et signer avant la bascule.
 */

/** Au-delà, on compte en tête plutôt que d'allonger la liste — le détail est dans l'onglet. */
const LIGNES_VISIBLES = 5

/** Le seuil où une échéance cesse d'être un plan de charge pour devenir une urgence. */
const JOURS_URGENCE = 92

function Energie({ type }: { type: string | null }) {
  if (!type) return <span className="text-km-faint">—</span>
  const gaz = type.toUpperCase().startsWith('GAZ')
  const Icone = gaz ? Flame : Zap
  return (
    <span className={cn(
      'inline-flex items-center gap-1.5 rounded-km px-2 py-[3px] text-km-label font-semibold',
      gaz ? 'bg-km-amber-soft text-km-amber' : 'bg-km-blue-soft text-km-blue',
    )}>
      <Icone className="h-3.5 w-3.5 shrink-0" strokeWidth={2.3} />
      {gaz ? 'Gaz' : 'Électricité'}
    </span>
  )
}

/**
 * L'échéance, et ce qu'il en reste.
 *
 * LES DEUX SE LISENT ENSEMBLE : la date répond à « quand », les jours à « est-ce que c'est
 * maintenant ». Une date seule oblige à compter de tête, un délai seul empêche de planifier.
 */
function Echeance({ e }: { e: EcheanceATraiter }) {
  const urgent = e.jours_restants <= JOURS_URGENCE
  return (
    <span className="flex flex-col leading-tight">
      <span className={cn('font-semibold tabular-nums', urgent ? 'text-km-red' : 'text-km-amber')}>
        {new Date(e.date_echeance).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit' })}
      </span>
      <span className="text-km-tiny text-km-faint">
        {e.jours_restants <= 0 ? 'aujourd’hui' : `dans ${e.jours_restants} j`}
      </span>
    </span>
  )
}

export function ZoneATraiter({
  compteId,
  onCreerOpportunite,
}: {
  compteId: string
  /** Ouvre le formulaire d'opportunité de la fiche — le même que celui du hub de création. */
  onCreerOpportunite?: () => void
}) {
  const { data: echeances, isLoading } = useEcheancesATraiter(compteId)

  // RIEN À TRAITER, RIEN À L'ÉCRAN — voir l'en-tête. Pendant le chargement non plus : une zone qui
  // apparaît puis disparaît fait sauter la page sous les yeux.
  if (isLoading || !echeances || echeances.length === 0) return null

  const volume = echeances.reduce((t, e) => t + (e.consommation ?? 0), 0)
  const premiere = echeances[0]
  const visibles = echeances.slice(0, LIGNES_VISIBLES)
  const reste = echeances.length - visibles.length

  return (
    <section
      aria-labelledby="zone-a-traiter"
      className="rounded-[22px] bg-[#FBEDEA] p-2.5 ring-1 ring-inset ring-[#F2D9D3] sm:p-3"
    >
      {/* LE TITRE PORTE DÉJÀ LE DIAGNOSTIC. « À traiter » seul obligerait à lire le tableau pour
          savoir de quoi il s'agit ; la phrase le dit avant, avec ses deux chiffres. */}
      <div className="mb-2.5 flex flex-wrap items-baseline gap-x-2.5 gap-y-0.5 px-1.5">
        <h2 id="zone-a-traiter" className="text-km-name font-semibold text-[#8E3A30]">À traiter</h2>
        <p className="min-w-0 truncate text-km-body text-km-muted">
          {echeances.length} compteur{echeances.length > 1 ? 's' : ''} arrive{echeances.length > 1 ? 'nt' : ''} à
          échéance sans rien de lancé
          {premiere.jours_restants <= JOURS_URGENCE && (
            <> · la première dans {premiere.jours_restants <= 0 ? '0 jour' : `${premiere.jours_restants} jours`}</>
          )}
        </p>
      </div>

      <div className="grid gap-2.5 lg:grid-cols-[160px_minmax(0,1fr)]">
        {/* ══ LES DEUX MESURES ══ */}
        <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-1">
          {/* `justify-center` : les deux tuiles s'étirent à la hauteur du tableau voisin, et sans
              ancrage leur chiffre resterait collé en haut d'un bloc à moitié vide. */}
          <div className="flex flex-col justify-center rounded-[16px] bg-km-surface px-4 py-3">
            <div className="text-[28px] font-bold leading-none tracking-[-.04em] tabular-nums text-km-red">
              {echeances.length}
            </div>
            <div className="mt-1 text-km-label font-semibold text-km-muted">Sans rien de lancé</div>
          </div>
          <div className="flex flex-col justify-center rounded-[16px] bg-km-surface px-4 py-3">
            {/* LE VOLUME EST AUSSI GROS QUE LE DÉCOMPTE, et c'est délibéré : c'est lui qui dit ce
                qu'il y a à perdre. Arrondi au mégawattheure — le kilowattheure près n'aide pas à
                décider s'il faut appeler le client cette semaine. */}
            <div className="text-[28px] font-bold leading-none tracking-[-.04em] tabular-nums text-km-red">
              {Math.round(volume).toLocaleString('fr-FR')}
            </div>
            <div className="mt-1 text-km-label font-semibold text-km-muted">MWh en jeu</div>
          </div>
        </div>

        {/* ══ LE DÉTAIL ══ */}
        <div className="min-w-0 overflow-hidden rounded-[16px] bg-km-surface">
          <div className="flex items-center gap-2.5 border-b border-km-line px-4 py-2.5">
            <h3 className="truncate text-km-body font-semibold text-km-text">Échéances sans rien de lancé</h3>
            {onCreerOpportunite && (
              <button
                type="button"
                onClick={onCreerOpportunite}
                className="ml-auto flex shrink-0 items-center gap-1.5 rounded-full bg-km-green px-3 py-1 text-km-label font-semibold text-white transition-colors hover:bg-km-green/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-km-green/45"
              >
                <Plus className="h-3.5 w-3.5" strokeWidth={2.6} />
                Créer une opportunité
              </button>
            )}
          </div>

          <div className="overflow-x-auto">
            {/* `table-fixed` ET DES LARGEURS EN POURCENTAGE, sans quoi le navigateur distribue la
                place au prorata du contenu : le numéro de PDL, long et sans espace, mangeait la
                colonne du site, qui s'affichait « SDC … ». Un site tronqué à trois caractères ne
                sert à rien — c'est pourtant lui qui dit de quel immeuble on parle. */}
            <table className="w-full min-w-[620px] table-fixed border-collapse text-km-body">
              <colgroup>
                <col style={{ width: '27%' }} />
                <col style={{ width: '30%' }} />
                <col style={{ width: '17%' }} />
                <col style={{ width: '11%' }} />
                <col style={{ width: '15%' }} />
              </colgroup>
              <thead>
                <tr className="border-b border-km-line bg-km-bg text-km-tiny font-bold uppercase tracking-[.08em] text-km-faint">
                  <th className="px-3 py-2 text-left font-bold">Point de livraison</th>
                  <th className="px-3 py-2 text-left font-bold">Site</th>
                  <th className="px-3 py-2 text-left font-bold">Énergie</th>
                  <th className="px-3 py-2 text-right font-bold">MWh</th>
                  <th className="px-3 py-2 text-left font-bold">Échéance</th>
                </tr>
              </thead>
              <tbody>
                {visibles.map((e) => (
                  <tr
                    key={e.compteur_id}
                    /* LE LISERÉ DIT L'URGENCE AU BORD DE LA LIGNE, là où l'œil y entre — même
                       grammaire que les deux tableaux du tableau de bord. */
                    style={{ boxShadow: `inset 3px 0 0 0 ${e.jours_restants <= JOURS_URGENCE ? 'rgb(var(--km-red))' : 'rgb(var(--km-amber))'}` }}
                    className="border-b border-km-line/55 transition-colors last:border-b-0 hover:bg-km-bg"
                  >
                    <td className="truncate py-2 pl-4 pr-3">
                      <Link
                        to={`/compteurs/${e.compteur_id}`}
                        title={e.numero_point}
                        className="font-mono font-medium tabular-nums text-km-text hover:text-km-green hover:underline"
                      >
                        {e.numero_point}
                      </Link>
                    </td>
                    <td className="truncate px-3 text-km-muted" title={e.site_nom ?? undefined}>
                      {e.site_nom ?? '—'}
                    </td>
                    <td className="px-3"><Energie type={e.type_energie} /></td>
                    <td className="px-3 text-right font-mono tabular-nums text-km-text">
                      {e.consommation == null ? '—' : Math.round(e.consommation).toLocaleString('fr-FR')}
                    </td>
                    <td className="px-3 py-2"><Echeance e={e} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* LE RESTE N'EST PAS MASQUÉ, IL EST COMPTÉ. Dérouler vingt-deux lignes ici ferait de la
              zone d'alerte un second onglet Compteurs ; les cinq premières suffisent à décider
              d'agir, et le lien mène à la liste entière. */}
          {reste > 0 && (
            <div className="flex items-center gap-1.5 border-t border-km-line px-4 py-2 text-km-label text-km-muted">
              + {reste} autre{reste > 1 ? 's' : ''}
              <Link
                to={`/comptes/${compteId}?tab=compteurs`}
                className="ml-auto inline-flex items-center gap-1 font-semibold text-km-green hover:underline"
              >
                Tout voir dans Compteurs
                <ArrowRight className="h-3.5 w-3.5" strokeWidth={2.4} />
              </Link>
            </div>
          )}
        </div>
      </div>
    </section>
  )
}
