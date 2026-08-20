import { useMemo } from 'react'
import { Dialog } from '@/components/ui/dialog'
import { Printer } from 'lucide-react'
import { somme } from '@/lib/calculs/prixOffre'
import { libelleOffre } from '@/lib/data/recommandations'
import kiweePicto from '@/assets/kiwee-picto.png'
import type {
  Compte,
  Compteur,
  OffreFournisseur,
  Recommandation,
  VersionRecommandation,
} from '@/types/domain'

/**
 * Le document comparatif d'une version : ce qu'on met devant le client pour qu'il choisisse.
 *
 * DEMANDE DE MICHEL, 19/08/2026 : « quand le commercial a fini de générer sa version, il va pouvoir
 * générer un document comparatif. » Il cadre l'ambition : « ce sont des documents temporaires », d'où
 * du HTML mis en page pour l'impression et pas un générateur de PDF — le navigateur fabrique le PDF.
 *
 * C'EST UN DOCUMENT KIWEE, PAS KIMATCH (Naoëlle, 20/08/2026). Kimatch est le CRM, un outil interne ;
 * le client ne connaît que Kiwee. Le logotype est donc composé du picto de la marque et du mot :
 * le dépôt ne contient aucun logotype « Kiwee », son seul fichier étant celui de Kimatch
 * (`src/assets/kimatch-logo.png`, renommé le 20/08/2026 — il s'appelait `kiwee-logo.png`, ce qui
 * avait de quoi tromper). Le jour où le vrai fichier arrive, il remplace cette composition.
 *
 * CE QUI GUIDE LA MISE EN PAGE. Le lecteur n'est pas un courtier : il cherche combien il paie et
 * laquelle choisir. Donc, dans cet ordre — la recommandation en clair et en gros, puis le tableau qui
 * la justifie, puis le périmètre qui prouve qu'on parle bien de ses sites. La décomposition des
 * budgets vient après le total, jamais avant : c'est la réponse à « pourquoi ce montant », une
 * question qui ne se pose qu'après avoir vu le montant.
 *
 * UN SEUL ACCENT, le vert de la marque, réservé à ce qui est recommandé. Le reste est en encre et en
 * gris : un document où tout est mis en valeur ne met rien en valeur, et il s'imprime mal.
 *
 * CE QU'IL NE FAIT PAS : inventer. Une offre sans budget total n'a pas de colonne, une ligne que
 * personne ne renseigne est masquée plutôt que remplie de tirets, et l'écart entre offres est calculé
 * — pas l'économie face au contrat actuel, qui restera hors d'atteinte jusqu'à ce que l'offre de
 * référence dont parle Michel existe.
 */
export function DocumentComparatif({
  ouvert,
  onFermer,
  reco,
  version,
  compte,
  compteurs,
}: {
  ouvert: boolean
  onFermer: () => void
  reco: Recommandation
  version: VersionRecommandation
  compte: Compte | null | undefined
  compteurs: Compteur[]
}) {
  const parId = useMemo(() => new Map(compteurs.map((c) => [c.id, c])), [compteurs])

  // Une offre par colonne, la moins chère d'abord. Les offres sans budget total sortent : une colonne
  // de tirets n'aide personne à choisir.
  const colonnes = useMemo(
    () =>
      version.optimisations
        .flatMap((o) => o.offres)
        .filter((o) => o.montant_annuel_ht != null)
        .sort((a, b) => (a.montant_annuel_ht ?? 0) - (b.montant_annuel_ht ?? 0)),
    [version],
  )

  // La mise en avant suit la décision si elle est prise, le prix sinon. Deux choses différentes, et
  // le document le dit : « retenue » n'est pas « la moins chère ».
  const retenue = colonnes.find((o) => o.est_offre_recommandee)
  const miseEnAvant = retenue ?? colonnes[0]
  const decidee = retenue != null

  const pdl = useMemo(
    () =>
      version.compteurs.map((lien) => {
        const c = parId.get(lien.compteur_id)
        const gaz = c?.type_energie === 'gaz'
        return {
          lienId: lien.lien_id,
          libelle: c?.numero_pdl || c?.utilisation || lien.label || 'Compteur',
          site: c?.site_nom ?? null,
          energie: gaz ? 'Gaz' : 'Électricité',
          volume: gaz ? c?.car_mwh ?? null : c?.consommation_annuelle_mwh ?? null,
        }
      }),
    [version, parId],
  )

  const volumeTotal = pdl.reduce<number | null>((t, l) => somme(t, l.volume), null)

  function cumul(offre: OffreFournisseur, extrait: (d: OffreFournisseur['details_par_compteur'][number]) => number | null | undefined) {
    return offre.details_par_compteur.reduce<number | null>((t, d) => somme(t, extrait(d)), null)
  }

  return (
    <Dialog
      open={ouvert}
      onClose={onFermer}
      title="Document comparatif"
      description={`Version ${version.numero_version ?? ''} — ${colonnes.length} offre${colonnes.length > 1 ? 's' : ''} chiffrée${colonnes.length > 1 ? 's' : ''}`}
      className="max-w-5xl print:max-w-none print:border-0 print:p-0 print:shadow-none"
    >
      <div className="mb-4 flex items-center gap-2 border-b border-kw-border pb-3 print:hidden">
        <p className="mr-auto text-kw-sm text-kw-meta">
          Document provisoire. « Imprimer » ouvre la fenêtre du navigateur, où « Enregistrer au format
          PDF » produit le fichier.
        </p>
        <button
          type="button"
          onClick={() => window.print()}
          disabled={colonnes.length === 0}
          className="inline-flex items-center gap-1.5 rounded-kw-md bg-kw-green px-3.5 py-2 text-kw-sm font-bold text-white shadow-kw-green hover:brightness-95 disabled:opacity-50 disabled:shadow-none"
        >
          <Printer className="h-3.5 w-3.5" />
          Imprimer / PDF
        </button>
      </div>

      {colonnes.length === 0 ? (
        <p className="rounded-kw-lg border border-dashed border-kw-border-strong bg-kw-subtle p-4 text-kw-base text-kw-meta">
          Aucune offre de cette version n'a de budget total. Le comparatif se remplit dès qu'un prix
          est saisi sur un point de livraison : le budget total de chaque offre en découle.
        </p>
      ) : (
        <div id="document-comparatif" className="bg-white text-kw-ink">
          {/* ── En-tête ─────────────────────────────────────────────────────── */}
          <header className="flex items-end justify-between gap-6 border-b-[3px] border-kw-green pb-3">
            <div className="flex items-center gap-2.5">
              <img src={kiweePicto} alt="" className="h-9 w-auto" />
              <div>
                <span className="block font-display text-[26px] font-extrabold leading-none tracking-[-0.02em] text-kw-ink">
                  Kiwee
                </span>
                <span className="block text-kw-tiny font-semibold uppercase tracking-[0.14em] text-kw-green">
                  Courtage en énergie
                </span>
              </div>
            </div>
            <div className="text-right">
              <h1 className="font-display text-kw-lg font-extrabold leading-tight">Comparatif d'offres</h1>
              <p className="text-kw-tiny text-kw-meta">
                {[
                  reco.reference,
                  version.numero_version != null ? `Version ${version.numero_version}` : null,
                  new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' }),
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </p>
            </div>
          </header>

          {/* ── Le client et son périmètre ──────────────────────────────────── */}
          <section className="mt-4 flex flex-wrap items-baseline gap-x-8 gap-y-1">
            <div>
              <Etiquette>Établi pour</Etiquette>
              <p className="font-display text-kw-md font-extrabold leading-tight">
                {compte?.nom ?? reco.compte_nom ?? '—'}
              </p>
            </div>
            <div>
              <Etiquette>Périmètre</Etiquette>
              <p className="text-kw-base font-semibold">
                {pdl.length} point{pdl.length > 1 ? 's' : ''} de livraison
              </p>
            </div>
            <div>
              <Etiquette>Volume annuel</Etiquette>
              <p className="font-mono text-kw-base font-semibold tabular-nums">
                {volumeTotal != null ? `${Math.round(volumeTotal).toLocaleString('fr-FR')} MWh` : '—'}
              </p>
            </div>
            <div>
              <Etiquette>Offres comparées</Etiquette>
              <p className="text-kw-base font-semibold">{colonnes.length}</p>
            </div>
          </section>

          {/* ── La recommandation, avant tout le reste ──────────────────────── */}
          {miseEnAvant && (
            <section className="mt-4 flex flex-wrap items-center gap-x-8 gap-y-3 rounded-kw-lg border-[1.5px] border-kw-green bg-kw-green-tint px-4 py-3">
              <div className="min-w-[180px]">
                <Etiquette vert>{decidee ? 'Offre retenue' : 'Offre la moins chère'}</Etiquette>
                <p className="font-display text-kw-md font-extrabold leading-tight">
                  {miseEnAvant.fournisseur_nom || 'Fournisseur'}
                </p>
                <p className="text-kw-sm text-kw-meta">
                  {libelleOffre(miseEnAvant.duree_mois, miseEnAvant.type_prix)}
                </p>
              </div>
              <div className="ml-auto text-right">
                <Etiquette vert>Budget annuel HT</Etiquette>
                <p className="font-mono text-[30px] font-extrabold leading-none tabular-nums text-kw-green">
                  {Math.round(miseEnAvant.montant_annuel_ht ?? 0).toLocaleString('fr-FR')} €
                </p>
                {/* L'écart avec l'offre la plus chère est un fait, pas une projection : les deux
                    chiffres sont dans le tableau juste en dessous. */}
                {colonnes.length > 1 && (
                  <p className="mt-0.5 text-kw-tiny text-kw-meta">
                    {ecart(colonnes[colonnes.length - 1], miseEnAvant)} de moins que l'offre la plus
                    élevée du comparatif
                  </p>
                )}
              </div>
            </section>
          )}

          {/* ── Le tableau ──────────────────────────────────────────────────── */}
          <h2 className="mt-6 text-kw-base font-extrabold">Ce que chaque offre représente sur un an</h2>
          <p className="mb-1.5 text-kw-tiny text-kw-meta">
            Montants annuels hors taxes, établis sur les volumes de référence du périmètre.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-kw-sm">
              <thead>
                <tr>
                  <th className="w-[34%] border-b-2 border-kw-ink p-2 text-left align-bottom text-kw-tiny font-bold uppercase tracking-[0.06em] text-kw-faint">
                    Fournisseur
                  </th>
                  {colonnes.map((o) => {
                    const vedette = o.id === miseEnAvant?.id
                    return (
                      <th
                        key={o.id}
                        className={`border-b-2 p-2 text-right align-bottom ${vedette ? 'border-kw-green bg-kw-green-tint' : 'border-kw-ink'}`}
                      >
                        <span className="block font-display text-kw-base font-extrabold">
                          {o.fournisseur_nom || 'Fournisseur'}
                        </span>
                        <span className="block text-kw-tiny font-normal text-kw-meta">
                          {libelleOffre(o.duree_mois, o.type_prix)}
                        </span>
                        {vedette && (
                          <span className="mt-1 inline-block rounded-kw-xs bg-kw-green px-1.5 py-px text-kw-micro font-bold uppercase tracking-[0.06em] text-white">
                            {decidee ? 'Retenue' : 'Moins chère'}
                          </span>
                        )}
                      </th>
                    )
                  })}
                </tr>
              </thead>
              <tbody>
                <LigneBudget titre="Budget énergie" sousTitre="fourniture" colonnes={colonnes} vedette={miseEnAvant?.id} valeur={(o) => cumul(o, (d) => d.cout_fourniture_annuel_ht)} />
                <LigneBudget titre="Budget abonnement" sousTitre="gaz" colonnes={colonnes} vedette={miseEnAvant?.id} valeur={(o) => cumul(o, (d) => d.prix_gaz?.abonnement_fourniture_annuel_ht)} />
                <LigneBudget titre="Budget TURPE" sousTitre="acheminement électrique" colonnes={colonnes} vedette={miseEnAvant?.id} valeur={(o) => cumul(o, (d) => d.prix_electricite?.prix_turpe_annuel_ht)} />
                <LigneBudget titre="Budget contributions" sousTitre="ATRD, AGN, CTA" colonnes={colonnes} vedette={miseEnAvant?.id} valeur={(o) => cumul(o, (d) => (d.prix_gaz ? d.cout_acheminement_annuel_ht : null))} />
                <LigneBudget titre="Budget total" colonnes={colonnes} vedette={miseEnAvant?.id} valeur={(o) => o.montant_annuel_ht} total />
                <LigneBudget titre="Économie estimée" sousTitre="face au contrat en cours" colonnes={colonnes} vedette={miseEnAvant?.id} valeur={(o) => o.economie_annuelle_estimee} />
                {colonnes.length > 1 && (
                  <tr>
                    <td className="p-2 text-kw-tiny text-kw-faint">Écart avec la moins chère</td>
                    {colonnes.map((o) => (
                      <td
                        key={o.id}
                        className={`p-2 text-right font-mono text-kw-tiny tabular-nums text-kw-meta ${o.id === miseEnAvant?.id ? 'bg-kw-green-tint' : ''}`}
                      >
                        {o.id === colonnes[0].id ? '—' : `+ ${ecart(o, colonnes[0])}`}
                      </td>
                    ))}
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* ── Le périmètre, pour que le client vérifie ─────────────────────── */}
          <h2 className="mt-6 text-kw-base font-extrabold">Détail par point de livraison</h2>
          <p className="mb-1.5 text-kw-tiny text-kw-meta">
            Budget annuel de chaque site, offre par offre.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-kw-sm">
              <thead>
                <tr>
                  <th className="border-b border-kw-border p-2 text-left text-kw-tiny font-bold uppercase tracking-[0.06em] text-kw-faint">
                    Point de livraison
                  </th>
                  <th className="border-b border-kw-border p-2 text-right text-kw-tiny font-bold uppercase tracking-[0.06em] text-kw-faint">
                    Volume
                  </th>
                  {colonnes.map((o) => (
                    <th
                      key={o.id}
                      className={`border-b border-kw-border p-2 text-right text-kw-tiny font-bold ${o.id === miseEnAvant?.id ? 'bg-kw-green-tint text-kw-green' : 'text-kw-meta'}`}
                    >
                      {o.fournisseur_nom || 'Fournisseur'}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pdl.map((l) => (
                  <tr key={l.lienId} className="border-b border-kw-border-faint">
                    <td className="p-2">
                      <span className="font-mono text-kw-sm">{l.libelle}</span>
                      <span className="ml-1.5 rounded-kw-xs bg-kw-muted px-1.5 py-px text-kw-micro font-bold text-kw-meta">
                        {l.energie}
                      </span>
                      {l.site && <span className="block text-kw-tiny text-kw-faint">{l.site}</span>}
                    </td>
                    <td className="p-2 text-right font-mono tabular-nums text-kw-meta">
                      {l.volume != null ? `${l.volume.toLocaleString('fr-FR')} MWh` : '—'}
                    </td>
                    {colonnes.map((o) => {
                      const d = o.details_par_compteur.find((x) => x.version_recommandation_compteur_id === l.lienId)
                      return (
                        <td
                          key={o.id}
                          className={`p-2 text-right font-mono tabular-nums ${o.id === miseEnAvant?.id ? 'bg-kw-green-tint font-bold' : ''}`}
                        >
                          {d?.cout_total_annuel_estime_ht != null
                            ? `${Math.round(d.cout_total_annuel_estime_ht).toLocaleString('fr-FR')} €`
                            : '—'}
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <footer className="mt-8 flex items-end justify-between gap-6 border-t-2 border-kw-ink pt-2">
            <p className="max-w-[70%] text-kw-tiny leading-snug text-kw-faint">
              Montants annuels hors taxes établis sur les volumes de référence indiqués. Un tiret
              signale une donnée non renseignée, et non un montant nul. Les prix restent soumis aux
              conditions du fournisseur et à la date de validité de son offre.
            </p>
            <div className="flex items-center gap-1.5 text-kw-tiny text-kw-faint">
              <img src={kiweePicto} alt="" className="h-4 w-auto" />
              <span className="font-semibold">Kiwee</span>
            </div>
          </footer>
        </div>
      )}
    </Dialog>
  )
}

/** L'écart entre deux budgets totaux, en euros et en pourcentage. Un fait, pas une projection. */
function ecart(offre: OffreFournisseur, reference: OffreFournisseur): string {
  const a = offre.montant_annuel_ht ?? 0
  const b = reference.montant_annuel_ht ?? 0
  const delta = Math.abs(a - b)
  const pct = b > 0 ? (delta / b) * 100 : null
  return `${Math.round(delta).toLocaleString('fr-FR')} €${pct != null ? ` (${pct.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} %)` : ''}`
}

function Etiquette({ children, vert }: { children: React.ReactNode; vert?: boolean }) {
  return (
    <span
      className={`block text-kw-micro font-bold uppercase tracking-[0.1em] ${vert ? 'text-kw-green' : 'text-kw-faint'}`}
    >
      {children}
    </span>
  )
}

/**
 * Une ligne de budget.
 *
 * MASQUÉE SI AUCUNE OFFRE NE LA RENSEIGNE : une ligne de tirets n'informe pas, et sur un document
 * client elle donne l'impression d'un travail inachevé. C'est aussi ce qui fait qu'une offre 100 %
 * électrique n'affiche aucune ligne gaz sans qu'on ait à le configurer.
 */
function LigneBudget({ titre, sousTitre, colonnes, valeur, vedette, total }: {
  titre: string
  sousTitre?: string
  colonnes: OffreFournisseur[]
  valeur: (o: OffreFournisseur) => number | null | undefined
  vedette?: string
  total?: boolean
}) {
  const valeurs = colonnes.map(valeur)
  if (valeurs.every((v) => v == null)) return null
  return (
    <tr className={total ? 'border-y-2 border-kw-ink' : 'border-b border-kw-border-faint'}>
      <td className="p-2">
        <span className={total ? 'font-extrabold' : 'text-kw-meta'}>{titre}</span>
        {sousTitre && <span className="ml-1.5 text-kw-tiny text-kw-faint">{sousTitre}</span>}
      </td>
      {valeurs.map((v, i) => {
        const enAvant = colonnes[i].id === vedette
        return (
          <td
            key={colonnes[i].id}
            className={`p-2 text-right font-mono tabular-nums ${enAvant ? 'bg-kw-green-tint' : ''} ${
              total ? `text-kw-md font-extrabold ${enAvant ? 'text-kw-green' : ''}` : ''
            }`}
          >
            {v == null ? <span className="text-kw-ghost">—</span> : `${Math.round(v).toLocaleString('fr-FR')} €`}
          </td>
        )
      })}
    </tr>
  )
}
