import { useState } from 'react'
import { Plus, Trash2, Star, Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  useAjouterOffre,
  useUpdateOffrePartiel,
  useSupprimerOffre,
  useRetenirOffre,
  libelleOffre,
  type PatchOffre,
} from '@/lib/data/recommandations'
import type { FournisseurConsulte, OffreFournisseur } from '@/types/domain'

/**
 * Les offres d'UN fournisseur consulté.
 *
 * « Il faut qu'on voie sous chaque fournisseur consulté la ou les offres différentes, sinon la
 * version ne sert à rien » (Michel, 17/08/2026). Un fournisseur interrogé sur 24 et 36 mois, en fixe
 * et en indexé, peut répondre plusieurs offres : c'est entre elles qu'on arbitre, et l'une d'elles
 * est retenue — celle que lit le comparatif des versions.
 *
 * La grille est créée dès la consultation, une ligne par combinaison demandée, au statut ENVOYEE et
 * sans montant : chaque ligne est une réponse attendue. Le conseiller saisit le prix quand le mail
 * arrive, en cliquant sur le pointillé — pas de modale, pas de formulaire à ouvrir.
 *
 * CE QUI SE SAISIT ICI ET PAS AILLEURS : le prix €/MWh et le montant annuel sont ceux que le
 * fournisseur ANNONCE. Le détail par PDL (`offres_fournisseurs_compteurs`) est un autre niveau, plus
 * fin, qui n'est pas encore alimenté — quand il le sera, il précisera ces chiffres sans les
 * remplacer.
 */

const STATUTS = [
  ['ENVOYEE', 'Envoyée'],
  ['ACCUSE_RECEPTION', 'Accusé de réception'],
  ['RELANCEE', 'Relancée'],
  ['INFO_COMPLEMENTAIRE_DEMANDEE', 'Info demandée'],
  ['RECUE', 'Reçue'],
  ['REFUSEE', 'Refusée'],
] as const

const TON_STATUT: Record<string, string> = {
  ENVOYEE: 'bg-kw-muted text-kw-meta',
  ACCUSE_RECEPTION: 'bg-kw-blue-light text-kw-blue',
  RELANCEE: 'bg-kw-amber-light text-kw-amber-dark',
  INFO_COMPLEMENTAIRE_DEMANDEE: 'bg-kw-amber-light text-kw-amber-dark',
  RECUE: 'bg-kw-green-light text-kw-green',
  REFUSEE: 'bg-kw-red-light text-kw-red',
}

/** Saisie en place d'un nombre : pointillé cliquable, Entrée valide, Échap annule. */
function ChampNombre({
  valeur,
  suffixe,
  placeholder,
  decimales,
  onCommit,
  peutModifier,
  titre,
}: {
  valeur: number | null | undefined
  suffixe: string
  placeholder: string
  decimales?: number
  onCommit: (v: number | null) => void
  peutModifier: boolean
  titre: string
}) {
  const [edition, setEdition] = useState(false)
  const [brouillon, setBrouillon] = useState('')

  const affiche =
    valeur != null
      ? `${valeur.toLocaleString('fr-FR', { maximumFractionDigits: decimales ?? 0 })} ${suffixe}`
      : placeholder

  function commettre() {
    setEdition(false)
    const brut = brouillon.trim().replace(/\s/g, '').replace(',', '.')
    if (brut === '') return onCommit(null)
    const n = Number.parseFloat(brut)
    if (!Number.isFinite(n) || n < 0) return
    onCommit(n)
  }

  if (edition) {
    return (
      <input
        autoFocus
        value={brouillon}
        onChange={(e) => setBrouillon(e.target.value)}
        onBlur={commettre}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commettre()
          if (e.key === 'Escape') setEdition(false)
        }}
        placeholder={suffixe}
        className="w-[86px] rounded-kw-sm border border-kw-green bg-white px-1.5 py-0.5 font-mono text-kw-base font-bold text-kw-ink outline-none ring-[3px] ring-kw-green/10"
      />
    )
  }
  return (
    <button
      type="button"
      disabled={!peutModifier}
      title={peutModifier ? `${titre} — cliquer pour saisir` : titre}
      onClick={() => { setBrouillon(valeur != null ? String(valeur) : ''); setEdition(true) }}
      className={cn(
        'font-mono text-kw-base',
        peutModifier && 'cursor-text border-b border-dashed border-[#d9d0bd]',
        valeur != null ? 'font-bold text-kw-ink' : 'text-kw-ghost',
      )}
    >
      {affiche}
    </button>
  )
}

export function OffresDuFournisseur({
  fournisseur,
  optimisationId,
  dureesDemandees,
  typesPrixDemandes,
  peutModifier,
  signaler,
}: {
  fournisseur: FournisseurConsulte
  optimisationId: string
  /** Durées demandées à la consultation — proposées en premier à l'ajout d'une offre. */
  dureesDemandees: number[]
  typesPrixDemandes: string[]
  peutModifier: boolean
  signaler: (message: string) => void
}) {
  const ajouter = useAjouterOffre()
  const majOffre = useUpdateOffrePartiel()
  const supprimer = useSupprimerOffre()
  const retenir = useRetenirOffre()
  const [ajoutOuvert, setAjoutOuvert] = useState(false)
  const [nouvelleDuree, setNouvelleDuree] = useState<string>(String(dureesDemandees[0] ?? 36))
  const [nouveauType, setNouveauType] = useState<string>(typesPrixDemandes[0] ?? 'Fixe')

  const offres = fournisseur.offres

  async function patcher(offre: OffreFournisseur, patch: PatchOffre, message: string) {
    try {
      await majOffre.mutateAsync({ offreId: offre.id, patch })
      signaler(message)
    } catch (e) {
      signaler(`Erreur : ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  return (
    <div className="mt-1.5 space-y-1.5">
      {offres.length === 0 ? (
        <p className="text-kw-base text-kw-faint">
          Aucune offre attendue enregistrée pour ce fournisseur.
          {peutModifier && ' Ajoutez-en une dès qu\'il répond.'}
        </p>
      ) : (
        offres.map((offre) => {
          const recue = offre.statut === 'RECUE'
          const refusee = offre.statut === 'REFUSEE'
          return (
            <div
              key={offre.id}
              className={cn(
                'rounded-kw-md border px-2.5 py-2',
                offre.est_offre_recommandee
                  ? 'border-[#dcc39c] bg-[#fdf9f0]'
                  : refusee
                    ? 'border-kw-border-subtle bg-kw-subtle opacity-70'
                    : 'border-kw-border-subtle bg-white',
              )}
            >
              <div className="flex flex-wrap items-center gap-2">
                {/* Ce qui distingue l'offre : durée et type de prix. Tous deux modifiables — un
                    fournisseur répond parfois sur une durée qu'on ne lui a pas demandée. */}
                <span className="font-mono text-kw-md font-extrabold text-kw-ink">
                  {libelleOffre(offre.duree_mois, offre.type_prix)}
                </span>

                {peutModifier ? (
                  <select
                    value={offre.statut ?? 'ENVOYEE'}
                    onChange={(e) => patcher(offre, { statut: e.target.value }, `✓ ${libelleOffre(offre.duree_mois, offre.type_prix)} : ${STATUTS.find(([c]) => c === e.target.value)?.[1]}`)}
                    className={cn(
                      'rounded-kw-xs border-0 px-1.5 py-0.5 text-kw-micro font-extrabold uppercase tracking-[0.05em] outline-none',
                      TON_STATUT[offre.statut ?? 'ENVOYEE'] ?? 'bg-kw-muted text-kw-meta',
                    )}
                  >
                    {STATUTS.map(([code, libelle]) => (
                      <option key={code} value={code}>{libelle}</option>
                    ))}
                  </select>
                ) : (
                  <span
                    className={cn(
                      'rounded-kw-xs px-1.5 py-0.5 text-kw-micro font-extrabold uppercase tracking-[0.05em]',
                      TON_STATUT[offre.statut ?? 'ENVOYEE'] ?? 'bg-kw-muted text-kw-meta',
                    )}
                  >
                    {STATUTS.find(([c]) => c === offre.statut)?.[1] ?? offre.statut ?? 'Envoyée'}
                  </span>
                )}

                <span className="flex-1" />

                {peutModifier && (
                  <>
                    <button
                      type="button"
                      title={offre.est_offre_recommandee ? 'Offre retenue — cliquer pour ne plus la retenir' : 'Retenir cette offre : c\'est elle que reprend le comparatif des versions'}
                      onClick={async () => {
                        try {
                          await retenir.mutateAsync({ optimisationId, offreId: offre.est_offre_recommandee ? null : offre.id })
                          signaler(
                            offre.est_offre_recommandee
                              ? '☆ Offre retenue retirée'
                              : `★ Offre retenue : ${fournisseur.fournisseur_nom} ${libelleOffre(offre.duree_mois, offre.type_prix)}`,
                          )
                        } catch (e) {
                          signaler(`Erreur : ${e instanceof Error ? e.message : String(e)}`)
                        }
                      }}
                      className={cn(
                        'inline-flex items-center gap-1 rounded-kw-sm px-1.5 py-0.5 text-kw-micro font-extrabold uppercase tracking-[0.05em]',
                        offre.est_offre_recommandee
                          ? 'bg-[#8a4b2a] text-white'
                          : 'border border-kw-border-strong bg-white text-kw-meta hover:bg-kw-bg',
                      )}
                    >
                      <Star className={cn('h-2.5 w-2.5', offre.est_offre_recommandee && 'fill-current')} />
                      {offre.est_offre_recommandee ? 'Retenue' : 'Retenir'}
                    </button>
                    <button
                      type="button"
                      title="Supprimer cette offre"
                      onClick={async () => {
                        try {
                          await supprimer.mutateAsync(offre.id)
                          signaler('Offre supprimée')
                        } catch (e) {
                          signaler(`Erreur : ${e instanceof Error ? e.message : String(e)}`)
                        }
                      }}
                      className="rounded-kw-sm p-0.5 text-kw-ghost hover:bg-kw-red-light hover:text-kw-red"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </>
                )}
              </div>

              {/* Les chiffres de l'offre. Affichés même vides, en pointillé : sans quoi rien
                  n'indique qu'ils se saisissent ici. */}
              <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1">
                <span className="flex items-center gap-1.5">
                  <span className="text-kw-tiny uppercase tracking-[0.05em] text-kw-faint">Prix</span>
                  <ChampNombre
                    valeur={offre.prix_moyen_mwh}
                    suffixe="€/MWh"
                    placeholder="— €/MWh"
                    decimales={2}
                    titre="Prix annoncé par le fournisseur"
                    peutModifier={peutModifier}
                    onCommit={(v) => patcher(offre, { prix_moyen_mwh: v }, v != null ? `✓ Prix : ${v.toLocaleString('fr-FR')} €/MWh` : 'Prix effacé')}
                  />
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="text-kw-tiny uppercase tracking-[0.05em] text-kw-faint">Budget</span>
                  <ChampNombre
                    valeur={offre.montant_annuel_ht}
                    suffixe="€/an"
                    placeholder="— €/an"
                    titre="Montant annuel HT de l'offre"
                    peutModifier={peutModifier}
                    onCommit={(v) => patcher(offre, { montant_annuel_ht: v }, v != null ? `✓ Budget : ${v.toLocaleString('fr-FR')} €/an` : 'Budget effacé')}
                  />
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="text-kw-tiny uppercase tracking-[0.05em] text-kw-faint">Économie</span>
                  <ChampNombre
                    valeur={offre.economie_annuelle_estimee}
                    suffixe="€/an"
                    placeholder="— €/an"
                    titre="Économie annuelle estimée face au contrat actuel"
                    peutModifier={peutModifier}
                    onCommit={(v) => patcher(offre, { economie_annuelle_estimee: v }, v != null ? `✓ Économie : ${v.toLocaleString('fr-FR')} €/an` : 'Économie effacée')}
                  />
                </span>
                {recue && offre.prix_moyen_mwh == null && offre.montant_annuel_ht == null && (
                  // Une offre marquée reçue sans aucun chiffre est une contradiction visible : on le
                  // signale plutôt que de la laisser passer pour renseignée.
                  <span className="text-kw-tiny font-semibold text-kw-amber-dark">
                    marquée reçue, mais aucun chiffre saisi
                  </span>
                )}
              </div>
            </div>
          )
        })
      )}

      {peutModifier && (
        ajoutOuvert ? (
          <div className="flex flex-wrap items-center gap-2 rounded-kw-md border border-dashed border-[#dcc39c] bg-kw-amber-light px-2.5 py-2">
            <span className="text-kw-base text-kw-label">Offre supplémentaire :</span>
            <input
              type="number"
              min={1}
              max={60}
              value={nouvelleDuree}
              onChange={(e) => setNouvelleDuree(e.target.value.replace(/\D/g, ''))}
              className="w-16 rounded-kw-sm border border-kw-border-strong bg-white px-1.5 py-0.5 font-mono text-kw-base text-kw-ink outline-none"
            />
            <span className="text-kw-base text-kw-meta">mois</span>
            <select
              value={nouveauType}
              onChange={(e) => setNouveauType(e.target.value)}
              className="rounded-kw-sm border border-kw-border-strong bg-white px-1.5 py-0.5 text-kw-base text-kw-ink outline-none"
            >
              {[...new Set([...typesPrixDemandes, 'Fixe', 'Indexé'])].map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
            <span className="flex-1" />
            <button
              type="button"
              onClick={() => setAjoutOuvert(false)}
              className="rounded-kw-sm px-2 py-0.5 text-kw-base font-semibold text-kw-meta hover:bg-white"
            >
              Annuler
            </button>
            <button
              type="button"
              disabled={ajouter.isPending || !nouvelleDuree}
              onClick={async () => {
                const duree = Number(nouvelleDuree)
                if (!Number.isFinite(duree) || duree < 1 || duree > 60) return signaler('Durée attendue entre 1 et 60 mois')
                // Doublon : deux offres identiques du même fournisseur ne veulent rien dire, et la
                // base ne l'interdit pas — c'est ici que ça se joue.
                if (offres.some((o) => o.duree_mois === duree && (o.type_prix ?? null) === nouveauType)) {
                  return signaler(`${libelleOffre(duree, nouveauType)} existe déjà pour ce fournisseur`)
                }
                try {
                  await ajouter.mutateAsync({
                    optimisationId,
                    optimisationFournisseurId: fournisseur.id,
                    fournisseurCompteId: fournisseur.fournisseur_compte_id,
                    duree_mois: duree,
                    type_prix: nouveauType,
                  })
                  setAjoutOuvert(false)
                  signaler(`＋ ${libelleOffre(duree, nouveauType)} ajoutée pour ${fournisseur.fournisseur_nom}`)
                } catch (e) {
                  signaler(`Erreur : ${e instanceof Error ? e.message : String(e)}`)
                }
              }}
              className="inline-flex items-center gap-1 rounded-kw-sm bg-[#8a4b2a] px-2 py-0.5 text-kw-base font-bold text-white disabled:opacity-60"
            >
              <Check className="h-3 w-3" /> Ajouter
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setAjoutOuvert(true)}
            className="inline-flex items-center gap-1 text-kw-base font-semibold text-kw-green hover:underline"
          >
            <Plus className="h-3 w-3" /> Ajouter une offre de {fournisseur.fournisseur_nom}
          </button>
        )
      )}
    </div>
  )
}
