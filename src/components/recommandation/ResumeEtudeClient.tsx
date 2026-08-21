import { useMemo } from 'react'
import { cn } from '@/lib/utils'
import { CarteOffreEtude } from './CarteOffreEtude'
import { useObjectifsRecommandation } from '@/lib/data/objectifsClient'
import type { Compteur, OffreFournisseur, Recommandation, VersionRecommandation } from '@/types/domain'

/**
 * Le résumé de l'étude, avant le comparatif d'offres.
 *
 * REPRIS DE LA MAQUETTE DE WILLIAM (« Etude Client.dc.html », onglet Résumé). Michel, 19/08/2026 :
 * « on peut faire le résumé, le comparatif » — je n'avais livré que le comparatif, Naoëlle l'a relevé
 * le 20/08 : « où est-ce que tu as mis cette partie résumé que William a faite ? ». Nulle part, en
 * effet.
 *
 * CE QUE SA MAQUETTE MET DANS CET ÉCRAN, et que celui-ci reprend :
 *
 *   · LE POTENTIEL D'ÉCONOMIES en très grand, avec sa répartition par solution. C'est la seule
 *     réponse à la question que le client se pose en ouvrant le document.
 *   · TROIS REPÈRES pour situer l'étude : la part du budget concernée, les volumes analysés, le
 *     nombre d'offres consultées. Ils disent le sérieux du travail sans le raconter.
 *   · LES SOLUTIONS PROPOSÉES, chiffrées ou « à chiffrer ».
 *   · LES OBJECTIFS DU CLIENT, le prioritaire mis en avant — c'est ce qui montre qu'on a écouté.
 *   · LE PÉRIMÈTRE, pour qu'il vérifie qu'on parle bien de ses sites.
 *
 * CE QUI N'Y EST PAS, et pourquoi :
 *
 *   · LA STRATÉGIE rédigée. Michel : « on n'a pas encore intégré tout ce qui est stratégie IA, on ne
 *     fait que ce qui est simple. » Aucun champ ne la porte en base ; l'inventer serait pire que de
 *     l'omettre.
 *   · L'OPTIMISATION DES PUISSANCES et l'OPTIMISATION FISCALE apparaissent, mais en attente : la
 *     première demande les relevés de puissance que Kimatch ne reçoit pas, la seconde n'a pas été
 *     cadrée. Les montrer « à l'étude » est honnête ; les chiffrer serait faux.
 */
export function ResumeEtudeClient({
  reco,
  version,
  compteurs,
  offres,
  offreRetenue,
}: {
  reco: Recommandation
  version: VersionRecommandation
  compteurs: Compteur[]
  /** Les offres chiffrées de la version, déjà triées du moins cher au plus cher. */
  offres: OffreFournisseur[]
  offreRetenue: OffreFournisseur | null
}) {
  const { data: objectifs } = useObjectifsRecommandation(reco.id)
  const parId = useMemo(() => new Map(compteurs.map((c) => [c.id, c])), [compteurs])

  const pdl = version.compteurs.map((lien) => {
    const c = parId.get(lien.compteur_id)
    const gaz = c?.type_energie === 'gaz'
    return {
      lienId: lien.lien_id,
      reference: c?.numero_pdl || lien.label || 'Point de livraison',
      nom: c?.utilisation || c?.site_nom || 'Point de livraison',
      gaz,
      volume: gaz ? c?.car_mwh ?? null : c?.consommation_annuelle_mwh ?? null,
    }
  })
  return (
    <section className="flex flex-col gap-5">
      {/* ── L'OFFRE RECOMMANDÉE, ET RIEN D'AUTRE ──
          Michel, 21/08/2026 : « en résumé, je mets l'offre recommandée. Je mets que cette première
          partie. […] je mettrais pas ce truc en vert. »

          Le bandeau vert — potentiel d'économies et « solutions proposées » — est retiré. Il annonçait
          l'optimisation des puissances et l'optimisation fiscale comme « à l'étude » alors qu'aucune
          n'est chiffrable aujourd'hui : « je ne mettrai pas forcément la partie en vert, parce que
          j'ai pas encore les autres optimisations de puissance et tout ça. On pourra le rajouter
          après, mais quand on le rajoute, c'est parce qu'on a déjà les autres éléments. »

          Ce qui reste : l'offre qu'on recommande, les objectifs du client, son périmètre. Trois
          choses, et le client sait ce qu'on lui propose et pourquoi. */}
      {offreRetenue ? (
        <div>
          <div className="mb-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h2 className="text-kw-md font-extrabold">Notre recommandation</h2>
            <span className="text-kw-sm text-kw-meta">
              {offres.length > 1
                ? `retenue parmi ${offres.length} offres comparées`
                : 'la seule offre chiffrée à ce jour'}
            </span>
          </div>
          {/* `reference={null}` : dans le résumé, l'offre recommandée ne se compare à rien — elle
              EST la référence. L'écart affiché face à une autre offre n'aurait pas de sens ici, c'est
              le rôle du comparatif. */}
          <CarteOffreEtude
            offre={offreRetenue}
            compteurs={compteurs}
            reference={null}
            avecFournisseur
            avecIdentite
            avecBarre
          />
        </div>
      ) : (
        <p className="rounded-kw-lg border border-dashed border-kw-border-strong bg-kw-subtle px-4 py-3 text-kw-base text-kw-meta">
          Aucune offre n'est encore retenue. Le résumé annoncera notre recommandation dès qu'une offre
          sera marquée « Retenue » dans la version.
        </p>
      )}

      {/* ── Ce que le client a demandé, et sur quels sites ───────────────────── */}
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-kw-lg border border-kw-border bg-white px-4 py-3">
          <p className="text-kw-micro font-bold uppercase tracking-[0.09em] text-kw-faint">Vos objectifs</p>
          {(objectifs ?? []).length === 0 ? (
            <p className="mt-1.5 text-kw-sm text-kw-meta">
              Aucun objectif n’a encore été noté sur ce dossier.
            </p>
          ) : (
            <>
              {(objectifs ?? [])
                .filter((o) => o.prioritaire)
                .map((o) => (
                  <div
                    key={o.type_objectif_id}
                    className="mt-2 flex items-center gap-2.5 rounded-kw-md bg-gradient-to-r from-[#0d7a5f] to-[#199b78] px-3 py-2 text-white"
                  >
                    <span className="text-kw-base leading-none">★</span>
                    <span className="flex-1 text-kw-sm font-extrabold">{o.libelle}</span>
                    <span className="rounded-full bg-white/20 px-2 py-0.5 text-kw-micro font-bold uppercase tracking-[0.06em]">
                      Prioritaire
                    </span>
                  </div>
                ))}
              <div className="mt-2 flex flex-wrap gap-1.5">
                {(objectifs ?? [])
                  .filter((o) => !o.prioritaire)
                  .map((o) => (
                    <span
                      key={o.type_objectif_id}
                      className="inline-flex items-center gap-1.5 rounded-full border border-kw-border bg-kw-subtle px-2.5 py-1 text-kw-tiny font-semibold text-kw-label"
                    >
                      <span className="h-1.5 w-1.5 rounded-full bg-kw-green" />
                      {o.libelle}
                    </span>
                  ))}
              </div>
            </>
          )}
        </div>

        <div className="rounded-kw-lg border border-kw-border bg-white px-4 py-3">
          <div className="flex items-baseline gap-2">
            <p className="text-kw-micro font-bold uppercase tracking-[0.09em] text-kw-faint">Votre périmètre</p>
            <span className="flex-1" />
            <span className="rounded-full bg-kw-muted px-2 py-0.5 text-kw-micro font-bold text-kw-meta">
              {pdl.length} compteur{pdl.length > 1 ? 's' : ''}
            </span>
          </div>
          <div className="mt-2 flex flex-col gap-1.5">
            {pdl.map((l) => (
              <div
                key={l.lienId}
                className="flex items-center gap-2.5 rounded-kw-md border border-kw-border-faint px-2.5 py-1.5"
              >
                <span
                  className={cn(
                    'flex h-5 w-5 shrink-0 items-center justify-center rounded-kw-sm text-kw-micro font-bold',
                    l.gaz ? 'bg-kw-gas-light text-kw-gas' : 'bg-kw-gold-light text-kw-gold',
                  )}
                >
                  {l.gaz ? '◆' : '⚡'}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-kw-sm font-bold">{l.nom}</span>
                  <span className="block font-mono text-kw-micro text-kw-faint">{l.reference}</span>
                </span>
                <span className="shrink-0 rounded-kw-xs bg-kw-muted px-1.5 py-px text-kw-micro font-bold text-kw-meta">
                  {l.gaz ? 'GAZ' : 'ÉLEC'}
                </span>
                {l.volume != null && (
                  <span className="shrink-0 font-mono text-kw-micro text-kw-faint">
                    {Math.round(l.volume).toLocaleString('fr-FR')} MWh
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}

