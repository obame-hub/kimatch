import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'
import {
  useTypesObjectifsClient,
  useObjectifsRecommandation,
  useBasculerObjectifClient,
  useDesignerObjectifPrioritaire,
} from '@/lib/data/objectifsClient'
import type { Recommandation } from '@/types/domain'

/**
 * Onglet « Commande du client » — ce que le client a demandé, dans ses termes.
 *
 * Deux blocs, ceux de la maquette : le contexte de la demande en texte libre, et les huit
 * objectifs cochables dont UN peut être désigné prioritaire (l'étoile). Jusqu'ici cette
 * information n'existait nulle part : le conseiller la gardait en tête ou la noyait dans le
 * commentaire interne, et personne d'autre ne savait ce que le client avait demandé.
 *
 * Le contexte s'enregistre à la sortie du champ et non à chaque frappe : une requête par
 * caractère sur un texte de plusieurs lignes n'a pas de sens.
 */

const DEGRADE_OR = 'linear-gradient(135deg,#8a4b2a,#cf9a5e)'

export function OngletCommandeClient({
  reco,
  peutModifier,
  onMajContexte,
  signaler,
}: {
  reco: Recommandation
  peutModifier: boolean
  onMajContexte: (texte: string | null) => Promise<void> | void
  signaler: (message: string) => void
}) {
  const { data: types } = useTypesObjectifsClient()
  const { data: objectifs } = useObjectifsRecommandation(reco.id)
  const basculer = useBasculerObjectifClient()
  const designerPrioritaire = useDesignerObjectifPrioritaire()

  const [contexte, setContexte] = useState(reco.contexte_demande ?? '')

  // Le champ suit la donnée quand elle change ailleurs (autre onglet, autre poste), sans écraser
  // une saisie en cours : on ne resynchronise que si la valeur enregistrée a bougé.
  useEffect(() => { setContexte(reco.contexte_demande ?? '') }, [reco.contexte_demande])

  const parType = new Map((objectifs ?? []).map((o) => [o.type_objectif_id, o]))
  const prioritaire = (objectifs ?? []).find((o) => o.prioritaire)

  /** Prioritaire d'abord, puis les cochés, puis les autres — l'ordre du design. */
  const chips = [...(types ?? [])].sort((a, b) => {
    const rang = (id: string) => {
      const o = parType.get(id)
      if (!o) return 2
      return o.prioritaire ? 0 : 1
    }
    return rang(a.id) - rang(b.id) || a.ordre - b.ordre
  })

  async function enregistrerContexte() {
    const valeur = contexte.trim()
    if (valeur === (reco.contexte_demande ?? '')) return
    try {
      await onMajContexte(valeur || null)
      signaler('✓ Contexte enregistré')
    } catch (e) {
      signaler(`Erreur : ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  async function basculerObjectif(typeId: string, libelle: string) {
    const actuel = parType.get(typeId)
    try {
      await basculer.mutateAsync({ recommandationId: reco.id, typeObjectifId: typeId, actif: !actuel })
      signaler(`${actuel ? '✗' : '✓'} ${libelle}`)
    } catch (e) {
      signaler(`Erreur : ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  async function basculerPriorite(typeId: string, libelle: string) {
    const dejaPrioritaire = parType.get(typeId)?.prioritaire
    try {
      await designerPrioritaire.mutateAsync({
        recommandationId: reco.id,
        typeObjectifId: dejaPrioritaire ? null : typeId,
      })
      signaler(dejaPrioritaire ? '☆ Priorité retirée' : `★ Objectif prioritaire : ${libelle}`)
    } catch (e) {
      signaler(`Erreur : ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  return (
    <div className="flex animate-kw-fade-slide flex-col gap-3.5">
      {/* ── CONTEXTE DE LA DEMANDE ── */}
      <div className="rounded-[13px] border border-kw-border bg-white px-[18px] py-3.5">
        <div className="mb-[11px] flex flex-wrap items-center gap-2">
          <span className="text-kw-xs font-bold uppercase tracking-[0.08em] text-kw-faint">Contexte de la demande</span>
          <span className="flex-1" />
          <span className="text-kw-xs text-kw-meta">
            demande du <b className="font-mono text-kw-ink">{new Date(reco.date_creation).toLocaleDateString('fr-FR')}</b>
          </span>
          {reco.conseiller && (
            <span className="text-kw-xs text-kw-meta">
              prise par <b className="font-semibold text-kw-purple">{reco.conseiller}</b>
            </span>
          )}
        </div>
        <textarea
          value={contexte}
          onChange={(e) => setContexte(e.target.value)}
          onBlur={enregistrerContexte}
          readOnly={!peutModifier}
          placeholder="Consigner la demande du client telle qu'exprimée…"
          className={cn(
            'min-h-[84px] w-full resize-y rounded-kw-xl border border-kw-border bg-kw-subtle px-[13px] py-[11px] text-kw-lg leading-[1.6] text-kw-ink outline-none placeholder:text-kw-faint',
            peutModifier && 'focus:border-[#8a4b2a] focus:bg-white focus:ring-[3px] focus:ring-[#b0763c]/10',
          )}
        />
      </div>

      {/* ── OBJECTIFS DU CLIENT ── */}
      <div className="rounded-[13px] border border-kw-border bg-white px-[18px] py-3.5">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <span className="text-kw-xs font-bold uppercase tracking-[0.08em] text-kw-faint">Objectifs du client</span>
          <span className="flex-1" />
          <span className="flex items-center gap-[11px] text-[9.5px] text-kw-meta">
            <span className="flex items-center gap-1">
              <span className="h-[11px] w-[11px] rounded-kw-xs" style={{ background: DEGRADE_OR }} />
              prioritaire
            </span>
            <span className="flex items-center gap-1">
              <span className="h-[11px] w-[11px] rounded-kw-xs border-[1.5px] border-[#dcc39c] bg-white" />
              secondaire
            </span>
          </span>
        </div>

        {chips.length === 0 ? (
          <p className="text-kw-base text-kw-faint">
            La liste des objectifs n'est pas chargée (table <span className="font-mono">types_objectifs_client</span>).
          </p>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            {chips.map((t) => {
              const o = parType.get(t.id)
              const coche = !!o
              const prio = !!o?.prioritaire
              return (
                <span
                  key={t.id}
                  className={cn(
                    'inline-flex items-center gap-2 rounded-kw-xl',
                    prio
                      ? 'px-[15px] py-2.5 text-kw-xl font-extrabold text-white shadow-[0_4px_12px_rgba(176,118,60,.32)]'
                      : coche
                        ? 'border-[1.5px] border-[#dcc39c] bg-white px-[13px] py-2 text-kw-md font-bold text-[#8a5f22]'
                        : 'border border-kw-border-subtle bg-kw-subtle px-[13px] py-2 text-kw-md font-semibold text-kw-faint',
                  )}
                  style={prio ? { background: DEGRADE_OR } : undefined}
                >
                  {/* Interrupteur, comme le design : la pastille et le libellé basculent tous deux. */}
                  <button
                    type="button"
                    disabled={!peutModifier}
                    onClick={() => basculerObjectif(t.id, t.libelle)}
                    title={coche ? 'Retirer cet objectif' : 'Ajouter cet objectif'}
                    className={cn('relative h-[15px] w-[26px] shrink-0 rounded-[9px] transition-colors', !peutModifier && 'cursor-default')}
                    style={{ background: coche ? (prio ? 'rgba(255,255,255,.35)' : '#0d7a5f') : '#dcdad5' }}
                  >
                    <span
                      className="absolute top-0.5 h-[11px] w-[11px] rounded-full bg-white shadow-[0_1px_3px_rgba(0,0,0,.25)] transition-[left]"
                      style={{ left: coche ? 13 : 2 }}
                    />
                  </button>
                  <button
                    type="button"
                    disabled={!peutModifier}
                    onClick={() => basculerObjectif(t.id, t.libelle)}
                    className={cn('select-none', peutModifier ? 'cursor-pointer' : 'cursor-default')}
                  >
                    {t.libelle}
                  </button>
                  {coche && peutModifier && (
                    <button
                      type="button"
                      onClick={() => basculerPriorite(t.id, t.libelle)}
                      title={prio ? 'Objectif prioritaire — cliquer pour retirer' : 'Désigner comme objectif prioritaire (un seul)'}
                      className={cn('ml-0.5 select-none leading-none', prio ? 'text-[15px] text-white' : 'text-[13px] text-[#cf9a5e]')}
                    >
                      {prio ? '★' : '☆'}
                    </button>
                  )}
                </span>
              )
            })}
          </div>
        )}

        {(objectifs ?? []).length > 0 && !prioritaire && (
          <p className="mt-2.5 text-kw-tiny text-kw-faint">
            Aucun objectif prioritaire désigné — l'étoile en signale un seul, celui qui décide de la
            stratégie.
          </p>
        )}
      </div>
    </div>
  )
}
