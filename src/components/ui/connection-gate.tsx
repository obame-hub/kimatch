import { AlertTriangle, CheckCircle2, Cloud, ExternalLink, FileSignature, Mail } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { isSupabaseConfigured } from '@/lib/supabase'
import { useGmailConnection, connectGmail } from '@/lib/data/gmail'
import { useDocusignStatus } from '@/lib/data/docusign'

export type RequiredConnection = 'crm' | 'gmail' | 'docusign'

/** Écran « Connexion requise » affiché AVANT de faire remplir un wizard entier -- transposition
 * fidèle du `WizardConnectionGate` de Tools (`src/components/WizardConnectionGate.tsx`) :
 * mêmes textes, même mise en page, **même blocage dur** (aucune sortie possible tant qu'un outil
 * requis manque), et on laisse passer pendant la toute première vérification pour éviter un flash
 * de l'écran de blocage.
 *
 * Seule adaptation : la ligne « Salesforce » de Tools devient « Base Kimatch » — Kimatch EST le CRM
 * qui remplace Salesforce, la connexion équivalente est celle à sa propre base. La description est
 * conservée mot pour mot. */
const META: Record<RequiredConnection, { label: string; icon: typeof Cloud; description: string }> = {
  crm: {
    label: 'Base Kimatch',
    icon: Cloud,
    description: 'Nécessaire pour lire et écrire les données du CRM.',
  },
  gmail: {
    label: 'Gmail',
    icon: Mail,
    description: 'Nécessaire pour envoyer les notifications email depuis votre adresse.',
  },
  docusign: {
    label: 'DocuSign',
    icon: FileSignature,
    description: 'Nécessaire pour envoyer le mandat à la signature électronique.',
  },
}

export function WizardConnectionGate({
  required,
  feature,
  children,
}: {
  required: RequiredConnection[]
  /** Libellé du wizard, complète « Pour démarrer la {feature}, … » (ex. « création de cotation »). */
  feature: string
  children: React.ReactNode
}) {
  const gmail = useGmailConnection()
  const docusign = useDocusignStatus()

  // `null` = pas encore vérifié (react-query refait la vérification au focus de la fenêtre, ce qui
  // remplace le `window.addEventListener("focus")` de Tools).
  const statut: Record<RequiredConnection, boolean | null> = {
    crm: required.includes('crm') ? isSupabaseConfigured : null,
    gmail: required.includes('gmail') ? (gmail.isLoading ? null : !!gmail.data) : null,
    docusign: required.includes('docusign') ? (docusign.isLoading ? null : !!docusign.data?.configured) : null,
  }

  const manquantes = required.filter((k) => statut[k] === false)
  const verificationEnCours = required.some((k) => statut[k] === null)

  // Tout est OK → on laisse passer. Pendant la toute première vérification aussi, pour éviter un
  // flash de l'écran de blocage (même comportement que Tools).
  if (manquantes.length === 0 || verificationEnCours) return <>{children}</>

  // Une connexion que l'utilisateur peut établir lui-même ; les autres se règlent côté serveur.
  const actions: Partial<Record<RequiredConnection, () => void>> = {
    gmail: () => { connectGmail().catch(() => {}) },
  }
  const indices: Partial<Record<RequiredConnection, string>> = {
    crm: "Identifiants VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY absents : l'application tourne sur des données de démonstration.",
    // Une variable presente mais invalide est plus trompeuse qu'une variable absente : elle fait
    // croire que tout est en place. On dit donc laquelle, et pourquoi elle ne convient pas.
    docusign: docusign.data?.invalides?.length
      ? docusign.data.invalides.map((i) => `${i.variable} — ${i.raison}`).join(' ')
      : docusign.data?.manquants?.length
        ? `Variables serveur manquantes : ${docusign.data.manquants.join(', ')}.`
        : 'À configurer côté serveur.',
  }

  return (
    <Card className="border-amber-200 p-5">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-600">
          <AlertTriangle className="h-5 w-5" />
        </span>
        <div className="space-y-1">
          <h3 className="font-display text-base font-semibold text-navy-900">Connexion requise</h3>
          <p className="text-sm text-navy-500">
            Pour démarrer la <span className="font-medium text-navy-800">{feature}</span>, connectez les outils suivants.
            Les connexions déjà actives restent valides.
          </p>
        </div>
      </div>

      <div className="mt-4 space-y-3">
        {required.map((key) => {
          const meta = META[key]
          const Icon = meta.icon
          const ok = statut[key]
          const onConnect = actions[key]
          return (
            <div key={key} className="flex items-center justify-between gap-4 rounded-xl border border-navy-100 bg-white p-4">
              <div className="flex min-w-0 items-start gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-kiwi-50 text-kiwi-700">
                  <Icon className="h-4 w-4" />
                </span>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-medium text-navy-800">{meta.label}</p>
                    {ok ? (
                      <Badge tone="kiwi" className="gap-1"><CheckCircle2 className="h-3 w-3" /> Connecté</Badge>
                    ) : (
                      <Badge tone="amber">Non connecté</Badge>
                    )}
                  </div>
                  <p className="mt-0.5 text-xs text-navy-500">{meta.description}</p>
                  {!ok && !onConnect && indices[key] && (
                    <p className="mt-1 text-[11px] text-amber-700">{indices[key]}</p>
                  )}
                </div>
              </div>
              {!ok && onConnect && (
                <Button type="button" size="sm" onClick={onConnect} className="shrink-0 gap-1.5">
                  <ExternalLink className="h-3.5 w-3.5" /> Se connecter
                </Button>
              )}
            </div>
          )
        })}
        <p className="pt-2 text-xs text-navy-400">
          Une fois connecté(e), revenez sur cet onglet : la page se mettra à jour automatiquement.
        </p>
      </div>
    </Card>
  )
}
