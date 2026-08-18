import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronDown, ChevronRight, FileCheck2, FileSignature, ExternalLink } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { useSuiteDossier } from '@/lib/data/suiteDossier'

/**
 * La suite du dossier : le mandat qui autorise, le contrat qui conclut.
 *
 * « Il faut qu'on ait accès à tout par hiérarchie, que ce ne soit pas des affichages mais des objets
 * où on peut naviguer » (Naoëlle, 18/08/2026). La fiche s'arrêtait aux offres alors que la base
 * continue — et c'est justement le bout du parcours qui manquait : la recommandation propose, le
 * mandat autorise, le contrat acte.
 *
 * LES TARIFS DU CONTRAT SONT LE MIROIR DES PRIX DE L'OFFRE. `contrats_compteurs_tarifs` porte les
 * mêmes classes temporelles que `offres_compteurs_electricite` (base, HP, HC, HPH…) plus le gaz,
 * mais côté signé. Les voir ici, à côté des offres, c'est pouvoir comparer ce qu'on avait proposé
 * avec ce qui a été contracté — sans ouvrir deux onglets.
 *
 * Le bloc entier disparaît quand il n'y a ni mandat ni contrat : sur une recommandation en cours de
 * consultation, deux sections vides n'apprendraient rien.
 */

const LIBELLE_CLASSE: Record<string, string> = {
  BASE: 'Base',
  HP: 'HP',
  HC: 'HC',
  HPH: 'HP hiver',
  HCH: 'HC hiver',
  HPE: 'HP été',
  HCE: 'HC été',
  POINTE: 'Pointe',
  GAZ: 'Gaz',
}

function jour(d: string | null): string {
  return d ? new Date(d).toLocaleDateString('fr-FR') : '—'
}

export function SuiteDuDossier({ recoId }: { recoId: string }) {
  const { data } = useSuiteDossier(recoId)
  const navigate = useNavigate()
  const [contratOuvert, setContratOuvert] = useState<string | null>(null)

  const mandats = data?.mandats ?? []
  const contrats = data?.contrats ?? []
  if (mandats.length === 0 && contrats.length === 0) return null

  return (
    <div className="rounded-[13px] border border-kw-border bg-white px-[17px] py-3.5">
      <p className="mb-2 text-kw-xs font-bold uppercase tracking-[0.08em] text-kw-faint">Suite du dossier</p>

      {mandats.length > 0 && (
        <div className="mb-3">
          <p className="mb-1 text-kw-sm font-bold uppercase tracking-wide text-kw-faint">Mandat</p>
          <div className="space-y-1">
            {mandats.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => navigate(`/mandats/${m.id}`)}
                className="flex w-full flex-wrap items-center gap-2 rounded-kw-md border border-kw-border-subtle bg-kw-subtle px-2.5 py-2 text-left hover:border-kw-border-strong"
              >
                <FileCheck2 className="h-3.5 w-3.5 shrink-0 text-kw-amber" />
                <span className="font-mono text-kw-base font-bold text-kw-ink">{m.reference || 'Mandat'}</span>
                {m.principal && <Badge tone="kiwi">Principal</Badge>}
                {m.statut && <Badge tone="neutral">{m.statut}</Badge>}
                <span className="flex-1" />
                <span className="font-mono text-kw-tiny text-kw-faint">
                  signé {jour(m.date_signature)} · valide jusqu'au {jour(m.date_fin_validite)}
                </span>
                <ExternalLink className="h-2.5 w-2.5 shrink-0 text-kw-ghost" />
              </button>
            ))}
          </div>
        </div>
      )}

      {contrats.length > 0 && (
        <div>
          <p className="mb-1 text-kw-sm font-bold uppercase tracking-wide text-kw-faint">Contrat obtenu</p>
          <div className="space-y-1.5">
            {contrats.map((c) => {
              const ouvert = contratOuvert === c.id
              const nbTarifs = c.compteurs.reduce((n, cp) => n + cp.tarifs.length, 0)
              return (
                <div key={c.id} className="rounded-kw-md border border-kw-green-border bg-kw-green-tint px-2.5 py-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <FileSignature className="h-3.5 w-3.5 shrink-0 text-kw-green" />
                    <button
                      type="button"
                      onClick={() => navigate(`/contrats/${c.id}`)}
                      className="inline-flex items-center gap-1 font-mono text-kw-base font-bold text-kw-ink hover:text-kw-green hover:underline"
                    >
                      {c.reference_fournisseur || 'Contrat'}
                      <ExternalLink className="h-2.5 w-2.5" />
                    </button>
                    {c.fournisseur_nom && <span className="text-kw-base text-kw-label">{c.fournisseur_nom}</span>}
                    {c.statut && <Badge tone="neutral">{c.statut}</Badge>}
                    <span className="flex-1" />
                    <span className="font-mono text-kw-tiny text-kw-faint">
                      {jour(c.date_debut)} → {jour(c.date_fin)}
                      {c.duree_mois != null ? ` · ${c.duree_mois} mois` : ''}
                    </span>
                  </div>

                  {c.compteurs.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setContratOuvert(ouvert ? null : c.id)}
                      className="mt-1 inline-flex items-center gap-1 text-kw-sm font-semibold text-kw-label hover:text-kw-ink"
                    >
                      {ouvert ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                      {c.compteurs.length} compteur{c.compteurs.length > 1 ? 's' : ''} contractualisé
                      {c.compteurs.length > 1 ? 's' : ''}
                      <span className="font-normal text-kw-faint">
                        ({nbTarifs} tarif{nbTarifs > 1 ? 's' : ''} enregistré{nbTarifs > 1 ? 's' : ''})
                      </span>
                    </button>
                  )}

                  {ouvert && (
                    <div className="mt-1.5 space-y-1">
                      {c.compteurs.map((cp) => (
                        <div key={cp.id} className="rounded-kw-sm border border-kw-border-subtle bg-white px-2 py-1.5">
                          <div className="flex flex-wrap items-center gap-2">
                            <button
                              type="button"
                              onClick={() => navigate(`/compteurs/${cp.compteur_id}`)}
                              className="inline-flex items-center gap-1 text-kw-base font-semibold text-kw-ink hover:text-kw-green hover:underline"
                            >
                              {cp.compteur_label || 'Compteur'}
                              <ExternalLink className="h-2.5 w-2.5" />
                            </button>
                            <span className="flex-1" />
                            <span className="font-mono text-kw-tiny text-kw-faint">
                              rattaché le {jour(cp.date_debut_rattachement)}
                            </span>
                          </div>

                          {cp.tarifs.length === 0 ? (
                            // 1788 rattachements de compteurs existent, mais la table des tarifs est
                            // vide : on le dit plutôt que de laisser une ligne muette.
                            <p className="mt-0.5 text-kw-tiny text-kw-faint">
                              Aucun tarif enregistré sur ce compteur — les prix signés n'ont jamais été saisis.
                            </p>
                          ) : (
                            cp.tarifs.map((t, i) => (
                              <div key={i} className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5">
                                {t.type_prix && (
                                  <span className="rounded-kw-xs bg-kw-muted px-1.5 py-px text-kw-micro font-bold text-kw-meta">
                                    {t.type_prix}
                                    {t.indexation ? ` · ${t.indexation}` : ''}
                                  </span>
                                )}
                                {Object.entries(t.prix_eur_mwh_par_classe).map(([classe, prix]) => (
                                  <span key={classe} className="text-kw-tiny text-kw-label">
                                    {LIBELLE_CLASSE[classe] ?? classe}{' '}
                                    <b className={cn('font-mono text-kw-base text-kw-ink')}>
                                      {prix.toLocaleString('fr-FR', { maximumFractionDigits: 2 })}
                                    </b>{' '}
                                    €/MWh
                                  </span>
                                ))}
                                {t.abonnement_annuel_ht != null && (
                                  <span className="text-kw-tiny text-kw-label">
                                    abonnement{' '}
                                    <b className="font-mono text-kw-base text-kw-ink">
                                      {t.abonnement_annuel_ht.toLocaleString('fr-FR')}
                                    </b>{' '}
                                    €/an
                                  </span>
                                )}
                              </div>
                            ))
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
