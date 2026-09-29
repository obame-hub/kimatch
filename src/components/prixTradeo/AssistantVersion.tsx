import { useMemo, useState } from 'react'
import { Loader2, Plus } from 'lucide-react'
import { Dialog } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/form'
import { ChoixParRecherche } from '@/components/ui/choix-recherche'
import { useRecommandation } from '@/lib/data/recommandations'
import { useCompteurs } from '@/lib/data/compteurs'
import { useRecommandationsPourParcours } from '@/lib/data/parcoursPrix'
import { CotationWizard } from '@/components/recommandation/DialoguesReco'
import { ParcoursVersion } from '@/components/parcoursPrix/ParcoursVersion'
import { cn } from '@/lib/utils'
import { Explication } from './assistant'

/**
 * « PRÉPARER UNE VERSION » — le choix du dossier, puis le parcours de prix pas à pas.
 *
 * LA RECHERCHE REMPLACE LA LISTE. Naoëlle, 29/09/2026 : « je veux pas que ce soit des listes comme
 * ça qui prennent tout l'écran, je veux des barres de recherche avec des propositions ». C'est
 * `ChoixParRecherche`, le composant qu'elle avait déjà fait poser le 21/08 : rien ne s'affiche avant
 * la première lettre.
 *
 * ÉCRITURE SUR LE SEUL DOSSIER D'ESSAI (compte KIWEE ENERGIE FRANCE) : créer une version sur un vrai
 * dossier fait expirer celle du commercial. Les vrais dossiers s'ouvrent en lecture seule.
 */
export function AssistantVersion({ onFermer }: { onFermer: () => void }) {
  const { data: recos } = useRecommandationsPourParcours()
  const [recoId, setRecoId] = useState('')
  const [versionId, setVersionId] = useState('')
  const [wizard, setWizard] = useState(false)
  const { data: reco, isLoading } = useRecommandation(recoId || undefined)
  const { data: compteurs } = useCompteurs()
  const choisie = recos?.find((r) => r.id === recoId)
  const ecriture = Boolean(choisie?.ecriture)

  const version = useMemo(
    () => reco ? (reco.versions.find((v) => v.id === versionId) ?? reco.versions.find((v) => v.version_actuelle) ?? reco.versions[0] ?? null) : null,
    [reco, versionId],
  )
  const compteursReco = useMemo(() => {
    const ids = new Set([...(reco?.compteur_ids ?? []), ...(version?.compteur_ids ?? [])])
    return (compteurs ?? []).filter((c) => ids.has(c.id))
  }, [compteurs, reco?.compteur_ids, version?.compteur_ids])

  return (
    <Dialog open onClose={onFermer} title="Préparer une version" description="Étape 2 du travail : transformer les prix reçus en proposition pour le client." className="max-w-2xl">
      {!recoId || !reco ? (
        <>
          <Explication>
            Choisissez le dossier. Les dossiers d’essai du compte <strong>KIWEE ENERGIE FRANCE</strong> peuvent être modifiés ; les
            vrais dossiers s’ouvrent en lecture seule.
          </Explication>
          <Label>Dossier</Label>
          <ChoixParRecherche
            items={recos ?? []}
            valeur={recoId}
            onChoisir={(r) => { setRecoId(r?.id ?? ''); setVersionId('') }}
            placeholder="Tapez le nom du client ou du dossier…"
            principal={(r) => r.compte_nom ?? r.nom}
            secondaire={(r) => (r.ecriture ? 'essai · modifiable' : r.nom)}
            filtre={(r, q) => `${r.compte_nom ?? ''} ${r.nom}`.toLowerCase().includes(q)}
            totalLibelle={`${recos?.length ?? '…'} dossiers ouverts`}
          />
          {recoId && isLoading && <p className="mt-3 flex items-center gap-2 text-km-muted"><Loader2 className="h-4 w-4 animate-spin" /> Lecture du dossier…</p>}
        </>
      ) : (
        <>
          <div className="mb-3 flex flex-wrap items-center gap-2 text-km-body">
            <span className="font-semibold text-km-text">{choisie?.compte_nom ?? reco.compte_nom}</span>
            <span className="text-km-muted">· {reco.titre}</span>
            <button type="button" className="ml-auto text-km-label text-km-green underline" onClick={() => { setRecoId(''); setVersionId('') }}>changer de dossier</button>
          </div>
          {reco.versions.length > 1 && (
            <div className="mb-3 flex flex-wrap gap-1.5">
              {reco.versions.map((v) => (
                <button key={v.id} type="button" onClick={() => setVersionId(v.id)}
                  className={cn('rounded-km-pill border px-2.5 py-1 text-km-label', v.id === version?.id ? 'border-km-green bg-km-green-soft text-km-green' : 'border-km-line text-km-muted')}>
                  {v.nom ?? `V${v.numero_version}`}{v.version_actuelle ? ' · actuelle' : ''}
                </button>
              ))}
            </div>
          )}
          {ecriture && (
            <Button size="sm" className="mb-3" onClick={() => setWizard(true)}><Plus className="h-3.5 w-3.5" /> Créer une nouvelle version</Button>
          )}
          {version
            ? <ParcoursVersion key={version.id} reco={reco} version={version} compteurs={compteursReco} peutModifier={ecriture} />
            : <p className="text-km-muted">Ce dossier n’a pas encore de version.</p>}
        </>
      )}
      {wizard && reco && <CotationWizard open onClose={() => setWizard(false)} reco={reco} onCree={(id) => { setVersionId(id); setWizard(false) }} />}
    </Dialog>
  )
}
