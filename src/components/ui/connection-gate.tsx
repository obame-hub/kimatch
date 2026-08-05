import { useState } from 'react'
import { AlertTriangle, CheckCircle2, Loader2, Plug } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

export interface ConnectionRequirement {
  /** Nom de l'outil, tel qu'affiché à l'utilisateur (« Gmail », « DocuSign »…). */
  nom: string
  /** Pourquoi cet outil est nécessaire pour l'action en cours. */
  raison: string
  connecte: boolean
  chargement?: boolean
  /** Action de connexion quand l'utilisateur peut la déclencher lui-même (OAuth). */
  onConnect?: () => void
  connectLabel?: string
  /** Affiché à la place du bouton quand la connexion se règle côté serveur (secrets). */
  indice?: string
}

/** Écran « Connexion requise » affiché AVANT de faire remplir un wizard entier -- reprend le
 * `WizardConnectionGate` de Tools, présent à trois endroits du circuit (avant l'opportunité,
 * avant le mandat, avant la cotation). Tant qu'un outil requis manque, le formulaire n'est pas
 * rendu du tout : inutile de saisir cinq étapes pour échouer à la validation.
 *
 * `autoriserSkip` est un ajout Kimatch : là où l'outil manquant ne bloque qu'une action optionnelle
 * en aval (ex. l'email de notification de cotation), on laisse une porte de sortie explicite plutôt
 * que d'interdire la création elle-même. */
export function ConnectionGate({
  action,
  connexions,
  autoriserSkip,
  skipLabel = 'Continuer quand même',
  children,
}: {
  /** Complète la phrase « Pour démarrer {action}, … » (ex. « la création de mandat »). */
  action: string
  connexions: ConnectionRequirement[]
  autoriserSkip?: boolean
  skipLabel?: string
  children: React.ReactNode
}) {
  const [ignore, setIgnore] = useState(false)
  const enChargement = connexions.some((c) => c.chargement)
  const manquantes = connexions.filter((c) => !c.connecte)

  if (ignore || (!enChargement && manquantes.length === 0)) return <>{children}</>

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3 rounded-xl border border-navy-100 bg-navy-50/60 p-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-amber-50 text-amber-600">
          <Plug className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <p className="font-semibold text-navy-800">Connexion requise</p>
          <p className="mt-0.5 text-xs text-navy-500">
            Pour démarrer {action}, connecte les outils suivants. Les connexions déjà actives restent valides.
          </p>
        </div>
      </div>

      <ul className="space-y-2">
        {connexions.map((c) => (
          <li
            key={c.nom}
            className={`flex items-start gap-3 rounded-xl border p-3 ${
              c.connecte ? 'border-kiwi-200 bg-kiwi-50/40' : 'border-amber-200 bg-amber-50/50'
            }`}
          >
            <span className="mt-0.5 shrink-0">
              {c.chargement ? (
                <Loader2 className="h-4 w-4 animate-spin text-navy-400" />
              ) : c.connecte ? (
                <CheckCircle2 className="h-4 w-4 text-kiwi-600" />
              ) : (
                <AlertTriangle className="h-4 w-4 text-amber-600" />
              )}
            </span>
            <div className="min-w-0 flex-1">
              <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-navy-800">
                {c.nom}
                {c.chargement ? (
                  <Badge tone="neutral">Vérification…</Badge>
                ) : c.connecte ? (
                  <Badge tone="kiwi">Connecté</Badge>
                ) : (
                  <Badge tone="amber">Non connecté</Badge>
                )}
              </p>
              <p className="mt-0.5 text-xs text-navy-500">{c.raison}</p>
              {!c.connecte && !c.chargement && c.indice && (
                <p className="mt-1 text-[11px] text-amber-700">{c.indice}</p>
              )}
            </div>
            {!c.connecte && !c.chargement && c.onConnect && (
              <Button type="button" size="sm" variant="outline" onClick={c.onConnect} className="shrink-0">
                {c.connectLabel ?? 'Se connecter'}
              </Button>
            )}
          </li>
        ))}
      </ul>

      <p className="text-[11px] text-navy-400">
        Une fois connecté(e), reviens sur cet onglet : la page se mettra à jour automatiquement.
      </p>

      {autoriserSkip && !enChargement && (
        <div className="flex justify-end border-t border-navy-100 pt-3">
          <Button type="button" variant="ghost" size="sm" onClick={() => setIgnore(true)}>{skipLabel}</Button>
        </div>
      )}
    </div>
  )
}
