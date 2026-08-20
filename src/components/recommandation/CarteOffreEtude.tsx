import { useState } from 'react'
import { cn } from '@/lib/utils'
import { LIBELLE_CLASSE, ORDRE_CLASSES, somme } from '@/lib/calculs/prixOffre'
import { libelleOffre } from '@/lib/data/recommandations'
import type { Compteur, OffreFournisseur } from '@/types/domain'

/**
 * Une offre présentée à la façon de l'étude client de William.
 *
 * DEMANDE DE MICHEL, appel du 20/08/2026 à 13h15 : « dans le détail des offres, le même modèle que
 * dans fiche étude clients […] tu vois comme ça, là on pourra venir saisir les informations ». Le
 * même composant sert donc aux deux endroits qu'il cite : le détail de la version, et le résumé
 * qu'on montre au client.
 *
 * CE QUE LE MODÈLE DE WILLIAM APPORTE, et qu'un tableau ne donne pas :
 *
 *   · UNE BARRE SEGMENTÉE qui montre d'un coup d'œil la part de l'abonnement, de l'énergie et des
 *     contributions dans le budget. Deux offres au même total peuvent se répartir très différemment,
 *     et c'est ce qui explique pourquoi l'une vieillit mieux que l'autre.
 *   · UN DÉPLI EN CASCADE : l'offre donne son total, on ouvre pour voir chaque point de livraison, on
 *     ouvre un point de livraison pour voir ses composantes. Trois niveaux, chacun ne montrant que ce
 *     qu'on lui demande — au lieu d'un tableau qui étale tout d'emblée.
 *   · L'ÉCART affiché à côté du total, pas dans une colonne à part : c'est la première chose qu'un
 *     lecteur cherche après le montant.
 *
 * CE QUI DIFFÈRE DE LA MAQUETTE, faute de données : la maquette détaille l'électricité par poste
 * horaire avec l'électron et le mécanisme de capacité, et découpe le TURPE en quatre tuiles. Kimatch
 * a le prix par classe et un TURPE global ; les blocs affichent donc ce qui existe, sans inventer de
 * ventilation.
 */
export function CarteOffreEtude({
  offre,
  compteurs,
  reference,
  rang,
  aChoisir,
  choisie,
  onChoisir,
  actions,
}: {
  offre: OffreFournisseur
  /** Les compteurs de la fiche, pour nommer les points de livraison et connaître leurs volumes. */
  compteurs: Compteur[]
  /** L'offre de comparaison — la moins chère du lot, en attendant l'offre de référence de Michel. */
  reference: OffreFournisseur | null
  rang: number
  /** Affiche la case de sélection, comme la maquette qui invite à comparer 2 ou 3 offres. */
  aChoisir?: boolean
  choisie?: boolean
  onChoisir?: () => void
  /** Ce qu'on greffe à droite : boutons de statut, pièce jointe… selon l'écran qui l'affiche. */
  actions?: React.ReactNode
}) {
  const [ouvert, setOuvert] = useState(false)
  const [pdlOuvert, setPdlOuvert] = useState<string | null>(null)
  const parId = new Map(compteurs.map((c) => [c.id, c]))

  const b = budgetsDeLOffre(offre)
  const total = offre.montant_annuel_ht ?? b.total
  const ecart = total != null && reference?.montant_annuel_ht != null && reference.id !== offre.id
    ? total - reference.montant_annuel_ht
    : null

  // Les trois parts du budget. Sans total, aucune barre : une barre vide ferait croire à un zéro.
  const parts = [
    { cle: 'abonnement', libelle: 'Abonnement', valeur: b.abonnement, couleur: 'bg-kw-blue' },
    { cle: 'energie', libelle: 'Énergie', valeur: b.energie, couleur: 'bg-kw-green' },
    { cle: 'contributions', libelle: 'Contributions', valeur: b.contributions, couleur: 'bg-kw-gold' },
  ].filter((p) => p.valeur != null && p.valeur > 0)
  const sommeParts = somme(...parts.map((p) => p.valeur))

  return (
    <div
      className={cn(
        'overflow-hidden rounded-kw-lg border bg-white',
        offre.est_offre_recommandee ? 'border-[1.5px] border-kw-green' : 'border-kw-border',
      )}
    >
      {/* ── La ligne de l'offre ─────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3.5 py-3">
        {aChoisir && (
          <button
            type="button"
            onClick={onChoisir}
            title="Sélectionner pour comparer"
            className={cn(
              'flex h-4 w-4 shrink-0 items-center justify-center rounded-kw-xs border text-kw-micro font-bold',
              choisie ? 'border-kw-green bg-kw-green text-white' : 'border-kw-border-strong bg-white',
            )}
          >
            {choisie ? '✓' : ''}
          </button>
        )}

        <span
          className={cn(
            'flex h-8 w-8 shrink-0 items-center justify-center rounded-kw-sm text-kw-sm font-extrabold',
            offre.est_offre_recommandee ? 'bg-kw-green text-white' : 'bg-kw-muted text-kw-meta',
          )}
        >
          {initiales(offre.fournisseur_nom)}
        </span>

        <span className="min-w-[140px] flex-1">
          <span className="flex flex-wrap items-center gap-1.5">
            <span className="text-kw-md font-extrabold">{offre.fournisseur_nom || 'Fournisseur'}</span>
            {offre.est_offre_recommandee && (
              <span className="rounded-kw-xs bg-kw-green-light px-1.5 py-px text-kw-micro font-bold uppercase tracking-[0.06em] text-kw-green">
                Retenue
              </span>
            )}
            {!offre.est_offre_recommandee && reference?.id === offre.id && (
              <span className="rounded-kw-xs bg-kw-muted px-1.5 py-px text-kw-micro font-bold uppercase tracking-[0.06em] text-kw-meta">
                Moins chère
              </span>
            )}
            {!offre.est_offre_recommandee && reference?.id !== offre.id && (
              <span className="text-kw-micro font-bold text-kw-faint">n° {rang}</span>
            )}
          </span>
          <span className="mt-0.5 block font-mono text-kw-tiny text-kw-meta">
            {libelleOffre(offre.duree_mois, offre.type_prix)}
            {offre.date_validite && ` · valable jusqu'au ${new Date(offre.date_validite).toLocaleDateString('fr-FR')}`}
          </span>
        </span>

        {/* La barre segmentée : la composition du budget, lisible sans chiffres. */}
        <span className="min-w-[160px] flex-1">
          {sommeParts != null && sommeParts > 0 ? (
            <>
              <span className="flex h-3.5 overflow-hidden rounded-kw-sm bg-kw-muted">
                {parts.map((p) => (
                  <span
                    key={p.cle}
                    title={`${p.libelle} · ${Math.round(p.valeur!).toLocaleString('fr-FR')} € (${Math.round((p.valeur! / sommeParts) * 100)} %)`}
                    className={cn(p.couleur, 'cursor-help')}
                    style={{ width: `${(p.valeur! / sommeParts) * 100}%` }}
                  />
                ))}
              </span>
              <span className="mt-1 flex flex-wrap gap-x-2.5 font-mono text-kw-micro text-kw-faint">
                {parts.map((p) => (
                  <span key={p.cle}>
                    {p.libelle} {Math.round((p.valeur! / sommeParts) * 100)} %
                  </span>
                ))}
              </span>
            </>
          ) : (
            <span className="text-kw-tiny text-kw-ghost">composition inconnue — aucun prix saisi</span>
          )}
        </span>

        <span className="min-w-[96px] text-right">
          <span className="block font-mono text-kw-lg font-extrabold tabular-nums">
            {total == null ? '—' : Math.round(total).toLocaleString('fr-FR')}
          </span>
          <span className="block text-kw-micro text-kw-faint">total HT / an</span>
        </span>

        <span className="min-w-[92px] text-right">
          {ecart == null ? (
            <span className="text-kw-tiny text-kw-ghost">—</span>
          ) : (
            <span
              className={cn(
                'font-mono text-kw-base font-extrabold tabular-nums',
                ecart > 0 ? 'text-kw-red' : 'text-kw-green',
              )}
            >
              {ecart > 0 ? '+' : ''}
              {Math.round(ecart).toLocaleString('fr-FR')} €
            </span>
          )}
          <span className="block text-kw-micro text-kw-faint">
            {ecart == null ? 'référence' : 'vs moins chère'}
          </span>
        </span>

        {actions}

        <button
          type="button"
          onClick={() => setOuvert((v) => !v)}
          className="inline-flex items-center gap-1 rounded-kw-md border border-kw-border-strong bg-white px-2 py-1.5 text-kw-tiny font-bold text-kw-label hover:bg-kw-subtle"
        >
          Détail {ouvert ? '▾' : '▸'}
        </button>
      </div>

      {/* ── Niveau 2 : un point de livraison par ligne ──────────────────────── */}
      {ouvert && (
        <div className="border-t border-kw-border-faint bg-kw-subtle px-3.5 py-3">
          <p className="mb-2 text-kw-micro font-bold uppercase tracking-[0.07em] text-kw-faint">
            Budget par compteur · dépliez pour le détail
          </p>
          {offre.details_par_compteur.length === 0 ? (
            <p className="text-kw-tiny text-kw-faint">Aucun prix saisi sur cette offre.</p>
          ) : (
            <div className="flex flex-col gap-1.5">
              {offre.details_par_compteur.map((d) => {
                const compteur = parId.get(d.compteur_id)
                const gaz = !!d.prix_gaz
                const volume = d.consommation_annuelle_reference_mwh
                  ?? (gaz ? compteur?.car_mwh : compteur?.consommation_annuelle_mwh)
                  ?? null
                const estOuvert = pdlOuvert === d.id
                return (
                  <div key={d.id} className="overflow-hidden rounded-kw-md border border-kw-border bg-white">
                    <button
                      type="button"
                      onClick={() => setPdlOuvert(estOuvert ? null : d.id)}
                      className="flex w-full flex-wrap items-center gap-x-3 gap-y-1.5 px-3 py-2 text-left hover:bg-kw-subtle"
                    >
                      <span className="w-3 shrink-0 text-kw-tiny text-kw-faint">{estOuvert ? '▾' : '▸'}</span>
                      <span className="min-w-[130px] flex-1 font-mono text-kw-sm font-bold">
                        {compteur?.numero_pdl || d.compteur_label || 'Compteur'}
                        <span className="ml-1.5 rounded-kw-xs bg-kw-muted px-1.5 py-px font-sans text-kw-micro font-bold text-kw-meta">
                          {gaz ? 'Gaz' : 'Élec'}
                        </span>
                      </span>
                      <Cellule libelle="CONSO" valeur={volume} unite="MWh" />
                      <Cellule libelle="ABONNEMENT" valeur={abonnementDe(d)} unite="€" />
                      <Cellule libelle="ÉNERGIE" valeur={d.cout_fourniture_annuel_ht} unite="€" />
                      <Cellule libelle="CONTRIBUTIONS" valeur={contributionsDe(d)} unite="€" />
                      <span className="min-w-[86px] text-right">
                        <span className="block text-kw-micro font-bold tracking-[0.05em] text-kw-faint">
                          TOTAL / AN
                        </span>
                        <span className="block font-mono text-kw-base font-extrabold tabular-nums text-kw-green">
                          {d.cout_total_annuel_estime_ht == null
                            ? '—'
                            : `${Math.round(d.cout_total_annuel_estime_ht).toLocaleString('fr-FR')} €`}
                        </span>
                      </span>
                    </button>

                    {/* ── Niveau 3 : les composantes, en blocs ───────────────── */}
                    {estOuvert && (
                      <div className="animate-kw-fade-slide border-t border-kw-border-faint px-3 py-3">
                        <BlocCompose
                          couleur="blue"
                          titre="Abonnement"
                          aide="Part fixe facturée par le fournisseur, indépendante de la consommation."
                          total={abonnementDe(d)}
                        />
                        <BlocCompose
                          couleur="green"
                          titre="Énergie"
                          aide={gaz
                            ? 'La molécule et ce que le fournisseur refacture au mégawattheure.'
                            : "Le prix de chaque plage horosaisonnière. En électricité l'abonnement est compté ici."}
                          total={d.cout_fourniture_annuel_ht}
                          lignes={gaz
                            ? [
                                { l: 'Molécule', pu: d.prix_gaz?.prix_energie_mwh, vol: volume },
                                { l: 'CEE', pu: d.prix_gaz?.prix_cee_mwh, vol: volume },
                                { l: 'CPB', pu: d.prix_gaz?.prix_cpb_mwh, vol: volume },
                              ]
                            : [
                                ...ORDRE_CLASSES.map((c) => ({
                                  l: LIBELLE_CLASSE[c] ?? c,
                                  pu: d.prix_electricite?.prix_mwh_par_classe?.[c] ?? null,
                                  vol: compteur?.consoParClasseMwh?.[c] ?? null,
                                })).filter((x) => x.pu != null),
                                { l: 'CEE', pu: d.prix_electricite?.prix_cee_mwh ?? null, vol: volume },
                                { l: 'GO', pu: d.prix_electricite?.prix_go_mwh ?? null, vol: volume },
                              ]}
                        />
                        <BlocCompose
                          couleur="gold"
                          titre={gaz ? 'Contributions' : 'TURPE et contributions'}
                          aide={gaz
                            ? 'Acheminement et taxes. Le client les paie quel que soit le fournisseur.'
                            : "Le TURPE finance les réseaux, l'accise et la CTA sont des taxes. Identiques chez tous les fournisseurs."}
                          total={contributionsDe(d)}
                          lignes={gaz
                            ? [
                                { l: 'ATRT', pu: d.prix_gaz?.prix_atrt_mwh, vol: volume },
                                { l: 'ATRD', pu: d.prix_gaz?.prix_atrd_mwh, vol: volume },
                                { l: 'AGN', pu: d.prix_gaz?.prix_agn_mwh, vol: volume },
                                { l: 'CTA', montant: d.prix_gaz?.cta_annuel_ht },
                              ]
                            : [
                                { l: 'TURPE', montant: d.prix_electricite?.prix_turpe_annuel_ht },
                                { l: 'AE — accise', montant: d.prix_electricite?.accise_annuel_ht },
                                { l: 'CTA', montant: d.prix_electricite?.cta_annuel_ht },
                              ]}
                        />
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/** Les budgets d'une offre, additionnés sur ses points de livraison. */
export function budgetsDeLOffre(offre: OffreFournisseur) {
  const cumul = (f: (d: OffreFournisseur['details_par_compteur'][number]) => number | null | undefined) =>
    offre.details_par_compteur.reduce<number | null>((t, d) => somme(t, f(d)), null)
  const abonnement = cumul(abonnementDe)
  const energie = cumul((d) => d.cout_fourniture_annuel_ht)
  const contributions = cumul(contributionsDe)
  return { abonnement, energie, contributions, total: somme(abonnement, energie, contributions) }
}

/** L'abonnement du PDL, quelle que soit son énergie. */
function abonnementDe(d: OffreFournisseur['details_par_compteur'][number]) {
  return d.prix_gaz?.abonnement_fourniture_annuel_ht ?? d.prix_electricite?.abonnement_fourniture_annuel_ht ?? null
}

/**
 * Les contributions du PDL.
 *
 * Au gaz, `cout_acheminement_annuel_ht` porte déjà ATRD + AGN + CTA, recalculé à chaque saisie. En
 * électricité, il porte le TURPE, auquel s'ajoutent l'accise et la CTA — les trois que le compte
 * rendu de consultation liste sous « Contributions ».
 */
function contributionsDe(d: OffreFournisseur['details_par_compteur'][number]) {
  if (d.prix_gaz) return d.cout_acheminement_annuel_ht ?? null
  return somme(
    d.prix_electricite?.prix_turpe_annuel_ht ?? d.cout_acheminement_annuel_ht,
    d.prix_electricite?.accise_annuel_ht,
    d.prix_electricite?.cta_annuel_ht,
  )
}

function initiales(nom: string | null | undefined) {
  if (!nom) return '—'
  return nom.split(/\s+/).slice(0, 2).map((m) => m[0]).join('').toUpperCase()
}

function Cellule({ libelle, valeur, unite }: { libelle: string; valeur: number | null | undefined; unite: string }) {
  return (
    <span className="min-w-[74px]">
      <span className="block text-kw-micro font-bold tracking-[0.05em] text-kw-faint">{libelle}</span>
      <span className="block font-mono text-kw-sm font-bold tabular-nums">
        {valeur == null
          ? <span className="text-kw-ghost">—</span>
          : `${unite === 'MWh' ? valeur.toLocaleString('fr-FR', { maximumFractionDigits: 2 }) : Math.round(valeur).toLocaleString('fr-FR')} ${unite}`}
      </span>
    </span>
  )
}

/**
 * Un bloc de composantes, avec son total en tête et ses lignes en dessous.
 *
 * Une ligne se donne soit au mégawattheure — et son montant se calcule par le volume — soit
 * directement en euros par an, comme la CTA ou l'accise. Les deux cohabitent dans le même bloc parce
 * que c'est ainsi que le fournisseur les annonce.
 */
function BlocCompose({ couleur, titre, aide, total, lignes }: {
  couleur: 'blue' | 'green' | 'gold'
  titre: string
  aide: string
  total: number | null | undefined
  lignes?: { l: string; pu?: number | null; vol?: number | null; montant?: number | null }[]
}) {
  const teintes = {
    blue: { bord: 'border-[#e6edf3]', fond: 'bg-[#f7f9fb]', puce: 'bg-kw-blue', texte: 'text-kw-blue' },
    green: { bord: 'border-kw-green-border', fond: 'bg-kw-green-tint', puce: 'bg-kw-green', texte: 'text-kw-green' },
    gold: { bord: 'border-kw-amber-border', fond: 'bg-kw-amber-light', puce: 'bg-kw-gold', texte: 'text-kw-amber-dark' },
  }[couleur]
  const visibles = (lignes ?? []).filter((x) => x.montant != null || (x.pu != null))
  return (
    <div className={cn('mb-2 overflow-hidden rounded-kw-md border last:mb-0', teintes.bord)}>
      <div className={cn('flex flex-wrap items-center gap-2 border-b px-3 py-2', teintes.bord, teintes.fond)}>
        <span className={cn('h-[7px] w-[7px] shrink-0 rounded-[3px]', teintes.puce)} />
        <span className={cn('text-kw-micro font-bold uppercase tracking-[0.06em]', teintes.texte)}>{titre}</span>
        <span className="flex-1" />
        <span className={cn('font-mono text-kw-base font-extrabold tabular-nums', teintes.texte)}>
          {total == null ? '—' : `${Math.round(total).toLocaleString('fr-FR')} €`}
        </span>
      </div>
      <p className="px-3 pt-1.5 text-kw-micro leading-snug text-kw-faint">{aide}</p>
      {visibles.length > 0 && (
        <div className="px-3 pb-2 pt-1">
          <div className="grid grid-cols-[1fr_auto_auto_auto] gap-x-3 gap-y-1 text-kw-tiny">
            <span className="text-kw-micro font-bold tracking-[0.05em] text-kw-faint">POSTE</span>
            <span className="text-right text-kw-micro font-bold tracking-[0.05em] text-kw-faint">PRIX</span>
            <span className="text-right text-kw-micro font-bold tracking-[0.05em] text-kw-faint">VOLUME</span>
            <span className="text-right text-kw-micro font-bold tracking-[0.05em] text-kw-faint">€ / AN</span>
            {visibles.map((x) => {
              const montant = x.montant != null
                ? x.montant
                : x.pu != null && x.vol != null ? x.pu * x.vol : null
              return (
                <div key={x.l} className="col-span-4 grid grid-cols-[1fr_auto_auto_auto] gap-x-3 border-t border-kw-border-faint pt-1">
                  <span className="font-semibold text-kw-label">{x.l}</span>
                  <span className="text-right font-mono tabular-nums text-kw-meta">
                    {x.pu != null ? `${x.pu.toLocaleString('fr-FR', { maximumFractionDigits: 2 })} €/MWh` : '—'}
                  </span>
                  <span className="text-right font-mono tabular-nums text-kw-meta">
                    {x.vol != null ? `${x.vol.toLocaleString('fr-FR', { maximumFractionDigits: 2 })} MWh` : '—'}
                  </span>
                  <span className="text-right font-mono font-bold tabular-nums">
                    {montant == null ? <span className="text-kw-ghost">—</span> : `${Math.round(montant).toLocaleString('fr-FR')} €`}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
