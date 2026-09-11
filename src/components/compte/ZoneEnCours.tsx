import { Link } from 'react-router-dom'
import { FileSignature, FileCheck2, AlertCircle } from 'lucide-react'
import { useDossiersEnCours, useSignaturesEnCours, type DossierEnCours } from '@/lib/data/ficheCompte'
import { eurosOu } from '@/lib/euros'
import { cn } from '@/lib/utils'

/**
 * ══ « EN COURS » — CE QUI EST LANCÉ, ET CE QUI N'AVANCE PAS ══
 *
 * William, 11/09/2026 : « une fonctionnalité de suivi des mandats en cours de signature […] même
 * chose pour les contrats […] une fonctionnalité de suivi des recommandations ouvertes ».
 *
 * ── LES SIGNATURES SONT DES VIGNETTES, PAS DES TABLEAUX ──
 *
 * Compté avant de dessiner : 8 comptes sur 2 782 ont un mandat parti à la signature, 21 un contrat.
 * Un tableau à cinq colonnes pour zéro ou une ligne est un gâchis ; une vignette « 1 contrat ·
 * envoyé il y a 4 j » dit la même chose en un dixième de la place. Elle se grise quand il n'y a
 * rien plutôt que de disparaître : « aucun mandat en attente » est une réponse à une question qu'on
 * se pose, pas un vide.
 *
 * ── LA COLONNE « PROCHAINE ACTION » DIT SURTOUT QUAND ELLE MANQUE ──
 *
 * Quatre dossiers ouverts sur cent quarante-deux portent une tâche. Lue comme un agenda, la colonne
 * serait vide à 97 %. Lue dans l'autre sens, elle devient le signal le plus utile de la zone : un
 * dossier ouvert sans prochaine action est un dossier que personne ne pilote. C'est pour cela que
 * l'absence est écrite en ambre et non en gris — c'est un manque, pas une donnée non renseignée.
 *
 * ── « ÉCHÉANCE » ET NON « CLÔTURE PRÉVUE » ──
 *
 * Il n'existe pas de date de clôture prévisionnelle en base. La date affichée est celle à laquelle
 * le pricing doit rendre son offre — la seule échéance réellement tenue sur un dossier ouvert. La
 * nommer « clôture prévue » serait promettre autre chose que ce qu'elle est.
 */

/** Les quatre colonnes de travail d'un dossier ouvert, avec leur teinte. */
const ETAPES: Record<string, { libelle: string; classe: string }> = {
  BROUILLON:             { libelle: 'Brouillon',       classe: 'bg-km-soft text-km-muted' },
  EN_CONSTRUCTION:       { libelle: 'En construction', classe: 'bg-km-blue-soft text-km-blue' },
  DISPONIBLE:            { libelle: 'Disponible',      classe: 'bg-km-green-soft text-km-green' },
  EN_DECISION:           { libelle: 'En décision',     classe: 'bg-km-amber-soft text-km-amber' },
  EN_CONTRACTUALISATION: { libelle: 'À signer',        classe: 'bg-km-green-soft text-km-green' },
  A_REACTIVER:           { libelle: 'À réactiver',     classe: 'bg-km-red-soft text-km-red' },
}

function joursDepuis(iso: string | null): number | null {
  if (!iso) return null
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000)
}

/**
 * Une vignette de signature.
 *
 * LE DÉLAI EST L'INFORMATION, PAS LE DÉCOMPTE. Un contrat parti à la signature, c'est normal ; un
 * contrat parti il y a trois semaines, c'est une relance. La vignette passe donc en ambre au-delà
 * de sept jours — le temps qu'on laisse raisonnablement à un signataire.
 */
function Vignette({
  icone: Icone, libelle, nombre, depuis,
}: {
  icone: typeof FileSignature
  libelle: string
  nombre: number
  depuis: string | null
}) {
  const jours = joursDepuis(depuis)
  const vide = nombre === 0
  const attendLongtemps = !vide && jours !== null && jours > 7

  return (
    <div className={cn(
      'flex items-center gap-3 rounded-[16px] px-4 py-3',
      vide ? 'bg-km-surface/60' : 'bg-km-surface',
      attendLongtemps && 'ring-1 ring-inset ring-km-amber/40',
    )}>
      <Icone
        className={cn('h-5 w-5 shrink-0', vide ? 'text-km-faint' : attendLongtemps ? 'text-km-amber' : 'text-km-blue')}
        strokeWidth={2.2}
      />
      <div className="min-w-0">
        <div className="flex items-baseline gap-1.5">
          <span className={cn(
            'text-[19px] font-bold leading-none tabular-nums',
            vide ? 'text-km-faint' : attendLongtemps ? 'text-km-amber' : 'text-km-text',
          )}>
            {nombre}
          </span>
          <span className={cn('truncate text-km-body font-medium', vide ? 'text-km-faint' : 'text-km-text')}>
            {libelle}{nombre > 1 ? 's' : ''}
          </span>
        </div>
        <div className="truncate text-km-label text-km-faint">
          {vide
            ? 'rien en attente'
            : jours === null ? 'envoyé, date inconnue'
            : jours <= 0 ? 'envoyé aujourd’hui'
            : `envoyé il y a ${jours} j`}
        </div>
      </div>
    </div>
  )
}

/** La prochaine action d'un dossier — ou son absence, qui est le vrai signal. */
function ProchaineAction({ d }: { d: DossierEnCours }) {
  if (!d.action_titre) {
    return (
      <span className="inline-flex items-center gap-1.5 text-km-label font-medium text-km-amber">
        <AlertCircle className="h-3.5 w-3.5 shrink-0" strokeWidth={2.4} />
        aucune
      </span>
    )
  }
  return (
    <span className="flex min-w-0 flex-col leading-tight">
      <span className="truncate text-km-body text-km-text" title={d.action_titre}>{d.action_titre}</span>
      {d.action_echeance && (
        <span className={cn('text-km-tiny tabular-nums', d.action_en_retard ? 'font-semibold text-km-red' : 'text-km-faint')}>
          {new Date(d.action_echeance).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' })}
          {d.action_en_retard && ' · en retard'}
        </span>
      )}
    </span>
  )
}

export function ZoneEnCours({ compteId }: { compteId: string }) {
  const { data: dossiers, isLoading: chargeDossiers } = useDossiersEnCours(compteId)
  const { data: signatures, isLoading: chargeSignatures } = useSignaturesEnCours(compteId)

  const enAttente = (signatures?.mandats_n ?? 0) + (signatures?.contrats_n ?? 0)
  const rien = (dossiers?.length ?? 0) === 0 && enAttente === 0

  // Rien de lancé, rien à l'écran — même règle que « À traiter ».
  if (chargeDossiers || chargeSignatures || rien) return null

  const sansAction = (dossiers ?? []).filter((d) => !d.action_titre).length
  const enRetard = (dossiers ?? []).filter((d) => d.jours_restants !== null && d.jours_restants < 0).length

  const synthese = [
    dossiers?.length ? `${dossiers.length} dossier${dossiers.length > 1 ? 's' : ''} ouvert${dossiers.length > 1 ? 's' : ''}` : null,
    sansAction > 0 ? `${sansAction} sans prochaine action` : null,
    enRetard > 0 ? `${enRetard} au-delà de la date souhaitée` : null,
  ].filter(Boolean).join(' · ')

  return (
    <section
      aria-labelledby="zone-en-cours"
      className="rounded-[22px] bg-[#EDF1F7] p-2.5 ring-1 ring-inset ring-[#DCE5EF] sm:p-3"
    >
      <div className="mb-2.5 flex flex-wrap items-baseline gap-x-2.5 gap-y-0.5 px-1.5">
        <h2 id="zone-en-cours" className="text-km-name font-semibold text-[#25496B]">En cours</h2>
        <p className="min-w-0 truncate text-km-body text-km-muted">{synthese}</p>
      </div>

      <div className="grid gap-2.5 lg:grid-cols-[minmax(0,1fr)_230px]">
        {/* ══ LES DOSSIERS ══ */}
        {dossiers && dossiers.length > 0 ? (
          <div className="min-w-0 overflow-hidden rounded-[16px] bg-km-surface">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] table-fixed border-collapse text-km-body">
                <colgroup>
                  <col style={{ width: '32%' }} />
                  <col style={{ width: '20%' }} />
                  <col style={{ width: '14%' }} />
                  <col style={{ width: '14%' }} />
                  <col style={{ width: '20%' }} />
                </colgroup>
                <thead>
                  <tr className="border-b border-km-line bg-km-bg text-km-tiny font-bold uppercase tracking-[.08em] text-km-faint">
                    <th className="px-3 py-2 text-left font-bold">Recommandation</th>
                    <th className="px-3 py-2 text-left font-bold">Étape</th>
                    <th className="px-3 py-2 text-right font-bold">Montant</th>
                    <th className="px-3 py-2 text-left font-bold">Échéance</th>
                    <th className="px-3 py-2 text-left font-bold">Prochaine action</th>
                  </tr>
                </thead>
                <tbody>
                  {dossiers.map((d) => {
                    const e = ETAPES[d.colonne_travail] ?? { libelle: d.colonne_travail, classe: 'bg-km-soft text-km-muted' }
                    const depasse = d.jours_restants !== null && d.jours_restants < 0
                    return (
                      <tr
                        key={d.recommandation_id}
                        /* Le liseré marque les dossiers qui ont dépassé leur date : c'est la même
                           grammaire que les deux autres zones de la page. */
                        style={depasse ? { boxShadow: 'inset 3px 0 0 0 rgb(var(--km-red))' } : undefined}
                        className="border-b border-km-line/55 transition-colors last:border-b-0 hover:bg-km-bg"
                      >
                        <td className="truncate py-2 pl-4 pr-3">
                          <Link
                            to={`/recommandations/${d.recommandation_id}`}
                            title={d.nom}
                            className="font-medium text-km-text hover:text-km-green hover:underline"
                          >
                            {d.nom}
                          </Link>
                        </td>
                        <td className="px-3">
                          <span className={cn('inline-flex max-w-full items-center truncate whitespace-nowrap rounded-km px-2 py-[3px] text-km-label font-semibold', e.classe)}>
                            {e.libelle}
                          </span>
                        </td>
                        <td className="px-3 text-right font-mono tabular-nums text-km-text">
                          {eurosOu(d.montant)}
                        </td>
                        <td className="px-3 py-2">
                          {d.date_souhaitee ? (
                            <span className="flex flex-col leading-tight">
                              <span className={cn('tabular-nums', depasse ? 'font-semibold text-km-red' : 'text-km-text')}>
                                {new Date(d.date_souhaitee).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit' })}
                              </span>
                              {d.jours_restants !== null && (
                                <span className="text-km-tiny text-km-faint">
                                  {depasse ? `+${Math.abs(d.jours_restants)} j` : `dans ${d.jours_restants} j`}
                                </span>
                              )}
                            </span>
                          ) : <span className="text-km-faint">—</span>}
                        </td>
                        <td className="min-w-0 px-3 py-2"><ProchaineAction d={d} /></td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-center rounded-[16px] bg-km-surface px-6 py-8 text-center text-km-body text-km-muted">
            Aucun dossier ouvert sur ce compte.
          </div>
        )}

        {/* ══ LES SIGNATURES ══ */}
        <div className="grid content-start gap-2.5 sm:grid-cols-2 lg:grid-cols-1">
          <Vignette
            icone={FileSignature}
            libelle="mandat à signer"
            nombre={signatures?.mandats_n ?? 0}
            depuis={signatures?.mandats_depuis ?? null}
          />
          <Vignette
            icone={FileCheck2}
            libelle="contrat à signer"
            nombre={signatures?.contrats_n ?? 0}
            depuis={signatures?.contrats_depuis ?? null}
          />
        </div>
      </div>
    </section>
  )
}
