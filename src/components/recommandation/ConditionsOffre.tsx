import { useState } from 'react'
import { FileSignature, Loader2 } from 'lucide-react'
import { Dialog } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input, Label } from '@/components/ui/form'
import { useUpdateOffrePartiel } from '@/lib/data/recommandations'
import { contratSecurise, CLAUSES } from '@/lib/offres/clauses'
import { cn } from '@/lib/utils'
import type { ClausesOffre, OffreFournisseur } from '@/types/domain'

/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * LES CONDITIONS D'UNE OFFRE : SA VALIDITÉ ET SES CLAUSES
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * William, 30/09/2026, sur la proposition commerciale : les clauses « il faudra aussi laisser la
 * possibilité à Erwan, lorsqu'il renseignera les prix, de renseigner est-ce que il y a une clause
 * spécifique […] un petit formulaire, il coche ou il décoche juste s'il voit un truc ».
 *
 * À CÔTÉ DE LA SAISIE DES PRIX, et non ailleurs : Erwan lit les clauses dans la réponse du
 * fournisseur au moment même où il en recopie les prix. Un second écran, c'est un geste qu'on oublie.
 *
 * LA VALIDITÉ EST ICI AUSSI. La page 1 de la proposition l'affiche (« Valable jusqu'au ») et elle
 * était vide sur les 244 offres des dossiers ouverts (mesuré le 30/09/2026) : elle vient de la même
 * réponse du fournisseur, elle se saisit au même moment.
 *
 * « CONTRAT SÉCURISÉ » NE SE COCHE PAS : « est-ce que j'ai demandé un prix fixe ? […] fixe, ça veut
 * dire que c'est renseigné, indexé, c'est pas renseigné » (William). Il se lit ici, en clair.
 */
export function ConditionsOffre({ offre, peutModifier, signaler }: {
  offre: OffreFournisseur
  peutModifier: boolean
  signaler: (message: string) => void
}) {
  const [ouvert, setOuvert] = useState(false)
  const maj = useUpdateOffrePartiel()
  const clauses = offre.clauses ?? { tacite_reconduction: true, depot_garantie: false, engagement_consommation: false, renegociation_anticipee: false, swap: false }
  const [brouillon, setBrouillon] = useState<ClausesOffre>(clauses)
  const [validite, setValidite] = useState(offre.date_validite?.slice(0, 10) ?? '')
  const [indice, setIndice] = useState(offre.indice_indexation ?? '')
  // Ce qui a été changé par rapport au défaut de William : c'est ce que le bouton annonce.
  const particularites = CLAUSES.filter((c) => clauses[c.cle] !== c.defaut).length
  const securise = contratSecurise(offre.type_prix)

  async function enregistrer() {
    try {
      await maj.mutateAsync({
        offreId: offre.id,
        patch: {
          date_validite: validite || null,
          // L'indice n'a de sens que sur une offre indexée : sur une offre fixe, il reste vide.
          indice_indexation: securise ? null : indice.trim() || null,
          clause_tacite_reconduction: brouillon.tacite_reconduction,
          clause_depot_garantie: brouillon.depot_garantie,
          clause_engagement_consommation: brouillon.engagement_consommation,
          clause_renegociation_anticipee: brouillon.renegociation_anticipee,
          clause_swap: brouillon.swap,
        },
      })
      signaler('✓ Conditions enregistrées')
      setOuvert(false)
    } catch (e) {
      signaler(`Erreur : ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setBrouillon(clauses); setValidite(offre.date_validite?.slice(0, 10) ?? ''); setIndice(offre.indice_indexation ?? ''); setOuvert(true) }}
        className={cn(
          'inline-flex items-center gap-1 rounded-km border px-2 py-1 text-km-label font-semibold',
          particularites > 0 ? 'border-km-amber bg-km-amber-soft text-km-amber' : 'border-km-line text-km-muted hover:text-km-text',
        )}
        title="Validité de l’offre et clauses contractuelles"
      >
        <FileSignature className="h-3 w-3" />
        Conditions{particularites > 0 ? ` · ${particularites}` : ''}
      </button>

      {ouvert && (
        <Dialog open onClose={() => setOuvert(false)} title={`Conditions de l’offre ${offre.fournisseur_nom}`}
          description="Ce que dit la réponse du fournisseur, en plus de ses prix. Elles apparaissent dans la proposition au client.">
          <div className="space-y-4">
            <div>
              <Label htmlFor={`validite-${offre.id}`}>Offre valable jusqu’au</Label>
              <Input id={`validite-${offre.id}`} type="date" className="w-[180px]" disabled={!peutModifier} value={validite} onChange={(e) => setValidite(e.target.value)} />
            </div>

            {/* L'INDICE D'UNE OFFRE INDEXÉE (30/09/2026) : la proposition écrit « Indexé PEG ». C'est ce
                qui dit au client sur quoi son prix va bouger. */}
            {!securise && (
              <div>
                <Label htmlFor={`indice-${offre.id}`}>Indice d’indexation</Label>
                <Input id={`indice-${offre.id}`} className="w-[220px]" list={`indices-${offre.id}`} disabled={!peutModifier} value={indice}
                  onChange={(e) => setIndice(e.target.value)} placeholder="PEG, TTF, Spot…" />
                <datalist id={`indices-${offre.id}`}>
                  {['PEG', 'PEG DA', 'TTF', 'EPEX Spot', 'Spot'].map((v) => <option key={v} value={v} />)}
                </datalist>
              </div>
            )}

            <div>
              <p className="mb-1.5 text-km-label font-semibold text-km-muted">Clauses</p>
              <p className="mb-2 flex items-center gap-2 rounded-km bg-km-soft px-3 py-2 text-km-body">
                <span className={cn('flex h-4 w-4 items-center justify-center rounded border text-[10px]', securise ? 'border-km-green bg-km-green text-white' : 'border-km-line')}>{securise ? '✓' : ''}</span>
                <span><strong>Contrat sécurisé</strong> <span className="text-km-muted">— {securise ? 'oui : le prix est fixe' : 'non : le prix n’est pas fixe'}. Se déduit du type de prix.</span></span>
              </p>
              <ul className="space-y-1.5">
                {CLAUSES.map((c) => (
                  <li key={c.cle}>
                    <label className={cn('flex cursor-pointer items-start gap-2 rounded-km border px-3 py-2', brouillon[c.cle] ? (c.protection ? 'border-km-green' : 'border-km-amber') : 'border-km-line')}>
                      <input type="checkbox" className="mt-0.5" disabled={!peutModifier} checked={brouillon[c.cle]} onChange={(e) => setBrouillon({ ...brouillon, [c.cle]: e.target.checked })} />
                      <span>
                        <span className="block text-km-body font-semibold text-km-text">{c.libelle}</span>
                        <span className="block text-km-label text-km-muted">{c.aide}</span>
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            </div>

            <div className="flex justify-end gap-2 border-t border-km-line pt-3">
              <Button onClick={() => setOuvert(false)}>Annuler</Button>
              {peutModifier && (
                <Button variant="primary" disabled={maj.isPending} onClick={() => void enregistrer()}>
                  {maj.isPending && <Loader2 className="h-4 w-4 animate-spin" />} Enregistrer
                </Button>
              )}
            </div>
          </div>
        </Dialog>
      )}
    </>
  )
}
