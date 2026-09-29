import { useMemo, useState } from 'react'
import { Loader2, Plus } from 'lucide-react'
import { Dialog } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/form'
import { ChoixParRecherche } from '@/components/ui/choix-recherche'
import { useRecommandation } from '@/lib/data/recommandations'
import { useCompteurs } from '@/lib/data/compteurs'
import { useRecommandationsPourParcours, type MandatDuDossier } from '@/lib/data/parcoursPrix'
import { Badge } from '@/components/ui/badge'
import { CotationWizard } from '@/components/recommandation/DialoguesReco'
import { ParcoursVersion } from '@/components/parcoursPrix/ParcoursVersion'
import { cn } from '@/lib/utils'
import { EnteteEtapes, Explication, PiedAssistant } from './assistant'
import { PhaseTradeo } from './PhaseTradeo'

/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * « PRÉPARER LES PRIX D'UN DOSSIER » — UN SEUL CHEMIN
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * Naoëlle, 29/09/2026 : avec deux assistants, « on ne sait pas si on doit cliquer à l'étape 1 ou à
 * l'étape 2 », et passer de l'un à l'autre obligeait à « mettre retour, retour, retour ». Les deux
 * travaillaient sur le même dossier et se suivaient toujours : ce n'étaient pas deux outils, c'était
 * un seul chemin coupé en deux.
 *
 *   le dossier → Tradeo (Kimatch dit où il en est) → la version → les offres → calculer → valider
 *
 * On choisit le dossier UNE fois. Pendant l'attente de Tradeo, on ferme ; en rouvrant le même
 * dossier, Kimatch relit l'état et reprend au bon endroit — il n'y a rien à mémoriser.
 */

const AVANT_TRADEO = ['Le dossier']
const TOUTES = [...AVANT_TRADEO, 'Tradeo', 'La version', 'Les offres', 'Calculer', 'Valider']

export function AssistantPrix({ onFermer, siretInitial }: { onFermer: () => void; siretInitial?: string }) {
  const { data: recos } = useRecommandationsPourParcours()
  const [recoId, setRecoId] = useState('')
  const [versionId, setVersionId] = useState('')
  const [phase, setPhase] = useState<'dossier' | 'tradeo' | 'version'>('dossier')
  const [wizard, setWizard] = useState(false)
  const { data: reco, isLoading } = useRecommandation(recoId || undefined)
  const { data: compteurs } = useCompteurs()
  const choisie = recos?.find((r) => r.id === recoId)
  const ecriture = Boolean(choisie?.ecriture)

  // Ouvert depuis « Vos demandes » : les dossiers de cette société d'abord, sans les rechercher.
  const duSiret = useMemo(() => (siretInitial ? (recos ?? []).filter((r) => r.siret === siretInitial) : []), [recos, siretInitial])

  const version = useMemo(
    () => (reco ? (reco.versions.find((v) => v.id === versionId) ?? reco.versions.find((v) => v.version_actuelle) ?? reco.versions[0] ?? null) : null),
    [reco, versionId],
  )
  const compteursReco = useMemo(() => {
    const ids = new Set([...(reco?.compteur_ids ?? []), ...(version?.compteur_ids ?? [])])
    return (compteurs ?? []).filter((c) => ids.has(c.id))
  }, [compteurs, reco?.compteur_ids, version?.compteur_ids])

  const choisir = (id: string) => { setRecoId(id); setVersionId(''); setPhase('dossier') }

  return (
    <Dialog
      open
      onClose={onFermer}
      title="Préparer les prix d’un dossier"
      description="Demander les prix aux fournisseurs, puis en faire la proposition pour le client."
      className="max-w-2xl"
    >
      {phase === 'dossier' && (
        <>
          <EnteteEtapes titres={TOUTES} courante={0} />
          <Explication>
            Choisissez le dossier du client. Kimatch regardera ensuite tout seul où il en est chez Tradeo, et vous dira quoi faire.
          </Explication>

          {duSiret.length > 0 && !recoId && (
            <div className="mb-3">
              <p className="mb-1.5 text-km-label text-km-muted">Les dossiers de cette société :</p>
              <div className="flex flex-col gap-1.5">
                {duSiret.map((r) => (
                  <button key={r.id} type="button" onClick={() => choisir(r.id)} className="rounded-km border border-km-line px-3 py-2 text-left text-km-body hover:border-km-green">
                    <span className="font-semibold">{r.compte_nom}</span> <span className="text-km-muted">· {r.nom}</span>
                    <span className="mt-1 block"><PastilleMandat mandat={r.mandat} /></span>
                  </button>
                ))}
              </div>
            </div>
          )}

          <Label>Dossier</Label>
          <ChoixParRecherche
            items={recos ?? []}
            valeur={recoId}
            onChoisir={(r) => (r ? choisir(r.id) : setRecoId(''))}
            placeholder="Tapez le nom du client ou du dossier…"
            principal={(r) => r.compte_nom ?? r.nom}
            secondaire={(r) => `${texteMandat(r.mandat)} · ${r.ecriture ? 'dossier d’essai' : r.nom}`}
            filtre={(r, q) => `${r.compte_nom ?? ''} ${r.nom}`.toLowerCase().includes(q)}
            totalLibelle={`${recos?.length ?? '…'} dossiers ouverts`}
          />

          {choisie && <p className="mt-2"><PastilleMandat mandat={choisie.mandat} detaillee /></p>}

          {recoId && isLoading && <p className="mt-3 flex items-center gap-2 text-km-muted"><Loader2 className="h-4 w-4 animate-spin" /> Lecture du dossier…</p>}

          {reco && reco.versions.length > 1 && (
            <div className="mt-3">
              <p className="mb-1.5 text-km-label text-km-muted">Version :</p>
              <div className="flex flex-wrap gap-1.5">
                {reco.versions.map((v) => (
                  <button key={v.id} type="button" onClick={() => setVersionId(v.id)}
                    className={cn('rounded-km-pill border px-2.5 py-1 text-km-label', v.id === version?.id ? 'border-km-green bg-km-green-soft text-km-green' : 'border-km-line text-km-muted')}>
                    {v.nom ?? `V${v.numero_version}`}{v.version_actuelle ? ' · actuelle' : ''}
                  </button>
                ))}
              </div>
            </div>
          )}
          {reco && !version && <p className="mt-3 text-km-muted">Ce dossier n’a pas encore de version.</p>}
          {reco && !ecriture && (
            <p className="mt-3 text-km-label text-km-muted">Dossier réel : Tradeo peut être interrogé, mais la version s’ouvrira en lecture seule.</p>
          )}

          <PiedAssistant>
            {reco && ecriture && <Button onClick={() => setWizard(true)}><Plus className="h-4 w-4" /> Nouvelle version</Button>}
            <Button variant="primary" disabled={!version} onClick={() => setPhase('tradeo')}>Suivant</Button>
          </PiedAssistant>
        </>
      )}

      {phase === 'tradeo' && version && (
        <PhaseTradeo versionId={version.id} avant={{ titres: AVANT_TRADEO, onRetour: () => setPhase('dossier') }} onContinuer={() => setPhase('version')} />
      )}

      {phase === 'version' && reco && version && (
        <ParcoursVersion
          key={version.id}
          reco={reco}
          version={version}
          compteurs={compteursReco}
          peutModifier={ecriture}
          avant={{ titres: [...AVANT_TRADEO, 'Tradeo'], onRetour: () => setPhase('tradeo') }}
        />
      )}

      {wizard && reco && <CotationWizard open onClose={() => setWizard(false)} reco={reco} onCree={(id) => { setVersionId(id); setWizard(false) }} />}
    </Dialog>
  )
}

/**
 * LE MANDAT, VISIBLE DÈS LA RECHERCHE. Naoëlle, 29/09/2026 : « pour rassurer William et Michel ».
 * Le mandat est l'autorisation du client : sans lui, on n'a pas le droit de demander des prix.
 */
function texteMandat(m: MandatDuDossier): string {
  if (m.etat === 'ACTIF') return '✓ mandat actif'
  if (m.etat === 'PARTIEL') return `mandat sur ${m.couverts}/${m.total} compteurs`
  if (m.etat === 'AUCUN') return '✗ sans mandat actif'
  return 'aucun compteur'
}

function PastilleMandat({ mandat, detaillee = false }: { mandat: MandatDuDossier; detaillee?: boolean }) {
  const fin = mandat.fin ? ` jusqu’au ${new Date(`${mandat.fin}T12:00:00`).toLocaleDateString('fr-FR')}` : ''
  if (mandat.etat === 'ACTIF') {
    return <Badge tone="green">✓ Mandat actif{detaillee && mandat.reference ? ` · ${mandat.reference}${fin}` : ''}</Badge>
  }
  if (mandat.etat === 'PARTIEL') {
    return <Badge tone="amber">Mandat actif sur {mandat.couverts} compteur{mandat.couverts > 1 ? 's' : ''} sur {mandat.total}{detaillee ? ' : seuls ceux-là partiront chez Tradeo' : ''}</Badge>
  }
  if (mandat.etat === 'AUCUN') {
    return <Badge tone="red">✗ Sans mandat actif{detaillee ? ' : on ne peut pas demander de prix à Tradeo' : ''}</Badge>
  }
  return <Badge>Aucun compteur dans la version</Badge>
}
