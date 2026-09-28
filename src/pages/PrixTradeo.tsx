import { useSearchParams } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import { TitreOnglet } from '@/components/layout/TitreOnglet'
import { PageHeader } from '@/components/ui/page-header'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { useEtatTradeo, useOuvreBancTradeo } from '@/lib/data/tradeo'
import { EtapeDeclarer } from '@/components/prixTradeo/EtapeDeclarer'
import { EtapeSuivre } from '@/components/prixTradeo/EtapeSuivre'
import { EtapeCalculer } from '@/components/prixTradeo/EtapeCalculer'
import { Journal } from '@/components/prixTradeo/Journal'
import { EtapeParcours } from '@/components/prixTradeo/EtapeParcours'
import PageIntrouvable from '@/pages/PageIntrouvable'

/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * PRIX TRADEO — LE BANC D'ESSAI DE L'API ENERGIEX
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * Naoëlle, 28/09/2026 : « créer un truc qui s'appelle pricing et qui serait visible juste de lui et
 * moi […] un onglet en dessous de cockpit […] où il va pouvoir tester les prix ». Elle ne branche
 * pas les prix sur les versions : « ça, je vais le laisser à William ».
 *
 * Cette page n'écrit donc dans AUCUNE table métier de Kimatch. Elle dépose des demandes sur la
 * pré-production de Tradeo, relit ce qui revient, et montre les prix unitaires que William devra
 * stocker. L'onglet « Pricing » existe déjà pour autre chose ; celui-ci s'appelle « Prix Tradeo ».
 *
 * RÉSERVÉE À DEUX PERSONNES par `testeurs_tradeo`. Le rail cache l'entrée ; c'est `api/tradeo` qui
 * refuse l'appel. Une adresse tapée à la main tombe sur la page introuvable, comme partout ailleurs
 * où l'on ne dit pas qu'une chose existe.
 */

const ETAPES = [
  { cle: 'parcours', libelle: 'Parcours commercial' },
  { cle: 'declarer', libelle: '1. Déclarer un dossier' },
  { cle: 'suivre', libelle: '2. Suivre les demandes' },
  { cle: 'calculer', libelle: '3. Calculer les prix' },
  { cle: 'journal', libelle: 'Journal' },
] as const
type Etape = (typeof ETAPES)[number]['cle']

export default function PrixTradeo() {
  const { data: ouvre, isLoading } = useOuvreBancTradeo()
  const [params, setParams] = useSearchParams()
  const etape = (ETAPES.find((e) => e.cle === params.get('etape'))?.cle ?? 'parcours') as Etape
  const siret = params.get('siret') ?? ''
  const energie = params.get('energie') === 'GAZ' ? 'GAZ' : 'ELEC'

  const aller = (cle: Etape, extra: Record<string, string> = {}) =>
    setParams((p) => {
      const n = new URLSearchParams(p)
      n.set('etape', cle)
      for (const [k, v] of Object.entries(extra)) n.set(k, v)
      return n
    })

  if (isLoading) return <div className="p-6 text-km-muted"><Loader2 className="h-4 w-4 animate-spin" /></div>
  if (!ouvre) return <PageIntrouvable />

  return (
    <div>
      <TitreOnglet title="Prix Tradeo" />
      <div className="p-4 sm:p-6">
        <PageHeader
          title="Prix Tradeo"
          badge="Banc d’essai"
          description="Le parcours de prix d’une version, et l’API Tradeo pas à pas. Les écritures ne touchent que les dossiers d’essai du compte KIWEE ENERGIE FRANCE."
        />

        <EtatConnexion />

        <nav className="mb-4 flex flex-wrap gap-1 border-b border-km-line" aria-label="Étapes du banc">
          {ETAPES.map((e) => (
            <button
              key={e.cle}
              type="button"
              onClick={() => aller(e.cle)}
              className={cn(
                '-mb-px border-b-2 px-3 py-2 text-km-body transition-colors',
                etape === e.cle ? 'border-km-green font-semibold text-km-text' : 'border-transparent text-km-muted hover:text-km-text',
              )}
            >
              {e.libelle}
            </button>
          ))}
        </nav>

        <Card className="p-4">
          {etape === 'parcours' && (
            <EtapeParcours
              recoInitiale={params.get('reco')}
              onChoix={(reco, version) => aller('parcours', version ? { reco, version } : { reco })}
            />
          )}
          {etape === 'declarer' && (
            <EtapeDeclarer
              versionInitiale={params.get('version')}
              onChoix={(id) => aller('declarer', { version: id })}
              onCree={(_, s) => aller('suivre', { siret: s })}
            />
          )}
          {etape === 'suivre' && <EtapeSuivre onCalculer={(s, en) => aller('calculer', { siret: s, energie: en })} />}
          {etape === 'calculer' && <EtapeCalculer siretInitial={siret} energieInitiale={energie} />}
          {etape === 'journal' && <Journal />}
        </Card>
      </div>
    </div>
  )
}

function EtatConnexion() {
  const { data, isLoading } = useEtatTradeo(true)
  return (
    <div className="mb-4 flex flex-wrap items-center gap-2 text-km-body">
      {isLoading ? (
        <span className="flex items-center gap-2 text-km-muted"><Loader2 className="h-4 w-4 animate-spin" /> Connexion à Tradeo…</span>
      ) : data?.ok ? (
        <>
          <Badge tone="green">Connecté</Badge>
          <span className="text-km-muted">
            Jeton {data.prefixe ?? ''} · expire le {data.expiration ? new Date(data.expiration).toLocaleString('fr-FR') : '?'}
          </span>
        </>
      ) : (
        <>
          <Badge tone="red">Non connecté</Badge>
          <span className="text-km-red">{data?.message ?? 'État inconnu.'}</span>
        </>
      )}
      {data?.url && (
        <Badge tone={data.url.includes('pre-prod') ? 'amber' : 'red'} className="ml-auto font-mono">
          {data.url.includes('pre-prod') ? 'pré-production' : 'PRODUCTION'} · {new URL(data.url).host}
        </Badge>
      )}
    </div>
  )
}
