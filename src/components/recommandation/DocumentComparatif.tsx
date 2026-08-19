import { useMemo } from 'react'
import { Dialog } from '@/components/ui/dialog'
import { Printer } from 'lucide-react'
import { somme } from '@/lib/calculs/prixOffre'
import { libelleOffre } from '@/lib/data/recommandations'
import type {
  Compte,
  Compteur,
  OffreFournisseur,
  Recommandation,
  VersionRecommandation,
} from '@/types/domain'

/**
 * Le document comparatif d'une version : ce qu'on envoie au client pour qu'il choisisse.
 *
 * DEMANDE DE MICHEL, 19/08/2026 : « quand le commercial a fini de générer sa version, il va pouvoir
 * générer un document comparatif. On a notre comparatif à nous, qui est dans la version — demande à
 * Claude une proposition. » Il cadre l'ambition lui-même : « ce sont des documents temporaires, ce ne
 * sera pas ce qu'on va utiliser bien plus tard. Mais au moins on a déjà quelque chose s'il y a une
 * urgence à générer un document. »
 *
 * PAS DE GÉNÉRATEUR DE PDF. Le document est du HTML mis en page pour l'impression, et c'est le
 * navigateur qui fabrique le PDF ou imprime. Une bibliothèque PDF aurait ajouté 300 Ko au bundle et
 * un format à maintenir, pour un document que Michel annonce comme jetable. `@media print` masque
 * l'application autour et déroule le document sur autant de pages qu'il faut.
 *
 * CE QU'IL MONTRE, et rien de plus : une colonne par offre chiffrée, les budgets tels que les
 * formules les calculent, et le détail par point de livraison. Les colonnes sont triées du budget
 * total le plus faible au plus élevé — c'est l'ordre dans lequel un client lit un comparatif.
 *
 * CE QU'IL NE FAIT PAS : inventer des chiffres. Une offre sans budget total n'a pas de colonne, et si
 * aucune offre n'est chiffrée le document le dit au lieu de sortir un tableau vide. Le rappel de
 * l'économie n'apparaît que si quelqu'un l'a saisie — elle n'est pas calculable tant que l'offre de
 * référence dont parle Michel n'existe pas.
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
  const colonnes = useMemo(() => {
    const offres = version.optimisations.flatMap((o) => o.offres).filter((o) => o.montant_annuel_ht != null)
    return offres.sort((a, b) => (a.montant_annuel_ht ?? 0) - (b.montant_annuel_ht ?? 0))
  }, [version])

  const lignesPdl = useMemo(() => {
    // Un point de livraison par ligne, dans l'ordre du périmètre de la version.
    return version.compteurs.map((lien) => {
      const compteur = parId.get(lien.compteur_id)
      return {
        lienId: lien.lien_id,
        libelle: compteur?.numero_pdl || compteur?.utilisation || lien.label || 'Compteur',
        precision: compteur?.type_energie === 'gaz' ? 'Gaz' : 'Électricité',
        volume: compteur?.type_energie === 'gaz' ? compteur?.car_mwh : compteur?.consommation_annuelle_mwh,
      }
    })
  }, [version, parId])

  function detailDe(offre: OffreFournisseur, lienId: string) {
    return offre.details_par_compteur.find((d) => d.version_recommandation_compteur_id === lienId)
  }

  function budgets(offre: OffreFournisseur) {
    const cumul = (extrait: (d: OffreFournisseur['details_par_compteur'][number]) => number | null | undefined) =>
      offre.details_par_compteur.reduce<number | null>((t, d) => somme(t, extrait(d)), null)
    return {
      energie: cumul((d) => d.cout_fourniture_annuel_ht),
      abonnementGaz: cumul((d) => d.prix_gaz?.abonnement_fourniture_annuel_ht),
      turpe: cumul((d) => d.prix_electricite?.prix_turpe_annuel_ht),
      contribution: cumul((d) => (d.prix_gaz ? d.cout_acheminement_annuel_ht : null)),
      total: offre.montant_annuel_ht,
      economie: offre.economie_annuelle_estimee,
    }
  }

  const aucuneOffre = colonnes.length === 0

  return (
    <Dialog
      open={ouvert}
      onClose={onFermer}
      title="Document comparatif"
      description={`Version ${version.numero_version ?? ''} — ${colonnes.length} offre${colonnes.length > 1 ? 's' : ''} chiffrée${colonnes.length > 1 ? 's' : ''}`}
      className="max-w-5xl print:max-w-none print:border-0 print:p-0 print:shadow-none"
    >
      <div className="mb-3 flex items-center gap-2 border-b border-kw-border pb-3 print:hidden">
        <p className="mr-auto text-kw-sm text-kw-meta">
          Document provisoire, à imprimer ou enregistrer en PDF depuis la fenêtre d'impression.
        </p>
        <button
          type="button"
          onClick={() => window.print()}
          disabled={aucuneOffre}
          className="inline-flex items-center gap-1.5 rounded-kw-md bg-kw-green px-3 py-[7px] text-kw-sm font-bold text-white hover:brightness-95 disabled:opacity-50"
        >
          <Printer className="h-3.5 w-3.5" />
          Imprimer / PDF
        </button>
      </div>

      {aucuneOffre ? (
        <p className="rounded-kw-lg border border-dashed border-kw-border-strong bg-kw-subtle p-4 text-kw-base text-kw-meta">
          Aucune offre de cette version n'a de budget total. Le comparatif se remplit dès qu'un prix
          est saisi sur un point de livraison : le budget total de chaque offre en découle.
        </p>
      ) : (
        /* `document-comparatif` est la cible du @media print : tout le reste de la page disparaît. */
        <div id="document-comparatif" className="text-kw-base text-kw-ink">
          <header className="mb-4 border-b-2 border-kw-ink pb-2">
            <h1 className="font-display text-kw-lg font-extrabold">Comparatif d'offres</h1>
            <p className="mt-0.5 text-kw-sm text-kw-meta">
              {compte?.nom ?? reco.compte_nom ?? ''}
              {version.numero_version != null && ` · Version ${version.numero_version}`}
              {reco.reference && ` · ${reco.reference}`}
            </p>
            <p className="text-kw-tiny text-kw-faint">
              Édité le {new Date().toLocaleDateString('fr-FR')} · {lignesPdl.length} point
              {lignesPdl.length > 1 ? 's' : ''} de livraison · montants annuels HT
            </p>
          </header>

          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-kw-sm">
              <thead>
                <tr>
                  <th className="border-b border-kw-border p-2 text-left font-bold">Offre</th>
                  {colonnes.map((o) => (
                    <th key={o.id} className="border-b border-kw-border p-2 text-left align-bottom">
                      <span className="block font-extrabold text-kw-ink">{o.fournisseur_nom || 'Fournisseur'}</span>
                      <span className="block font-normal text-kw-meta">
                        {libelleOffre(o.duree_mois, o.type_prix)}
                      </span>
                      {o.est_offre_recommandee && (
                        <span className="mt-0.5 inline-block rounded-kw-xs bg-kw-green-light px-1.5 py-px text-kw-micro font-bold uppercase tracking-[0.05em] text-kw-green">
                          Recommandée
                        </span>
                      )}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <LigneBudget titre="Budget énergie" colonnes={colonnes} valeur={(o) => budgets(o).energie} />
                <LigneBudget titre="Budget abonnement gaz" colonnes={colonnes} valeur={(o) => budgets(o).abonnementGaz} />
                <LigneBudget titre="Budget TURPE" colonnes={colonnes} valeur={(o) => budgets(o).turpe} />
                <LigneBudget titre="Budget contribution" colonnes={colonnes} valeur={(o) => budgets(o).contribution} />
                <LigneBudget titre="Budget total" colonnes={colonnes} valeur={(o) => budgets(o).total} fort />
                <LigneBudget titre="Économie estimée" colonnes={colonnes} valeur={(o) => budgets(o).economie} />
              </tbody>
            </table>
          </div>

          {/* Le détail par point de livraison : c'est là que le client vérifie que le périmètre est
              bien le sien, et c'est la question qu'il pose toujours en premier. */}
          <h2 className="mt-6 mb-1.5 text-kw-base font-extrabold">Détail par point de livraison</h2>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-kw-sm">
              <thead>
                <tr>
                  <th className="border-b border-kw-border p-2 text-left font-bold">Point de livraison</th>
                  <th className="border-b border-kw-border p-2 text-right font-bold">Volume</th>
                  {colonnes.map((o) => (
                    <th key={o.id} className="border-b border-kw-border p-2 text-right font-bold">
                      {o.fournisseur_nom || 'Fournisseur'}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {lignesPdl.map((l) => (
                  <tr key={l.lienId} className="border-b border-kw-border-faint">
                    <td className="p-2">
                      <span className="font-mono">{l.libelle}</span>
                      <span className="ml-1.5 text-kw-tiny text-kw-faint">{l.precision}</span>
                    </td>
                    <td className="p-2 text-right font-mono tabular-nums text-kw-meta">
                      {l.volume != null ? `${l.volume.toLocaleString('fr-FR')} MWh` : '—'}
                    </td>
                    {colonnes.map((o) => {
                      const d = detailDe(o, l.lienId)
                      return (
                        <td key={o.id} className="p-2 text-right font-mono tabular-nums">
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

          <footer className="mt-6 border-t border-kw-border pt-2 text-kw-tiny leading-snug text-kw-faint">
            Montants annuels hors taxes, établis sur les volumes de référence indiqués. Un tiret
            signale une donnée non renseignée et non un montant nul. Document provisoire à usage
            interne.
          </footer>
        </div>
      )}
    </Dialog>
  )
}

/** Une ligne de budget. Masquée si aucune offre ne la renseigne — une ligne de tirets n'informe pas. */
function LigneBudget({ titre, colonnes, valeur, fort }: {
  titre: string
  colonnes: OffreFournisseur[]
  valeur: (o: OffreFournisseur) => number | null | undefined
  fort?: boolean
}) {
  const valeurs = colonnes.map(valeur)
  if (valeurs.every((v) => v == null)) return null
  return (
    <tr className={fort ? 'border-y-2 border-kw-ink bg-kw-subtle' : 'border-b border-kw-border-faint'}>
      <td className={`p-2 ${fort ? 'font-extrabold' : 'text-kw-meta'}`}>{titre}</td>
      {valeurs.map((v, i) => (
        <td
          key={colonnes[i].id}
          className={`p-2 text-right font-mono tabular-nums ${fort ? 'text-kw-md font-extrabold' : ''}`}
        >
          {v == null ? '—' : `${Math.round(v).toLocaleString('fr-FR')} €`}
        </td>
      ))}
    </tr>
  )
}
