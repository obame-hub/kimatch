import { useMemo, useState } from 'react'
import { Loader2, Lock, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label, Select } from '@/components/ui/form'
import { useRecommandation } from '@/lib/data/recommandations'
import { useCompteurs } from '@/lib/data/compteurs'
import { useRecommandationsPourParcours } from '@/lib/data/parcoursPrix'
import { CotationWizard } from '@/components/recommandation/DialoguesReco'
import { ParcoursVersion } from '@/components/parcoursPrix/ParcoursVersion'
import { Aide } from './commun'

/**
 * LE PARCOURS COMMERCIAL COMPLET, dans le banc. Naoëlle, 28/09/2026 : William « aura juste à
 * déplacer le composant » — c'est `ParcoursVersion`, monté ici sur les mêmes objets que la fiche.
 *
 * ÉCRITURE SUR LE SEUL DOSSIER D'ESSAI (compte KIWEE ENERGIE FRANCE), par décision de Naoëlle le
 * même jour : créer une version sur un vrai dossier fait expirer celle du commercial. Les autres
 * dossiers s'ouvrent en lecture, pour voir l'état de leurs offres sans rien toucher.
 */
export function EtapeParcours({ recoInitiale, onChoix }: { recoInitiale: string | null; onChoix: (recoId: string, versionId?: string) => void }) {
  const { data: recos, isLoading } = useRecommandationsPourParcours()
  const [recoId, setRecoId] = useState(recoInitiale ?? '')
  const [versionId, setVersionId] = useState<string>('')
  const [wizard, setWizard] = useState(false)
  const { data: reco, isLoading: chargeReco } = useRecommandation(recoId || undefined)
  const { data: compteurs } = useCompteurs()
  const choisie = recos?.find((r) => r.id === recoId)
  const ecriture = Boolean(choisie?.ecriture)

  const version = useMemo(() => {
    if (!reco) return null
    return reco.versions.find((v) => v.id === versionId) ?? reco.versions.find((v) => v.version_actuelle) ?? reco.versions[0] ?? null
  }, [reco, versionId])

  const compteursReco = useMemo(() => {
    const ids = new Set([...(reco?.compteur_ids ?? []), ...(version?.compteur_ids ?? [])])
    return (compteurs ?? []).filter((c) => ids.has(c.id))
  }, [compteurs, reco?.compteur_ids, version?.compteur_ids])

  const essais = (recos ?? []).filter((r) => r.ecriture)
  const autres = (recos ?? []).filter((r) => !r.ecriture)

  return (
    <div>
      <Aide>
        Le parcours de Michel du 28/09, de bout en bout : version, état des offres, calcul, arrivée des prix, validation et
        document. Il écrit en base pour de vrai, et <strong>seulement sur les dossiers du compte KIWEE ENERGIE FRANCE</strong>.
        Les vrais dossiers s’ouvrent en lecture seule.
      </Aide>

      <div className="flex flex-wrap items-end gap-3">
        <div>
          <Label htmlFor="parcours-reco">Recommandation</Label>
          <Select id="parcours-reco" className="w-[420px] max-w-full" value={recoId} onChange={(e) => { setRecoId(e.target.value); setVersionId(''); onChoix(e.target.value) }}>
            <option value="">{isLoading ? 'Chargement…' : 'Choisir un dossier…'}</option>
            <optgroup label="Dossiers d’essai — écriture">
              {essais.map((r) => <option key={r.id} value={r.id}>{r.nom}</option>)}
            </optgroup>
            <optgroup label="Dossiers en cours — lecture seule">
              {autres.map((r) => <option key={r.id} value={r.id}>{r.compte_nom ?? '—'} · {r.nom}</option>)}
            </optgroup>
          </Select>
        </div>
        {reco && reco.versions.length > 0 && (
          <div>
            <Label htmlFor="parcours-version">Version</Label>
            <Select id="parcours-version" className="w-[220px]" value={version?.id ?? ''} onChange={(e) => { setVersionId(e.target.value); onChoix(recoId, e.target.value) }}>
              {reco.versions.map((v) => <option key={v.id} value={v.id}>{v.nom ?? `V${v.numero_version}`} · {v.statut}{v.version_actuelle ? ' · actuelle' : ''}</option>)}
            </Select>
          </div>
        )}
        {reco && ecriture && (
          <Button onClick={() => setWizard(true)}><Plus className="h-4 w-4" /> Créer une version</Button>
        )}
        {reco && !ecriture && <span className="flex items-center gap-1.5 pb-2 text-km-label text-km-muted"><Lock className="h-3.5 w-3.5" /> lecture seule</span>}
      </div>

      {chargeReco && recoId && <p className="mt-4 flex items-center gap-2 text-km-muted"><Loader2 className="h-4 w-4 animate-spin" /> Lecture du dossier…</p>}
      {reco && !version && <p className="mt-4 text-km-muted">Ce dossier n’a pas encore de version.{ecriture ? ' Créez-en une.' : ''}</p>}

      {reco && version && (
        <div className="mt-5">
          <ParcoursVersion reco={reco} version={version} compteurs={compteursReco} peutModifier={ecriture} />
        </div>
      )}

      {wizard && reco && (
        <CotationWizard open onClose={() => setWizard(false)} reco={reco} onCree={(id) => { setVersionId(id); setWizard(false); onChoix(recoId, id) }} />
      )}
    </div>
  )
}
