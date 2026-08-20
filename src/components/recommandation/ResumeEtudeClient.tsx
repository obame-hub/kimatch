import { useMemo } from 'react'
import { cn } from '@/lib/utils'
import { somme } from '@/lib/calculs/prixOffre'
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
  const volumeTotal = pdl.reduce<number | null>((t, l) => somme(t, l.volume), null)

  // L'ÉCONOMIE VIENT DE CE QUI EST SAISI, jamais d'une estimation maison. L'offre retenue d'abord —
  // c'est la décision — puis la moins chère, puis le gain porté par la version.
  const economieOffre = offreRetenue?.economie_annuelle_estimee ?? offres[0]?.economie_annuelle_estimee ?? null
  const economie = economieOffre ?? version.gains_estimes ?? null

  // La part du budget que l'étude couvre : l'économie rapportée au budget de l'offre de référence.
  const budgetReference = offreRetenue?.montant_annuel_ht ?? offres[0]?.montant_annuel_ht ?? null
  const partDuBudget = economie != null && budgetReference != null && budgetReference > 0
    ? (economie / budgetReference) * 100
    : null

  const solutions = [
    {
      cle: 'offres',
      titre: 'Comparatif d’offres',
      detail: `${offres.length} offre${offres.length > 1 ? 's' : ''} chiffrée${offres.length > 1 ? 's' : ''}`,
      montant: economieOffre,
      etat: economieOffre != null ? null : offres.length > 0 ? 'à chiffrer' : 'en attente d’offres',
    },
    {
      cle: 'puissances',
      titre: 'Optimisation des puissances',
      detail: 'TURPE · sans changer de fournisseur',
      montant: null,
      // La part fixe du soutirage existe en base depuis le 20/08/2026 ; ce qui manque, ce sont les
      // relevés de puissance du compteur, sans lesquels aucun gain ne peut être calculé.
      etat: 'à l’étude',
    },
    {
      cle: 'fiscale',
      titre: 'Optimisation fiscale',
      detail: 'accise et CTA',
      montant: null,
      etat: 'à l’étude',
    },
  ]

  return (
    <section className="flex flex-col gap-3">
      {/* ── Le potentiel d'économies, et les solutions qui le composent ──────── */}
      <div className="grid gap-0 overflow-hidden rounded-kw-xl lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        <div className="bg-gradient-to-br from-[#0b5c48] to-[#0d7a5f] px-5 py-4 text-white">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-2.5 py-1 text-kw-micro font-bold uppercase tracking-[0.08em]">
            <span className="h-1.5 w-1.5 rounded-full bg-white/80" />
            {economie != null ? 'Étude prête' : 'Étude en cours'} ·{' '}
            {offres.length} offre{offres.length > 1 ? 's' : ''} comparée{offres.length > 1 ? 's' : ''}
          </span>

          <p className="mt-3 text-kw-sm text-white/75">Votre potentiel d’économies annuel</p>
          {/* PAS DE TIRET GÉANT À LA PLACE DU MONTANT. Un cadratin à 42 px en police à chasse fixe
              dessine une barre noire large : à l'impression, le rapport avait l'air censuré
              (constaté le 20/08/2026). Quand le chiffre manque, on le dit avec des mots. */}
          {economie != null ? (
            <p className="font-mono text-[42px] font-extrabold leading-none tracking-[-0.02em]">
              −{Math.round(economie).toLocaleString('fr-FR')} €
              <span className="ml-2 align-middle text-kw-sm font-semibold text-white/70">/ an HT</span>
            </p>
          ) : (
            <p className="text-kw-h2 font-extrabold leading-tight">Reste à chiffrer</p>
          )}
          {economie == null && (
            <p className="mt-1.5 text-kw-tiny leading-snug text-white/70">
              Elle se calcule dès que l’économie d’une offre est renseignée face au contrat en cours.
            </p>
          )}

          <div className="mt-4 flex flex-wrap gap-x-7 gap-y-2 border-t border-white/15 pt-3">
            <Repere
              valeur={partDuBudget != null ? `${Math.round(partDuBudget)} %` : '—'}
              libelle="de votre budget"
            />
            <Repere
              valeur={volumeTotal != null ? `${Math.round(volumeTotal).toLocaleString('fr-FR')} MWh` : '—'}
              libelle="analysés / an"
            />
            <Repere valeur={String(offres.length)} libelle="offres consultées" />
            <Repere valeur={String(pdl.length)} libelle={`point${pdl.length > 1 ? 's' : ''} de livraison`} />
          </div>
        </div>

        <div className="flex flex-col gap-1.5 bg-[#0a5241] px-4 py-4">
          <p className="text-kw-micro font-bold uppercase tracking-[0.09em] text-white/55">
            Les solutions proposées
          </p>
          {solutions.map((sol) => (
            <div
              key={sol.cle}
              className={cn(
                'flex items-center gap-3 rounded-kw-md px-3 py-2',
                sol.montant != null ? 'bg-white/12' : 'bg-white/[0.06]',
              )}
            >
              <span className="min-w-0 flex-1">
                <span className={cn('block text-kw-sm font-bold', sol.montant != null ? 'text-white' : 'text-white/70')}>
                  {sol.titre}
                </span>
                <span className="block text-kw-micro text-white/55">{sol.detail}</span>
              </span>
              {sol.montant != null ? (
                <span className="shrink-0 text-right">
                  <span className="block font-mono text-kw-base font-extrabold text-white">
                    −{Math.round(sol.montant).toLocaleString('fr-FR')} €
                  </span>
                  <span className="block text-kw-micro text-white/55">/ an</span>
                </span>
              ) : (
                <span className="shrink-0 font-mono text-kw-tiny text-white/50">{sol.etat}</span>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* ── Ce que le client a demandé, et sur quels sites ───────────────────── */}
      <div className="grid gap-3 lg:grid-cols-2">
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

/** Un des repères chiffrés du bandeau : la valeur d'abord, ce qu'elle mesure ensuite. */
function Repere({ valeur, libelle }: { valeur: string; libelle: string }) {
  return (
    <span>
      <span className="block font-mono text-kw-md font-extrabold">{valeur}</span>
      <span className="block text-kw-micro text-white/60">{libelle}</span>
    </span>
  )
}
